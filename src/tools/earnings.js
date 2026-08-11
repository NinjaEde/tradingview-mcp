import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/earnings.js';

export function registerEarningsTools(server) {
  server.tool('earnings_check', 'Check upcoming earnings for a list of symbols. Scrapes TradingView earnings calendar to warn if a symbol has earnings in the next ~7 days. Use before opening new positions to avoid volatility surprises.', {
    symbols: z.array(z.string()).describe('Array of ticker symbols to check (e.g., ["NVDA", "AAPL", "CRWD"])'),
  }, async ({ symbols }) => {
    try { return jsonResult(await core.checkEarnings({ symbols })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}