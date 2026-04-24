// カテゴリ制約: 「ご飯×2」など非常識な組合せを排除する
//
// 2 パターンの骨格:
//   teishoku (定食): 主食 × 1, 主菜 × 1, 副菜 0-2, 汁物 0-1, デザート 0-1, その他 0-1
//   oneDish (一品):  (丼・カレー OR 麺類 OR セット) × 1, 副菜 0-2, 汁物 0-1, デザート 0-1

export const CATEGORIES = ['main', 'side', 'staple', 'soup', 'bowl', 'noodle', 'set', 'dessert', 'other'];

export const PATTERNS = Object.freeze({
  teishoku: {
    label: '定食',
    required: { staple: [1, 1], main: [1, 1] },
    optional: { side: [0, 2], soup: [0, 1], dessert: [0, 1], other: [0, 1] },
    forbidden: ['bowl', 'noodle', 'set'],
  },
  oneDish: {
    label: '一品',
    requiredOneOf: [['bowl'], ['noodle'], ['set']],
    optional: { side: [0, 2], soup: [0, 1], dessert: [0, 1], other: [0, 1] },
    forbidden: ['staple', 'main'],
  },
});

export function groupByCategory(items) {
  const groups = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  for (const it of items) {
    if (groups[it.category]) groups[it.category].push(it);
    else groups.other.push(it);
  }
  return groups;
}

// ライス小/中/大を「名前に『ライス』を含む staple」として 1 つまでに制限するための識別
export function isRice(item) {
  return item.category === 'staple' && /ライス|ご飯|ごはん|白飯/.test(item.name);
}

// 同時に複数選べない「排他グループ」。いずれかから 1 つまで。
// (現状はライスのサイズ違い対策のみ)
export function exclusiveGroupKey(item) {
  if (isRice(item)) return 'rice';
  return null;
}

// 指定サイズの組合せをすべて列挙 (0..max)、サブセット生成
function* chooseSubsets(arr, min, max) {
  const n = arr.length;
  const upper = Math.min(max, n);
  for (let k = min; k <= upper; k++) {
    yield* combinations(arr, k);
  }
}

function* combinations(arr, k) {
  const n = arr.length;
  if (k === 0) {
    yield [];
    return;
  }
  if (k > n) return;
  const indices = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield indices.map((i) => arr[i]);
    let i = k - 1;
    while (i >= 0 && indices[i] === n - k + i) i--;
    if (i < 0) return;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
  }
}

function respectsExclusive(items) {
  const seen = new Set();
  for (const it of items) {
    const key = exclusiveGroupKey(it);
    if (key) {
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }
  return true;
}

function withinBudget(items, budget) {
  let sum = 0;
  for (const it of items) {
    if (typeof it.price !== 'number') return false;
    sum += it.price;
    if (sum > budget) return false;
  }
  return true;
}

// パターン teishoku の組合せ列挙
function* enumerateTeishoku(groups, budget, { allowDessert = true, requireSoup = false } = {}) {
  const mains = groups.main;
  const staples = groups.staple;
  if (mains.length === 0 || staples.length === 0) return;

  const sides = groups.side;
  const soups = groups.soup;
  const desserts = allowDessert ? groups.dessert : [];
  const others = groups.other;
  const soupMin = requireSoup ? 1 : 0;

  for (const staple of staples) {
    for (const main of mains) {
      const base = [staple, main];
      if (!withinBudget(base, budget)) continue;
      const basePrice = staple.price + main.price;

      for (const sideSub of chooseSubsets(sides, 0, 2)) {
        const p1 = basePrice + sideSub.reduce((a, b) => a + b.price, 0);
        if (p1 > budget) continue;
        for (const soupSub of chooseSubsets(soups, soupMin, 1)) {
          const p2 = p1 + soupSub.reduce((a, b) => a + b.price, 0);
          if (p2 > budget) continue;
          for (const dessertSub of chooseSubsets(desserts, 0, 1)) {
            const p3 = p2 + dessertSub.reduce((a, b) => a + b.price, 0);
            if (p3 > budget) continue;
            for (const otherSub of chooseSubsets(others, 0, 1)) {
              const p4 = p3 + otherSub.reduce((a, b) => a + b.price, 0);
              if (p4 > budget) continue;
              const combo = [...base, ...sideSub, ...soupSub, ...dessertSub, ...otherSub];
              if (!respectsExclusive(combo)) continue;
              yield { items: combo, pattern: 'teishoku' };
            }
          }
        }
      }
    }
  }
}

// パターン oneDish の組合せ列挙
function* enumerateOneDish(groups, budget, { allowDessert = true, requireSoup = false } = {}) {
  const mains = [...groups.bowl, ...groups.noodle, ...groups.set];
  if (mains.length === 0) return;

  const sides = groups.side;
  const soups = groups.soup;
  const desserts = allowDessert ? groups.dessert : [];
  const soupMin = requireSoup ? 1 : 0;

  for (const main of mains) {
    if (main.price > budget) continue;
    for (const sideSub of chooseSubsets(sides, 0, 2)) {
      const p1 = main.price + sideSub.reduce((a, b) => a + b.price, 0);
      if (p1 > budget) continue;
      for (const soupSub of chooseSubsets(soups, soupMin, 1)) {
        const p2 = p1 + soupSub.reduce((a, b) => a + b.price, 0);
        if (p2 > budget) continue;
        for (const dessertSub of chooseSubsets(desserts, 0, 1)) {
          const p3 = p2 + dessertSub.reduce((a, b) => a + b.price, 0);
          if (p3 > budget) continue;
          const combo = [main, ...sideSub, ...soupSub, ...dessertSub];
          if (!respectsExclusive(combo)) continue;
          yield { items: combo, pattern: 'oneDish' };
        }
      }
    }
  }
}

export function* enumerateAll(items, { budget, patterns = ['teishoku', 'oneDish'], allowDessert = true, requireSoup = false } = {}) {
  const validItems = items.filter((i) => typeof i.price === 'number' && i.price > 0);
  const groups = groupByCategory(validItems);
  if (patterns.includes('teishoku')) yield* enumerateTeishoku(groups, budget, { allowDessert, requireSoup });
  if (patterns.includes('oneDish')) yield* enumerateOneDish(groups, budget, { allowDessert, requireSoup });
}

export function totalPrice(combo) {
  return combo.items.reduce((a, b) => a + (b.price || 0), 0);
}
