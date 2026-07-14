/**
 * Live test: does data_get_ohlcv / stock_relative_strength respect `symbol`?
 * Strategy: first force the chart to BAS via stock_batch_technicals (known-good path),
 * then call data_get_ohlcv(BAS) and check it reads ~50€ not ~270€ (SIE).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';

const SERVER = '/Users/edgarkoenig/workspace/tradingview-mcp/src/server.js';
const proc = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
const transport = new StdioClientTransport({ command: 'node', args: [SERVER] });
const client = new Client({ name: 'bas-fix-test', version: '1.0.0' });

await client.connect(transport);

async function callTool(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const t = r.content.find(c => c.type === 'text')?.text || JSON.stringify(r);
  return JSON.parse(t);
}

// 1) Force chart to BAS via batch (known-good switch path)
const batch = await callTool('stock_batch_technicals', { symbols: ['BAS'] });
console.log('1) batch(BAS) current_price:', batch.results?.[0]?.current_price, '(expect ~50)');

// 2) Now data_get_ohlcv(BAS) — should read BAS (~50€), not SIE (~270€)
const ohlcv = await callTool('data_get_ohlcv', { symbol: 'BAS', count: 3 });
const closes = (ohlcv.bars || []).map(b => b.close);
console.log('2) ohlcv(BAS) closes:', closes.join(', '));
console.log('   => BAS ~50€; if ~270 it is STILL reading SIE');

// 3) symbol_info should report BAS now
const info = await callTool('symbol_info', {});
console.log('3) symbol_info:', info.symbol, info.description);

// 4) RS(BAS vs SIE) — should differ now
const rs = await callTool('stock_relative_strength', { symbol: 'BAS', benchmark: 'SIE' });
console.log('4) RS(BAS vs SIE):', JSON.stringify(rs.relative_strength));

const basOk = closes.every(c => c > 40 && c < 60);
console.log(basOk ? 'PASS: data_get_ohlcv respects symbol' : 'FAIL: still reading wrong symbol');

await client.close();
proc.kill();
