const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Mobile Safari/537.36 osaka-univ-cafeteria-bot/2.0 ' +
  '(+https://github.com/Funmatu/osaka-univ-cafeteria)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url, { maxRetries = 3, baseDelayMs = 500, userAgent = DEFAULT_UA } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': userAgent, 'Accept-Language': 'ja,en;q=0.8' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;
      const delay = baseDelayMs * 2 ** attempt;
      console.warn(`fetch retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${err.message}`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

export async function mapWithConcurrency(items, concurrency, iter) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await iter(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export { sleep };
