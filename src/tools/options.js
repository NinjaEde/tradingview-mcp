import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/options.js';

export function registerOptionsTools(server) {
  server.tool('options_get', 'Fetch the full options chain for a symbol from TradingView. Includes all columns (greeks, IV, bid/ask, volume, OI) plus computed straddle at ATM and IV metrics. The current chart tab is briefly navigated to the options chain page and then restored — saved layouts are preserved. Works for US stocks with options.', {
    symbol: z.string().optional().describe('Symbol to fetch options for (e.g., "NVDA" or "NASDAQ:NVDA"). Defaults to current chart symbol.'),
  }, async ({ symbol }) => {
    try {
      if (!symbol) throw new Error('A symbol is required for options_get. Pass the ticker (e.g., "NVDA") or use the current chart symbol.');
      return jsonResult(await core.getOptionsChain({ symbol }));
    } catch (err) {
      return jsonResult({ success: false, error: err.message }, true);
    }
  });
}