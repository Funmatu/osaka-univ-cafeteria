import test from 'node:test';
import assert from 'node:assert/strict';
import { rankCombinations } from '../public/js/optimizer.js';

// 小さなフィクスチャ: staple 1 + main 2 + side 2 → teishoku の組合せ多数
function makeItems() {
  return [
    // ご飯 (staple) — 食塩 0g
    { code: 'R1', name: '白飯', category: 'staple', price: 100,
      nutrition: { energy: 250, protein: 4, fat: 0.5, carbs: 55, salt: 0, vegetable: 0, fiber: 0.5, calcium: 5, iron: 0.1 } },
    // 主菜 A: 低食塩
    { code: 'M1', name: 'とりむね蒸し', category: 'main', price: 200,
      nutrition: { energy: 250, protein: 28, fat: 8, carbs: 5, salt: 0.8, vegetable: 20, fiber: 1, calcium: 20, iron: 1 } },
    // 主菜 B: 高食塩
    { code: 'M2', name: '塩ラーメン風炒め', category: 'main', price: 200,
      nutrition: { energy: 300, protein: 20, fat: 15, carbs: 15, salt: 4.0, vegetable: 30, fiber: 1.5, calcium: 30, iron: 1.5 } },
    // 副菜
    { code: 'S1', name: '野菜サラダ', category: 'side', price: 100,
      nutrition: { energy: 50, protein: 2, fat: 1, carbs: 8, salt: 0.3, vegetable: 80, fiber: 3, calcium: 40, iron: 0.8 } },
    { code: 'S2', name: 'ひじき煮', category: 'side', price: 100,
      nutrition: { energy: 80, protein: 3, fat: 3, carbs: 10, salt: 1.2, vegetable: 30, fiber: 2.5, calcium: 80, iron: 1.2 } },
  ];
}

test('rankCombinations: unfiltered returns combos from both mains', () => {
  const { top, enumerated, kept } = rankCombinations(makeItems(), {
    budget: 800,
    patterns: ['teishoku'],
  });
  assert.ok(top.length > 0, 'should find some combos');
  assert.ok(enumerated >= 1);
  assert.equal(kept, top.length > 0 ? enumerated : kept);
  // 両方の主菜が結果のどこかに現れる
  const usedMains = new Set(top.flatMap((c) => c.items.filter((i) => i.category === 'main').map((i) => i.code)));
  assert.ok(usedMains.has('M1'));
  assert.ok(usedMains.has('M2'));
});

test('rankCombinations: low-salt filter excludes high-salt main', () => {
  const { top, kept } = rankCombinations(makeItems(), {
    budget: 800,
    patterns: ['teishoku'],
    filters: ['low-salt'],
  });
  assert.ok(top.length > 0, 'low-salt combos should exist (M1 base <2g)');
  assert.ok(kept > 0);
  // すべての結果で食塩は 2.0g 以下
  for (const c of top) {
    assert.ok(c.nutrition.salt <= 2.0, `salt should be ≤2g, got ${c.nutrition.salt}`);
  }
  // M2 (高食塩) を含む組合せは残っていない
  const hasHighSaltMain = top.some((c) => c.items.some((i) => i.code === 'M2'));
  assert.equal(hasHighSaltMain, false);
});

test('rankCombinations: impossible filter returns empty top', () => {
  // 1食で 100g のタンパク質は取れないので high-protein + tight budget だと 0 件
  const items = makeItems();
  // あえて protein 目標を満たさないように調整した items だけで構成
  const lowProteinItems = items.map((i) => ({ ...i, nutrition: { ...i.nutrition, protein: 1 } }));
  const { top, kept } = rankCombinations(lowProteinItems, {
    budget: 800,
    patterns: ['teishoku'],
    filters: ['high-protein'],
  });
  assert.equal(top.length, 0);
  assert.equal(kept, 0);
});

test('rankCombinations: empty filters array behaves like no filter', () => {
  const { kept: keptNone } = rankCombinations(makeItems(), { budget: 800, patterns: ['teishoku'] });
  const { kept: keptEmpty } = rankCombinations(makeItems(), { budget: 800, patterns: ['teishoku'], filters: [] });
  assert.equal(keptNone, keptEmpty);
});
