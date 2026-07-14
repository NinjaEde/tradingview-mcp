import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock the chart switch + wait so no live TradingView is needed.
// Keep getRelativeStrength's real logic; just record which symbols setSymbol saw.
const setSymbol = mock.fn(async ({ symbol }) => ({ chart_ready: true }));
const getOhlcv = mock.fn(async ({ symbol }) => ({
  bars: [
    { time: 1, open: 10, high: 11, low: 9, close: 10, volume: 100 },
    { time: 2, open: 10, high: 12, low: 9, close: 11, volume: 100 },
  ],
  symbol,
}));

mock.module('../src/core/chart.js', { namedExports: { setSymbol } });
mock.module('../src/wait.js', { namedExports: { waitForChartReady: mock.fn(async () => true) } });
mock.module('../src/core/data.js', { namedExports: { getOhlcv } });

const { getRelativeStrength } = await import('../src/core/stock.js');

test('getRelativeStrength switches chart to BOTH symbol and benchmark', async () => {
  setSymbol.mock.resetCalls();
  await getRelativeStrength({ symbol: 'BAS', benchmark: 'SIE' });
  const called = setSymbol.mock.calls.map(c => c.arguments[0].symbol);
  assert.ok(called.includes('BAS'), 'should switch to BAS');
  assert.ok(called.includes('SIE'), 'should switch to SIE');
  // Before the fix the chart stayed on whatever was open -> both reads same symbol.
  assert.equal(called.filter(s => s === 'BAS').length, 1);
});
