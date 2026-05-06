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
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
    const dom = await page.content();
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    const dom_path = join(cacheDir, 'dom.html');
    const text_path = join(cacheDir, 'text.md');
    const screenshot_path = join(cacheDir, 'screenshot.png');
    writeFileSync(dom_path, dom, 'utf-8');
    writeFileSync(text_path, text, 'utf-8');
    await page.screenshot({ path: screenshot_path, fullPage: true });
    return { hash, cacheDir, dom_path, text_path, screenshot_path };
  } finally {
    await browser.close();
  }
}
