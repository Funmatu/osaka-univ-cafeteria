// 日本人の食事摂取基準 2020 — 成人男性 18-29歳 / 身体活動レベル II (ふつう)
// 出典: 厚生労働省 https://www.mhlw.go.jp/stf/newpage_08517.html
export const DAILY_RDI = Object.freeze({
  energy: 2650,    // kcal
  protein: 65,     // g
  salt: 7.5,       // g 上限
  vegetable: 350,  // g (健康日本21)
  fiber: 21,       // g
  calcium: 800,    // mg
  iron: 7.5,       // mg
  vitaminA: 850,   // μg
  vitaminB1: 1.4,  // mg
  vitaminB2: 1.6,  // mg
  vitaminC: 100,   // mg
});

export const MEAL_TARGET = Object.freeze(
  Object.fromEntries(Object.entries(DAILY_RDI).map(([k, v]) => [k, v / 3]))
);

// PFC エネルギー比 (目標中央値)
export const PFC_IDEAL = Object.freeze({ protein: 0.15, fat: 0.25, carbs: 0.60 });

// 「1日分への近づき」ボーナスを与える不足しがちな栄養素
const BONUS_KEYS = ['protein', 'vegetable', 'fiber', 'calcium', 'iron'];

// 重み — スコアリング時に各評価項目へ掛ける
export const WEIGHTS = Object.freeze({
  energy: 1.0,
  protein: 1.5,
  vegetable: 2.0,
  fiber: 1.2,
  calcium: 0.8,
  iron: 0.8,
  salt: 1.5,
  pfc: 1.5,
});

// aim型: 目標付近でピーク、過不足で減点 (0-100)
export function aimScore(x, target) {
  if (target <= 0) return 0;
  if (x <= 0) return 0;
  if (x < target) return (x / target) * 100;
  if (x <= target * 1.3) return 100;
  const overshoot = (x - target * 1.3) / target;
  return Math.max(0, 100 - overshoot * 50);
}

// 1食目標を超えた分の「1日分への進捗」を 0-30 で加点
export function dailyBonus(x, mealTarget, dailyTarget) {
  const gap = dailyTarget - mealTarget;
  if (gap <= 0) return 0;
  const extra = x - mealTarget;
  if (extra <= 0) return 0;
  return Math.min(30, (extra / gap) * 30);
}

// bound型 (食塩): 上限超過でペナルティ (0 = ペナルティなし、最大-60)
export function boundPenalty(x, upperPerMeal) {
  if (x <= upperPerMeal) return 0;
  return -Math.min(60, (x - upperPerMeal) * 30);
}

// PFC バランススコア (0-100)
export function pfcScore(proteinG, fatG, carbsG) {
  const pE = proteinG * 4;
  const fE = fatG * 9;
  const cE = carbsG * 4;
  const total = pE + fE + cE;
  if (total <= 0) return 0;
  const p = pE / total;
  const f = fE / total;
  const c = cE / total;
  const dev = Math.abs(p - PFC_IDEAL.protein) + Math.abs(f - PFC_IDEAL.fat) + Math.abs(c - PFC_IDEAL.carbs);
  return Math.max(0, 100 * (1 - dev));
}

export function sumNutrition(items) {
  const keys = ['energy','protein','fat','carbs','salt','calcium','iron','vegetable','fiber','vitaminA','vitaminB1','vitaminB2','vitaminC'];
  const sum = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const it of items) {
    if (!it?.nutrition) continue;
    for (const k of keys) {
      const v = it.nutrition[k];
      if (typeof v === 'number' && Number.isFinite(v)) sum[k] += v;
    }
  }
  return sum;
}

export function scoreCombination(items) {
  const n = sumNutrition(items);
  const components = {
    energy: aimScore(n.energy, MEAL_TARGET.energy),
    protein: aimScore(n.protein, MEAL_TARGET.protein) + dailyBonus(n.protein, MEAL_TARGET.protein, DAILY_RDI.protein),
    vegetable: aimScore(n.vegetable, MEAL_TARGET.vegetable) + dailyBonus(n.vegetable, MEAL_TARGET.vegetable, DAILY_RDI.vegetable),
    fiber: aimScore(n.fiber, MEAL_TARGET.fiber) + dailyBonus(n.fiber, MEAL_TARGET.fiber, DAILY_RDI.fiber),
    calcium: aimScore(n.calcium, MEAL_TARGET.calcium) + dailyBonus(n.calcium, MEAL_TARGET.calcium, DAILY_RDI.calcium),
    iron: aimScore(n.iron, MEAL_TARGET.iron) + dailyBonus(n.iron, MEAL_TARGET.iron, DAILY_RDI.iron),
    salt: 100 + boundPenalty(n.salt, MEAL_TARGET.salt),
    pfc: pfcScore(n.protein, n.fat, n.carbs),
  };

  let num = 0;
  let den = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    num += components[k] * w;
    den += w;
  }
  const score = den > 0 ? num / den : 0;
  return {
    score: Math.max(0, Math.min(100, score)),
    components,
    nutrition: n,
  };
}

export { BONUS_KEYS };
