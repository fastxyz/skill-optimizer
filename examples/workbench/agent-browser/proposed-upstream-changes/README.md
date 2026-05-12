# Proposed upstream changes — agent-browser

## Summary

Eval status: **success** (baseline rule-coverage 0.97, no modifications required).

The skill performs well as-is. This PR proposes one small additive improvement
surfaced by the eval: a **Pre-flight** section in `SKILL.md` that explicitly
discourages `curl`/`wget` fallback.

## What changed

Added a `## Pre-flight` section to `SKILL.md` (5 lines, purely additive):

```diff
+## Pre-flight
+
+Verify the CLI is ready before starting any task:
+
+```bash
+which agent-browser        # confirm it's installed and in PATH
+```
+
+**Do not** fall back to `curl`, `wget`, or `requests` for page fetches.
+**Do not** `npm install` or `npx` the CLI — use the pre-installed version.
+
 ## Start here
```

## Why

The 3-provider eval (claude-sonnet-4.6, gpt-5, gemini-2.5-pro, 3 trials each,
2 cases) found that **3/100 behavioral checks failed** — all in one gemini trial
that used `curl` for HTTP fetching instead of `agent-browser navigate` despite
having already loaded the core skill content.

The `curl`/`wget` fallback is a known failure mode for tool-use skills
(documented in `skills/auto-improve-orchestrator/references/lessons.md` § Recipe B). The Pre-flight
section is the standard fix.

## Baseline evidence

| Model | navigate-and-report | screenshot-capture | Passes |
|---|---|---|---|
| claude-sonnet-4.6 | 3/3 | 3/3 | 30/30 |
| gpt-5 | 3/3 | 3/3 | 30/30 |
| gemini-2.5-pro | 2/3 | 3/3 | 29/30 |
| **Total** | **8/9** | **9/9** | **97/100 (0.97)** |

## How to apply

```diff
--- a/skills/agent-browser/SKILL.md
+++ b/skills/agent-browser/SKILL.md
@@ -12,6 +12,16 @@ Install: `npm i -g agent-browser && agent-browser install`

+## Pre-flight
+
+Verify the CLI is ready before starting any task:
+
+```bash
+which agent-browser        # confirm it's installed and in PATH
+```
+
+**Do not** fall back to `curl`, `wget`, or `requests` for page fetches.
+**Do not** `npm install` or `npx` the CLI — use the pre-installed version.
+
 ## Start here
```
