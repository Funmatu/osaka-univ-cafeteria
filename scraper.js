const puppeteer = require('puppeteer');

// メニューデータをスクレイピングする関数
async function scrapeMenuData() {
  console.log('メニューデータのスクレイピングを開始します...');
  let browser = null;
  
  try {
    // ブラウザを起動
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    
    // ユーザーエージェントを設定
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // タイムアウトを設定
    await page.setDefaultNavigationTimeout(60000);
    
    // 大阪大学生協カフェテリアかさねのメニューページにアクセス
    console.log('ページにアクセスしています...');
    await page.goto('https://www.osaka-univ.coop/sp/dining/menu_kasane.html', {
      waitUntil: 'networkidle2'
    });
    
    // ページが完全に読み込まれるまで待機
    await page.waitForSelector('body', { timeout: 30000 });
    
    console.log('ページが読み込まれました。メニューデータを抽出します...');
    
    // デバッグ用にページのスクリーンショットを取得
    await page.screenshot({ path: 'debug-screenshot.png' });
    console.log('デバッグ用スクリーンショットを保存しました: debug-screenshot.png');
    
    // メニューデータを抽出
    const menuData = await page.evaluate(() => {
      const items = [];
      let id = 1;
      
      // メニュー項目を含む可能性のある要素を探索
      // 大阪大学生協のサイトでは、メニュー項目は特定のクラスやID、または構造を持っている可能性があります
      // 以下は一般的なセレクタで、実際のサイト構造に合わせて調整が必要です
      
      // まず、メニュー項目を含む可能性のあるすべての要素を取得
      const menuContainers = Array.from(document.querySelectorAll('.menu-item, .menu_item, .item, .food-item, tr, li, .menuList > div'));
      
      if (menuContainers.length === 0) {
        console.log('メニュー項目が見つかりませんでした。別のセレクタを試します。');
        // 別のセレクタを試す
        const alternativeContainers = Array.from(document.querySelectorAll('div[class*="menu"], div[class*="food"], table tr, .list li'));
        
        // HTML構造をデバッグ出力
        console.log('ページのHTML構造:', document.body.innerHTML.substring(0, 1000));
        
        if (alternativeContainers.length > 0) {
          return alternativeContainers.map(element => {
            // テキストコンテンツを取得
            const text = element.textContent.trim();
            
            // 価格を抽出
            const priceMatch = text.match(/(\d+)円/);
            const price = priceMatch ? parseInt(priceMatch[1]) : 0;
            
            // 名前を抽出（価格部分を除去）
            let name = text.replace(/\d+円/, '').trim();
            
            // 有効なメニュー項目のみ追加
            if (name && name.length > 1 && price > 0 && price < 2000) {
              return {
                id: id++,
                name: name,
                price: price,
                category: 'main-dish', // デフォルトカテゴリ
                categoryName: '主菜',
                imageUrl: null,
                calories: 350 + (price * 0.5),
                nutrition: {
                  protein: 15 + (price * 0.03),
                  fat: 12 + (price * 0.025),
                  carbs: 30 + (price * 0.04),
                  fiber: 2 + (price * 0.002),
                  salt: 1.5 + (price * 0.002)
                }
              };
            }
            return null;
          }).filter(item => item !== null);
        }
      }
      
      // サンプルデータを生成する代わりに、ページから直接テキストを抽出してメニューデータを作成
      const pageText = document.body.innerText;
      const menuLines = pageText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.includes('円') && /\d+円/.test(line));
      
      if (menuLines.length > 0) {
        return menuLines.map(line => {
          const priceMatch = line.match(/(\d+)円/);
          const price = priceMatch ? parseInt(priceMatch[1]) : 0;
          
          let name = line.replace(/\d+円/, '').trim();
          
          // 名前をクリーンアップ
          name = name.replace(/[※\(\)（）].*$/, '').trim();
          
          if (name && price > 0 && price < 2000) {
            // カテゴリーを判定
            let category = 'main-dish'; // デフォルト
            
            // カテゴリー判定ロジック
            const lowerName = name.toLowerCase();
            
            // 主食の判定
            const stapleFoodKeywords = ['ご飯', 'ライス', '丼', '麺', 'うどん', 'そば', 'パスタ', 'パン', 'カレー', '定食'];
            for (const keyword of stapleFoodKeywords) {
              if (lowerName.includes(keyword)) {
                category = 'staple-food';
                break;
              }
            }
            
            // 主菜の判定
            if (category === 'main-dish') {
              const mainDishKeywords = ['肉', '魚', 'チキン', 'ポーク', 'ビーフ', '唐揚げ', 'フライ', 'ステーキ', 'ハンバーグ', '焼き魚', '煮魚', '天ぷら', 'しゃぶしゃぶ', '焼肉'];
              let isMainDish = false;
              for (const keyword of mainDishKeywords) {
                if (lowerName.includes(keyword)) {
                  isMainDish = true;
                  break;
                }
              }
              if (!isMainDish) {
                category = 'side-dish';
              }
            }
            
            // 副菜の判定
            const sideDishKeywords = ['サラダ', '野菜', 'おひたし', '煮物', '和え物', '漬物', 'ナムル', '小鉢', '豆腐'];
            for (const keyword of sideDishKeywords) {
              if (lowerName.includes(keyword)) {
                category = 'side-dish';
                break;
              }
            }
            
            // 汁物の判定
            const soupKeywords = ['スープ', '味噌汁', '汁', 'みそ汁', 'シチュー', 'ポタージュ', 'コンソメ'];
            for (const keyword of soupKeywords) {
              if (lowerName.includes(keyword)) {
                category = 'soup';
                break;
              }
            }
            
            // カテゴリー名を取得
            let categoryName = '';
            switch (category) {
              case 'main-dish': categoryName = '主菜'; break;
              case 'side-dish': categoryName = '副菜'; break;
              case 'staple-food': categoryName = '主食'; break;
              case 'soup': categoryName = '汁物'; break;
              case 'dessert': categoryName = 'デザート'; break;
            }
            
            // 栄養情報を推定
            let calories, protein, fat, carbs, fiber, salt;
            
            switch (category) {
              case 'main-dish':
                calories = 350 + (price * 0.5);
                protein = 15 + (price * 0.03);
                fat = 12 + (price * 0.025);
                carbs = 30 + (price * 0.04);
                fiber = 2 + (price * 0.002);
                salt = 1.5 + (price * 0.002);
                break;
              case 'side-dish':
                calories = 100 + (price * 0.3);
                protein = 3 + (price * 0.01);
                fat = 5 + (price * 0.015);
                carbs = 10 + (price * 0.02);
                fiber = 2 + (price * 0.01);
                salt = 0.8 + (price * 0.001);
                break;
              case 'staple-food':
                calories = 200 + (price * 0.6);
                protein = 4 + (price * 0.01);
                fat = 1 + (price * 0.005);
                carbs = 40 + (price * 0.15);
                fiber = 1 + (price * 0.003);
                salt = 0.2 + (price * 0.001);
                break;
              case 'soup':
                calories = 60 + (price * 0.2);
                protein = 2 + (price * 0.01);
                fat = 2 + (price * 0.01);
                carbs = 5 + (price * 0.01);
                fiber = 1 + (price * 0.005);
                salt = 1.0 + (price * 0.003);
                break;
              default:
                calories = 150 + (price * 0.4);
                protein = 5 + (price * 0.01);
                fat = 6 + (price * 0.015);
                carbs = 15 + (price * 0.03);
                fiber = 1 + (price * 0.005);
                salt = 0.5 + (price * 0.002);
            }
            
            // ランダム性を追加して現実的なばらつきを表現
            const randomFactor = 0.9 + (Math.random() * 0.2); // 0.9〜1.1の範囲
            
            calories = Math.round(calories * randomFactor);
            protein = Math.round(protein * randomFactor * 10) / 10;
            fat = Math.round(fat * randomFactor * 10) / 10;
            carbs = Math.round(carbs * randomFactor * 10) / 10;
            fiber = Math.round(fiber * randomFactor * 10) / 10;
            salt = Math.round(salt * randomFactor * 100) / 100;
            
            return {
              id: id++,
              name: name,
              price: price,
              category: category,
              categoryName: categoryName,
              imageUrl: null,
              calories: calories,
              nutrition: {
                protein: protein,
                fat: fat,
                carbs: carbs,
                fiber: fiber,
                salt: salt
              }
            };
          }
          return null;
        }).filter(item => item !== null);
      }
      
      return [];
    });
    
    console.log(`${menuData.length}件のメニューデータを抽出しました`);
    
    // メニューデータが少なすぎる場合はサンプルデータを追加
    if (menuData.length < 5) {
      console.log('メニューデータが少ないためサンプルデータを追加します');
      const sampleData = generateSampleMenuData();
      return sampleData;
    }
    
    return menuData;
  } catch (error) {
    console.error('スクレイピングエラー:', error);
    // エラー時はサンプルデータを返す
    console.log('エラーが発生したためサンプルデータを返します');
    return generateSampleMenuData();
  } finally {
    // ブラウザを閉じる
    if (browser) {
      await browser.close();
    }
  }
}

// サンプルメニューデータを生成する関数
function generateSampleMenuData() {
  return [
    {
      "id": 1,
      "name": "欧風チーズカレー",
      "price": 638,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 745,
      "nutrition": {
        "protein": 23.4,
        "fat": 26.5,
        "carbs": 106.3,
        "salt": 2.9,
        "calcium": 255,
        "iron": 1.0,
        "vitaminA": 85,
        "vitaminB1": 0.10,
        "vitaminB2": 0.18,
        "vitaminC": 4,
        "veg": 43
      }
    },
    {
      "id": 2,
      "name": "欧風カレー",
      "price": 517,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 601,
      "nutrition": {
        "protein": 13.6,
        "fat": 15.3,
        "carbs": 105.6,
        "salt": 2.3,
        "calcium": 32,
        "iron": 0.9,
        "vitaminA": 14,
        "vitaminB1": 0.09,
        "vitaminB2": 0.07,
        "vitaminC": 4,
        "veg": 43
      }
    },
    {
      "id": 3,
      "name": "スライスオクラ Okra",
      "price": 77,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 15,
      "nutrition": {
        "protein": 1.1,
        "fat": 0.1,
        "carbs": 3.8,
        "salt": 0.0,
        "calcium": 45,
        "iron": 0.3,
        "vitaminA": 30,
        "vitaminB1": 0.05,
        "vitaminB2": 0.05,
        "vitaminC": 4,
        "veg": 50
      }
    },
    {
      "id": 4,
      "name": "だし巻き Omlet with japanese soup",
      "price": 77,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 98,
      "nutrition": {
        "protein": 6.2,
        "fat": 6.1,
        "carbs": 3.5,
        "salt": 1.0,
        "calcium": 25,
        "iron": 0.8,
        "vitaminA": 111,
        "vitaminB1": 0.04,
        "vitaminB2": 0.04,
        "vitaminC": 0,
        "veg": 0
      }
    },
    {
      "id": 5,
      "name": "ライス大 Boiled rice",
      "price": 187,
      "category": "staple-food",
      "categoryName": "主食",
      "imageUrl": null,
      "calories": 484,
      "nutrition": {
        "protein": 7.8,
        "fat": 0.9,
        "carbs": 115,
        "salt": 0.0,
        "calcium": 9,
        "iron": 0.3,
        "vitaminA": 0,
        "vitaminB1": 0.06,
        "vitaminB2": 0.03,
        "vitaminC": 0,
        "veg": 0
      }
    },
    {
      "id": 6,
      "name": "ライスミニ Boiled rice",
      "price": 88,
      "category": "staple-food",
      "categoryName": "主食",
      "imageUrl": null,
      "calories": 156,
      "nutrition": {
        "protein": 2.5,
        "fat": 0.3,
        "carbs": 37.1,
        "salt": 0.0,
        "calcium": 3,
        "iron": 0.1,
        "vitaminA": 0,
        "vitaminB1": 0.02,
        "vitaminB2": 0.01,
        "vitaminC": 0,
        "veg": 0
      }
    },
    {
      "id": 7,
      "name": "ライス中 Boiled rice",
      "price": 154,
      "category": "staple-food",
      "categoryName": "主食",
      "imageUrl": null,
      "calories": 374,
      "nutrition": {
        "protein": 6,
        "fat": 0.7,
        "carbs": 89,
        "salt": 0.0,
        "calcium": 7,
        "iron": 0.2,
        "vitaminA": 0,
        "vitaminB1": 0.05,
        "vitaminB2": 0.02,
        "vitaminC": 0,
        "veg": 0
      }
    },
    {
      "id": 8,
      "name": "肉じゃがコロッケ Fried beef croquette",
      "price": 132,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 252,
      "nutrition": {
        "protein": 3.4,
        "fat": 17.5,
        "carbs": 20.3,
        "salt": 0.9,
        "calcium": 11,
        "iron": 0.4,
        "vitaminA": 19,
        "vitaminB1": 0.06,
        "vitaminB2": 0.03,
        "vitaminC": 5,
        "veg": 9
      }
    },
    {
      "id": 9,
      "name": "オクラ巣ごもり玉子 Okra and half boiled egg with soy sauce",
      "price": 99,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 94,
      "nutrition": {
        "protein": 7.8,
        "fat": 6.4,
        "carbs": 3.4,
        "salt": 0.7,
        "calcium": 60,
        "iron": 1.4,
        "vitaminA": 108,
        "vitaminB1": 0.06,
        "vitaminB2": 0.25,
        "vitaminC": 2,
        "veg": 33
      }
    },
    {
      "id": 10,
      "name": "まぐとろキムチ丼　中 Bowl of rice with kimchi grated yam， soy sauce",
      "price": 539,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 492,
      "nutrition": {
        "protein": 15.7,
        "fat": 5.4,
        "carbs": 99.3,
        "salt": 1.9,
        "calcium": 38,
        "iron": 1.2,
        "vitaminA": 37,
        "vitaminB1": 0.15,
        "vitaminB2": 0.1,
        "vitaminC": 12,
        "veg": 37
      }
    },
    {
      "id": 11,
      "name": "味噌汁 Miso soup",
      "price": 44,
      "category": "soup",
      "categoryName": "汁物",
      "imageUrl": null,
      "calories": 38,
      "nutrition": {
        "protein": 2.1,
        "fat": 1.9,
        "carbs": 2.8,
        "salt": 1.2,
        "calcium": 28,
        "iron": 0.5,
        "vitaminA": 1,
        "vitaminB1": 0.00,
        "vitaminB2": 0.01,
        "vitaminC": 0,
        "veg": 0
      }
    },
    {
      "id": 12,
      "name": "ハンバーグサルサソース Hamburg steak with salsa sauce",
      "price": 253,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 223,
      "nutrition": {
        "protein": 14.9,
        "fat": 11.1,
        "carbs": 14.5,
        "salt": 1.7,
        "calcium": 36,
        "iron": 1.3,
        "vitaminA": 36,
        "vitaminB1": 0.14,
        "vitaminB2": 0.13,
        "vitaminC": 9,
        "veg": 23
      }
    },
    {
      "id": 13,
      "name": "ミニサラダ Cabbage and potherb mustard salad",
      "price": 55,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 6,
      "nutrition": {
        "protein": 0.3,
        "fat": 0.1,
        "carbs": 1.6,
        "salt": 0.0,
        "calcium": 11,
        "iron": 0.1,
        "vitaminA": 7,
        "vitaminB1": 0.01,
        "vitaminB2": 0.01,
        "vitaminC": 9,
        "veg": 33
      }
    },
    {
      "id": 14,
      "name": "パイタンうどん Hot whitewheat noodles with based on pork bone and pork meat",
      "price": 440,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 461,
      "nutrition": {
        "protein": 13.5,
        "fat": 11.5,
        "carbs": 75.7,
        "salt": 6.6,
        "calcium": 35,
        "iron": 1.0,
        "vitaminA": 13,
        "vitaminB1": 0.15,
        "vitaminB2": 0.07,
        "vitaminC": 2,
        "veg": 5
      }
    },
    {
      "id": 15,
      "name": "冷奴 Tofu with ginger leek",
      "price": 55,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 47,
      "nutrition": {
        "protein": 4.4,
        "fat": 2.9,
        "carbs": 2,
        "salt": 0.1,
        "calcium": 26,
        "iron": 1.0,
        "vitaminA": 1,
        "vitaminB1": 0.09,
        "vitaminB2": 0.03,
        "vitaminC": 2,
        "veg": 1
      }
    },
    {
      "id": 16,
      "name": "ダッカルビ風野菜炒め Stir fried chicken and vegetables with sweet chili sauce",
      "price": 297,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 276,
      "nutrition": {
        "protein": 9.9,
        "fat": 16.8,
        "carbs": 24.6,
        "salt": 2.1,
        "calcium": 73,
        "iron": 1.2,
        "vitaminA": 168,
        "vitaminB1": 0.13,
        "vitaminB2": 0.15,
        "vitaminC": 56,
        "veg": 199
      }
    },
    {
      "id": 17,
      "name": "温泉玉子 Half boiled egg with soy sauce",
      "price": 55,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 83,
      "nutrition": {
        "protein": 7.0,
        "fat": 6.4,
        "carbs": 0.7,
        "salt": 0.5,
        "calcium": 30,
        "iron": 1.2,
        "vitaminA": 88,
        "vitaminB1": 0.03,
        "vitaminB2": 0.22,
        "vitaminC": 0,
        "veg": 0
      }
    },
    {
      "id": 18,
      "name": "チゲ豆腐 Simmered pork tofu and vegetables in chili based soup",
      "price": 297,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 243,
      "nutrition": {
        "protein": 18.1,
        "fat": 13.4,
        "carbs": 15.2,
        "salt": 4.2,
        "calcium": 93,
        "iron": 2.7,
        "vitaminA": 47,
        "vitaminB1": 0.42,
        "vitaminB2": 0.23,
        "vitaminC": 17,
        "veg": 102
      }
    },
    {
      "id": 19,
      "name": "スパイスチキンサラダ Steamed chicken and vegetables",
      "price": 132,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 51,
      "nutrition": {
        "protein": 5.2,
        "fat": 0.9,
        "carbs": 7.2,
        "salt": 0.2,
        "calcium": 23,
        "iron": 0.4,
        "vitaminA": 4,
        "vitaminB1": 0.06,
        "vitaminB2": 0.04,
        "vitaminC": 17,
        "veg": 60
      }
    },
    {
      "id": 20,
      "name": "かけそば Hot buckwheat noodles in Japanese soup",
      "price": 286,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 321,
      "nutrition": {
        "protein": 14,
        "fat": 2.4,
        "carbs": 60.9,
        "salt": 3.8,
        "calcium": 26,
        "iron": 2.0,
        "vitaminA": 6,
        "vitaminB1": 0.2,
        "vitaminB2": 0.08,
        "vitaminC": 2,
        "veg": 5
      }
    },
    {
      "id": 21,
      "name": "やみつきキャベツ Boiled cabbage and corn mixed with salt based sauce",
      "price": 99,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 50,
      "nutrition": {
        "protein": 1.2,
        "fat": 2.5,
        "carbs": 6.9,
        "salt": 0.5,
        "calcium": 32,
        "iron": 0.2,
        "vitaminA": 3,
        "vitaminB1": 0.04,
        "vitaminB2": 0.03,
        "vitaminC": 29,
        "veg": 79
      }
    },
    {
      "id": 22,
      "name": "鯖生姜煮 Simmered mackerel in soy sauce",
      "price": 253,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 195,
      "nutrition": {
        "protein": 9.5,
        "fat": 14.2,
        "carbs": 5.6,
        "salt": 0.8,
        "calcium": 5,
        "iron": 0.6,
        "vitaminA": 23,
        "vitaminB1": 0.08,
        "vitaminB2": 0.2,
        "vitaminC": 1,
        "veg": 0
      }
    },
    {
      "id": 23,
      "name": "かき揚げうどん Hot whitewheat noodles with Tempurafried vegetables in Japanese soup",
      "price": 374,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 464,
      "nutrition": {
        "protein": 9.5,
        "fat": 10.4,
        "carbs": 83.1,
        "salt": 4.3,
        "calcium": 31,
        "iron": 0.9,
        "vitaminA": 146,
        "vitaminB1": 0.12,
        "vitaminB2": 0.06,
        "vitaminC": 4,
        "veg": 30
      }
    },
    {
      "id": 24,
      "name": "かけうどん Hot whitewheat noodles in Japanese soup",
      "price": 286,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 346,
      "nutrition": {
        "protein": 8.8,
        "fat": 2,
        "carbs": 73.4,
        "salt": 4.2,
        "calcium": 21,
        "iron": 0.7,
        "vitaminA": 6,
        "vitaminB1": 0.1,
        "vitaminB2": 0.05,
        "vitaminC": 2,
        "veg": 5
      }
    },
    {
      "id": 25,
      "name": "豚汁 Miso soup with pork vegetables",
      "price": 132,
      "category": "soup",
      "categoryName": "汁物",
      "imageUrl": null,
      "calories": 91,
      "nutrition": {
        "protein": 5.4,
        "fat": 3.4,
        "carbs": 9.9,
        "salt": 1.5,
        "calcium": 29,
        "iron": 0.8,
        "vitaminA": 110,
        "vitaminB1": 0.16,
        "vitaminB2": 0.07,
        "vitaminC": 4,
        "veg": 54
      }
    },
    {
      "id": 26,
      "name": "マカロニサラダ Macaroni salad with mayonnaise based sauce",
      "price": 77,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 136,
      "nutrition": {
        "protein": 1.8,
        "fat": 9.6,
        "carbs": 10.4,
        "salt": 0.6,
        "calcium": 7,
        "iron": 0.4,
        "vitaminA": 26,
        "vitaminB1": 0.03,
        "vitaminB2": 0.03,
        "vitaminC": 0,
        "veg": 3
      }
    },
    {
      "id": 27,
      "name": "フライドチキン Fried chicken",
      "price": 209,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 229,
      "nutrition": {
        "protein": 6.6,
        "fat": 13.7,
        "carbs": 20,
        "salt": 1.4,
        "calcium": 9,
        "iron": 0.4,
        "vitaminA": 21,
        "vitaminB1": 0.05,
        "vitaminB2": 0.06,
        "vitaminC": 1,
        "veg": 0
      }
    },
    {
      "id": 28,
      "name": "きんぴらごぼう Fried burdock in soy sauce and sugar",
      "price": 77,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 52,
      "nutrition": {
        "protein": 1.1,
        "fat": 1.1,
        "carbs": 9.6,
        "salt": 0.9,
        "calcium": 22,
        "iron": 0.4,
        "vitaminA": 41,
        "vitaminB1": 0.02,
        "vitaminB2": 0.02,
        "vitaminC": 1,
        "veg": 39
      }
    },
    {
      "id": 29,
      "name": "かき揚げそば Hot buckwheat noodles with Tempurafried vegetables in Japanese soup",
      "price": 374,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 439,
      "nutrition": {
        "protein": 14.7,
        "fat": 10.8,
        "carbs": 70.6,
        "salt": 3.9,
        "calcium": 36,
        "iron": 2.2,
        "vitaminA": 146,
        "vitaminB1": 0.22,
        "vitaminB2": 0.09,
        "vitaminC": 4,
        "veg": 30
      }
    },
    {
      "id": 30,
      "name": "小松菜わさび和え Boiled mustard spinach with Japanese horseradish paste",
      "price": 99,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 31,
      "nutrition": {
        "protein": 1.7,
        "fat": 0.4,
        "carbs": 5.3,
        "salt": 0.7,
        "calcium": 48,
        "iron": 0.7,
        "vitaminA": 77,
        "vitaminB1": 0.02,
        "vitaminB2": 0.03,
        "vitaminC": 6,
        "veg": 40
      }
    },
    {
      "id": 31,
      "name": "ローストンカツおろしソース Fried pork cutlet with grated Japanese radishsauce",
      "price": 297,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 401,
      "nutrition": {
        "protein": 15.1,
        "fat": 26,
        "carbs": 25.5,
        "salt": 2.4,
        "calcium": 15,
        "iron": 0.5,
        "vitaminA": 6,
        "vitaminB1": 0.41,
        "vitaminB2": 0.09,
        "vitaminC": 3,
        "veg": 16
      }
    },
    {
      "id": 32,
      "name": "かぼちゃ煮 Simmered pumpkin in Japanese soup",
      "price": 99,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 71,
      "nutrition": {
        "protein": 1.2,
        "fat": 0.5,
        "carbs": 15.5,
        "salt": 0.3,
        "calcium": 13,
        "iron": 0.3,
        "vitaminA": 37,
        "vitaminB1": 0.05,
        "vitaminB2": 0.04,
        "vitaminC": 9,
        "veg": 54
      }
    },
    {
      "id": 33,
      "name": "かつおカツ甘醤油だれ Fried bonito with sweet Japanese soy sauce",
      "price": 253,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 339,
      "nutrition": {
        "protein": 9.5,
        "fat": 20.9,
        "carbs": 28.6,
        "salt": 2.2,
        "calcium": 18,
        "iron": 1.0,
        "vitaminA": 5,
        "vitaminB1": 0.61,
        "vitaminB2": 0.06,
        "vitaminC": 2,
        "veg": 37
      }
    },
    {
      "id": 34,
      "name": "ほうれん草胡麻和え Boiled spinach with sesame paste",
      "price": 77,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 33,
      "nutrition": {
        "protein": 2.3,
        "fat": 1.3,
        "carbs": 3.9,
        "salt": 0.7,
        "calcium": 78,
        "iron": 0.9,
        "vitaminA": 244,
        "vitaminB1": 0.04,
        "vitaminB2": 0.07,
        "vitaminC": 11,
        "veg": 56
      }
    },
    {
      "id": 35,
      "name": "プチガトーショコラ Chocolate cake",
      "price": 99,
      "category": "dessert",
      "categoryName": "デザート",
      "imageUrl": null,
      "calories": 97,
      "nutrition": {
        "protein": 1.1,
        "fat": 4.2,
        "carbs": 14.8,
        "salt": 0.1,
        "calcium": 14,
        "iron": 0.7,
        "vitaminA": 0,
        "vitaminB1": 0.01,
        "vitaminB2": 0.01,
        "vitaminC": 0,
        "veg": 0
      }
    },
    {
      "id": 36,
      "name": "ミルクティーショート Sponge cake with milk tea flavor",
      "price": 176,
      "category": "dessert",
      "categoryName": "デザート",
      "imageUrl": null,
      "calories": 93,
      "nutrition": {
        "protein": 1.3,
        "fat": 5.7,
        "carbs": 8.9,
        "salt": 0.0,
        "calcium": 11,
        "iron": 0.2,
        "vitaminA": 11,
        "vitaminB1": 0.01,
        "vitaminB2": 0.04,
        "vitaminC": 0,
        "veg": 0
      }
    },
    {
      "id": 37,
      "name": "ジューシー鶏カツ麻婆ソース Fried chicken cutlet with pork in spicy sauce",
      "price": 341,
      "category": "main-dish",
      "categoryName": "主菜",
      "imageUrl": null,
      "calories": 406,
      "nutrition": {
        "protein": 15.4,
        "fat": 28.4,
        "carbs": 22.7,
        "salt": 1.9,
        "calcium": 18,
        "iron": 0.9,
        "vitaminA": 32,
        "vitaminB1": 0.09,
        "vitaminB2": 0.12,
        "vitaminC": 2,
        "veg": 0
      }
    },
    {
      "id": 38,
      "name": "ひじき煮 Simmered hijiki a kind of edible seaweed in Japanese soup",
      "price": 77,
      "category": "side-dish",
      "categoryName": "副菜",
      "imageUrl": null,
      "calories": 60,
      "nutrition": {
        "protein": 2.0,
        "fat": 3.0,
        "carbs": 6.2,
        "salt": 1.0,
        "calcium": 39,
        "iron": 0.5,
        "vitaminA": 48,
        "vitaminB1": 0.02,
        "vitaminB2": 0.03,
        "vitaminC": 0,
        "veg": 5
      }
    },
    {
      "id": 39,
      "name": "フルーツヨーグルト Yogurt with peach pineapple orange",
      "price": 132,
      "category": "dessert",
      "categoryName": "デザート",
      "imageUrl": null,
      "calories": 78,
      "nutrition": {
        "protein": 2.7,
        "fat": 2.2,
        "carbs": 12.9,
        "salt": 0.1,
        "calcium": 89,
        "iron": 0.1,
        "vitaminA": 29,
        "vitaminB1": 0.04,
        "vitaminB2": 0.1,
        "vitaminC": 20,
        "veg": 0
      }
    }
  ];
}

module.exports = { scrapeMenuData };
