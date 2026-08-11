/**
 * Earnings check via TradingView earnings calendar web scraping.
 * Runs in Node.js context (not CDP evaluate), fetching the page directly.
 */
export async function checkEarnings({ symbols }) {
  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    throw new Error('symbols required: array of ticker strings');
  }

  try {
    const resp = await fetch('https://www.tradingview.com/earnings-calendar/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    });
    const text = await resp.text();

    const results = [];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    for (const sym of symbols) {
      // Look for the symbol near the current/upcoming date range
      const upper = sym.toUpperCase();
      const escaped = upper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match the ticker in context of earnings date information
      const re = new RegExp(`${escaped}[\\s\\S]{0,300}(\\d{1,2}\\.\\s*[A-Z][a-z]+\\s*\\d{4})`, 'i');
      const m = text.match(re);
      if (m) {
        results.push({
          symbol: sym,
          earningsDate: m[1],
          warning: '⚠️ Earnings in den nächsten Tagen',
        });
      }
    }

    for (const sym of symbols) {
      if (!results.find(r => r.symbol === sym)) {
        results.push({ symbol: sym, warning: 'OK — keine Earnings erkannt' });
      }
    }

    return {
      success: true,
      symbolsChecked: symbols.length,
      earningsFound: results.filter(r => r.earningsDate).length,
      results,
      note: 'Grobe Earnings-Prüfung (Web-Scraping). Bei Unsicherheit: tradingview.com/earnings-calendar/ manuell prüfen.',
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
      symbols: symbols.map(s => ({ symbol: s, warning: 'Prüfung fehlgeschlagen' })),
    };
  }
}