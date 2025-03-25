const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const { scrapeMenuData } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// メニューデータのキャッシュパス
const CACHE_PATH = path.join(__dirname, 'data', 'menu-cache.json');

// キャッシュディレクトリの確認と作成
async function ensureCacheDir() {
  const dir = path.dirname(CACHE_PATH);
  try {
    await fs.access(dir);
  } catch (error) {
    await fs.mkdir(dir, { recursive: true });
  }
}

// ルートパスのハンドリング
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// メニューデータを取得するAPI
app.get('/api/menu', async (req, res) => {
  try {
    // キャッシュからデータを読み込む
    let menuData;
    let cacheStats;
    
    try {
      const cacheContent = await fs.readFile(CACHE_PATH, 'utf8');
      menuData = JSON.parse(cacheContent);
      cacheStats = await fs.stat(CACHE_PATH);
    } catch (error) {
      console.log('キャッシュが見つからないか無効です。新しいデータを取得します。');
      menuData = await scrapeMenuData();
      await ensureCacheDir();
      await fs.writeFile(CACHE_PATH, JSON.stringify(menuData), 'utf8');
      cacheStats = await fs.stat(CACHE_PATH);
    }
    
    // キャッシュが6時間以上古い場合は更新
    const cacheAge = Date.now() - cacheStats.mtime.getTime();
    if (cacheAge > 6 * 60 * 60 * 1000) {
      console.log('キャッシュが古いため更新します');
      
      // 非同期で更新を開始（レスポンスを待たない）
      scrapeMenuData().then(async (newData) => {
        if (newData && newData.length > 0) {
          await fs.writeFile(CACHE_PATH, JSON.stringify(newData), 'utf8');
          console.log('キャッシュを更新しました');
        }
      }).catch(err => {
        console.error('キャッシュ更新中にエラーが発生しました:', err);
      });
    }
    
    res.json({
      data: menuData,
      lastUpdated: cacheStats.mtime,
      source: 'cache'
    });
  } catch (error) {
    console.error('メニューデータ取得エラー:', error);
    res.status(500).json({ error: 'メニューデータの取得に失敗しました', message: error.message });
  }
});

// 手動でデータを更新するAPI
app.post('/api/refresh-menu', async (req, res) => {
  try {
    console.log('メニューデータを手動で更新します');
    const menuData = await scrapeMenuData();
    
    if (!menuData || menuData.length === 0) {
      return res.status(400).json({ error: 'メニューデータの取得に失敗しました' });
    }
    
    await ensureCacheDir();
    await fs.writeFile(CACHE_PATH, JSON.stringify(menuData), 'utf8');
    
    res.json({
      data: menuData,
      lastUpdated: new Date(),
      source: 'fresh'
    });
  } catch (error) {
    console.error('メニューデータ更新エラー:', error);
    res.status(500).json({ error: 'メニューデータの更新に失敗しました', message: error.message });
  }
});

// 毎日午前5時にメニューデータを自動更新
cron.schedule('0 5 * * *', async () => {
  try {
    console.log('定期的なメニューデータ更新を開始します');
    const menuData = await scrapeMenuData();
    
    if (menuData && menuData.length > 0) {
      await ensureCacheDir();
      await fs.writeFile(CACHE_PATH, JSON.stringify(menuData), 'utf8');
      console.log('メニューデータを自動更新しました');
    }
  } catch (error) {
    console.error('自動メニューデータ更新エラー:', error);
  }
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});
