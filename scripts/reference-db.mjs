// 参照栄養データベース — 日本食品標準成分表 2020年版 (八訂) / 文部科学省
// https://fooddb.mext.go.jp/  (食品成分データベース、JST運営)
//
// 用途: west2-univ.jp の detail.php が公開していない栄養素 (食物繊維・B1・B2)
//       を、料理名パターンマッチで典型値により補完する。
//
// データライセンス: 食品成分表の数値データは測定値であり日本著作権法10条2項により
//                  著作物性を有しない。出典明示のうえ公益目的で再利用可能。
//
// エントリ形式:
//   - patterns: メニュー名に対する正規表現配列 (いずれか1つでもマッチすれば採用)
//   - category: カテゴリ (マッチ精度向上のため)
//   - mode: 'perKcal' (エネルギー比例、主に主食・米飯類に使用)
//        | 'perServing' (1人前固定値、主に複合料理に使用)
//   - values: 補完する栄養素の値
//   - source: 食品成分表の食品番号・名称
//
// perKcal モード: value = energy × rate
// perServing モード: value = 固定値 (サーバ側のエネルギー値によらず)

export const REFERENCE_DB = [
  // === 主食 (staple) ===
  {
    patterns: [/^ライス|^ご飯|^ごはん|^白飯|米飯/],
    category: 'staple',
    mode: 'perKcal',
    values: {
      // 白飯 100g = 156 kcal, 繊維 1.5g, B1 0.02mg, B2 0.01mg
      fiber: 1.5 / 156,
      vitaminB1: 0.02 / 156,
      vitaminB2: 0.01 / 156,
    },
    source: '食品成分表 八訂 01088 水稲めし 精白米',
  },
  {
    patterns: [/玄米/],
    category: 'staple',
    mode: 'perKcal',
    values: {
      // 玄米飯 100g = 152 kcal, 繊維 1.4g, B1 0.16mg, B2 0.02mg
      fiber: 1.4 / 152,
      vitaminB1: 0.16 / 152,
      vitaminB2: 0.02 / 152,
    },
    source: '食品成分表 八訂 01080 水稲めし 玄米',
  },
  {
    patterns: [/食パン|ロールパン|トースト/],
    category: 'staple',
    mode: 'perServing',
    values: { fiber: 2.3, vitaminB1: 0.07, vitaminB2: 0.04 },
    source: '食品成分表 八訂 01026 食パン (60g換算)',
  },

  // === 主菜 (main) - 揚げ物 ===
  {
    patterns: [/から揚げ|唐揚げ|竜田揚げ/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 0.3, vitaminB1: 0.09, vitaminB2: 0.13 },
    source: '食品成分表 八訂 11289 鶏もも皮つき から揚げ (80g)',
  },
  {
    patterns: [/チキンカツ|とんかつ|ビーフカツ|ヒレカツ|ロースカツ/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 0.5, vitaminB1: 0.75, vitaminB2: 0.15 },
    source: '食品成分表 八訂 11276 ぶたロース とんかつ (100g、B1は豚肉由来)',
  },
  {
    patterns: [/コロッケ/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 1.3, vitaminB1: 0.1, vitaminB2: 0.06 },
    source: '食品成分表 八訂 18006 コロッケ (じゃが芋主体、70g)',
  },
  {
    patterns: [/フライ|ソテー.*魚|白身.*揚げ|メンチ/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 0.4, vitaminB1: 0.13, vitaminB2: 0.1 },
    source: '食品成分表 八訂 複合 (白身魚フライ / メンチ平均)',
  },

  // === 主菜 (main) - 魚料理 ===
  {
    patterns: [/さば|鯖|サバ/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 0.1, vitaminB1: 0.17, vitaminB2: 0.3 },
    source: '食品成分表 八訂 10154 さば 生 (80g切身)',
  },
  {
    patterns: [/鮭|さけ|サケ|シャケ/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 0, vitaminB1: 0.12, vitaminB2: 0.17 },
    source: '食品成分表 八訂 10139 しろさけ 生 (80g切身)',
  },
  {
    patterns: [/ぶり|ブリ|鰤|ハマチ/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 0, vitaminB1: 0.19, vitaminB2: 0.28 },
    source: '食品成分表 八訂 10241 ぶり 生 (80g切身)',
  },
  {
    patterns: [/えび|海老|エビ/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 0, vitaminB1: 0.04, vitaminB2: 0.04 },
    source: '食品成分表 八訂 10321 バナメイえび 生 (60g)',
  },
  {
    patterns: [/いか|イカ|烏賊/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 0, vitaminB1: 0.04, vitaminB2: 0.05 },
    source: '食品成分表 八訂 10345 するめいか 生 (80g)',
  },
  {
    patterns: [/魚.*照り焼|魚.*塩焼|焼き魚|煮魚|味噌煮|みそ煮|生姜煮/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 0.1, vitaminB1: 0.13, vitaminB2: 0.24 },
    source: '食品成分表 八訂 魚料理平均 (煮魚・焼魚)',
  },

  // === 主菜 (main) - 肉料理 ===
  // ※具体的な料理名 (シチュー/麻婆/餃子/酢豚) を先に置き、
  //   より汎用的な食材ベース (チキン/豚/鶏) は最後尾に置く
  {
    patterns: [/シチュー/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 1.8, vitaminB1: 0.15, vitaminB2: 0.15 },
    source: '食品成分表 八訂 18045 ビーフシチュー類 (200g)',
  },
  {
    patterns: [/麻婆|マーボー/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 1.2, vitaminB1: 0.3, vitaminB2: 0.12 },
    source: '食品成分表 八訂 18042 麻婆豆腐 (150g)',
  },
  {
    patterns: [/餃子|ギョウザ|ぎょうざ/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 1.5, vitaminB1: 0.24, vitaminB2: 0.1 },
    source: '食品成分表 八訂 18002 ぎょうざ (5個/100g)',
  },
  {
    patterns: [/酢豚|酢鶏/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 1.5, vitaminB1: 0.4, vitaminB2: 0.15 },
    source: '食品成分表 八訂 複合 酢豚 (150g)',
  },
  {
    patterns: [/ハンバーグ/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 1.2, vitaminB1: 0.24, vitaminB2: 0.2 },
    source: '食品成分表 八訂 18050 ハンバーグ (120g)',
  },
  {
    patterns: [/豚.*生姜焼|生姜焼|しょうが焼/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 0.4, vitaminB1: 0.55, vitaminB2: 0.17 },
    source: '食品成分表 八訂 複合 豚もも + 生姜 (100g)',
  },
  {
    patterns: [/豚.*炒め|豚肉.*みそ|ポーク.*炒|肉.*野菜炒/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 1.5, vitaminB1: 0.6, vitaminB2: 0.18 },
    source: '食品成分表 八訂 複合 豚肉野菜炒め (120g)',
  },
  {
    patterns: [/チキン|鶏.*ソテー|鶏.*焼|鶏.*炒|鶏肉/],
    category: 'main',
    mode: 'perServing',
    values: { fiber: 0.3, vitaminB1: 0.1, vitaminB2: 0.15 },
    source: '食品成分表 八訂 11225 若鶏もも 皮つき (100g)',
  },

  // === 副菜 (side) ===
  {
    patterns: [/ひじき/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 3.8, vitaminB1: 0.03, vitaminB2: 0.06 },
    source: '食品成分表 八訂 09051 ひじき 鉄釜ゆで (60g小鉢)',
  },
  {
    patterns: [/ほうれん草|ホウレン草/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 2.5, vitaminB1: 0.05, vitaminB2: 0.09 },
    source: '食品成分表 八訂 06268 ほうれんそう ゆで (70g)',
  },
  {
    patterns: [/きんぴら|金平|ごぼう/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 2.5, vitaminB1: 0.03, vitaminB2: 0.02 },
    source: '食品成分表 八訂 06085 ごぼう きんぴら相当 (60g)',
  },
  {
    patterns: [/納豆/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 3.4, vitaminB1: 0.05, vitaminB2: 0.28 },
    source: '食品成分表 八訂 04046 糸引き納豆 (50g)',
  },
  {
    patterns: [/冷奴|奴/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 0.4, vitaminB1: 0.08, vitaminB2: 0.03 },
    source: '食品成分表 八訂 04032 木綿豆腐 (100g)',
  },
  {
    patterns: [/サラダ|レタス|キャベツ|ミニサラダ/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 1.8, vitaminB1: 0.05, vitaminB2: 0.03 },
    source: '食品成分表 八訂 複合 生野菜サラダ (80g)',
  },
  {
    patterns: [/ポテトサラダ|ポテサラ/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 1.5, vitaminB1: 0.06, vitaminB2: 0.03 },
    source: '食品成分表 八訂 18004 ポテトサラダ (80g)',
  },
  {
    patterns: [/オクラ/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 2.5, vitaminB1: 0.05, vitaminB2: 0.06 },
    source: '食品成分表 八訂 06032 オクラ ゆで (50g)',
  },
  {
    patterns: [/おひたし|お浸し/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 2.2, vitaminB1: 0.04, vitaminB2: 0.08 },
    source: '食品成分表 八訂 複合 青菜おひたし (70g)',
  },
  {
    patterns: [/なす|ナス|茄子/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 1.8, vitaminB1: 0.04, vitaminB2: 0.04 },
    source: '食品成分表 八訂 06192 なす ゆで (70g)',
  },
  {
    patterns: [/ブロッコリー/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 3.1, vitaminB1: 0.07, vitaminB2: 0.14 },
    source: '食品成分表 八訂 06264 ブロッコリー ゆで (70g)',
  },
  {
    patterns: [/煮物|煮付け|炊き合わせ/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 2.5, vitaminB1: 0.07, vitaminB2: 0.05 },
    source: '食品成分表 八訂 複合 根菜煮物 (100g)',
  },
  {
    patterns: [/わかめ|海藻|昆布|もずく/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 2.0, vitaminB1: 0.03, vitaminB2: 0.05 },
    source: '食品成分表 八訂 09045 わかめ類平均 (50g)',
  },
  {
    patterns: [/温泉卵|温玉|目玉焼|卵焼|玉子焼|厚焼|出汁巻|巣ごもり/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 0, vitaminB1: 0.06, vitaminB2: 0.4 },
    source: '食品成分表 八訂 12004 鶏卵 全卵ゆで (50g/1個)',
  },
  {
    patterns: [/きも|レバー|鶏きも|レバ/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 0, vitaminB1: 0.38, vitaminB2: 1.8 },
    source: '食品成分表 八訂 11232 鶏肝臓 生 (50g、B2特に豊富)',
  },
  {
    patterns: [/大根|ダイコン/],
    category: 'side',
    mode: 'perServing',
    values: { fiber: 1.4, vitaminB1: 0.02, vitaminB2: 0.01 },
    source: '食品成分表 八訂 06132 だいこん 根 皮なしゆで (80g)',
  },

  // === 汁物 (soup) ===
  {
    patterns: [/味噌汁|みそ汁|みそしる/],
    category: 'soup',
    mode: 'perServing',
    values: { fiber: 1.0, vitaminB1: 0.04, vitaminB2: 0.04 },
    source: '食品成分表 八訂 複合 わかめ豆腐みそ汁 (200mL)',
  },
  {
    patterns: [/豚汁|けんちん汁/],
    category: 'soup',
    mode: 'perServing',
    values: { fiber: 2.2, vitaminB1: 0.2, vitaminB2: 0.08 },
    source: '食品成分表 八訂 複合 豚汁 (200mL)',
  },
  {
    patterns: [/スープ|ポタージュ|コンソメ/],
    category: 'soup',
    mode: 'perServing',
    values: { fiber: 0.8, vitaminB1: 0.04, vitaminB2: 0.05 },
    source: '食品成分表 八訂 複合 コンソメ・ポタージュ平均 (200mL)',
  },

  // === 丼・カレー (bowl) ===
  {
    patterns: [/カレー|カリー/],
    category: 'bowl',
    mode: 'perServing',
    values: { fiber: 3.5, vitaminB1: 0.3, vitaminB2: 0.15 },
    source: '食品成分表 八訂 18040 ビーフカレー (ルー+ライス、400g)',
  },
  {
    patterns: [/親子丼/],
    category: 'bowl',
    mode: 'perServing',
    values: { fiber: 2.3, vitaminB1: 0.2, vitaminB2: 0.35 },
    source: '食品成分表 八訂 複合 親子丼 (ライス込 320g)',
  },
  {
    patterns: [/牛丼|肉丼/],
    category: 'bowl',
    mode: 'perServing',
    values: { fiber: 2.0, vitaminB1: 0.15, vitaminB2: 0.2 },
    source: '食品成分表 八訂 複合 牛丼 (320g)',
  },
  {
    patterns: [/天丼|かつ丼|チキン丼/],
    category: 'bowl',
    mode: 'perServing',
    values: { fiber: 2.5, vitaminB1: 0.5, vitaminB2: 0.2 },
    source: '食品成分表 八訂 複合 揚げ物丼平均 (350g)',
  },
  {
    patterns: [/中華丼|麻婆丼|マーボ丼/],
    category: 'bowl',
    mode: 'perServing',
    values: { fiber: 3.5, vitaminB1: 0.3, vitaminB2: 0.2 },
    source: '食品成分表 八訂 複合 中華丼 (350g)',
  },

  // === 麺類 (noodle) ===
  {
    patterns: [/うどん/],
    category: 'noodle',
    mode: 'perServing',
    values: { fiber: 2.5, vitaminB1: 0.15, vitaminB2: 0.08 },
    source: '食品成分表 八訂 01039 うどん ゆで (250g) + 具材',
  },
  {
    patterns: [/そば|蕎麦/],
    category: 'noodle',
    mode: 'perServing',
    values: { fiber: 2.8, vitaminB1: 0.18, vitaminB2: 0.08 },
    source: '食品成分表 八訂 01127 そば ゆで (250g) + 具材',
  },
  {
    patterns: [/ラーメン|中華麺|担々|タンタン/],
    category: 'noodle',
    mode: 'perServing',
    values: { fiber: 3.0, vitaminB1: 0.25, vitaminB2: 0.2 },
    source: '食品成分表 八訂 複合 中華麺+具材 (400g)',
  },
  {
    patterns: [/パスタ|スパゲッティ|ペンネ|ナポリタン|ミートソース/],
    category: 'noodle',
    mode: 'perServing',
    values: { fiber: 3.0, vitaminB1: 0.12, vitaminB2: 0.08 },
    source: '食品成分表 八訂 01064 スパゲッティ ゆで (250g)',
  },

  // === デザート (dessert) ===
  {
    patterns: [/ヨーグルト/],
    category: 'dessert',
    mode: 'perServing',
    values: { fiber: 0.3, vitaminB1: 0.04, vitaminB2: 0.15 },
    source: '食品成分表 八訂 13025 ヨーグルト全脂無糖 + フルーツ (100g)',
  },
  {
    patterns: [/プリン/],
    category: 'dessert',
    mode: 'perServing',
    values: { fiber: 0, vitaminB1: 0.04, vitaminB2: 0.18 },
    source: '食品成分表 八訂 15086 カスタードプリン (80g)',
  },
  {
    patterns: [/ゼリー/],
    category: 'dessert',
    mode: 'perServing',
    values: { fiber: 0.2, vitaminB1: 0.01, vitaminB2: 0.01 },
    source: '食品成分表 八訂 15089 ゼリー (80g)',
  },
  {
    patterns: [/大学芋|さつま芋|サツマイモ|スイートポテト/],
    category: 'dessert',
    mode: 'perServing',
    values: { fiber: 2.3, vitaminB1: 0.11, vitaminB2: 0.02 },
    source: '食品成分表 八訂 02006 さつまいも 皮むき蒸し (80g)',
  },
  {
    patterns: [/エクレア|シュークリーム|ケーキ|ワッフル/],
    category: 'dessert',
    mode: 'perServing',
    values: { fiber: 0.4, vitaminB1: 0.08, vitaminB2: 0.18 },
    source: '食品成分表 八訂 15073 洋菓子類平均 (60g)',
  },
  {
    patterns: [/フルーツ|果物|りんご|みかん|バナナ|パイン|いちご/],
    category: 'dessert',
    mode: 'perServing',
    values: { fiber: 1.5, vitaminB1: 0.03, vitaminB2: 0.02 },
    source: '食品成分表 八訂 07001+ 果物平均 (100g)',
  },
];

// カテゴリ別フォールバック (どのパターンにもマッチしなかった時の最終ライン)
// 典型的な大学食堂メニューのカテゴリ平均値
export const CATEGORY_FALLBACK = {
  staple: { fiber: 1.5 / 156, vitaminB1: 0.02 / 156, vitaminB2: 0.01 / 156, mode: 'perKcal' },
  main:   { fiber: 0.8,       vitaminB1: 0.2,        vitaminB2: 0.15,       mode: 'perServing' },
  side:   { fiber: 2.0,       vitaminB1: 0.05,       vitaminB2: 0.06,       mode: 'perServing' },
  soup:   { fiber: 1.2,       vitaminB1: 0.05,       vitaminB2: 0.05,       mode: 'perServing' },
  bowl:   { fiber: 3.0,       vitaminB1: 0.25,       vitaminB2: 0.2,        mode: 'perServing' },
  noodle: { fiber: 3.0,       vitaminB1: 0.18,       vitaminB2: 0.1,        mode: 'perServing' },
  set:    { fiber: 1.5,       vitaminB1: 0.05,       vitaminB2: 0.05,       mode: 'perServing' },
  dessert:{ fiber: 0.5,       vitaminB1: 0.04,       vitaminB2: 0.1,        mode: 'perServing' },
  other:  { fiber: 0.5,       vitaminB1: 0.05,       vitaminB2: 0.05,       mode: 'perServing' },
};

export const REFERENCE_DB_META = {
  version: '1.0.0',
  basedOn: '日本食品標準成分表 2020年版 (八訂) / 文部科学省',
  url: 'https://fooddb.mext.go.jp/',
  license: '数値データ自体は測定値のため著作物性なし (日本著作権法10条2項)。出典明示で再利用可能。',
  entryCount: REFERENCE_DB.length,
};
