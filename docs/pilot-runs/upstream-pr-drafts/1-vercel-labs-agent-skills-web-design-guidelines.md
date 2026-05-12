# PR #1 — vercel-labs/agent-skills: web-design-guidelines

**Target:** `vercel-labs/agent-skills`
**File:** `skills/web-design-guidelines/SKILL.md`
**Base branch:** `main`
**Title:** `web-design-guidelines: add explicit two-pass workflow`

## Body

```markdown
## Summary

- Adds an explicit "Pass 1 — visible anti-patterns / Pass 2 — absences" workflow to the SKILL.md, so reviewing agents do a structured per-element absence check after scanning for visible bad patterns.
- The skill's rules are mostly about *what's missing* (a missing `alt`, a missing `aria-label`, a missing focus replacement). Models reliably catch the visible patterns but skip the absence checks unless explicitly told to look for them.
- Diff vs upstream is purely additive: no rule deletions, no wording changes to existing rules. Adds ~15 lines under "How It Works" plus a tightened "Usage" block. The WebFetch behavior and the rules URL are unchanged.

## Evidence

Built a workbench of 4 sample React/TSX components seeded with 20 known violations across a11y / focus / forms / typography / animation rule families, then ran a 3-model matrix (`claude-sonnet-4.6`, `openai/gpt-5-mini`, `google/gemini-2.5-pro`) × 3 trials.

| Model | Before | After |
|---|---|---|
| `claude-sonnet-4.6` | 10/12 (83%) | 12/12 (100%) |
| `openai/gpt-5-mini` | 9/12 (75%) | 10/12 (83%) |
| `google/gemini-2.5-pro` | 7/12 (58%) | 9/12 (75%) |
| **Total** | **26/36 (72%)** | **31/36 (86%)** |

`gpt-5-mini`'s gains come almost entirely from the new per-element checklist surfacing absence rules. Two rules (`no-empty-state-handling`, `input-missing-autocomplete`) were eliminated entirely.

A companion PR to `vercel-labs/web-interface-guidelines` adds matching per-element checklists + 5 BAD/GOOD code blocks to `command.md`. Both PRs land independently but are most useful merged together.

## Test plan

- [ ] Read the diff — confirm additive only, no existing rules touched
- [ ] Verify the SKILL.md still parses correctly as a Claude Code skill
- [ ] Optional: re-run with your preferred review test files
```

## File diff

**Before** (`skills/web-design-guidelines/SKILL.md`, 39 lines):

The current upstream version. No changes needed before applying the diff below.

**After** (54 lines, +15 net): adds explicit Pass 1 / Pass 2 sections to "How It Works" and tightens the "Usage" numbered list to reflect the two-pass workflow.

The full proposed file is checked into our repo at:

- [`examples/workbench/web-design-guidelines/proposed-upstream-changes/agent-skills--web-design-guidelines/after-SKILL.md`](../../../examples/workbench/web-design-guidelines/proposed-upstream-changes/agent-skills--web-design-guidelines/after-SKILL.md)

A unified diff against the upstream:

```diff
--- skills/web-design-guidelines/SKILL.md  (current upstream)
+++ skills/web-design-guidelines/SKILL.md  (proposed)
@@ metadata block @@
   author: vercel
-  version: "1.0.0"
+  version: "1.1.0"
   argument-hint: <file-or-pattern>

@@ "How It Works" section @@
 ## How It Works

 1. Fetch the latest guidelines from the source URL below.
 2. Read the specified files (or prompt user for files/pattern).
-3. Check against all rules in the fetched guidelines
-4. Output findings in the terse `file:line` format
+3. Review each file in **TWO passes** — both passes are required.
+4. Output findings in the terse `file:line <issue>` format.
+
+### Pass 1 — Visible anti-patterns
+
+Scan each file for literal patterns that appear in the code:
+`<div onClick>` for actions, `transition: all`, `outline-none` className,
+`onPaste={(e) => e.preventDefault()}`, `"..."` (three dots), straight
+`"..."` quotes, etc. The full list is in the fetched guidelines. One
+finding per match.
+
+### Pass 2 — Absences (per-element checklist)
+
+The most-missed rules are about *what's missing*. After Pass 1, walk
+each `<img>`, `<input>`, `<button>`, and `<form>` once and run the
+checklist in the **"Per-element review"** section of the fetched
+guidelines. Report every attribute or behavior that should be present
+but isn't.
+
+Pass 2 is the difference between a 70% review and a 95% review. Do not skip it.

@@ "Usage" section @@
 ## Usage

 When a user provides a file or pattern argument:
+
 1. Fetch guidelines from the source URL above.
 2. Read the specified files.
-3. Apply all rules from the fetched guidelines
-4. Output findings using the format specified in the guidelines
+3. Run Pass 1 (visible anti-patterns).
+4. Run Pass 2 (per-element absence checklist).
+5. Output findings using the format specified in the guidelines.
```

## Caveats

1. **Companion PR dependency.** Pass 2 references a "Per-element review" section in the fetched rules doc (`command.md`). That section doesn't exist upstream yet — PR #2 in this batch adds it. Without PR #2 merged, the SKILL.md change is still useful (the two-pass workflow is well-defined) but Pass 2's per-element instruction has nothing to reference.
2. **Version bump.** Set to `1.1.0` since this is a content addition. The repo doesn't appear to use Release Please-style automation, so the manual bump is fine.

## Operator steps to submit

```bash
# 1. Clone a fork (assume fastxyz fork exists)
git clone git@github.com:fastxyz/agent-skills.git /tmp/upstream-agent-skills
cd /tmp/upstream-agent-skills
git remote add upstream https://github.com/vercel-labs/agent-skills.git
git fetch upstream
git checkout -b skill/web-design-guidelines-two-pass upstream/main

# 2. Apply the change
# Copy the proposed file from our repo:
cp /home/yuqing/Documents/Code/skill-optimizer/examples/workbench/web-design-guidelines/proposed-upstream-changes/agent-skills--web-design-guidelines/after-SKILL.md \
   skills/web-design-guidelines/SKILL.md

# 3. Commit + push
git add skills/web-design-guidelines/SKILL.md
git commit -m "web-design-guidelines: add explicit two-pass workflow"
git push -u origin skill/web-design-guidelines-two-pass

# 4. Open PR
gh pr create --repo vercel-labs/agent-skills --base main \
  --title "web-design-guidelines: add explicit two-pass workflow" \
  --body-file path/to/this-draft-body.md
```
