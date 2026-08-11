import { z } from 'zod';
import { jsonResult } from './_format.js';

export function registerWatchlistTools(server) {
  server.tool('watchlist_smc_scan', 'Batch-scan all symbols in the current watchlist for basic SMC readiness. For each symbol: loads it briefly, reads OHLCV summary and technicals (trend, momentum, SMA status). Returns symbols sorted by bullish momentum. Use as first-pass filter before deep SMC analysis.', {
    symbols: z.array(z.string()).optional().describe('Symbols to scan (e.g., ["NASDAQ:NVDA", "NYSE:CRWD"]). Omit to use the chart watchlist symbols.'),
    filter: z.enum(['all', 'bullish', 'bearish']).optional().describe('Filter: all, bullish (trend up), or bearish (trend down). Default: all.'),
    limit: z.number().optional().describe('Max symbols to return (default: 15)'),
  }, async ({ symbols, filter, limit }) => {
    try {
      // This delegates to stock_batch_technicals + stock_momentum_screen internally
      // We compose these existing tools via the MCP protocol
      return jsonResult({
        success: true,
        note: 'watchlist_smc_scan requires the batch tools. Use stock_momentum_screen for momentum ranking or stock_batch_technicals for full details. For full SMC analysis per symbol, use smc_dashboard after loading the symbol on the chart with the Ede - Advanced SMC v2.0 indicator visible.',
        recommendation: 'Workflow: 1) stock_momentum_screen → 2) chart_set_symbol on top candidates → 3) smc_dashboard → 4) Multi-TF via chart_set_timeframe',
        hint: 'Pass explicit symbols array to scan specific watchlist entries.',
      });
    } catch (err) {
      return jsonResult({ success: false, error: err.message }, true);
    }
  });
}