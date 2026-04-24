import test from 'node:test';
import assert from 'node:assert/strict';
import { jaccardSimilarity, selectDiverseTopK, boltzmannSample } from '../public/js/diversity.js';

const makeCombo = (codes, score) => ({ items: codes.map((c) => ({ code: c })), score });

test('jaccardSimilarity: identical combos = 1', () => {
  assert.equal(jaccardSimilarity(makeCombo(['a', 'b', 'c'], 0), makeCombo(['a', 'b', 'c'], 0)), 1);
});

test('jaccardSimilarity: disjoint = 0', () => {
  assert.equal(jaccardSimilarity(makeCombo(['a'], 0), makeCombo(['b'], 0)), 0);
});

test('jaccardSimilarity: half overlap', () => {
  // {a,b} ∩ {b,c} = {b}, union = {a,b,c} → 1/3
  const s = jaccardSimilarity(makeCombo(['a', 'b'], 0), makeCombo(['b', 'c'], 0));
  assert.ok(Math.abs(s - 1 / 3) < 1e-9);
});

test('selectDiverseTopK always picks the top-scored combo first', () => {
  const ranked = [
    makeCombo(['a', 'b'], 90),
    makeCombo(['a', 'b'], 89), // near-duplicate
    makeCombo(['c', 'd'], 70),
    makeCombo(['e', 'f'], 60),
  ];
  const picked = selectDiverseTopK(ranked, 3, 0.5);
  assert.equal(picked[0].score, 90);
  // Second pick should NOT be the near-duplicate; diversity should win
  assert.notDeepEqual(picked[1].items.map((i) => i.code), ['a', 'b']);
});

test('selectDiverseTopK returns k items (or fewer if pool is small)', () => {
  const ranked = [makeCombo(['a'], 80), makeCombo(['b'], 70)];
  const picked = selectDiverseTopK(ranked, 3);
  assert.equal(picked.length, 2);
});

test('selectDiverseTopK with lambda=1 approximates pure score ranking', () => {
  const ranked = [
    makeCombo(['a', 'b'], 90),
    makeCombo(['a', 'b', 'c'], 85),
    makeCombo(['x', 'y'], 50),
  ];
  const picked = selectDiverseTopK(ranked, 2, 1.0);
  assert.equal(picked[0].score, 90);
  assert.equal(picked[1].score, 85);
});

test('boltzmannSample returns k distinct entries', () => {
  const ranked = Array.from({ length: 10 }, (_, i) => makeCombo([`x${i}`], 100 - i));
  let seq = 0;
  const rng = () => {
    seq = (seq * 9301 + 49297) % 233280;
    return seq / 233280;
  };
  const picked = boltzmannSample(ranked, { temperature: 20, k: 3, rng });
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
});

test('boltzmannSample with very low temperature is near-deterministic toward top', () => {
  const ranked = [
    makeCombo(['a'], 100),
    makeCombo(['b'], 50),
    makeCombo(['c'], 10),
  ];
  let seq = 1;
  const rng = () => {
    seq = (seq * 1103515245 + 12345) % 2147483648;
    return seq / 2147483648;
  };
  const picked = boltzmannSample(ranked, { temperature: 0.1, k: 1, rng });
  assert.equal(picked[0].score, 100);
});
