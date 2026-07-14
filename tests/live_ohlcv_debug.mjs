/**
 * Debug: after getOhlcv(BAS), what does chart.symbol() vs mainSeriesBars say?
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';

const SERVER = '/Users/edgarkoenig/workspace/tradingview-mcp/src/server.js';
const proc = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
const transport = new StdioClientTransport({ command: 'node', args: [SERVER] });
const client = new Client({ name: 'debug-ohlcv', version: '1.0.0' });

await client.connect(transport);
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return JSON.parse(r.content.find(c => c.type === 'text')?.text || '{}');
};

// Force BAS via batch first (known-good switch)
await call('stock_batch_technicals', { symbols: ['BAS'] });
console.log('after batch(BAS) symbol_info:', (await call('symbol_info', {})).symbol);

// Now getOhlcv(BAS)
const o = await call('data_get_ohlcv', { symbol: 'BAS', count: 3 });
const closes = (o.bars || []).map(b => b.close);
console.log('getOhlcv(BAS) closes:', closes.join(', '));

// symbol_info again
console.log('symbol_info after getOhlcv(BAS):', (await call('symbol_info', {})).symbol);

await client.close();
proc.kill();
