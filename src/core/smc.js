/**
 * SMC Dashboard — consolidated Smart Money Concepts analysis.
 *
 * Combines all Pine indicator output from "Ede - Advanced SMC v2.0"
 * (lines, labels, boxes, tables, study values) plus price/technicals
 * into a single interpreted result with trading bias + checklist.
 */
import { evaluate, safeString } from '../connection.js';

const SMC_INDICATOR = 'Ede - Advanced SMC v2.0';

function parseSMCTable(rows) {
  if (!rows || rows.length < 6) return { error: 'Not enough table rows' };
  const result = {};
  for (const row of rows) {
    const cols = row.split('|').map(c => c.trim());
    if (cols.length < 2) continue;

    if (row.includes('TREND | EMA')) continue; // header

    if (row.includes('BULL CONFIRMED') || row.includes('BEAR CONFIRMED')) {
      result.trend = row.includes('BULL') ? 'BULL' : 'BEAR';
      result.trendConfirmed = row.includes('CONFIRMED');
    }
    else if (cols.length >= 5 && parseFloat(cols[0]) > 0 && parseFloat(cols[1]) > 0) {
      result.ema20 = parseFloat(cols[0]); result.ema50 = parseFloat(cols[1]);
      result.ema100 = parseFloat(cols[2]); result.ema150 = parseFloat(cols[3]);
      result.ema200 = parseFloat(cols[4]);
    }
    else if (row.includes('ZONE | Fib')) continue;
    else if (cols.length >= 4 && cols[0].match(/^\d+\.\d+$/)) {
      result.fib50 = parseFloat(cols[0]);
      result.zone = cols[1]; result.signal = cols[2]; result.mcpZone = cols[3];
    }
    else if (row.includes('STRUCT | Pattern')) continue;
    else if (cols.length >= 4 && (cols[0] === 'CLEAN' || cols[0].includes('CHoCH'))) {
      result.structure = cols[0]; result.pattern = cols[1];
      result.divergence = cols[2]; result.liquidity = cols[3];
    }
    else if (row.includes('RSI')) result.rsi = parseFloat(cols[cols.length - 1]) || parseFloat(cols[1]) || null;
    else if (row.includes('Vol Trend')) result.volTrend = cols[1];
    else if (row.includes('1.Bullish')) result.checkBullish = cols[1] === 'Y';
    else if (row.includes('2.EMA')) result.checkEMA = cols[1] === 'Y';
    else if (row.includes('3.Discount')) result.checkDiscount = cols[1] === 'Y';
    else if (row.includes('4.OB/FVG')) result.checkOBFVG = cols[1] === 'Y';
    else if (row.includes('VOL TREND')) result.checkVolTrend = cols[1] === 'Y';
  }
  return result;
}

function computeBias(smc, labels, prices) {
  const trend = smc.trend || null;
  const checklistPassed = [
    smc.checkBullish, smc.checkEMA, smc.checkDiscount, smc.checkOBFVG,
  ].filter(Boolean).length;

  // Find most recent BOS levels relative to current price
  const bosLevels = labels.filter(l => l.text === 'BOS').map(l => l.price).sort((a, b) => b - a);
  const chochLevels = labels.filter(l => l.text && l.text.includes('CHoCH')).map(l => l.price);
  const exitLevels = labels.filter(l => l.text === 'EXIT').map(l => l.price);

  let bias = 'NEUTRAL';
  let confidence = 0;
  const reasons = [];

  if (trend === 'BULL') {
    if (checklistPassed >= 3) { bias = 'STRONG_BUY'; confidence = 80; }
    else if (checklistPassed >= 2) { bias = 'BUY'; confidence = 60; }
    else { bias = 'WEAK_BUY'; confidence = 40; }
  } else if (trend === 'BEAR') {
    if (checklistPassed >= 3) { bias = 'STRONG_SELL'; confidence = 80; }
    else if (checklistPassed >= 2) { bias = 'SELL'; confidence = 60; }
    else { bias = 'WEAK_SELL'; confidence = 40; }
  }

  if (smc.checkBullish) reasons.push('Richtung bestätigt');
  if (smc.checkEMA) reasons.push('EMA-Confluence bestätigt');
  if (smc.checkDiscount && smc.zone === 'DISCOUNT') reasons.push('Preis im Discount');
  if (!smc.checkDiscount) reasons.push('Preis im PREMIUM — kein Einstieg');
  if (smc.checkOBFVG) reasons.push('OB/FVG vorhanden');
  if (smc.volTrend?.toLowerCase().includes('fall')) reasons.push('WARNUNG: Volumen-Trend fallend');

  return {
    bias, confidence,
    checklistPassed: checklistPassed + '/' + 4,
    reasons,
    bosLevels: bosLevels.slice(0, 5),
    chochLevels: chochLevels.slice(0, 5),
    exitLevels: exitLevels.slice(0, 3),
    trend,
  };
}

export async function getSMCDashboard() {
  const data = await evaluate(`(function() {
    var filter = ${safeString(SMC_INDICATOR.toLowerCase())};
    var chart = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
    var model = chart.model();
    var sources = model.model().dataSources();
    var smcSource = null;

    // Find the SMC indicator source
    for (var si = 0; si < sources.length && !smcSource; si++) {
      var s = sources[si];
      if (!s.metaInfo) continue;
      try {
        var meta = s.metaInfo();
        var name = (meta.description || meta.shortDescription || '').toLowerCase();
        if (name.indexOf(filter) !== -1) smcSource = s;
      } catch(e) {}
    }
    if (!smcSource) return { error: 'SMC indicator not found' };

    var g = smcSource._graphics;
    var pc = g && g._primitivesCollection;

    // Labels
    var labels = [];
    try {
      if (pc && pc.dwglabels) {
        var labelColl = pc.dwglabels.get('labels');
        if (labelColl && labelColl._primitivesDataById) {
          labelColl._primitivesDataById.forEach(function(v) {
            if (v.t) labels.push({ text: v.t, price: v.y != null ? Math.round(v.y * 1e8) / 1e8 : null });
          });
        }
      }
    } catch(e) {}

    // Boxes
    var boxes = [];
    var seen = {};
    try {
      if (pc && pc.dwgboxes) {
        var boxColl = pc.dwgboxes.get('boxes');
        if (boxColl && boxColl._primitivesDataById) {
          boxColl._primitivesDataById.forEach(function(v) {
            if (v.high != null && v.low != null) {
              var k = Math.round(v.high * 100) + '|' + Math.round(v.low * 100);
              if (!seen[k]) {
                seen[k] = true;
                boxes.push({ high: Math.round(v.high * 1e8) / 1e8, low: Math.round(v.low * 1e8) / 1e8 });
              }
            }
          });
        }
      }
    } catch(e) {}

    // Table cells
    var tableRows = [];
    try {
      if (pc && pc.dwgtablecells) {
        var tcColl = pc.dwgtablecells.get('tableCells');
        if (tcColl && tcColl._primitivesDataById) {
          var grid = {};
          tcColl._primitivesDataById.forEach(function(v) {
            var r = v.row || 0; var c = v.col || 0;
            if (!grid[r]) grid[r] = {};
            grid[r][c] = v.t || '';
          });
          for (var rk in grid) {
            var vals = []; var keys = Object.keys(grid[rk]).sort();
            for (var ki = 0; ki < keys.length; ki++) vals.push(grid[rk][keys[ki]]);
            tableRows.push(vals.join('|'));
          }
        }
      }
    } catch(e) {}

    // Symbol & price
    var sym = null;
    try { sym = model.mainSeries().symbol(); } catch(e) {}
    var lastPrice = null;
    try { var bars = model.mainSeries().bars(); lastPrice = bars[bars.length - 1].close; } catch(e) {}
    if (lastPrice != null) lastPrice = Math.round(lastPrice * 100) / 100;

    return {
      symbol: sym,
      price: lastPrice,
      labels: labels,
      boxes: boxes,
      tableRows: tableRows
    };
  })()`);

  if (!data) throw new Error('SMC indicator not found. Add "Ede - Advanced SMC v2.0" to the chart.');

  const smc = parseSMCTable(data.tableRows);
  if (!smc || smc.error) throw new Error('Could not parse SMC table: ' + (smc?.error || 'unknown'));

  const bias = computeBias(smc, data.labels, data.price);

  return {
    success: true,
    symbol: data.symbol,
    price: data.price,
    smc: {
      trend: smc.trend,
      trendConfirmed: smc.trendConfirmed,
      ema: { ema20: smc.ema20, ema50: smc.ema50, ema100: smc.ema100, ema150: smc.ema150, ema200: smc.ema200 },
      emaStack: (smc.ema20 > smc.ema50 && smc.ema50 > smc.ema100 && smc.ema100 > smc.ema200) ? 'BULL_STACK' : ((smc.ema20 < smc.ema50 && smc.ema50 < smc.ema100) ? 'BEAR_STACK' : 'MIXED'),
      zone: { fib50: smc.fib50, zone: smc.zone, signal: smc.signal, mcpEntry: smc.mcpZone },
      structure: { quality: smc.structure, pattern: smc.pattern, divergence: smc.divergence, liquidity: smc.liquidity },
      rsi: smc.rsi,
      volTrend: smc.volTrend,
      checklist: {
        bullish: smc.checkBullish, emaConfirm: smc.checkEMA,
        discount: smc.checkDiscount, obFvg: smc.checkOBFVG,
        volWarning: smc.checkVolTrend,
      },
    },
    trading: bias,
    levels: {
      bos: bias.bosLevels,
      choch: bias.chochLevels,
      exits: bias.exitLevels,
      boxes: data.boxes,
    },
    recommendation: bias.bias + ' (' + bias.confidence + '% Confidence, ' + bias.checklistPassed + ' checks)',
    note: 'Interpretiere dieses Dashboard als SMC-Basis. Validiere mit Multi-TF-Analyse (insb. 4H/1H für Einstieg).',
  };
}