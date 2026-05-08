---
name: firecrawl-build-scrape
description: Integrate Firecrawl `/scrape` into product code for single-page extraction. Use when an app already has a URL and needs markdown, HTML, links, screenshots, metadata, or structured page output. Prefer this skill over broader crawl patterns when the feature is page-level.
license: ISC
metadata:
  author: firecrawl
  version: "0.1.0"
  homepage: https://www.firecrawl.dev
  source: https://github.com/firecrawl/skills
inputs:
  - name: FIRECRAWL_API_KEY
    description: Firecrawl API key for hosted Firecrawl requests.
    required: true
  - name: FIRECRAWL_API_URL
    description: Optional base URL for self-hosted Firecrawl deployments.
    required: false
---

# Firecrawl Build Scrape

Use this when the application already has the URL and needs content from one page.

## Use This When

- the feature starts from a known URL
- you need page content for retrieval, summarization, enrichment, or monitoring
- you want the default extraction primitive before considering `/interact`

## Default Recommendations

- Return `markdown` unless the feature truly needs another format.
- Use `onlyMainContent` for article-like pages where nav and chrome add noise.
- Add waits or other rendering options only when the page needs them.

## Common Product Patterns

- knowledge ingestion from known URLs
- enrichment from a company, product, or docs page
- pricing, changelog, and documentation extraction
- page-level quality checks or monitoring

## Escalation Rules

- If you do not have the URL yet, start with the search skill (`firecrawl-build-search`).
- If content requires clicks, typing, or multi-step navigation, escalate to the interact skill (`firecrawl-build-interact`).

## Implementation Notes

- Keep the integration narrow: one feature, one URL, one extraction contract.
- Treat `/scrape` as the default primitive for downstream LLM or indexing pipelines.
- Request richer formats only when the consumer needs them, such as links, screenshots, or branding data.

## Integration Checklist

Run this checklist on every `/scrape` integration before finalizing.

### Every article / blog / news function

- [ ] `onlyMainContent: true` is set — this removes nav, sidebar, and footer noise from article-like pages. If it is absent, the consumer receives noisy HTML-derived markdown.
- [ ] `formats: ['markdown']` — default unless the consumer explicitly needs another format.
- [ ] No `waitFor` unless the page is confirmed to be a SPA or has lazy-loaded content.

**BAD** — article scraper missing `onlyMainContent` (nav menus, sidebars, and footers contaminate the markdown):
```ts
export async function scrapeArticle(url: string) {
  const doc = await client.scrape(url, {
    formats: ['markdown'],
    // BUG: nav + sidebar noise included in output
  });
  return doc.markdown;
}
```

**GOOD** — article scraper with `onlyMainContent: true`:
```ts
export async function scrapeArticle(url: string) {
  const doc = await client.scrape(url, {
    formats: ['markdown'],
    onlyMainContent: true,  // strips nav, sidebar, footer
  });
  return doc.markdown;
}

### Every enrichment / company / docs function

- [ ] `formats: ['markdown']` — HTML is only justified when a downstream parser requires raw HTML.
- [ ] `waitFor` is absent or explicitly justified in a comment.
- [ ] Each format in the `formats` array has a named consumer — remove formats nobody reads.

### Escalation check (MUST run before every scrape call)

> NEVER pass a search query string to `client.scrape()`. The `/scrape` endpoint requires a fully-formed URL. If the calling code receives a keyword, topic, or company name rather than a URL, it MUST first call `client.search()` (firecrawl-build-search skill) to resolve a URL, then pass that URL to `/scrape`.

**BAD** — query string passed directly to `/scrape`:
```ts
// The caller has a company name, not a URL.
const doc = await client.scrape(companyName, { formats: ['markdown'] });
```

**GOOD** — search first, then scrape:
```ts
// Resolve URL first with client.search(), then scrape.
const results = await client.search(companyName, { limit: 1 });
const doc = await client.scrape(results[0].url, { formats: ['markdown'] });
```

## Docs (Source of Truth)

Read the source-of-truth reference for your project language before writing integration code:

- **Node / TypeScript**: See `references/firecrawl-build-scrape/node-docs.md`

## See Also

- firecrawl-build
- firecrawl-build-search
- firecrawl-build-interact
