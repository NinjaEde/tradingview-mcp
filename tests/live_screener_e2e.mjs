/**
 * Live test for the screener_get tool against the open TradingView Screener tab.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER_PATH = new URL('../src/server.js', import.meta.url).pathname;

const transport = new StdioClientTransport({
  command: 'node',
  args: [SERVER_PATH],
  env: process.env,
});

const client = new Client({ name: 'screener-tester', version: '1.0.0', requestTimeout: 120_000 });

try {
  await client.connect(transport);
  console.log('connected -> screener_get');
  const res = await client.callTool({ name: 'screener_get', arguments: { limit: 10 }, timeout: 90_000 });
  const text = res?.content?.[0]?.text ?? JSON.stringify(res);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  console.log('success:', parsed?.success);
  console.log('total_rows_scraped:', parsed?.total_rows_scraped);
  console.log('sorted_by:', parsed?.sorted_by);
  console.log('top_gainers:', JSON.stringify(parsed?.top_gainers));
  console.log('top_losers:', JSON.stringify(parsed?.top_losers));
  console.log('\n--- first 10 rows ---');
  for (const r of parsed?.rows || []) {
    console.log(`  ${r.symbol}: ${r.change_pct ?? 'n/a'}%  price=${r.price ?? 'n/a'}  vol=${r.volume ?? 'n/a'}  mktcap=${r.market_cap ?? 'n/a'}`);
  }
  if (parsed?.success === false) console.log('ERROR:', parsed.error);
} catch (err) {
  console.error('SCREENER TEST FAILED:', err.message);
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
