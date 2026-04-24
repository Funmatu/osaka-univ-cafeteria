# 🍱 阪大豊中キャンパス食堂 メニュー最適化

[![Deploy to GitHub Pages](https://github.com/Funmatu/osaka-univ-cafeteria/actions/workflows/pages.yml/badge.svg)](https://github.com/Funmatu/osaka-univ-cafeteria/actions/workflows/pages.yml)
[![Update Menu Data](https://github.com/Funmatu/osaka-univ-cafeteria/actions/workflows/update-menu.yml/badge.svg)](https://github.com/Funmatu/osaka-univ-cafeteria/actions/workflows/update-menu.yml)

**ライブ URL**: <https://funmatu.github.io/osaka-univ-cafeteria/>

**対応食堂 (阪大豊中キャンパス)**:

| 食堂 | ID | データソース |
|------|----|--------------|
| 大阪大学生協豊中図書館下食堂 | `t=663252` | [menu.php](https://west2-univ.jp/sp/menu.php?t=663252) |
| 大阪大学生協カフェテリアかさね | `t=663258` | [menu.php](https://west2-univ.jp/sp/menu.php?t=663258) |
| 大阪大学生協福利会館3階食堂 | `t=663253` | [menu.php](https://west2-univ.jp/sp/menu.php?t=663253) |

日替わりメニューから、**予算内で栄養バランスの良い組合せ (A/B/C 3 案)** を自動提案する純粋静的 Web アプリ。食堂ごとの単独タブに加え、**3 食堂を横断してベスト案を選ぶ「豊中キャンパス内一覧」タブ**、および**栄養条件ハードフィルタ** (タンパク質多め・糖質控えめ・食塩控えめ ≤2g・食物繊維多め・ミネラル多め・ビタミン多め、複数選択可) を搭載。

---

## 目次

1. [特徴](#特徴)
2. [スクリーンショット・画面構成](#スクリーンショット画面構成)
3. [アーキテクチャ](#アーキテクチャ)
4. [リポジトリ構成](#リポジトリ構成)
5. [技術スタック](#技術スタック)
6. [データ取得パイプライン](#データ取得パイプライン)
7. [栄養補完システム](#栄養補完システム)
8. [最適化エンジン](#最適化エンジン)
9. [UI](#ui)
10. [ローカル開発](#ローカル開発)
11. [GitHub Actions ワークフロー](#github-actions-ワークフロー)
12. [デプロイ手順 (初回セットアップ)](#デプロイ手順-初回セットアップ)
13. [カスタマイズ](#カスタマイズ)
14. [テスト](#テスト)
15. [データ品質とメンテナンス](#データ品質とメンテナンス)
16. [今後の発展余地](#今後の発展余地)
17. [出典と参考資料](#出典と参考資料)
18. [ライセンス](#ライセンス)

---

## 特徴

- **豊中キャンパス 3 食堂対応**: 豊中図書館下食堂 / カフェテリアかさね / 福利会館3階食堂 をタブで切替。**「豊中キャンパス内一覧」タブでは全食堂のメニューを横断プール**し、ベスト A/B/C を選出 (結果の各料理に食堂バッジが付き、異食堂の料理同士で組合わさる場合あり)。
- **6 種の栄養トグル (複数選択可・ハードフィルタ)**: タンパク質多め / 糖質控えめ / 食塩控えめ (≤2g) / 食物繊維多め / ミネラル多め / ビタミン多め。閾値は食事摂取基準 1食分を基準 (例: タンパク質 ≥22g、Ca≥267mg かつ Fe≥2.5mg、A/B1/B2/C のうち 3 種以上が 1食分目標に到達)。
- **0-100 の栄養バランススコア**で組合せを評価。日本人の食事摂取基準 2020・成人男性 18-29 歳・身体活動レベル II の 1 食分 (1/3 日) をベースに、**野菜・食物繊維・Ca・Fe・たんぱく質は 1 日分に近づくほど加点**するアファーマティブ加点方式。
- **スコア内訳の可視化**: A/B/C カード内に `<details>` で展開可能なミニ棒グラフを配置。`component × weight` の寄与度が視える。
- **「ご飯×2」などの非常識な組合せを排除**するカテゴリ制約。定食パターン (主食+主菜+副菜+汁物+デザート) と一品パターン (丼・カレー / 麺類 / セット) を切替可能。
- **MMR (Maximal Marginal Relevance)** で A/B/C 3 案を多様化 (λ = 0.7)。毎回酷似した組合せにならない。
- **Boltzmann サンプリング** (温度 T = 10) による「気分でランダム」モード。質を担保しつつ日々違う提案。
- 全最適化はブラウザ内 JavaScript で完結。**サーバー不要 / GitHub Pages のみで動作**。
- 毎朝 06:00 JST に GitHub Actions が west2-univ.jp から最新メニューと**本物の栄養成分**を取得、データが変化していれば自動 commit & 再デプロイ。**3 食堂を順次スクレイプ** (食堂間 1 秒 sleep)。
- **食品成分表 八訂ベースの補完レイヤー**により、サイトが公開していない食物繊維・B1・B2 を 55 パターンの料理テンプレートで推定補填。推定値は UI で識別表示。

---

## スクリーンショット・画面構成

```
┌──────────────────────────────────────────────┐
│  🍱 大阪大学生協豊中図書館下食堂                │
│  栄養バランス最適化メニュー提案                 │
├──────────────────────────────────────────────┤
│  [図書館下] [かさね] [福利会館3F] [豊中キャンパス内一覧] │
├──────────────────────────────────────────────┤
│  🕒 平日 11:00-19:30 / 土 11:00-13:30         │
│  🚫 定休: 日祝  📋 47 品 · 最終更新 2026-04-24 │
├──────────────────────────────────────────────┤
│  💴 予算: [=====|====] 700 円                 │
│  🎯 モード: (●) おすすめ3案  ( ) ランダム        │
│  🍚 スタイル: [☑定食] [☑一品]                 │
│  🚫 除外: [ ] デザートなし [ ] 汁物必須         │
│  🥗 栄養重視: (タンパク質多め) (糖質控えめ)      │
│              (食塩控えめ≤2g) (食物繊維多め)     │
│              (ミネラル多め)   (ビタミン多め)    │
│  [🔄 組合せを探す]                            │
├──────────────────────────────────────────────┤
│  ┌── A定食 (バランススコア 94) ────────┐      │
│  │ 📷 ライス中           110円           │     │
│  │ 📷 ジューシー唐揚げ    341円          │     │
│  │ 📷 ひじきの煮物         88円          │     │
│  │ 📷 味噌汁              44円          │     │
│  │ 合計 693円 / 730kcal / 食塩2.7g     │     │
│  │ [エネルギー ████░  730kcal 28%]      │     │
│  │ [たんぱく質 █████  27g   42%]        │     │
│  │ [野菜量    ████░  129g  37%]         │     │
│  │ [食物繊維  █████  10.6g 51%]推       │     │
│  │ ▸ スコア内訳 (component × weight)     │     │
│  │   たんぱく質 ██████████  92 × 1.5     │     │
│  │   野菜量    ████████    75 × 2.0     │     │
│  │   …                                 │     │
│  └───────────────────────────────────────┘   │
├──────────────────────────────────────────────┤
│  🔍 今日のメニュー全件 (47品) [▾]              │
│  データ最終更新: 2026-04-24 08:06             │
└──────────────────────────────────────────────┘
```

「豊中キャンパス内一覧」タブを選ぶと 3 食堂のメニューが 1 プールに統合され、各料理行に食堂名バッジ (青=図書館下 / ピンク=かさね / 緑=福利会館3F) が表示される。

「推」バッジは推定値 (食品成分表八訂に基づく料理パターン補填)、バーに斜線パターンで区別。

---

## アーキテクチャ

```
┌────────────────────────────────────────────────────────┐
│  GitHub Actions: update-menu.yml                       │
│  cron '0 21 * * *' (UTC)  =  毎朝 06:00 JST            │
│                                                        │
│    ① fetchAllCategories()                              │
│       menu_load.php?a=on_{a,b,c,d,e,f,g,bunrui1} を    │
│       8 並列 fetch (Cheerio でリンク抽出)              │
│    ② enrichWithDetail()                                │
│       detail.php?c=XXXX を並列度 4 / 500ms 間隔で      │
│       全 47 件取得 → parser.mjs で栄養成分抽出         │
│    ③ augmentAll()                                      │
│       食品成分表 八訂 ベースの REFERENCE_DB (55 件) で  │
│       食物繊維・B1・B2 の欠落を補填                     │
│    ④ public/data/{id}/menu.json + meta.json を食堂別   │
│       に書き出し (3 食堂ぶんを順次処理)                 │
│    ⑤ public/data/index.json に食堂一覧を集約            │
│    ⑥ git diff があれば auto-commit & push              │
└────────────────────────────┬───────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────┐
│  GitHub Actions: pages.yml                             │
│  push (public/** 変更) or workflow_dispatch で発火     │
│                                                        │
│  public/ 配下を artifact にしてそのまま Pages へデプロイ  │
└────────────────────────────┬───────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────┐
│  GitHub Pages (純粋静的配信)                            │
│                                                        │
│  index.html → fetch('./data/index.json')               │
│              → fetch('./data/{id}/menu.json') (遅延ロード)│
│    ├─ combo-rules.js  カテゴリ制約で有効組合せ列挙       │
│    ├─ nutrition.js    各組合せに 0-100 スコア付与 +      │
│    │                  6 種トグルの AND ハードフィルタ    │
│    ├─ optimizer.js    min-heap で top-300 抽出          │
│    └─ diversity.js    MMR または Boltzmann で 3 案選定  │
└────────────────────────────────────────────────────────┘
```

**重要ポイント**: Puppeteer 等のヘッドレスブラウザは不要。`menu.php` はクライアントで JS レンダリングされるが、裏の `menu_load.php` を直接叩けば静的 HTML で全カテゴリ取得できることを解析で突き止めた。依存は `cheerio` のみ。

---

## リポジトリ構成

```
.
├── .github/workflows/
│   ├── update-menu.yml          # 毎朝 06:00 JST の自動スクレイピング
│   └── pages.yml                # GitHub Pages 自動デプロイ
│
├── scripts/                     # Node.js 側 (GitHub Actions 専用)
│   ├── scrape.mjs               # スクレイパのエントリポイント (3 食堂ループ)
│   ├── cafeterias.mjs           # 対象食堂レジストリ (id/slug/営業時間/定休日)
│   ├── parser.mjs               # detail.php の Cheerio パーサ
│   ├── augment.mjs              # 食物繊維・B1・B2 の補完ロジック
│   ├── reference-db.mjs         # 食品成分表 八訂ベースの参照 DB (55 件)
│   └── lib/fetch-with-retry.mjs # リトライ + 並列制御 HTTP クライアント
│
├── public/                      # GitHub Pages ソース (静的配信対象)
│   ├── index.html
│   ├── js/
│   │   ├── app.js               # UI オーケストレーション (タブ・トグル・breakdown)
│   │   ├── optimizer.js         # 組合せ列挙 + スコアリング + フィルタ
│   │   ├── nutrition.js         # RDI 目標 + スコア関数 + NUTRITION_FILTERS
│   │   ├── combo-rules.js       # カテゴリ制約 (定食/一品)
│   │   └── diversity.js         # MMR 多様化 + Boltzmann サンプラ
│   ├── css/styles.css
│   └── data/                    # スクレイパ出力 (自動更新・commit 対象)
│       ├── index.json           # 食堂一覧 (UI の最初に fetch)
│       ├── 663252/              # 豊中図書館下食堂
│       │   ├── menu.json
│       │   └── meta.json
│       ├── 663258/              # カフェテリアかさね
│       │   ├── menu.json
│       │   └── meta.json
│       └── 663253/              # 福利会館3階食堂
│           ├── menu.json
│           └── meta.json
│
├── test/                        # Node.js built-in test runner
│   ├── nutrition.test.mjs       # スコア関数 + NUTRITION_FILTERS テスト
│   ├── optimizer.test.mjs       # rankCombinations のフィルタ統合テスト
│   ├── combo-rules.test.mjs     # カテゴリ制約の遵守テスト
│   ├── diversity.test.mjs       # MMR / Boltzmann 正当性
│   └── augment.test.mjs         # 補完ロジックのパターンマッチ
│
├── package.json                 # dependencies: cheerio のみ
├── package-lock.json
├── README.md                    # 本ファイル
└── LICENSE                      # MIT
```

---

## 技術スタック

| 層 | 採用技術 | 理由 |
|---|---|---|
| フロントエンド | 素の ES Modules + HTML + CSS | 外部依存ゼロ。どこでも動く。GitHub Pages 静的配信と親和性最高 |
| CSS | CSS Variables + CSS Grid | モバイルファースト、ビルド不要 |
| スクレイパ | Node.js 22 + Cheerio 1.x | Puppeteer 不要 (menu_load.php 直接叩きで完結) |
| CI/CD | GitHub Actions | cron + Pages で全自動、無料枠内 |
| データ保存 | commit される JSON | 履歴追跡可能、CDN 配信、不変性 |
| テスト | `node --test` (built-in) | 依存ゼロ、CI でそのまま動く |

**ランタイム依存**: `cheerio ^1.0.0` (ビルド時のみ、フロントエンドにバンドルされない)

---

## データ取得パイプライン

### west2-univ.jp のページ構造

`t=` は食堂ID (豊中図書館下: `663252` / かさね: `663258` / 福利会館3F: `663253`)。

| URL | 内容 | レンダリング | 取得方法 |
|---|---|---|---|
| `sp/index.php?t={id}` | 注目4品 | 静的 HTML | (未使用) |
| `sp/menu.php?t={id}` | カテゴリ別メニュー (ビュー) | **JS レンダリング** | (未使用) |
| `sp/menu_load.php?t={id}&a=on_X` | カテゴリ別アイテム HTML 片 (Ajax 応答) | **静的 HTML** | ✓ メイン取得 |
| `sp/detail.php?t={id}&c=XXXXXX` | アイテム個別詳細+栄養成分 | 静的 HTML | ✓ 栄養抽出用 |
| `sp/osaka-univ.php` | 全食堂一覧 (食堂 ID 発見の起点) | 静的 HTML | (手動確認時のみ) |
| `menu_img/png_sp/{code}.png` | アイテム画像 | — | 直リンクで UI が参照 |

### 8 つの `menu_load.php` エンドポイントとカテゴリの対応

[`scripts/scrape.mjs`](scripts/scrape.mjs) の `ENDPOINT_CATEGORIES` 定数で固定マッピング:

| endpoint | カテゴリ (内部) | categoryJa (表示) | 典型件数 |
|---|---|---|---|
| `on_a` | `main` | 主菜 | 10 |
| `on_b` | `side` | 副菜 | 12 |
| `on_c` | `noodle` | 麺類 | 5 |
| `on_d` | `bowl` | 丼・カレー | 6 |
| `on_e` | `dessert` | デザート | 6 |
| `on_f` | `set` | セット | 5 |
| `on_g` | `other` | その他 | 0 |
| `on_bunrui1` | `staple` | ライス | 4 |

合計 **約 47 件**。カテゴリの割当は menu.php の HTML 解析で見出し順から確定済み。

### 実行フロー ([`scripts/scrape.mjs`](scripts/scrape.mjs))

[`scripts/cafeterias.mjs`](scripts/cafeterias.mjs) の `CAFETERIAS` を順に処理 (各食堂ごとに 1-5 を実行、食堂間 1 秒スリープ):

1. `fetchAllCategories()`: 8 エンドポイントを **並列** fetch、`<a href="detail.php?c=XXXX">` を Cheerio で抽出、code で重複排除
2. `enrichWithDetail()`: 全件の `detail.php` を **並列度 4 / 各 500ms スリープ** で取得、[`scripts/parser.mjs`](scripts/parser.mjs) `parseDetailHtml()` で栄養成分抽出
3. `augmentAll()`: [`scripts/augment.mjs`](scripts/augment.mjs) で欠落した fiber / B1 / B2 を参照 DB から補完
4. `validate()`: code / 名称 / 価格 (1-3000 円範囲) / energy 有無を検証
5. code 順でソート、`public/data/{id}/menu.json` と `meta.json` に書き出し

全食堂処理後:

6. `writeIndex()`: 各食堂の meta を集約して `public/data/index.json` に書き出し
7. GitHub Actions 側で `git add public/data/` → `git diff --staged --quiet` を判定、差分があれば auto-commit

### 抽出される栄養成分 (detail.php より)

[`scripts/parser.mjs`](scripts/parser.mjs) の `NUMERIC_PATTERNS` で 13 項目を抽出:

| キー | 正規表現 (ラベル) | 単位 |
|---|---|---|
| `energy` | `エネルギー` | kcal |
| `protein` | `タンパク質` / `たんぱく質` / `たん白質` | g |
| `fat` | `脂質` | g |
| `carbs` | `炭水化物` | g |
| `salt` | `食塩相当量` | g |
| `calcium` | `カルシウム` | mg |
| `iron` | `鉄` | mg |
| `vegetable` | `野菜量` | g |
| `fiber` | `食物繊維` | g |
| `vitaminA` | `ビタミン A` | μg |
| `vitaminB1` | `ビタミン B1` (英訳 "Vitamin B1" の数字を読み飛ばし) | mg |
| `vitaminB2` | `ビタミン B2` (同上) | mg |
| `vitaminC` | `ビタミン C` | mg |

### 商品名抽出の注意点

detail.php には `<h1>` が 2 つある:
1. サイト全体のヘッダ (`大阪大学生協豊中図書館下食堂`)
2. 商品名 (`ジューシー唐揚げ<span>Fried chicken</span>`)

`SITE_HEADER_NAMES` と一致しない最初の `<h1>` を商品名として採用。`<span>` 内を英訳 (`nameEn`) として分離。

### menu.json のスキーマ (1 アイテム)

```json
{
  "code": "621001",
  "name": "ジューシー唐揚げ",
  "nameEn": "Fried chicken",
  "price": 341,
  "category": "main",
  "categoryJa": "主菜",
  "imageUrl": "https://west2-univ.jp/menu_img/png_sp/621001.png",
  "nutrition": {
    "energy": 267,
    "protein": 21.1,
    "fat": 13.7,
    "carbs": 15.2,
    "salt": 1.7,
    "calcium": 11,
    "iron": 0.9,
    "vegetable": 0,
    "fiber": 0.3,
    "vitaminA": 46,
    "vitaminB1": 0.12,
    "vitaminB2": 0.18,
    "vitaminC": 3
  },
  "origin": "鶏肉（タイ）",
  "scrapedAt": "2026-04-24T08:06:40.439Z",
  "_estimated": [
    { "key": "fiber", "source": "食品成分表 八訂 11289 鶏もも皮つき から揚げ (80g)" }
  ]
}
```

### meta.json のスキーマ (食堂ごと)

```json
{
  "cafeteriaId": "663252",
  "cafeteriaName": "大阪大学生協豊中図書館下食堂",
  "slug": "toyonaka-library",
  "sourceUrl": "https://west2-univ.jp/sp/menu.php?t=663252",
  "hours": "平日 11:00-19:30 / 土 11:00-13:30",
  "holidays": "日祝",
  "lastUpdated": "2026-04-24T13:12:42.720Z",
  "itemCount": 47,
  "withNutrition": 46,
  "augmented": 47,
  "issues": 1,
  "referenceDb": {
    "version": "1.0.0",
    "basedOn": "日本食品標準成分表 2020年版 (八訂) / 文部科学省",
    "url": "https://fooddb.mext.go.jp/",
    "license": "数値データ自体は測定値のため著作物性なし (日本著作権法10条2項)。出典明示で再利用可能。",
    "entryCount": 55
  }
}
```

### index.json のスキーマ (全食堂集約)

```json
{
  "lastUpdated": "2026-04-24T13:12:42.720Z",
  "cafeterias": [
    {
      "id": "663252",
      "slug": "toyonaka-library",
      "name": "豊中図書館下食堂",
      "fullName": "大阪大学生協豊中図書館下食堂",
      "campus": "豊中",
      "hours": "平日 11:00-19:30 / 土 11:00-13:30",
      "holidays": "日祝",
      "sourceUrl": "https://west2-univ.jp/sp/menu.php?t=663252",
      "itemCount": 47,
      "lastUpdated": "2026-04-24T13:12:42.720Z",
      "skipped": false
    }
    // …カフェテリアかさね (663258)・福利会館3階食堂 (663253)
  ]
}
```

### HTTP クライアント ([`scripts/lib/fetch-with-retry.mjs`](scripts/lib/fetch-with-retry.mjs))

- `fetchWithRetry(url, { maxRetries = 3, baseDelayMs = 500, userAgent })`
  - 指数バックオフ (500ms → 1000ms → 2000ms)
  - UA: `Mozilla/5.0 ... osaka-univ-cafeteria-bot/2.0 (+https://github.com/Funmatu/osaka-univ-cafeteria)`
  - `Accept-Language: ja,en;q=0.8`
- `mapWithConcurrency(items, concurrency, iter)`: ワーカープール方式で並列度制御
- `sleep(ms)`: Promise ベースの待機

---

## 栄養補完システム

west2-univ.jp の detail.php は **食物繊維を提供していない** ため、スコアリング時に繊維項目が 0 点になる構造的欠落があった。またビタミン B1/B2 は提供されているが英訳ラベル "Vitamin B1" に含まれる数字でパーサが乱れる不具合があった (現在は regex 修正済)。

これらを解消するため、**3 層防御**による欠落補完を実装している。

### Layer 1: 実測値の尊重

パーサが detail.php から取得できた値はそのまま利用。補完ロジックは上書きしない。

### Layer 2: 料理パターンマッチ ([`scripts/reference-db.mjs`](scripts/reference-db.mjs))

**55 件**の料理パターンを食品成分表八訂ベースで定義。各エントリは正規表現でメニュー名をマッチ:

```js
{
  patterns: [/から揚げ|唐揚げ|竜田揚げ/],
  category: 'main',
  mode: 'perServing',             // 'perKcal' または 'perServing'
  values: { fiber: 0.3, vitaminB1: 0.09, vitaminB2: 0.13 },
  source: '食品成分表 八訂 11289 鶏もも皮つき から揚げ (80g)',
}
```

**モード**:
- `perServing`: 固定値 (料理 1 人前あたり)。複合料理向け (から揚げ、煮物、シチュー等)
- `perKcal`: エネルギー比例係数 (`value = energy × rate`)。サイズ可変な米飯・主食向け

**マッチ順序**: 具体的な料理型 (シチュー、麻婆、カレー、丼物) を**食材ベース** (チキン、豚、魚) より先に配置。例えば「チキンクリームシチュー」は `/シチュー/` にマッチしてシチュー系テンプレートが採用される (食材ベース `/チキン/` より優先)。

**対象カテゴリ別内訳**:
- 主食: 3 件 (白飯 perKcal、玄米、食パン)
- 主菜 (揚げ物): 4 件 (から揚げ、とんかつ/チキンカツ、コロッケ、フライ/メンチ)
- 主菜 (魚): 6 件 (さば、鮭、ぶり、えび、いか、煮魚/焼魚一般)
- 主菜 (肉): 8 件 (シチュー、麻婆、餃子、酢豚、ハンバーグ、生姜焼、豚炒め、チキン)
- 副菜: 16 件 (ひじき、ほうれん草、きんぴら、納豆、冷奴、サラダ、ポテトサラダ、オクラ、おひたし、なす、ブロッコリー、煮物、わかめ、卵、レバー、大根)
- 汁物: 3 件 (味噌汁、豚汁、スープ)
- 丼・カレー: 5 件 (カレー、親子丼、牛丼、天丼/かつ丼、中華丼)
- 麺類: 4 件 (うどん、そば、ラーメン、パスタ)
- デザート: 6 件 (ヨーグルト、プリン、ゼリー、大学芋、エクレア/ケーキ、フルーツ)

### Layer 3: カテゴリフォールバック

パターンマッチ失敗時、カテゴリ別の平均値を使用。[`scripts/reference-db.mjs`](scripts/reference-db.mjs) `CATEGORY_FALLBACK`:

| category | fiber | B1 | B2 | mode |
|---|---|---|---|---|
| `staple` | 1.5/156 | 0.02/156 | 0.01/156 | perKcal |
| `main` | 0.8 | 0.2 | 0.15 | perServing |
| `side` | 2.0 | 0.05 | 0.06 | perServing |
| `soup` | 1.2 | 0.05 | 0.05 | perServing |
| `bowl` | 3.0 | 0.25 | 0.2 | perServing |
| `noodle` | 3.0 | 0.18 | 0.1 | perServing |
| `set` | 1.5 | 0.05 | 0.05 | perServing |
| `dessert` | 0.5 | 0.04 | 0.1 | perServing |
| `other` | 0.5 | 0.05 | 0.05 | perServing |

### 補完対象キー

[`scripts/augment.mjs`](scripts/augment.mjs) `AUGMENTABLE_KEYS`:

```js
['fiber', 'vitaminB1', 'vitaminB2']
```

実測値があれば Layer 1 で確定、なければ Layer 2 (パターン)、最後に Layer 3 (フォールバック)。

### UI での表示区別

補完値は各アイテムの `_estimated[]` に `{ key, source }` で記録される:

```json
"_estimated": [
  { "key": "fiber", "source": "食品成分表 八訂 11289 鶏もも皮つき から揚げ (80g)" }
]
```

UI ([`public/js/app.js`](public/js/app.js) `nutritionBar()`) はこれを検出し:
- ラベルに 「推」 バッジを付与 (CSS `.est-mark`、黄色背景)
- バーに斜線パターンを重ねる (CSS `.nut-row.estimated .nut-fill`)

フッターには食品成分表八訂 へのリンク付き出典を明示。

---

## 最適化エンジン

### カテゴリ定数 ([`public/js/combo-rules.js`](public/js/combo-rules.js))

```js
CATEGORIES = ['main', 'side', 'staple', 'soup', 'bowl', 'noodle', 'set', 'dessert', 'other']
```

### 2 つの組合せパターン

**定食パターン (teishoku)**
```
必須: 主食 × 1, 主菜 × 1
任意: 副菜 0-2, 汁物 0-1, デザート 0-1, その他 0-1
禁止: 丼・カレー / 麺類 / セット (一品系と相互排他)
```

**一品パターン (oneDish)**
```
必須: 丼・カレー OR 麺類 OR セット のいずれか 1 つ
任意: 副菜 0-2, 汁物 0-1, デザート 0-1
禁止: 主食 / 主菜
```

### 排他グループ (exclusive group)

`exclusiveGroupKey(item)` は現状:
- ライス小・中・大 (名前に `ライス|ご飯|ごはん|白飯` + category が `staple`) を同一キー `'rice'` で括り、**1 組合せ中 1 つまで**

これにより「ライス大 + ライス中」のような非常識組合せを構造的に排除。

### スコアリング関数 ([`public/js/nutrition.js`](public/js/nutrition.js))

#### 栄養目標

**日本人の食事摂取基準 2020 年版** (厚生労働省) の成人男性 18-29 歳・身体活動レベル II (ふつう) に基づく:

`DAILY_RDI` (1 日分、g / mg / μg):

| キー | 値 | 単位 | 備考 |
|---|---|---|---|
| energy | 2650 | kcal | 推定エネルギー必要量 |
| protein | 65 | g | 推奨量 |
| salt | 7.5 | g | **上限目標** (男性) |
| vegetable | 350 | g | 健康日本21 目標 |
| fiber | 21 | g | 目標量 |
| calcium | 800 | mg | 推奨量 |
| iron | 7.5 | mg | 推奨量 |
| vitaminA | 850 | μg | 推奨量 |
| vitaminB1 | 1.4 | mg | 推奨量 |
| vitaminB2 | 1.6 | mg | 推奨量 |
| vitaminC | 100 | mg | 推奨量 |

`MEAL_TARGET[k] = DAILY_RDI[k] / 3` (1 食 = 1/3 日)

`PFC_IDEAL`: エネルギー比 protein 15% / fat 25% / carbs 60%

#### 重み

`WEIGHTS` (合計 10.3):

| コンポーネント | 重み | 意図 |
|---|---|---|
| energy | 1.0 | 標準 |
| protein | 1.5 | 満足感・筋合成、摂取不足しがち |
| **vegetable** | **2.0** | 最重要 (健康日本21 で強調) |
| fiber | 1.2 | 摂取不足しがち |
| calcium | 0.8 | |
| iron | 0.8 | |
| salt | 1.5 | 過剰摂取ペナルティ重視 |
| pfc | 1.5 | バランス |

#### 4 種のスコア関数

**1. `aimScore(x, target)`** — 目標到達を評価 (0-100)

```
x ≤ 0 または target ≤ 0 → 0
x < target              → (x / target) × 100                    (線形ランプアップ)
target ≤ x ≤ 1.3 target → 100                                   (許容帯)
x > 1.3 target          → max(0, 100 - ((x - 1.3×target)/target) × 50)  (なだらか減点)
```

**2. `dailyBonus(x, mealTarget, dailyTarget)`** — 1 日分到達への加点 (0-30)

```
gap = dailyTarget - mealTarget
extra = x - mealTarget
gap ≤ 0 または extra ≤ 0 → 0
otherwise                 → min(30, (extra / gap) × 30)
```

対象栄養素 (`BONUS_KEYS`): protein, vegetable, fiber, calcium, iron (不足しがちな 5 項目)

**3. `boundPenalty(x, upperPerMeal)`** — 上限超過ペナルティ (0 〜 -60)

```
x ≤ upperPerMeal → 0
x > upperPerMeal → -min(60, (x - upperPerMeal) × 30)
```

食塩のみ対象 (`upperPerMeal = MEAL_TARGET.salt = 2.5g`)

**4. `pfcScore(protein, fat, carbs)`** — PFC エネルギー比バランス (0-100)

```
energies: pE = protein×4, fE = fat×9, cE = carbs×4
ratios: p = pE/total, f = fE/total, c = cE/total
dev = |p - 0.15| + |f - 0.25| + |c - 0.60|
score = max(0, 100 × (1 - dev))
```

#### 合成スコア

`scoreCombination(items)` は上記を各栄養素に適用して重み付き平均:

```
components = {
  energy:    aimScore(n.energy, MEAL_TARGET.energy),
  protein:   aimScore(n.protein, MEAL_TARGET.protein) + dailyBonus(...),
  vegetable: aimScore(n.vegetable, MEAL_TARGET.vegetable) + dailyBonus(...),
  fiber:     aimScore(n.fiber, MEAL_TARGET.fiber) + dailyBonus(...),
  calcium:   aimScore(n.calcium, MEAL_TARGET.calcium) + dailyBonus(...),
  iron:      aimScore(n.iron, MEAL_TARGET.iron) + dailyBonus(...),
  salt:      100 + boundPenalty(n.salt, MEAL_TARGET.salt),
  pfc:       pfcScore(n.protein, n.fat, n.carbs),
}

score = Σ(components[k] × WEIGHTS[k]) / Σ(WEIGHTS[k])     → 0-100 にクランプ
```

戻り値は `{ score, components, nutrition }` の 3 層構造。

### 組合せ探索 ([`public/js/optimizer.js`](public/js/optimizer.js))

**手法選択**: 全探索 (brute enumeration)。47 品 + カテゴリ制約 + 予算フィルタで有効組合せは典型的に数千〜数万 (¥700 予算で約 11,000 件)。ブラウザで <50ms で完走するため DP / ILP は不採用、実装・デバッグの単純性を優先。

`rankCombinations(items, options)`:

| オプション | デフォルト | 意味 |
|---|---|---|
| `budget` | 800 | 上限 (円) |
| `patterns` | `['teishoku', 'oneDish']` | 採用パターン |
| `allowDessert` | `true` | デザート含める |
| `requireSoup` | `false` | 汁物必須 |
| `keepTop` | 200 | min-heap 保持サイズ (UI は 300 を指定) |
| `maxEnumeration` | 500000 | 打切上限 |

戻り値: `{ top: [...], enumerated: N, truncated: boolean }`

**アルゴリズム**: `enumerateAll()` から組合せを 1 つずつ取り出し → `scoreCombination()` → `keepTop` サイズの min-heap で上位のみ保持 → 最終降順ソート。

### 多様化 ([`public/js/diversity.js`](public/js/diversity.js))

#### MMR (Maximal Marginal Relevance)

`selectDiverseTopK(ranked, k = 3, lambda = 0.7)`:

```
1 件目: 最高スコア
2 件目以降: argmax_c [ λ × normalize(score(c)) - (1-λ) × max_sim(c, selected) ]
類似度: Jaccard = |A ∩ B| / |A ∪ B| (アイテム code ベース)
```

`λ = 0.7` なら質 70% + 多様性 30%。A/B/C で主菜・主食が毎回異なる構造を確保。

#### Boltzmann サンプリング (ランダムモード)

`boltzmannSample(ranked, { temperature = 10, k = 3, rng = Math.random })`:

```
weight(c) = exp((score(c) - maxScore) / max(0.1, T))
           ↑ 数値安定化 (max score を引いてから exp)

1. 重み付きランダム抽出
2. 抽出後、他候補の重みを max(0.05, 1 - similarity) 倍にペナルティ (多様性確保)
3. k 回繰り返し
```

温度 `T` が高いほどランダム、低いほど greedy 寄り。UI 既定 `T = 10`。

---

## UI

### DOM 構成 ([`public/index.html`](public/index.html))

| id / セレクタ | type / 要素 | 用途 |
|---|---|---|
| `.cafeteria-tabs` | nav (tablist) | 食堂切替タブ (4 件: 各食堂 + 豊中キャンパス内一覧) — 動的生成 |
| `.cafeteria-meta` | section | 選択食堂のフル名・営業時間・定休日・元サイトリンク — 動的更新 |
| `#budget` | range (300-2000, step 10, default 700) | 予算スライダー |
| `#budget-value` | output | 予算値の表示 |
| `input[name=mode]` | radio (`topk` / `random`) | 提案モード |
| `#pat-teishoku` | checkbox (default checked) | 定食パターン ON/OFF |
| `#pat-onedish` | checkbox (default checked) | 一品パターン ON/OFF |
| `#no-dessert` | checkbox | デザート除外 |
| `#require-soup` | checkbox | 汁物必須 |
| `.nutrition-toggles .toggle[data-toggle]` | button (複数 active 可) | 栄養条件ハードフィルタ 6 種 — 動的生成 |
| `#find` | button | 「組合せを探す」トリガ |
| `#status` | p (aria-live="polite") | ステータス表示 |
| `#results` | section | A/B/C カード描画先 (食堂名バッジ + スコア内訳 `<details>` 付き) |
| `#menu-count` | span | 全メニュー件数 |
| `#menu-list` | ul | 全メニュー一覧 |
| `#last-updated` | span | データ最終更新日時 |
| `.chip[data-cat]` | button | カテゴリフィルタ (all/main/side/...) |

### データ読込 ([`public/js/app.js`](public/js/app.js))

```js
// 1) 初回: 食堂一覧を取得
fetch('./data/index.json', { cache: 'no-cache' })

// 2) タブ切替時: 対象食堂のメニューを遅延ロード
fetch(`./data/${id}/menu.json`, { cache: 'no-cache' })
fetch(`./data/${id}/meta.json`, { cache: 'no-cache' })

// 3) 「豊中キャンパス内一覧」タブ: 3 食堂を並列ロードしてマージ
await Promise.all(state.cafeterias.map((c) => loadCafeteria(c.id)));
const merged = state.cafeterias.flatMap((c) => state.itemsByCafeteria[c.id].items);
```

読み込み済み食堂は `state.itemsByCafeteria` にキャッシュ。エラーは `#status` に表示。

### カテゴリ表示マッピング

`public/js/app.js`:

```js
CATEGORY_LABELS = {
  main: '主菜', side: '副菜', staple: '主食', soup: '汁物',
  bowl: '丼・カレー', noodle: '麺類', set: 'セット',
  dessert: 'デザート', other: 'その他',
}
CATEGORY_BADGE_COLOR = {
  main: '#e74c3c', side: '#27ae60', staple: '#f39c12', soup: '#9b59b6',
  bowl: '#d35400', noodle: '#16a085', set: '#34495e',
  dessert: '#e91e63', other: '#7f8c8d',
}
```

### スタイル ([`public/css/styles.css`](public/css/styles.css))

`:root` で定義する CSS 変数:

```css
--bg: #f4f6fa;          --surface: #ffffff;
--text: #1f2937;        --muted: #6b7280;
--primary: #2563eb;     --primary-hover: #1d4ed8;
--accent: #f59e0b;      --success: #10b981;
--warn: #f59e0b;        --error: #ef4444;
--border: #e5e7eb;      --radius: 12px;
--shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
```

グラデーションヘッダ、CSS Grid によるカードレイアウト。**500px 以下**では `.nut-daily` を隠し、combo-item のグリッドを 3 列に縮小 (モバイル最適化)。

### アクセシビリティ

- すべての操作要素に `<label>` または `aria-label`
- ステータス領域は `aria-live="polite"`
- 栄養バーには `aria-label` で読み上げ用テキスト ("食物繊維 10.6g (推定), 1日の51%")
- 推定値のバッジ `.est-mark` には `title` 属性で詳細ヒント

---

## ローカル開発

### 必要環境

- Node.js **20 以上** (built-in fetch + `node --test` 使用)
- Python 3 (静的サーバー起動用。任意、他の静的サーバーでも可)
- Git

### セットアップ

```bash
git clone https://github.com/Funmatu/osaka-univ-cafeteria.git
cd osaka-univ-cafeteria
npm install           # 唯一の依存: cheerio
```

### npm スクリプト ([`package.json`](package.json))

| コマンド | 動作 |
|---|---|
| `npm run scrape` | `node scripts/scrape.mjs` を実行、`public/data/*.json` を更新 |
| `npm run serve` | `python3 -m http.server 8080 --directory public` で静的配信 |
| `npm test` | `node --test test/*.mjs` で全ユニットテスト実行 |

### 開発フロー

```bash
# 1. データを取得 (初回 or 手動更新したい時)
npm run scrape

# 2. 静的サーバー起動
npm run serve
# → http://localhost:8080 で開発版にアクセス
# (WSL の場合は http://<WSL IP>:8080 でもOK)

# 3. テスト
npm test
```

ブラウザで UI を変更したら、ソース (JS/CSS/HTML) の再読込は Ctrl+F5 で反映。`./data/menu.json` は `cache: 'no-cache'` で取得するため常に最新。

---

## GitHub Actions ワークフロー

### `update-menu.yml` — 毎日のスクレイピング

| 項目 | 値 |
|---|---|
| トリガ | `schedule: '0 21 * * *'` (UTC 21:00 = **JST 06:00**) + `workflow_dispatch` |
| ランナー | `ubuntu-latest` |
| タイムアウト | 15 分 |
| 権限 | `contents: write` |
| 並行性 | group=`update-menu`, cancel-in-progress=`false` (シリアライズ) |
| Node | 22 (actions/setup-node@v4) |
| 依存 | `npm install --no-audit --no-fund` (lockfile あれば ci 等価) |
| タイムゾーン | `TZ=Asia/Tokyo` で実行 |
| コミット | `github-actions[bot]` が `public/data/*.json` を差分があれば commit |
| コミットメッセージ | `chore(data): refresh menu YYYY-MM-DD` |
| 失敗時 | `debug-*.png` と `public/data/*.json` を artifact として 7 日保持 |

### `pages.yml` — GitHub Pages デプロイ

| 項目 | 値 |
|---|---|
| トリガ | `push` (paths: `public/**`, `.github/workflows/pages.yml`) + `workflow_dispatch` |
| 権限 | `contents: read`, `pages: write`, `id-token: write` |
| 並行性 | group=`pages`, cancel-in-progress=`true` (最新のみ勝つ) |
| 環境 | `github-pages` (GitHub 管理) |
| 動作 | `public/` を artifact 化 → `actions/deploy-pages@v4` で公開 |

---

## デプロイ手順 (初回セットアップ)

### 1. Pages ソースを「GitHub Actions」に切替

`Settings → Pages → Build and deployment → Source`:
```
Deploy from a branch  →  GitHub Actions
```

(これをやらないと README.md が Jekyll で index になってしまう)

### 2. Actions に書込み権限を付与

`Settings → Actions → General → Workflow permissions`:
- ⚫ **Read and write permissions**

これをやらないと `update-menu.yml` の `git push` が 403 で失敗する。

### 3. 初回スクレイピングを手動実行

`Actions タブ → Update Menu Data → Run workflow → main`

- 所要 **約 1 分** (47 件取得を並列度 4 で処理、各リクエスト後 500ms スリープ → 47 ÷ 4 × 500ms ≈ 6 秒 + HTTP オーバヘッド)
- 成功すれば `chore(data): refresh menu YYYY-MM-DD` のコミットが main に自動追加
- そのコミットが `pages.yml` のトリガ条件 (`public/**`) を満たし、Pages 再デプロイを起動

### 4. 公開 URL 確認

`Settings → Pages` に `https://<ユーザー名>.github.io/osaka-univ-cafeteria/` が表示される。

### 5. 動作チェックリスト

- [ ] 全メニュー件数が 40 件以上表示される
- [ ] 予算 ¥700 で「組合せを探す」→ A/B/C 3 案 (異なる主菜・主食)
- [ ] ランダムモード切替 → 別組合せが返る
- [ ] カテゴリフィルタで件数絞り込みが動作
- [ ] 食物繊維バーに「推」バッジ + 斜線パターン
- [ ] フッター「データ最終更新」に今日の日付

---

## カスタマイズ

### 予算レンジの変更

[`public/index.html`](public/index.html) の `<input id="budget" min="300" max="2000" step="10" value="700">` を編集。

### 栄養目標 (例: 女性、高齢者、活動量別)

[`public/js/nutrition.js`](public/js/nutrition.js) の `DAILY_RDI` を書き換えるだけ。`MEAL_TARGET` は派生値なので自動反映される。

例: 成人女性 18-29 歳・身体活動 II →
```js
export const DAILY_RDI = Object.freeze({
  energy: 2000,    // → 1食 667 kcal
  protein: 50,     // → 1食 16.7g
  salt: 6.5,
  // ...
});
```

### スコアリング重みのチューニング

[`public/js/nutrition.js`](public/js/nutrition.js) の `WEIGHTS`:
- 減塩重視なら `salt: 3.0`
- 高たんぱく嗜好なら `protein: 2.5`
- バランス最優先なら `pfc: 3.0`

### カテゴリ制約の調整

[`public/js/combo-rules.js`](public/js/combo-rules.js) `PATTERNS`:
- 副菜を 3 つまで許可 → `side: [0, 3]`
- デザート必須 → `dessert: [1, 1]`

### 参照 DB へのエントリ追加

新しい料理型を補完できるようにするには [`scripts/reference-db.mjs`](scripts/reference-db.mjs) `REFERENCE_DB` に追加:

```js
{
  patterns: [/酢豚|酢鶏/],
  category: 'main',
  mode: 'perServing',
  values: { fiber: 1.5, vitaminB1: 0.4, vitaminB2: 0.15 },
  source: '食品成分表 八訂 複合 酢豚 (150g)',
}
```

**マッチ順序に注意**: 具体的な料理型 (シチュー等) を食材ベース (チキン等) より**先**に置く。

---

## テスト

`test/` 配下を `node --test` が全件実行。**現在 40 テスト全 pass**。

| ファイル | LOC | 対象 | 代表テスト |
|---|---|---|---|
| `nutrition.test.mjs` | 99 | aimScore / dailyBonus / boundPenalty / pfcScore / scoreCombination | 境界値 (0, target, 1.3×target), 理想 PFC, 過剰塩ペナルティ |
| `combo-rules.test.mjs` | 108 | groupByCategory / isRice / enumerateAll / totalPrice | 予算遵守、ライス×2 排除、定食必須 1 主食 1 主菜 |
| `diversity.test.mjs` | 76 | jaccardSimilarity / selectDiverseTopK / boltzmannSample | 同一=1, 互換=0, 近似複製の排除、λ=1.0 純スコア |
| `augment.test.mjs` | 62 | augmentItem / augmentAll | perKcal スケーリング、測定値保護、パターン優先、カテゴリフォールバック、レバー高 B2 |

ローカル実行:
```bash
npm test
```

CI 上での自動実行は未設定 (将来的に `.github/workflows/ci.yml` で追加余地)。

---

## データ品質とメンテナンス

### 期待されるデータ状態

正常な `meta.json`:
```json
{
  "itemCount": 40-55,      // 曜日により変動
  "withNutrition": itemCount - 0〜2,   // 特殊メニューで欠落許容
  "augmented": ≤ itemCount,
  "issues": 0-2           // 「17:30〜限定」のような時限メニューは 1 件許容
}
```

### 失敗時のデバッグ

1. `Actions タブ → Update Menu Data → 失敗した run`
2. ログを確認
3. 失敗時は `scrape-debug` という artifact が 7 日間残る (`public/data/*.json` のスナップショット)

### 想定される障害と対処

| 症状 | 原因 | 対処 |
|---|---|---|
| 全 0 件取得 | `menu_load.php` の URL 構造が変わった | [`scripts/scrape.mjs`](scripts/scrape.mjs) `LOAD_URL` を再確認 |
| 名前が全部「大阪大学生協○○食堂」 | detail.php の h1 構造変更 | [`scripts/parser.mjs`](scripts/parser.mjs) `SITE_HEADER_NAMES` を該当食堂で更新 |
| 栄養値欠落 | detail.php のラベル変更 | `NUMERIC_PATTERNS` の正規表現を調整 |
| push 403 | workflow permissions 未設定 | Settings → Actions → Workflow permissions を "Read and write" に |
| Pages が README を表示 | Pages Source が "Deploy from a branch" | "GitHub Actions" に変更 |

### 手動スクレイピング

GitHub で手動再実行:
- `Actions タブ → Update Menu Data → Run workflow`

ローカルで:
```bash
npm run scrape
git add public/data/
git commit -m "chore(data): manual menu refresh"
git push
```

### データソース側のマナー

- 1 日 1 回、47 req/回 程度 (= 約 0.0005 QPS) の極めて軽量アクセス
- 500ms inter-request delay、並列度 4
- UA に連絡先 URL を明記

---

## 今後の発展余地

### ✅ 実装済み: 豊中キャンパス 3 食堂対応 (2026-04)

west2-univ.jp の **パラメータ `t=XXXXXX`** 構造に合わせて [`scripts/cafeterias.mjs`](scripts/cafeterias.mjs) で食堂レジストリを一元管理、`public/data/{id}/` にディレクトリ分割。対応食堂:

- 豊中図書館下食堂 (`t=663252`)
- カフェテリアかさね (`t=663258`)
- 福利会館3階食堂 (`t=663253`)

### 🎯 次の優先課題: 吹田・箕面キャンパス対応

豊中以外のキャンパス食堂も west2-univ.jp で同じ URL 形態:

- 吹田: 工学部食堂ファミール (`t=663255`) / Kitchen BISYOKU (`t=663264`) / カフェテリア匠 (`t=663265`)
- 箕面: カフェテリアレインボー (`t=663251`)

拡張は [`scripts/cafeterias.mjs`](scripts/cafeterias.mjs) にエントリを追加するだけで完結 (スクレイパ・UI は自動で対応)。必要ならタブをキャンパスでグルーピング表示に変更する。

### ⭐ その他の発展アイデア

- **栄養目標プリセット**: 女性 / シニア / 活動量別 / 増量期 / 減量期 / 妊婦など、`DAILY_RDI` を UI から切替
- **アレルゲン情報の取得**: detail.php にはアレルゲン記載がある (現状未抽出)。`parser.mjs` を拡張し、除外フィルタを UI に追加
- **参照 DB の拡充**: 55 件 → 100 件以上へ拡大、曖昧マッチ (fuzzy search) 導入で未マッチ件数を減らす
- **味覚プロファイル学習**: localStorage にユーザーの好み (選んだ組合せ履歴) を保存し、パーソナライズスコアに反映
- **Service Worker でオフラインキャッシュ**: 最新の menu.json をキャッシュし、オフライン時も動作
- **メニュー履歴分析**: 過去の `menu.json` を git 履歴から集計し、頻出メニュー / 季節メニューを可視化
- **CI での自動テスト実行**: `.github/workflows/ci.yml` を追加し、PR 時に `npm test` を自動実行
- **データスキーマの JSON Schema 化**: `ajv` で menu.json を CI で検証
- **PWA 化**: manifest + 基本的な iOS/Android ホーム画面追加対応
- **ビタミン・ミネラルの追加可視化**: 現在は 8 栄養素のみバー表示、他ビタミン類もオンデマンドで展開可能に
- **食事の時間帯別対応**: 朝/昼/夜で別メニュー、推奨組合せを時間帯別に
- **価格変動アラート**: 前日比で値上げ / 値下げ / 新登場 / 販売終了をハイライト
- **推定値の精度向上**: 料理ベース + 食材分解ベースの組合せで、揚げ物の油由来カロリー分離などより精密化

---

## 出典と参考資料

| 項目 | 出典 |
|---|---|
| メニュー情報・基本栄養素 | [west2-univ.jp (大学生協事業連合)](https://west2-univ.jp/sp/osaka-univ.php) — 豊中図書館下 (`t=663252`) / カフェテリアかさね (`t=663258`) / 福利会館3階 (`t=663253`) © 大阪大学生協 |
| 栄養目標 (1 日分) | [日本人の食事摂取基準 (2020 年版) — 厚生労働省](https://www.mhlw.go.jp/stf/newpage_08517.html) |
| 野菜摂取目標 (350g/日) | 健康日本21 — 厚生労働省 |
| 補完参照データ (fiber, B1, B2) | [日本食品標準成分表 2020 年版 (八訂) — 文部科学省](https://fooddb.mext.go.jp/) |
| 食品成分表の再利用 | 測定値は日本著作権法 10 条 2 項により著作物性なし。出典明示で公益目的で再利用可能 |

---

## ライセンス

本リポジトリのコードは [MIT License](LICENSE) (c) 2025 Funmatu。

参照する外部データ (メニュー・画像・栄養値) の権利は各サイトおよび大阪大学生協に帰属。本アプリはカフェテリア利用者向けの個人的な参考情報を提供するものであり、価格・栄養・アレルゲン情報の最終的な確認は必ず掲載元および店頭でお願いします。
