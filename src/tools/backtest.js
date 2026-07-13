import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/backtest.js';

export function registerBacktestTools(server) {
  server.tool('backtest_summary', 'Get detailed strategy performance summary with Sharpe, Sortino, Calmar ratios, win rate, etc. Requires a strategy indicator on the chart.', {}, async () => {
    try { return jsonResult(await core.getSummary()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('backtest_trade_analysis', 'Analyze individual trades: win/loss stats, consecutive wins/losses, expectancy, R:R ratio', {
    max_trades: z.number().optional().describe('Maximum trades to analyze (default 100)'),
  }, async ({ max_trades }) => {
    try { return jsonResult(await core.getTradeAnalysis({ max_trades })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('backtest_equity_analysis', 'Analyze the equity curve: drawdown periods, recovery factor, peak/trough metrics', {}, async () => {
    try { return jsonResult(await core.getEquityAnalysis()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('backtest_monte_carlo', 'Run Monte Carlo simulation (1000+ iterations) on trade sequence for risk modeling', {
    simulations: z.number().optional().describe('Number of simulations (default 1000, max 10000)'),
  }, async ({ simulations }) => {
    try { return jsonResult(await core.runMonteCarlo({ simulations })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('backtest_export_trades', 'Export all strategy trades as JSON or CSV', {
    format: z.enum(['json', 'csv']).optional().describe('Export format: json or csv (default json)'),
    max_trades: z.number().optional().describe('Maximum trades to export'),
  }, async ({ format, max_trades }) => {
    try { return jsonResult(await core.exportTrades({ format, max_trades })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('strategy_inputs', 'Get current strategy input parameters', {}, async () => {
    try { return jsonResult(await core.getStrategyInputs()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('strategy_optimize', 'Optimize a single strategy input parameter across a range of values', {
    input_name: z.string().describe('Name of the input parameter to optimize (e.g., "length", "period")'),
    values: z.array(z.union([z.number(), z.string()])).describe('Array of values to test (e.g., [10, 20, 30, 40, 50])'),
  }, async ({ input_name, values }) => {
    try { return jsonResult(await core.optimizeStrategy({ input_name, values })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
