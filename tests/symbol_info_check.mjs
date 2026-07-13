/** Quick live check: symbol_info bug fix (was "evaluate is not defined"). */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const SERVER_PATH = new URL('../src/server.js', import.meta.url).pathname;
const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], env: process.env });
const client = new Client({ name: 'si', version: '1.0.0', requestTimeout: 60_000 });
try {
  await client.connect(transport);
  // First load a symbol so symbol_info has something to read.
  await client.callTool({ name: 'chart_set_symbol', arguments: { symbol: 'BAYN' }, timeout: 30_000 });
  const res = await client.callTool({ name: 'symbol_info', arguments: {}, timeout: 30_000 });
  const p = JSON.parse(res.content[0].text);
  console.log('success:', p.success);
  console.log('symbol:', p.symbol, '| full_name:', p.full_name, '| exchange:', p.exchange, '| type:', p.type);
  if (!p.success) console.log('ERROR:', p.error);
} catch (e) { console.error('ERR', e.message); } finally { try { await client.close(); } catch {} }
