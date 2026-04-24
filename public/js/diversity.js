// Jaccard 類似度: 共通アイテム数 / 和集合サイズ
export function jaccardSimilarity(a, b) {
  const setA = new Set(a.items.map((i) => i.code));
  const setB = new Set(b.items.map((i) => i.code));
  if (setA.size === 0 && setB.size === 0) return 1;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// MMR (Maximal Marginal Relevance) 風の多様化
// lambda=1 なら純粋スコア順、lambda=0 なら純粋多様性重視。既定 0.7 は「質優先、ほどよく多様」
export function selectDiverseTopK(ranked, k = 3, lambda = 0.7) {
  if (ranked.length === 0) return [];
  const normalize = (s) => Math.max(0, Math.min(100, s)) / 100;
  const picked = [ranked[0]];
  const remaining = ranked.slice(1);

  while (picked.length < k && remaining.length > 0) {
    let bestIdx = -1;
    let bestMmr = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      let maxSim = 0;
      for (const p of picked) {
        const sim = jaccardSimilarity(c, p);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = lambda * normalize(c.score) - (1 - lambda) * maxSim;
      if (mmr > bestMmr) {
        bestMmr = mmr;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    picked.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }
  return picked;
}

// Boltzmann サンプリング: P(combo) ∝ exp(score / T)
// temperature: 0 に近いほど最適解寄り、大きいほどランダム寄り。既定 10 = やや多様。
export function boltzmannSample(ranked, { temperature = 10, k = 3, rng = Math.random } = {}) {
  if (ranked.length === 0) return [];
  if (ranked.length <= k) return ranked.slice();

  // 数値安定化: スコア最大値を引いてから exp
  const maxScore = ranked[0].score;
  const weights = ranked.map((c) => Math.exp((c.score - maxScore) / Math.max(0.1, temperature)));

  const picked = [];
  const available = ranked.map((_, i) => i);
  const liveWeights = weights.slice();

  while (picked.length < k && available.length > 0) {
    let total = 0;
    for (const idx of available) total += liveWeights[idx];
    if (total <= 0) break;
    let r = rng() * total;
    let chosenPos = 0;
    for (let i = 0; i < available.length; i++) {
      r -= liveWeights[available[i]];
      if (r <= 0) {
        chosenPos = i;
        break;
      }
    }
    const chosenIdx = available[chosenPos];
    picked.push(ranked[chosenIdx]);
    available.splice(chosenPos, 1);
    // 選んだ候補との類似度で他を軽くペナライズ (多様性確保)
    for (let i = 0; i < available.length; i++) {
      const sim = jaccardSimilarity(ranked[available[i]], ranked[chosenIdx]);
      liveWeights[available[i]] *= Math.max(0.05, 1 - sim);
    }
  }
  return picked;
}
