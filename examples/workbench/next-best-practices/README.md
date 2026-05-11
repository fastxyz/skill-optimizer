# next-best-practices eval

Eval suite for
[`vercel-labs/next-skills/next-best-practices`](https://github.com/vercel-labs/next-skills) —
a comprehensive code-reviewer skill covering Next.js 15+ patterns: RSC boundaries,
async APIs, image/font optimization, error handling, data patterns, and more.

## Cases

### `review-dashboard` — async patterns, data patterns, error handling, RSC boundaries, image

Sample: `workspace/app/dashboard/page.tsx`

| Line | Violation | Rule |
|---|---|---|
| 9  | Synchronous `params` access — must `await params` in Next.js 15+ | async-patterns |
| 12–13 | Sequential `await` fetches create a data waterfall — use `Promise.all` | data-patterns |
| 19 | `redirect()` called inside `try-catch` — swallows the navigation throw | error-handling |
| 31 | `Date` object passed as prop to a client component — not JSON-serializable | rsc-boundaries |
| 33 | Native `<img>` tag used instead of `next/image` | image |

### `review-herosection` — RSC boundaries, image, scripts

Sample: `workspace/components/HeroSection.tsx`

| Line | Violation | Rule |
|---|---|---|
| 6  | `async` client component — `'use client'` + `async function` is invalid | rsc-boundaries |
| 12 | `<Image fill>` without `sizes` prop — downloads largest image regardless of viewport | image |
| 17 | Missing `priority` prop on above-the-fold LCP hero image | image |
| 24 | Native `<script>` tag — should use `next/script` for loading strategy | scripts |

## Vendored snapshot

The skill normally references sub-documents via relative `./rsc-boundaries.md`, `./image.md`
etc. links from the skill root. For deterministic eval we vendor all sub-docs at
`references/next-best-practices/`. No SKILL.md modifications are needed since the paths
are already local-relative. Diff vs upstream is zero lines.

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4-6`
- `openrouter/openai/gpt-4o-mini`
- `openrouter/google/gemini-2.5-pro`
