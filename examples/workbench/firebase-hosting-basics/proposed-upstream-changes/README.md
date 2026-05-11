# Proposed upstream changes — firebase-hosting-basics

## What changed

Added a `## Configuration Review` section to `SKILL.md` implementing a **two-pass review workflow**.

**Diff:** `firebase-agent-skills/before-SKILL.md` → `firebase-agent-skills/after-SKILL.md`
One new section appended at the end; zero changes to existing content.

## Why (evidence from eval)

Eval suite: `examples/workbench/firebase-hosting-basics/` — 1 case, 5 violations, 3 models × 3 trials.

| Metric | Before | After |
|---|---|---|
| Rule-coverage (grader-calibrated baseline) | 0.89 | 1.00 |
| GPT-4o-mini pass rate | 1/3 | 3/3 |
| Gemini pass rate | 2/3* | 2/3* |
| Claude pass rate | 3/3 | 3/3 |

*One Gemini trial failed with a transient API error ("JSON error injected into SSE stream"), not a model behavior issue.

**Key failure pattern before the change:**
- GPT-4o-mini sometimes produced an incomplete review (only 1 finding) or missed the SPA catch-all rewrite check (absence violation).
- Absence violations are 5–10× harder for models than presence violations. The original SKILL.md had no guidance on what to look for when auditing an existing config.

**What the new section adds:**
- Pass 1 explicitly lists incorrect literal values to scan for (presence violations).
- Pass 2 lists required-but-possibly-absent settings with concrete BAD consequences (missing `**/.*` exposes `.env`; missing catch-all rewrite causes 404s on deep links).

## How to apply upstream

Apply the diff to `skills/firebase-hosting-basics/SKILL.md` in the `firebase/agent-skills` repo.
The change is purely additive — no existing rules were modified or removed.
