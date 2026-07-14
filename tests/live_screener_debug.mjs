/**
 * Live check: for rows where change_pct > 0, show WHICH raw cell has the minus.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';

const SERVER = '/Users/edgarkoenig/workspace/tradingview-mcp/src/server.js';
const proc = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
const transport = new StdioClientTransport({ command: 'node', args: [SERVER] });
const client = new Client({ name: 'screener-debug', version: '1.0.0' });

await client.connect(transport);
const res = await client.callTool({ name: 'screener_get', arguments: { limit: 100 } });
const text = res.content.find(c => c.type === 'text')?.text || JSON.stringify(res);
const data = JSON.parse(text);

let fp = 0;
for (const row of (data.rows || [])) {
  if (row.change_pct > 0) {
    const rawCells = row._raw || [];
    const minusCells = rawCells.filter(c => /−/.test(c));
    if (minusCells.length) {
      fp++;
      if (fp <= 4) {
        console.log(`symbol=${row.symbol_full || row.symbol} change_pct=${row.change_pct}`);
        console.log(`  minus in cells: ${JSON.stringify(minusCells)}`);
      }
    }
  }
}
console.log('false-positive rows (change>0 but some cell has minus):', fp);
console.log('=> if minus is in EPS/dividend cell, not the %change cell, the sign fix is CORRECT');
await client.close();
proc.kill();
