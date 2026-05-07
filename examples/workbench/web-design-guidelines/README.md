# web-design-guidelines eval

Eval suite for [`vercel-labs/agent-skills/web-design-guidelines`](https://github.com/vercel-labs/agent-skills) — a skill that reviews UI files for Vercel Web Interface Guidelines compliance.

## Cases

Each case runs the skill on a focused TSX sample with seeded violations and
grades whether the agent's findings cover them. We split coverage across files
to mirror real usage (a developer reviews one file at a time, not a kitchen
sink) and to avoid overwhelming smaller models.

### `review-product-card` — Accessibility + Focus States

Sample: `workspace/ProductCard.tsx`

| Line | Violation | Rule |
|---|---|---|
| 15 | `<img>` without `alt` | Images need `alt` (or `alt=""` if decorative) |
| 18 | `<div onClick>` for action | `<button>` for actions, not `<div onClick>` |
| 21–23 | Icon-only `<button>` without `aria-label` | Icon-only buttons need `aria-label` |
| 24–29 | `<input>` without `<label>` or `aria-label` | Form controls need `<label>` or `aria-label` |
| 30–32 | `outline-none` className without focus replacement | Never `outline-none` without focus replacement |

### `review-checkout-form` — Forms

Sample: `workspace/CheckoutForm.tsx`

| Line | Violation | Rule |
|---|---|---|
| 17 | `<label>` without `htmlFor` | Labels clickable (`htmlFor` or wrapping control) |
| 18–25 | `<input>` for email uses `type="text"` | Use correct `type` (`email`, `tel`, `url`, `number`) |
| 18–25 | `<input>` missing `autoComplete` | Inputs need `autocomplete` and meaningful `name` |
| 24 | `onPaste={(e) => e.preventDefault()}` | Never block paste |
| 30 | Submit button `disabled` before request starts | Submit stays enabled until request starts |

### `review-loading-screen` — Typography + Content Handling

Sample: `workspace/LoadingScreen.tsx`

| Line | Violation | Rule |
|---|---|---|
| 12 | `"Loading..."` (three dots, not `…`) | `…` not `...`; loading states end with `…` |
| 13 | Straight quotes `"..."` | Curly quotes `"..."` not straight |
| 14 | `{fileSize} MB` without `&nbsp;` | Non-breaking spaces between number and unit |
| 15–18 | Flex children without `min-w-0` for `truncate` | Flex children need `min-w-0` |
| 19–23 | `recentFiles.map(...)` no empty-state branch | Handle empty states |

### `review-hero-section` — Animation + Images + Performance

Sample: `workspace/HeroSection.tsx`

| Line | Violation | Rule |
|---|---|---|
| 6 | Above-fold `<img>` missing `width`/`height` | `<img>` needs explicit `width` and `height` (CLS) |
| 6 | Above-fold `<img>` missing `priority`/`fetchpriority="high"` | Above-fold critical images need priority hint |
| 7–10 | `transition: 'all'` | Never `transition: all` — list properties explicitly |
| 15–18 | Animation without `prefers-reduced-motion` consideration | Honor `prefers-reduced-motion` |
| 23 | Below-fold `<img>` missing `loading="lazy"` | Below-fold images need `loading="lazy"` |

## Vendored snapshot

The skill normally `WebFetch`es its rules from `vercel-labs/web-interface-guidelines`. For deterministic eval, we vendor a snapshot at `references/web-design-guidelines/command.md` and tweak `SKILL.md` to read the local copy. The diff vs upstream is one section (`Guidelines Source` → local file).

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx src/cli.ts run-suite examples/workbench/web-design-guidelines/suite.yml --trials 3
```

## Models

The suite is set up for a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4.6`
- `openrouter/openai/gpt-5-mini`
- `openrouter/google/gemini-2.5-pro`

## Graders

One grader per case under `checks/`. Each reads `/work/findings.txt`, extracts every `<file>.tsx:<line>` reference, and confirms each expected violation is identified by both line number (within an accepted range for multi-line elements) and a keyword match. `pass` requires all expected violations; `score` is the fraction found.
