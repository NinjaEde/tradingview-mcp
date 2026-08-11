/**
 * Portfolio health check — verifies positions against live prices, stops and targets.
 */
import os from 'os';
import { getClient, evaluate, evaluateAsync, safeString } from '../connection.js';

const JOURNAL_DIR = os.homedir() + '/Trading-Journal/wiki/';

function toTvSymbol(ticker) {
  const map = {
    NVDA: 'NASDAQ:NVDA', ANET: 'NYSE:ANET', CRWD: 'NASDAQ:CRWD',
    NET: 'NYSE:NET', MDB: 'NASDAQ:MDB', MSFT: 'NASDAQ:MSFT',
    AMZN: 'NASDAQ:AMZN', TTWO: 'NASDAQ:TTWO', TSM: 'NYSE:TSM',
    AAPL: 'NASDAQ:AAPL', GOOGL: 'NASDAQ:GOOGL', SOFI: 'NASDAQ:SOFI',
    NBIS: 'NASDAQ:NBIS', AVGO: 'NASDAQ:AVGO', PANW: 'NASDAQ:PANW',
    HIMS: 'NYSE:HIMS', BABA: 'NYSE:BABA', BIDU: 'NASDAQ:BIDU',
    BRKB: 'NYSE:BRKB', MRK: 'NYSE:MRK', NSC: 'NYSE:NSC',
    ASML: 'EURONEXT:ASML', IFX: 'XETR:IFX', STM: 'EURONEXT:STM',
    ALV: 'XETR:ALV', DTE: 'XETR:DTE', ENR: 'XETR:ENR',
    ADS: 'XETR:ADS', NOVOB: 'XETR:NOB', MUV2: 'XETR:MUV2',
    HNR1: 'XETR:HNR1', TEN: 'HKEX:0700', BYD: 'HKEX:1211',
    XIAOMI: 'HKEX:1810',
  };
  return map[ticker] || (ticker.includes(':') ? ticker : 'NASDAQ:' + ticker);
}

export async function getPortfolioHealth({ positions }) {
  if (!positions || !Array.isArray(positions) || positions.length === 0) {
    throw new Error('positions required: array of { symbol, stop, entry, targets[] }');
  }

  // Get current quotes using chart
  const results = [];
  for (const pos of positions) {
    const tv = toTvSymbol(pos.symbol);
    try {
      // Use the existing quote_get approach via the chart
      // Store original symbol first
      const origSym = await evaluate(`(function(){try{var c=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;return c.model().mainSeries().symbol();}catch(e){return null;}})()`);

      // Switch to position symbol
      await evaluate(`(function(){var c=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;c.setSymbol(${safeString(tv)});})()`);
      await new Promise(r => setTimeout(r, 2500));

      // Get price
      const priceData = await evaluate(`(function(){try{var bars=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();var l=bars[bars.length-1];return{price:l.close};}catch(e){return null;}})()`);

      // Restore
      if (origSym) {
        await evaluate(`(function(){var c=window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;c.setSymbol(${safeString(origSym)});})()`);
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!priceData) { results.push({ ...pos, error: 'Price fetch failed' }); continue; }
      const price = priceData.price;
      const entry = pos.entry;
      const stop = pos.stop;
      const pnl = entry ? ((price - entry) / entry * 100) : null;
      const distToStop = stop ? ((price - stop) / Math.abs(price) * 100) : null;
      const stopAlert = distToStop != null && distToStop < 5 ? '⚠️ STOP NAH (<5%)'
        : (distToStop != null && distToStop < 10 ? '🟡 Stop <10%' : '🟢 OK');
      const targets = (pos.targets || []).map(t => {
        const dist = ((t - price) / Math.abs(price) * 100);
        return { price: t, distancePct: Math.round(dist * 10) / 10, status: dist <= 0 ? 'ERREICHT' : 'OFFEN' };
      });

      results.push({
        symbol: pos.symbol, tvSymbol: tv, price: Math.round(price * 100) / 100,
        entry, pnlPct: pnl != null ? Math.round(pnl * 10) / 10 : null,
        stop, distToStopPct: distToStop != null ? Math.round(distToStop * 10) / 10 : null,
        stopAlert, targets,
      });

    } catch (e) {
      results.push({ ...pos, error: e.message });
    }
  }

  const warnings = results.filter(r => r.stopAlert?.includes('STOP'));
  const atTarget = results.filter(r => r.targets?.some(t => t.status === 'ERREICHT'));

  return {
    success: true,
    positionsChecked: results.length,
    positionsNearStop: warnings.length,
    positionsAtTarget: atTarget.length,
    positions: results,
    warnings: warnings.map(r => ({ symbol: r.symbol, price: r.price, stop: r.stop, distPct: r.distToStopPct })),
    atTarget: atTarget.map(r => ({ symbol: r.symbol, price: r.price, targetsHit: r.targets.filter(t => t.status === 'ERREICHT').map(t => t.price) })),
    summary: warnings.length > 0
      ? `⚠️ ${warnings.length} Position(en) nahe am Stop! ${warnings.map(r => r.symbol + ' ' + r.distToStopPct + '%').join(', ')}`
      : (atTarget.length > 0
        ? `🎯 ${atTarget.length} Ziel(e) erreicht! ${atTarget.map(r => r.symbol).join(', ')}`
        : 'Alle Positionen im grünen Bereich.'),
  };
}