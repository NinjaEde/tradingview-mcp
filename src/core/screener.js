/**
 * Core logic for the screener_get tool.
 *
 * Reads the live TradingView Screener tab (a separate CDP page target) and
 * scrapes its results table: symbol, last price, % change, and optional
 * extra columns. Returns rows sorted by % change (gainers first) plus
 * winners/losers slices.
 *
 * The Screener DOM (observed on TradingView Desktop):
 *   - rows:   tr.listRow  (also tr.row-<hash>)
 *   - symbol: a[href*="/symbols/<EXCHANGE>-<TICKER>/"] inside the first cell
 *   - cells:  td with nested text fragments (virtualized grid)
 *   - header: th elements in document order
 *
 * NOTE: the Screener tab can show STALE data if it has not been refreshed
 * (it caches the % change from when the tab was loaded). Prefer
 * stock_momentum_screen / stock_batch_technicals for live momentum.
 */
import { evaluateOnTarget } from '../connection.js';

const SCREENER_PREDICATE = (t) => t.type === 'page' && /tradingview\.com\/screener/i.test(t.url);

// Map a header label to a normalized key.
function normalizeHeader(label) {
  const l = (label || '').toLowerCase();
  if (/symbol/.test(l)) return 'symbol';
  if (/preis|price|last/.test(l)) return 'price';
  if (/änd|change|%/.test(l)) return 'change_pct';
  if (/vol\./.test(l) && !/rel/.test(l)) return 'volume';
  if (/rel\.?\s*vol/i.test(l)) return 'rel_volume';
  if (/mkt\.?\s*cap|market\s*cap/i.test(l)) return 'market_cap';
  if (/kgv|p\/e|pe\s*ratio/i.test(l)) return 'pe';
  if (/eps/i.test(l)) return 'eps';
  if (/divid/i.test(l)) return 'dividend_yield';
  if (/sektor|sector/i.test(l)) return 'sector';
  if (/analyst/i.test(l)) return 'analyst_rating';
  return null;
}

function parseNumberOrNull(s) {
  if (s == null) return null;
  // Strip currency symbols, spaces, thousands separators; convert German decimals.
  const cleaned = String(s).replace(/[^\d,.\-+%]/g, '').replace(/\./g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '−' || cleaned === '-') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parsePct(s) {
  if (s == null) return null;
  const m = String(s).match(/-?[\d.,]+/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export async function getScreener({ sort_by = 'change_pct', limit = 20, gainers_only = false, losers_only = false } = {}) {
  const raw = await evaluateOnTarget(SCREENER_PREDICATE, `
    (function() {
      var headers = Array.from(document.querySelectorAll('th')).map(function(t){ return (t.textContent||'').trim(); });
      var rows = Array.from(document.querySelectorAll('tr.listRow, tr.row-HX5UXsDj'));
      var data = rows.map(function(tr){
        var cells = Array.from(tr.querySelectorAll('td')).map(function(td){
          var frags = [];
          td.querySelectorAll('*').forEach(function(el){
            var c = el.childNodes && el.childNodes[0];
            if (c && c.nodeType === 3 && c.textContent.trim()) frags.push(c.textContent.trim());
          });
          var direct = Array.from(td.childNodes).filter(function(n){ return n.nodeType===3 && n.textContent.trim(); }).map(function(n){ return n.textContent.trim(); });
          return (frags.join(' ').trim() || direct.join(' ').trim());
        });
        var sym = null;
        var symFull = null;
        var a = tr.querySelector('a[href*="/symbols/"]');
        if (a) {
          var m = (a.getAttribute('href')||'').match(/symbols\\/([^/]+)\\//);
          if (m) {
            symFull = m[1];                 // e.g. "NASDAQ:MRVL" — keeps exchange to avoid ambiguity
            sym = symFull.replace(/^.*-/, ''); // ticker only: "MRVL"
          }
        }
        return { symbol: sym, symbol_full: symFull, cells: cells };
      }).filter(function(r){ return r.symbol && r.cells.length; });
      return { headers: headers, data: data, rowCount: rows.length };
    })()
  `);

  if (!raw || !raw.data || raw.data.length === 0) {
    return {
      success: true,
      source: 'tradingview_screener',
      note: 'No screener rows found. Open the Screener tab in TradingView Desktop (with a filter applied) and retry.',
      headers: raw?.headers || [],
      rows: [],
    };
  }

  // Build header->column-index map.
  const headerMap = {};
  (raw.headers || []).forEach((h, i) => {
    const key = normalizeHeader(h);
    if (key && headerMap[key] === undefined) headerMap[key] = i;
  });

  const results = raw.data.map((r) => {
    const get = (key) => (headerMap[key] !== undefined ? r.cells[headerMap[key]] : null);
    const row = { symbol: r.symbol };
    if (r.symbol_full) row.symbol_full = r.symbol_full;
    if (headerMap.price !== undefined) row.price = parseNumberOrNull(get('price'));
    if (headerMap.change_pct !== undefined) row.change_pct = parsePct(get('change_pct'));
    if (headerMap.volume !== undefined) row.volume = get('volume');
    if (headerMap.rel_volume !== undefined) row.rel_volume = parseNumberOrNull(get('rel_volume'));
    if (headerMap.market_cap !== undefined) row.market_cap = get('market_cap');
    if (headerMap.pe !== undefined) row.pe = parseNumberOrNull(get('pe'));
    if (headerMap.dividend_yield !== undefined) row.dividend_yield = parsePct(get('dividend_yield'));
    if (headerMap.sector !== undefined) row.sector = get('sector');
    if (headerMap.analyst_rating !== undefined) row.analyst_rating = get('analyst_rating');
    // Keep any extra raw cells for debugging/extension.
    row._raw = r.cells;
    return row;
  });

  // Default sort: change_pct desc (gainers first).
  const sortKey = sort_by === 'price' ? 'price' : (headerMap[sort_by] !== undefined ? sort_by : 'change_pct');
  results.sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });

  let filtered = results;
  if (gainers_only) filtered = results.filter((r) => r.change_pct != null && r.change_pct > 0);
  else if (losers_only) filtered = results.filter((r) => r.change_pct != null && r.change_pct < 0);

  const top = limit ? filtered.slice(0, limit) : filtered;

  return {
    success: true,
    source: 'tradingview_screener',
    url: 'https://www.tradingview.com/screener/',
    total_rows_scraped: raw.data.length,
    headers: raw.headers,
    sorted_by: sortKey,
    top_gainers: results.filter((r) => r.change_pct != null && r.change_pct > 0).slice(0, 5).map((r) => ({ symbol: r.symbol, symbol_full: r.symbol_full, change_pct: r.change_pct })),
    top_losers: results.filter((r) => r.change_pct != null && r.change_pct < 0).slice(-5).reverse().map((r) => ({ symbol: r.symbol, symbol_full: r.symbol_full, change_pct: r.change_pct })),
    rows: top,
    note: 'Screener % change may be STALE if the tab was not refreshed. For live momentum use stock_momentum_screen.',
  };
}
