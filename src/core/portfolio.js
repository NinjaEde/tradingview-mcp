import { evaluate } from '../connection.js';
import { setSymbol } from './chart.js';

function toTvSymbol(ticker) {
  const m = { NVDA:'BATS:NVDA', PANW:'NASDAQ:PANW', HIMS:'NYSE:HIMS', CRWD:'NASDAQ:CRWD', AMZN:'NASDAQ:AMZN', AAPL:'NASDAQ:AAPL', GOOGL:'NASDAQ:GOOGL', MSFT:'NASDAQ:MSFT', MDB:'NASDAQ:MDB', NET:'NYSE:NET', TSM:'NYSE:TSM', NBIS:'NASDAQ:NBIS', AVGO:'NASDAQ:AVGO', SOFI:'NASDAQ:SOFI', BABA:'NYSE:BABA', BIDU:'NASDAQ:BIDU', TTWO:'NASDAQ:TTWO', MRK:'NYSE:MRK', NSC:'NYSE:NSC', BRKB:'NYSE:BRKB', ASML:'EURONEXT:ASML', IFX:'XETR:IFX', ALV:'XETR:ALV', DTE:'XETR:DTE', ENR:'XETR:ENR', ADS:'XETR:ADS', MUV2:'XETR:MUV2', HNR1:'XETR:HNR1' };
  return m[ticker] || (ticker.includes(':') ? ticker : 'NASDAQ:' + ticker);
}

export async function getPortfolioHealth({ positions }) {
  if (!positions || !positions.length) throw new Error('positions required');

  const origSym = await evaluate(`(function(){try{return window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().symbol();}catch(e){return null;}})()`);

  const results = [];
  for (const pos of positions) {
    const tv = toTvSymbol(pos.symbol);
    try {
      await setSymbol({ symbol: tv });
      const pd = await evaluate('(function(){try{var b=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();if(!b||!b.length)return null;var l=b[b.length-1];return{close:l.close};}catch(e){return null;}})()');
      if (!pd || pd.close == null) { results.push({ ...pos, error: 'no price' }); continue; }
      const p = pd.close, e = pos.entry, s = pos.stop;
      const pnl = e ? ((p - e) / e * 100) : null;
      const dStop = s ? ((p - s) / p * 100) : null;
      const alert = dStop != null && dStop < 5 ? '⚠️ STOP' : (dStop != null && dStop < 10 ? '🟡' : '🟢');
      results.push({ symbol: pos.symbol, price: Math.round(p*100)/100, pnlPct: pnl!=null?Math.round(pnl*10)/10:null, stop: s, distToStopPct: dStop!=null?Math.round(dStop*10)/10:null, stopAlert: alert });
    } catch (e) { results.push({ ...pos, error: e.message }); }
  }

  try { await setSymbol({ symbol: origSym }); } catch {}

  const warn = results.filter(r => r.stopAlert === '⚠️ STOP');
  return { success: true, checked: results.length, nearStop: warn.length, positions: results, warnings: warn, summary: warn.length ? '⚠️ ' + warn.length + ' nah am Stop: ' + warn.map(r => r.symbol).join(', ') : 'Alle OK' };
}