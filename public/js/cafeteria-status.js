// 食堂の状態表示ロジック。DOM に触れない純粋関数だけを置き、`node --test` で検証する
// (app.js は DOM 前提でブラウザでしか動かないため、判定ロジックはこちら側に寄せる)。
//
// status の値は scripts/scrape.mjs の SCRAPE_STATUS と同期している。

// ok は通常状態なのでバッジを出さない。
export const CAFETERIA_STATUS_LABEL = {
  'no-menu': { text: 'メニュー掲載なし', kind: 'warn' },
  partial: { text: '一部カテゴリ取得失敗', kind: 'warn' },
  error: { text: '取得失敗 (前回データを表示)', kind: 'error' },
};

/**
 * 生協が menu.php に掲示している告知 (「9月30日まで 夏季休業中」等)。
 * meta.json を読み込み済みならそちらを優先し、未ロードなら index.json の値を使う。
 */
export function findNotice({ cafeterias = [], itemsByCafeteria = {} }, id) {
  if (!id) return null;
  return (
    itemsByCafeteria[id]?.meta?.notice ??
    cafeterias.find((c) => c.id === id)?.notice ??
    null
  );
}

/** 掲載 0 件の食堂名。読み込みに失敗した食堂 (= 未ロード) は「掲載なし」ではないので含めない。 */
export function closedCafeterias({ cafeterias = [], itemsByCafeteria = {} }) {
  return cafeterias.filter((c) => itemsByCafeteria[c.id]?.items.length === 0).map((c) => c.name);
}

/**
 * タブ切替時のステータス行。休業 (掲載 0 件) と読み込み失敗を必ず別々に伝える。
 * 合計 0 件のときも読込失敗の情報を落とさない (両方 0 件のケースで原因が消えるのを防ぐ)。
 */
export function buildTabStatus({
  isAllTab = false,
  tabName = '',
  cafeterias = [],
  itemsByCafeteria = {},
  loadErrors = [],
  totalItems = 0,
  notice = null,
}) {
  const errorNote = loadErrors.length > 0 ? `読込失敗: ${loadErrors.join('・')}` : '';

  if (totalItems === 0) {
    const head = isAllTab ? '全食堂' : tabName;
    const noticeNote = notice ? ` (${notice})` : '';
    const text = `${head}: 現在掲載されているメニューがありません${noticeNote}。${errorNote ? ` ${errorNote}。` : ''}`;
    return { text, kind: loadErrors.length > 0 ? 'error' : 'warn' };
  }

  const closed = isAllTab ? closedCafeterias({ cafeterias, itemsByCafeteria }) : [];
  const closedNote = closed.length > 0 ? ` / 掲載なし: ${closed.join('・')}` : '';
  const label = isAllTab
    ? `${cafeterias.length}食堂合計 ${totalItems} 品 (各2案ずつ提示)${closedNote}${errorNote ? ` / ${errorNote}` : ''}`
    : `${tabName}: ${totalItems} 品読込済`;
  return {
    text: `${label}。条件を設定して「組合せを探す」を押してください。`,
    kind: loadErrors.length > 0 ? 'warn' : 'info',
  };
}

/** 一覧タブで品数 0 の食堂に出す理由。読み込み失敗と休業を混同しない。 */
export function groupEmptyReason({ failedLoad = false, notice = null } = {}) {
  if (failedLoad) return 'データの読み込みに失敗しました';
  return notice ? `メニュー掲載なし (${notice})` : 'メニュー掲載なし';
}
