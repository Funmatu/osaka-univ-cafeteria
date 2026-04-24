import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { fetchWithRetry, mapWithConcurrency, sleep } from './lib/fetch-with-retry.mjs';
import { parseDetailHtml } from './parser.mjs';
import { augmentAll } from './augment.mjs';
import { REFERENCE_DB_META } from './reference-db.mjs';

const CAFETERIA_ID = '663252';
const MENU_URL = `https://west2-univ.jp/sp/menu.php?t=${CAFETERIA_ID}`;
const LOAD_URL = (a) => `https://west2-univ.jp/sp/menu_load.php?t=${CAFETERIA_ID}&a=${a}`;
const DETAIL_URL = (code) => `https://west2-univ.jp/sp/detail.php?t=${CAFETERIA_ID}&c=${code}`;

// menu_load.php 各エンドポイントとカテゴリの対応 (menu.php の見出し順から確定)
const ENDPOINT_CATEGORIES = [
  { key: 'on_a',       category: 'main',    categoryJa: '主菜' },
  { key: 'on_b',       category: 'side',    categoryJa: '副菜' },
  { key: 'on_c',       category: 'noodle',  categoryJa: '麺類' },
  { key: 'on_d',       category: 'bowl',    categoryJa: '丼・カレー' },
  { key: 'on_e',       category: 'dessert', categoryJa: 'デザート' },
  { key: 'on_f',       category: 'set',     categoryJa: 'セット' },
  { key: 'on_g',       category: 'other',   categoryJa: 'その他' },
  { key: 'on_bunrui1', category: 'staple',  categoryJa: 'ライス' },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'data');

function extractItemsFromCategoryHtml(html, endpoint) {
  const $ = cheerio.load(html);
  const items = [];
  $('a[href*="detail.php"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/[?&]c=(\d+)/);
    if (!m) return;
    const code = m[1];

    const h3 = $(el).find('h3').first();
    const priceSpan = h3.find('.price').first();
    const enSpan = h3.find('span').filter((_, s) => !$(s).hasClass('price')).first();

    let name = h3.clone().children().remove().end().text().trim();
    if (!name) name = h3.text().replace(/[¥￥].*$/, '').trim();
    name = name.replace(/\s+/g, ' ');

    const nameEn = enSpan.text().trim() || null;

    let price = null;
    const priceText = priceSpan.text();
    const pm = priceText.match(/(\d{2,4})/);
    if (pm) price = parseInt(pm[1], 10);

    const img = $(el).find('img').first().attr('src') || null;

    items.push({
      code,
      name,
      nameEn,
      price,
      category: endpoint.category,
      categoryJa: endpoint.categoryJa,
      imageUrl: img || `https://west2-univ.jp/menu_img/png_sp/${code}.png`,
    });
  });
  return items;
}

async function fetchAllCategories() {
  console.log(`Fetching ${ENDPOINT_CATEGORIES.length} category endpoints in parallel…`);
  const results = await Promise.all(
    ENDPOINT_CATEGORIES.map(async (ep) => {
      try {
        const html = await fetchWithRetry(LOAD_URL(ep.key));
        const items = extractItemsFromCategoryHtml(html, ep);
        console.log(`  ${ep.key} (${ep.categoryJa}): ${items.length} items`);
        return items;
      } catch (err) {
        console.warn(`  ${ep.key} (${ep.categoryJa}) FAILED: ${err.message}`);
        return [];
      }
    })
  );
  // Dedupe by code (一部アイテムは複数カテゴリに出る可能性)
  const map = new Map();
  for (const arr of results) for (const it of arr) if (!map.has(it.code)) map.set(it.code, it);
  return [...map.values()];
}

async function enrichWithDetail(listing) {
  console.log(`\nFetching ${listing.length} detail pages (concurrency=4, 500ms inter-request delay)…`);
  const items = await mapWithConcurrency(listing, 4, async (item) => {
    try {
      const html = await fetchWithRetry(DETAIL_URL(item.code));
      await sleep(500);
      const parsed = parseDetailHtml(html, { code: item.code });
      return {
        ...item,
        // menu_load.php から取れた値を優先、detail 側は栄養とフォールバック名のみ
        name: item.name || parsed.name,
        nameEn: item.nameEn || parsed.nameEn,
        price: item.price ?? parsed.price,
        nutrition: parsed.nutrition,
        origin: parsed.origin,
        scrapedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.warn(`  ! ${item.code} detail fetch failed: ${err.message}`);
      return { ...item, nutrition: {}, origin: null, scrapedAt: new Date().toISOString(), _error: err.message };
    }
  });
  return items;
}

function validate(items) {
  const issues = [];
  for (const it of items) {
    if (!it.code) issues.push(`missing code: ${JSON.stringify(it)}`);
    if (!it.name || it.name.length < 2) issues.push(`${it.code}: short or missing name ("${it.name}")`);
    if (it.price == null || it.price <= 0 || it.price > 3000) {
      issues.push(`${it.code} "${it.name}": price out of range (${it.price})`);
    }
    if (it.nutrition?.energy == null) {
      issues.push(`${it.code} "${it.name}": missing energy`);
    }
  }
  return issues;
}

async function main() {
  const startedAt = new Date();
  await fs.mkdir(OUT_DIR, { recursive: true });

  const listing = await fetchAllCategories();
  if (listing.length === 0) {
    throw new Error('No items extracted — menu_load.php endpoints returned nothing. Site structure may have changed.');
  }
  console.log(`\nDeduped ${listing.length} unique items across all categories.`);

  const rawItems = await enrichWithDetail(listing);
  const items = augmentAll(rawItems);
  const augmentedCount = items.filter((i) => i._estimated?.length > 0).length;
  console.log(`\nAugmented ${augmentedCount}/${items.length} items with reference DB (fiber/B1/B2).`);

  const issues = validate(items);
  if (issues.length) {
    console.warn(`\nValidation warnings (${issues.length}):`);
    for (const i of issues.slice(0, 20)) console.warn(`  - ${i}`);
  }

  const sorted = items.sort((a, b) => a.code.localeCompare(b.code));
  const menuPath = path.join(OUT_DIR, 'menu.json');
  const metaPath = path.join(OUT_DIR, 'meta.json');

  await fs.writeFile(menuPath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');

  const meta = {
    cafeteriaId: CAFETERIA_ID,
    cafeteriaName: '大阪大学生協 豊中図書館下食堂',
    sourceUrl: MENU_URL,
    lastUpdated: startedAt.toISOString(),
    itemCount: sorted.length,
    withNutrition: sorted.filter((i) => i.nutrition?.energy != null).length,
    augmented: sorted.filter((i) => i._estimated?.length > 0).length,
    issues: issues.length,
    referenceDb: REFERENCE_DB_META,
  };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

  console.log(`\nWrote ${menuPath} (${sorted.length} items, ${meta.withNutrition} with energy data)`);
  console.log(`Wrote ${metaPath}`);
}

main().catch((err) => {
  console.error('Scrape failed:', err);
  process.exit(1);
});
