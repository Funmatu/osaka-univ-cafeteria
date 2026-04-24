import { enumerateAll, totalPrice } from './combo-rules.js';
import { scoreCombination, passesFilters } from './nutrition.js';

// 有効な組合せをすべて列挙し、スコアを付けて返す。
// 大規模メニューでも実用的な速度を保つため、スコア上位のみ保持する min-heap を使う。
// `filters` は UI トグルのキー配列。NUTRITION_FILTERS の AND 条件でハード絞り込み。
export function rankCombinations(items, options = {}) {
  const {
    budget = 800,
    patterns = ['teishoku', 'oneDish'],
    allowDessert = true,
    requireSoup = false,
    filters = [],
    keepTop = 200,
    maxEnumeration = 500000,
  } = options;

  let top = [];
  let count = 0;
  let kept = 0;

  for (const combo of enumerateAll(items, { budget, patterns, allowDessert, requireSoup })) {
    count++;
    if (count > maxEnumeration) break;
    const { score, components, nutrition } = scoreCombination(combo.items);
    if (!passesFilters(nutrition, filters)) continue;
    kept++;
    const entry = {
      items: combo.items,
      pattern: combo.pattern,
      price: totalPrice(combo),
      score,
      components,
      nutrition,
    };
    if (top.length < keepTop) {
      top.push(entry);
      if (top.length === keepTop) top.sort((a, b) => a.score - b.score);
    } else if (score > top[0].score) {
      top[0] = entry;
      // maintain min-heap invariant via linear scan (keepTop is small)
      let min = 0;
      for (let i = 1; i < top.length; i++) if (top[i].score < top[min].score) min = i;
      if (min !== 0) [top[0], top[min]] = [top[min], top[0]];
    }
  }

  top.sort((a, b) => b.score - a.score);
  return { top, enumerated: count, kept, truncated: count > maxEnumeration };
}
