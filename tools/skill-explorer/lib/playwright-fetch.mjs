import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

export function urlHash(url) {
  return createHash('sha1').update(String(url)).digest('hex').slice(0, 16);
}

export async function fetchAndCache({ url, cacheRoot, timeoutMs = 30000 }) {
  const hash = urlHash(url);
  const cacheDir = join(cacheRoot, hash);
  mkdirSync(cacheDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });

    // Pages with virtualised lists (e.g. skills.sh leaderboard) only render a
    // window of rows at a time and may include click-to-expand markers like
    // "+N more from <author>". Scroll incrementally and click expanders along
    // the way, accumulating row text so we capture rows that get unmounted.
    const accumulatedText = await scrollAndCollect(page);

    const dom = await page.content();
    const dom_path = join(cacheDir, 'dom.html');
    const text_path = join(cacheDir, 'text.md');
    const screenshot_path = join(cacheDir, 'screenshot.png');
    writeFileSync(dom_path, dom, 'utf-8');
    writeFileSync(text_path, accumulatedText, 'utf-8');
    await page.screenshot({ path: screenshot_path, fullPage: true });
    return { hash, cacheDir, dom_path, text_path, screenshot_path };
  } finally {
    await browser.close();
  }
}

async function scrollAndCollect(page) {
  // Single-shot fallback for short pages: capture innerText once at top.
  const initialHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  if (initialHeight <= 2000) {
    return await page.evaluate(() => document.body?.innerText ?? '');
  }

  // Capture innerText at each scroll position. We CANNOT dedupe by line because
  // virtualised lists (skills.sh) repeat author names across rows; a Set strips
  // out the legitimate repetitions and breaks downstream parsing. Instead we
  // emit each capture as a chunk separated by an obvious boundary, and dedupe
  // chunks by their content hash to stop the file from growing without bound.
  const captures = [];
  const seenChunks = new Set();
  const pushCapture = async () => {
    const t = await page.evaluate(() => document.body?.innerText ?? '');
    const key = t.length > 0 ? t.slice(0, 80) + '|' + t.length : 'empty';
    if (seenChunks.has(key)) return false;
    seenChunks.add(key);
    captures.push(t);
    return true;
  };

  await pushCapture();

  // Iteratively scroll, click expanders, and capture. Stop when scrollHeight
  // stabilises across two passes, no new captures were added, and we are at
  // (or past) the bottom.
  const STEP = 700;
  let prevHeight = -1;
  let prevCaptureCount = -1;
  let stableTicks = 0;
  for (let i = 0; i < 80; i++) {
    // Click any visible "+N more from" expanders.
    const expanded = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('span, div, button, a')]
        .filter((el) => /^\s*\+\d+ more from\b/.test(el.textContent ?? ''));
      let clicks = 0;
      for (const c of candidates) {
        let target = c;
        while (target && target !== document.body) {
          const cls = target.getAttribute?.('class') ?? '';
          if (
            target.tagName === 'BUTTON' || target.tagName === 'A' ||
            target.matches?.('[role="button"]') ||
            /\bcursor-pointer\b/.test(cls) ||
            /\bhover:bg-\b/.test(cls)
          ) break;
          target = target.parentElement;
        }
        try { (target || c).click(); clicks++; } catch {}
      }
      return clicks;
    });
    if (expanded > 0) await page.waitForTimeout(300);

    await page.evaluate((y) => window.scrollBy(0, y), STEP);
    await page.waitForTimeout(150);
    await pushCapture();

    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    const y = await page.evaluate(() => window.scrollY);
    const innerH = await page.evaluate(() => window.innerHeight);
    const reachedBottom = y + innerH >= h - 50;
    if (h === prevHeight && captures.length === prevCaptureCount) {
      stableTicks++;
      if (stableTicks >= 2 && reachedBottom) break;
    } else {
      stableTicks = 0;
    }
    prevHeight = h;
    prevCaptureCount = captures.length;
  }

  return captures.join('\n\n=== CAPTURE BOUNDARY ===\n\n');
}
