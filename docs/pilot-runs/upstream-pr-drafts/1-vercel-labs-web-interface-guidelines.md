# PR #1 — vercel-labs/web-interface-guidelines: per-element checklist

**Target:** `vercel-labs/web-interface-guidelines`
**Files:** `command.md`, `AGENTS.md`, `README.md` (3-file mirror per
PR #23 precedent)
**Base branch:** `main`
**Title:** `Add per-element checklist for absence-type rules`

## Summary

This is a single consolidated PR — one logical change mirrored across
the repo's three distribution channels (`command.md` for slash-command
agents, `AGENTS.md` for project-level ambient context, `README.md` for
human readers). PR #23 (`Add translate="no" guideline`) is the
precedent for the 3-file shape.

The auto-pilot's `command.md` change was measured against a 3-frontier-
model eval (claude-sonnet-4.6, openai/gpt-5, google/gemini-2.5-pro × 3
trials × 2 React components with 8 seeded violations each). The
`AGENTS.md` and `README.md` mirrors are style-faithful reformulations
of the same rule additions and are NOT independently measured —
honestly noted in the PR body.

## PR body (qualitative pitch + supporting evidence)

```markdown
Adds a per-element checklist (`<img>`, `<input>`, `<button>`) that
surfaces absence-type rules — the kind of rules that are easy to miss
because they require enumerating elements and checking each, rather
than recognizing a visible bad pattern. Useful for both human and AI
reviewers. Slots into existing structure between the form/content
rules and `## Performance`. Purely additive — no existing rules
touched.

Same logical addition mirrored across `command.md`, `AGENTS.md`, and
`README.md`, matching the PR #23 precedent for content additions.

## Evidence (supporting, not headline)

Ran an eval of 18 trials (3 frontier models × 3 trials × 2 seeded
React components with 4 absence-type and 4 presence-type violations
each).

| Variant | Catch rate |
|---|---|
| Existing rules | 92% (66/72) |
| With per-element checklist added to `command.md` | 100% (72/72) |

The 6 missed violations were all absence-type, mostly missed by
smaller models that don't proactively enumerate elements when given
declarative rules. The checklist converts declarative rules into a
procedural enumeration that frontier and smaller models both follow
reliably.

Note: the `command.md` variant is measured. The `AGENTS.md` and
`README.md` mirrors are style-faithful reformulations of the same
rule content (MUST/SHOULD/NEVER and prose styles per the existing
voice of each file) and are not independently measured. They follow
PR #23's pattern of mirroring content additions across all three
files in one PR.
```

## File 1 — `command.md` (the measured change)

**Insertion point:** between the existing `### Images` section and
the `### Performance` section (around line 79 of upstream `main`).

```diff
@@ -76,6 +76,28 @@
 - Below-fold images: `loading="lazy"`
 - Above-fold critical images: `priority` or `fetchpriority="high"`
 
+### Per-element checklist (absence rules)
+
+Walk **every** instance of these elements — absence violations are the most-missed. Check each attribute is present, not just the element.
+
+**Every `<img>`:**
+- explicit `width` AND `height` (prevents CLS) — flag if either attribute is missing
+- below-fold → `loading="lazy"`
+- above-fold critical → `priority` or `fetchpriority="high"`
+
+**Every `<input>`:**
+- `autoComplete` set (specific value: `"email"`, `"current-password"`, `"username"`, etc.)
+- correct `type` + `inputmode`
+- associated `<label htmlFor>` or wrapping `<label>`
+- emails/codes/usernames → `spellCheck={false}`
+
+**Every icon-only `<button>` (no visible text):**
+- `aria-label` present
+
+**Every submit `<button>`:**
+- `disabled` only while request is in-flight (`isSubmitting`)—not gated on form validity
+- spinner or loading indicator during request
+
 ### Performance
```

**Frontmatter note:** the auto-pilot's vendored `before-command.md`
has slightly different `description:` and `argument-hint:` strings
than upstream `main`. The actual PR diff against upstream should NOT
touch the frontmatter — only insert the body content above.

## File 2 — `AGENTS.md` (MUST/SHOULD/NEVER mirror)

**Insertion point:** as a new top-level section between
`## Content Handling` (ends ~line 113) and `## Performance` (~line
114).

```diff
@@ around line 113, after the last bullet of "## Content Handling" @@
 
+## Per-element checklist (absence rules)
+
+Walk every instance—absence rules are the most-missed.
+
+**Every `<img>`:**
+- MUST: explicit `width` AND `height` (prevents CLS)
+- MUST: below-fold → `loading="lazy"`
+- SHOULD: above-fold critical → `priority` or `fetchpriority="high"`
+
+**Every `<input>`:**
+- MUST: `autoComplete` set to specific value (`email`, `current-password`, `username`, etc.)
+- MUST: correct `type` + `inputmode`
+- MUST: associated `<label htmlFor>` or wrapping `<label>`
+- SHOULD: `spellCheck={false}` for emails, codes, usernames
+
+**Every icon-only `<button>` (no visible text):**
+- MUST: descriptive `aria-label`
+
+**Every `<button type="submit">`:**
+- NEVER: `disabled={!form.valid}` style gating
+- MUST: `disabled` only while request in-flight; spinner during request
+
 ## Performance
```

## File 3 — `README.md` (prose mirror)

**Insertion point:** as a new top-level section between `## Forms`
(ends ~line 107) and `## Performance` (~line 108).

```diff
@@ around line 107, after the last bullet of "## Forms" @@
 
+## Per-element checklist
+
+When reviewing a file, walk each element type and check every instance against the relevant attributes. Absence violations (a missing `aria-label`, a missing `autoComplete`, a missing `width`/`height`) are the most-missed because they require enumerating elements rather than recognizing a visible bad pattern.
+
+- **Every `<img>`.** Explicit `width` AND `height` (prevents CLS). Below-fold images: `loading="lazy"`. Above-fold critical images: `priority` or `fetchpriority="high"`.
+- **Every `<input>`.** Specific `autoComplete` value (`"email"`, `"current-password"`, `"username"`, etc.). Correct `type` + `inputmode`. Associated `<label htmlFor>` or wrapping `<label>`. Use `spellCheck={false}` for emails, codes, and usernames.
+- **Every icon-only `<button>` (no visible text).** Descriptive `aria-label` present.
+- **Every `<button type="submit">`.** `disabled` only while the request is in-flight (`isSubmitting`) — never gated on form validity. Show a loading indicator during the request.
+
 ## Performance
```

## Caveats

1. **3-file sync is intentional and matches repo convention.** PR #23
   (Add `translate="no"` guideline) is the canonical precedent for
   additive content addition touching `AGENTS.md` + `README.md` +
   `command.md` in one PR. Some merged PRs touched only 1–2 files,
   but the maintainer-preferred shape is the 3-file mirror.
2. **Slight `<img>` overlap with existing `### Images` section in
   `command.md`.** The existing Images section already has bullets
   for `width`/`height`, `loading="lazy"`, and `priority`. The new
   per-element checklist restates those in a per-element-context
   framing. This is intentional — the checklist's value is the
   procedural framing ("walk every img"), not new rules. If the
   maintainer flags it as redundant, we can drop the duplicate
   `<img>` lines from the checklist (keeping just the procedural
   `<input>`/`<button>` content) without affecting the eval result.
3. **Style match.** Each file's mirror matches the surrounding voice
   in that file (terse imperative bullets in command.md;
   MUST/SHOULD/NEVER directives in AGENTS.md; prose with bold-lead
   bullets in README.md). The actual rule content is identical
   across all three.
4. **Low traffic repo.** 48 forks, last merge ~5 weeks ago. Don't
   expect immediate response. PR #23 had the same shape (terse body,
   additive guideline, 3-file mirror) and merged silently with one
   maintainer approve.
5. **The wrapper-skill PR (`vercel-labs/agent-skills/skills/web-design-guidelines/SKILL.md`)
   is dropped.** Per upstream research, the SKILL.md is a thin
   Claude-Code-specific adapter that WebFetches `command.md`. The
   value lives in `command.md` (consumed by 7 agent tools via
   `install.sh` plus 10+ downstream repos). Editing the wrapper
   SKILL.md is low-leverage and high-risk-of-bitrot; we ship a
   single PR to `web-interface-guidelines` instead.

## Operator steps to submit

```bash
# 1. Clone fork
git clone git@github.com:fastxyz/web-interface-guidelines.git \
  /tmp/upstream-web-interface-guidelines
cd /tmp/upstream-web-interface-guidelines
git remote add upstream https://github.com/vercel-labs/web-interface-guidelines.git
git fetch upstream
git checkout -b feat/per-element-checklist upstream/main

# 2. Apply the three diffs (manual edits to command.md, AGENTS.md, README.md)
# Use the diff blocks above as guidance.

# 3. Commit + push
git add command.md AGENTS.md README.md
git commit -m "Add per-element checklist for absence-type rules"
git push -u origin feat/per-element-checklist

# 4. Open PR
gh pr create --repo vercel-labs/web-interface-guidelines --base main \
  --title "Add per-element checklist for absence-type rules" \
  --body-file path/to/this-draft-pr-body.md
```

## Provenance

- v1.2.1 auto-pilot run: branch `eval/auto-pilot/web-design-guidelines`,
  commit `df7149e`, status `success`, baseline 0.92, final 1.00
- Context file: `tools/auto-improve-contexts/vercel-web-interface-guidelines.md`
- Pilot cost: $2.29
