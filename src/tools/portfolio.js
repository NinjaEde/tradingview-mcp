import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/portfolio.js';

export function registerPortfolioTools(server) {
  server.tool('portfolio_health', 'Check portfolio positions against live prices, stops, and targets. Takes an array of positions with symbol, entry, stop, and targets. For each position, fetches the current price and computes distance to stop and targets. Flags positions within 5% of stop.', {
    positions: z.array(z.object({
      symbol: z.string().describe('Ticker (NVDA, PANW, etc.)'),
      entry: z.number().optional().describe('Entry price'),
      stop: z.number().optional().describe('Stop-loss price'),
      targets: z.array(z.number()).optional().describe('Target prices'),
    })).describe('Array of positions to check'),
  }, async ({ positions }) => {
    try { return jsonResult(await core.getPortfolioHealth({ positions })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}