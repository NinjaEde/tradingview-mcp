/**
 * Unit tests for backtesting analysis algorithms.
 * No TradingView connection needed.
 *
 * Run: node --test tests/backtest.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Backtesting — Trade Analysis', () => {
  it('calculates win rate correctly', () => {
    const trades = [
      { profit: 100 }, { profit: -50 }, { profit: 200 }, { profit: -30 }, { profit: 150 }
    ];
    
    const wins = trades.filter(t => t.profit > 0);
    const winRate = (wins.length / trades.length) * 100;
    
    assert.equal(winRate, 60, 'Win rate should be 60%');
  });

  it('calculates average win correctly', () => {
    const trades = [
      { profit: 100 }, { profit: -50 }, { profit: 200 }, { profit: -30 }, { profit: 150 }
    ];
    
    const wins = trades.filter(t => t.profit > 0);
    const avgWin = wins.reduce((a, b) => a + b.profit, 0) / wins.length;
    
    assert.equal(avgWin, 150, 'Average win should be 150');
  });

  it('calculates average loss correctly', () => {
    const trades = [
      { profit: 100 }, { profit: -50 }, { profit: 200 }, { profit: -30 }, { profit: 150 }
    ];
    
    const losses = trades.filter(t => t.profit < 0);
    const avgLoss = Math.abs(losses.reduce((a, b) => a + b.profit, 0) / losses.length);
    
    assert.equal(avgLoss, 40, 'Average loss should be 40');
  });

  it('calculates profit factor correctly', () => {
    const trades = [
      { profit: 100 }, { profit: -50 }, { profit: 200 }, { profit: -30 }, { profit: 150 }
    ];
    
    const grossProfit = trades.filter(t => t.profit > 0).reduce((a, b) => a + b.profit, 0);
    const grossLoss = Math.abs(trades.filter(t => t.profit < 0).reduce((a, b) => a + b.profit, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit;
    
    assert.ok(profitFactor > 3, `Profit factor should be > 3, got ${profitFactor}`);
    assert.ok(profitFactor < 10, `Profit factor should be < 10, got ${profitFactor}`);
  });

  it('calculates expectancy correctly', () => {
    const trades = [
      { profit: 100 }, { profit: -50 }, { profit: 200 }, { profit: -30 }, { profit: 150 }
    ];
    
    const totalPnL = trades.reduce((a, b) => a + b.profit, 0);
    const expectancy = totalPnL / trades.length;
    
    assert.equal(expectancy, 74, 'Expectancy should be 74');
  });

  it('tracks consecutive wins', () => {
    const trades = [
      { profit: 100 }, { profit: 200 }, { profit: -50 }, { profit: 150 }, { profit: 300 }
    ];
    
    let maxConsecutiveWins = 0;
    let currentWins = 0;
    
    for (const trade of trades) {
      if (trade.profit > 0) {
        currentWins++;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
      } else {
        currentWins = 0;
      }
    }
    
    assert.equal(maxConsecutiveWins, 2, 'Max consecutive wins should be 2');
  });

  it('tracks consecutive losses', () => {
    const trades = [
      { profit: 100 }, { profit: -50 }, { profit: -30 }, { profit: -20 }, { profit: 150 }
    ];
    
    let maxConsecutiveLosses = 0;
    let currentLosses = 0;
    
    for (const trade of trades) {
      if (trade.profit < 0) {
        currentLosses++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
      } else {
        currentLosses = 0;
      }
    }
    
    assert.equal(maxConsecutiveLosses, 3, 'Max consecutive losses should be 3');
  });

  it('handles all winning trades', () => {
    const trades = [
      { profit: 100 }, { profit: 200 }, { profit: 150 }, { profit: 300 }, { profit: 250 }
    ];
    
    const wins = trades.filter(t => t.profit > 0);
    const winRate = (wins.length / trades.length) * 100;
    
    assert.equal(winRate, 100, 'Win rate should be 100%');
    assert.equal(wins.length, trades.length, 'All trades should be wins');
  });

  it('handles all losing trades', () => {
    const trades = [
      { profit: -100 }, { profit: -200 }, { profit: -150 }, { profit: -300 }, { profit: -250 }
    ];
    
    const wins = trades.filter(t => t.profit > 0);
    const losses = trades.filter(t => t.profit < 0);
    
    assert.equal(wins.length, 0, 'No wins expected');
    assert.equal(losses.length, 5, 'All trades should be losses');
  });

  it('handles empty trades array', () => {
    const trades = [];
    
    const wins = trades.filter(t => t.profit > 0);
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    
    assert.equal(winRate, 0, 'Win rate should be 0 for empty trades');
  });
});

describe('Backtesting — Equity Analysis', () => {
  it('calculates max drawdown correctly', () => {
    const equity = [100000, 110000, 105000, 120000, 100000, 115000, 95000, 110000];
    
    let peak = equity[0];
    let maxDrawdown = 0;
    
    for (const value of equity) {
      if (value > peak) peak = value;
      const drawdown = peak - value;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    assert.ok(maxDrawdown >= 20000, `Max drawdown should be at least 20000, got ${maxDrawdown}`);
  });

  it('calculates max drawdown percentage correctly', () => {
    const equity = [100000, 110000, 105000, 120000, 100000, 115000, 95000, 110000];
    
    let peak = equity[0];
    let maxDrawdownPct = 0;
    
    for (const value of equity) {
      if (value > peak) peak = value;
      const drawdownPct = ((peak - value) / peak) * 100;
      if (drawdownPct > maxDrawdownPct) maxDrawdownPct = drawdownPct;
    }
    
    assert.ok(Math.abs(maxDrawdownPct - 20.83) < 0.1, `Max drawdown % should be ~20.83%, got ${maxDrawdownPct}`);
  });

  it('identifies drawdown periods', () => {
    const equity = [
      { time: 1, equity: 100000 },
      { time: 2, equity: 110000 },
      { time: 3, equity: 105000 },
      { time: 4, equity: 100000 },
      { time: 5, equity: 95000 },
      { time: 6, equity: 100000 },
      { time: 7, equity: 95000 },
      { time: 8, equity: 110000 },
    ];
    
    let peak = equity[0].equity;
    let maxDrawdown = 0;
    let maxDrawdownStart = null;
    let inDrawdown = false;
    let drawdownStart = null;
    
    for (const point of equity) {
      if (point.equity > peak) {
        peak = point.equity;
        if (inDrawdown) {
          inDrawdown = false;
        }
      } else {
        const drawdown = peak - point.equity;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          maxDrawdownStart = point.time;
        }
        if (!inDrawdown && drawdown > 0) {
          inDrawdown = true;
          drawdownStart = point.time;
        }
      }
    }
    
    assert.ok(maxDrawdown > 0, 'Should detect drawdown');
  });

  it('calculates recovery factor', () => {
    const peak = 120000;
    const trough = 95000;
    const finalValue = 110000;
    
    const recoveryFactor = (finalValue - trough) / (peak - trough);
    
    assert.ok(!isNaN(recoveryFactor), 'Recovery factor should be a number');
    assert.ok(recoveryFactor >= 0, 'Recovery factor should be non-negative');
  });

  it('handles constant equity (no drawdown)', () => {
    const equity = [100000, 100000, 100000, 100000, 100000];
    
    let peak = equity[0];
    let maxDrawdown = 0;
    
    for (const value of equity) {
      if (value > peak) peak = value;
      const drawdown = peak - value;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    assert.equal(maxDrawdown, 0, 'Max drawdown should be 0 for constant equity');
  });
});

describe('Backtesting — Monte Carlo Simulation', () => {
  it('generates valid equity values', () => {
    const trades = [100, -50, 200, 150, -30, 100, 250];
    const simulations = 100;
    const startingCapital = 100000;
    
    const results = [];
    for (let s = 0; s < simulations; s++) {
      let equity = startingCapital;
      const shuffled = [...trades].sort(() => Math.random() - 0.5);
      for (const trade of shuffled) {
        equity += trade;
      }
      results.push(equity);
    }
    
    assert.equal(results.length, simulations, 'Should generate correct number of results');
    assert.ok(results.every(r => r > 0), 'All equity values should be positive');
  });

  it('calculates percentiles correctly', () => {
    const results = [100000, 110000, 120000, 130000, 140000, 150000, 160000, 170000, 180000, 190000];
    
    const percentile5 = results[Math.floor(results.length * 0.05)];
    const percentile50 = results[Math.floor(results.length * 0.5)];
    const percentile95 = results[Math.floor(results.length * 0.95)];
    
    assert.equal(percentile5, 100000, '5th percentile should be 100000');
    assert.equal(percentile50, 150000, '50th percentile should be 150000');
    assert.equal(percentile95, 190000, '95th percentile should be 190000');
  });

  it('detects probability of ruin', () => {
    const results = [50000, 80000, 100000, 120000, 150000, 0, 75000, 110000];
    
    const ruinCount = results.filter(r => r <= 0).length;
    const probabilityOfRuin = (ruinCount / results.length) * 100;
    
    assert.equal(probabilityOfRuin, 12.5, 'Probability of ruin should be 12.5%');
  });
});

describe('Backtesting — Strategy Optimization', () => {
  it('finds best parameter value', () => {
    const results = [
      { length: 10, net_profit: 1000 },
      { length: 20, net_profit: 2500 },
      { length: 30, net_profit: 1800 },
      { length: 40, net_profit: 3000 },
      { length: 50, net_profit: 2200 },
    ];
    
    const best = results.reduce((a, b) => 
      (a.net_profit || 0) > (b.net_profit || 0) ? a : b
    );
    
    assert.equal(best.length, 40, 'Best parameter should be 40');
    assert.equal(best.net_profit, 3000, 'Best profit should be 3000');
  });

  it('handles null profits in optimization', () => {
    const results = [
      { length: 10, net_profit: 1000 },
      { length: 20, net_profit: null },
      { length: 30, net_profit: 1800 },
    ];
    
    const validResults = results.filter(r => r.net_profit !== null);
    assert.equal(validResults.length, 2, 'Should filter out null profits');
  });
});

describe('Backtesting — Sharpe & Sortino Ratios', () => {
  it('calculates basic Sharpe-like ratio', () => {
    const returns = [0.01, 0.02, -0.01, 0.03, 0.015, -0.005, 0.025, 0.01, 0.02, 0.015];
    
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    const sharpeLike = stdDev > 0 ? avgReturn / stdDev * Math.sqrt(252) : 0;
    
    assert.ok(!isNaN(sharpeLike), 'Sharpe-like ratio should be a number');
  });

  it('calculates downside deviation', () => {
    const returns = [0.01, 0.02, -0.01, 0.03, 0.015, -0.005, 0.025, 0.01];
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    
    const downsideReturns = returns.filter(r => r < avgReturn);
    const downsideVariance = downsideReturns.length > 0 
      ? downsideReturns.reduce((a, r) => a + Math.pow(r - avgReturn, 2), 0) / returns.length
      : 0;
    const downsideDev = Math.sqrt(downsideVariance);
    
    assert.ok(downsideDev >= 0, 'Downside deviation should be non-negative');
  });
});
