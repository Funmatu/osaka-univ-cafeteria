import * as cheerio from 'cheerio';

const CATEGORY_MAP = {
  主菜: 'main',
  副菜: 'side',
  麺類: 'noodle',
  '丼・カレー': 'bowl',
  デザート: 'dessert',
  セット: 'set',
  その他: 'other',
  ライス: 'staple',
  主食: 'staple',
  汁物: 'soup',
};

const NUMERIC_PATTERNS = [
  ['energy', /エネルギー[^\d-]*([\d.]+)\s*kcal/],
  ['protein', /(?:たん|タン)ぱく質[^\d-]*([\d.]+)\s*g/],
  ['fat', /脂質[^\d-]*([\d.]+)\s*g/],
  ['carbs', /炭水化物[^\d-]*([\d.]+)\s*g/],
  ['salt', /食塩相当量[^\d-]*([\d.]+)\s*g/],
  ['calcium', /カルシウム[^\d-]*([\d.]+)\s*mg/],
  ['iron', /鉄[^\d-]*([\d.]+)\s*mg/],
  ['vegetable', /野菜量[^\d-]*([\d.]+)\s*g/],
  ['vitaminA', /ビタミン\s*A[^\d-]*([\d.]+)\s*μ?g/],
  ['vitaminB1', /ビタミン\s*B\s*1[^\d-]*([\d.]+)\s*mg/],
  ['vitaminB2', /ビタミン\s*B\s*2[^\d-]*([\d.]+)\s*mg/],
  ['vitaminC', /ビタミン\s*C[^\d-]*([\d.]+)\s*mg/],
];

function parseNumber(text, pattern) {
  const m = text.match(pattern);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function parseDetailHtml(html, { code } = {}) {
  const $ = cheerio.load(html);
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  let name = $('h1, h2, .menu-name, .item-name').first().text().trim();
  if (!name) {
    const title = $('title').text();
    name = title.replace(/[|｜\-–].*$/, '').trim();
  }
  name = name.replace(/\s+/g, ' ');

  let nameEn = null;
  const enMatch = bodyText.match(/[A-Za-z][A-Za-z\s'.-]{2,}/);
  if (enMatch) {
    const candidate = enMatch[0].trim();
    if (candidate.length > 2 && candidate.length < 60 && !/menu|univ|detail|cafe/i.test(candidate)) {
      nameEn = candidate;
    }
  }

  const priceMatch = bodyText.match(/(\d{2,4})\s*円/);
  const price = priceMatch ? parseInt(priceMatch[1], 10) : null;

  let categoryJa = null;
  for (const ja of Object.keys(CATEGORY_MAP)) {
    if (bodyText.includes(ja)) {
      categoryJa = ja;
      break;
    }
  }
  const category = categoryJa ? CATEGORY_MAP[categoryJa] : 'other';

  const nutrition = {};
  for (const [key, pat] of NUMERIC_PATTERNS) {
    const v = parseNumber(bodyText, pat);
    if (v !== null) nutrition[key] = v;
  }

  const originMatch = bodyText.match(/(?:原産地?|産地)[：:\s]*([^\s。]+)/);
  const origin = originMatch ? originMatch[1].trim() : null;

  const imageUrl = code ? `https://west2-univ.jp/menu_img/png_sp/${code}.png` : null;

  return {
    code: code ?? null,
    name,
    nameEn,
    price,
    category,
    categoryJa,
    imageUrl,
    nutrition,
    origin,
  };
}

export function inferCategoryFromName(name, fallback = 'other') {
  if (!name) return fallback;
  if (/ライス|ご飯|ごはん|白飯|パン/.test(name)) return 'staple';
  if (/味噌汁|みそ汁|スープ|汁|ポタージュ|豚汁/.test(name)) return 'soup';
  if (/丼|カレー|ハヤシ/.test(name)) return 'bowl';
  if (/麺|うどん|そば|パスタ|ラーメン|担々/.test(name)) return 'noodle';
  if (/セット|定食/.test(name)) return 'set';
  if (/ケーキ|プリン|ゼリー|アイス|ヨーグルト|フルーツ/.test(name)) return 'dessert';
  if (/サラダ|おひたし|お浸し|煮物|和え|ナムル|小鉢|豆腐|冷奴|きんぴら|ひじき/.test(name)) return 'side';
  if (/肉|魚|チキン|ポーク|ビーフ|唐揚げ|フライ|ステーキ|ハンバーグ|焼き|炒め|天ぷら|餃子/.test(name)) return 'main';
  return fallback;
}
