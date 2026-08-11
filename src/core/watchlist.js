import { evaluateAsync } from '../connection.js';
import { setSymbol } from './chart.js';

export async function scanWatchlist({ symbols, filter, limit }) {
  const maxResults = limit || 15;
  if (!symbols || !symbols.length) return { success: false, error: 'No symbols provided' };
  symbols = [...new Set(symbols)];

  const origSym = await evaluateAsync(`(async function(){try{return window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().symbol();}catch(e){return null;}})()`);

  const results = [];
  for (let i = 0; i < Math.min(symbols.length, maxResults); i++) {
    const s = symbols[i];
    const tv = s.includes(':') ? s : 'NASDAQ:' + s;
    try {
      await setSymbol({ symbol: tv });
      const d = await evaluateAsync(`(async function(){var b=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();var l=b[b.length-1];var o=b[0].open;var p=l.close;var sma20=null;if(b.length>=20){var sum=0;for(var i=b.length-20;i<b.length;i++)sum+=b[i].close;sma20=sum/20;}var mom=b.length>=10?(p-b[b.length-10].close)/b[b.length-10].close*100:null;return{price:Math.round(p*100)/100,trend:sma20&&p>sma20?'bullish':(sma20?'bearish':'neutral'),momentum10d:mom!=null?Math.round(mom*10)/10:null};})()`);
      if (d) results.push({ symbol: s, ...d });
      else results.push({ symbol: s, error: 'no data' });
    } catch (e) { results.push({ symbol: s, error: e.message }); }
  }

  if (origSym) try { await setSymbol({ symbol: origSym }); } catch {}

  const valid = results.filter(r => !r.error);
  valid.sort((a, b) => (b.momentum10d || 0) - (a.momentum10d || 0));
  let out = valid;
  if (filter === 'bullish') out = valid.filter(r => r.trend === 'bullish');
  if (filter === 'bearish') out = valid.filter(r => r.trend === 'bearish');

  return {
    success: true, scanned: results.length, errors: results.filter(r => r.error).length,
    bullish: valid.filter(r => r.trend === 'bullish').length,
    bearish: valid.filter(r => r.trend === 'bearish').length,
    results: out.slice(0, maxResults),
    summary: valid.filter(r => r.trend === 'bullish').map(r => r.symbol + ' +' + r.momentum10d + '%').join(', ') || 'none',
  };
}