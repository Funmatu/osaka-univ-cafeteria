// メニューデータを格納する変数
let menuData = [];
let filteredMenuData = [];
let lastUpdated = null;

// ページ読み込み時にメニューデータを取得
document.addEventListener('DOMContentLoaded', function() {
    fetchMenuData();
    
    // フィルターボタンのイベントリスナー
    document.querySelectorAll('.menu-filter').forEach(button => {
        button.addEventListener('click', function() {
            // アクティブクラスを切り替え
            document.querySelectorAll('.menu-filter').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
            
            // メニューをフィルタリング
            const filter = this.getAttribute('data-filter');
            if (filter === 'all') {
                filteredMenuData = [...menuData];
            } else {
                filteredMenuData = menuData.filter(item => item.category === filter);
            }
            
            // フィルタリング後に現在の予算で再計算
            const budget = parseInt(document.getElementById('budget').value);
            if (!isNaN(budget) && budget > 0) {
                const recommendation = menuRecommender.findOptimalCombination(budget);
                menuRecommender.displayRecommendation(recommendation);
            }
        });
    });
    
    // データ更新ボタンのイベントリスナー
    document.getElementById('refresh-data').addEventListener('click', refreshMenuData);
    
    // 最適な組み合わせを探すボタンのイベントリスナー
    document.getElementById('findCombination').addEventListener('click', function() {
        const budget = parseInt(document.getElementById('budget').value);
        
        if (isNaN(budget) || budget <= 0) {
            alert('有効な予算を入力してください');
            return;
        }
        
        const recommendation = menuRecommender.findOptimalCombination(budget);
        menuRecommender.displayRecommendation(recommendation);
    });
});

// メニューデータを取得する関数
async function fetchMenuData() {
    const loadingElement = document.getElementById('loading');
    const errorContainer = document.getElementById('error-container');
    const fallbackNotice = document.getElementById('fallback-notice');
    const lastUpdatedElement = document.getElementById('last-updated');
    
    loadingElement.style.display = 'block';
    errorContainer.innerHTML = '';
    fallbackNotice.style.display = 'none';
    
    try {
        // APIからメニューデータを取得
        const response = await fetch('/api/menu');
        
        if (!response.ok) {
            throw new Error(`HTTP エラー: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) {
            throw new Error('メニューデータが空です');
        }
        
        menuData = data.data;
        filteredMenuData = [...menuData];
        lastUpdated = new Date(data.lastUpdated);
        
        console.log(`${menuData.length}件のメニューデータを取得しました`);
        
        // 最終更新日時を表示
        if (lastUpdated) {
            lastUpdatedElement.textContent = `最終更新: ${lastUpdated.toLocaleString()}`;
        }
        
        // 初期データ取得後に最初の推奨メニューを表示
        const budget = parseInt(document.getElementById('budget').value);
        if (!isNaN(budget) && budget > 0) {
            const recommendation = menuRecommender.findOptimalCombination(budget);
            menuRecommender.displayRecommendation(recommendation);
        }
    } catch (error) {
        console.error('メニューデータの取得に失敗しました:', error);
        errorContainer.innerHTML = `
            <div class="error-message">
                <p>メニューデータの取得に失敗しました: ${error.message}</p>
                <p>サンプルデータを使用します。</p>
            </div>
        `;
        
        // エラー時はサンプルデータを使用
        menuData = generateSampleMenuData();
        filteredMenuData = [...menuData];
        lastUpdated = new Date();
        fallbackNotice.style.display = 'block';
        
        // エラー後もメニュー推奨を表示
        const budget = parseInt(document.getElementById('budget').value);
        if (!isNaN(budget) && budget > 0) {
            const recommendation = menuRecommender.findOptimalCombination(budget);
            menuRecommender.displayRecommendation(recommendation);
        }
        
        lastUpdatedElement.textContent = `最終更新: ${lastUpdated.toLocaleString()} (サンプルデータ)`;
    } finally {
        loadingElement.style.display = 'none';
    }
}

// メニューデータを手動で更新する関数
async function refreshMenuData() {
    const loadingElement = document.getElementById('loading');
    const errorContainer = document.getElementById('error-container');
    const fallbackNotice = document.getElementById('fallback-notice');
    const lastUpdatedElement = document.getElementById('last-updated');
    
    loadingElement.style.display = 'block';
    errorContainer.innerHTML = '';
    fallbackNotice.style.display = 'none';
    
    try {
        // APIからメニューデータを更新
        const response = await fetch('/api/refresh-menu', {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP エラー: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) {
            throw new Error('メニューデータが空です');
        }
        
        menuData = data.data;
        filteredMenuData = [...menuData];
        lastUpdated = new Date(data.lastUpdated);
        
        console.log(`${menuData.length}件のメニューデータを更新しました`);
        
        // 最終更新日時を表示
        if (lastUpdated) {
            lastUpdatedElement.textContent = `最終更新: ${lastUpdated.toLocaleString()}`;
        }
        
        // 更新後に最初の推奨メニューを表示
        const budget = parseInt(document.getElementById('budget').value);
        if (!isNaN(budget) && budget > 0) {
            const recommendation = menuRecommender.findOptimalCombination(budget);
            menuRecommender.displayRecommendation(recommendation);
        }
        
        alert('メニューデータを更新しました');
    } catch (error) {
        console.error('メニューデータの更新に失敗しました:', error);
        errorContainer.innerHTML = `
            <div class="error-message">
                <p>メニューデータの更新に失敗しました: ${error.message}</p>
            </div>
        `;
    } finally {
        loadingElement.style.display = 'none';
    }
}

// サンプルメニューデータを生成する関数
function generateSampleMenuData() {
    return [
        {
            id: 1,
            name: "唐揚げ定食",
            price: 480,
            category: "main-dish",
            categoryName: "主菜",
            imageUrl: null,
            calories: 650,
            nutrition: {
                protein: 28,
                fat: 25,
                carbs: 75,
                fiber: 3,
                salt: 2.8
            }
        },
        // 他のサンプルメニュー項目（元のコードと同じ）
        {
            id: 2,
            name: "野菜炒め",
            price: 320,
            category: "side-dish",
            categoryName: "副菜",
            imageUrl: null,
            calories: 180,
            nutrition: {
                protein: 5,
                fat: 10,
                carbs: 15,
                fiber: 5,
                salt: 1.5
            }
        },
        {
            id: 3,
            name: "ご飯（中）",
            price: 150,
            category: "staple-food",
            categoryName: "主食",
            imageUrl: null,
            calories: 300,
            nutrition: {
                protein: 4,
                fat: 0.5,
                carbs: 70,
                fiber: 1,
                salt: 0
            }
        },
        {
            id: 4,
            name: "味噌汁",
            price: 100,
            category: "soup",
            categoryName: "汁物",
            imageUrl: null,
            calories: 60,
            nutrition: {
                protein: 3,
                fat: 2,
                carbs: 5,
                fiber: 1,
                salt: 1.2
            }
        },
        {
            id: 5,
            name: "サラダ",
            price: 200,
            category: "side-dish",
            categoryName: "副菜",
            imageUrl: null,
            calories: 80,
            nutrition: {
                protein: 2,
                fat: 5,
                carbs: 8,
                fiber: 4,
                salt: 0.5
            }
        },
        {
            id: 6,
            name: "豚丼",
            price: 450,
            category: "main-dish",
            categoryName: "主菜",
            imageUrl: null,
            calories: 600,
            nutrition: {
                protein: 25,
                fat: 20,
                carbs: 80,
                fiber: 2,
                salt: 2.5
            }
        },
        {
            id: 7,
            name: "うどん",
            price: 350,
            category: "staple-food",
            categoryName: "主食",
            imageUrl: null,
            calories: 400,
            nutrition: {
                protein: 10,
                fat: 3,
                carbs: 85,
                fiber: 2,
                salt: 1.8
            }
        },
        {
            id: 8,
            name: "ほうれん草のおひたし",
            price: 150,
            category: "side-dish",
            categoryName: "副菜",
            imageUrl: null,
            calories: 50,
            nutrition: {
                protein: 3,
                fat: 1,
                carbs: 5,
                fiber: 3,
                salt: 0.8
            }
        },
        {
            id: 9,
            name: "ハンバーグ",
            price: 400,
            category: "main-dish",
            categoryName: "主菜",
            imageUrl: null,
            calories: 450,
            nutrition: {
                protein: 22,
                fat: 28,
                carbs: 20,
                fiber: 1,
                salt: 2.2
            }
        },
        {
            id: 10,
            name: "わかめスープ",
            price: 120,
            category: "soup",
            categoryName: "汁物",
            imageUrl: null,
            calories: 40,
            nutrition: {
                protein: 2,
                fat: 1,
                carbs: 4,
                fiber: 2,
                salt: 1.5
            }
        },
        {
            id: 11,
            name: "カレーライス",
            price: 380,
            category: "main-dish",
            categoryName: "主菜",
            imageUrl: null,
            calories: 700,
            nutrition: {
                protein: 15,
                fat: 18,
                carbs: 120,
                fiber: 4,
                salt: 3.0
            }
        },
        {
            id: 12,
            name: "冷奴",
            price: 120,
            category: "side-dish",
            categoryName: "副菜",
            imageUrl: null,
            calories: 70,
            nutrition: {
                protein: 6,
                fat: 4,
                carbs: 2,
                fiber: 0.5,
                salt: 0.5
            }
        },
        {
            id: 13,
            name: "きつねうどん",
            price: 320,
            category: "staple-food",
            categoryName: "主食",
            imageUrl: null,
            calories: 450,
            nutrition: {
                protein: 12,
                fat: 8,
                carbs: 80,
                fiber: 3,
                salt: 3.5
            }
        },
        {
            id: 14,
            name: "野菜サラダ",
            price: 180,
            category: "side-dish",
            categoryName: "副菜",
            imageUrl: null,
            calories: 60,
            nutrition: {
                protein: 2,
                fat: 3,
                carbs: 6,
                fiber: 3,
                salt: 0.3
            }
        },
        {
            id: 15,
            name: "親子丼",
            price: 420,
            category: "main-dish",
            categoryName: "主菜",
            imageUrl: null,
            calories: 650,
            nutrition: {
                protein: 30,
                fat: 18,
                carbs: 85,
                fiber: 2,
                salt: 2.2
            }
        }
    ];
}

// 栄養バランス分析モジュール
const nutritionAnalyzer = {
    // 理想的なPFCバランス（タンパク質:脂質:炭水化物）
    idealRatio: {
        protein: 0.15, // 15%
        fat: 0.25,     // 25%
        carbs: 0.60    // 60%
    },
    
    // 栄養バランススコア計算
    calculateBalanceScore(combination) {
        // 組み合わせの総栄養素を計算
        const totalNutrition = {
            protein: 0,
            fat: 0,
            carbs: 0,
            fiber: 0,
            calories: 0,
            salt: 0
        };
        
        combination.forEach(item => {
            totalNutrition.protein += item.nutrition.protein;
            totalNutrition.fat += item.nutrition.fat;
            totalNutrition.carbs += item.nutrition.carbs;
            totalNutrition.fiber += item.nutrition.fiber;
            totalNutrition.calories += item.calories;
            totalNutrition.salt += item.nutrition.salt;
        });
        
        // カロリーあたりの各栄養素の割合を計算
        const totalCaloriesFromMacros = 
            totalNutrition.protein * 4 + 
            totalNutrition.fat * 9 + 
            totalNutrition.carbs * 4;
        
        const actualRatio = {
            protein: (totalNutrition.protein * 4) / totalCaloriesFromMacros,
            fat: (totalNutrition.fat * 9) / totalCaloriesFromMacros,
            carbs: (totalNutrition.carbs * 4) / totalCaloriesFromMacros
        };
        
        // 理想比率との差を計算
        const proteinDiff = Math.abs(actualRatio.protein - this.idealRatio.protein);
        const fatDiff = Math.abs(actualRatio.fat - this.idealRatio.fat);
        const carbsDiff = Math.abs(actualRatio.carbs - this.idealRatio.carbs);
        
        // 差が小さいほど良いスコア（100点満点）
        const macroBalanceScore = 100 - (proteinDiff + fatDiff + carbsDiff) * 100;
        
        // 食物繊維のボーナス（1gあたり2点、最大20点）
        const fiberBonus = Math.min(totalNutrition.fiber * 2, 20);
        
        // カテゴリバランスの評価（主食・主菜・副菜・汁物の組み合わせ）
        let categoryBonus = 0;
        const categories = combination.map(item => item.category);
        
        if (categories.includes('main-dish')) categoryBonus += 10;
        if (categories.includes('staple-food')) categoryBonus += 10;
        if (categories.includes('side-dish')) categoryBonus += 10;
        if (categories.includes('soup')) categoryBonus += 5;
        
        // 塩分ペナルティ（塩分が6gを超えると減点）
        const saltPenalty = totalNutrition.salt > 6 ? Math.min((totalNutrition.salt - 6) * 5, 20) : 0;
        
        // 最終スコア（マクロ栄養素バランス60%、食物繊維10%、カテゴリバランス30%、塩分ペナルティ）
        const finalScore = (macroBalanceScore * 0.6) + (fiberBonus * 0.5) + categoryBonus - saltPenalty;
        
        return {
            score: Math.round(Math.max(0, Math.min(finalScore, 100))),
            nutrition: totalNutrition,
            ratios: actualRatio
        };
    }
};

// メニュー提案モジュール
const menuRecommender = {
    // 予算内での最適な組み合わせを探索
    findOptimalCombination(budget) {
        if (filteredMenuData.length === 0) {
            return null;
        }
        
        let bestCombination = [];
        let bestScore = 0;
        
        // 全ての可能な組み合わせを探索（最大4品まで）
        const combinations = this.generateCombinations(budget, 4);
        
        combinations.forEach(combination => {
            const analysis = nutritionAnalyzer.calculateBalanceScore(combination);
            
            if (analysis.score > bestScore) {
                bestScore = analysis.score;
                bestCombination = {
                    items: combination,
                    score: analysis.score,
                    nutrition: analysis.nutrition,
                    ratios: analysis.ratios,
                    totalPrice: combination.reduce((sum, item) => sum + item.price, 0)
                };
            }
        });
        
        return bestCombination;
    },
    
    // 予算内での全ての組み合わせを生成
    generateCombinations(budget, maxItems) {
        const combinations = [];
        
        // 1品の場合
        filteredMenuData.forEach(item => {
            if (item.price <= budget) {
                combinations.push([item]);
            }
        });
        
        // 2品以上の組み合わせ
        for (let i = 2; i <= maxItems; i++) {
            this.combineItems([], filteredMenuData, 0, budget, i, combinations);
        }
        
        // 組み合わせが見つからない場合、予算内の単品を返す
        if (combinations.length === 0) {
            filteredMenuData.forEach(item => {
                if (item.price <= budget) {
                    combinations.push([item]);
                }
            });
        }
        
        console.log(`予算${budget}円で${combinations.length}個の組み合わせが見つかりました`);
        return combinations;
    },
    
    // 再帰的に組み合わせを生成
    combineItems(current, items, startIndex, remainingBudget, remainingItems, result) {
        if (remainingItems === 0) {
            result.push([...current]);
            return;
        }
        
        for (let i = startIndex; i < items.length; i++) {
            const item = items[i];
            if (item.price <= remainingBudget) {
                current.push(item);
                this.combineItems(
                    current, 
                    items, 
                    i + 1, 
                    remainingBudget - item.price, 
                    remainingItems - 1, 
                    result
                );
                current.pop();
            }
        }
    },
    
    // 結果を表示
    displayRecommendation(recommendation) {
        const resultDiv = document.getElementById('result');
        
        if (!recommendation || recommendation.items.length === 0) {
            resultDiv.innerHTML = '<p>指定された予算内で適切な組み合わせが見つかりませんでした。</p>';
            return;
        }
        
        let html = `
            <h2>最適なメニュー組み合わせ</h2>
            <div class="menu-combination">
                <p class="balance-score">栄養バランススコア: ${recommendation.score}/100</p>
        `;
        
        // メニュー項目を表示
        recommendation.items.forEach(item => {
            html += `
                <div class="menu-item">
                    ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}" class="menu-image">` : ''}
                    <div class="menu-details">
                        <span class="category-tag ${item.category}">${item.categoryName}</span>
                        <strong>${item.name}</strong> - ${item.price}円
                        <div>カロリー: ${item.calories}kcal / タンパク質: ${item.nutrition.protein}g / 脂質: ${item.nutrition.fat}g / 炭水化物: ${item.nutrition.carbs}g / 食物繊維: ${item.nutrition.fiber}g</div>
                    </div>
                </div>
            `;
        });
        
        // 栄養バランスのグラフ表示
        const totalNutrition = recommendation.nutrition;
        const ratios = recommendation.ratios;
        
        html += `
            <div class="nutrition-summary">
                <h3>栄養バランス</h3>
                <p>総カロリー: ${totalNutrition.calories}kcal / タンパク質: ${totalNutrition.protein.toFixed(1)}g / 脂質: ${totalNutrition.fat.toFixed(1)}g / 炭水化物: ${totalNutrition.carbs.toFixed(1)}g / 食物繊維: ${totalNutrition.fiber.toFixed(1)}g / 塩分: ${totalNutrition.salt.toFixed(1)}g</p>
                
                <div class="nutrition-chart">
                    <div class="nutrition-bar">
                        <span>タンパク質 ${Math.round(ratios.protein * 100)}%</span>
                        <div class="bar-container">
                            <div class="bar protein-bar" style="width: ${ratios.protein * 100}%"></div>
                        </div>
                    </div>
                    <div class="nutrition-bar">
                        <span>脂質 ${Math.round(ratios.fat * 100)}%</span>
                        <div class="bar-container">
                            <div class="bar fat-bar" style="width: ${ratios.fat * 100}%"></div>
                        </div>
                    </div>
                    <div class="nutrition-bar">
                        <span>炭水化物 ${Math.round(ratios.carbs * 100)}%</span>
                        <div class="bar-container">
                            <div class="bar carbs-bar" style="width: ${ratios.carbs * 100}%"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="total-price">
                合計金額: ${recommendation.totalPrice}円
            </div>
        </div>
        `;
        
        resultDiv.innerHTML = html;
    }
};
