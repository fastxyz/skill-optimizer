# web-design-guidelines eval

Eval suite for [`vercel-labs/agent-skills/web-design-guidelines`](https://github.com/vercel-labs/agent-skills) — a skill that reviews UI files for Vercel Web Interface Guidelines compliance.

## Cases

Nine cases, ~5 seeded violations each, one TSX sample per case. Each case targets a focused rule family so the agent isn't overwhelmed and we can isolate which families it handles well vs. poorly.

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

### `review-data-table` — Performance + Typography + Content & Copy

Sample: `workspace/DataTable.tsx`

| Line | Violation | Rule |
|---|---|---|
| 15–17 | `getBoundingClientRect` in render | No layout reads in render |
| 32–38 | Large list `.map()` without virtualization | Large lists (>50 items): virtualize |
| 27–36 | Numeric columns without `tabular-nums` | `font-variant-numeric: tabular-nums` for number columns |
| 21 | `<h2>` without `text-balance`/`text-pretty` | Use `text-wrap: balance` or `text-pretty` on headings |
| 22 | "eight projects" spelled out | Numerals for counts ("8 projects" not "eight projects") |

### `review-confirm-dialog` — Touch & Interaction + Safe Areas + Hover States

Sample: `workspace/ConfirmDialog.tsx`

| Line | Violation | Rule |
|---|---|---|
| 11–35 | Modal without `overscroll-behavior: contain` | Prevent scroll bleed to page behind |
| 11–35 | Modal without `touch-action: manipulation` | Prevent double-tap zoom delay |
| 11–35 | No `env(safe-area-inset-*)` for notched devices | Full-bleed layouts need safe-area-inset |
| 26 | `autoFocus` on a non-primary confirmation input | `autoFocus` sparingly — desktop, single primary input |
| 31–32 | Action buttons without `hover:` state | Buttons need hover state |

### `review-search-page` — Navigation & State + Locale & i18n

Sample: `workspace/SearchPage.tsx`

| Line | Violation | Rule |
|---|---|---|
| 11–12 | Filter/page state in `useState` only, no URL sync | URL reflects state |
| 31 | Hardcoded currency: `${r.price.toFixed(2)}` | Use `Intl.NumberFormat` for currency |
| 32 | Hardcoded date: `r.publishedAt.toDateString()` | Use `Intl.DateTimeFormat` |
| 20 | "Acme Cloud" brand without `translate="no"` | Brand names need `translate="no"` |
| 33 | `Delete` button with no confirmation | Destructive actions need confirmation modal or undo window |

### `review-theme-toggle` — Hydration Safety + Dark Mode + Hover

Sample: `workspace/ThemeToggle.tsx`

| Line | Violation | Rule |
|---|---|---|
| 7 | `localStorage.getItem` directly in render body | Hydration mismatch risk |
| 25 | `<input value={accentColor}>` no `onChange` | Controlled inputs need `onChange` |
| 14–22 | Native `<select>` no explicit `background-color`/`color` | Windows dark mode requires both |
| 27 | `<button>` without `hover:` state | Buttons need hover state |
| 14–27 | No `focus-visible:ring-*` anywhere | Use `:focus-visible` over `:focus` |

### `review-blog-post` — Heading hierarchy + Aria + Focus + Content & Copy

Sample: `workspace/BlogPost.tsx`

| Line | Violation | Rule |
|---|---|---|
| 11–13 | `<h1>` → `<h3>` (skips `<h2>`) | Headings hierarchical |
| 17–19 | Decorative `<svg>` without `aria-hidden="true"` | Decorative icons need `aria-hidden` |
| 25–28 | Toast div without `aria-live="polite"` | Async updates need `aria-live` |
| 23 | Generic button label "Continue" | Specific button labels |
| 23 | `focus:ring-2` instead of `focus-visible:ring-2` | Use `:focus-visible` over `:focus` |

## Vendored snapshot

The skill normally `WebFetch`es its rules from `vercel-labs/web-interface-guidelines`. For deterministic eval, we vendor a snapshot at `references/web-design-guidelines/command.md` and tweak `SKILL.md` to read the local copy. The diff vs upstream is one section (`Guidelines Source` → local file).

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4.6`
- `openrouter/openai/gpt-5-mini`
- `openrouter/google/gemini-2.5-pro`

## Latest results (9 cases × 3 models × 3 trials = 81 trials)

| Metric | Value |
|---|---|
| Strict pass rate (all 5/5 per case) | 42/81 (52%) |
| **Rule coverage rate** (violations identified / seeded) | **334/405 (82%)** |
| Run cost | ~$5 |

Per-case rule coverage: product-card 100%, checkout-form 98%, hero-section 100%, blog-post 87%, loading-screen 82%, data-table 80%, theme-toggle 69%, search-page 64%, confirm-dialog 62%.

Strict pass dropped vs. the original 4-case suite because the 5 new cases cover **harder absence-type rules** (touch-action, safe-area-inset, brand `translate="no"`, etc.) that even the updated skill doesn't always catch. Rule-coverage 82% is the load-bearing metric.

## Coverage of upstream `command.md`

| Status | Rules |
|---|---|
| ✅ Graded across 9 cases | ~45 of 81 |
| ⚠️ Skip (subjective / framework-bound / overlap) | ~36 of 81 |

See [`proposed-upstream-changes/`](proposed-upstream-changes/) for the team's review of the SKILL.md + command.md changes we'd PR back.

## Graders

One grader per case under `checks/`, all sharing `_grader-utils.mjs`. Each reads `/work/findings.txt`, parses every `<file>.tsx:<line>` reference, and confirms each expected violation appears as one finding line that mentions a line in the accepted range AND matches a distinguishing keyword. `pass` requires all expected violations; `score` is the fraction found.
