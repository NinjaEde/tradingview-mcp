import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/screener.js';

export function registerScreenerTools(server) {
  server.tool('screener_get', 'Read the live TradingView Screener tab and return ranked results (gainers/losers) by % change. Requires the Screener tab to be open in TradingView Desktop. Scrapes the real table — no simulated data.', {
    sort_by: z.enum(['change_pct', 'price', 'volume', 'rel_volume', 'market_cap', 'pe']).optional().describe('Column to sort by (default: change_pct)'),
    limit: z.number().optional().describe('Max number of rows to return (default: 20)'),
    gainers_only: z.boolean().optional().describe('Return only positive-change rows'),
    losers_only: z.boolean().optional().describe('Return only negative-change rows'),
  }, async ({ sort_by, limit, gainers_only, losers_only }) => {
    try { return jsonResult(await core.getScreener({ sort_by, limit, gainers_only, losers_only })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
