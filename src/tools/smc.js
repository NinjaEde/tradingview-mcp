import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/smc.js';

export function registerSMCTools(server) {
  server.tool('smc_dashboard', 'Consolidated SMC analysis from the "Ede - Advanced SMC v2.0" indicator. Reads BOS/CHoCH levels, EMA stack, zone, structure, checklist, and computes trading bias with confidence score. Replaces 4 separate tool calls (lines, labels, boxes, tables) with one.', {}, async () => {
    try { return jsonResult(await core.getSMCDashboard()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}