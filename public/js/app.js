import { rankCombinations } from './optimizer.js';
import { selectDiverseTopK, boltzmannSample } from './diversity.js';
import { DAILY_RDI, MEAL_TARGET, WEIGHTS, NUTRITION_FILTERS } from './nutrition.js';

const CATEGORY_LABELS = {
  main: '主菜',
  side: '副菜',
  staple: '主食',
  soup: '汁物',
  bowl: '丼・カレー',
  noodle: '麺類',
  set: 'セット',
  dessert: 'デザート',
  other: 'その他',
};

const CATEGORY_BADGE_COLOR = {
  main: '#e74c3c',
  side: '#27ae60',
  staple: '#f39c12',
  soup: '#9b59b6',
  bowl: '#d35400',
  noodle: '#16a085',
  set: '#34495e',
  dessert: '#e91e63',
  other: '#7f8c8d',
};

// 食堂ごとの識別色 (一覧タブでアイテムがどの食堂かを示すバッジ用)
const CAFETERIA_COLORS = {
  '663252': '#2563eb', // 豊中図書館下
  '663258': '#db2777', // かさね
  '663253': '#059669', // 福利会館3階
};

const LABEL_ORDER = ['A', 'B', 'C'];
const ALL_TAB_ID = 'all';

// スコア内訳の表示順 (nutrition.js WEIGHTS のキーと同期)
const BREAKDOWN_KEYS = ['energy', 'protein', 'vegetable', 'fiber', 'calcium', 'iron', 'salt', 'pfc'];
const BREAKDOWN_LABELS = {
  energy: 'エネルギー',
  protein: 'たんぱく質',
  vegetable: '野菜量',
  fiber: '食物繊維',
  calcium: 'カルシウム',
  iron: '鉄',
  salt: '食塩 (減点)',
  pfc: 'PFCバランス',
};

const state = {
  cafeterias: [],            // index.json の cafeterias 配列
  activeTab: null,           // id または 'all'
  itemsByCafeteria: {},      // { id: { items, meta } } — 遅延ロード
  items: [],                 // 現在タブの統合済みアイテム (ランキング対象)
  activeToggles: new Set(),  // 栄養トグル (NUTRITION_FILTERS のキー)
  currentCat: 'all',         // メニュー一覧のカテゴリフィルタ
};

async function loadIndex() {
  const res = await fetch('./data/index.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`index.json HTTP ${res.status}`);
  return res.json();
}

async function loadCafeteria(id) {
  if (state.itemsByCafeteria[id]) return state.itemsByCafeteria[id];
  const [menuRes, metaRes] = await Promise.all([
    fetch(`./data/${id}/menu.json`, { cache: 'no-cache' }),
    fetch(`./data/${id}/meta.json`, { cache: 'no-cache' }),
  ]);
  if (!menuRes.ok) throw new Error(`menu.json HTTP ${menuRes.status} for ${id}`);
  const menu = await menuRes.json();
  const meta = metaRes.ok ? await metaRes.json() : null;
  // 各アイテムに食堂情報を付与 (一覧タブのバッジ表示用)
  const info = state.cafeterias.find((c) => c.id === id);
  const items = menu.map((item) => ({
    ...item,
    cafeteriaId: id,
    cafeteriaName: info?.name ?? id,
  }));
  state.itemsByCafeteria[id] = { items, meta };
  return state.itemsByCafeteria[id];
}

function formatDate(iso) {
  if (!iso) return '未取得';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setStatus(msg, kind = 'info') {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.dataset.kind = kind;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTabs() {
  const nav = document.querySelector('.cafeteria-tabs');
  nav.innerHTML = '';
  for (const c of state.cafeterias) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cafeteria-tab';
    btn.dataset.tab = c.id;
    btn.setAttribute('role', 'tab');
    btn.textContent = c.name;
    btn.style.setProperty('--tab-accent', CAFETERIA_COLORS[c.id] ?? '#2563eb');
    btn.addEventListener('click', () => setActiveTab(c.id));
    nav.appendChild(btn);
  }
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'cafeteria-tab cafeteria-tab-all';
  allBtn.dataset.tab = ALL_TAB_ID;
  allBtn.setAttribute('role', 'tab');
  allBtn.textContent = '豊中キャンパス内一覧';
  allBtn.addEventListener('click', () => setActiveTab(ALL_TAB_ID));
  nav.appendChild(allBtn);
}

function renderNutritionToggles() {
  const row = document.querySelector('.nutrition-toggles');
  // 既存の .control-label は残し、ボタンだけ後ろに追加
  for (const [key, def] of Object.entries(NUTRITION_FILTERS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toggle';
    btn.dataset.toggle = key;
    btn.title = def.hint;
    btn.textContent = def.label;
    btn.addEventListener('click', () => {
      if (state.activeToggles.has(key)) {
        state.activeToggles.delete(key);
        btn.classList.remove('active');
      } else {
        state.activeToggles.add(key);
        btn.classList.add('active');
      }
    });
    row.appendChild(btn);
  }
}

function renderCafeteriaMeta() {
  const el = document.querySelector('.cafeteria-meta');
  el.innerHTML = '';
  const targets = state.activeTab === ALL_TAB_ID
    ? state.cafeterias
    : state.cafeterias.filter((c) => c.id === state.activeTab);
  const frag = document.createDocumentFragment();
  for (const c of targets) {
    const card = document.createElement('div');
    card.className = 'cafeteria-meta-card';
    card.style.setProperty('--meta-accent', CAFETERIA_COLORS[c.id] ?? '#2563eb');
    const itemMeta = state.itemsByCafeteria[c.id]?.meta;
    const updated = formatDate(itemMeta?.lastUpdated ?? c.lastUpdated);
    card.innerHTML = `
      <strong>${escapeHtml(c.fullName)}</strong>
      <span class="meta-line">🕒 ${escapeHtml(c.hours)}</span>
      <span class="meta-line">🚫 定休: ${escapeHtml(c.holidays)}</span>
      <span class="meta-line">📋 ${c.itemCount} 品 · 最終更新 ${updated}</span>
      <a class="meta-source" href="${c.sourceUrl}" target="_blank" rel="noopener">🔗 生協サイトの元メニュー</a>`;
    frag.appendChild(card);
  }
  el.appendChild(frag);
}

async function setActiveTab(tabId) {
  state.activeTab = tabId;
  for (const btn of document.querySelectorAll('.cafeteria-tab')) {
    const selected = btn.dataset.tab === tabId;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
  }

  try {
    if (tabId === ALL_TAB_ID) {
      await Promise.all(state.cafeterias.map((c) => loadCafeteria(c.id)));
      const merged = state.cafeterias.flatMap((c) => state.itemsByCafeteria[c.id].items);
      state.items = merged;
      document.getElementById('app-title').textContent = '🍱 阪大豊中キャンパス 3食堂横断';
    } else {
      const { items } = await loadCafeteria(tabId);
      state.items = items;
      const info = state.cafeterias.find((c) => c.id === tabId);
      document.getElementById('app-title').textContent = `🍱 ${info?.fullName ?? '阪大豊中キャンパス食堂'}`;
    }
  } catch (err) {
    console.error(err);
    setStatus(`データ読込エラー: ${err.message}`, 'error');
    return;
  }

  renderCafeteriaMeta();
  updateMenuCount();
  renderMenuList(state.currentCat);
  const all = tabId === ALL_TAB_ID ? '3食堂横断' : state.cafeterias.find((c) => c.id === tabId)?.name;
  setStatus(`${all}: ${state.items.length} 品読込済。条件を設定して「組合せを探す」を押してください。`);
  // タブ切替時は結果をクリア (前食堂の結果が残ると混乱するため)
  document.getElementById('results').innerHTML = '';
}

function updateMenuCount() {
  document.getElementById('menu-count').textContent = `(${state.items.length} 品)`;
}

function renderMenuList(cat) {
  state.currentCat = cat;
  const list = document.getElementById('menu-list');
  list.innerHTML = '';
  const items = cat === 'all' ? state.items : state.items.filter((i) => i.category === cat);
  if (items.length === 0) {
    list.innerHTML = '<li class="empty">該当するメニューがありません</li>';
    return;
  }
  const frag = document.createDocumentFragment();
  const showCafeteriaBadge = state.activeTab === ALL_TAB_ID;
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'menu-item';
    const priceTxt = typeof it.price === 'number' ? `${it.price}円` : '—';
    const kcal = it.nutrition?.energy != null ? `${Math.round(it.nutrition.energy)} kcal` : '';
    const cafBadge = showCafeteriaBadge
      ? `<span class="cafeteria-badge" style="background:${CAFETERIA_COLORS[it.cafeteriaId] ?? '#7f8c8d'}">${escapeHtml(it.cafeteriaName ?? '')}</span>`
      : '';
    li.innerHTML = `
      <img src="${it.imageUrl}" alt="" loading="lazy" onerror="this.style.display='none'" />
      <div class="menu-item-body">
        <span class="badge" style="background:${CATEGORY_BADGE_COLOR[it.category] || '#7f8c8d'}">${CATEGORY_LABELS[it.category] || it.category}</span>
        ${cafBadge}
        <span class="name">${escapeHtml(it.name)}</span>
        <span class="meta">${priceTxt} ${kcal}</span>
      </div>`;
    frag.appendChild(li);
  }
  list.appendChild(frag);
}

function getOptions() {
  const budget = parseInt(document.getElementById('budget').value, 10);
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const patterns = [];
  if (document.getElementById('pat-teishoku').checked) patterns.push('teishoku');
  if (document.getElementById('pat-onedish').checked) patterns.push('oneDish');
  const allowDessert = !document.getElementById('no-dessert').checked;
  const requireSoup = document.getElementById('require-soup').checked;
  const filters = [...state.activeToggles];
  return { budget, mode, patterns, allowDessert, requireSoup, filters };
}

function run() {
  const opts = getOptions();
  if (state.items.length === 0) {
    setStatus('メニューデータが未取得です。GitHub Actions が実行されるまでお待ちください。', 'warn');
    return;
  }
  if (opts.patterns.length === 0) {
    setStatus('スタイルを少なくとも1つ選んでください。', 'warn');
    return;
  }

  const start = performance.now();
  setStatus('組合せを検索中…');
  const { top, enumerated, kept, truncated } = rankCombinations(state.items, {
    budget: opts.budget,
    patterns: opts.patterns,
    allowDessert: opts.allowDessert,
    requireSoup: opts.requireSoup,
    filters: opts.filters,
    keepTop: 300,
  });
  const elapsed = (performance.now() - start).toFixed(0);

  if (top.length === 0) {
    const filterHint = opts.filters.length > 0
      ? ` (栄養条件 ${opts.filters.map((k) => NUTRITION_FILTERS[k]?.label ?? k).join('・')} を外すと見つかるかも)`
      : '';
    setStatus(`予算 ${opts.budget}円 で有効な組合せが見つかりませんでした${filterHint}`, 'warn');
    renderResults([]);
    return;
  }

  const picks = opts.mode === 'random'
    ? boltzmannSample(top, { temperature: 10, k: 3 })
    : selectDiverseTopK(top, 3, 0.7);

  const filterLabel = opts.filters.length > 0 ? ` / 条件通過 ${kept.toLocaleString()} 件` : '';
  setStatus(`${enumerated.toLocaleString()} 通り${filterLabel} から ${picks.length} 案を ${elapsed}ms で選定${truncated ? ' (途中打切り)' : ''}`, 'info');
  renderResults(picks);
}

function renderResults(picks) {
  const container = document.getElementById('results');
  container.innerHTML = '';
  picks.forEach((combo, idx) => container.appendChild(renderCombo(combo, idx)));
}

function nutritionBar(label, value, target, daily, color, unit = '', estimated = false) {
  const ratioOfMeal = target > 0 ? Math.min(1.2, value / target) : 0;
  const ratioOfDaily = daily > 0 ? Math.min(1, value / daily) : 0;
  const v = typeof value === 'number' ? value : 0;
  const pctMeal = Math.round(ratioOfMeal * 100);
  const pctDaily = Math.round(ratioOfDaily * 100);
  const display = unit === 'kcal' ? `${Math.round(v)} ${unit}` : `${v.toFixed(1)} ${unit}`.trim();
  const estMark = estimated ? '<span class="est-mark" title="食品成分表八訂ベースの推定値">推</span>' : '';
  return `
    <div class="nut-row${estimated ? ' estimated' : ''}">
      <span class="nut-label">${label}${estMark}</span>
      <span class="nut-bar" aria-label="${label} ${display}${estimated ? ' (推定)' : ''}, 1日の${pctDaily}%">
        <span class="nut-fill" style="width:${Math.min(100, pctMeal)}%;background:${color}"></span>
      </span>
      <span class="nut-value">${display}</span>
      <span class="nut-daily">1日の${pctDaily}%</span>
    </div>`;
}

function hasEstimatedField(combo, key) {
  return combo.items.some((it) => (it._estimated || []).some((e) => e.key === key));
}

// スコア内訳ミニバー: component × weight を可視化
function renderScoreBreakdown(combo) {
  const rows = BREAKDOWN_KEYS.map((key) => {
    const comp = combo.components?.[key] ?? 0;
    const w = WEIGHTS[key] ?? 0;
    // コンポーネントは [-60, 130] 程度の範囲を取りうるが、表示は 0-100 に clamp
    const clamped = Math.max(0, Math.min(100, comp));
    const contrib = comp * w;
    const label = BREAKDOWN_LABELS[key] ?? key;
    return `
      <div class="breakdown-row">
        <span class="breakdown-label">${label}</span>
        <span class="breakdown-bar"><span class="breakdown-fill" style="width:${clamped}%"></span></span>
        <span class="breakdown-values">${Math.round(comp)} × ${w.toFixed(1)} = ${contrib.toFixed(1)}</span>
      </div>`;
  }).join('');
  const totalW = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  return `
    <details class="score-breakdown">
      <summary>スコア内訳 (component × weight)</summary>
      <div class="breakdown-body">
        ${rows}
        <div class="breakdown-total">加重平均 (/${totalW.toFixed(1)}) = <strong>${combo.score.toFixed(1)}</strong> / 100</div>
      </div>
    </details>`;
}

function renderCombo(combo, idx) {
  const label = LABEL_ORDER[idx] || String(idx + 1);
  const card = document.createElement('article');
  card.className = 'combo-card';
  const n = combo.nutrition;
  const patternLabel = combo.pattern === 'teishoku' ? '定食' : '一品';
  const showCafeteriaBadge = state.activeTab === ALL_TAB_ID;

  const itemsHtml = combo.items
    .map((it) => {
      const kcal = it.nutrition?.energy != null ? `${Math.round(it.nutrition.energy)} kcal` : '';
      const img = it.imageUrl ? `<img src="${it.imageUrl}" alt="" loading="lazy" onerror="this.style.display='none'" />` : '';
      const cafBadge = showCafeteriaBadge && it.cafeteriaId
        ? `<span class="cafeteria-badge" style="background:${CAFETERIA_COLORS[it.cafeteriaId] ?? '#7f8c8d'}">${escapeHtml(it.cafeteriaName ?? '')}</span>`
        : '';
      return `
        <li class="combo-item">
          ${img}
          <div>
            <span class="badge" style="background:${CATEGORY_BADGE_COLOR[it.category] || '#7f8c8d'}">${CATEGORY_LABELS[it.category] || it.category}</span>
            ${cafBadge}
            <span class="name">${escapeHtml(it.name)}</span>
          </div>
          <span class="price">${it.price}円</span>
          <span class="kcal">${kcal}</span>
        </li>`;
    })
    .join('');

  card.innerHTML = `
    <header class="combo-header">
      <div>
        <span class="combo-label">${label}定食</span>
        <span class="combo-pattern">${patternLabel}</span>
      </div>
      <div class="combo-score" title="0-100 栄養バランススコア">
        <span class="score-number">${Math.round(combo.score)}</span>
        <span class="score-caption">バランス<br />スコア</span>
      </div>
    </header>
    <ul class="combo-items">${itemsHtml}</ul>
    <div class="combo-summary">
      <span>合計 <strong>${combo.price} 円</strong></span>
      <span><strong>${Math.round(n.energy || 0)} kcal</strong></span>
      <span>食塩 <strong>${(n.salt || 0).toFixed(1)} g</strong></span>
    </div>
    <div class="nutrition-bars">
      ${nutritionBar('エネルギー', n.energy || 0, MEAL_TARGET.energy, DAILY_RDI.energy, '#f39c12', 'kcal')}
      ${nutritionBar('たんぱく質', n.protein || 0, MEAL_TARGET.protein, DAILY_RDI.protein, '#e74c3c', 'g')}
      ${nutritionBar('脂質', n.fat || 0, MEAL_TARGET.energy * 0.25 / 9, DAILY_RDI.energy * 0.25 / 9, '#f1c40f', 'g')}
      ${nutritionBar('炭水化物', n.carbs || 0, MEAL_TARGET.energy * 0.60 / 4, DAILY_RDI.energy * 0.60 / 4, '#3498db', 'g')}
      ${nutritionBar('野菜量', n.vegetable || 0, MEAL_TARGET.vegetable, DAILY_RDI.vegetable, '#27ae60', 'g')}
      ${nutritionBar('食物繊維', n.fiber || 0, MEAL_TARGET.fiber, DAILY_RDI.fiber, '#16a085', 'g', hasEstimatedField(combo, 'fiber'))}
      ${nutritionBar('カルシウム', n.calcium || 0, MEAL_TARGET.calcium, DAILY_RDI.calcium, '#8e44ad', 'mg')}
      ${nutritionBar('鉄', n.iron || 0, MEAL_TARGET.iron, DAILY_RDI.iron, '#c0392b', 'mg')}
    </div>
    ${renderScoreBreakdown(combo)}`;
  return card;
}

function wire() {
  const budget = document.getElementById('budget');
  const budgetOut = document.getElementById('budget-value');
  budget.addEventListener('input', () => {
    budgetOut.textContent = `${budget.value} 円`;
  });
  document.getElementById('find').addEventListener('click', run);

  for (const chip of document.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      for (const c of document.querySelectorAll('.chip')) c.classList.remove('active');
      chip.classList.add('active');
      renderMenuList(chip.dataset.cat);
    });
  }
}

async function boot() {
  wire();
  renderNutritionToggles();
  try {
    const index = await loadIndex();
    state.cafeterias = index.cafeterias;
    document.getElementById('last-updated').textContent = formatDate(index.lastUpdated);
    renderTabs();
    const firstId = state.cafeterias[0]?.id;
    if (!firstId) {
      setStatus('食堂データがありません。GitHub Actions による初回スクレイピング待ちです。', 'warn');
      return;
    }
    await setActiveTab(firstId);
  } catch (err) {
    console.error(err);
    setStatus(`データ読込エラー: ${err.message}`, 'error');
  }
}

boot();
