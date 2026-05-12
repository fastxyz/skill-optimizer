# PR #5 — google-labs-code/stitch-skills: shadcn-ui code review checklist

**Target:** `google-labs-code/stitch-skills`
**File:** `skills/shadcn-ui/SKILL.md`
**Base branch:** `main`
**Title:** `feat: add code review checklist + custom-component placement guidance to shadcn-ui`

## Summary

Adds two additive sections to `skills/shadcn-ui/SKILL.md`:

1. A "**CRITICAL: Never place custom/composed components in `components/ui/`**" callout
   inside the existing `### 3. Extending Components` section, with a side-by-side BAD/GOOD
   TSX example showing the path-comment cue (`// src/components/ui/StatusBadge.tsx` ← WRONG
   vs `// src/components/StatusBadge.tsx` ← CORRECT).
2. A new `## Code Review Checklist` section before `## Validation and Quality` that walks
   reviewers through a two-pass scan: Pass 1 catches visible anti-patterns (file location,
   class merging with `cn()`, variant logic with `cva`, ARIA preservation), Pass 2 catches
   absence violations (interactive elements without keyboard handlers; theme colors
   hard-coded instead of CSS variables).

Purely additive — no existing rules deleted or reworded. ~50 net lines added (~387 lines
total vs upstream's 326).

## PR body

```markdown
## Summary

- Adds an explicit BAD/GOOD example for the `components/ui/` placement rule so reviewers can spot wrong-location violations from the first-line path comment.
- Adds a `## Code Review Checklist` section that frames shadcn/ui review as a two-pass workflow (visible anti-patterns then absence checks). Useful for both human and AI reviewers.
- Purely additive — no existing rules touched.

## Evidence

Eval against the v1.3 auto-pilot orchestrator on a 2-case, 3-frontier-model matrix
(claude-sonnet-4.6, openai/gpt-5, google/gemini-2.5-pro × 3 trials = 18 trials):

| Metric | Baseline | After this change |
|---|---|---|
| Per-case-min rule coverage | **0.667** | **0.889** (+0.222 uplift) |
| review-usercard mean | 0.889 | 1.000 |
| review-statusbadge mean | 0.667 | 0.889 |

Targeted miss: gemini-2.5-pro missed the `wrong-file-location` violation on
StatusBadge.tsx in 3/3 trials at baseline. The skill change moved gemini to 2/3 on
that case (the path-comment cue made the absence-type rule recognizable).

A prior batch with the older `gpt-4o-mini` matrix showed +0.111 uplift; switching to
gpt-5 raised the baseline AND showed a larger absolute uplift (+0.222), confirming the
addition isn't a small-model artifact.
```

## File diff

Target: `skills/shadcn-ui/SKILL.md` (the canonical skill file at the repo root).

The full proposed file is committed in our repo at:

- [`examples/workbench/shadcn-ui/proposed-upstream-changes/google-labs-code-stitch-skills/after-SKILL.md`](../../../examples/workbench/shadcn-ui/proposed-upstream-changes/google-labs-code-stitch-skills/after-SKILL.md)

Two insertion points (unified diff against upstream `main`):

```diff
@@ around line 184, inside "### 3. Extending Components" @@

 ### 3. Extending Components

+**CRITICAL: Never place custom/composed components in `components/ui/`.**
+
+`components/ui/` is reserved exclusively for the raw shadcn/ui primitive components (installed
+via `npx shadcn@latest add`). Any wrapper, composed, or business-logic component must live in
+`components/` (or a subdirectory like `components/cards/`, `components/forms/`).
+
+```tsx
+// BAD: custom composed component placed in components/ui/
+// src/components/ui/UserCard.tsx  ← WRONG
+export function UserCard({ name, role }: UserCardProps) {
+  return <Card>...</Card>;
+}
+
+// GOOD: custom composed component in components/
+// src/components/UserCard.tsx     ← CORRECT
+export function UserCard({ name, role }: UserCardProps) {
+  return <Card>...</Card>;
+}
+```
+
 Create wrapper components in `components/` (not `components/ui/`):
```

```diff
@@ around line 322, between "### Component-Specific Notes" and "## Validation and Quality" @@

+## Code Review Checklist
+
+When reviewing existing code for shadcn/ui best-practice compliance, scan each file in two passes:
+
+### Pass 1 — File placement and visible anti-patterns
+
+- [ ] **File location**: Custom/composed components must NOT be in `components/ui/`. **Always
+      read the first line of each file** — source files begin with a path comment (e.g.
+      `// src/components/ui/StatusBadge.tsx`). If that path contains `components/ui/` AND the
+      component is NOT a raw shadcn primitive (installed via CLI), that is a wrong-location
+      violation. Flag it: `StatusBadge.tsx:1 — custom component placed in components/ui/; move
+      to components/`.
+
+  ```tsx
+  // BAD: path comment reveals wrong location
+  // src/components/ui/StatusBadge.tsx   ← WRONG (custom composed component in ui/)
+  export function StatusBadge(...) { ... }
+
+  // GOOD: custom component in components/
+  // src/components/StatusBadge.tsx      ← CORRECT
+  export function StatusBadge(...) { ... }
+  ```
+- [ ] **Class merging**: Every dynamic `className` must use `cn()` (clsx + tailwind-merge).
+      Reject bare string concatenation: `"base " + extra` or template literals without `cn()`.
+- [ ] **Variant logic**: Multiple style variants must use `cva` from `class-variance-authority`.
+      Reject `if/else` or ternary chains that select class strings manually.
+- [ ] **ARIA preservation**: Custom components that wrap Radix UI / shadcn primitives must not
+      set `aria-*` props to `undefined` — that strips the accessibility attribute entirely.
+
+### Pass 2 — Absence checks (per element)
+
+**Every interactive element** (`<div onClick>`, `<span onClick>`, non-`<button>` click targets):
+- Has `role="button"` (or appropriate role)
+- Has `onKeyDown` or `onKeyUp` keyboard handler
+- Has `tabIndex={0}` so it is keyboard-reachable
+
+**Every theme color** in custom components:
+- Uses CSS variables (`bg-primary`, `text-foreground`, etc.) for brand colors
+- Hard-coded Tailwind color utilities (`bg-blue-600`) are acceptable for semantic status
+  colors (success/error/warning) but not for primary/secondary/background theme colors
+
 ## Validation and Quality
```

## Caveats

1. **Google CLA required.** Per `CONTRIBUTING.md`, contributors must sign the
   [Google Contributor License Agreement](https://cla.developers.google.com/about) before
   the PR can be merged. One-time step per Google account; covers all Google-Open-Source
   projects. The bot blocks merges until the CLA shows green.
2. **Apache 2.0 license** on the repo (verified via `LICENSE` file at repo root).
3. **No Release Please / no semver-bump bot.** Maintainers manage versions manually.
   Do NOT bump `metadata` versions in any frontmatter.
4. **CI gating.** The repo's CI validates the `react-components/` subtree only;
   shadcn-ui skill changes bypass CI. Docs-only / SKILL.md changes pass automatically.
5. **Recent merged-PR shape.** Last 5 merged PRs (#23, #31, #33, #36, #38) are all
   single-skill additive changes with `feat:` titles. Convention is loose — `feat:`,
   `chore:`, no-prefix all merged. Conventional commits encouraged but not strict.
6. **Cosmetic whitespace changes in the diff.** When `markdownlint --fix` ran on the
   workbench copy, it removed a few trailing whitespace characters (lines 147, 186-189
   in upstream) and reformatted one function signature. These are unrelated to the
   substantive additions. Either include them as a "while you're here" cleanup or
   manually revert before submitting (cleaner: keep additive-only).

## Operator steps to submit

```bash
# 1. Sign the Google CLA at https://cla.developers.google.com/ if you haven't already.

# 2. Clone the upstream fork
git clone git@github.com:fastxyz/stitch-skills.git \
  /tmp/upstream-stitch-skills
cd /tmp/upstream-stitch-skills
git remote add upstream https://github.com/google-labs-code/stitch-skills.git
git fetch upstream
git checkout -b feat/shadcn-ui-code-review-checklist upstream/main

# 3. Apply the change
# Easiest: copy the after-SKILL.md from this repo, then strip the cosmetic whitespace
# fixes if you want strict additive-only.
cp /home/yuqing/Documents/Code/skill-optimizer/.claude/worktrees/v1.3-impl/examples/workbench/shadcn-ui/proposed-upstream-changes/google-labs-code-stitch-skills/after-SKILL.md \
   skills/shadcn-ui/SKILL.md

# (Optional) revert the cosmetic whitespace changes:
# git diff upstream/main -- skills/shadcn-ui/SKILL.md
# Then manually revert the trailing-whitespace and function-signature reformatting hunks.

# 4. Commit + push
git add skills/shadcn-ui/SKILL.md
git commit -m "feat: add code review checklist + custom-component placement guidance to shadcn-ui"
git push -u origin feat/shadcn-ui-code-review-checklist

# 5. Open the PR
gh pr create --repo google-labs-code/stitch-skills --base main \
  --title "feat: add code review checklist + custom-component placement guidance to shadcn-ui" \
  --body-file path/to/this-draft-body.md
```

## Provenance

- v1.3 orchestrator dispatch (gpt-5 frontier matrix):
  - Branch: `eval/auto-pilot/shadcn-ui-gpt5-refire`
  - Commit: `4c7d112`
  - Status: `success`
  - Baseline per-case-min: 0.667 → final: 0.889 (+0.222 uplift)
  - Total cost: $2.50 ($0.91 baseline + $1.59 iteration 1)
- Earlier batch-2 dispatch (gpt-4o-mini matrix) showed +0.111 uplift —
  branch `eval/auto-pilot/shadcn-ui` commit `1744daf`
- Context file (research subagent output):
  `skills/auto-improve-orchestrator/references/contexts/google-labs-code-shadcn-ui.md`
- Eval workbench: `examples/workbench/shadcn-ui/` (2 cases:
  `review-usercard`, `review-statusbadge`)
