# Proposed Upstream Changes: `google-labs-code/stitch-skills` — `shadcn-ui`

## What changed

Two additive sections were added to `skills/shadcn-ui/SKILL.md`:

### 1. Explicit BAD/GOOD example for component file placement (in § Extending Components)

The existing skill stated "Create wrapper components in `components/` (not `components/ui/`)"
but models consistently missed violations where custom components were placed in
`components/ui/`. Adding a CRITICAL callout with side-by-side BAD/GOOD code examples
reduced this miss rate by 50% (gemini went from missing it 100% to catching it 100%).

### 2. New `## Code Review Checklist` section (two-pass review)

A structured two-pass checklist was added before the existing "Validation and Quality" section:

- **Pass 1**: File placement, class merging with `cn()`, variant logic with `cva`, ARIA preservation
- **Pass 2**: Per-element absence checks (interactive divs, theme colors)

This follows the two-pass workflow pattern (Recipe A from the auto-improve-skill pilot program)
proven to improve code-review task coverage by 14–32 percentage points on similar skills.

## Why (evidence from eval)

Eval suite: `examples/workbench/shadcn-ui/` — 2 cases × 3 models × 3 trials = 18 trials.

| Metric | Before | After |
|--------|--------|-------|
| Rule coverage | 0.819 (59/72) | 0.889 (64/72) |
| Gemini pass rate | 3/6 | 6/6 |
| GPT-4o-mini pass rate | 0/6 | 0/6 |
| Claude Sonnet pass rate | 6/6 | 6/6 |

Most-improved violation: **wrong file location** (custom component in `components/ui/`).
- Gemini went from 0/3 → 3/3 on StatusBadge wrong-location
- GPT-4o-mini still misses this (absence-type rule, very hard for smaller models)

## How to apply

Apply the diff between `before-SKILL.md` and `after-SKILL.md` to
`skills/shadcn-ui/SKILL.md` in the upstream
[google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills) repo.

```bash
diff google-labs-code-stitch-skills/before-SKILL.md \
     google-labs-code-stitch-skills/after-SKILL.md
```

The change is purely additive: no existing rules deleted, no existing wording changed.
