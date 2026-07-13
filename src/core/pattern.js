/**
 * Core Pattern Recognition logic for chart analysis.
 */
import { evaluate, KNOWN_PATHS } from '../connection.js';

const CHART_API = KNOWN_PATHS.chartApi;
const BARS_PATH = KNOWN_PATHS.mainSeriesBars;

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
      const midpoint = Math.floor((h1.index + h2.index) / 2);
      const troughLow = Math.min(...bars.slice(h1.index, h2.index + 1).map(b => b.low));
      
      patterns.push({
        type: 'double_top',
        first_top: { index: h1.index, time: h1.time, price: h1.price },
        second_top: { index: h2.index, time: h2.time, price: h2.price },
        neckline: { price: troughLow, index: bars.slice(h1.index, h2.index + 1).findIndex(b => b.low === troughLow) + h1.index },
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
      const midpoint = Math.floor((l1.index + l2.index) / 2);
      const peakHigh = Math.max(...bars.slice(l1.index, l2.index + 1).map(b => b.high));
      
      patterns.push({
        type: 'double_bottom',
        first_bottom: { index: l1.index, time: l1.time, price: l1.price },
        second_bottom: { index: l2.index, time: l2.time, price: l2.price },
        neckline: { price: peakHigh, index: bars.slice(l1.index, l2.index + 1).findIndex(b => b.high === peakHigh) + l1.index },
        formation_date: l2.time,
        bars_between: l2.index - l1.index,
        confidence: diff < 0.01 ? 'high' : 'medium'
      });
    }
  }
  
  return patterns;
}

function detectHeadAndShoulders(bars) {
  const swingPoints = detectSwingPoints(bars, 8);
  const patterns = [];
  
  for (let i = 0; i < swingPoints.highs.length - 4; i++) {
    const leftShoulder = swingPoints.highs[i];
    const head = swingPoints.highs[i + 1];
    const rightShoulder = swingPoints.highs[i + 2];
    const nextHigh = swingPoints.highs[i + 3];
    
    if (nextHigh) {
      const neckline = Math.min(leftShoulder.price, rightShoulder.price);
      const headHeight = head.price - neckline;
      const leftShoulderDiff = Math.abs(head.price - leftShoulder.price);
      const rightShoulderDiff = Math.abs(head.price - rightShoulder.price);
      
      if (leftShoulderDiff < headHeight * 0.3 && rightShoulderDiff < headHeight * 0.3) {
        const necklineLows = bars.slice(leftShoulder.index, rightShoulder.index + 1).map(b => b.low);
        const actualNeckline = Math.min(...necklineLows);
        
        patterns.push({
          type: 'head_and_shoulders',
          left_shoulder: { index: leftShoulder.index, time: leftShoulder.time, price: leftShoulder.price },
          head: { index: head.index, time: head.time, price: head.price },
          right_shoulder: { index: rightShoulder.index, time: rightShoulder.time, price: rightShoulder.price },
          neckline: { price: actualNeckline },
          formation_date: rightShoulder.time,
          measured_move: Math.round((head.price - actualNeckline) * 100) / 100,
          confidence: leftShoulderDiff < headHeight * 0.15 && rightShoulderDiff < headHeight * 0.15 ? 'high' : 'medium'
        });
      }
    }
  }
  
  return patterns;
}

function detectTriangles(bars, min_bars = 20) {
  const swingHighs = detectSwingPoints(bars, 5).highs;
  const swingLows = detectSwingPoints(bars, 5).lows;
  const patterns = [];
  
  if (swingHighs.length < 3 || swingLows.length < 3) return patterns;
  
  const lastHighs = swingHighs.slice(-5);
  const lastLows = swingLows.slice(-5);
  
  let highSlope = 0;
  let lowSlope = 0;
  
  if (lastHighs.length >= 2) {
    highSlope = (lastHighs[lastHighs.length - 1].price - lastHighs[0].price) / (lastHighs.length - 1);
  }
  if (lastLows.length >= 2) {
    lowSlope = (lastLows[lastLows.length - 1].price - lastLows[0].price) / (lastLows.length - 1);
  }
  
  const highSlopeAbs = Math.abs(highSlope);
  const lowSlopeAbs = Math.abs(lowSlope);
  const convergence = Math.abs(highSlope - lowSlope);
  
  if (convergence < highSlopeAbs * 0.3 && convergence < lowSlopeAbs * 0.3) {
    if (highSlope < -0.001 && lowSlope > 0.001) {
      patterns.push({
        type: 'symmetrical_triangle',
        highs: lastHighs.map(h => ({ index: h.index, price: h.price })),
        lows: lastLows.map(l => ({ index: l.index, price: l.price })),
        apex_date: lastHighs[lastHighs.length - 1].time,
        bars_since_formation: bars.length - lastHighs[0].index,
        expected_breakout: 'breakout_direction_unclear',
        confidence: 'medium'
      });
    } else if (highSlope > -0.001 && lowSlope > 0.001) {
      patterns.push({
        type: 'ascending_triangle',
        resistance: Math.max(...lastHighs.map(h => h.price)),
        support: Math.min(...lastLows.map(l => l.price)),
        highs: lastHighs.map(h => ({ index: h.index, price: h.price })),
        lows: lastLows.map(l => ({ index: l.index, price: l.price })),
        expected_breakout: 'upward',
        confidence: 'medium'
      });
    } else if (highSlope < -0.001 && lowSlope < 0.001) {
      patterns.push({
        type: 'descending_triangle',
        resistance: Math.max(...lastHighs.map(h => h.price)),
        support: Math.min(...lastLows.map(l => l.price)),
        highs: lastHighs.map(h => ({ index: h.index, price: h.price })),
        lows: lastLows.map(l => ({ index: l.index, price: l.price })),
        expected_breakout: 'downward',
        confidence: 'medium'
      });
    }
  }
  
  return patterns;
}

function detectFlags(bars) {
  const patterns = [];
  const swingPoints = detectSwingPoints(bars, 5);
  
  for (let i = 10; i < bars.length - 5; i++) {
    const priorMove = bars[i].close - bars[i - 10].close;
    const priorMovePct = priorMove / bars[i - 10].close;
    
    if (Math.abs(priorMovePct) > 0.05) {
      const flagStart = i;
      const flagEnd = Math.min(i + 5, bars.length - 1);
      const flagMove = bars[flagEnd].close - bars[flagStart].close;
      const flagMovePct = flagMove / bars[flagStart].close;
      
      if (Math.abs(flagMovePct) < 0.02 && Math.sign(flagMove) === Math.sign(priorMove)) {
        patterns.push({
          type: priorMove > 0 ? 'bull_flag' : 'bear_flag',
          pole_start: { index: i - 10, time: bars[i - 10].time, price: bars[i - 10].close },
          pole_end: { index: i - 1, time: bars[i - 1].time, price: bars[i - 1].close },
          pole_move_pct: Math.round(priorMovePct * 100) / 100,
          flag_start: { index: flagStart, time: bars[flagStart].time, price: bars[flagStart].close },
          flag_end: { index: flagEnd, time: bars[flagEnd].time, price: bars[flagEnd].close },
          flag_move_pct: Math.round(flagMovePct * 100) / 100,
          continuation_target: priorMove > 0 
            ? bars[i - 1].close + priorMove
            : bars[i - 1].close + priorMove,
          confidence: 'medium'
        });
      }
    }
  }
  
  return patterns;
}

export async function detectPatterns({ min_confidence = 'medium' } = {}) {
  const data = await evaluate(`
    (function() {
      var bars = ${BARS_PATH};
      if (!bars || typeof bars.lastIndex !== 'function') return { error: 'Could not access bars' };
      
      var count = Math.min(bars.size(), 200);
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - count + 1);
      
      var result = [];
      for (var i = start; i <= end; i++) {
        var v = bars.valueAt(i);
        if (v) result.push({ time: v[0], open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5] || 0 });
      }
      return result;
    })()
  `);
  
  if (data?.error || !data || data.length === 0) {
    throw new Error(data?.error || 'Could not retrieve chart data');
  }
  
  const bars = data;
  
  const doubleTops = detectDoubleTop(bars);
  const doubleBottoms = detectDoubleBottom(bars);
  const headAndShoulders = detectHeadAndShoulders(bars);
  const triangles = detectTriangles(bars);
  const flags = detectFlags(bars);
  
  let allPatterns = [
    ...doubleTops,
    ...doubleBottoms,
    ...headAndShoulders,
    ...triangles,
    ...flags
  ];
  
  if (min_confidence === 'high') {
    allPatterns = allPatterns.filter(p => p.confidence === 'high');
  }
  
  const summary = {
    total_patterns: allPatterns.length,
    double_top: doubleTops.length,
    double_bottom: doubleBottoms.length,
    head_and_shoulders: headAndShoulders.length,
    triangles: triangles.length,
    flags: flags.length,
    bullish_patterns: allPatterns.filter(p => 
      p.type === 'double_bottom' || 
      p.type === 'bull_flag' ||
      (p.type === 'ascending_triangle' && p.expected_breakout === 'upward') ||
      (p.type === 'symmetrical_triangle' && p.expected_breakout === 'breakout_direction_unclear')
    ).length,
    bearish_patterns: allPatterns.filter(p =>
      p.type === 'double_top' ||
      p.type === 'bear_flag' ||
      p.type === 'head_and_shoulders' ||
      (p.type === 'descending_triangle' && p.expected_breakout === 'downward')
    ).length
  };
  
  return {
    success: true,
    bar_count: bars.length,
    patterns: allPatterns,
    summary: summary,
    interpretation: summary.bullish_patterns > summary.bearish_patterns 
      ? 'More bullish patterns detected — potential upward momentum'
      : summary.bullish_patterns < summary.bearish_patterns
      ? 'More bearish patterns detected — potential downward pressure'
      : 'Neutral pattern balance'
  };
}

export async function detectDivergences({ indicator = 'rsi', period = 14 } = {}) {
  const data = await evaluate(`
    (function() {
      var chart = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
      var model = chart.model();
      var sources = model.model().dataSources();
      var priceBars = ${BARS_PATH};
      
      if (!priceBars || typeof priceBars.lastIndex !== 'function') return { error: 'No price data' };
      
      var count = Math.min(priceBars.size(), 100);
      var end = priceBars.lastIndex();
      var start = Math.max(priceBars.firstIndex(), end - count + 1);
      
      var bars = [];
      for (var i = start; i <= end; i++) {
        var v = priceBars.valueAt(i);
        if (v) bars.push({ time: v[0], close: v[4], high: v[2], low: v[3] });
      }
      
      var result = { bars: bars };
      
      for (var si = 0; si < sources.length; si++) {
        var s = sources[si];
        if (!s.metaInfo) continue;
        var meta = s.metaInfo();
        var name = meta.description || meta.shortDescription || '';
        
        if (/${indicator}/i.test(name)) {
          try {
            var dwv = s.dataWindowView();
            if (dwv && dwv.items) {
              var items = dwv.items();
              if (items && items.length > 0) {
                var indicatorValues = [];
                for (var j = 0; j < items.length; j++) {
                  var item = items[j];
                  if (item._title && item._value && item._value !== '∅') {
                    indicatorValues.push({ title: item._title, value: parseFloat(item._value) });
                  }
                }
                if (indicatorValues.length > 0) {
                  result.indicator = { name: name, values: indicatorValues };
                }
              }
            }
          } catch(e) {}
        }
      }
      
      return result;
    })()
  `);
  
  if (data?.error) throw new Error(data.error);
  
  const bars = data?.bars || [];
  const indicatorData = data?.indicator?.values || [];
  
  if (bars.length < 20) {
    return {
      success: true,
      divergences: [],
      note: 'Insufficient data for divergence analysis'
    };
  }
  
  const closes = bars.map(b => b.close);
  const indicatorValues = indicatorData.length > 0 ? indicatorData.map(v => v.value) : [];
  
  if (indicatorValues.length === 0) {
    const rsi = calculateRSI(closes, period);
    
    const divergences = findDivergences(bars, rsi, indicator);
    
    return {
      success: true,
      indicator_calculated: indicator.toUpperCase(),
      period: period,
      divergences: divergences,
      count: divergences.length,
      bullish_divergences: divergences.filter(d => d.type === 'bullish').length,
      bearish_divergences: divergences.filter(d => d.type === 'bearish').length
    };
  }
  
  const divergences = findDivergences(bars, indicatorValues, indicator);
  
  return {
    success: true,
    indicator_name: data?.indicator?.name || indicator,
    divergences: divergences,
    count: divergences.length,
    bullish_divergences: divergences.filter(d => d.type === 'bullish').length,
    bearish_divergences: divergences.filter(d => d.type === 'bearish').length
  };
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

function findDivergences(bars, indicatorValues, indicatorName) {
  const divergences = [];
  
  const window = 10;
  
  for (let i = window; i < bars.length - window; i++) {
    const priceLeft = bars.slice(i - window, i);
    const priceRight = bars.slice(i + 1, i + window + 1);
    const indLeft = indicatorValues.slice(i - window, i);
    const indRight = indicatorValues.slice(i + 1, i + window + 1);
    
    if (indLeft.length < 3 || indRight.length < 3) continue;
    
    const priceLeftMin = Math.min(...priceLeft.map(b => b.low));
    const priceLeftMax = Math.max(...priceLeft.map(b => b.high));
    const priceRightMin = Math.min(...priceRight.map(b => b.low));
    const priceRightMax = Math.max(...priceRight.map(b => b.high));
    
    const indLeftMin = Math.min(...indLeft.filter(v => v !== null && !isNaN(v)));
    const indLeftMax = Math.max(...indLeft.filter(v => v !== null && !isNaN(v)));
    const indRightMin = Math.min(...indRight.filter(v => v !== null && !isNaN(v)));
    const indRightMax = Math.max(...indRight.filter(v => v !== null && !isNaN(v)));
    
    const priceLowerLow = priceRightMin < priceLeftMin;
    const priceHigherHigh = priceRightMax > priceLeftMax;
    const indHigherLow = indRightMin > indLeftMin;
    const indLowerHigh = indRightMax < indLeftMax;
    
    if (priceLowerLow && indHigherLow) {
      divergences.push({
        type: 'bullish_divergence',
        indicator: indicatorName,
        date: bars[i].time,
        price_action: 'price_making_lower_low',
        indicator_action: 'indicator_making_higher_low',
        price_level: Math.round(priceRightMin * 100) / 100,
        indicator_value: Math.round(indRightMin * 100) / 100,
        strength: Math.abs(indRightMin - indLeftMin) > 10 ? 'strong' : 'weak',
        bar_index: i
      });
    }
    
    if (priceHigherHigh && indLowerHigh) {
      divergences.push({
        type: 'bearish_divergence',
        indicator: indicatorName,
        date: bars[i].time,
        price_action: 'price_making_higher_high',
        indicator_action: 'indicator_making_lower_high',
        price_level: Math.round(priceRightMax * 100) / 100,
        indicator_value: Math.round(indRightMax * 100) / 100,
        strength: Math.abs(indLeftMax - indRightMax) > 10 ? 'strong' : 'weak',
        bar_index: i
      });
    }
  }
  
  return divergences;
}

export async function findSupportResistance({ lookback_periods = 5 } = {}) {
  const data = await evaluate(`
    (function() {
      var bars = ${BARS_PATH};
      if (!bars || typeof bars.lastIndex !== 'function') return { error: 'No price data' };
      
      var count = Math.min(bars.size(), 100);
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - count + 1);
      
      var result = [];
      for (var i = start; i <= end; i++) {
        var v = bars.valueAt(i);
        if (v) result.push({ time: v[0], high: v[2], low: v[3], close: v[4] });
      }
      return result;
    })()
  `);
  
  if (data?.error) throw new Error(data.error);
  
  const bars = data || [];
  
  const { highs, lows } = detectSwingPoints(bars, lookback_periods);
  
  const priceMap = new Map();
  
  for (const h of highs) {
    const rounded = Math.round(h.price * 100) / 100;
    if (!priceMap.has(rounded)) {
      priceMap.set(rounded, { price: rounded, touches: 0, type: 'resistance', bars: [] });
    }
    const entry = priceMap.get(rounded);
    entry.touches++;
    entry.bars.push({ time: h.time, index: h.index });
  }
  
  for (const l of lows) {
    const rounded = Math.round(l.price * 100) / 100;
    if (!priceMap.has(rounded)) {
      priceMap.set(rounded, { price: rounded, touches: 0, type: 'support', bars: [] });
    }
    const entry = priceMap.get(rounded);
    entry.touches++;
    entry.bars.push({ time: l.time, index: l.index });
  }
  
  const levels = Array.from(priceMap.values())
    .filter(l => l.touches >= 2)
    .sort((a, b) => b.touches - a.touches);
  
  const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : null;
  
  const supportLevels = levels
    .filter(l => l.type === 'support' && l.price < currentPrice)
    .slice(0, 5)
    .map(l => ({ price: l.price, strength: l.touches, distance_pct: currentPrice ? Math.round(((currentPrice - l.price) / currentPrice) * 10000) / 100 : null }));
  
  const resistanceLevels = levels
    .filter(l => l.type === 'resistance' && l.price > currentPrice)
    .slice(0, 5)
    .map(l => ({ price: l.price, strength: l.touches, distance_pct: currentPrice ? Math.round(((l.price - currentPrice) / currentPrice) * 10000) / 100 : null }));
  
  return {
    success: true,
    current_price: currentPrice,
    lookback_periods: lookback_periods,
    support_levels: supportLevels,
    resistance_levels: resistanceLevels,
    all_levels: levels.slice(0, 20).map(l => ({
      price: l.price,
      type: l.type,
      strength: l.touches,
      last_touch: l.bars[l.bars.length - 1]?.time
    })),
    nearest_support: supportLevels[0] || null,
    nearest_resistance: resistanceLevels[0] || null,
    summary: {
      total_levels: levels.length,
      support_count: supportLevels.length,
      resistance_count: resistanceLevels.length
    }
  };
}

export async function analyzeTrendlines() {
  const data = await evaluate(`
    (function() {
      var bars = ${BARS_PATH};
      if (!bars || typeof bars.lastIndex !== 'function') return { error: 'No price data' };
      
      var count = Math.min(bars.size(), 100);
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - count + 1);
      
      var result = [];
      for (var i = start; i <= end; i++) {
        var v = bars.valueAt(i);
        if (v) result.push({ time: v[0], high: v[2], low: v[3], close: v[4] });
      }
      return result;
    })()
  `);
  
  if (data?.error) throw new Error(data.error);
  
  const bars = data || [];
  
  const { highs, lows } = detectSwingPoints(bars, 5);
  
  const uptrendLines = [];
  const downtrendLines = [];
  
  for (let i = 0; i < highs.length - 2; i++) {
    const p1 = highs[i];
    const p2 = highs[i + 2];
    
    if (p2.price < p1.price) {
      const slope = (p2.price - p1.price) / (p2.index - p1.index);
      
      uptrendLines.push({
        start: { time: p1.time, index: p1.index, price: p1.price },
        end: { time: p2.time, index: p2.index, price: p2.price },
        slope: Math.round(slope * 10000) / 10000,
        angle: Math.round(Math.atan(slope) * 180 / Math.PI * 100) / 100,
        current_value: bars.length > 0 ? bars[bars.length - 1].close : null,
        validity: slope < 0 ? 'valid_downward' : 'invalidating'
      });
    }
  }
  
  for (let i = 0; i < lows.length - 2; i++) {
    const p1 = lows[i];
    const p2 = lows[i + 2];
    
    if (p2.price > p1.price) {
      const slope = (p2.price - p1.price) / (p2.index - p1.index);
      
      downtrendLines.push({
        start: { time: p1.time, index: p1.index, price: p1.price },
        end: { time: p2.time, index: p2.index, price: p2.price },
        slope: Math.round(slope * 10000) / 10000,
        angle: Math.round(Math.atan(slope) * 180 / Math.PI * 100) / 100,
        current_value: bars.length > 0 ? bars[bars.length - 1].close : null,
        validity: slope > 0 ? 'valid_upward' : 'invalidating'
      });
    }
  }
  
  const validUptrends = uptrendLines.filter(l => l.validity === 'valid_downward');
  const validDowntrends = downtrendLines.filter(l => l.validity === 'valid_upward');
  
  const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : null;
  let trend = 'neutral';
  
  if (validUptrends.length > validDowntrends.length && validUptrends.length > 0) {
    trend = 'bullish';
  } else if (validDowntrends.length > validUptrends.length && validDowntrends.length > 0) {
    trend = 'bearish';
  }
  
  return {
    success: true,
    bar_count: bars.length,
    current_price: currentPrice,
    trendlines: {
      downtrend_lines: validDowntrends.slice(0, 3),
      uptrend_lines: validUptrends.slice(0, 3)
    },
    analysis: {
      trend: trend,
      downtrend_count: validDowntrends.length,
      uptrend_count: validUptrends.length,
      strength: Math.max(validDowntrends.length, validUptrends.length),
      note: trend === 'bullish' ? 'Price above downtrend lines — bullish momentum' :
            trend === 'bearish' ? 'Price below uptrend lines — bearish pressure' :
            'No clear trend direction'
    }
  };
}

export async function getTechnicalsSummary() {
  const data = await evaluate(`
    (function() {
      var bars = ${BARS_PATH};
      var chart = ${CHART_API};
      
      if (!bars || typeof bars.lastIndex !== 'function') return { error: 'No price data' };
      
      var count = Math.min(bars.size(), 100);
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - count + 1);
      
      var result = [];
      for (var i = start; i <= end; i++) {
        var v = bars.valueAt(i);
        if (v) result.push({ time: v[0], high: v[2], low: v[3], close: v[4], volume: v[5] || 0 });
      }
      
      return {
        symbol: chart.symbol(),
        bars: result,
        resolution: chart.resolution()
      };
    })()
  `);
  
  if (data?.error) throw new Error(data.error);
  
  const bars = data?.bars || [];
  
  if (bars.length < 20) {
    return {
      success: true,
      summary: { message: 'Insufficient data for technical summary' }
    };
  }
  
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);
  
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
  
  const sum20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const variance = closes.slice(-20).reduce((a, c) => a + Math.pow(c - sum20, 2), 0) / 20;
  const stdDev = Math.sqrt(variance);
  const upperBB = sum20 + 2 * stdDev;
  const lowerBB = sum20 - 2 * stdDev;
  
  const rsi = calculateRSI(closes, 14);
  const currentRSI = rsi[rsi.length - 1];
  
  const macdLine = closes.slice(-12).reduce((a, b) => a + b, 0) / 12 - closes.slice(-26).reduce((a, b) => a + b, 0) / 26;
  const signalLine = macdLine * 0.9;
  const histogram = macdLine - signalLine;
  
  const lastClose = closes[closes.length - 1];
  const lastHigh = Math.max(...highs.slice(-14));
  const lastLow = Math.min(...lows.slice(-14));
  
  let trendSignal = 'neutral';
  if (lastClose > sma20 && (sma50 === null || lastClose > sma50)) trendSignal = 'bullish';
  if (lastClose < sma20 && (sma50 === null || lastClose < sma50)) trendSignal = 'bearish';
  
  let momentumSignal = 'neutral';
  if (currentRSI > 70) momentumSignal = 'overbought';
  else if (currentRSI < 30) momentumSignal = 'oversold';
  else if (histogram > 0) momentumSignal = 'bullish_momentum';
  else if (histogram < 0) momentumSignal = 'bearish_momentum';
  
  const change5 = closes.length >= 6 ? ((closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6]) * 100 : 0;
  const change10 = closes.length >= 11 ? ((closes[closes.length - 1] - closes[closes.length - 11]) / closes[closes.length - 11]) * 100 : 0;
  const change20 = ((closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20]) * 100;
  
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const volSignal = volumes[volumes.length - 1] > avgVol * 1.5 ? 'high_volume' : 'normal_volume';
  
  const overallSignal = 
    (trendSignal === 'bullish' && momentumSignal !== 'overbought') ? 'strong_buy' :
    (trendSignal === 'bullish' && momentumSignal === 'overbought') ? 'buy_caution' :
    (trendSignal === 'bearish' && momentumSignal !== 'oversold') ? 'strong_sell' :
    (trendSignal === 'bearish' && momentumSignal === 'oversold') ? 'sell_cover' :
    'hold';
  
  return {
    success: true,
    symbol: data?.symbol,
    resolution: data?.resolution,
    current_price: lastClose,
    timestamp: bars[bars.length - 1].time,
    technicals: {
      moving_averages: {
        sma20: Math.round(sma20 * 100) / 100,
        sma50: sma50 ? Math.round(sma50 * 100) / 100 : null,
        position_vs_sma20: lastClose > sma20 ? 'above' : 'below',
        position_vs_sma50: sma50 ? (lastClose > sma50 ? 'above' : 'below') : null,
        trend: trendSignal
      },
      bollinger_bands: {
        upper: Math.round(upperBB * 100) / 100,
        middle: Math.round(sum20 * 100) / 100,
        lower: Math.round(lowerBB * 100) / 100,
        position: lastClose > upperBB ? 'above_upper' : lastClose < lowerBB ? 'below_lower' : 'within_bands',
        bandwidth: Math.round(((upperBB - lowerBB) / sum20) * 10000) / 100
      },
      rsi: {
        value: currentRSI ? Math.round(currentRSI * 100) / 100 : null,
        signal: currentRSI > 70 ? 'overbought' : currentRSI < 30 ? 'oversold' : 'neutral'
      },
      macd: {
        line: Math.round(macdLine * 100) / 100,
        signal: Math.round(signalLine * 100) / 100,
        histogram: Math.round(histogram * 100) / 100,
        trend: histogram > 0 ? 'bullish' : 'bearish'
      },
      momentum: {
        change_5d: Math.round(change5 * 100) / 100,
        change_10d: Math.round(change10 * 100) / 100,
        change_20d: Math.round(change20 * 100) / 100,
        signal: momentumSignal
      },
      volume: {
        current: volumes[volumes.length - 1],
        average_20: Math.round(avgVol * 100) / 100,
        signal: volSignal
      }
    },
    summary: {
      overall_signal: overallSignal,
      trend: trendSignal,
      momentum: momentumSignal,
      volatility: ((upperBB - lowerBB) / sum20) * 100 > 10 ? 'high' : ((upperBB - lowerBB) / sum20) * 100 > 5 ? 'medium' : 'low'
    },
    recommendation: overallSignal === 'strong_buy' ? 'Technical indicators suggest bullish setup' :
                    overallSignal === 'strong_sell' ? 'Technical indicators suggest bearish setup' :
                    overallSignal === 'buy_caution' ? 'Bullish trend but RSI extended — consider waiting for pullback' :
                    overallSignal === 'sell_cover' ? 'Bearish trend but RSI oversold — consider waiting for bounce' :
                    'No clear directional signal — wait for confirmation'
  };
}
