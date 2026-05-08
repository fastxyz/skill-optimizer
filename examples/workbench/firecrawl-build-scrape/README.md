# firecrawl-build-scrape eval

Eval suite for
[`firecrawl/skills/firecrawl-build-scrape`](https://github.com/firecrawl/skills) —
integrate Firecrawl `/scrape` into product code for single-page extraction.

## Cases

### `review-scrape-integration` — Firecrawl scrape pattern violations

Sample: `workspace/ScrapeService.ts`

| Line | Violation | Rule |
|---|---|---|
| 10 | `scrapeArticle` missing `onlyMainContent: true` | "Use `onlyMainContent` for article-like pages where nav and chrome add noise." |
| 18 | `scrapeCompanyPage` uses `formats: ['html']` instead of markdown | "Return `markdown` unless the feature truly needs another format." |
| 27 | `scrapeNews` uses `waitFor: 5000` on a static news site | "Add waits or other rendering options only when the page needs them." |
| 34 | `findAndScrapeCompany` passes a search query string to `/scrape` instead of a URL | "If you do not have the URL yet, start with the search skill." |
| 43 | `scrapeDocPage` requests 4 formats (`markdown`, `html`, `links`, `screenshot`) | "Keep the integration narrow: one feature, one URL, one extraction contract." |

## Vendored snapshot

The skill normally fetches docs from `docs.firecrawl.dev/agent-source-of-truth/<lang>`.
For deterministic eval we vendor a Node.js snapshot at
`references/firecrawl-build-scrape/node-docs.md` and tweak `SKILL.md` to read it
locally. Diff vs upstream is one line (the Node/TypeScript docs URL).

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4-5`
- `openrouter/openai/gpt-4o-mini`
- `openrouter/google/gemini-2.5-flash`
