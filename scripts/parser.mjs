import * as cheerio from 'cheerio';

// detail.php の栄養ラベルは全角カタカナ (例: "タンパク質 Protein 21.1g")。
// 日英ラベルが並ぶため [^\d-]* で non-digit を柔軟に吸収する。
const NUMERIC_PATTERNS = [
  ['energy', /エネルギー[^\d-]*([\d.]+)\s*kcal/],
  ['protein', /(?:タンパク質|たんぱく質|たん白質)[^\d-]*([\d.]+)\s*g/],
  ['fat', /脂質[^\d-]*([\d.]+)\s*g/],
  ['carbs', /炭水化物[^\d-]*([\d.]+)\s*g/],
  ['salt', /食塩相当量[^\d-]*([\d.]+)\s*g/],
  ['calcium', /カルシウム[^\d-]*([\d.]+)\s*mg/],
  ['iron', /鉄[^\d-]*([\d.]+)\s*mg/],
  ['vegetable', /野菜量[^\d-]*([\d.]+)\s*g/],
  ['fiber', /食物繊維[^\d-]*([\d.]+)\s*g/],
  ['vitaminA', /ビタミン\s*A[^\d-]*([\d.]+)\s*μ?g/],
  ['vitaminB1', /ビタミン\s*B\s*1[^\d-]*([\d.]+)\s*mg/],
  ['vitaminB2', /ビタミン\s*B\s*2[^\d-]*([\d.]+)\s*mg/],
  ['vitaminC', /ビタミン\s*C[^\d-]*([\d.]+)\s*mg/],
];

const SITE_HEADER_NAMES = [
  '大阪大学生協豊中図書館下食堂',
  '大阪大学生協',
];

function parseNumber(text, pattern) {
  const m = text.match(pattern);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

// detail.php から商品名・栄養成分を抽出する。
// detail.php はサイト全体ヘッダの <h1> とアイテム用 <h1> の 2 つが存在するため、
// 「サイトヘッダ名と一致しない最初の <h1>」を商品名として採用する。
export function parseDetailHtml(html, { code } = {}) {
  const $ = cheerio.load(html);
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  // Find the first <h1> whose text is not the site header
  let itemH1 = null;
  $('h1').each((_, el) => {
    if (itemH1) return;
    const txt = $(el).text().trim();
    if (!txt) return;
    if (SITE_HEADER_NAMES.some((h) => txt.startsWith(h))) return;
    itemH1 = $(el);
  });

  let name = '';
  let nameEn = null;
  if (itemH1) {
    // h1 may be "ジューシー唐揚げ<span>Fried chicken</span>" or similar
    const enSpan = itemH1.find('span').first();
    nameEn = enSpan.text().trim() || null;
    const clone = itemH1.clone();
    clone.find('span').remove();
    name = clone.text().trim().replace(/\s+/g, ' ');
    if (!name) name = itemH1.text().trim().replace(/\s+/g, ' ');
  }
  // Fallback: look for h3 with name pattern (used by menu_load.php-style fragments)
  if (!name) {
    const h3 = $('h3').first();
    if (h3.length) {
      const clone = h3.clone();
      clone.find('span').remove();
      name = clone.text().trim().replace(/\s+/g, ' ');
      const en = h3.find('span').filter((_, s) => !$(s).hasClass('price')).first();
      if (!nameEn && en.text().trim()) nameEn = en.text().trim();
    }
  }

  const priceMatch = bodyText.match(/¥\s*(\d{2,4})|(\d{2,4})\s*円/);
  const price = priceMatch ? parseInt(priceMatch[1] || priceMatch[2], 10) : null;

  const nutrition = {};
  for (const [key, pat] of NUMERIC_PATTERNS) {
    const v = parseNumber(bodyText, pat);
    if (v !== null) nutrition[key] = v;
  }

  // 原産地ラベルは "原産地 Place of origin 鶏肉（タイ）" のように英訳を挟む
  // ので英字フレーズを読み飛ばしてから最初の和文/括弧を拾う
  const originMatch = bodyText.match(
    /(?:原産地?|産地)\s*(?:Place\s*of\s*origin)?\s*([^\sA-Za-z。、]+(?:[（(][^）)]*[）)])?)/
  );
  const origin = originMatch ? originMatch[1].trim() : null;

  return {
    code: code ?? null,
    name,
    nameEn,
    price,
    imageUrl: code ? `https://west2-univ.jp/menu_img/png_sp/${code}.png` : null,
    nutrition,
    origin,
  };
}
