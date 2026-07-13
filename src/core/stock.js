/**
 * Core Multi-Symbol Comparison logic.
 *
 * IMPORTANT: Every function that needs price data for a SPECIFIC symbol now
 * actually switches the active chart to that symbol (via setSymbol + waitForChartReady)
 * and reads its bars — there is no fake/simulated data anywhere in this module.
 *
 * Pure calculation helpers (pearsonCorrelation, spearmanCorrelation, computeReturns,
 * computeRelativeStrength, computeCorrelationMatrix, computeBatchTechnicals) are exported
 * so they can be unit-tested without a live TradingView connection.
 */
import { evaluate, evaluateAsync, KNOWN_PATHS, safeString } from '../connection.js';
import { setSymbol } from './chart.js';
import { waitForChartReady } from '../wait.js';
import { getOhlcv as getOhlcvCore } from './data.js';

const CHART_API = KNOWN_PATHS.chartApi;
const BARS_PATH = KNOWN_PATHS.mainSeriesBars;

const SWITCH_DELAY_MS = 600;

// In-memory cache for scraped bars: key = `${symbol}|${timeframe}`.
// Multi-symbol tools often re-request the same symbol (e.g. RS + correlation
// on the same basket) — caching avoids redundant chart switches.
const _barsCache = new Map();
function cacheKey(symbol, timeframe) {
  return `${(symbol || 'active').toUpperCase()}|${timeframe || 'D'}`;
}
function getCachedBars(symbol, timeframe) {
  const hit = _barsCache.get(cacheKey(symbol, timeframe));
  return hit || null;
}
function setCachedBars(symbol, timeframe, bars) {
  if (bars && bars.length) _barsCache.set(cacheKey(symbol, timeframe), bars);
}

// ---------------------------------------------------------------------------
// Pure helpers (no CDP / no TradingView dependency — unit-testable)
// ---------------------------------------------------------------------------

export function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.slice(0, n).reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function spearmanCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;

  function rank(arr) {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n - 1 && sorted[j + 1].v === sorted[i].v) j++;
      const avgRank = (i + j + 2) / 2;
      for (let k = i; k <= j; k++) ranks[sorted[k].i] = avgRank;
      i = j + 1;
    }
    return ranks;
  }

  const ranksX = rank(x.slice(0, n));
  const ranksY = rank(y.slice(0, n));

  return pearsonCorrelation(ranksX, ranksY);
}

// Daily (or per-bar) simple returns from a close-price array.
export function computeReturns(closes) {
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return returns;
}

// Relative strength = symbol % change minus benchmark % change over the window.
export function computeRelativeStrength(symbolCloses, benchmarkCloses) {
  if (!symbolCloses || symbolCloses.length < 2 || !benchmarkCloses || benchmarkCloses.length < 2) {
    return null;
  }
  // Align to the shorter series so we compare the same number of bars.
  const n = Math.min(symbolCloses.length, benchmarkCloses.length);
  const s = symbolCloses.slice(-n);
  const b = benchmarkCloses.slice(-n);
  const symChange = (s[n - 1] - s[0]) / s[0] * 100;
  const benchChange = (b[n - 1] - b[0]) / b[0] * 100;
  const score = symChange - benchChange;
  const level = score > 10 ? 'very_strong'
    : score > 5 ? 'strong'
    : score > 0 ? 'weak'
    : score > -5 ? 'weak_bearish' : 'very_bearish';
  return {
    score: Math.round(score * 100) / 100,
    level,
    symbol_change_pct: Math.round(symChange * 100) / 100,
    benchmark_change_pct: Math.round(benchChange * 100) / 100,
  };
}

// Build a full correlation matrix from a map of { symbol: closes[] }.
export function computeCorrelationMatrix(symbolClosesMap, method = 'pearson') {
  const symbols = Object.keys(symbolClosesMap);
  const matrix = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const sym1 = symbols[i];
      const sym2 = symbols[j];
      const r1 = computeReturns(symbolClosesMap[sym1]);
      const r2 = computeReturns(symbolClosesMap[sym2]);
      const corr = method === 'spearman'
        ? spearmanCorrelation(r1, r2)
        : pearsonCorrelation(r1, r2);
      matrix.push({
        symbol1: sym1,
        symbol2: sym2,
        correlation: corr !== null ? Math.round(corr * 1000) / 1000 : null,
        strength: corr !== null ? (
          Math.abs(corr) > 0.7 ? 'strong' :
          Math.abs(corr) > 0.4 ? 'moderate' :
          Math.abs(corr) > 0.2 ? 'weak' : 'negligible'
        ) : null,
        direction: corr !== null ? (corr > 0 ? 'positive' : 'negative') : null,
      });
    }
  }
  return matrix;
}

// Technical snapshot for a single symbol from its close/high/low/volume arrays.
export function computeBatchTechnicals(symbol, closes, highs, lows, volumes) {
  if (!closes || closes.length < 20) {
    return { symbol, error: 'Insufficient data (need >= 20 bars)' };
  }

  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;

  const sum20 = sma20;
  const variance = closes.slice(-20).reduce((a, c) => a + Math.pow(c - sum20, 2), 0) / 20;
  const stdDev = Math.sqrt(variance);
  const upperBand = sum20 + 2 * stdDev;
  const lowerBand = sum20 - 2 * stdDev;

  const lastClose = closes[closes.length - 1];

  // Momentum = % change over the last 10 bars.
  const momentum = Math.round(((lastClose - closes[closes.length - 10]) / closes[closes.length - 10]) * 10000) / 100;

  // 1-day % change (last close vs prior close).
  const change1d = Math.round(((lastClose - closes[closes.length - 2]) / closes[closes.length - 2]) * 10000) / 100;

  // ATR(14)
  let atr14 = null;
  if (closes.length >= 15 && highs && lows) {
    const trs = [];
    for (let i = closes.length - 14; i < closes.length; i++) {
      const h = highs[i];
      const l = lows[i];
      const pc = closes[i - 1];
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    atr14 = trs.reduce((a, b) => a + b, 0) / 14;
  }

  const aboveSMA20 = lastClose > sma20;
  const aboveSMA50 = sma50 ? lastClose > sma50 : null;
  const trend = aboveSMA20 && (aboveSMA50 || sma50 === null) ? 'bullish'
    : !aboveSMA20 && (!sma50 || lastClose < sma50) ? 'bearish' : 'neutral';

  const signal = lastClose > upperBand ? 'overbought'
    : lastClose < lowerBand ? 'oversold'
    : trend === 'bullish' ? 'bullish_signal'
    : trend === 'bearish' ? 'bearish_signal' : 'neutral';

  return {
    symbol,
    current_price: Math.round(lastClose * 100) / 100,
    change_1d_pct: change1d,
    sma20: Math.round(sma20 * 100) / 100,
    sma50: sma50 ? Math.round(sma50 * 100) / 100 : null,
    bollinger_bands: {
      upper: Math.round(upperBand * 100) / 100,
      middle: Math.round(sma20 * 100) / 100,
      lower: Math.round(lowerBand * 100) / 100,
      position: lastClose > upperBand ? 'above_upper'
        : lastClose < lowerBand ? 'below_lower' : 'within_bands',
    },
    atr14: atr14 ? Math.round(atr14 * 100) / 100 : null,
    trend,
    signal,
    momentum_pct_10d: momentum,
  };
}

// ---------------------------------------------------------------------------
// CDP-backed data fetching
// ---------------------------------------------------------------------------

// Pull raw bars for the CURRENTLY active chart.
async function getActiveBars(count) {
  const data = await getOhlcvCore({ count, summary: false });
  return data.bars || [];
}

// Switch the chart to `symbol`, wait for it to be ready, then read its bars.
// setSymbol() already awaits waitForChartReady internally, so we don't
// re-wait here — that would just add redundant latency.
async function fetchBarsForSymbol(symbol, count, timeframe = 'D') {
  const sym = (symbol || '').trim();
  if (!sym) {
    // No symbol given -> use whatever is currently active.
    return getActiveBars(count);
  }
  const cached = getCachedBars(sym, timeframe);
  if (cached) return cached;
  const { chart_ready } = await setSymbol({ symbol: sym });
  if (!chart_ready) {
    // Fallback: give the chart a short stabilisation window if waitForChartReady timed out.
    await new Promise(r => setTimeout(r, SWITCH_DELAY_MS));
  }
  const bars = getActiveBars(count);
  setCachedBars(sym, timeframe, bars);
  return bars;
}

function extractOHLC(bars) {
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume || 0);
  return { closes, highs, lows, volumes };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function compareSymbols({ symbols, timeframe, period_days }) {
  if (!symbols || symbols.length < 2) {
    throw new Error('At least 2 symbols required for comparison');
  }

  const period = period_days || 100;
  const performance = [];

  for (const sym of symbols.slice(0, 10)) {
    try {
      const bars = await fetchBarsForSymbol(sym, period);
      const { closes } = extractOHLC(bars);
      if (closes.length < 2) {
        performance.push({ symbol: sym, error: 'Insufficient data' });
        continue;
      }
      const startPrice = closes[0];
      const endPrice = closes[closes.length - 1];
      const changePct = (endPrice - startPrice) / startPrice * 100;
      performance.push({
        symbol: sym,
        start_price: Math.round(startPrice * 100) / 100,
        end_price: Math.round(endPrice * 100) / 100,
        change_pct: Math.round(changePct * 100) / 100,
        bars: closes.length,
      });
    } catch (e) {
      performance.push({ symbol: sym, error: e.message });
    }
  }

  // Rank best -> worst by change_pct.
  const ranked = performance
    .filter(p => typeof p.change_pct === 'number')
    .sort((a, b) => b.change_pct - a.change_pct);

  return {
    success: true,
    base_symbol: performance[0]?.symbol || null,
    period_days: period,
    symbols_compared: symbols.slice(0, 10),
    performance,
    ranking: ranked.map((p, i) => ({ rank: i + 1, symbol: p.symbol, change_pct: p.change_pct })),
    winners: ranked.filter(p => p.change_pct > 0).map(p => p.symbol),
    losers: ranked.filter(p => p.change_pct < 0).map(p => p.symbol),
    note: 'Each symbol was loaded on the chart individually and its real bars were read.',
  };
}

export async function getCorrelation({ symbols, period_days, method = 'pearson' }) {
  const watchlistSymbols = symbols && symbols.length >= 2 ? symbols : await evaluate(`
    (function() {
      var wl = window.TradingView && window.TradingView.WatchListWidget;
      if (wl && typeof wl.getSymbols === 'function') {
        return wl.getSymbols();
      }
      return null;
    })()
  `);

  if (!watchlistSymbols || !Array.isArray(watchlistSymbols) || watchlistSymbols.length < 2) {
    const currentSymbol = await evaluate(`${CHART_API}.symbol()`);
    return {
      success: true,
      correlation: [],
      note: 'Provide at least 2 symbols via the symbols array (watchlist auto-detect failed).',
      current_symbol: currentSymbol,
      recommendation: 'Use stock_correlation with symbols: ["AAPL", "MSFT", "GOOGL"]',
    };
  }

  const closesMap = {};
  for (const sym of watchlistSymbols.slice(0, 15)) {
    try {
      const bars = await fetchBarsForSymbol(sym, period_days || 30);
      const { closes } = extractOHLC(bars);
      if (closes.length >= 3) closesMap[sym] = closes;
    } catch { /* skip symbol on failure */ }
  }

  if (Object.keys(closesMap).length < 2) {
    return {
      success: true,
      correlation: [],
      note: 'Could not retrieve real price data for >= 2 symbols.',
    };
  }

  const matrix = computeCorrelationMatrix(closesMap, method);

  const strongest_positive = matrix.filter(c => c.correlation > 0)
    .sort((a, b) => b.correlation - a.correlation)[0] || null;
  const strongest_negative = matrix.filter(c => c.correlation < 0)
    .sort((a, b) => a.correlation - b.correlation)[0] || null;

  return {
    success: true,
    method,
    period_days: period_days || 30,
    symbol_count: Object.keys(closesMap).length,
    correlation_matrix: matrix,
    summary: { strongest_positive, strongest_negative },
    note: 'Correlation computed from REAL daily returns via per-symbol chart switching.',
  };
}

export async function getRelativeStrength({ symbol, benchmark }) {
  const bench = benchmark || 'SPY';
  const sym = symbol || await evaluate(`${CHART_API}.symbol()`);

  const symBars = await fetchBarsForSymbol(sym, 100);
  const benchBars = await fetchBarsForSymbol(bench, 100);

  const { closes: symCloses } = extractOHLC(symBars);
  const { closes: benchCloses } = extractOHLC(benchBars);

  const rs = computeRelativeStrength(symCloses, benchCloses);
  if (!rs) {
    return {
      success: true,
      symbol: sym,
      benchmark: bench,
      error: 'Insufficient price data for symbol and/or benchmark',
    };
  }

  return {
    success: true,
    symbol: sym,
    benchmark: bench,
    period_bars: Math.min(symCloses.length, benchCloses.length),
    relative_strength: rs,
    interpretation: rs.score > 0
      ? `${sym} outperforming ${bench} by ${rs.score}%`
      : `${sym} underperforming ${bench} by ${Math.abs(rs.score)}%`,
    note: 'RS computed from real returns. Benchmark was loaded on the chart and its bars read.',
  };
}

export async function getBatchTechnicals({ symbols }) {
  const syms = symbols && symbols.length > 0 ? symbols
    : [(await evaluate(`${CHART_API}.symbol()`))];

  const results = [];
  for (const sym of syms.slice(0, 20)) {
    try {
      const bars = await fetchBarsForSymbol(sym, 50);
      const { closes, highs, lows, volumes } = extractOHLC(bars);
      results.push(computeBatchTechnicals(sym, closes, highs, lows, volumes));
    } catch (e) {
      results.push({ symbol: sym, error: e.message });
    }
  }

  return {
    success: true,
    symbol_count: results.length,
    results,
    summary: {
      bullish: results.filter(r => r.trend === 'bullish').length,
      bearish: results.filter(r => r.trend === 'bearish').length,
      neutral: results.filter(r => r.trend === 'neutral').length,
    },
    note: 'Each symbol loaded on the chart individually; technicals from real bars.',
  };
}
