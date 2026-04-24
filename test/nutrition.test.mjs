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
