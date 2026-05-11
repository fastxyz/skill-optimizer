# Firecrawl Node.js / TypeScript — Source of Truth

## Installation

```bash
npm install @mendable/firecrawl-js
```

## Authentication

```ts
import FirecrawlApp from '@mendable/firecrawl-js';

const client = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY,
});
```

## Basic Scrape

```ts
const doc = await client.scrape('https://docs.firecrawl.dev', {
  formats: ['markdown'],
});
console.log(doc.markdown);
```

## Method Signature

`client.scrape(url: string, options?: ScrapeParams): Promise<Document>`

## Key Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `formats` | `string[]` | `['markdown']` | Requested output formats. Default is markdown. |
| `onlyMainContent` | `boolean` | `false` | Strip nav, footer, sidebars. Use for articles and blog posts. |
| `waitFor` | `number` | `0` | Milliseconds to wait for JS rendering. Use **only** when the page requires it (SPA, lazy-loaded content). |
| `includeTags` | `string[]` | — | Include only these HTML tags in processing. |
| `excludeTags` | `string[]` | — | Strip these HTML tags before processing. |
| `timeout` | `number` | 30000 | Request timeout in ms. |
| `mobile` | `boolean` | `false` | Use mobile viewport. |
| `blockAds` | `boolean` | `false` | Block ads and popups. |
| `proxy` | `string` | — | `"basic"`, `"stealth"`, `"enhanced"`, `"auto"`, or custom URL. |

## Format Values

Plain string formats: `"markdown"`, `"html"`, `"rawHtml"`, `"links"`, `"images"`, `"screenshot"`, `"summary"`, `"audio"`, `"branding"`

Object formats (structured extraction):
```ts
{ type: 'json', prompt?: string, schema?: JSONSchema }
{ type: 'question', question: string }
{ type: 'highlights', query: string }
{ type: 'screenshot', fullPage?: boolean, quality?: number }
```

## Pattern: Article Extraction

```ts
// Use onlyMainContent for article-like pages to avoid nav noise.
const doc = await client.scrape(url, {
  formats: ['markdown'],
  onlyMainContent: true,
});
```

## Pattern: Structured Data Extraction

```ts
// Request richer formats only when the consumer needs them.
const doc = await client.scrape(url, {
  formats: ['markdown', { type: 'json', prompt: 'Extract plan names and prices.' }],
});
```

## When NOT to Use This

- You don't have the URL yet → use `client.search()` first
- Page requires user interactions (clicks, forms) → use `client.interact()`
- You need to crawl multiple pages → use `client.crawl()`
