/**
 * Live E2E test for the tradingview-mcp stock_* tools.
 * Connects via stdio MCP client to the REPO build of the server, and calls the
 * real tools against the live TradingView Desktop (CDP :9222).
 *
 * Each call is isolated with its own timeout + timing so we can see exactly
 * which multi-symbol call is slow/hanging.
 *
 * Usage: node tests/live_stock_e2e.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER_PATH = new URL('../src/server.js', import.meta.url).pathname;
const CALL_TIMEOUT_MS = 110_000;

const transport = new StdioClientTransport({
  command: 'node',
  args: [SERVER_PATH],
  env: process.env,
});

const client = new Client({ name: 'live-stock-tester', version: '1.0.0', requestTimeout: 300_000 });

async function run(label, name, args) {
  const t0 = Date.now();
  try {
    const res = await client.callTool({ name, arguments: args, timeout: CALL_TIMEOUT_MS });
    const ms = Date.now() - t0;
    const text = res?.content?.[0]?.text ?? JSON.stringify(res);
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* raw */ }
    console.log(`\n===== ${label} (${ms}ms) =====`);
    if (parsed && parsed.success === false) {
      console.log('ERROR:', parsed.error);
      return;
    }
    if (parsed?.ranking) console.log('ranking:', JSON.stringify(parsed.ranking));
    if (parsed?.winners) console.log('winners:', parsed.winners);
    if (parsed?.losers) console.log('losers:', parsed.losers);
    if (parsed?.relative_strength) console.log('RS:', JSON.stringify(parsed.relative_strength), '|', parsed.interpretation);
    if (parsed?.summary) console.log('summary:', JSON.stringify(parsed.summary));
    if (parsed?.results) {
      for (const r of parsed.results) {
        console.log(`  ${r.symbol}: trend=${r.trend} signal=${r.signal} chg1d=${r.change_1d_pct ?? 'n/a'} mom10d=${r.momentum_pct_10d ?? 'n/a'} sma20=${r.sma20}`);
      }
    }
    if (parsed?.correlation_matrix) {
      for (const c of parsed.correlation_matrix) {
        console.log(`  ${c.symbol1} ~ ${c.symbol2}: ${c.correlation} (${c.strength}, ${c.direction})`);
      }
    }
  } catch (err) {
    console.log(`\n===== ${label} (${Date.now() - t0}ms) FAILED =====`);
    console.log('ERROR:', err.message);
  }
}

try {
  await client.connect(transport);
  console.log('Connected to tradingview-mcp (REPO build) -> live TradingView Desktop.');

  await run('stock_compare BAS/BAYN/SAP', 'stock_compare', { symbols: ['BAS', 'BAYN', 'SAP'], period_days: 60 });
  await run('stock_relative_strength BAYN vs SPY', 'stock_relative_strength', { symbol: 'BAYN', benchmark: 'SPY' });
  await run('stock_batch_technicals BAS/BAYN', 'stock_batch_technicals', { symbols: ['BAS', 'BAYN'] });
  await run('stock_correlation BAS/BAYN/SAP', 'stock_correlation', { symbols: ['BAS', 'BAYN', 'SAP'], period_days: 30, method: 'pearson' });

  console.log('\n--- LIVE E2E COMPLETE ---');
} catch (err) {
  console.error('FATAL:', err.message);
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch { /* ignore */ }
}
