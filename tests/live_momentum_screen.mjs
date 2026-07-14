/**
 * Live test: stock_momentum_screen (real 10d momentum from live bars).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';

const SERVER = '/Users/edgarkoenig/workspace/tradingview-mcp/src/server.js';

const proc = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
const transport = new StdioClientTransport({ command: 'node', args: [SERVER] });
const client = new Client({ name: 'momentum-test', version: '1.0.0' });

await client.connect(transport);

const symbols = ['NVDA', 'AMD', 'AVGO', 'MU', 'ASML', 'BAYN', 'SIE', 'SAP', 'BAS', 'AAPL', 'GOOG', 'AMZN'];

const res = await client.callTool({ name: 'stock_momentum_screen', arguments: { symbols, limit: 12, filter: 'all', sort_by: 'momentum' } });
const text = res.content.find(c => c.type === 'text')?.text || JSON.stringify(res);
console.log(text);

await client.close();
proc.kill();
