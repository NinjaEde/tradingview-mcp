import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePct, parseNumberOrNull } from '../src/core/screener.js';

test('parsePct handles Unicode minus (U+2212) as negative', () => {
  // TradingView German locale uses − (U+2212), not ASCII '-'
  assert.equal(parsePct('−11,42%'), -11.42);
  assert.equal(parsePct('+7,97%'), 7.97);
  assert.equal(parsePct('4,14%'), 4.14);
  assert.equal(parsePct('−3,76%'), -3.76);
});

test('parseNumberOrNull handles Unicode minus and German decimals', () => {
  assert.equal(parseNumberOrNull('−11,42'), -11.42);
  assert.equal(parseNumberOrNull('38,8000'), 38.8);
  assert.equal(parseNumberOrNull('1.063,50'), 1063.5);
  assert.equal(parseNumberOrNull('—'), null);
  assert.equal(parseNumberOrNull(null), null);
});
