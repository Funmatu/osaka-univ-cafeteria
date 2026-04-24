import { rankCombinations } from './optimizer.js';
import { selectDiverseTopK, boltzmannSample } from './diversity.js';
import { DAILY_RDI, MEAL_TARGET } from './nutrition.js';

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

const LABEL_ORDER = ['A', 'B', 'C'];

const state = {
  items: [],
  meta: null,
};

async function loadData() {
  const [menuRes, metaRes] = await Promise.all([
    fetch('./data/menu.json', { cache: 'no-cache' }),
    fetch('./data/meta.json', { cache: 'no-cache' }),
  ]);
  if (!menuRes.ok) throw new Error(`menu.json HTTP ${menuRes.status}`);
  const menu = await menuRes.json();
  const meta = metaRes.ok ? await metaRes.json() : null;
  return { menu, meta };
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

function renderMetaAndMenu({ menu, meta }) {
  state.items = menu;
  state.meta = meta;
  document.getElementById('last-updated').textContent = formatDate(meta?.lastUpdated);
  document.getElementById('menu-count').textContent = `(${menu.length} 品)`;
  renderMenuList('all');
}

function renderMenuList(cat) {
  const list = document.getElementById('menu-list');
  list.innerHTML = '';
  const items = cat === 'all' ? state.items : state.items.filter((i) => i.category === cat);
  if (items.length === 0) {
    list.innerHTML = '<li class="empty">該当するメニューがありません</li>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'menu-item';
    const priceTxt = typeof it.price === 'number' ? `${it.price}円` : '—';
    const kcal = it.nutrition?.energy != null ? `${Math.round(it.nutrition.energy)} kcal` : '';
    li.innerHTML = `
      <img src="${it.imageUrl}" alt="" loading="lazy" onerror="this.style.display='none'" />
      <div class="menu-item-body">
        <span class="badge" style="background:${CATEGORY_BADGE_COLOR[it.category] || '#7f8c8d'}">${CATEGORY_LABELS[it.category] || it.category}</span>
        <span class="name">${escapeHtml(it.name)}</span>
        <span class="meta">${priceTxt} ${kcal}</span>
      </div>`;
    frag.appendChild(li);
  }
  list.appendChild(frag);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getOptions() {
  const budget = parseInt(document.getElementById('budget').value, 10);
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const patterns = [];
  if (document.getElementById('pat-teishoku').checked) patterns.push('teishoku');
  if (document.getElementById('pat-onedish').checked) patterns.push('oneDish');
  const allowDessert = !document.getElementById('no-dessert').checked;
  const requireSoup = document.getElementById('require-soup').checked;
  return { budget, mode, patterns, allowDessert, requireSoup };
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
  const { top, enumerated, truncated } = rankCombinations(state.items, {
    budget: opts.budget,
    patterns: opts.patterns,
    allowDessert: opts.allowDessert,
    requireSoup: opts.requireSoup,
    keepTop: 300,
  });
  const elapsed = (performance.now() - start).toFixed(0);

  if (top.length === 0) {
    setStatus(`予算 ${opts.budget}円 で有効な組合せが見つかりませんでした。予算やスタイルを見直してください。`, 'warn');
    renderResults([]);
    return;
  }

  const picks = opts.mode === 'random'
    ? boltzmannSample(top, { temperature: 10, k: 3 })
    : selectDiverseTopK(top, 3, 0.7);

  setStatus(`${enumerated.toLocaleString()} 通りの組合せから ${picks.length} 案を ${elapsed}ms で選定${truncated ? ' (途中打切り)' : ''}`, 'info');
  renderResults(picks);
}

function renderResults(picks) {
  const container = document.getElementById('results');
  container.innerHTML = '';
  picks.forEach((combo, idx) => container.appendChild(renderCombo(combo, idx)));
}

function nutritionBar(label, value, target, daily, color, unit = '') {
  const ratioOfMeal = target > 0 ? Math.min(1.2, value / target) : 0;
  const ratioOfDaily = daily > 0 ? Math.min(1, value / daily) : 0;
  const v = typeof value === 'number' ? value : 0;
  const pctMeal = Math.round(ratioOfMeal * 100);
  const pctDaily = Math.round(ratioOfDaily * 100);
  const display = unit === 'kcal' ? `${Math.round(v)} ${unit}` : `${v.toFixed(1)} ${unit}`.trim();
  return `
    <div class="nut-row">
      <span class="nut-label">${label}</span>
      <span class="nut-bar" aria-label="${label} ${display}, 1日の${pctDaily}%">
        <span class="nut-fill" style="width:${Math.min(100, pctMeal)}%;background:${color}"></span>
      </span>
      <span class="nut-value">${display}</span>
      <span class="nut-daily">1日の${pctDaily}%</span>
    </div>`;
}

function renderCombo(combo, idx) {
  const label = LABEL_ORDER[idx] || String(idx + 1);
  const card = document.createElement('article');
  card.className = 'combo-card';
  const n = combo.nutrition;
  const patternLabel = combo.pattern === 'teishoku' ? '定食' : '一品';

  const itemsHtml = combo.items
    .map((it) => {
      const kcal = it.nutrition?.energy != null ? `${Math.round(it.nutrition.energy)} kcal` : '';
      const img = it.imageUrl ? `<img src="${it.imageUrl}" alt="" loading="lazy" onerror="this.style.display='none'" />` : '';
      return `
        <li class="combo-item">
          ${img}
          <div>
            <span class="badge" style="background:${CATEGORY_BADGE_COLOR[it.category] || '#7f8c8d'}">${CATEGORY_LABELS[it.category] || it.category}</span>
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
      ${nutritionBar('食物繊維', n.fiber || 0, MEAL_TARGET.fiber, DAILY_RDI.fiber, '#16a085', 'g')}
      ${nutritionBar('カルシウム', n.calcium || 0, MEAL_TARGET.calcium, DAILY_RDI.calcium, '#8e44ad', 'mg')}
      ${nutritionBar('鉄', n.iron || 0, MEAL_TARGET.iron, DAILY_RDI.iron, '#c0392b', 'mg')}
    </div>`;
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
  try {
    const data = await loadData();
    renderMetaAndMenu(data);
    if (data.menu.length === 0) {
      setStatus('メニューデータがまだありません。GitHub Actions による初回スクレイピング待ちです。', 'warn');
    } else {
      setStatus(`${data.menu.length} 品のメニューを読込みました。条件を設定して「組合せを探す」を押してください。`);
    }
  } catch (err) {
    console.error(err);
    setStatus(`データ読込エラー: ${err.message}`, 'error');
  }
}

boot();
