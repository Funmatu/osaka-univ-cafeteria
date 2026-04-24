// 欠落栄養素の補完ロジック。スクレイプ時に detail.php から取れなかった
// 項目を、料理名パターンマッチ + カテゴリフォールバックの2段階で埋める。
// 補完した項目は item._estimated[] に記録し、UI で「推定値」として表示する。
//
// 優先順位:
//   1. サイトから取れた実測値 (そのまま)
//   2. REFERENCE_DB の料理パターンマッチ
//   3. CATEGORY_FALLBACK (カテゴリ平均)

import { REFERENCE_DB, CATEGORY_FALLBACK } from './reference-db.mjs';

const AUGMENTABLE_KEYS = ['fiber', 'vitaminB1', 'vitaminB2'];

function matchReferenceEntry(item) {
  for (const entry of REFERENCE_DB) {
    for (const pattern of entry.patterns) {
      if (pattern.test(item.name)) {
        // さらに category が一致すれば優先度高、ただし不一致でもパターンマッチは有効
        if (!entry.category || entry.category === item.category) return entry;
      }
    }
  }
  // 1巡目でカテゴリ不一致しか見つからなかった場合の2巡目 (category 条件を外す)
  for (const entry of REFERENCE_DB) {
    for (const pattern of entry.patterns) {
      if (pattern.test(item.name)) return entry;
    }
  }
  return null;
}

function applyValues(item, values, mode, sourceTag) {
  const added = [];
  const energy = item.nutrition?.energy ?? 0;
  for (const key of AUGMENTABLE_KEYS) {
    if (item.nutrition?.[key] != null) continue; // 実測値を尊重
    if (values[key] == null) continue;
    const val = mode === 'perKcal' ? values[key] * energy : values[key];
    if (!Number.isFinite(val)) continue;
    // 有効数字2-3桁に丸める (見た目のため)
    const rounded = val < 1 ? Math.round(val * 1000) / 1000 : Math.round(val * 10) / 10;
    if (!item.nutrition) item.nutrition = {};
    item.nutrition[key] = rounded;
    added.push({ key, source: sourceTag });
  }
  return added;
}

export function augmentItem(item) {
  if (!item.nutrition) item.nutrition = {};
  const estimated = [];

  const match = matchReferenceEntry(item);
  if (match) {
    const added = applyValues(item, match.values, match.mode, match.source);
    estimated.push(...added);
  }

  // 残った欠落項目をカテゴリフォールバックで埋める
  const fb = CATEGORY_FALLBACK[item.category] || CATEGORY_FALLBACK.other;
  if (fb) {
    const added = applyValues(item, fb, fb.mode, `category-fallback:${item.category}`);
    estimated.push(...added);
  }

  if (estimated.length > 0) {
    item._estimated = estimated;
  }
  return item;
}

export function augmentAll(items) {
  return items.map((it) => augmentItem({ ...it, nutrition: { ...(it.nutrition || {}) } }));
}
