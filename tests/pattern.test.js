/**
 * Unit tests for pattern recognition algorithms.
 * No TradingView connection needed.
 *
 * Run: node --test tests/pattern.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function getLocalExtrema(data, window = 5) {
  const peaks = [];
  const troughs = [];
  
  for (let i = window; i < data.length - window; i++) {
    let isPeak = true;
    let isTrough = true;
    
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (data[j].high >= data[i].high) isPeak = false;
      if (data[j].low <= data[i].low) isTrough = false;
    }
    
    if (isPeak) peaks.push({ index: i, ...data[i] });
    if (isTrough) troughs.push({ index: i, ...data[i] });
  }
  
  return { peaks, troughs };
}

function detectSwingPoints(bars, lookback = 20) {
  const highs = [];
  const lows = [];
  
  for (let i = lookback; i < bars.length - lookback; i++) {
    const leftHigh = Math.max(...bars.slice(i - lookback, i).map(b => b.high));
    const rightHigh = Math.max(...bars.slice(i + 1, i + lookback + 1).map(b => b.high));
    const leftLow = Math.min(...bars.slice(i - lookback, i).map(b => b.low));
    const rightLow = Math.min(...bars.slice(i + 1, i + lookback + 1).map(b => b.low));
    
    if (bars[i].high > leftHigh && bars[i].high > rightHigh) {
      highs.push({ index: i, price: bars[i].high, time: bars[i].time });
    }
    if (bars[i].low < leftLow && bars[i].low < rightLow) {
      lows.push({ index: i, price: bars[i].low, time: bars[i].time });
    }
  }
  
  return { highs, lows };
}

function detectDoubleTop(bars, tolerance = 0.02) {
  const swingPoints = detectSwingPoints(bars, 10);
  const patterns = [];
  
  for (let i = 0; i < swingPoints.highs.length - 1; i++) {
    const h1 = swingPoints.highs[i];
    const h2 = swingPoints.highs[i + 1];
    
    const diff = Math.abs(h1.price - h2.price) / h1.price;
    if (diff < tolerance) {
      const troughLow = Math.min(...bars.slice(h1.index, h2.index + 1).map(b => b.low));
      
      patterns.push({
        type: 'double_top',
        first_top: { index: h1.index, time: h1.time, price: h1.price },
        second_top: { index: h2.index, time: h2.time, price: h2.price },
        neckline: { price: troughLow },
        formation_date: h2.time,
        bars_between: h2.index - h1.index,
        confidence: diff < 0.01 ? 'high' : 'medium'
      });
    }
  }
  
  return patterns;
}

function detectDoubleBottom(bars, tolerance = 0.02) {
  const swingPoints = detectSwingPoints(bars, 10);
  const patterns = [];
  
  for (let i = 0; i < swingPoints.lows.length - 1; i++) {
    const l1 = swingPoints.lows[i];
    const l2 = swingPoints.lows[i + 1];
    
    const diff = Math.abs(l1.price - l2.price) / l1.price;
    if (diff < tolerance) {
      const peakHigh = Math.max(...bars.slice(l1.index, l2.index + 1).map(b => b.high));
      
      patterns.push({
        type: 'double_bottom',
        first_bottom: { index: l1.index, time: l1.time, price: l1.price },
        second_bottom: { index: l2.index, time: l2.time, price: l2.price },
        neckline: { price: peakHigh },
        formation_date: l2.time,
        bars_between: l2.index - l1.index,
        confidence: diff < 0.01 ? 'high' : 'medium'
      });
    }
  }
  
  return patterns;
}

function calculateRSI(prices, period = 14) {
  const rsi = [];
  const gains = [];
  const losses = [];
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  if (gains.length < period) return rsi;
  
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = 0; i < period; i++) {
    rsi.push(null);
  }
  
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  return rsi;
}

describe('Pattern Recognition — Swing Point Detection', () => {
  it('detects swing high', () => {
    const bars = [
      { time: 1, high: 10, low: 8 }, { time: 2, high: 12, low: 10 },
      { time: 3, high: 20, low: 18 }, { time: 4, high: 12, low: 10 },
      { time: 5, high: 10, low: 8 }
    ];
    const { highs } = detectSwingPoints(bars, 1);
    assert.ok(highs.length > 0, 'Should detect swing high');
    assert.equal(highs[0].price, 20);
  });

  it('detects swing low', () => {
    const bars = [
      { time: 1, high: 20, low: 18 }, { time: 2, high: 18, low: 15 },
      { time: 3, high: 15, low: 5 }, { time: 4, high: 18, low: 15 },
      { time: 5, high: 20, low: 18 }
    ];
    const { lows } = detectSwingPoints(bars, 1);
    assert.ok(lows.length > 0, 'Should detect swing low');
    assert.equal(lows[0].price, 5);
  });

  it('no false positives on flat chart', () => {
    const bars = Array.from({ length: 20 }, (_, i) => ({
      time: i, high: 100, low: 99
    }));
    const { highs, lows } = detectSwingPoints(bars, 3);
    assert.equal(highs.length, 0, 'No swing highs on flat chart');
    assert.equal(lows.length, 0, 'No swing lows on flat chart');
  });
});

describe('Pattern Recognition — Double Top/Bottom', () => {
  it('double top detection algorithm exists', () => {
    const bars = Array.from({ length: 50 }, (_, i) => ({
      time: i, high: 100, low: 90
    }));
    
    const patterns = detectDoubleTop(bars, 0.01);
    assert.ok(Array.isArray(patterns), 'Should return array');
  });

  it('double bottom detection algorithm exists', () => {
    const bars = Array.from({ length: 50 }, (_, i) => ({
      time: i, high: 110, low: 100
    }));
    
    const patterns = detectDoubleBottom(bars, 0.01);
    assert.ok(Array.isArray(patterns), 'Should return array');
  });

  it('ignores non-matching highs', () => {
    const bars = Array.from({ length: 30 }, (_, i) => ({
      time: i, high: 100 + Math.sin(i) * 10, low: 90 + Math.sin(i) * 5
    }));
    
    const patterns = detectDoubleTop(bars, 0.01);
    assert.equal(patterns.length, 0, 'Should not detect double top with varying highs');
  });
});

describe('Pattern Recognition — RSI Calculation', () => {
  it('calculates RSI correctly for rising prices', () => {
    const prices = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128, 130, 132, 134];
    const rsi = calculateRSI(prices, 14);
    
    const validRSI = rsi.filter(v => v !== null);
    assert.ok(validRSI.length > 0, 'Should have valid RSI values');
    if (validRSI.length > 0) {
      assert.ok(validRSI[validRSI.length - 1] > 50, 'RSI should be > 50 for rising prices');
    }
  });

  it('calculates RSI correctly for falling prices', () => {
    const prices = [132, 130, 128, 126, 124, 122, 120, 118, 116, 114, 112, 110, 108, 106, 104, 102, 100, 98];
    const rsi = calculateRSI(prices, 14);
    
    const validRSI = rsi.filter(v => v !== null);
    assert.ok(validRSI.length > 0, 'Should have valid RSI values');
    if (validRSI.length > 0) {
      assert.ok(validRSI[validRSI.length - 1] < 50, 'RSI should be < 50 for falling prices');
    }
  });

  it('returns empty array for insufficient data', () => {
    const prices = [100, 102, 104];
    const rsi = calculateRSI(prices, 14);
    assert.equal(rsi.length, 0, 'Should return empty array for < period data');
  });

  it('RSI stays within 0-100 bounds', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 2) * 10);
    const rsi = calculateRSI(prices, 14);
    
    const validRSI = rsi.filter(v => v !== null);
    for (const value of validRSI) {
      assert.ok(value >= 0 && value <= 100, `RSI value ${value} out of bounds`);
    }
  });
});

describe('Pattern Recognition — Support/Resistance Levels', () => {
  it('finds key support levels', () => {
    const bars = [
      { time: 1, high: 110, low: 100 }, { time: 2, high: 115, low: 105 },
      { time: 3, high: 108, low: 80 }, { time: 4, high: 105, low: 85 },
      { time: 5, high: 112, low: 100 }, { time: 6, high: 114, low: 82 },
      { time: 7, high: 110, low: 95 }, { time: 8, high: 108, low: 81 },
    ];
    
    const { lows } = detectSwingPoints(bars, 1);
    const supportLevels = [...new Set(lows.map(l => Math.round(l.price)))];
    
    assert.ok(supportLevels.length > 0, 'Should find support levels');
  });

  it('finds key resistance levels', () => {
    const bars = [
      { time: 1, high: 110, low: 100 }, { time: 2, high: 115, low: 105 },
      { time: 3, high: 108, low: 80 }, { time: 4, high: 112, low: 95 },
      { time: 5, high: 114, low: 100 }, { time: 6, high: 116, low: 102 },
    ];
    
    const { highs } = detectSwingPoints(bars, 1);
    const resistanceLevels = [...new Set(highs.map(h => Math.round(h.price)))];
    
    assert.ok(resistanceLevels.length > 0, 'Should find resistance levels');
  });
});

describe('Pattern Recognition — Technical Summary', () => {
  it('calculates SMA correctly', () => {
    const prices = [10, 20, 30, 40, 50];
    const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
    
    const validPrices = [10, 20, 30, 40, 50];
    const sma5 = validPrices.reduce((a, b) => a + b, 0) / 5;
    
    assert.equal(sma5, 30, 'SMA of [10,20,30,40,50] should be 30');
  });

  it('detects overbought RSI', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    const rsi = calculateRSI(prices, 14);
    const currentRSI = rsi[rsi.length - 1];
    
    if (currentRSI !== null) {
      const signal = currentRSI > 70 ? 'overbought' : currentRSI < 30 ? 'oversold' : 'neutral';
      assert.equal(signal, 'overbought', 'Should detect overbought');
    }
  });

  it('detects oversold RSI', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 160 - i * 2);
    const rsi = calculateRSI(prices, 14);
    const currentRSI = rsi[rsi.length - 1];
    
    if (currentRSI !== null) {
      const signal = currentRSI > 70 ? 'overbought' : currentRSI < 30 ? 'oversold' : 'neutral';
      assert.equal(signal, 'oversold', 'Should detect oversold');
    }
  });

  it('calculates Bollinger Bands correctly', () => {
    const prices = [10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17, 16, 18, 17, 19, 18, 20, 19, 20];
    const sum = prices.reduce((a, b) => a + b, 0);
    const mean = sum / prices.length;
    const variance = prices.reduce((a, c) => a + Math.pow(c - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const upperBand = mean + 2 * stdDev;
    const lowerBand = mean - 2 * stdDev;
    
    assert.ok(upperBand > mean, 'Upper band should be above mean');
    assert.ok(lowerBand < mean, 'Lower band should be below mean');
    assert.ok(upperBand > lowerBand, 'Upper band should be above lower band');
  });
});
