import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/stock.js';

export function registerStockTools(server) {
  server.tool('stock_compare', 'Compare real relative performance of multiple symbols. Each symbol is loaded on the chart and its actual bars are read, then ranked by % change (winners/losers).', {
    symbols: z.array(z.string()).describe('Array of symbols to compare (e.g., ["BAS", "BAYN", "SAP"])'),
    timeframe: z.string().optional().describe('Timeframe for comparison (default: current chart timeframe)'),
    period_days: z.number().optional().describe('Number of bars to analyze (default: 100)'),
  }, async ({ symbols, timeframe, period_days }) => {
    try { return jsonResult(await core.compareSymbols({ symbols, timeframe, period_days })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('stock_correlation', 'Real correlation matrix between symbols (from actual daily returns, no simulation). Switches the chart per symbol to read true price data.', {
    symbols: z.array(z.string()).optional().describe('Array of symbols (default: watchlist symbols if detectable)'),
    period_days: z.number().optional().describe('Days for correlation calculation (default: 30)'),
    method: z.enum(['pearson', 'spearman']).optional().describe('Correlation method (default: pearson)'),
  }, async ({ symbols, period_days, method }) => {
    try { return jsonResult(await core.getCorrelation({ symbols, period_days, method })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('stock_relative_strength', 'Real relative strength of a symbol vs a benchmark. Both symbols are loaded on the chart and their actual bars read, then RS = symbol% - benchmark% over the window.', {
    symbol: z.string().optional().describe('Symbol to analyze (default: current chart symbol)'),
    benchmark: z.string().optional().describe('Benchmark symbol (default: SPY)'),
  }, async ({ symbol, benchmark }) => {
    try { return jsonResult(await core.getRelativeStrength({ symbol, benchmark })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('stock_batch_technicals', 'Real technical snapshot (SMA20/50, Bollinger, ATR, trend, momentum, 1d change) for multiple symbols. Each symbol is loaded on the chart individually — no echoed active-chart data.', {
    symbols: z.array(z.string()).optional().describe('Array of symbols (default: current chart symbol)'),
  }, async ({ symbols }) => {
    try { return jsonResult(await core.getBatchTechnicals({ symbols })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('stock_momentum_screen', 'Real momentum screen — rank symbols by actual 10-day momentum from live bars (never stale, unlike the TV Screener tab). Returns gainers sorted by momentum_pct_10d.', {
    symbols: z.array(z.string()).describe('Candidate symbols to screen (e.g., ["NVDA","AMD","AVGO","SAP","BAYN","SIE"])'),
    limit: z.number().optional().describe('Max rows to return (default: 10)'),
    filter: z.enum(['all', 'positive', 'bullish']).optional().describe('all | positive (momentum>0) | bullish (bullish trend)'),
    sort_by: z.enum(['momentum', 'trend']).optional().describe('Ranking key (default: momentum)'),
  }, async ({ symbols, limit, filter, sort_by }) => {
    try { return jsonResult(await core.getMomentumScreen({ symbols, limit, filter, sort_by })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
