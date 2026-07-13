/**
 * Core Backtesting logic — advanced strategy analysis.
 */
import { evaluate, KNOWN_PATHS } from '../connection.js';

const CHART_API = KNOWN_PATHS.chartApi;

function findStrategy(chartWidget) {
  return `
    (function() {
      var chart = ${chartWidget || CHART_API}._chartWidget;
      var sources = chart.model().model().dataSources();
      var strat = null;
      for (var i = 0; i < sources.length; i++) {
        var s = sources[i];
        if (s.metaInfo && s.metaInfo().is_price_study === false) {
          strat = s;
          break;
        }
      }
      return strat;
    })()
  `;
}

function extractMetrics(obj, prefix = '') {
  if (!obj || typeof obj !== 'object') return {};
  const result = {};
  const keys = Object.keys(obj);
  for (let k = 0; k < keys.length; k++) {
    const val = obj[keys[k]];
    if (val !== null && val !== undefined && typeof val !== 'function' && typeof val !== 'object') {
      result[prefix + keys[k]] = val;
    }
  }
  return result;
}

export async function getSummary() {
  const data = await evaluate(`
    (function() {
      var strat = ${findStrategy()};
      if (!strat) return { error: 'No strategy found on chart. Add a strategy indicator first.' };
      
      var metrics = {};
      var reportData = null;
      var performance = null;
      
      if (strat.reportData) {
        reportData = typeof strat.reportData === 'function' ? strat.reportData() : strat.reportData;
        if (reportData && typeof reportData.value === 'function') reportData = reportData.value();
      }
      
      if (strat.performance) {
        performance = typeof strat.performance === 'function' ? strat.performance() : strat.performance;
        if (performance && typeof performance.value === 'function') performance = performance.value();
      }
      
      if (reportData) Object.assign(metrics, extractMetrics(reportData));
      if (performance) Object.assign(metrics, extractMetrics(performance));
      
      var equity = null;
      if (strat.equityData) {
        equity = typeof strat.equityData === 'function' ? strat.equityData() : strat.equityData;
        if (equity && typeof equity.value === 'function') equity = equity.value();
      }
      
      var trades = null;
      if (strat.ordersData) {
        trades = typeof strat.ordersData === 'function' ? strat.ordersData() : strat.ordersData;
        if (trades && typeof trades.value === 'function') trades = trades.value();
      }
      if (!trades && strat.tradesData) {
        trades = typeof strat.tradesData === 'function' ? strat.tradesData() : strat.tradesData;
        if (trades && typeof trades.value === 'function') trades = trades.value();
      }
      if (!trades && strat._orders) trades = strat._orders;
      
      return {
        metrics: metrics,
        trade_count: Array.isArray(trades) ? trades.length : 0,
        has_equity: Array.isArray(equity),
        source: 'internal_api'
      };
    })()
  `);
  
  if (data?.error) throw new Error(data.error);
  
  const metrics = data?.metrics || {};
  const tradeCount = data?.trade_count || 0;
  
  let sharpeRatio = null;
  let sortinoRatio = null;
  let maxDrawdown = null;
  let calmarRatio = null;
  
  if (metrics.NetProfit !== undefined && metrics.MaxDrawdown !== undefined && metrics.MaxDrawdown !== 0) {
    maxDrawdown = metrics.MaxDrawdown;
    calmarRatio = metrics.NetProfit / Math.abs(maxDrawdown);
  }
  
  if (metrics.SharpRatio !== undefined) sharpeRatio = metrics.SharpRatio;
  if (metrics.SortinoRatio !== undefined) sortinoRatio = metrics.SortinoRatio;
  
  const winRate = metrics.PercentProfitable !== undefined ? metrics.PercentProfitable : null;
  const profitFactor = metrics.ProfitFactor !== undefined ? metrics.ProfitFactor : null;
  const avgTrade = metrics.AverageTrade !== undefined ? metrics.AverageTrade : null;
  const totalTrades = metrics.TotalClosedTrades !== undefined ? metrics.TotalClosedTrades : tradeCount;
  
  return {
    success: true,
    source: data?.source,
    summary: {
      net_profit: metrics.NetProfit || metrics['Total Net Profit'] || null,
      gross_profit: metrics.GrossProfit || metrics['Gross Profit'] || null,
      gross_loss: metrics.GrossLoss || metrics['Gross Loss'] || null,
      profit_factor: profitFactor,
      total_trades: totalTrades,
      win_rate: winRate,
      avg_trade: avgTrade,
      max_drawdown: maxDrawdown,
      sharpe_ratio: sharpeRatio,
      sortino_ratio: sortinoRatio,
      calmar_ratio: calmarRatio,
      recovery_factor: metrics.RecoveryFactor || null,
      risk_reward_ratio: metrics.RiskRewardRatio || null,
      expectancy: metrics.Expectancy || null,
    },
    all_metrics: metrics,
  };
}

export async function getTradeAnalysis({ max_trades } = {}) {
  const limit = max_trades || 100;
  
  const data = await evaluate(`
    (function() {
      var strat = ${findStrategy()};
      if (!strat) return { error: 'No strategy found on chart.' };
      
      var orders = null;
      if (strat.ordersData) {
        orders = typeof strat.ordersData === 'function' ? strat.ordersData() : strat.ordersData;
        if (orders && typeof orders.value === 'function') orders = orders.value();
      }
      if (!orders && strat.tradesData) {
        orders = typeof strat.tradesData === 'function' ? strat.tradesData() : strat.tradesData;
        if (orders && typeof orders.value === 'function') orders = orders.value();
      }
      if (!orders && strat._orders) orders = strat._orders;
      
      if (!orders || !Array.isArray(orders)) {
        return { trades: [], error: orders ? 'Orders data is not an array' : 'No trade data available' };
      }
      
      var result = [];
      for (var t = 0; t < Math.min(orders.length, ${limit}); t++) {
        var o = orders[t];
        if (typeof o !== 'object' || o === null) continue;
        
        var trade = {};
        var keys = Object.keys(o);
        for (var k = 0; k < keys.length; k++) {
          var v = o[keys[k]];
          if (v !== null && v !== undefined && typeof v !== 'function' && typeof v !== 'object') {
            trade[keys[k]] = v;
          }
        }
        result.push(trade);
      }
      
      return { trades: result, count: result.length, source: 'internal_api' };
    })()
  `);
  
  if (data?.error) throw new Error(data.error);
  
  const trades = data?.trades || [];
  
  if (trades.length === 0) {
    return {
      success: true,
      trade_count: 0,
      trades: [],
      analysis: { message: 'No trades available for analysis' }
    };
  }
  
  const profits = [];
  const losses = [];
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentStreak = 0;
  let currentStreakType = null;
  
  for (const trade of trades) {
    const pnl = trade.profit !== undefined ? trade.profit : 
                trade.pnl !== undefined ? trade.pnl : 
                trade.PnL !== undefined ? trade.PnL : null;
    
    if (pnl !== null && pnl !== undefined) {
      if (pnl > 0) {
        profits.push(pnl);
        consecutiveWins++;
        consecutiveLosses = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, consecutiveWins);
        if (currentStreakType === 'loss') { currentStreak = 0; }
        currentStreak++;
        currentStreakType = 'win';
      } else if (pnl < 0) {
        losses.push(Math.abs(pnl));
        consecutiveLosses++;
        consecutiveWins = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
        if (currentStreakType === 'win') { currentStreak = 0; }
        currentStreak++;
        currentStreakType = 'loss';
      }
    }
  }
  
  const avgWin = profits.length > 0 ? profits.reduce((a, b) => a + b, 0) / profits.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const winRate = trades.length > 0 ? (profits.length / trades.length) * 100 : 0;
  const lossRate = trades.length > 0 ? (losses.length / trades.length) * 100 : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
  const expectancy = trades.length > 0 ? 
    (profits.reduce((a, b) => a + b, 0) - losses.reduce((a, b) => a + b, 0)) / trades.length : 0;
  
  return {
    success: true,
    trade_count: trades.length,
    trades: trades,
    analysis: {
      wins: profits.length,
      losses: losses.length,
      win_rate: Math.round(winRate * 100) / 100,
      loss_rate: Math.round(lossRate * 100) / 100,
      avg_win: Math.round(avgWin * 100) / 100,
      avg_loss: Math.round(avgLoss * 100) / 100,
      best_trade: profits.length > 0 ? Math.max(...profits) : null,
      worst_trade: losses.length > 0 ? -Math.min(...losses) : null,
      profit_factor: Math.round(profitFactor * 100) / 100,
      expectancy: Math.round(expectancy * 100) / 100,
      max_consecutive_wins: maxConsecutiveWins,
      max_consecutive_losses: maxConsecutiveLosses,
      largest_win_loss_ratio: avgLoss > 0 ? Math.round((Math.max(...profits) / Math.min(...losses)) * 100) / 100 : null,
    }
  };
}

export async function getEquityAnalysis() {
  const data = await evaluate(`
    (function() {
      var strat = ${findStrategy()};
      if (!strat) return { error: 'No strategy found on chart.' };
      
      var equityData = null;
      if (strat.equityData) {
        equityData = typeof strat.equityData === 'function' ? strat.equityData() : strat.equityData;
        if (equityData && typeof equityData.value === 'function') equityData = equityData.value();
      }
      
      var bars = null;
      if (strat.bars) {
        bars = typeof strat.bars === 'function' ? strat.bars() : strat.bars;
      }
      
      if (Array.isArray(equityData)) {
        return { data: equityData, source: 'equityData', count: equityData.length };
      }
      
      if (bars && typeof bars.lastIndex === 'function') {
        var result = [];
        var end = bars.lastIndex();
        var start = bars.firstIndex();
        for (var i = start; i <= end; i++) {
          var v = bars.valueAt(i);
          if (v) result.push({ time: v[0], equity: v[1], drawdown: v[2] || null });
        }
        return { data: result, source: 'bars', count: result.length };
      }
      
      return { data: [], error: 'No equity data available' };
    })()
  `);
  
  if (data?.error) throw new Error(data.error);
  
  const equity = data?.data || [];
  
  if (equity.length === 0) {
    return {
      success: true,
      data_points: 0,
      analysis: { message: 'No equity curve data available' }
    };
  }
  
  const equityValues = equity.map(e => e.equity).filter(v => v !== null && v !== undefined);
  const drawdowns = equity.map(e => e.drawdown).filter(v => v !== null && v !== undefined);
  
  const peak = Math.max(...equityValues);
  const trough = Math.min(...equityValues);
  const finalValue = equityValues[equityValues.length - 1];
  const maxDrawdown = peak - trough;
  const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0;
  
  const recoveryFactor = maxDrawdown > 0 ? (finalValue - trough) / maxDrawdown : null;
  
  let drawdownPeriods = [];
  let inDrawdown = false;
  let drawdownStart = null;
  let drawdownPeak = 0;
  
  for (let i = 0; i < equity.length; i++) {
    const current = equity[i].equity;
    if (current > drawdownPeak) {
      drawdownPeak = current;
    }
    const currentDrawdown = drawdownPeak - current;
    if (currentDrawdown > 0 && !inDrawdown) {
      inDrawdown = true;
      drawdownStart = equity[i].time;
    } else if (currentDrawdown === 0 && inDrawdown) {
      inDrawdown = false;
      drawdownPeriods.push({
        start: drawdownStart,
        end: equity[i].time,
        depth: Math.round((drawdownPeak - current) * 100) / 100
      });
    }
  }
  
  return {
    success: true,
    data_points: equity.length,
    source: data?.source,
    equity_curve: equity,
    analysis: {
      peak: peak,
      trough: trough,
      final_value: finalValue,
      total_return: Math.round((finalValue - equityValues[0]) * 100) / 100,
      total_return_pct: Math.round(((finalValue - equityValues[0]) / equityValues[0]) * 10000) / 100,
      max_drawdown: Math.round(maxDrawdown * 100) / 100,
      max_drawdown_pct: Math.round(maxDrawdownPct * 100) / 100,
      recovery_factor: recoveryFactor ? Math.round(recoveryFactor * 100) / 100 : null,
      drawdown_periods: drawdownPeriods.slice(-10),
      avg_drawdown: drawdowns.length > 0 ? Math.round((drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length) * 100) / 100 : null,
    }
  };
}

export async function runMonteCarlo({ simulations = 1000 } = {}) {
  const tradesData = await evaluate(`
    (function() {
      var strat = ${findStrategy()};
      if (!strat) return { error: 'No strategy found.' };
      
      var orders = null;
      if (strat.ordersData) {
        orders = typeof strat.ordersData === 'function' ? strat.ordersData() : strat.ordersData;
        if (orders && typeof orders.value === 'function') orders = orders.value();
      }
      if (!orders && strat.tradesData) {
        orders = typeof strat.tradesData === 'function' ? strat.tradesData() : strat.tradesData;
        if (orders && typeof orders.value === 'function') orders = orders.value();
      }
      if (!orders && strat._orders) orders = strat._orders;
      
      if (!orders || !Array.isArray(orders)) return { trades: [], error: 'No trade data' };
      
      var result = [];
      for (var t = 0; t < Math.min(orders.length, 500); t++) {
        var o = orders[t];
        if (typeof o !== 'object' || o === null) continue;
        var pnl = o.profit !== undefined ? o.profit : o.pnl !== undefined ? o.pnl : o.PnL;
        if (pnl !== undefined && pnl !== null) result.push(pnl);
      }
      return { trades: result };
    })()
  `);
  
  if (tradesData?.error) throw new Error(tradesData.error);
  
  const trades = tradesData?.trades || [];
  if (trades.length < 2) {
    return {
      success: true,
      simulations: 0,
      analysis: { message: 'Need at least 2 trades for Monte Carlo simulation' }
    };
  }
  
  const sims = Math.min(simulations, 10000);
  const results = [];
  
  for (let s = 0; s < sims; s++) {
    let equity = 100000;
    const shuffled = [...trades].sort(() => Math.random() - 0.5);
    for (const trade of shuffled) {
      equity += trade;
    }
    results.push(equity);
  }
  
  results.sort((a, b) => a - b);
  
  const percentile5 = results[Math.floor(sims * 0.05)];
  const percentile25 = results[Math.floor(sims * 0.25)];
  const percentile50 = results[Math.floor(sims * 0.5)];
  const percentile75 = results[Math.floor(sims * 0.75)];
  const percentile95 = results[Math.floor(sims * 0.95)];
  
  const avgFinal = results.reduce((a, b) => a + b, 0) / sims;
  const variance = results.reduce((a, b) => a + Math.pow(b - avgFinal, 2), 0) / sims;
  const stdDev = Math.sqrt(variance);
  
  let drawdowns = [];
  for (let s = 0; s < sims; s++) {
    let peak = 100000;
    let maxDD = 0;
    const shuffled = [...trades].sort(() => Math.random() - 0.5);
    let equity = 100000;
    for (const trade of shuffled) {
      equity += trade;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDD) maxDD = dd;
    }
    drawdowns.push(maxDD);
  }
  drawdowns.sort((a, b) => a - b);
  
  const maxDD5th = drawdowns[Math.floor(sims * 0.05)];
  const maxDDMedian = drawdowns[Math.floor(sims * 0.5)];
  const maxDD95th = drawdowns[Math.floor(sims * 0.95)];
  
  return {
    success: true,
    simulations: sims,
    starting_capital: 100000,
    analysis: {
      final_equity: {
        percentile_5: Math.round(percentile5),
        percentile_25: Math.round(percentile25),
        percentile_50: Math.round(percentile50),
        percentile_75: Math.round(percentile75),
        percentile_95: Math.round(percentile95),
        mean: Math.round(avgFinal),
        std_dev: Math.round(stdDev),
      },
      max_drawdown: {
        percentile_5: Math.round(maxDD5th),
        percentile_50: Math.round(maxDDMedian),
        percentile_95: Math.round(maxDD95th),
      },
      probability_of_ruin: results.filter(r => r <= 0).length / sims * 100,
      risk_reward_projection: {
        worst_case_5pct: Math.round((percentile5 - 100000) * 100) / 100,
        best_case_95pct: Math.round((percentile95 - 100000) * 100) / 100,
        expected_return: Math.round((avgFinal - 100000) * 100) / 100,
      }
    }
  };
}

export async function exportTrades({ format = 'json', max_trades } = {}) {
  const data = await evaluate(`
    (function() {
      var strat = ${findStrategy()};
      if (!strat) return { error: 'No strategy found.' };
      
      var orders = null;
      if (strat.ordersData) {
        orders = typeof strat.ordersData === 'function' ? strat.ordersData() : strat.ordersData;
        if (orders && typeof orders.value === 'function') orders = orders.value();
      }
      if (!orders && strat.tradesData) {
        orders = typeof strat.tradesData === 'function' ? strat.tradesData() : strat.tradesData;
        if (orders && typeof orders.value === 'function') orders = orders.value();
      }
      if (!orders && strat._orders) orders = strat._orders;
      
      if (!orders || !Array.isArray(orders)) return { trades: [], error: 'No trade data' };
      
      var result = [];
      for (var t = 0; t < orders.length; t++) {
        var o = orders[t];
        if (typeof o !== 'object' || o === null) continue;
        var trade = {};
        var keys = Object.keys(o);
        for (var k = 0; k < keys.length; k++) {
          var v = o[keys[k]];
          if (v !== null && v !== undefined && typeof v !== 'function' && typeof v !== 'object') {
            trade[keys[k]] = v;
          }
        }
        result.push(trade);
      }
      return { trades: result };
    })()
  `);
  
  if (data?.error) throw new Error(data.error);
  
  const trades = data?.trades || [];
  const limited = max_trades ? trades.slice(0, max_trades) : trades;
  
  if (format === 'csv') {
    if (limited.length === 0) {
      return { success: true, format: 'csv', content: '', trade_count: 0 };
    }
    const headers = Object.keys(limited[0]);
    const csv = [
      headers.join(','),
      ...limited.map(t => headers.map(h => {
        const val = t[h];
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      }).join(','))
    ].join('\n');
    return { success: true, format: 'csv', content: csv, trade_count: limited.length };
  }
  
  return {
    success: true,
    format: 'json',
    trades: limited,
    trade_count: limited.length,
    total_trades: trades.length
  };
}

export async function getStrategyInputs() {
  const data = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var studies = chart.getAllStudies();
      var inputs = {};
      for (var i = 0; i < studies.length; i++) {
        var s = studies[i];
        if (s.metaInfo && s.metaInfo().is_price_study === false) {
          var studyInputs = null;
          try {
            studyInputs = s.getInputValues ? s.getInputValues() : null;
          } catch(e) {}
          inputs = { id: s.id, name: s.name || s.metaInfo().name || 'Strategy', inputs: studyInputs };
          break;
        }
      }
      if (!inputs.id) return { error: 'No strategy found on chart' };
      return inputs;
    })()
  `);
  
  if (data?.error) throw new Error(data.error);
  
  return {
    success: true,
    strategy_id: data?.id,
    strategy_name: data?.name,
    inputs: data?.inputs || []
  };
}

export async function optimizeStrategy({ input_name, values, _deps }) {
  if (!input_name || !values || !Array.isArray(values)) {
    throw new Error('input_name and values (array) are required');
  }
  
  const { evaluate, getClient } = _deps?.evaluate ? _deps : await import('../connection.js');
  
  const results = [];
  
  for (const value of values) {
    const paramStr = JSON.stringify({ [input_name]: value });
    
    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        var studies = chart.getAllStudies();
        for (var i = 0; i < studies.length; i++) {
          var s = studies[i];
          if (s.metaInfo && s.metaInfo().is_price_study === false) {
            if (s.setInputValue) {
              s.setInputValue(${JSON.stringify(input_name)}, ${JSON.stringify(value)});
            }
            break;
          }
        }
      })()
    `);
    
    await new Promise(r => setTimeout(r, 3000));
    
    const equity = await evaluate(`
      (function() {
        var strat = ${findStrategy()};
        if (!strat) return null;
        if (strat.reportData) {
          var rd = typeof strat.reportData === 'function' ? strat.reportData() : strat.reportData;
          if (rd && typeof rd.value === 'function') rd = rd.value();
          if (rd && rd.NetProfit !== undefined) return rd.NetProfit;
          if (rd && rd['Total Net Profit'] !== undefined) return rd['Total Net Profit'];
        }
        return null;
      })()
    `);
    
    results.push({
      [input_name]: value,
      net_profit: equity,
    });
  }
  
  const best = results.reduce((a, b) => 
    (a.net_profit || 0) > (b.net_profit || 0) ? a : b
  );
  
  return {
    success: true,
    parameter: input_name,
    results: results,
    best: best,
    best_value: best[input_name],
    best_net_profit: best.net_profit
  };
}
