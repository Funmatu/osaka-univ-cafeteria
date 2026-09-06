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

// 食堂ごとのスクレイプ結果ステータス。休業 (no-menu) と取得失敗 (error) を必ず区別する:
//   no-menu … サーバーは正常応答したが掲載メニューが 0 件 (夏季休業等)。空メニューを書き出す。
//   error   … fetch 失敗/全件詳細取得失敗。情報がないので既存データを保持する。
export const SCRAPE_STATUS = {
  OK: 'ok',
  PARTIAL: 'partial',
  NO_MENU: 'no-menu',
  ERROR: 'error',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'data');

function buildUrls(cafeteriaId) {
  return {
    menu: `https://west2-univ.jp/sp/menu.php?t=${cafeteriaId}`,
    load: (a) => `https://west2-univ.jp/sp/menu_load.php?t=${cafeteriaId}&a=${a}`,
    detail: (code) => `https://west2-univ.jp/sp/detail.php?t=${cafeteriaId}&c=${code}`,
  };
}

/**
 * menu.php の `#storeInfo` に生協が掲示する店舗告知 (営業時間 / 「9月30日まで 夏季休業中」等)。
 * 休業判定そのものには使わない — 「日祝休業」のように通常営業中でも「休業」を含むため。
 * 取得できた文字列をそのまま UI に出し、判断は利用者に委ねる。
 */
export function extractStoreNotice(html) {
  const $ = cheerio.load(html);
  const text = $('#storeInfo').first().text().replace(/\s+/g, ' ').trim();
  return text || null;
}

/**
 * 食堂 1 件のスクレイプ結果を分類する。呼び出し側はこの status だけを見て
 * 「書き出す/既存を保持する」「job を落とす/落とさない」を決める。
 */
export function classifyScrape({
  itemCount = 0,
  failedEndpoints = 0,
  unparseableEndpoints = 0,
  menuPageOk = true,
  allDetailsFailed = false,
  fatal = false,
} = {}) {
  if (fatal) return SCRAPE_STATUS.ERROR;
  if (itemCount === 0) {
    // 1 つでも fetch に失敗していれば「掲載なし」と断定できない
    if (failedEndpoints > 0) return SCRAPE_STATUS.ERROR;
    // menu.php すら取れていないなら「サイトは生きていて掲載が無い」と言えない
    // (CDN / 経路障害が空応答として返るケースを休業と誤認しないための裏取り)
    if (!menuPageOk) return SCRAPE_STATUS.ERROR;
    // 本文はあるのにメニューリンクが 1 つも取れない = パーサ側の取りこぼしの疑い。
    // 実測 (2026-09-06): 休業中の食堂は本文 0 バイト、営業中の空カテゴリは
    // `<div class="Loaded"></div><ul></ul>` の 81 バイトを返す。前者だけが no-menu。
    return unparseableEndpoints > 0 ? SCRAPE_STATUS.ERROR : SCRAPE_STATUS.NO_MENU;
  }
  if (allDetailsFailed) return SCRAPE_STATUS.ERROR;
  return failedEndpoints > 0 ? SCRAPE_STATUS.PARTIAL : SCRAPE_STATUS.OK;
}

/** データを書き出してよい (= 取得内容が信頼できる) ステータスか。 */
export function isPublishable(status) {
  return status === SCRAPE_STATUS.OK || status === SCRAPE_STATUS.PARTIAL || status === SCRAPE_STATUS.NO_MENU;
}

/** menu_load.php の応答が「本文なし」か。休業中の食堂は本文 0 バイトを返す。 */
export function isEmptyResponse(html) {
  return !html || html.trim() === '';
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

/**
 * menu.php の取得。告知文の抽出だけでなく「サイトが生きているか」の裏取りも兼ねる
 * (ok=false のとき 0 件を休業と解釈してはならない)。
 */
async function fetchStoreNotice(urls) {
  try {
    const html = await fetchWithRetry(urls.menu);
    return { notice: extractStoreNotice(html), ok: !isEmptyResponse(html) };
  } catch (err) {
    console.warn(`    menu.php fetch failed: ${err.message}`);
    return { notice: null, ok: false };
  }
}

async function fetchAllCategories(urls, cafeteriaId) {
  console.log(`  Fetching ${ENDPOINT_CATEGORIES.length} category endpoints in parallel…`);
  const failedEndpoints = [];
  const unparseableEndpoints = [];
  const results = await Promise.all(
    ENDPOINT_CATEGORIES.map(async (ep) => {
      try {
        const html = await fetchWithRetry(urls.load(ep.key));
        const items = extractItemsFromCategoryHtml(html, ep, cafeteriaId);
        if (items.length === 0 && !isEmptyResponse(html)) unparseableEndpoints.push(ep.key);
        console.log(`    ${ep.key} (${ep.categoryJa}): ${items.length} items`);
        return items;
      } catch (err) {
        console.warn(`    ${ep.key} (${ep.categoryJa}) FAILED: ${err.message}`);
        failedEndpoints.push({ endpoint: ep.key, message: err.message });
        return [];
      }
    })
  );
  // Dedupe by code (一部アイテムは複数カテゴリに出る可能性)
  const map = new Map();
  for (const arr of results) for (const it of arr) if (!map.has(it.code)) map.set(it.code, it);
  return { items: [...map.values()], failedEndpoints, unparseableEndpoints };
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

/**
 * 1 食堂を取得する。ここでは一切書き出さない — 取得フェーズと書き出しフェーズを
 * 分けることで、書き出し中の失敗が取得結果を壊さないようにする。例外は握りつぶし、
 * 他の食堂の処理を止めない。
 */
async function scrapeOne(cafeteria) {
  console.log(`\n=== ${cafeteria.fullName} (t=${cafeteria.id}) ===`);
  const urls = buildUrls(cafeteria.id);
  const base = { cafeteria, urls, items: [], issues: [], notice: null, failedEndpoints: [], error: null };

  let notice = null;
  try {
    const menuPage = await fetchStoreNotice(urls);
    notice = menuPage.notice;
    const menuPageOk = menuPage.ok;
    if (notice) console.log(`  Store notice: ${notice}`);

    const { items: listing, failedEndpoints, unparseableEndpoints } = await fetchAllCategories(urls, cafeteria.id);
    if (listing.length === 0) {
      const status = classifyScrape({
        itemCount: 0,
        failedEndpoints: failedEndpoints.length,
        unparseableEndpoints: unparseableEndpoints.length,
        menuPageOk,
      });
      console.warn(
        status === SCRAPE_STATUS.NO_MENU
          ? `  No menu published for ${cafeteria.name} (menu.php served normally, all category endpoints empty — closed).`
          : `  Could not read menu for ${cafeteria.name} (menuPageOk=${menuPageOk}, ${failedEndpoints.length} fetch failures, ` +
            `${unparseableEndpoints.length} unparseable responses). Keeping existing data.`
      );
      return { ...base, notice, failedEndpoints, status };
    }
    console.log(`  Deduped ${listing.length} unique items across all categories.`);

    const rawItems = await enrichWithDetail(listing, urls);
    const detailFailures = rawItems.filter((i) => i._error).length;
    if (detailFailures) console.warn(`  ${detailFailures}/${rawItems.length} detail pages failed.`);

    const items = augmentAll(rawItems).sort((a, b) => a.code.localeCompare(b.code));
    console.log(`  Augmented ${items.filter((i) => i._estimated?.length > 0).length}/${items.length} items with reference DB.`);

    const issues = validate(items);
    if (issues.length) {
      console.warn(`  Validation warnings (${issues.length}):`);
      for (const i of issues.slice(0, 10)) console.warn(`    - ${i}`);
    }

    const status = classifyScrape({
      itemCount: items.length,
      failedEndpoints: failedEndpoints.length,
      allDetailsFailed: detailFailures === rawItems.length,
    });
    if (status === SCRAPE_STATUS.ERROR) {
      console.warn(`  All detail pages failed for ${cafeteria.name}. Keeping existing data.`);
    }
    return { ...base, notice, items, issues, failedEndpoints, status };
  } catch (err) {
    console.error(`  Unexpected failure for ${cafeteria.name}: ${err.message}`);
    return { ...base, notice, status: classifyScrape({ fatal: true }), error: err.message };
  }
}

/**
 * JSON を読む。「ファイルが無い (missing)」と「壊れている (corrupt)」を区別する —
 * 両方を null に潰すと、破損した menu.json を古い meta の件数で健全そうに
 * 見せてしまい、index.json が実体と食い違う。
 */
export async function readJson(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return { missing: true, corrupt: false, data: null };
    throw err;
  }
  try {
    return { missing: false, corrupt: false, data: JSON.parse(raw) };
  } catch (err) {
    console.warn(`  ! ${path.basename(filePath)} is corrupt: ${err.message}`);
    return { missing: false, corrupt: true, data: null };
  }
}

async function readJsonIfExists(filePath) {
  return (await readJson(filePath)).data;
}

/**
 * 一時ファイルへ書いてから rename する。fs.writeFile は原子的でないため、
 * 書き込み途中でプロセスが落ちると切り詰められた JSON が commit されうる。
 */
async function writeJsonAtomic(filePath, value) {
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  await fs.rename(tmpPath, filePath);
}

/**
 * 取得できた食堂の meta。lastUpdated = データを書き換えた時刻、
 * lastSuccessfulUpdate = 最後にメニューが 1 件以上取れた時刻 (休業中も保持)。
 */
export function buildMeta({ cafeteria, sourceUrl: src, notice, items, issues, status, failedEndpoints, attemptedAt, previousMeta }) {
  const iso = attemptedAt.toISOString();
  return {
    cafeteriaId: cafeteria.id,
    cafeteriaName: cafeteria.fullName,
    slug: cafeteria.slug,
    sourceUrl: src,
    hours: cafeteria.hours,
    holidays: cafeteria.holidays,
    notice: notice ?? null,
    status,
    lastUpdated: iso,
    lastAttempt: iso,
    lastSuccessfulUpdate: items.length > 0
      ? iso
      : previousMeta?.lastSuccessfulUpdate ?? previousMeta?.lastUpdated ?? null,
    itemCount: items.length,
    withNutrition: items.filter((i) => i.nutrition?.energy != null).length,
    augmented: items.filter((i) => i._estimated?.length > 0).length,
    issues: issues.length,
    failedEndpoints,
    referenceDb: REFERENCE_DB_META,
  };
}

/**
 * 取得できなかった食堂の meta。前回データは残したまま「取れなかった」事実だけを更新する。
 * lastUpdated は据え置き — 画面上の「最終更新」がデータの実体と食い違わないようにするため。
 */
export function buildStaleMeta({ previousMeta, cafeteria, sourceUrl: src, notice, status, error, failedEndpoints, attemptedAt }) {
  const iso = attemptedAt.toISOString();
  const prev = previousMeta ?? {
    cafeteriaId: cafeteria.id,
    cafeteriaName: cafeteria.fullName,
    slug: cafeteria.slug,
    sourceUrl: src,
    hours: cafeteria.hours,
    holidays: cafeteria.holidays,
    lastUpdated: null,
    itemCount: 0,
    withNutrition: 0,
    augmented: 0,
    issues: 0,
    referenceDb: REFERENCE_DB_META,
  };
  return {
    ...prev,
    notice: notice ?? prev.notice ?? null,
    status,
    lastAttempt: iso,
    lastSuccessfulUpdate: prev.lastSuccessfulUpdate ?? prev.lastUpdated ?? null,
    failedEndpoints,
    error: error ?? (failedEndpoints.length ? `${failedEndpoints.length} endpoint(s) failed` : 'fetch failed'),
  };
}

export async function publishCafeteria(result, attemptedAt, outDir = OUT_DIR) {
  const { cafeteria, items, issues, notice, status, failedEndpoints, error } = result;
  const dir = path.join(outDir, cafeteria.id);
  await fs.mkdir(dir, { recursive: true });
  const menuPath = path.join(dir, 'menu.json');
  const metaPath = path.join(dir, 'meta.json');
  const previousMeta = await readJsonIfExists(metaPath);
  const src = sourceUrl(cafeteria.id);

  if (!isPublishable(status)) {
    const meta = buildStaleMeta({ previousMeta, cafeteria, sourceUrl: src, notice, status, error, failedEndpoints, attemptedAt });
    await writeJsonAtomic(metaPath, meta);
    console.log(`  Kept existing ${path.relative(process.cwd(), menuPath)} (status=${status}); meta marked stale.`);
    return meta;
  }

  const meta = buildMeta({ cafeteria, sourceUrl: src, notice, items, issues, status, failedEndpoints, attemptedAt, previousMeta });
  await writeJsonAtomic(menuPath, items);
  await writeJsonAtomic(metaPath, meta);
  console.log(`  Wrote ${path.relative(process.cwd(), menuPath)} (${items.length} items, status=${status})`);
  console.log(`  Wrote ${path.relative(process.cwd(), metaPath)}`);
  return meta;
}

/**
 * disk 上の menu.json / meta.json を読む (index を実体と一致させるため)。
 * menu.json が壊れていれば「読めるデータは無い」= corrupt として扱い、
 * meta の古い件数を流用しない。
 */
export async function readCafeteriaState(dir) {
  const menu = await readJson(path.join(dir, 'menu.json'));
  const meta = await readJson(path.join(dir, 'meta.json'));
  const corrupt = menu.corrupt || meta.corrupt || (!menu.missing && !Array.isArray(menu.data));
  return {
    itemCount: Array.isArray(menu.data) ? menu.data.length : null,
    meta: meta.data,
    corrupt,
  };
}

/**
 * itemCount は **disk 上の menu.json の実件数**を優先する。書き出しが途中で失敗しても
 * index.json が実ファイルと矛盾しないようにするため (meta の値は fallback)。
 */
export function buildIndexEntry(cafeteria, meta, itemCount = null, corrupt = false) {
  // 壊れたファイルを「正常」と主張しない
  const status = corrupt ? SCRAPE_STATUS.ERROR : meta?.status ?? SCRAPE_STATUS.ERROR;
  return {
    id: cafeteria.id,
    slug: cafeteria.slug,
    name: cafeteria.name,
    fullName: cafeteria.fullName,
    campus: cafeteria.campus,
    hours: cafeteria.hours,
    holidays: cafeteria.holidays,
    sourceUrl: sourceUrl(cafeteria.id),
    notice: meta?.notice ?? null,
    status,
    itemCount: corrupt ? 0 : itemCount ?? meta?.itemCount ?? 0,
    lastUpdated: meta?.lastUpdated ?? null,
    lastAttempt: meta?.lastAttempt ?? null,
    lastSuccessfulUpdate: meta?.lastSuccessfulUpdate ?? null,
    // 後方互換 (v2.0 の UI が参照していたフィールド)。status から導出。
    skipped: status !== SCRAPE_STATUS.OK && status !== SCRAPE_STATUS.PARTIAL,
  };
}

export function overallStatus(statuses) {
  if (statuses.some((s) => s === SCRAPE_STATUS.OK || s === SCRAPE_STATUS.PARTIAL)) {
    return statuses.every((s) => s === SCRAPE_STATUS.OK) ? 'ok' : 'degraded';
  }
  return 'failed';
}

/**
 * 実際にデータが書き換わった最新時刻。全食堂が取得失敗した run で
 * 「最終更新 = 今」と表示してしまわないよう、実行時刻とは分けて持つ。
 */
export function latestDataUpdate(entries) {
  const times = entries.map((e) => e.lastUpdated).filter(Boolean).sort();
  return times.length ? times[times.length - 1] : null;
}

async function writeIndex(entries, startedAt) {
  const index = {
    lastUpdated: latestDataUpdate(entries) ?? startedAt.toISOString(),
    generatedAt: startedAt.toISOString(),
    status: overallStatus(entries.map((e) => e.status)),
    cafeterias: entries,
  };
  const indexPath = path.join(OUT_DIR, 'index.json');
  await writeJsonAtomic(indexPath, index);
  console.log(`\nWrote ${path.relative(process.cwd(), indexPath)} (${entries.length} cafeterias, status=${index.status})`);
}

// 生協の告知文はこちらで内容を制御できないので、表を壊す文字を無害化する
function escapeTableCell(text) {
  return String(text)
    .replace(/\\/g, '\\\\') // 先に backslash を潰さないと `\|` が「エスケープされた \ + 生の |」になる
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ');
}

export function formatSummary(entries) {
  const lines = [
    '| 食堂 | status | 品数 | 告知 |',
    '| --- | --- | ---: | --- |',
    ...entries.map(
      (e) => `| ${escapeTableCell(e.name)} | \`${e.status}\` | ${e.itemCount} | ${e.notice ? escapeTableCell(e.notice) : '—'} |`
    ),
  ];
  return lines.join('\n');
}

async function writeStepSummary(entries) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const body = `### Update Menu Data\n\n${formatSummary(entries)}\n`;
  await fs.appendFile(file, body, 'utf-8').catch((err) => console.warn(`step summary write failed: ${err.message}`));
}

async function main() {
  const startedAt = new Date();
  await fs.mkdir(OUT_DIR, { recursive: true });

  const results = [];
  for (let i = 0; i < CAFETERIAS.length; i++) {
    results.push(await scrapeOne(CAFETERIAS[i]));
    // レート制御: 次の食堂に進む前に1秒待機 (同ホストへの連続アクセス配慮)
    if (i < CAFETERIAS.length - 1) await sleep(1000);
  }

  // 書き出しは食堂ごとに隔離する。1 件の write 失敗で残りを巻き込むと、
  // menu.json は新しいのに index.json が古い、という不整合のまま commit されてしまう。
  let writeFailures = 0;
  const entries = [];
  for (const result of results) {
    try {
      await publishCafeteria(result, startedAt, OUT_DIR);
    } catch (err) {
      writeFailures++;
      console.error(`  Write failed for ${result.cafeteria.name}: ${err.message}`);
    }
    // index は書き出し後の disk の実体から組む (write が落ちても矛盾させない)
    const { itemCount, meta, corrupt } = await readCafeteriaState(path.join(OUT_DIR, result.cafeteria.id));
    if (corrupt) {
      writeFailures++;
      console.error(`  Data files for ${result.cafeteria.name} are unreadable after write.`);
    }
    entries.push(buildIndexEntry(result.cafeteria, meta, itemCount, corrupt));
  }

  try {
    await writeIndex(entries, startedAt);
  } catch (err) {
    writeFailures++;
    console.error(`index.json write failed: ${err.message}`);
  }
  await writeStepSummary(entries);

  const totalItems = entries.reduce((sum, e) => sum + e.itemCount, 0);
  const updated = results.filter((r) => r.items.length > 0).length;
  const closed = results.filter((r) => r.status === SCRAPE_STATUS.NO_MENU).map((r) => r.cafeteria.name);
  const failed = results.filter((r) => r.status === SCRAPE_STATUS.ERROR).map((r) => r.cafeteria.name);

  console.log(`\nDone. ${totalItems} total items; ${updated}/${results.length} cafeterias updated.`);
  if (closed.length) console.log(`Closed / no menu published: ${closed.join(', ')}`);
  if (failed.length) console.warn(`Fetch failed (previous data kept): ${failed.join(', ')}`);

  // 1 食堂でも取得できていれば成功扱い — 休業中の食堂があっても更新分を必ず commit させる。
  // 全食堂が休業 (長期休暇) なら異常ではないので緑のまま。実エラーがあって 1 件も
  // 更新できなかったときと、書き出しに失敗したときだけ赤にする。
  if (writeFailures > 0) {
    console.error(`${writeFailures} write failure(s).`);
    process.exitCode = 1;
  } else if (updated === 0 && failed.length > 0) {
    console.error('No cafeteria could be updated and at least one fetch failed.');
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error('Scrape failed:', err);
    process.exit(1);
  });
}
