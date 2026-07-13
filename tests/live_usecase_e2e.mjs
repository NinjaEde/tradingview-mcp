/**
 * Live E2E for the new screener_get + fixed stock_* tools (Use-Case suite).
 * Connects to the REPO build of the server and exercises real tools against
 * the live TradingView Desktop (CDP :9222).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER_PATH = new URL('../src/server.js', import.meta.url).pathname;
const CALL_TIMEOUT_MS = 120_000;

const transport = new StdioClientTransport({
  command: 'node',
  args: [SERVER_PATH],
  env: process.env,
});

const client = new Client({ name: 'uc-tester', version: '1.0.0', requestTimeout: 300_000 });

async function run(label, name, args) {
  const t0 = Date.now();
  try {
    const res = await client.callTool({ name, arguments: args, timeout: CALL_TIMEOUT_MS });
    const ms = Date.now() - t0;
    const text = res?.content?.[0]?.text ?? JSON.stringify(res);
    let p = null; try { p = JSON.parse(text); } catch {}
    console.log(`\n===== ${label} (${ms}ms) =====`);
    if (p?.success === false) { console.log('ERROR:', p.error); return p; }
    if (p?.ranking) console.log('ranking:', JSON.stringify(p.ranking));
    if (p?.winners) console.log('winners:', p.winners);
    if (p?.losers) console.log('losers:', p.losers);
    if (p?.relative_strength) console.log('RS:', JSON.stringify(p.relative_strength), '|', p.interpretation);
    if (p?.results) for (const r of p.results) console.log(`  ${r.symbol}: trend=${r.trend} chg1d=${r.change_1d_pct ?? 'n/a'} mom10d=${r.momentum_pct_10d ?? 'n/a'} sma20=${r.sma20}`);
    if (p?.top_gainers) console.log('top_gainers:', JSON.stringify(p.top_gainers));
    if (p?.top_losers) console.log('top_losers:', JSON.stringify(p.top_losers));
    if (p?.rows) for (const r of p.rows.slice(0, 8)) console.log(`  ${r.symbol}: ${r.change_pct ?? 'n/a'}% price=${r.price ?? 'n/a'} mktcap=${r.market_cap ?? 'n/a'}`);
    return p;
  } catch (err) {
    console.log(`\n===== ${label} (${Date.now() - t0}ms) FAILED =====`);
    console.log('ERROR:', err.message);
    return null;
  }
}

try {
  await client.connect(transport);
  console.log('Connected (REPO build) -> live TradingView Desktop.');

  // UC1: Screener — scan for momentum gainers
  await run('UC1 screener_get (gainers)', 'screener_get', { limit: 8 });

  // UC2: Compare real DAX names
  await run('UC2 stock_compare BAS/BAYN/SAP', 'stock_compare', { symbols: ['BAS', 'BAYN', 'SAP'], period_days: 60 });

  // UC3: RS vs benchmark
  await run('UC3 stock_relative_strength BAYN vs SPY', 'stock_relative_strength', { symbol: 'BAYN', benchmark: 'SPY' });

  // UC4: Batch technicals
  await run('UC4 stock_batch_technicals BAS/BAYN', 'stock_batch_technicals', { symbols: ['BAS', 'BAYN'] });

  // UC5: correlation on a sector basket
  await run('UC5 stock_correlation BAS/BAYN/SAP/SIE', 'stock_correlation', { symbols: ['BAS', 'BAYN', 'SAP', 'SIE'], period_days: 30, method: 'pearson' });

  console.log('\n--- USE-CASE LIVE E2E COMPLETE ---');
} catch (err) {
  console.error('FATAL:', err.message);
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}
