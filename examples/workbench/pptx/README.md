# pptx skill eval

Eval suite for
[`anthropics/skills/pptx`](https://github.com/anthropics/skills) —
skill for reading, editing, and creating PowerPoint presentations using
markitdown, pptxgenjs, and an unpack/edit/pack XML workflow.

## Cases

### `extract-pptx-facts` — read and extract structured data

Sample: `presentation.pptx` (4-slide TechVision Corp Q3 2025 deck, created by setup)

| Field | Expected value | Maps to |
|---|---|---|
| `title` | `"TechVision Corp: Q3 2025 Results"` | title text on slide 1 |
| `slideCount` | `4` | total slides |
| `revenue` | `"$5.1M"` | financial highlights slide |
| `customerCount` | `2341` | customer metrics slide |

### `create-product-deck` — create from scratch with pptxgenjs

Task: build `deck.pptx` for NovaSoft Analytics with 4 slides.

| Required string | Slide | Rule |
|---|---|---|
| `NovaSoft Analytics` | 1 — title | company name present |
| `Smarter Business Decisions` | 1 — subtitle | exact title subtitle |
| `Key Features` | 2 — heading | features slide heading |
| `40%` | 3 — stat callout | proven-results statistic |
| `novasoft.io` | 4 — CTA | closing call-to-action URL |

### `no-pptx-skill-needed` — control case

Writes `answer.txt` with a literal string. Grader fails if the agent
reads `pptx/SKILL.md` unnecessarily.

## Vendored snapshot

The skill normally references `editing.md` and `pptxgenjs.md` as
relative file links within the same directory. For deterministic eval
these docs are vendored at `references/pptx/` alongside `SKILL.md`.
No WebFetch calls are needed — the diff vs upstream is zero lines.

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
