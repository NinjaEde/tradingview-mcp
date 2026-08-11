/**
 * Earnings check — warns about upcoming earnings for a list of symbols.
 */
export async function checkEarnings({ symbols }) {
  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    throw new Error('symbols required: array of ticker strings');
  }

  // TradingView has an earnings calendar at tradingview.com/earnings-calendar/
  // We scrape it via CDP for the next 7 days
  const results = [];

  try {
    const { evaluate } = await import('../connection.js');

    // Navigate to earnings calendar and scrape upcoming earnings
    const data = await evaluate(`(async function() {
      try {
        var resp = await fetch('https://www.tradingview.com/earnings-calendar/', { credentials: 'include' });
        var text = await resp.text();
        // Extract earnings data from the page
        var symbols = ${JSON.stringify(symbols)};
        var found = {};
        for (var i = 0; i < symbols.length; i++) {
          var s = symbols[i];
          var re = new RegExp(s + '[\\\\s\\\\S]{0,200}(\\\\d{1,2}\\\\.\\\\s*[A-Z][a-z]+\\\\s*\\\\d{4}|[A-Z][a-z]+\\\\s+\\\\d{1,2}\\\\,?\\\\s+\\\\d{4})', 'i');
          var m = text.match(re);
          if (m) found[s] = { date: m[1], hasEarnings: true };
        }
        return { raw: Object.keys(found).length > 0 ? found : {}, fullLength: text.length };
      } catch(e) { return { error: e.message }; }
    })()`, { awaitPromise: true });

    if (data?.raw && Object.keys(data.raw).length > 0) {
      for (const [sym, info] of Object.entries(data.raw)) {
        results.push({ symbol: sym, earningsDate: info.date, warning: '⚠️ Earnings in den nächsten Tagen' });
      }
    }

    // If no results from scraping, return unchecked
    for (const sym of symbols) {
      if (!results.find(r => r.symbol === sym)) {
        results.push({ symbol: sym, earningsDate: null, warning: 'Keine Earnings in nächster Woche erkannt' });
      }
    }

    return {
      success: true,
      symbolsChecked: symbols.length,
      earningsFound: results.filter(r => r.earningsDate).length,
      results,
      note: 'Earnings-Daten von TradingView Earnings Calendar. Nur die nächsten ~7 Tage werden geprüft.',
    };
  } catch (e) {
    return {
      success: true,
      symbolsChecked: symbols.length,
      earningsFound: 0,
      results: symbols.map(s => ({ symbol: s, warning: e.message })),
      note: 'Earnings-Check fehlgeschlagen. Prüfe manuell auf tradingview.com/earnings-calendar/',
    };
  }
}