# next-upgrade eval

Eval suite for
[`vercel-labs/next-skills/next-upgrade`](https://github.com/vercel-labs/next-skills) —
upgrade Next.js to the latest version following official migration guides and codemods.

## Cases

### `upgrade-starter-app` — v14→v15 async Request API migration

Sample: `workspace/starter-app/` (Next.js 14 project)

| File | Line | Violation | Rule |
|---|---|---|---|
| `package.json` | 10 | `next` version is `14.2.5`, not v15 | Install Updates (Step 5) |
| `app/page.tsx` | 4–9 | `viewport` is inside `metadata` export instead of separate `viewport` export | Manual Review (Step 6) |
| `app/page.tsx` | 14 | `searchParams` type is synchronous `{ query?: string }` instead of `Promise<{ query?: string }>` | Async Request APIs (Step 4) |
| `app/[id]/page.tsx` | 4 | `params` type is synchronous `{ id: string }` instead of `Promise<{ id: string }>` | Async Request APIs (Step 4) |
| `app/api/route.ts` | 7 | `cookies()` called without `await` | Async Request APIs (Step 4) |
| `app/api/route.ts` | 8 | `headers()` called without `await` | Async Request APIs (Step 4) |

## Graders

Graders check the **modified workspace files** after the agent applies changes:

- `grade-starter-package.mjs` — checks `package.json` next version updated to v15
- `grade-starter-pages.mjs` — checks `app/page.tsx` (viewport export + async searchParams) and `app/[id]/page.tsx` (async params)
- `grade-starter-route.mjs` — checks `app/api/route.ts` for `await cookies()` and `await headers()`

## Vendored snapshot

The skill normally fetches upgrade guides from `docs.next.js.org` at runtime.
For deterministic eval we vendor a snapshot at
`references/next-upgrade/upgrade-guide.md` and tweak `SKILL.md` to read it
locally. Diff vs upstream is one line (Step 2 WebFetch → local file read).

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4-5`
- `openrouter/openai/gpt-4o-mini`
- `openrouter/google/gemini-2.5-pro`
