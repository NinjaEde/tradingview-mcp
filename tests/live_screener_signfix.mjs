/**
 * Live test: screener_get against the REAL TV Screener tab.
 * Verifies the Unicode-minus fix (negative % change parses as negative).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';

const SERVER = '/Users/edgarkoenig/workspace/tradingview-mcp/src/server.js';
const proc = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
const transport = new StdioClientTransport({ command: 'node', args: [SERVER] });
const client = new Client({ name: 'screener-live', version: '1.0.0' });

await client.connect(transport);
const res = await client.callTool({ name: 'screener_get', arguments: { limit: 20 } });
const text = res.content.find(c => c.type === 'text')?.text || JSON.stringify(res);
const data = JSON.parse(text);

console.log('total_rows_scraped:', data.total_rows_scraped);
console.log('top_losers (should be NEGATIVE now):');
for (const r of (data.top_losers || [])) {
  console.log(`  ${r.symbol_full || r.symbol}: ${r.change_pct}%`);
}
// Scan all rows for any still-parsed-positive that _raw shows a minus sign.
let bugCount = 0;
for (const row of (data.rows || [])) {
  const raw = (row._raw || []).join(' ');
  if (row.change_pct > 0 && /−/.test(raw)) bugCount++;
}
console.log('rows still showing positive but raw has Unicode-minus:', bugCount);
console.log(bugCount === 0 ? 'PASS: Unicode-minus fix live OK' : 'FAIL: sign bug still present');

await client.close();
proc.kill();
