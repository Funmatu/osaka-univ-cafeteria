import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aimScore,
  dailyBonus,
  boundPenalty,
  pfcScore,
  scoreCombination,
  MEAL_TARGET,
  DAILY_RDI,
  NUTRITION_FILTERS,
  passesFilters,
} from '../public/js/nutrition.js';

test('aimScore: 0 yields 0', () => {
  assert.equal(aimScore(0, 100), 0);
});

test('aimScore: below target scales linearly', () => {
  assert.equal(aimScore(50, 100), 50);
  assert.equal(aimScore(25, 100), 25);
});

test('aimScore: within 1.0-1.3x target yields 100', () => {
  assert.equal(aimScore(100, 100), 100);
  assert.equal(aimScore(130, 100), 100);
  assert.equal(aimScore(115, 100), 100);
});

test('aimScore: above 1.3x target decays', () => {
  const s = aimScore(160, 100); // overshoot = (160-130)/100 = 0.3 → penalty 15 → 85
  assert.ok(s < 100 && s > 0);
  assert.equal(Math.round(s), 85);
});

test('dailyBonus: below meal target returns 0', () => {
  assert.equal(dailyBonus(100, 200, 600), 0);
});

test('dailyBonus: full daily target gives 30', () => {
  // gap = 600-200 = 400, extra = 600-200 = 400 → 30
  assert.equal(dailyBonus(600, 200, 600), 30);
});

test('dailyBonus: capped at 30 when exceeding daily', () => {
  assert.equal(dailyBonus(10000, 200, 600), 30);
});

test('boundPenalty: at or below upper returns 0', () => {
  assert.equal(boundPenalty(2.0, 2.5), 0);
  assert.equal(boundPenalty(2.5, 2.5), 0);
});

test('boundPenalty: above upper returns negative, capped at -60', () => {
  assert.equal(boundPenalty(3.5, 2.5), -30);
  assert.equal(boundPenalty(100, 2.5), -60);
});

test('pfcScore: ideal ratio yields 100', () => {
  // At ideal 15/25/60 with 800 kcal: P=30g, F=22.2g, C=120g
  const score = pfcScore(30, 22.2, 120);
  assert.ok(score > 99, `expected ~100, got ${score}`);
});

test('pfcScore: zero macros yields 0', () => {
  assert.equal(pfcScore(0, 0, 0), 0);
});

test('scoreCombination returns bounded score and reasonable components', () => {
  const items = [
    {
      nutrition: {
        energy: MEAL_TARGET.energy,
        protein: MEAL_TARGET.protein,
        fat: 25,
        carbs: 120,
        salt: 2.0,
        vegetable: MEAL_TARGET.vegetable,
        fiber: MEAL_TARGET.fiber,
        calcium: MEAL_TARGET.calcium,
        iron: MEAL_TARGET.iron,
      },
    },
  ];
  const r = scoreCombination(items);
  assert.ok(r.score > 80 && r.score <= 100, `well-balanced combo should score high, got ${r.score}`);
  assert.ok(r.components.pfc > 70);
  assert.equal(Math.round(r.nutrition.energy), Math.round(MEAL_TARGET.energy));
});

test('scoreCombination penalizes high salt', () => {
  const items = [{ nutrition: { energy: 800, protein: 22, fat: 22, carbs: 120, salt: 10 } }];
  const r = scoreCombination(items);
  assert.ok(r.components.salt < 60, `expected salt component penalized, got ${r.components.salt}`);
});

test('DAILY_RDI and MEAL_TARGET are consistent (1/3 ratio)', () => {
  for (const k of Object.keys(DAILY_RDI)) {
    assert.ok(Math.abs(MEAL_TARGET[k] * 3 - DAILY_RDI[k]) < 1e-6);
  }
});

// ---- Nutrition filter tests ----

test('low-salt filter: 2.0g passes, 2.01g fails', () => {
  const pred = NUTRITION_FILTERS['low-salt'].predicate;
  assert.equal(pred({ salt: 2.0 }), true);
  assert.equal(pred({ salt: 1.9 }), true);
  assert.equal(pred({ salt: 2.01 }), false);
});

test('high-protein filter: at/above meal target passes', () => {
  const pred = NUTRITION_FILTERS['high-protein'].predicate;
  assert.equal(pred({ protein: MEAL_TARGET.protein }), true);
  assert.equal(pred({ protein: MEAL_TARGET.protein + 5 }), true);
  assert.equal(pred({ protein: MEAL_TARGET.protein - 0.01 }), false);
});

test('high-fiber filter: at/above meal target passes', () => {
  const pred = NUTRITION_FILTERS['high-fiber'].predicate;
  assert.equal(pred({ fiber: MEAL_TARGET.fiber }), true);
  assert.equal(pred({ fiber: 0 }), false);
});

test('high-mineral filter: requires both Ca and Fe at target', () => {
  const pred = NUTRITION_FILTERS['high-mineral'].predicate;
  assert.equal(pred({ calcium: MEAL_TARGET.calcium, iron: MEAL_TARGET.iron }), true);
  assert.equal(pred({ calcium: MEAL_TARGET.calcium, iron: MEAL_TARGET.iron - 0.1 }), false);
  assert.equal(pred({ calcium: 0, iron: MEAL_TARGET.iron }), false);
});

test('high-vitamin filter: needs at least 3 of 4 vitamins at target', () => {
  const pred = NUTRITION_FILTERS['high-vitamin'].predicate;
  // 4/4
  assert.equal(pred({
    vitaminA: MEAL_TARGET.vitaminA,
    vitaminB1: MEAL_TARGET.vitaminB1,
    vitaminB2: MEAL_TARGET.vitaminB2,
    vitaminC: MEAL_TARGET.vitaminC,
  }), true);
  // 3/4
  assert.equal(pred({
    vitaminA: MEAL_TARGET.vitaminA,
    vitaminB1: MEAL_TARGET.vitaminB1,
    vitaminB2: MEAL_TARGET.vitaminB2,
    vitaminC: 0,
  }), true);
  // 2/4
  assert.equal(pred({
    vitaminA: MEAL_TARGET.vitaminA,
    vitaminB1: MEAL_TARGET.vitaminB1,
  }), false);
});

test('low-carb filter: ≤ 0.45 × energy / 4 passes', () => {
  const pred = NUTRITION_FILTERS['low-carb'].predicate;
  const threshold = MEAL_TARGET.energy * 0.45 / 4;
  assert.equal(pred({ carbs: threshold }), true);
  assert.equal(pred({ carbs: threshold + 0.01 }), false);
  assert.equal(pred({ carbs: 0 }), true);
});

test('passesFilters: empty activeKeys always passes', () => {
  assert.equal(passesFilters({ salt: 999 }, []), true);
  assert.equal(passesFilters({ salt: 999 }, undefined), true);
});

test('passesFilters: multiple filters are AND-combined', () => {
  const n = { salt: 1.5, protein: MEAL_TARGET.protein + 1 };
  assert.equal(passesFilters(n, ['low-salt', 'high-protein']), true);
  // Fails when one condition is violated
  assert.equal(passesFilters({ ...n, salt: 3 }, ['low-salt', 'high-protein']), false);
  assert.equal(passesFilters({ ...n, protein: 0 }, ['low-salt', 'high-protein']), false);
});

test('passesFilters: unknown filter key is ignored', () => {
  assert.equal(passesFilters({ salt: 5 }, ['no-such-filter']), true);
});
