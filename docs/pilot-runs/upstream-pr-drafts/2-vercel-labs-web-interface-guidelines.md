# PR #2 — vercel-labs/web-interface-guidelines: per-element checklist + examples

**Target:** `vercel-labs/web-interface-guidelines`
**Files:** `command.md` AND `AGENTS.md` (per the repo's dual-copy
convention)
**Base branch:** `main`
**Title:** `Add per-element checklist and BAD/GOOD examples for absence-type rules`

## Body (kept terse per this repo's style)

```markdown
Adds a "Per-element review (Pass 2)" section organized by element (`<img>`, `<input>`, `<button>`, etc.) plus 5 BAD/GOOD code examples for the rules our eval shows are most often overlooked: submit-button-disabled, paste-blocking, missing `autoComplete`, above-fold image priority hint, missing empty-state branch.

Additive only — no existing rules deleted or reworded. Same content mirrored to `README.md` and `AGENTS.md` per repo convention.

Eval evidence: same 4-case workbench × 3-model matrix × 3 trials lifted total rule-coverage from 72% → 86% after adding these (companion to vercel-labs/agent-skills SKILL.md PR which adds the two-pass workflow that references this section).
```

## File diff summary

Upstream `command.md` is 180 lines. Proposed: 304 lines (+124 net).

The full proposed file is checked into our repo at:

- [`examples/workbench/web-design-guidelines/proposed-upstream-changes/web-interface-guidelines/after-command.md`](../../../examples/workbench/web-design-guidelines/proposed-upstream-changes/web-interface-guidelines/after-command.md)

**Two structural additions**, after the existing "Rules" section and before "Output Format":

### Section A — "Per-element review (Pass 2 checklist)"

A reference table organized by element type that Pass 2 walks through:

```markdown
## Per-element review (Pass 2 checklist)

For each element in the file, walk the relevant checklist and flag every
attribute or behavior that should be present but isn't.

**Every `<img>`:**
- explicit `width` AND `height` (prevents CLS)
- above-fold critical → `priority` or `fetchpriority="high"` (LCP)
- below-fold → `loading="lazy"`
- decorative → `alt=""`, meaningful → descriptive `alt`

**Every `<input>`:**
- `autoComplete` set
- meaningful `name`
- correct `type` (`email`, `tel`, `url`, `number`)
- `inputMode` for mobile keyboards
- `<label htmlFor>` or wrapping `<label>`
- NO `onPaste={(e) => e.preventDefault()}`
- emails / codes / usernames → `spellCheck={false}`

**Every `<button>` (any type):**
- visible focus style (`focus-visible:ring-*`)
- `hover:` state for visual feedback
- `type="button"` if not a form submit

**Every `<button type="submit">`** (in addition to the above):
- stays enabled until the request starts; spinner during the request
- NEVER `disabled={!form.valid}` style

[... continues for form, list/array render, interactive element,
animation/transition, modal/dialog, native `<select>`, headings,
brand names ...]
```

### Section B — "Common-miss examples"

Five BAD/GOOD code blocks for the absence-type and anti-pattern rules
the eval surfaced as systematically missed:

1. **Submit button stays enabled until request starts** — BAD: `disabled={!email}`; GOOD: `disabled={submitting}` + spinner
2. **Never block paste** — BAD: `onPaste={(e) => e.preventDefault()}`; GOOD: allow paste, validate after
3. **Inputs need `autoComplete`** — BAD: no `autoComplete`; GOOD: `autoComplete="email"` (or `"off"` only when intended)
4. **Above-fold critical images need a priority hint** — BAD: bare `<img>`; GOOD: `priority` or `fetchpriority="high"`
5. **Handle empty states** — BAD: `<ul>{items.map(...)}</ul>`; GOOD: explicit `items.length === 0` branch

## Dual-copy constraint

Per AGENTS.md, this repo keeps `README.md` and `AGENTS.md` as parallel
copies of the same content (one human-readable, one agent-readable).
The proposed changes are content additions — they need to land in
**both** files in the same PR. PR #20 ("Add `translate='no'` guideline")
is the reference precedent.

In the canonical workbench, our `command.md` is the master copy.
`AGENTS.md` is the same content reformatted for the AGENTS standard;
the manual diff is mechanical.

## Operator steps to submit

```bash
# 1. Clone the fork
git clone git@github.com:fastxyz/web-interface-guidelines.git \
  /tmp/upstream-web-interface-guidelines
cd /tmp/upstream-web-interface-guidelines
git remote add upstream https://github.com/vercel-labs/web-interface-guidelines.git
git fetch upstream
git checkout -b feat/per-element-checklist-and-examples upstream/main

# 2. Replace command.md with the proposed version
cp /home/yuqing/Documents/Code/skill-optimizer/examples/workbench/web-design-guidelines/proposed-upstream-changes/web-interface-guidelines/after-command.md \
   command.md

# 3. Mirror the content into AGENTS.md (manual reformat — same sections,
# AGENTS-standard frontmatter)
# Reference: how PR #20 mirrored README.md → AGENTS.md.

# 4. Commit + push
git add command.md AGENTS.md
git commit -m "Add per-element checklist and BAD/GOOD examples"
git push -u origin feat/per-element-checklist-and-examples

# 5. Open PR (terse body per this repo's style)
gh pr create --repo vercel-labs/web-interface-guidelines --base main \
  --title "Add per-element checklist and BAD/GOOD examples for absence-type rules" \
  --body-file path/to/this-draft-body.md
```

## Caveats

1. **README.md/AGENTS.md sync.** The diff above is for `command.md`. Need to mirror into `README.md` and `AGENTS.md` for parity with the repo's convention.
2. **Low-traffic repo.** Last merge ~5 weeks ago. Don't expect immediate response. PR #20 had the same shape (terse body, additive guideline) and merged silently with a single approve.
3. **Companion PR.** Most useful if SKILL.md PR (#1) in this batch is merged in parallel.
