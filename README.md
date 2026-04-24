# 🍱 阪大生協 豊中図書館下食堂 メニュー最適化

[大阪大学生協 豊中図書館下食堂](https://west2-univ.jp/sp/index.php?t=663252) の日替わりメニューから、
**予算内で栄養バランスの良い組合せ (A/B/C定食)** を自動提案する純粋静的 Web アプリ。

## 特徴

- **栄養バランススコア** (0-100) で組合せを評価。日本人の食事摂取基準2020・成人男性18-29歳・身体活動II の 1食分 (1/3) を基準とし、野菜・食物繊維・Ca・Fe・たんぱく質は 1日分に近づくほど加点。
- **「ご飯×2」などの非常識な組合せを排除**するカテゴリ制約。定食パターン (主食+主菜+副菜…) と一品パターン (丼/麺/セット) を切替可能。
- **MMR (Maximal Marginal Relevance)** で A/B/C 3案を多様化。毎回同じものにならない。
- **Boltzmann サンプリング**による「気分でランダム」モード (質は担保しつつ日々違う提案)。
- 全最適化はブラウザ内 JS で完結。**サーバー不要 / GitHub Pages のみで動作**。
- 毎朝 06:00 JST に GitHub Actions が west2-univ.jp から最新メニューと**本物の栄養成分**を取得。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│  GitHub Actions (cron: 毎朝 06:00 JST)              │
│    ├─ Puppeteer で menu.php を描画 → item code 抽出 │
│    ├─ detail.php を fetch (並列4 / 500msごと)        │
│    ├─ Cheerio で栄養成分パース                       │
│    └─ public/data/menu.json に commit & push        │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│  GitHub Pages (main branch の /public を自動配信)    │
│    index.html → ./data/menu.json を fetch           │
│    app.js が rankCombinations() で 1,000+ 組合せを  │
│    スコアリング → selectDiverseTopK で A/B/C 選定   │
└─────────────────────────────────────────────────────┘
```

## ディレクトリ構成

```
.
├── .github/workflows/
│   ├── update-menu.yml        # 毎朝スクレイピング
│   └── pages.yml              # Pages デプロイ
├── scripts/
│   ├── scrape.mjs             # スクレイパエントリ
│   ├── parser.mjs             # detail.php パーサ
│   └── lib/fetch-with-retry.mjs
├── public/                    # GitHub Pages ソース
│   ├── index.html
│   ├── js/
│   │   ├── app.js             # UI
│   │   ├── optimizer.js       # 組合せ列挙 + ランキング
│   │   ├── nutrition.js       # RDI + スコア関数
│   │   ├── combo-rules.js     # カテゴリ制約
│   │   └── diversity.js       # MMR + Boltzmann
│   ├── css/styles.css
│   └── data/
│       ├── menu.json          # 自動更新
│       └── meta.json
├── test/                      # Node.js test runner
│   ├── nutrition.test.mjs
│   ├── combo-rules.test.mjs
│   └── diversity.test.mjs
└── package.json
```

## ローカル開発

```bash
# 依存導入
npm install

# 静的サーバー起動 (Python3 必須)
npm run serve
# → http://localhost:8080

# スクレイパをローカル実行 (通常は GitHub Actions 任せ)
npm run scrape
# → public/data/menu.json が更新されます

# ユニットテスト
npm test
```

## 最適化アルゴリズム詳細

### カテゴリ制約 ([public/js/combo-rules.js](public/js/combo-rules.js))

**定食パターン (teishoku):**
- 主食 × 1, 主菜 × 1 (必須)
- 副菜 0-2, 汁物 0-1, デザート 0-1, その他 0-1 (任意)
- 丼・麺・セットは禁止

**一品パターン (oneDish):**
- 丼・カレー OR 麺類 OR セット × 1 (必須)
- 副菜 0-2, 汁物 0-1, デザート 0-1 (任意)
- 主食・主菜は禁止

**排他グループ:** ライス小/中/大は「rice」キーで括られ、いずれか 1 つまで。

### スコアリング関数 ([public/js/nutrition.js](public/js/nutrition.js))

3 種類の評価モード:

| 型 | 対象 | 計算 |
|---|---|---|
| `aim` | エネルギー, たんぱく質, 野菜, 繊維, Ca, Fe | 目標100%でピーク、0→100%線形上昇、130%以上は緩やかに減点 |
| `bound` | 食塩 | 上限2.5g以下=0、超過分だけ線形ペナルティ (最大-60) |
| `ratio` | PFC比 | 15%/25%/60% との偏差で減点 |

1食目標を超えた分は **1日分へ近づくほど加点** (最大+30点、対象: たんぱく質・野菜・繊維・Ca・Fe)。

重み (合計 10.2):
- vegetable: 2.0 ← 最重要 (不足しがち)
- protein: 1.5, salt: 1.5, pfc: 1.5
- fiber: 1.2
- energy: 1.0
- calcium: 0.8, iron: 0.8

### 組合せ探索 ([public/js/optimizer.js](public/js/optimizer.js))

- **全探索**: 約40品 × カテゴリ制約 × 予算フィルタで有効組合せは高々10万通り。ブラウザで <100ms で完走するため DP/ILP は採用せず、実装・デバッグの単純性を優先。
- **min-heap 風 top-K 保持**: keepTop=300 でスコア上位のみメモリに保持。

### 多様化 ([public/js/diversity.js](public/js/diversity.js))

**MMR (Maximal Marginal Relevance):**
```
mmr(c) = λ · normalize(score(c)) - (1-λ) · max_sim_to_selected
```
- λ = 0.7 (質 70% + 多様性 30%)
- 類似度は Jaccard 係数 (共有アイテム数/和集合)

**Boltzmann サンプリング (ランダムモード):**
```
P(c) ∝ exp(score(c) / T)
```
- T = 10 (やや多様)。温度を下げると最適寄り、上げるとランダム寄り。

## カスタマイズ

### 別カフェテリアへの切替

[scripts/scrape.mjs](scripts/scrape.mjs) の `CAFETERIA_ID` を変更してください。west2-univ.jp では `t=XXXXXX` パラメータがカフェテリアIDです。

### 栄養目標の変更 (例: 女性, 高齢者)

[public/js/nutrition.js](public/js/nutrition.js) の `DAILY_RDI` を書き換えてください。

### 重みチューニング

[public/js/nutrition.js](public/js/nutrition.js) の `WEIGHTS` を調整 (例: 塩分を強く避けたい → `salt: 3.0`)。

## データの扱い

- メニュー情報・栄養成分は [west2-univ.jp](https://west2-univ.jp/) より取得。
- スクレイピングは 1日1回のみ、detail ページは並列度4・500ms 間隔で礼儀正しく。
- User-Agent に `osaka-univ-cafeteria-bot/2.0` と連絡先 GitHub URL を明示。
- 利用はカフェテリア利用者向けの個人的参考情報としてのみ。価格・栄養は掲載元を最終的に確認してください。

## 出典

- 日本人の食事摂取基準 (2020年版) — 厚生労働省  
  https://www.mhlw.go.jp/stf/newpage_08517.html
- 健康日本21 (野菜摂取目標 350g/日) — 厚生労働省
- west2-univ.jp — 大学生協事業連合
- 栄養成分データ © 大阪大学生協

## ライセンス

MIT (see [LICENSE](LICENSE))
