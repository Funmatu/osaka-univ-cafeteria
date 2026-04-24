import test from 'node:test';
import assert from 'node:assert/strict';
import { augmentItem, augmentAll } from '../scripts/augment.mjs';

test('augment: fills fiber for rice via perKcal mode', () => {
  const item = { code: '001', name: 'ライス中', category: 'staple', nutrition: { energy: 336 } };
  const out = augmentItem(item);
  assert.ok(out.nutrition.fiber > 0, 'fiber should be filled');
  // 白飯 100g = 156kcal, 繊維 1.5g → 336kcal 分は 3.23g 程度
  assert.ok(out.nutrition.fiber >= 3.0 && out.nutrition.fiber <= 3.5, `fiber=${out.nutrition.fiber}`);
  assert.ok(out._estimated.some((e) => e.key === 'fiber'));
});

test('augment: does not overwrite real measured values', () => {
  const item = {
    code: '002', name: 'ライス中', category: 'staple',
    nutrition: { energy: 336, fiber: 10 }, // unrealistic but measured
  };
  const out = augmentItem(item);
  assert.equal(out.nutrition.fiber, 10); // preserved
  assert.ok(!out._estimated?.some((e) => e.key === 'fiber'));
});

test('augment: pattern-specific match beats generic chicken', () => {
  const stew = { code: '003', name: 'チキンクリームシチュー', category: 'main', nutrition: { energy: 293 } };
  const out = augmentItem(stew);
  // シチューテンプレートが先に来るため fiber >= 1.5 期待
  assert.ok(out.nutrition.fiber >= 1.5, `expected shichu template, got fiber=${out.nutrition.fiber}`);
});

test('augment: falls back to category default when no pattern matches', () => {
  const weird = { code: '004', name: '未知の副菜料理', category: 'side', nutrition: { energy: 80 } };
  const out = augmentItem(weird);
  assert.ok(out.nutrition.fiber > 0);
  assert.ok(out._estimated.some((e) => e.source.includes('category-fallback')));
});

test('augment: handles missing energy gracefully', () => {
  const orphan = { code: '005', name: '謎メニュー', category: 'other', nutrition: {} };
  const out = augmentItem(orphan);
  // perServing モードの項目は energy 不要なので値が入る
  assert.ok(out.nutrition.fiber != null);
});

test('augment: rich liver match via pattern', () => {
  const liver = { code: '006', name: '鶏きも煮', category: 'side', nutrition: { energy: 73 } };
  const out = augmentItem(liver);
  assert.ok(out.nutrition.vitaminB2 >= 1.5, `liver should have high B2, got ${out.nutrition.vitaminB2}`);
});

test('augmentAll: processes array and preserves original items', () => {
  const items = [
    { code: 'a', name: 'ライス', category: 'staple', nutrition: { energy: 252 } },
    { code: 'b', name: 'ほうれん草', category: 'side', nutrition: { energy: 13 } },
  ];
  const out = augmentAll(items);
  assert.equal(out.length, 2);
  // 元の items オブジェクトが変更されていないこと
  assert.equal(items[0].nutrition.fiber, undefined);
  // 結果側には fiber が入っていること
  assert.ok(out[0].nutrition.fiber > 0);
});
