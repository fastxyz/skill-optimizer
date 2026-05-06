import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchAndCache, urlHash } from '../lib/playwright-fetch.mjs';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const FIXTURE = pathToFileURL(join(HERE, 'fixtures/sample.html')).href;

test('urlHash is stable and 16 chars', () => {
  assert.equal(urlHash('https://example.com/'), urlHash('https://example.com/'));
  assert.equal(urlHash('https://example.com/').length, 16);
  assert.notEqual(urlHash('https://a.com/'), urlHash('https://b.com/'));
});

test('fetchAndCache writes dom.html, text.md, screenshot.png; text reflects post-JS DOM', async () => {
  const cacheRoot = mkdtempSync(join(tmpdir(), 'pwfetch-test-'));
  const result = await fetchAndCache({ url: FIXTURE, cacheRoot });

  assert.ok(existsSync(result.dom_path), 'dom.html exists');
  assert.ok(existsSync(result.text_path), 'text.md exists');
  assert.ok(existsSync(result.screenshot_path), 'screenshot.png exists');
  assert.ok(statSync(result.screenshot_path).size > 0, 'screenshot has bytes');

  const text = readFileSync(result.text_path, 'utf-8');
  assert.match(text, /Rendered after JS/, 'post-JS text is captured');
  assert.match(text, /skill-one/);
  assert.match(text, /skill-two/);

  const dom = readFileSync(result.dom_path, 'utf-8');
  assert.match(dom, /<h1[^>]*>Rendered after JS<\/h1>/);
});
