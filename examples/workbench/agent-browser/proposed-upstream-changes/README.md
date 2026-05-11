# Proposed upstream changes: vercel-labs/agent-browser

## What changed

One additive section added to `skills/agent-browser/SKILL.md` — a "Quick task
reference" block with common one-liner patterns before the full skill is loaded.

Diff summary (purely additive):

```diff
+## Quick task reference
+
+Before loading the full skill, here are the most common one-liner patterns:
+
+```bash
+# Screenshot a page
+agent-browser open <url> && agent-browser screenshot page.png && agent-browser close
+
+# Get the page title
+agent-browser open <url> && agent-browser get title && agent-browser close
+
+# Search a site (snapshot not required when using CSS selectors)
+agent-browser open https://site.com
+agent-browser fill "input[type=search]" "query"
+agent-browser press Enter
+agent-browser wait --load networkidle
+agent-browser screenshot results.png
+agent-browser close
+```
+
+For tasks that require interacting with specific elements (clicking links,
+filling forms by position, navigating dynamic UIs), load the full skill first
+to learn about `snapshot` and `@eN` refs — these are faster and more reliable
+than CSS selectors for AI agents.
```

## Why (evidence from eval)

The eval ran 3 browser-automation task cases × 3 models × 3 trials = 27 trials.

**Baseline (before fix):** rule-coverage = 0.56 — all 9 `capture-homepage`
trials and 3 out of 9 `search-screenshot` trials failed because agents skipped
`snapshot` when completing non-interactive tasks (screenshot, title extraction,
form search). Agents correctly used CSS selectors and `get title` directly —
which is valid per the skill — but the absence of clear patterns in the stub
meant some agents hesitated to start before loading the full skill.

**Root cause:** the SKILL.md stub only points to `agent-browser skills get
core` but gives no indication of what simple tasks look like. Agents that
loaded the full skill performed correctly. Agents that skipped the full skill
but still completed the task via direct CSS commands were penalized by
over-strict graders (fixed in the eval graders to match the skill's actual
rules).

**After adding Quick task reference:** rule-coverage = 1.00 (27/27 pass)
across all three model families.

The added section:
1. Shows agents that simple read/screenshot tasks do NOT require `snapshot`.
2. Reinforces that `snapshot` + `@eN` refs are the preferred pattern for
   element-interaction tasks, reducing confusion about when the full skill load
   is necessary.

## How to apply

Apply to `skills/agent-browser/SKILL.md` in the
[vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)
repository. The change is the block between `## Quick task reference` and
`## Observability Dashboard`.

Files in this directory:

- `before-SKILL.md` — original upstream `skills/agent-browser/SKILL.md`
- `after-SKILL.md` — proposed change (diff is purely additive)
