import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { fetchWithRetry, mapWithConcurrency, sleep } from './lib/fetch-with-retry.mjs';
import { parseDetailHtml, inferCategoryFromName } from './parser.mjs';

const CAFETERIA_ID = '663252';
const MENU_URL = `https://west2-univ.jp/sp/menu.php?t=${CAFETERIA_ID}`;
const DETAIL_URL = (code) => `https://west2-univ.jp/sp/detail.php?t=${CAFETERIA_ID}&c=${code}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'data');

async function extractItemCodesWithBrowser() {
  console.log(`Launching headless browser to render ${MENU_URL}`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    );

    const xhrLog = [];
    page.on('response', async (res) => {
      const url = res.url();
      const type = res.request().resourceType();
      if ((type === 'xhr' || type === 'fetch') && url.includes('west2-univ.jp')) {
        xhrLog.push({ url, status: res.status(), type });
      }
    });

    await page.goto(MENU_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('a[href*="detail.php"]', { timeout: 20000 }).catch(() => {});

    const items = await page.evaluate(() => {
      const results = [];
      const anchors = document.querySelectorAll('a[href*="detail.php"]');
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/[?&]c=(\d+)/);
        if (!m) continue;
        const code = m[1];

        let categoryJa = null;
        let cursor = a.parentElement;
        for (let hops = 0; hops < 6 && cursor; hops++, cursor = cursor.parentElement) {
          const heading = cursor.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > .title, :scope > header');
          if (heading) {
            categoryJa = heading.textContent.trim();
            break;
          }
        }
        if (!categoryJa) {
          let prev = a.closest('section, div, li');
          while (prev) {
            const sibling = prev.previousElementSibling;
            if (sibling && /^(H[1-4]|HEADER)$/.test(sibling.tagName)) {
              categoryJa = sibling.textContent.trim();
              break;
            }
            prev = prev.parentElement;
            if (!prev || prev === document.body) break;
          }
        }

        const nameEl = a.querySelector('.name, .menu-name, p, span') || a;
        const name = (nameEl.textContent || '').trim().replace(/\s+/g, ' ');

        const priceEl = a.querySelector('.price, .menu-price');
        let price = null;
        if (priceEl) {
          const m2 = priceEl.textContent.match(/(\d{2,4})/);
          if (m2) price = parseInt(m2[1], 10);
        }
        if (price === null) {
          const m3 = a.textContent.match(/(\d{2,4})\s*円/);
          if (m3) price = parseInt(m3[1], 10);
        }

        results.push({ code, name, price, categoryJa });
      }
      const seen = new Set();
      return results.filter((r) => (seen.has(r.code) ? false : (seen.add(r.code), true)));
    });

    console.log(`menu.php rendered: extracted ${items.length} items`);
    if (xhrLog.length) {
      console.log(`Observed ${xhrLog.length} XHR/fetch requests (candidates for future direct API):`);
      for (const x of xhrLog.slice(0, 10)) console.log(`  [${x.status}] ${x.url}`);
    } else {
      console.log('No XHR/fetch observed — menu.php likely renders server-side via inline data.');
    }
    return items;
  } finally {
    await browser.close();
  }
}

async function fetchDetail(item) {
  const url = DETAIL_URL(item.code);
  const html = await fetchWithRetry(url);
  await sleep(500);
  const parsed = parseDetailHtml(html, { code: item.code });

  return {
    code: item.code,
    name: parsed.name || item.name || `#${item.code}`,
    nameEn: parsed.nameEn,
    price: parsed.price ?? item.price ?? null,
    category:
      parsed.category && parsed.category !== 'other'
        ? parsed.category
        : inferCategoryFromName(parsed.name || item.name || '', 'other'),
    categoryJa: parsed.categoryJa || item.categoryJa || null,
    imageUrl: parsed.imageUrl,
    nutrition: parsed.nutrition,
    origin: parsed.origin,
    scrapedAt: new Date().toISOString(),
  };
}

function validate(items) {
  const issues = [];
  for (const item of items) {
    if (!item.code) issues.push(`missing code: ${JSON.stringify(item)}`);
    if (!item.name) issues.push(`${item.code}: missing name`);
    if (item.price == null || item.price <= 0 || item.price > 3000) {
      issues.push(`${item.code} "${item.name}": price out of range (${item.price})`);
    }
    if (item.nutrition?.energy == null) {
      issues.push(`${item.code} "${item.name}": missing energy`);
    }
  }
  return issues;
}

async function main() {
  const startedAt = new Date();
  await fs.mkdir(OUT_DIR, { recursive: true });

  const listing = await extractItemCodesWithBrowser();
  if (listing.length === 0) {
    throw new Error('No items extracted from menu.php — site structure may have changed.');
  }

  console.log(`Fetching detail pages for ${listing.length} items (concurrency=4, 500ms delay)…`);
  const items = await mapWithConcurrency(listing, 4, async (item) => {
    try {
      return await fetchDetail(item);
    } catch (err) {
      console.warn(`  ! ${item.code} failed: ${err.message}`);
      return {
        code: item.code,
        name: item.name || `#${item.code}`,
        price: item.price ?? null,
        category: inferCategoryFromName(item.name || '', 'other'),
        categoryJa: item.categoryJa || null,
        imageUrl: `https://west2-univ.jp/menu_img/png_sp/${item.code}.png`,
        nutrition: {},
        origin: null,
        scrapedAt: new Date().toISOString(),
        _error: err.message,
      };
    }
  });

  const issues = validate(items);
  if (issues.length) {
    console.warn(`Validation warnings (${issues.length}):`);
    for (const i of issues.slice(0, 20)) console.warn(`  - ${i}`);
  }

  const sorted = items.sort((a, b) => a.code.localeCompare(b.code));
  const menuPath = path.join(OUT_DIR, 'menu.json');
  const metaPath = path.join(OUT_DIR, 'meta.json');

  await fs.writeFile(menuPath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');

  const meta = {
    cafeteriaId: CAFETERIA_ID,
    cafeteriaName: '大阪大学生協 豊中図書館下食堂',
    sourceUrl: MENU_URL,
    lastUpdated: startedAt.toISOString(),
    itemCount: sorted.length,
    withNutrition: sorted.filter((i) => i.nutrition?.energy != null).length,
    issues: issues.length,
  };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

  console.log(`\nWrote ${menuPath} (${sorted.length} items, ${meta.withNutrition} with energy data)`);
  console.log(`Wrote ${metaPath}`);
}

main().catch((err) => {
  console.error('Scrape failed:', err);
  process.exit(1);
});
