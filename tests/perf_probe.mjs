/**
 * Performance probe: measure multi-symbol tool latency on the (fixed) repo build.
 * Prints wall-clock per call so we can compare against the old ~6-8s/call baseline.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER_PATH = new URL('../src/server.js', import.meta.url).pathname;
const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], env: process.env });
const client = new Client({ name: 'perf', version: '1.0.0', requestTimeout: 300_000 });

async function timed(label, name, args) {
  const t0 = Date.now();
  const res = await client.callTool({ name, arguments: args, timeout: 200_000 });
  const ms = Date.now() - t0;
  const p = JSON.parse(res.content[0].text);
  const ok = p.success ? 'ok' : 'ERR:' + p.error;
  console.log(`${label.padEnd(28)} ${String(ms).padStart(6)}ms  ${ok}`);
  return p;
}

try {
  await client.connect(transport);
  console.log('--- perf probe (repo build, post-refactor) ---');
  const basket = ['BAS', 'BAYN', 'SAP', 'SIE'];
  await timed('stock_compare x4', 'stock_compare', { symbols: basket, period_days: 60 });
  await timed('stock_batch x4', 'stock_batch_technicals', { symbols: basket });
  await timed('stock_correlation x4', 'stock_correlation', { symbols: basket, period_days: 30 });
  // Second pass: same basket -> bars should hit the in-memory cache.
  await timed('stock_compare x4 (2nd)', 'stock_compare', { symbols: basket, period_days: 60 });
  await timed('stock_correlation x4 (2nd)', 'stock_correlation', { symbols: basket, period_days: 30 });
  console.log('--- done ---');
} catch (e) {
  console.error('FATAL', e.message);
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
