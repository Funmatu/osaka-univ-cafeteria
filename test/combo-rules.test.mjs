import test from 'node:test';
import assert from 'node:assert/strict';
import { enumerateAll, groupByCategory, isRice } from '../public/js/combo-rules.js';

const SAMPLE = [
  { code: '001', name: 'ライス中', price: 110, category: 'staple', nutrition: { energy: 300 } },
  { code: '002', name: 'ライス大', price: 160, category: 'staple', nutrition: { energy: 450 } },
  { code: '003', name: '食パン', price: 80, category: 'staple', nutrition: { energy: 200 } },
  { code: '010', name: '唐揚げ', price: 300, category: 'main', nutrition: { energy: 400 } },
  { code: '011', name: '焼鮭', price: 280, category: 'main', nutrition: { energy: 350 } },
  { code: '020', name: 'ひじき煮', price: 90, category: 'side', nutrition: { energy: 80 } },
  { code: '021', name: '冷奴', price: 70, category: 'side', nutrition: { energy: 60 } },
  { code: '022', name: 'サラダ', price: 100, category: 'side', nutrition: { energy: 40 } },
  { code: '030', name: '味噌汁', price: 50, category: 'soup', nutrition: { energy: 30 } },
  { code: '040', name: 'カツ丼', price: 500, category: 'bowl', nutrition: { energy: 800 } },
  { code: '041', name: '担々麺', price: 550, category: 'noodle', nutrition: { energy: 700 } },
  { code: '050', name: 'プリン', price: 120, category: 'dessert', nutrition: { energy: 150 } },
];

test('groupByCategory partitions items correctly', () => {
  const g = groupByCategory(SAMPLE);
  assert.equal(g.staple.length, 3);
  assert.equal(g.main.length, 2);
  assert.equal(g.side.length, 3);
  assert.equal(g.bowl.length, 1);
  assert.equal(g.noodle.length, 1);
});

test('isRice identifies rice variants', () => {
  assert.equal(isRice({ category: 'staple', name: 'ライス大' }), true);
  assert.equal(isRice({ category: 'staple', name: 'ごはん' }), true);
  assert.equal(isRice({ category: 'staple', name: '食パン' }), false);
  assert.equal(isRice({ category: 'main', name: 'ライス大' }), false); // wrong category
});

test('enumerateAll: teishoku respects budget', () => {
  const combos = [...enumerateAll(SAMPLE, { budget: 500, patterns: ['teishoku'] })];
  assert.ok(combos.length > 0);
  for (const c of combos) {
    const price = c.items.reduce((a, b) => a + b.price, 0);
    assert.ok(price <= 500, `combo over budget: ${price}`);
  }
});

test('enumerateAll: teishoku always has exactly 1 staple and 1 main', () => {
  const combos = [...enumerateAll(SAMPLE, { budget: 1000, patterns: ['teishoku'] })];
  for (const c of combos) {
    const staples = c.items.filter((i) => i.category === 'staple');
    const mains = c.items.filter((i) => i.category === 'main');
    assert.equal(staples.length, 1, `expected 1 staple, got ${staples.length}`);
    assert.equal(mains.length, 1, `expected 1 main, got ${mains.length}`);
  }
});

test('enumerateAll: no combination has two rice variants (exclusive group)', () => {
  const combos = [...enumerateAll(SAMPLE, { budget: 2000 })];
  for (const c of combos) {
    const riceCount = c.items.filter((i) => isRice(i)).length;
    assert.ok(riceCount <= 1, `found combo with ${riceCount} rice variants`);
  }
});

test('enumerateAll: oneDish never includes staple or main', () => {
  const combos = [...enumerateAll(SAMPLE, { budget: 1000, patterns: ['oneDish'] })];
  assert.ok(combos.length > 0);
  for (const c of combos) {
    const forbidden = c.items.filter((i) => i.category === 'staple' || i.category === 'main');
    assert.equal(forbidden.length, 0);
    const complete = c.items.filter((i) => ['bowl', 'noodle', 'set'].includes(i.category));
    assert.equal(complete.length, 1);
  }
});

test('enumerateAll: side dishes capped at 2', () => {
  const combos = [...enumerateAll(SAMPLE, { budget: 2000 })];
  for (const c of combos) {
    const sides = c.items.filter((i) => i.category === 'side');
    assert.ok(sides.length <= 2, `too many sides: ${sides.length}`);
  }
});

test('enumerateAll: all items unique within a combination', () => {
  const combos = [...enumerateAll(SAMPLE, { budget: 2000 })];
  for (const c of combos) {
    const codes = c.items.map((i) => i.code);
    assert.equal(new Set(codes).size, codes.length);
  }
});

test('enumerateAll: allowDessert=false excludes desserts', () => {
  const combos = [...enumerateAll(SAMPLE, { budget: 2000, allowDessert: false })];
  for (const c of combos) {
    assert.equal(c.items.filter((i) => i.category === 'dessert').length, 0);
  }
});

test('enumerateAll: requireSoup=true ensures every combo has exactly one soup', () => {
  const combos = [...enumerateAll(SAMPLE, { budget: 2000, requireSoup: true })];
  assert.ok(combos.length > 0);
  for (const c of combos) {
    assert.equal(c.items.filter((i) => i.category === 'soup').length, 1);
  }
});

test('enumerateAll: budget 0 yields no combinations', () => {
  const combos = [...enumerateAll(SAMPLE, { budget: 0 })];
  assert.equal(combos.length, 0);
});
