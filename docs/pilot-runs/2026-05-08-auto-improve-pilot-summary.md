# Auto-improve-skill pilot summary — 2026-05-08

## Setup

Built a `tools/auto-improve-skill.mjs` wrapper + `tools/auto-improve-skill-prompt.md` template.
Operator says "optimize `<slug>`"; orchestrator runs the wrapper via `Bash run_in_background`,
the inner `claude -p` agent does the entire find → eval → diagnose → improve → package loop,
writes `examples/workbench/<skill-id>/analysis.md`, exits.

Branch: `feat/auto-improve-skill` (wrapper + prompt). Per-pilot output on `eval/auto-pilot/<skill-id>`.

## Three pilot runs

Run sequentially-ish: pilot #1 in main worktree, pilots #2 and #3 in parallel via `git worktree`
in separate working folders. Three providers × three trials × N cases per pilot.

| Skill | Classification | Status | Baseline | Final | Uplift | Iter | Plan-cost | OpenRouter |
|---|---|---|---|---|---|---|---|---|
| `vercel-labs/agent-browser/agent-browser` | tool-use | success | 0.56 | 1.00 | +0.44 | 1 | $3.15 | ~$2.80 |
| `supabase/agent-skills/supabase-postgres-best-practices` | code-reviewer | success | 0.54 | 0.86 | +0.32 | 1 | $0 | ~$2.40 |
| `anthropics/skills/pdf` | document-producer | success | 1.00 | 1.00 | +0 | 0 | $0 | ~$1.40 |

3/3 succeeded. Each surfaced a distinct success path:

- **agent-browser**: auto-pilot diagnosed that its own grader was over-specified (required `snapshot` for non-interactive ops, but the skill says CSS selectors are valid). Demoted the grader, +0.44 uplift mostly from grader correction. Also proposed a small additive "Quick task reference" section to upstream SKILL.md.
- **supabase**: 9 SQL violations seeded (FK indexes, RLS, covering indexes, etc.). Auto-pilot first self-corrected its grader (line tolerance ±3 → ±8, added keyword variants), then independently rediscovered the same **two-pass workflow** pattern we found manually for web-design-guidelines (pass 1 = visible token misuse, pass 2 = absence checks). Real upstream proposal generated.
- **pdf**: baseline already 1.00, auto-pilot triggered the "≥0.95 → exit clean, no proposal" path correctly. Did NOT manufacture problems. Noticed and noted that upstream's REFERENCE.md / FORMS.md links are 404.

## Costs

- OpenRouter (matrix runs): ~$6.60 total across 3 pilots.
- Plan budget (the inner `claude -p` self-reported `total_cost_usd`): only #1 hit the cap.
  Pilot #1 first attempt blocked at $3.42 from the docker-permissions issue. Pilot #1c with
  `--budget 15` settled at $3.15. Pilots #2 and #3 reported $0 (likely under tracking floor
  or didn't iterate enough to register).
- Wall clock: ~50 min for 3 parallel pilots (vs ~150 min sequential).

## Auto-pilot capabilities validated

1. **Correct skill-shape classification** in all 3 cases (`tool-use`, `code-reviewer`, `document-producer`).
2. **Self-correction of own grader bugs** before diagnosing the underlying skill — happened in 2 of 3 pilots without operator nudging. Same patterns we manually applied (line-tolerance widening, hyphenated regex variants, keyword alternations).
3. **Pattern transfer**: the auto-pilot rediscovered the "two-pass workflow for absence-type rules" insight on supabase — a different skill in a different rule space — confirming the pattern generalizes.
4. **Clean exit on already-good skills**: pdf ran 36/36 trials passing at baseline; auto-pilot did not manufacture changes.
5. **Distinguishing skill problem from grader problem**: agent-browser caught grader-over-specification, separated it from skill quality.

## Issues found in v1 of the auto-pilot

1. **"Always: commit" step unreliable.** Pilots #1b and #2 didn't reach it — case files were left untracked in the worktree. Fix: hoist the commit step earlier (right after analysis.md is written), or split the prompt into two `claude -p` invocations (build + analyze).
2. **`--max-budget-usd 3.50` is too tight** for runs that need any real iteration. Pilot #1's first real-data attempt hit the cap mid-modification. Bumping to $15 worked. Sensible default for v2: $7-10.
3. **Phase 4 grader-fix iteration eats one of the two iteration slots.** The agent often spends iteration 1 fixing graders and only has one shot at modifying the skill. Fix: pre-bake known grader-tuning patterns into `_grader-utils.mjs` so the agent doesn't have to discover them, or count grader-only fixes separately from skill-modification iterations.

## Patterns we should bake into v2

From pilots and prior manual runs, these recurring techniques are stable enough to embed as defaults:

**Optimizing patterns** (bake into prompt as Phase-4 priors):

- Two-pass workflow (pass 1 visible / pass 2 absence) for code-reviewer skills
- Per-element checklists for skills with rule-by-element structure
- BAD/GOOD examples for anti-pattern and absence-type rules
- "Verify-tool-installed" nudge for tool-use skills (agents fall back to `curl`/`npm i`)

**Grader-reliability patterns** (bake into `_grader-utils.mjs`):

- Default `±5–8` line tolerance
- Hyphen-tolerant regex (`/empty[-\s]+state/`)
- Per-finding-line keyword matching
- Multiple keyword variants (`/cover/i` for both "covering" and "does not cover")

**Default seeded violation types** (bake into Phase-2 instructions):

- For code-reviewer: ≥1 visible-token, ≥1 missing-attribute, ≥1 missing-branch, ≥1 anti-pattern, ≥1 state-machine
- For tool-use: ≥1 reaches-for-fallback, ≥1 wrong-flag, ≥1 missing-step
- For document-producer: ≥1 missing-field, ≥1 wrong-format, ≥1 edge-case-input

## Decision points for the team

1. **Continue scaling.** With these results, "optimize 10 skills" is a sequential loop the
   orchestrator already supports (just call the wrapper N times). With worktrees, N=3 in
   parallel is also straightforward. Cost per skill ~$2-3 OpenRouter + plan-tokens.

2. **Tighten the prompt before scaling.** The "Always: commit" issue and the budget-too-tight
   issue are real and would cost a fraction of one pilot to fix. ~30 min of work for v2.

3. **Build the lessons doc.** A `tools/auto-improve-skill-lessons.md` referenced by the
   prompt as Phase-4 prior, updated after every pilot. Compounds: pilot N benefits from
   patterns 1..N-1. Not started; sub-project for after the next batch.

4. **Skill-batch parallelism.** Worktree-per-pilot worked. For 10 skills, 3-way parallel
   would land in ~3-4 batches (~3 hours). 5-way is also feasible if the dev machine has
   the resources.

## Reproducing the pilots

```bash
cd /home/yuqing/Documents/Code/skill-optimizer
git checkout feat/auto-improve-skill
node tools/auto-improve-skill.mjs <owner>/<repo>/<skill-id> [--budget 15]

# Output: examples/workbench/<skill-id>/{analysis.md, suite.yml, ...}
# Branch: eval/auto-pilot/<skill-id>
```

For parallel runs, use git worktrees:

```bash
git worktree add ../wt-pilot-2 -b auto-pilot/wt-2 feat/auto-improve-skill
cd ../wt-pilot-2 && node tools/auto-improve-skill.mjs <slug-2> --budget 15
```
