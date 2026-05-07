# Proposed upstream changes — `web-design-guidelines`

This directory holds before/after snapshots of the two upstream files we'd
PR back to Vercel. **Nothing here is published yet** — these are for team
review before we approach upstream.

## Two upstream repos

| Upstream | File | Before | After |
|---|---|---|---|
| `vercel-labs/agent-skills` | `skills/web-design-guidelines/SKILL.md` | [`before-SKILL.md`](agent-skills--web-design-guidelines/before-SKILL.md) (39 lines) | [`after-SKILL.md`](agent-skills--web-design-guidelines/after-SKILL.md) (54 lines) |
| `vercel-labs/web-interface-guidelines` | `command.md` | [`before-command.md`](web-interface-guidelines/before-command.md) (180 lines) | [`after-command.md`](web-interface-guidelines/after-command.md) (304 lines) |

Two PRs, one per repo.

## What changed

### `SKILL.md` — adds an explicit two-pass workflow

The skill currently says "fetch rules → review files → output findings." We
reframe the review step as **two distinct passes**:

- **Pass 1 — visible anti-patterns**: scan for literal patterns that appear
  in the code (`<div onClick>`, `transition: all`, `outline-none`, etc.).
- **Pass 2 — absences (per-element checklist)**: for each `<img>`,
  `<input>`, `<button>`, `<form>`, walk a checklist of attributes/behaviors
  that should be present but often aren't (e.g., `<img>` without
  `width`/`height`, `<input>` without `autoComplete`, async submit button
  with stale `disabled`).

Diff vs upstream: ~15 lines added under "How It Works" and "Usage". The
WebFetch behavior and rules URL are unchanged.

### `command.md` — adds per-element checklists + BAD/GOOD examples

Two additions, no rule deletions or wording changes to existing rules:

- **"Per-element review (Pass 2 checklist)"** — a checklist organized by
  HTML element (img / input / button / form / list-render / animation).
  This is the reference Pass 2 in `SKILL.md` walks.
- **"Common-miss examples"** — five BAD/GOOD code blocks for the rules our
  eval shows are most often overlooked: submit-button-disabled,
  block-paste, missing autoComplete, above-fold image priority, missing
  empty-state branch.

The existing rule sections (Accessibility, Forms, Animation, etc.) are
left intact so anyone using `command.md` standalone still gets the full
rule list.

## Why these two changes

The categorization phase flagged **three** notable issues for this skill:

1. *No fallback if the remote URL is unavailable.* Architectural; out of
   scope for this PR.
2. **No examples of compliant vs. non-compliant output.** ← what we
   address.
3. *Argument-hint glob/recursion semantics unclear.* Tiny scope; could fold
   into the same SKILL.md PR if the maintainer asks, but isn't the
   primary lever.

Our eval (4 sample TSX files with 20 seeded violations across a11y,
forms, typography, animation/images) confirmed #2 empirically. The
rules that most often went unflagged were not "the doc is unclear"
problems — they were "the rule describes the *absence* of something the
model has to imagine." Adding a per-element checklist + concrete
BAD/GOOD examples converts those rules from imagination-required to
pattern-matching.

## Eval evidence

Same four cases × three mid-tier models × three trials = 36 trials. Same
seeded violations. Same grader.

| Model | Before | After |
|---|---|---|
| `claude-sonnet-4.6` | 10/12 (83%) | **12/12 (100%)** |
| `gpt-5-mini` | 9/12 (75%) | **10/12 (83%)** |
| `gemini-2.5-pro` | 7/12 (58%) | **9/12 (75%)** |
| **Total** | **26/36 (72%)** | **31/36 (86%)** |

Specific rules eliminated or reduced:

| Rule | Before | After |
|---|---|---|
| `submit-button-disabled-pre-request` | 3 misses | 1 |
| `no-empty-state-handling` | 3 misses | **0** |
| `above-fold-img-missing-priority` | 2 misses | 1 |
| `input-missing-autocomplete` | 1 miss | **0** |
| `block-paste` | 2 misses | 2 (no change — gemini terseness) |

## Next steps for the team

- Review the proposal here.
- If we're going to PR, decide:
  - Single bundled PR vs. two separate PRs? (Two repos, so probably two PRs.)
  - Include the eval evidence in the PR description? Vercel's recent
    skill PRs lean qualitative, but the numbers are persuasive.
  - Who's the team author of record on the PR? (B2B-visibility decision
    — this is our team's first upstream contribution to vercel-labs.)
- Heads-up to anyone @ Vercel before the PR drops?

## How to reproduce the eval locally

```bash
cd examples/workbench/web-design-guidelines
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

Eval suite, sample TSX files, and graders are all checked in alongside
this proposal in the parent directory.
