import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pearsonCorrelation,
  spearmanCorrelation,
  computeReturns,
  computeRelativeStrength,
  computeCorrelationMatrix,
  computeBatchTechnicals,
} from '../src/core/stock.js';

// ---- Pearson / Spearman (existing) -------------------------------------
describe('Pearson Correlation', () => {
  it('perfect positive', () => {
    const corr = pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    assert.ok(Math.abs(corr - 1) < 0.0001);
  });
  it('perfect negative', () => {
    const corr = pearsonCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
    assert.ok(Math.abs(corr + 1) < 0.0001);
  });
  it('null for < 2 points', () => {
    assert.equal(pearsonCorrelation([1], [2]), null);
  });
});

describe('Spearman Correlation', () => {
  it('perfect rank negative', () => {
    const corr = spearmanCorrelation([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]);
    assert.ok(Math.abs(corr + 1) < 0.0001);
  });
  it('null for < 3 points', () => {
    assert.equal(spearmanCorrelation([1, 2], [3, 4]), null);
  });
});

// ---- Returns ------------------------------------------------------------
describe('computeReturns', () => {
  it('computes simple per-bar returns', () => {
    const r = computeReturns([100, 110, 121]);
    assert.equal(r.length, 2);
    assert.ok(Math.abs(r[0] - 0.10) < 1e-9);
    assert.ok(Math.abs(r[1] - 0.10) < 1e-9);
  });
});

// ---- Relative Strength (Bug 5) -----------------------------------------
describe('computeRelativeStrength', () => {
  it('positive RS when symbol beats benchmark', () => {
    const rs = computeRelativeStrength([100, 110, 120], [100, 102, 104]);
    assert.ok(rs.score > 0);
    assert.equal(rs.level, 'very_strong'); // 20% - 4% = 16
    assert.ok(Math.abs(rs.score - 16) < 0.1);
  });
  it('negative RS when symbol lags', () => {
    const rs = computeRelativeStrength([100, 95, 90], [100, 102, 104]);
    assert.ok(rs.score < 0);
  });
  it('null on insufficient data', () => {
    assert.equal(computeRelativeStrength([100], [100, 101]), null);
  });
});

// ---- Correlation Matrix (Bug 1: must use REAL returns, not random) -----
describe('computeCorrelationMatrix (no simulated data)', () => {
  it('two perfectly correlated series -> ~1', () => {
    const m = computeCorrelationMatrix({ A: [1, 2, 3, 4, 5], B: [2, 4, 6, 8, 10] });
    assert.equal(m.length, 1);
    assert.ok(Math.abs(m[0].correlation - 1) < 0.0001);
  });
  it('two inversely correlated series -> ~-1', () => {
    // Prices whose returns are exact mirrors: A returns [0.1,0.2,0.3], B returns [-0.1,-0.2,-0.3].
    const m = computeCorrelationMatrix({ A: [100, 110, 132, 171.6], B: [100, 90, 72, 50.4] });
    assert.ok(Math.abs(m[0].correlation + 1) < 0.0001);
  });
  it('produces strength + direction labels', () => {
    const m = computeCorrelationMatrix({ A: [1, 2, 3, 4, 5], B: [2, 4, 6, 8, 10] });
    assert.equal(m[0].strength, 'strong');
    assert.equal(m[0].direction, 'positive');
  });
  it('deterministic (running twice yields identical result — no Math.random)', () => {
    const input = { A: [1, 2, 3, 4, 5], B: [5, 1, 4, 2, 3] };
    const m1 = computeCorrelationMatrix(input);
    const m2 = computeCorrelationMatrix(input);
    assert.equal(m1[0].correlation, m2[0].correlation);
  });
});

// ---- Batch Technicals (Bug 3) ------------------------------------------
describe('computeBatchTechnicals', () => {
  it('computes SMA20/50, BB, ATR, trend, momentum from real arrays', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i); // steady uptrend
    const highs = closes.map(c => c + 1);
    const lows = closes.map(c => c - 1);
    const volumes = closes.map(() => 1000);
    const t = computeBatchTechnicals('TEST', closes, highs, lows, volumes);
    assert.equal(t.trend, 'bullish');
    assert.ok(t.sma20 > 0 && t.sma50 > 0);
    assert.ok(t.atr14 > 0);
    assert.equal(t.bollinger_bands.position, 'within_bands');
    assert.ok(t.momentum_pct_10d > 0);
  });
  it('errors on insufficient data instead of echoing fake values', () => {
    const t = computeBatchTechnicals('TEST', [1, 2], [1, 2], [1, 2], [1, 1]);
    assert.ok(t.error);
  });
});
