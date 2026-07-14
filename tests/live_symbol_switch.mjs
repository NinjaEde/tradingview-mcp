/**
 * Live regression test for the symbol-switch data-discrepancy bug.
 *
 * Reproduces the race where `data_get_ohlcv(symbol)` / `stock_batch_technicals`
 * returned the PREVIOUS chart symbol's bars (or an unrelated symbol) instead of
 * the requested symbol's bars. Spins up a fresh local server against the live
 * TradingView Desktop CDP target and asserts:
 *   1. getOhlcv(symbol) actually switches the chart and reads THAT symbol's bars
 *      (cross-checked against quote_get's close within 5% tolerance).
 *   2. Switching from a DIFFERENT symbol (EVT / AAPL) lands on the right bars.
 *   3. An invalid ticker FAILS LOUDLY (never returns silently-wrong data).
 *   4. stock_batch_technicals returns real per-symbol prices for a mixed basket.
 *
 * Usage: node tests/live_symbol_switch.mjs   (requires TradingView Desktop
 * running with remote-debugging on :9222)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, '..', 'src', 'server.js');

const proc = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
const transport = new StdioClientTransport({ command: 'node', args: [SERVER] });
const client = new Client({ name: 'live-symbol-switch', version: '1.0.0' });
await client.connect(transport);

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return JSON.parse(r.content.find((c) => c.type === 'text')?.text || '{}');
};
const symbolNow = async () => (await call('symbol_info', {})).symbol;
const norm = (s) => (s || '').split(':').pop().replace(/_DLY$/, '').replace(/^[0-9]/, '').toUpperCase();
const quoteClose = async (t) => { const q = await call('quote_get', { symbol: t }); return q.close; };

let failures = 0;
const assert = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

// --- 1) getOhlcv switches correctly from a DIFFERENT starting symbol ---
console.log('\n[1] getOhlcv switches from a different symbol:');
for (const [target, src] of [['BAS', 'EVT'], ['NVDA', 'AAPL'], ['SAP', 'BAS']]) {
  await call('chart_set_symbol', { symbol: src });
  await new Promise((r) => setTimeout(r, 1500));
  const o = await call('data_get_ohlcv', { symbol: target, count: 2 });
  const after = await symbolNow();
  const closes = (o.bars || []).map((b) => b.close);
  const qc = await quoteClose(target).catch(() => null);
  const ok = o.success && closes.length > 0 && norm(after) === norm(target)
    && qc != null && Math.abs(closes[closes.length - 1] - qc) / qc < 0.05;
  assert(ok, `getOhlcv(${target}) from ${src} -> close=${closes.join(',')} quote=${qc} sym=${after}`);
}

// --- 2) sequential switches (the original race path) ---
console.log('\n[2] sequential getOhlcv switches:');
for (const t of ['BAS', 'EVT', 'NVDA', 'SAP', 'MSFT']) {
  const o = await call('data_get_ohlcv', { symbol: t, count: 2 });
  const after = await symbolNow();
  const closes = (o.bars || []).map((b) => b.close);
  const qc = await quoteClose(t).catch(() => null);
  const ok = o.success && closes.length > 0 && norm(after) === norm(t)
    && qc != null && Math.abs(closes[closes.length - 1] - qc) / qc < 0.05;
  assert(ok, `getOhlcv(${t}) -> close=${closes.join(',')} quote=${qc} sym=${after}`);
}

// --- 3) invalid ticker must FAIL LOUDLY (no silently-wrong data) ---
console.log('\n[3] invalid ticker fails loud:');
await call('chart_set_symbol', { symbol: 'EVT' });
await new Promise((r) => setTimeout(r, 1500));
const bad = await call('data_get_ohlcv', { symbol: 'ZZZZNOTREAL123', count: 2 });
assert(!bad.success, `getOhlcv(invalid) fails loud: err=${bad.error || '-'}`);

// --- 4) batch returns real per-symbol prices ---
console.log('\n[4] stock_batch_technicals mixed basket:');
const b = await call('stock_batch_technicals', { symbols: ['BAS', 'AAPL', 'NVDA', 'SAP', 'MSFT', 'TSLA', 'AMD', 'GOOGL'] });
let batchOk = true;
for (const r of b.results) {
  const ok = r.current_price != null && !r.error;
  batchOk = batchOk && ok;
  if (!ok) console.log(`     batch ${r.symbol} ERR=${r.error}`);
}
assert(batchOk, `batch: ${b.results.map((r) => `${r.symbol}=${r.current_price}`).join(' ')}`);

// --- 5) ambiguous tickers: exchange prefix MUST pick the right instrument ---
// 'EVT' resolves to BATS:EVT (Eaton Vance, a US fund) on TradingView's default
// US domain, but XETR:EVT is Evotec SE (a German biotech). A bare-ticker
// comparison would conflate them, so an exchange-prefixed request must load
// the correct instrument and never the ambiguous default.
console.log('\n[5] ambiguous ticker (EVT) — exchange prefix selects correct instrument:');
const qEVT = await call('quote_get', { symbol: 'XETR:EVT' });
const evtOk = /Evotec/.test(qEVT.description || '');
assert(evtOk && qEVT.close != null && qEVT.close < 10, `quote_get(XETR:EVT) -> ${qEVT.symbol} ${qEVT.description} close=${qEVT.close} (Evotec, not Eaton Vance fund)`);
const dEVT = await call('data_get_ohlcv', { symbol: 'XETR:EVT', count: 3 });
const evtBarsOk = (dEVT.bars || []).length > 0 && (dEVT.bars || []).every((b) => b.close < 10);
assert(evtBarsOk, `get_ohlcv(XETR:EVT) -> bars=${(dEVT.bars || []).length} lastClose=${(dEVT.bars || []).slice(-1)[0]?.close} (Evotec price range)`);

console.log(`\n=== ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} ===`);
await client.close();
proc.kill();
process.exit(failures === 0 ? 0 : 1);
