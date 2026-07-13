import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/pattern.js';

export function registerPatternTools(server) {
  server.tool('chart_detect_patterns', 'Detect chart patterns: Double Top/Bottom, Head & Shoulders, Triangles, Flags', {
    min_confidence: z.enum(['low', 'medium', 'high']).optional().describe('Minimum confidence level for detected patterns'),
  }, async ({ min_confidence }) => {
    try { return jsonResult(await core.detectPatterns({ min_confidence })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('chart_detect_divergences', 'Detect RSI/MACD/CCI divergences between price and indicator', {
    indicator: z.string().optional().describe('Indicator to analyze: rsi, macd, cci (default: rsi)'),
    period: z.number().optional().describe('Period for calculation (default: 14)'),
  }, async ({ indicator, period }) => {
    try { return jsonResult(await core.detectDivergences({ indicator, period })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('chart_find_support_resistance', 'Find key support and resistance levels from swing highs/lows', {
    lookback_periods: z.number().optional().describe('Lookback periods for swing detection (default: 5)'),
  }, async ({ lookback_periods }) => {
    try { return jsonResult(await core.findSupportResistance({ lookback_periods })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('chart_analyze_trendlines', 'Analyze trendlines: slope, angle, validity, current price position', {}, async () => {
    try { return jsonResult(await core.analyzeTrendlines()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('chart_get_technicals_summary', 'Get complete technical analysis summary: SMA, Bollinger Bands, RSI, MACD, momentum', {}, async () => {
    try { return jsonResult(await core.getTechnicalsSummary()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
