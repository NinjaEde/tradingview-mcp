/**
 * Core logic for options_get tool.
 *
 * Navigates the current CDP target to TradingView's per-symbol options chain
 * page, waits for the React-rendered table to appear with full data,
 * scrapes the chain, then navigates back to the original chart URL.
 */
import CDP from 'chrome-remote-interface';
import { CDP_HOST, CDP_PORT } from '../connection.js';

const TABLE_SELECTOR = 'table.table-VLWTFvXR';
const MAX_POLL_TRIES = 80;
const POLL_INTERVAL = 500;

function parseNum(s) {
  if (!s || s === '\u2014' || s === '\u2212' || s === '-') return null;
  const c = String(s).replace(/\u2212/g, '-').replace(/%/g, '')
    .replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(c);
  return Number.isFinite(n) ? n : null;
}

function parseStrike(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+,\d)/);
  const num = m ? m[1] : String(s);
  const n = parseFloat(num.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function safeCell(cells, idx) {
  return (cells && idx != null && cells.length > idx) ? (cells[idx] || '') : '';
}

/** Map header texts to column indices dynamically. */
function buildColumnMap(headers) {
  const map = {};
  const norm = (s) => String(s).trim().toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 %]/g, '').replace(/\s+/g, ' ').trim();

  const knownCalls = new Set();
  for (let i = 0; i < headers.length; i++) {
    const k = norm(headers[i]);
    const isCall = i < headers.length / 2;

    // Strike is the "dividing" column — the first time we see it, treat as
    // center strike. The Puts side header uses the same label.
    if (k === 'ausubungspreis' && map.STRIKE == null) { map.STRIKE = i; continue; }

    // IV next to strike is the center IV marker
    if ((k === 'iv' || k.includes('implizite')) && i === (map.STRIKE || 0) + 1) { map.CENTER_IV = i; continue; }

    // Bid/Ask — first occurrence (left) = call, second (right) = put
    if (k === 'bid') { if (map.CALL_BID == null) map.CALL_BID = i; else map.PUT_BID = i; continue; }
    if (k === 'ask') { if (map.CALL_ASK == null) map.CALL_ASK = i; else map.PUT_ASK = i; continue; }
    if (k === 'spread') { if (map.CALL_SPREAD == null) map.CALL_SPREAD = i; else map.PUT_SPREAD = i; continue; }

    // Greeks
    if (k === 'delta') { if (map.CALL_DELTA == null) map.CALL_DELTA = i; else map.PUT_DELTA = i; continue; }
    if (k === 'gamma') { if (map.CALL_GAMMA == null) map.CALL_GAMMA = i; else map.PUT_GAMMA = i; continue; }
    if (k === 'theta') { if (map.CALL_THETA == null) map.CALL_THETA = i; else map.PUT_THETA = i; continue; }
    if (k === 'vega') { if (map.CALL_VEGA == null) map.CALL_VEGA = i; else map.PUT_VEGA = i; continue; }
    if (k === 'rho') { if (map.CALL_RHO == null) map.CALL_RHO = i; else map.PUT_RHO = i; continue; }

    // Volume
    if (k === 'volumen') { if (map.CALL_VOLUME == null) map.CALL_VOLUME = i; else map.PUT_VOLUME = i; continue; }

    // IV
    if (/iv.?spread/i.test(k)) { if (map.CALL_IV_SPREAD == null) map.CALL_IV_SPREAD = i; else map.PUT_IV_SPREAD = i; continue; }
    if (k.includes('ask iv') || k.includes('askiv')) { if (map.CALL_IV_ASK == null) map.CALL_IV_ASK = i; else map.PUT_IV_ASK = i; continue; }
    if (k.includes('bid iv') || k.includes('bidiv')) { if (map.CALL_IV_BID == null) map.CALL_IV_BID = i; else map.PUT_IV_BID = i; continue; }

    // Time value, intrinsic, theoretical
    if (k === 'zeitwert') { if (map.CALL_TIME == null) map.CALL_TIME = i; else map.PUT_TIME = i; continue; }
    if (/intr.*wert/i.test(k)) { if (map.CALL_INTRINSIC == null) map.CALL_INTRINSIC = i; else map.PUT_INTRINSIC = i; continue; }
    if (k === 'theor') { if (map.CALL_THEOR == null) map.CALL_THEOR = i; else map.PUT_THEOR = i; continue; }

    // OI (LHP = Last Historical Price, used as OI proxy)
    if (k === 'lhp') { if (map.CALL_OI == null) map.CALL_OI = i; else map.PUT_OI = i; continue; }

    // Other columns
    if (k === 'be') { if (map.CALL_BE == null) map.CALL_BE = i; else map.PUT_BE = i; continue; }
    if (k.includes('zu be')) { if (map.CALL_TO_BE == null) map.CALL_TO_BE = i; else map.PUT_TO_BE = i; continue; }
    if (k === 'distanz') { if (map.CALL_DISTANCE == null) map.CALL_DISTANCE = i; else map.PUT_DISTANCE = i; continue; }
    if (k.includes('rel') && k.includes('dist')) { if (map.CALL_REL_DIST == null) map.CALL_REL_DIST = i; else map.PUT_REL_DIST = i; continue; }

    map['_col_' + i + '_' + k] = i; // unknown columns, just for info
  }
  return map;
}

function buildOptionsUrl(symbol) {
  if (!symbol) return null;
  let exchange; let ticker;
  if (symbol.includes(':')) {
    [exchange, ticker] = symbol.split(':');
  } else {
    exchange = 'NASDAQ'; ticker = symbol;
  }
  return `https://de.tradingview.com/symbols/${exchange}-${ticker}/options-chain/`;
}

async function waitForChartTarget(client) {
  const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
  const targets = await resp.json();
  return targets.find(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url))
    || targets.find(t => t.type === 'page' && /tradingview/i.test(t.url));
}

async function waitForTable(client) {
  for (let i = 0; i < MAX_POLL_TRIES; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    const { result } = await client.Runtime.evaluate({
      expression: `(function(){var t=document.querySelector('${TABLE_SELECTOR}');if(!t)return{ready:false};var big=0;t.querySelectorAll('tbody tr').forEach(function(tr){if(tr.querySelectorAll('td').length>=20)big++});var hdrs=Array.from(t.querySelectorAll('tr.secondRowHead-B52UgtdY th')).map(function(x){return x.textContent.trim()}).filter(Boolean);return{ready:big>=3&&hdrs.length>=10,bigRows:big,headersLen:hdrs.length};})()`,
      returnByValue: true,
    });
    if (result?.value?.ready) return;
  }
  throw new Error('Options chain table did not render with full data within timeout');
}

async function scrapeTable(client) {
  const { result } = await client.Runtime.evaluate({
    expression: `(function(){var t=document.querySelector('${TABLE_SELECTOR}');var headers=Array.from(t.querySelectorAll('tr.secondRowHead-B52UgtdY th')).map(function(x){return(x.textContent||'').trim().substring(0,35)});var rows=[];t.querySelectorAll('tr').forEach(function(tr){var cells=Array.from(tr.querySelectorAll('td')).map(function(td){return(td.textContent||'').trim()});if(cells.length>0)rows.push(cells)});return{headers:headers,rows:rows}})()`,
    returnByValue: true,
  });
  return result?.value;
}

function parseChain(rows, colMap) {
  const options = [];
  let currentExpiration = null;
  let currentDTE = null;
  let underlyingPrice = null;
  const expRe = /(\d{1,2})\.\s*(\S+)\s*(\d+)\s*DTE/i;

  for (const cells of rows) {
    if (!cells || cells.length === 0) continue;

    // Expiration group or underlying price row (few cells)
    if (cells.length < 10) {
      const combined = cells.filter(Boolean).join(' ');
      const m = combined.match(expRe);
      if (m) {
        currentExpiration = combined;
        currentDTE = parseInt(m[3], 10) || null;
      }
      if (/USD|EUR|GBP/i.test(combined) && /\d+[,.]\d+/.test(combined)) {
        const pm = combined.match(/(\d+[,.]\d+)\s*(USD|EUR|GBP)/i);
        if (pm) underlyingPrice = parseNum(pm[1]);
      }
      continue;
    }

    // Data row — needs strike
    const strike = parseStrike(safeCell(cells, colMap.STRIKE));
    if (strike == null) continue;

    const callBid = parseNum(safeCell(cells, colMap.CALL_BID));
    const callAsk = parseNum(safeCell(cells, colMap.CALL_ASK));
    const putBid = parseNum(safeCell(cells, colMap.PUT_BID));
    const putAsk = parseNum(safeCell(cells, colMap.PUT_ASK));

    const opt = {
      expiration: currentExpiration,
      dte: currentDTE,
      strike,
      call: {
        bid: callBid, ask: callAsk,
        mid: (callBid != null && callAsk != null) ? (callBid + callAsk) / 2 : null,
        delta:  parseNum(safeCell(cells, colMap.CALL_DELTA)),
        gamma:  parseNum(safeCell(cells, colMap.CALL_GAMMA)),
        theta:  parseNum(safeCell(cells, colMap.CALL_THETA)),
        vega:   parseNum(safeCell(cells, colMap.CALL_VEGA)),
        rho:    parseNum(safeCell(cells, colMap.CALL_RHO)),
        ivBid:  parseNum(safeCell(cells, colMap.CALL_IV_BID)) ?? parseNum(safeCell(cells, colMap.CALL_IV_SPREAD)),
        ivAsk:  parseNum(safeCell(cells, colMap.CALL_IV_ASK)),
        volume: parseNum(safeCell(cells, colMap.CALL_VOLUME)),
        oi:     parseNum(safeCell(cells, colMap.CALL_OI)),
        intrinsic: parseNum(safeCell(cells, colMap.CALL_INTRINSIC)),
        timeValue: parseNum(safeCell(cells, colMap.CALL_TIME)),
      },
      put: {
        bid: putBid, ask: putAsk,
        mid: (putBid != null && putAsk != null) ? (putBid + putAsk) / 2 : null,
        delta:  parseNum(safeCell(cells, colMap.PUT_DELTA)),
        gamma:  parseNum(safeCell(cells, colMap.PUT_GAMMA)),
        theta:  parseNum(safeCell(cells, colMap.PUT_THETA)),
        vega:   parseNum(safeCell(cells, colMap.PUT_VEGA)),
        rho:    parseNum(safeCell(cells, colMap.PUT_RHO)),
        ivBid:  parseNum(safeCell(cells, colMap.PUT_IV_BID)),
        ivAsk:  parseNum(safeCell(cells, colMap.PUT_IV_ASK)),
        volume: parseNum(safeCell(cells, colMap.PUT_VOLUME)),
        oi:     parseNum(safeCell(cells, colMap.PUT_OI)),
        intrinsic: parseNum(safeCell(cells, colMap.PUT_INTRINSIC)),
        timeValue: parseNum(safeCell(cells, colMap.PUT_TIME)),
      },
      centerIv: parseNum(safeCell(cells, colMap.CENTER_IV)),
      straddle: null,
    };

    if (callAsk != null && putAsk != null) opt.straddle = { ask: callAsk + putAsk };
    if (callBid != null && putBid != null) opt.straddle = { ...(opt.straddle || {}), bid: callBid + putBid };
    if (opt.straddle?.bid != null && opt.straddle?.ask != null) {
      opt.straddle.mid = (opt.straddle.bid + opt.straddle.ask) / 2;
    }

    options.push(opt);
  }
  return { options, underlyingPrice };
}

function computeStrategies(options, underlyingPrice) {
  if (!options.length || underlyingPrice == null) return null;

  let atmOpt = null;
  let minDiff = Infinity;
  for (const o of options) {
    const d = Math.abs(o.strike - underlyingPrice);
    if (d < minDiff) { minDiff = d; atmOpt = o; }
  }

  const result = {
    underlyingPrice,
    atmStrike: atmOpt?.strike,
    atmStraddle: atmOpt?.straddle,
    nearestDTE: options[0]?.dte,
    expirations: [...new Set(options.map(o => o.expiration).filter(Boolean))],
  };

  // Group by expiration and find ATM straddle for each
  const byExp = {};
  for (const o of options) {
    if (!o.expiration) continue;
    if (!byExp[o.expiration]) byExp[o.expiration] = { options: [], atm: null };
    byExp[o.expiration].options.push(o);
  }
  for (const [exp, group] of Object.entries(byExp)) {
    let best = null, bestDiff = Infinity;
    for (const o of group.options) {
      const d = Math.abs(o.strike - underlyingPrice);
      if (d < bestDiff) { bestDiff = d; best = o; }
    }
    if (best) group.atm = { strike: best.strike, straddle: best.straddle, dte: best.dte };
  }
  result.straddlesByExpiration = byExp;

  return result;
}

export async function getOptionsChain({ symbol }) {
  const url = buildOptionsUrl(symbol);
  if (!url) throw new Error(`Could not build options URL for symbol: ${symbol}`);

  let client;
  let originalUrl;
  try {
    client = await CDP({ host: CDP_HOST, port: CDP_PORT });

    const target = await waitForChartTarget(client);
    if (!target) throw new Error('No TradingView chart target found');
    await client.close();

    client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: target.id });
    await client.Runtime.enable();
    await client.Page.enable();
    await client.DOM.enable();

    const orig = await client.Runtime.evaluate({
      expression: 'window.location.href', returnByValue: true,
    });
    originalUrl = orig.result?.value;

    // Navigate to options chain and wait for full data
    await client.Page.navigate({ url });
    await waitForTable(client);

    // Scrape and parse
    const raw = await scrapeTable(client);
    if (!raw || !raw.rows || raw.rows.length === 0) {
      throw new Error(raw?.error || 'Options table scraped but had no rows');
    }

    const colMap = buildColumnMap(raw.headers);

    // Navigate back
    if (originalUrl) {
      try {
        await client.Page.navigate({ url: originalUrl });
        await new Promise(r => setTimeout(r, 2000));
      } catch { /* best effort */ }
    }

    const { options, underlyingPrice } = parseChain(raw.rows, colMap);
    const strategies = computeStrategies(options, underlyingPrice);

    return {
      success: true,
      symbol,
      source: 'tradingview_options',
      url,
      underlyingPrice,
      optionCount: options.length,
      strategies,
      firstOptions: options.slice(0, 20),
      allOptions: options,
      rawHeaders: raw.headers,
      note: options.length > 20
        ? `Showing first 20 of ${options.length} options in firstOptions. Full data in allOptions.`
        : undefined,
    };
  } catch (err) {
    if (client && originalUrl) {
      try { await client.Page.navigate({ url: originalUrl }); } catch { /* double */ }
    }
    throw err;
  } finally {
    try { if (client) await client.close(); } catch { /* cleanup */ }
  }
}