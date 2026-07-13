/**
 * Precise Screener DOM read: per-row text fragments + header columns.
 */
import { evaluateOnTarget } from '../src/connection.js';
import { writeFileSync } from 'node:fs';

const pred = (t) => t.type === 'page' && /tradingview\.com\/screener/i.test(t.url);

const expr = `
(function() {
  var out = {};
  // Header: a row whose cells look like column titles. Try th elements first.
  var ths = Array.from(document.querySelectorAll('th'));
  out.thCount = ths.length;
  out.headerTexts = ths.slice(0, 16).map(function(t){ return (t.textContent||'').trim(); });

  // Fallback: look for a row of clickable column headers (role=columnheader or [class*="header"])
  if (out.headerTexts.filter(Boolean).length < 3) {
    var hdrCells = Array.from(document.querySelectorAll('[role="columnheader"], [class*="header"]'));
    out.headerTexts = hdrCells.slice(0, 16).map(function(t){ return (t.textContent||'').trim(); });
  }

  // Data rows
  var rows = Array.from(document.querySelectorAll('tr.row-HX5UXsDj, tr.listRow'));
  out.rowCount = rows.length;
  function cellTexts(tr) {
    return Array.from(tr.querySelectorAll('td')).map(function(td){
      // gather all non-empty text fragments, preserving order
      var frags = [];
      td.querySelectorAll('*').forEach(function(el){
        var t = (el.childNodes && el.childNodes[0] && el.childNodes[0].nodeType === 3) ? el.childNodes[0].textContent : '';
        if (t && t.trim()) frags.push(t.trim());
      });
      // also the td's own direct text
      var direct = Array.from(td.childNodes).filter(function(n){ return n.nodeType===3 && n.textContent.trim(); }).map(function(n){ return n.textContent.trim(); });
      return (frags.join(' ').trim() || direct.join(' ').trim());
    });
  }
  out.firstRowCells = rows[0] ? cellTexts(rows[0]).slice(0, 16) : [];
  out.secondRowCells = rows[1] ? cellTexts(rows[1]).slice(0, 16) : [];

  // Symbol extraction for first 3 rows
  out.firstSymbols = rows.slice(0, 3).map(function(tr){
    var a = tr.querySelector('a[href*="/symbols/"]');
    if (!a) return null;
    var m = (a.getAttribute('href')||'').match(/symbols\\/([^/]+)\\//);
    return m ? m[1] : (a.textContent||'').trim();
  });

  return out;
})()
`;

try {
  const info = await evaluateOnTarget(pred, expr);
  writeFileSync('/tmp/screener_precise.json', JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info, null, 2));
} catch (e) {
  console.error('INSPECT FAILED:', e.message);
  process.exitCode = 1;
}
