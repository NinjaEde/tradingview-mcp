import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/watchlist.js';

export function registerWatchlistTools(server) {
  server.tool('watchlist_smc_scan', 'Batch-scan all symbols in the current watchlist for basic SMC readiness. For each symbol: loads it briefly, reads OHLCV summary and technicals (trend, momentum, SMA status). Returns symbols sorted by bullish momentum. Use as first-pass filter before deep SMC analysis.', {
    symbols: z.array(z.string()).optional().describe('Symbols to scan (e.g., ["NASDAQ:NVDA", "NYSE:CRWD"]). Omit to use the chart watchlist symbols.'),
    filter: z.enum(['all', 'bullish', 'bearish']).optional().describe('Filter: all, bullish (trend up), or bearish (trend down). Default: all.'),
    limit: z.number().optional().describe('Max symbols to return (default: 15)'),
  }, async ({ symbols, filter, limit }) => {
    try { return jsonResult(await core.scanWatchlist({ symbols, filter, limit })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}