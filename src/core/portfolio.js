import { evaluate } from '../connection.js';
import { setSymbol } from './chart.js';

function toTvSymbol(ticker) {
  const m = { NVDA:'BATS:NVDA', PANW:'BATS:PANW', HIMS:'NYSE:HIMS', CRWD:'BATS:CRWD', AMZN:'BATS:AMZN', AAPL:'BATS:AAPL', GOOGL:'BATS:GOOGL', MSFT:'BATS:MSFT', MDB:'BATS:MDB', NET:'NYSE:NET', TSM:'NYSE:TSM', NBIS:'BATS:NBIS', AVGO:'BATS:AVGO', SOFI:'BATS:SOFI', BABA:'NYSE:BABA', BIDU:'BATS:BIDU', TTWO:'BATS:TTWO', MRK:'NYSE:MRK', NSC:'NYSE:NSC', BRKB:'NYSE:BRKB', ASML:'EURONEXT:ASML', IFX:'XETR:IFX', ALV:'XETR:ALV', DTE:'XETR:DTE', ENR:'XETR:ENR', ADS:'XETR:ADS', MUV2:'XETR:MUV2', HNR1:'XETR:HNR1', STM:'EURONEXT:STM' };
  return m[ticker] || (ticker.includes(':') ? ticker : 'BATS:' + ticker);
}

function readPrice() {
  return evaluate('(function(){try{var b=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();if(!b||typeof b.lastIndex!=="function")return null;var li=b.lastIndex();if(li<0)return null;var v=b.valueAt(li);return v?v[4]:null;}catch(e){return null;}})()');
}

function getCurrentSymbol() {
  return evaluate('(function(){try{return window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().symbol();}catch(e){return null;}})()');
}

function bareTicker(s) { return (s||'').split(':').pop().replace(/_DLY$/,'').toUpperCase(); }

export async function getPortfolioHealth({ positions }) {
  if (!positions || !positions.length) throw new Error('positions required');

  const results = [];
  for (const pos of positions) {
    const tv = toTvSymbol(pos.symbol);
    try {
      const current = await getCurrentSymbol();
      if (bareTicker(current) !== bareTicker(tv)) {
        await setSymbol({ symbol: tv });
      }
      const price = await readPrice();
      if (price == null) { results.push({ ...pos, error: 'no price' }); continue; }
      const p = price, e = pos.entry, s = pos.stop;
      const pnl = e ? ((p - e) / e * 100) : null;
      const dStop = s ? ((p - s) / p * 100) : null;
      const alert = dStop != null && dStop < 5 ? '⚠️ STOP' : (dStop != null && dStop < 10 ? '🟡' : '🟢');
      results.push({ symbol: pos.symbol, price: Math.round(p*100)/100, pnlPct: pnl!=null?Math.round(pnl*10)/10:null, stop: s, distToStopPct: dStop!=null?Math.round(dStop*10)/10:null, stopAlert: alert });
    } catch (e) { results.push({ ...pos, error: e.message }); }
  }

  try {
    const orig = await getCurrentSymbol();
    if (orig) await setSymbol({ symbol: orig });
  } catch {}

  const warn = results.filter(r => r.stopAlert === '⚠️ STOP');
  return { success: true, checked: results.length, nearStop: warn.length, positions: results, warnings: warn, summary: warn.length ? '⚠️ ' + warn.length + ' nah am Stop: ' + warn.map(r => r.symbol).join(', ') : 'Alle OK' };
}