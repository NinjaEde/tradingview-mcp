/**
 * Watchlist SMC scan — batch-scans symbols for momentum/trend as SMC first-pass filter.
 * Uses the internal chart API to switch symbols sequentially and read technicals.
 */
import { evaluate, safeString } from '../connection.js';

export async function scanWatchlist({ symbols, filter, limit }) {
  const filterMode = filter || 'all';
  const maxResults = limit || 15;

  if (!symbols || symbols.length === 0) {
    // Try to get watchlist symbols from the chart DOM
    const wlSymbols = await evaluate(`(function() {
      var syms = [];
      var rows = document.querySelectorAll('[class*="widgetbar-widget-watchlist"] [class*="symbol-"]');
      for (var i = 0; i < Math.min(rows.length, 30); i++) {
        var t = rows[i].textContent.trim();
        var parts = t.split(/(?=[A-Z]{2,})/);
        if (parts.length > 0) syms.push(parts[0].replace(/[^A-Z0-9]/g, '').substring(0, 10));
      }
      return syms.filter(function(s){ return s && s.length >= 2 && s.length <= 8; });
    })()`);
    if (wlSymbols && wlSymbols.length > 0) symbols = wlSymbols;
    else return { success: false, error: 'No symbols provided and no watchlist found. Pass symbols array explicitly.' };
  }

  // Deduplicate
  symbols = [...new Set(symbols)];

  // Save original symbol
  const origSym = await evaluate(`(function(){try{var c=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;return c.model().mainSeries().symbol();}catch(e){return null;}})()`);

  const results = [];
  const count = Math.min(symbols.length, maxResults);

  for (let i = 0; i < count; i++) {
    const sym = symbols[i];
    const tvSym = sym.includes(':') ? sym : 'NASDAQ:' + sym;
    try {
      await evaluate(`(function(){var c=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;c.setSymbol(${safeString(tvSym)},{});})()`);
      await new Promise(r => setTimeout(r, 3000));

      const data = await evaluate(`(function() {
        try {
          var c = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
          var model = c.model();
          var bars = model.mainSeries().bars();
          var last = bars[bars.length - 1];
          var open = bars[0].open;
          var smaCalc = function(period) {
            var sum = 0; for (var i = bars.length - period; i < bars.length; i++) sum += bars[i].close;
            return bars.length >= period ? sum / period : null;
          };
          var sma20 = smaCalc(20);
          var chg10d = bars.length >= 10 ? ((last.close - bars[bars.length - 10].close) / bars[bars.length - 10].close * 100) : null;
          var trend = sma20 ? (last.close > sma20 ? 'bullish' : 'bearish') : 'neutral';
          return {
            price: Math.round(last.close * 100) / 100,
            trend: trend,
            momentum10d: chg10d != null ? Math.round(chg10d * 10) / 10 : null,
            sma20: sma20 != null ? Math.round(sma20 * 100) / 100 : null,
          };
        } catch(e) { return { error: e.message }; }
      })()`);

      if (data && !data.error) {
        results.push({ symbol: sym, tvSymbol: tvSym, ...data });
      } else {
        results.push({ symbol: sym, error: data?.error || 'fetch failed' });
      }
    } catch (e) {
      results.push({ symbol: sym, error: e.message });
    }
  }

  // Restore
  if (origSym) {
    try {
      await evaluate(`(function(){var c=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;c.setSymbol(${safeString(origSym)},{});})()`);
    } catch {}
  }

  // Sort and filter
  const valid = results.filter(r => !r.error);
  valid.sort((a, b) => (b.momentum10d || 0) - (a.momentum10d || 0));

  let filtered = valid;
  if (filterMode === 'bullish') filtered = valid.filter(r => r.trend === 'bullish');
  if (filterMode === 'bearish') filtered = valid.filter(r => r.trend === 'bearish');

  const errors = results.filter(r => r.error);

  return {
    success: true,
    scanned: results.length,
    errors: errors.length,
    filter: filterMode,
    bullish: valid.filter(r => r.trend === 'bullish').length,
    bearish: valid.filter(r => r.trend === 'bearish').length,
    results: filtered.slice(0, maxResults),
    allResults: valid,
    summary: `Top Bullish: ${valid.filter(r => r.trend === 'bullish').map(r => r.symbol + ' +' + r.momentum10d + '%').join(', ') || 'none'}`,
    note: 'Erster SMC-Vorfilter. Bullishe Symbole mit `chart_set_symbol` + `smc_dashboard` tiefer analysieren.',
  };
}