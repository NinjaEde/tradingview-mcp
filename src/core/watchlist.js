import { evaluate } from '../connection.js';
import { setSymbol, setTimeframe } from './chart.js';

function toTvSymbol(ticker) {
  const m = { NVDA:'BATS:NVDA', PANW:'BATS:PANW', CRWD:'BATS:CRWD', AMZN:'BATS:AMZN', AAPL:'BATS:AAPL', GOOGL:'BATS:GOOGL', MSFT:'BATS:MSFT', NBIS:'BATS:NBIS', AVGO:'BATS:AVGO', BIDU:'BATS:BIDU', TTWO:'BATS:TTWO', TSLA:'BATS:TSLA' };
  return m[ticker] || (ticker.includes(':') ? ticker : 'BATS:' + ticker);
}

function bareTicker(s) { return (s||'').split(':').pop().replace(/_DLY$/,'').toUpperCase(); }
function getCurrentSymbol() {
  return evaluate('(function(){try{return window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().symbol();}catch(e){return null;}})()');
}

function readBars() {
  return evaluate('(function(){try{var b=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();if(!b||typeof b.lastIndex!=="function")return null;var li=b.lastIndex();if(li<0)return null;var l=b.valueAt(li);if(!l)return null;var p=l[4];var sma20=null;var sz=b.size();if(sz>=20){var s=0;for(var j=sz-20;j<sz;j++){var vj=b.valueAt(j);if(vj)s+=vj[4];}sma20=s/20;}var m=sz>=10?(p-b.valueAt(sz-10)[4])/b.valueAt(sz-10)[4]*100:null;return{price:p,trend:sma20&&p>sma20?"bullish":(sma20?"bearish":"neutral"),momentum10d:m!=null?Math.round(m*100)/100:null};}catch(e){return null;}})()');
}

export async function scanWatchlist({ symbols, filter, limit }) {
  const maxResults = limit || 15;
  if (!symbols || !symbols.length) return { success: false, error: 'No symbols provided' };
  symbols = [...new Set(symbols)];

  try { await setTimeframe({ timeframe: '1D' }); } catch {}

  const results = [];
  for (let i = 0; i < Math.min(symbols.length, maxResults); i++) {
    const s = symbols[i];
    const tv = toTvSymbol(s);
    try {
      const current = await getCurrentSymbol();
      if (bareTicker(current) !== bareTicker(tv)) await setSymbol({ symbol: tv });
      const d = await readBars();
      if (d) results.push({ symbol: s, price: d.price, trend: d.trend, momentum10d: d.momentum10d });
      else results.push({ symbol: s, error: 'no data' });
    } catch (e) { results.push({ symbol: s, error: e.message }); }
  }

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
    summary: 'Top: ' + valid.slice(0, 5).map(r => r.symbol + ' +' + r.momentum10d + '%').join(', '),
  };
}