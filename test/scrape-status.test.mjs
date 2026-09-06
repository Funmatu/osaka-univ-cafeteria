import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCRAPE_STATUS,
  classifyScrape,
  isPublishable,
  extractStoreNotice,
  buildMeta,
  buildStaleMeta,
  buildIndexEntry,
  overallStatus,
  latestDataUpdate,
  isEmptyResponse,
  publishCafeteria,
  readCafeteriaState,
  readJson,
  formatSummary,
} from '../scripts/scrape.mjs';

// Fixtures: 2026-09-06 に west2-univ.jp から実取得した生 HTML。
//   menu-663253-closed.html … 福利会館3階食堂 (夏季休業中の告知あり)
//   menu-663252-open.html   … 豊中図書館下食堂 (通常営業、告知は営業時間)
//   menu_load-663253-empty.html … 休業中食堂の menu_load.php 応答 (HTTP 200 / 本文 0 バイト)
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const readFixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf-8');

const CAFETERIA = {
  id: '663253',
  slug: 'welfare-3f',
  name: '福利会館3階食堂',
  fullName: '大阪大学生協福利会館3階食堂',
  campus: '豊中',
  hours: '平日 11:00-14:00 / 17:00-19:30',
  holidays: '土日祝',
};
const SRC = 'https://west2-univ.jp/sp/menu.php?t=663253';
const AT = new Date('2026-09-06T01:47:00.000Z');

test('classify: 正常応答で 0 件は no-menu (休業) であって error ではない', () => {
  assert.equal(classifyScrape({ itemCount: 0, failedEndpoints: 0 }), SCRAPE_STATUS.NO_MENU);
});

test('classify: 0 件でも fetch 失敗があれば error (掲載なしと断定できない)', () => {
  assert.equal(classifyScrape({ itemCount: 0, failedEndpoints: 1 }), SCRAPE_STATUS.ERROR);
});

test('classify: 一部エンドポイント失敗かつ取得ありは partial', () => {
  assert.equal(classifyScrape({ itemCount: 20, failedEndpoints: 2 }), SCRAPE_STATUS.PARTIAL);
  assert.equal(classifyScrape({ itemCount: 20, failedEndpoints: 0 }), SCRAPE_STATUS.OK);
});

test('classify: 詳細ページが全滅したら栄養値が空なので error', () => {
  assert.equal(classifyScrape({ itemCount: 20, failedEndpoints: 0, allDetailsFailed: true }), SCRAPE_STATUS.ERROR);
});

test('classify: 例外は fatal として error', () => {
  assert.equal(classifyScrape({ fatal: true, itemCount: 30 }), SCRAPE_STATUS.ERROR);
});

test('publishable: no-menu は書き出す / error は既存データを保持', () => {
  assert.equal(isPublishable(SCRAPE_STATUS.OK), true);
  assert.equal(isPublishable(SCRAPE_STATUS.PARTIAL), true);
  assert.equal(isPublishable(SCRAPE_STATUS.NO_MENU), true);
  assert.equal(isPublishable(SCRAPE_STATUS.ERROR), false);
});

test('classify: 本文はあるのに 0 件ならパーサ側の疑い → error (既存データを保護)', () => {
  assert.equal(
    classifyScrape({ itemCount: 0, failedEndpoints: 0, unparseableEndpoints: 3 }),
    SCRAPE_STATUS.ERROR
  );
  // 全食堂が同時に休業しても、本文が空なら休業として正しく扱う
  assert.equal(
    classifyScrape({ itemCount: 0, failedEndpoints: 0, unparseableEndpoints: 0 }),
    SCRAPE_STATUS.NO_MENU
  );
});

// ---- ground-truth correspondence: 実 HTML に対する告知抽出 ----

test('notice: 休業中の食堂から告知文を抽出する (実 HTML)', () => {
  const notice = extractStoreNotice(readFixture('menu-663253-closed.html'));
  assert.equal(notice, '9月30日まで 夏季休業中');
});

test('notice: 営業中の食堂では営業時間の告知が取れる (実 HTML)', () => {
  const notice = extractStoreNotice(readFixture('menu-663252-open.html'));
  assert.match(notice, /営業時間/);
  assert.doesNotMatch(notice, /夏季休業/);
});

test('notice: #storeInfo が無い HTML では null', () => {
  assert.equal(extractStoreNotice('<html><body><div id="other">x</div></body></html>'), null);
});

test('menu_load の休業中応答は本文が空 → 0 件 → no-menu (実データ)', () => {
  const body = readFixture('menu_load-663253-empty.html');
  assert.equal(body.trim(), '');
  assert.equal(classifyScrape({ itemCount: 0, failedEndpoints: 0 }), SCRAPE_STATUS.NO_MENU);
});

// ---- meta / index ----

test('buildMeta: 休業中は itemCount 0 でも lastSuccessfulUpdate を引き継ぐ', () => {
  const meta = buildMeta({
    cafeteria: CAFETERIA,
    sourceUrl: SRC,
    notice: '9月30日まで 夏季休業中',
    items: [],
    issues: [],
    status: SCRAPE_STATUS.NO_MENU,
    failedEndpoints: [],
    attemptedAt: AT,
    previousMeta: { lastUpdated: '2026-08-08T01:47:00.000Z', itemCount: 26 },
  });
  assert.equal(meta.itemCount, 0);
  assert.equal(meta.status, SCRAPE_STATUS.NO_MENU);
  assert.equal(meta.lastUpdated, AT.toISOString());
  assert.equal(meta.lastSuccessfulUpdate, '2026-08-08T01:47:00.000Z');
  assert.equal(meta.notice, '9月30日まで 夏季休業中');
});

test('buildMeta: 取得できた食堂は lastSuccessfulUpdate が今回時刻', () => {
  const items = [{ code: '1', nutrition: { energy: 300 }, _estimated: [{ key: 'fiber' }] }];
  const meta = buildMeta({
    cafeteria: CAFETERIA, sourceUrl: SRC, notice: null, items, issues: ['x'],
    status: SCRAPE_STATUS.OK, failedEndpoints: [], attemptedAt: AT, previousMeta: null,
  });
  assert.equal(meta.itemCount, 1);
  assert.equal(meta.withNutrition, 1);
  assert.equal(meta.augmented, 1);
  assert.equal(meta.issues, 1);
  assert.equal(meta.lastSuccessfulUpdate, AT.toISOString());
});

test('buildStaleMeta: 取得失敗時は lastUpdated を据え置き lastAttempt だけ進める', () => {
  const previousMeta = {
    cafeteriaId: '663253', itemCount: 26, withNutrition: 25,
    lastUpdated: '2026-08-08T01:47:00.000Z', referenceDb: { version: '1.0.0' },
  };
  const meta = buildStaleMeta({
    previousMeta, cafeteria: CAFETERIA, sourceUrl: SRC, notice: null,
    status: SCRAPE_STATUS.ERROR, error: 'HTTP 503', failedEndpoints: [{ endpoint: 'on_a', message: 'HTTP 503' }],
    attemptedAt: AT,
  });
  assert.equal(meta.lastUpdated, '2026-08-08T01:47:00.000Z', 'データを書き換えていないので据え置き');
  assert.equal(meta.lastAttempt, AT.toISOString());
  assert.equal(meta.itemCount, 26, '既存 menu.json と整合する件数を維持');
  assert.equal(meta.status, SCRAPE_STATUS.ERROR);
  assert.equal(meta.error, 'HTTP 503');
});

test('buildStaleMeta: 前回 meta が無い初回失敗でも壊れない', () => {
  const meta = buildStaleMeta({
    previousMeta: null, cafeteria: CAFETERIA, sourceUrl: SRC, notice: null,
    status: SCRAPE_STATUS.ERROR, error: null, failedEndpoints: [], attemptedAt: AT,
  });
  assert.equal(meta.itemCount, 0);
  assert.equal(meta.lastSuccessfulUpdate, null);
  assert.equal(meta.error, 'fetch failed');
});

test('buildIndexEntry: skipped は status から導出される後方互換フィールド', () => {
  const ok = buildIndexEntry(CAFETERIA, { status: SCRAPE_STATUS.OK, itemCount: 26, lastUpdated: 'x' });
  assert.equal(ok.skipped, false);
  const closed = buildIndexEntry(CAFETERIA, { status: SCRAPE_STATUS.NO_MENU, itemCount: 0 });
  assert.equal(closed.skipped, true);
  assert.equal(closed.itemCount, 0);
  const missing = buildIndexEntry(CAFETERIA, null);
  assert.equal(missing.status, SCRAPE_STATUS.ERROR);
  assert.equal(missing.lastUpdated, null);
});

test('overallStatus: 1 食堂でも取れていれば degraded、全滅で failed', () => {
  assert.equal(overallStatus([SCRAPE_STATUS.OK, SCRAPE_STATUS.OK]), 'ok');
  assert.equal(overallStatus([SCRAPE_STATUS.OK, SCRAPE_STATUS.NO_MENU]), 'degraded');
  assert.equal(overallStatus([SCRAPE_STATUS.ERROR, SCRAPE_STATUS.NO_MENU]), 'failed');
});

test('latestDataUpdate: index の最終更新は実際にデータが書き換わった最新時刻', () => {
  const entries = [
    { lastUpdated: '2026-09-06T01:47:00.000Z' },
    { lastUpdated: '2026-08-04T00:58:00.000Z' },
    { lastUpdated: null },
  ];
  assert.equal(latestDataUpdate(entries), '2026-09-06T01:47:00.000Z');
  assert.equal(latestDataUpdate([{ lastUpdated: null }]), null, '一度も取得できていなければ null');
});

// ---- 空応答の判別 (実データ由来): 休業中は本文 0 バイト、営業中の空カテゴリは
// `<div class="Loaded"></div><ul></ul>` の 81 バイト。2026-09-06 実測。 ----

test('isEmptyResponse: 休業中の 0 バイト応答と営業中の空カテゴリ応答を区別する', () => {
  assert.equal(isEmptyResponse(readFixture('menu_load-663253-empty.html')), true);
  assert.equal(isEmptyResponse('\n<div class="Loaded"></div>\n\n  <ul>\n\n  </ul>\n'), false);
  assert.equal(isEmptyResponse(''), true);
  assert.equal(isEmptyResponse(undefined), true);
});

// ---- publishCafeteria: 「取得失敗時に既存データを消さない」= 本 PR の中核保証 ----

async function withTempDir(fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'menu-publish-'));
  try {
    return await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function seedExisting(outDir, items) {
  const dir = path.join(outDir, CAFETERIA.id);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'menu.json'), JSON.stringify(items, null, 2) + '\n');
  await fsp.writeFile(
    path.join(dir, 'meta.json'),
    JSON.stringify({ cafeteriaId: CAFETERIA.id, itemCount: items.length, lastUpdated: '2026-08-04T00:58:00.000Z' }, null, 2) + '\n'
  );
  return dir;
}

const EXISTING = [{ code: '001', name: '既存メニュー', nutrition: { energy: 300 } }];

test('publish: error のときは menu.json を書き換えない (既存データ保持)', async () => {
  await withTempDir(async (outDir) => {
    const dir = await seedExisting(outDir, EXISTING);
    await publishCafeteria(
      { cafeteria: CAFETERIA, items: [], issues: [], notice: null, status: SCRAPE_STATUS.ERROR, failedEndpoints: [], error: 'HTTP 503' },
      AT,
      outDir
    );
    const menu = JSON.parse(await fsp.readFile(path.join(dir, 'menu.json'), 'utf-8'));
    assert.deepEqual(menu, EXISTING, '取得失敗で既存メニューが消えてはならない');
    const meta = JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf-8'));
    assert.equal(meta.status, SCRAPE_STATUS.ERROR);
    assert.equal(meta.lastUpdated, '2026-08-04T00:58:00.000Z', 'lastUpdated は据え置き');
    assert.equal(meta.lastAttempt, AT.toISOString());
    assert.equal(meta.itemCount, EXISTING.length, 'meta の件数は disk 上の menu.json と一致');
  });
});

test('publish: no-menu のときは空メニューを書き出す (休業を正しく表示するため)', async () => {
  await withTempDir(async (outDir) => {
    const dir = await seedExisting(outDir, EXISTING);
    await publishCafeteria(
      { cafeteria: CAFETERIA, items: [], issues: [], notice: '9月30日まで 夏季休業中', status: SCRAPE_STATUS.NO_MENU, failedEndpoints: [], error: null },
      AT,
      outDir
    );
    const menu = JSON.parse(await fsp.readFile(path.join(dir, 'menu.json'), 'utf-8'));
    assert.deepEqual(menu, []);
    const meta = JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf-8'));
    assert.equal(meta.status, SCRAPE_STATUS.NO_MENU);
    assert.equal(meta.notice, '9月30日まで 夏季休業中');
    assert.equal(meta.lastSuccessfulUpdate, '2026-08-04T00:58:00.000Z', '最後に取れた時刻は保持');
  });
});

test('publish: ok のときは新しいメニューで上書きする', async () => {
  await withTempDir(async (outDir) => {
    const dir = await seedExisting(outDir, EXISTING);
    const items = [{ code: '900', name: '新メニュー', nutrition: { energy: 500 } }];
    await publishCafeteria(
      { cafeteria: CAFETERIA, items, issues: [], notice: null, status: SCRAPE_STATUS.OK, failedEndpoints: [], error: null },
      AT,
      outDir
    );
    const menu = JSON.parse(await fsp.readFile(path.join(dir, 'menu.json'), 'utf-8'));
    assert.deepEqual(menu, items);
  });
});

test('publish: 初回 (既存データなし) の error でも menu.json を作らない', async () => {
  await withTempDir(async (outDir) => {
    await publishCafeteria(
      { cafeteria: CAFETERIA, items: [], issues: [], notice: null, status: SCRAPE_STATUS.ERROR, failedEndpoints: [], error: null },
      AT,
      outDir
    );
    const dir = path.join(outDir, CAFETERIA.id);
    assert.equal(fs.existsSync(path.join(dir, 'menu.json')), false);
    assert.equal(fs.existsSync(path.join(dir, 'meta.json')), true);
  });
});

test('readCafeteriaState + buildIndexEntry: index の itemCount は disk の実件数に従う', async () => {
  await withTempDir(async (outDir) => {
    const dir = path.join(outDir, CAFETERIA.id);
    await fsp.mkdir(dir, { recursive: true });
    // meta だけ古い件数を持ち、menu.json は 2 件 — 実体を優先すること
    await fsp.writeFile(path.join(dir, 'menu.json'), JSON.stringify([{ code: '1' }, { code: '2' }]));
    await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ status: 'ok', itemCount: 99 }));
    const { itemCount, meta } = await readCafeteriaState(dir);
    assert.equal(itemCount, 2);
    assert.equal(buildIndexEntry(CAFETERIA, meta, itemCount).itemCount, 2);
  });
});

test('readCafeteriaState: ファイルが無いときは null を返し index は 0 件になる', async () => {
  await withTempDir(async (outDir) => {
    const { itemCount, meta } = await readCafeteriaState(path.join(outDir, 'nope'));
    assert.equal(itemCount, null);
    assert.equal(meta, null);
    const entry = buildIndexEntry(CAFETERIA, meta, itemCount);
    assert.equal(entry.itemCount, 0);
    assert.equal(entry.status, SCRAPE_STATUS.ERROR);
  });
});

test('classify: menu.php すら取れていないなら 0 件でも休業と断定しない', () => {
  assert.equal(
    classifyScrape({ itemCount: 0, failedEndpoints: 0, unparseableEndpoints: 0, menuPageOk: false }),
    SCRAPE_STATUS.ERROR
  );
  assert.equal(
    classifyScrape({ itemCount: 0, failedEndpoints: 0, unparseableEndpoints: 0, menuPageOk: true }),
    SCRAPE_STATUS.NO_MENU
  );
});

test('readJson: ファイル欠落と破損を区別する', async () => {
  await withTempDir(async (dir) => {
    const missing = await readJson(path.join(dir, 'nope.json'));
    assert.equal(missing.missing, true);
    assert.equal(missing.corrupt, false);

    const broken = path.join(dir, 'broken.json');
    await fsp.writeFile(broken, '[{"code":"001","name":"trunc');
    const corrupt = await readJson(broken);
    assert.equal(corrupt.missing, false);
    assert.equal(corrupt.corrupt, true);
    assert.equal(corrupt.data, null);
  });
});

test('破損した menu.json を古い meta の件数で健全に見せない', async () => {
  await withTempDir(async (outDir) => {
    const dir = path.join(outDir, CAFETERIA.id);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'menu.json'), '[{"code":"001","name":"trunc');
    await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ status: 'ok', itemCount: 26 }));
    const { itemCount, meta, corrupt } = await readCafeteriaState(dir);
    assert.equal(corrupt, true);
    assert.equal(itemCount, null);
    const entry = buildIndexEntry(CAFETERIA, meta, itemCount, corrupt);
    assert.equal(entry.status, SCRAPE_STATUS.ERROR, '破損時に ok と主張してはならない');
    assert.equal(entry.itemCount, 0, '読めない件数を 26 と偽らない');
  });
});

test('publish 後に .tmp が残らない (原子的書き込み)', async () => {
  await withTempDir(async (outDir) => {
    await publishCafeteria(
      { cafeteria: CAFETERIA, items: [{ code: '1', nutrition: {} }], issues: [], notice: null, status: SCRAPE_STATUS.OK, failedEndpoints: [], error: null },
      AT,
      outDir
    );
    const files = fs.readdirSync(path.join(outDir, CAFETERIA.id)).sort();
    assert.deepEqual(files, ['menu.json', 'meta.json']);
  });
});

test('formatSummary: バックスラッシュ + パイプでも表が壊れない', () => {
  const row = formatSummary([{ name: 'テスト食堂', status: 'ok', itemCount: 1, notice: 'a\\|b\r\nc' }]);
  const cells = row.split('\n')[2];
  assert.ok(cells.includes('a\\\\\\|b c'), `escaped cell: ${cells}`);
  // エスケープ列 (\\ と \|) を取り除くと、残る生のパイプは 4 列の区切り 5 本だけ
  const rawPipes = cells.replace(/\\./g, '').split('|').length - 1;
  assert.equal(rawPipes, 5, `列区切り以外の生パイプが残っている: ${cells}`);
});
