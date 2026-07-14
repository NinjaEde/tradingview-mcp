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
 *
 * IMPORTANT (symbol-switch correctness, issue #N): when expectedSymbol is
 * given we verify against `symbolExt().symbol` — the symbol TV ACTUALLY
 * loaded (e.g. "XETR_DLY:BAS") — NOT `chart.symbol()`, which can still report
 * the old symbol (or the requested-but-not-yet-loaded ticker) mid-switch. We
 * also require the bars to be present (TV briefly CLEARS bars to null during a
 * reload) and stable, so callers never read the PREVIOUS symbol's bars.
 */
/**
 * Read the last bar's fingerprint (time|close) from the active chart's main
 * series. Used to detect whether the chart has actually swapped to a NEW
 * symbol's bars after a setSymbol() call (the bars briefly keep showing the
 * OLD symbol's data before TradingView reloads). Returns null if no bar yet.
 */
export async function getLastBarFingerprint() {
  return evaluate(`(function() {
    try {
      var chart = ${CHART_API};
      var bars = chart._chartWidget.model().mainSeries().bars();
      var li = bars.lastIndex();
      if (li < 0) return null;
      var v = bars.valueAt(li);
      if (!v) return null;
      return v[0] + '|' + v[4];
    } catch (e) { return null; }
  })()`).catch(() => null);
}

// Compares a requested symbol against the symbol TradingView actually loaded.
// `chart.symbol()` / symbolExt().symbol can be a bare ticker ("BAS") or a
// fully-qualified name ("XETR_DLY:BAS"). We match on the bare ticker portion
// (after the last ':' and any "_DLY" suffix) so "BAS", "XETR:BAS" and
// "XETR_DLY:BAS" all compare equal. TradingView sometimes prepends a digit
// to the ticker (e.g. "BASF" -> "XETR_DLY:1BAS"); we strip a single leading
// digit too so such resolutions still match. Returns true if they refer to
// the same instrument.
function symbolMatches(requested, actual) {
  if (!requested || !actual) return false;
  const norm = (s) => s.split(':').pop().replace(/_DLY$/, '').replace(/^[0-9]/, '').toUpperCase();
  return norm(requested) === norm(actual);
}

export async function waitForChartReady(expectedSymbol = null, expectedTf = null, timeout = DEFAULT_TIMEOUT, prevFingerprint = null) {
  const start = Date.now();
  let lastBarCount = -1;
  let stableCount = 0;
  // If we know the previous symbol's last-bar fingerprint, only accept once
  // the bars have actually CHANGED to the new symbol's data (not still the
  // old bars that happen to be present + stable). Detects the post-switch
  // window where chart.symbol() already reports the new ticker but the bars
  // still belong to the old symbol.
  const mustChange = !!prevFingerprint;

  while (Date.now() - start < timeout) {
    const state = await evaluate(`(function() {
      try {
        var chart = ${CHART_API};
        if (!chart) return { ready: false };
        var m = chart._chartWidget.model();
        var bars = m.mainSeries().bars();
        var size = bars.size();
        var sym = '';
        try { sym = chart.symbol() || ''; } catch (e) {}
        // symbolExt().symbol is what TV ACTUALLY loaded (e.g. XETR_DLY:BAS),
        // not just the requested string. This is the reliable loaded-symbol
        // signal — chart.symbol() can lag or report the requested-but-not-yet-
        // loaded ticker during a switch.
        var symExt = '';
        try { symExt = (chart.symbolExt() || {}).symbol || ''; } catch (e) {}
        var lastBar = null;
        var fp = null;
        try { var li = bars.lastIndex(); var v = li >= 0 ? bars.valueAt(li) : null; if (v) { lastBar = { time: v[0], close: v[4] }; fp = v[0] + '|' + v[4]; } } catch (e) {}
        return { ready: size > 0, barCount: size, symbol: sym, symbolExt: symExt, lastBar: lastBar, fingerprint: fp };
      } catch (e) {
        return { ready: false, error: e.message };
      }
    })()`);

    if (!state || state.ready === false) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    // When a symbol was requested, only accept once the chart has actually
    // loaded THAT symbol. Use symbolExt (the real loaded symbol), not
    // chart.symbol() which can lag or report the requested-but-not-yet-loaded
    // ticker. If bars are momentarily null (TV clears them during reload),
    // keep waiting — that's the chart mid-switch.
    if (expectedSymbol) {
      if (!symbolMatches(expectedSymbol, state.symbolExt)) {
        stableCount = 0;
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        continue;
      }
      // Bars must be present (not in the null/clearing window).
      if (!state.lastBar) {
        stableCount = 0;
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        continue;
      }
      // If we're switching FROM another symbol, require the bars to have
      // actually changed to the new data (not still the old symbol's bars).
      if (mustChange && state.fingerprint === prevFingerprint) {
        stableCount = 0;
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        continue;
      }
    }

    if (expectedTf) {
      try {
        const tf = await evaluate(`${CHART_API}.resolution()`);
        if (tf && tf.toUpperCase() !== String(expectedTf).toUpperCase()) {
          stableCount = 0;
          await new Promise(r => setTimeout(r, POLL_INTERVAL));
          continue;
        }
      } catch { /* ignore tf check failure */ }
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
