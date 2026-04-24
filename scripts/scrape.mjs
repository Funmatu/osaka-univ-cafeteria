import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { fetchWithRetry, mapWithConcurrency, sleep } from './lib/fetch-with-retry.mjs';
import { parseDetailHtml } from './parser.mjs';
import { augmentAll } from './augment.mjs';
import { REFERENCE_DB_META } from './reference-db.mjs';
import { CAFETERIAS, sourceUrl } from './cafeterias.mjs';

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

function buildUrls(cafeteriaId) {
  return {
    menu: `https://west2-univ.jp/sp/menu.php?t=${cafeteriaId}`,
    load: (a) => `https://west2-univ.jp/sp/menu_load.php?t=${cafeteriaId}&a=${a}`,
    detail: (code) => `https://west2-univ.jp/sp/detail.php?t=${cafeteriaId}&c=${code}`,
  };
}

function extractItemsFromCategoryHtml(html, endpoint, cafeteriaId) {
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
      cafeteriaId,
    });
  });
  return items;
}

async function fetchAllCategories(urls, cafeteriaId) {
  console.log(`  Fetching ${ENDPOINT_CATEGORIES.length} category endpoints in parallel…`);
  const results = await Promise.all(
    ENDPOINT_CATEGORIES.map(async (ep) => {
      try {
        const html = await fetchWithRetry(urls.load(ep.key));
        const items = extractItemsFromCategoryHtml(html, ep, cafeteriaId);
        console.log(`    ${ep.key} (${ep.categoryJa}): ${items.length} items`);
        return items;
      } catch (err) {
        console.warn(`    ${ep.key} (${ep.categoryJa}) FAILED: ${err.message}`);
        return [];
      }
    })
  );
  // Dedupe by code (一部アイテムは複数カテゴリに出る可能性)
  const map = new Map();
  for (const arr of results) for (const it of arr) if (!map.has(it.code)) map.set(it.code, it);
  return [...map.values()];
}

async function enrichWithDetail(listing, urls) {
  console.log(`  Fetching ${listing.length} detail pages (concurrency=4, 500ms inter-request delay)…`);
  const items = await mapWithConcurrency(listing, 4, async (item) => {
    try {
      const html = await fetchWithRetry(urls.detail(item.code));
      await sleep(500);
      const parsed = parseDetailHtml(html, { code: item.code });
      return {
        ...item,
        name: item.name || parsed.name,
        nameEn: item.nameEn || parsed.nameEn,
        price: item.price ?? parsed.price,
        nutrition: parsed.nutrition,
        origin: parsed.origin,
        scrapedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.warn(`    ! ${item.code} detail fetch failed: ${err.message}`);
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

async function scrapeOne(cafeteria, startedAt) {
  console.log(`\n=== ${cafeteria.fullName} (t=${cafeteria.id}) ===`);
  const urls = buildUrls(cafeteria.id);

  const listing = await fetchAllCategories(urls, cafeteria.id);
  if (listing.length === 0) {
    console.warn(`  No items extracted for ${cafeteria.name}. Skipping.`);
    return { cafeteria, items: [], meta: null, skipped: true };
  }
  console.log(`  Deduped ${listing.length} unique items across all categories.`);

  const rawItems = await enrichWithDetail(listing, urls);
  const items = augmentAll(rawItems);
  const augmentedCount = items.filter((i) => i._estimated?.length > 0).length;
  console.log(`  Augmented ${augmentedCount}/${items.length} items with reference DB.`);

  const issues = validate(items);
  if (issues.length) {
    console.warn(`  Validation warnings (${issues.length}):`);
    for (const i of issues.slice(0, 10)) console.warn(`    - ${i}`);
  }

  const sorted = items.sort((a, b) => a.code.localeCompare(b.code));

  const meta = {
    cafeteriaId: cafeteria.id,
    cafeteriaName: cafeteria.fullName,
    slug: cafeteria.slug,
    sourceUrl: urls.menu,
    hours: cafeteria.hours,
    holidays: cafeteria.holidays,
    lastUpdated: startedAt.toISOString(),
    itemCount: sorted.length,
    withNutrition: sorted.filter((i) => i.nutrition?.energy != null).length,
    augmented: sorted.filter((i) => i._estimated?.length > 0).length,
    issues: issues.length,
    referenceDb: REFERENCE_DB_META,
  };

  const dir = path.join(OUT_DIR, cafeteria.id);
  await fs.mkdir(dir, { recursive: true });
  const menuPath = path.join(dir, 'menu.json');
  const metaPath = path.join(dir, 'meta.json');
  await fs.writeFile(menuPath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
  console.log(`  Wrote ${path.relative(process.cwd(), menuPath)} (${sorted.length} items)`);
  console.log(`  Wrote ${path.relative(process.cwd(), metaPath)}`);

  return { cafeteria, items: sorted, meta, skipped: false };
}

async function writeIndex(results, startedAt) {
  const cafeterias = results.map(({ cafeteria, meta, skipped }) => ({
    id: cafeteria.id,
    slug: cafeteria.slug,
    name: cafeteria.name,
    fullName: cafeteria.fullName,
    campus: cafeteria.campus,
    hours: cafeteria.hours,
    holidays: cafeteria.holidays,
    sourceUrl: sourceUrl(cafeteria.id),
    itemCount: meta?.itemCount ?? 0,
    lastUpdated: meta?.lastUpdated ?? null,
    skipped: Boolean(skipped),
  }));
  const index = {
    lastUpdated: startedAt.toISOString(),
    cafeterias,
  };
  const indexPath = path.join(OUT_DIR, 'index.json');
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf-8');
  console.log(`\nWrote ${path.relative(process.cwd(), indexPath)} (${cafeterias.length} cafeterias)`);
}

async function main() {
  const startedAt = new Date();
  await fs.mkdir(OUT_DIR, { recursive: true });

  const results = [];
  for (let i = 0; i < CAFETERIAS.length; i++) {
    const cafeteria = CAFETERIAS[i];
    const result = await scrapeOne(cafeteria, startedAt);
    results.push(result);
    // レート制御: 次の食堂に進む前に1秒待機 (同ホストへの連続アクセス配慮)
    if (i < CAFETERIAS.length - 1) await sleep(1000);
  }

  await writeIndex(results, startedAt);

  const totalItems = results.reduce((sum, r) => sum + (r.items?.length ?? 0), 0);
  const failed = results.filter((r) => r.skipped).length;
  console.log(`\nDone. ${totalItems} total items across ${results.length - failed}/${results.length} cafeterias.`);
  if (failed > 0) process.exitCode = 1; // 部分失敗でも他は書き出したいので exit せずフラグのみ
}

main().catch((err) => {
  console.error('Scrape failed:', err);
  process.exit(1);
});
