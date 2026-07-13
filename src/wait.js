import { evaluate, KNOWN_PATHS } from './connection.js';

const CHART_API = KNOWN_PATHS.chartApi;
const DEFAULT_TIMEOUT = 5000;
const POLL_INTERVAL = 150;

/**
 * Wait until the active chart has finished loading the requested symbol.
 *
 * Uses the chart API (model().mainSeries().bars().size()) for a reliable bar
 * count instead of fragile DOM selectors — returns as soon as the symbol
 * matches and the bar count is stable, so multi-symbol loops stay fast.
 */
export async function waitForChartReady(expectedSymbol = null, expectedTf = null, timeout = DEFAULT_TIMEOUT) {
  const start = Date.now();
  let lastBarCount = -1;
  let stableCount = 0;

  while (Date.now() - start < timeout) {
    const state = await evaluate(`
      (function() {
        try {
          var chart = ${CHART_API};
          if (!chart) return { ready: false };
          var m = chart._chartWidget.model();
          var bars = m.mainSeries().bars();
          var size = bars.size();
          var sym = '';
          try { sym = chart.symbol() || ''; } catch (e) {}
          var symEl = document.querySelector('[data-name="legend-source-title"]');
          var headerSym = symEl ? symEl.textContent.trim() : '';
          return { ready: size > 0, barCount: size, symbol: sym, headerSymbol: headerSym };
        } catch (e) {
          return { ready: false, error: e.message };
        }
      })()
    `);

    if (!state || state.ready === false) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    // Only accept once the (possibly switched) symbol actually matches.
    const symText = (state.symbol || state.headerSymbol || '').toUpperCase();
    if (expectedSymbol && symText && !symText.includes(expectedSymbol.toUpperCase())) {
      stableCount = 0;
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    // Bar-count stability (2 consecutive identical, non-zero counts).
    if (state.barCount === lastBarCount && state.barCount > 0) {
      stableCount++;
    } else {
      stableCount = 0;
    }
    lastBarCount = state.barCount;

    if (stableCount >= 2) return true;
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  // Timeout — return true anyway; caller should verify via its own read.
  return false;
}

/**
 * Wait for the chart to finish (re)rendering — used before screenshots so a
 * capture right after chart_set_symbol / chart_set_timeframe doesn't grab a
 * stale frame (issue #144). Waits for any loading spinner to clear, then for
 * the symbol/resolution/canvas signature to hold stable across 3 polls.
 */
export async function waitForChartRender(timeout = 5000) {
  const start = Date.now();
  let lastSignature = null;
  let stableCount = 0;

  while (Date.now() - start < timeout) {
    const state = await evaluate(`
      (function() {
        var canvas = document.querySelector('[data-name="pane-canvas"] canvas')
          || document.querySelector('[data-name="pane-canvas"]')
          || document.querySelector('canvas');
        var rect = canvas ? canvas.getBoundingClientRect() : null;
        var symbol = '', resolution = '';
        try {
          var chart = window.TradingViewApi._activeChartWidgetWV.value();
          symbol = chart.symbol();
          resolution = chart.resolution();
        } catch(e) {}
        var spinner = document.querySelector('[class*="loader"]')
          || document.querySelector('[class*="loading"]')
          || document.querySelector('[data-name="loading"]');
        return {
          symbol: symbol,
          resolution: resolution,
          isLoading: !!(spinner && spinner.offsetParent !== null),
          canvasWidth: rect ? Math.round(rect.width) : 0,
          canvasHeight: rect ? Math.round(rect.height) : 0
        };
      })()
    `);

    if (!state || state.isLoading || !state.canvasWidth || !state.canvasHeight) {
      stableCount = 0;
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    const signature = [state.symbol, state.resolution, state.canvasWidth, state.canvasHeight].join('|');
    if (signature === lastSignature) stableCount++;
    else { stableCount = 0; lastSignature = signature; }

    if (stableCount >= 3) return true;
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  return false;
}
