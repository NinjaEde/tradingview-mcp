/** Quick check: print raw correlation_matrix for UC5 confirmation. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const SERVER_PATH = new URL('../src/server.js', import.meta.url).pathname;
const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], env: process.env });
const client = new Client({ name: 'c', version: '1.0.0', requestTimeout: 300_000 });
try {
  await client.connect(transport);
  const res = await client.callTool({ name: 'stock_correlation', arguments: { symbols: ['BAS', 'BAYN', 'SAP', 'SIE'], period_days: 30, method: 'pearson' }, timeout: 120_000 });
  const p = JSON.parse(res.content[0].text);
  console.log('success:', p.success);
  console.log('correlation_matrix:', JSON.stringify(p.correlation_matrix));
  console.log('summary:', JSON.stringify(p.summary));
} catch (e) { console.error('ERR', e.message); } finally { try { await client.close(); } catch {} }
