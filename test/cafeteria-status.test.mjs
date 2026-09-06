import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAFETERIA_STATUS_LABEL,
  findNotice,
  closedCafeterias,
  buildTabStatus,
  groupEmptyReason,
} from '../public/js/cafeteria-status.js';

const CAFETERIAS = [
  { id: '663252', name: '豊中図書館下食堂' },
  { id: '663258', name: 'カフェテリアかさね' },
  { id: '663253', name: '福利会館3階食堂', notice: '9月30日まで 夏季休業中' },
];

const loaded = (items, meta = null) => ({ items, meta });

test('findNotice: meta の告知が index より優先される', () => {
  const state = {
    cafeterias: CAFETERIAS,
    itemsByCafeteria: { '663253': loaded([], { notice: '10月1日 営業再開' }) },
  };
  assert.equal(findNotice(state, '663253'), '10月1日 営業再開');
  // 未ロードなら index.json 由来
  assert.equal(findNotice({ cafeterias: CAFETERIAS, itemsByCafeteria: {} }, '663253'), '9月30日まで 夏季休業中');
  assert.equal(findNotice({ cafeterias: CAFETERIAS, itemsByCafeteria: {} }, '663252'), null);
});

test('closedCafeterias: 読み込みに失敗した食堂は「掲載なし」に含めない', () => {
  const state = {
    cafeterias: CAFETERIAS,
    // 663258 は読み込み失敗で未ロード、663253 は 0 件 (休業)
    itemsByCafeteria: { '663252': loaded([{ code: '1' }]), '663253': loaded([]) },
  };
  assert.deepEqual(closedCafeterias(state), ['福利会館3階食堂']);
});

test('一覧タブ: 休業の食堂と読込失敗の食堂を別々に伝える', () => {
  const status = buildTabStatus({
    isAllTab: true,
    cafeterias: CAFETERIAS,
    itemsByCafeteria: { '663252': loaded([{ code: '1' }, { code: '2' }]), '663253': loaded([]) },
    loadErrors: ['カフェテリアかさね'],
    totalItems: 2,
  });
  assert.match(status.text, /掲載なし: 福利会館3階食堂/);
  assert.match(status.text, /読込失敗: カフェテリアかさね/);
  assert.doesNotMatch(status.text, /掲載なし: カフェテリアかさね/, '読込失敗を掲載なしと二重表示しない');
  assert.equal(status.kind, 'warn');
});

test('一覧タブ: 全部正常なら注記なしの info', () => {
  const status = buildTabStatus({
    isAllTab: true,
    cafeterias: CAFETERIAS,
    itemsByCafeteria: {
      '663252': loaded([{ code: '1' }]),
      '663258': loaded([{ code: '2' }]),
      '663253': loaded([{ code: '3' }]),
    },
    loadErrors: [],
    totalItems: 3,
  });
  assert.equal(status.kind, 'info');
  assert.doesNotMatch(status.text, /掲載なし|読込失敗/);
});

test('合計 0 件でも読込失敗の情報を落とさない', () => {
  const status = buildTabStatus({
    isAllTab: true,
    cafeterias: CAFETERIAS,
    // 663253 は休業で 0 件、他 2 件は読み込み失敗 → 合計 0 件
    itemsByCafeteria: { '663253': loaded([]) },
    loadErrors: ['豊中図書館下食堂', 'カフェテリアかさね'],
    totalItems: 0,
  });
  assert.match(status.text, /現在掲載されているメニューがありません/);
  assert.match(status.text, /読込失敗: 豊中図書館下食堂・カフェテリアかさね/, '原因が消えてはならない');
  assert.equal(status.kind, 'error');
});

test('単独タブ: 休業中は告知つきで警告表示', () => {
  const status = buildTabStatus({
    isAllTab: false,
    tabName: '福利会館3階食堂',
    cafeterias: CAFETERIAS,
    itemsByCafeteria: { '663253': loaded([]) },
    loadErrors: [],
    totalItems: 0,
    notice: '9月30日まで 夏季休業中',
  });
  assert.equal(status.text, '福利会館3階食堂: 現在掲載されているメニューがありません (9月30日まで 夏季休業中)。');
  assert.equal(status.kind, 'warn');
});

test('単独タブ: 品数があれば通常表示 (掲載なし注記は一覧タブ限定)', () => {
  const status = buildTabStatus({
    isAllTab: false,
    tabName: '豊中図書館下食堂',
    cafeterias: CAFETERIAS,
    itemsByCafeteria: { '663252': loaded([{ code: '1' }]), '663253': loaded([]) },
    loadErrors: [],
    totalItems: 42,
  });
  assert.equal(status.text, '豊中図書館下食堂: 42 品読込済。条件を設定して「組合せを探す」を押してください。');
  assert.doesNotMatch(status.text, /掲載なし/);
});

test('groupEmptyReason: 読込失敗と休業を混同しない', () => {
  assert.equal(groupEmptyReason({ failedLoad: true, notice: '9月30日まで 夏季休業中' }), 'データの読み込みに失敗しました');
  assert.equal(groupEmptyReason({ failedLoad: false, notice: '9月30日まで 夏季休業中' }), 'メニュー掲載なし (9月30日まで 夏季休業中)');
  assert.equal(groupEmptyReason({}), 'メニュー掲載なし');
});

test('status バッジ: ok にはバッジを出さない', () => {
  assert.equal(CAFETERIA_STATUS_LABEL.ok, undefined);
  assert.equal(CAFETERIA_STATUS_LABEL['no-menu'].kind, 'warn');
  assert.equal(CAFETERIA_STATUS_LABEL.error.kind, 'error');
});
