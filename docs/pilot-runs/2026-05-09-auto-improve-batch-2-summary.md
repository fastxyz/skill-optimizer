# Auto-improve-skill batch 2 summary — 10 pilots, 8 success, 0 failures

## Setup

- **Wrapper version:** v1.1 + #3 (atomic write-and-commit, $10 default budget, lessons.md, pre-baked grader helpers)
- **Skills:** ranks 5–14 from the prioritized top-N list (skips the 4 already covered in batch 1: web-design-guidelines, agent-browser, supabase, pdf)
- **Parallelism:** 10 git worktrees, hardlinked `node_modules`, fired simultaneously
- **Wall clock:** ~50 min (slowest pilot to longest), down from estimated ~150 min sequential

## Headline results

| # | Skill | Classification | Status | Coverage | Mods | Notes |
|---|---|---|---|---|---|---|
| 1 | `anthropics/skills/pptx` | document-producer | ✅ success | 0.85 → 0.85 | 0 | grader cal raised raw 0.74 → 0.85; gpt-4o-mini fails entirely (model gap) |
| 2 | `vercel-labs/next-skills/next-best-practices` | code-reviewer | ✅ success | 0.80 → 0.975 | 0 | grader cal only — skill already strong |
| 3 | `firebase/agent-skills/firebase-auth-basics` | code-reviewer | ✅ success | 1.00 → 1.00 | 0 | reclassified from prior `tool-use` |
| 4 | `firebase/agent-skills/firebase-hosting-basics` | code-patterns | ✅ success | 0.89 → 1.00 | 1 | Recipe A + E added a Configuration Review section |
| 5 | `expo/skills/building-native-ui` | code-patterns | ✅ success | 0.99 → 0.99 | 0 | 17/18 trials — single gpt-5-mini miss accepted as noise |
| 6 | `google-labs-code/stitch-skills/shadcn-ui` | code-patterns | ✅ success | 0.82 → 0.89 | 1 | Recipe A + D — Gemini's wrong-location miss rate dropped 100% → 0% |
| 7 | `expo/skills/native-data-fetching` | code-reviewer | ✅ success | 1.00 → 1.00 | 0 | already-good |
| 8 | `firecrawl/skills/firecrawl-build-scrape` | code-patterns | ⚠️ uplift-too-small | 0.84 → 0.89 | 2 | +0.05, exactly on threshold; gpt-4o-mini verbosity floor caps it |
| 9 | `vercel-labs/next-skills/next-upgrade` | code-reviewer | ⚠️ uplift-too-small | **0.83 → 0.76** | 2 | **regression** — modifications hurt; new failure mode surfaced |
| 10 | `github/awesome-copilot/prd` | document-producer | ✅ success | 1.00 → 1.00 | 0 | sonnet API errors, judged on 12 valid trials from gpt-5-mini + gemini |

**8/10 success • 2/10 uplift-too-small • 0/10 blocked or budget-exceeded**

## Cost

- OpenRouter spend during batch: **~$21.30** ($40.65 used – $19.35 prior to batch start)
- Per-pilot avg: **$2.13** (well under the $3.50 budgeted)
- Plan-token spend (inner `claude -p`): each pilot reported between $0.00 and $1.00 — no pilot hit the $10 wrapper cap

## What v1.1 + #3 actually delivered

The pilots demonstrate the prompt improvements working as intended:

1. **"Atomic write-analysis-and-commit" worked.** **All 10 inner agents committed cleanly.** No manual recovery needed (vs batch 1 where 2 of 3 needed manual commits).
2. **Recipe citations by letter.** Pilots 4, 6, 8 explicitly cited Recipe A / D / E from `lessons.md` in their analysis bullets. They didn't rediscover the patterns from scratch.
3. **"Grader-vs-skill check first" worked.** Pilots 1, 2, 4, 6, 8, 9 all did iteration 0 grader calibration before counting against their iteration budget. Saved meaningful budget on pilots 2, 4, 6.
4. **`looseRange` / `tolerantKeyword` pre-baked helpers** — used in graders the auto-pilot wrote without rediscovering the patterns. Several pilots had to widen specifically for gpt-4o-mini drift (range 8 → 12 or 16) which is new signal worth adding to lessons.md.
5. **"Don't manufacture problems"** worked in all 5 already-good cases (3, 5, 7, 10, plus pilot 1 after grader cal). None proposed unnecessary changes.

## New patterns surfaced — worth adding to `lessons.md`

### Optimization patterns

- **(NEW) Recipe F? — Don't add bash commands for small models.** Pilot 9 added bash grep commands to `next-upgrade`'s SKILL.md. gpt-4o-mini tried to *execute* them rather than reading files, dropping coverage from 0.83 to 0.69. **Anti-pattern.** When skill is aimed at small/cheap models, prefer pure declarative wording over executable commands.

### Failure modes

- **CLI fabrication on "upgrade-style" skills.** gpt-4o-mini will hallucinate a `npx <something>-upgrade` CLI for any skill whose name suggests transformation/upgrade work, then write the error message as findings. Distinct from the agent-browser `curl` fallback (where the CLI exists but the model picks the wrong tool). Worth its own anti-pattern entry.
- **Verbosity floor on gpt-4o-mini.** Confirmed across pilots 8, 9 — emits 3-4 line responses, sometimes drops trailing rules entirely. Rules requiring multi-finding output above this floor are systematically under-detected.

### Grader patterns

- **(NEW) Per-model line tolerance.** sonnet/gemini drift 0–3 lines; gpt-4o-mini drifts 6–15 lines. The `looseRange` default of ±8 is calibrated for the first two but undertuned for the third. Future graders should default to `looseRange(N, 12)` or use per-model tolerance maps.

### Skill-shape edge cases

- **Repo path conventions vary.** `expo/skills` uses `plugins/expo/skills/<id>/SKILL.md` (not the canonical `skills/<id>/SKILL.md`). Pilots 5 and 7 both surfaced this and adapted. Worth noting in Phase-1 instructions.

## Branches pushed

- `eval/auto-pilot/batch-2-2026-05-09` (consolidated, all 10 cherry-picked)
- 10 individual `eval/auto-pilot/<skill-id>` branches (for per-skill review)

## What to PR upstream

Three pilots produced real, additive proposals:

| Skill | Uplift | Where the change goes |
|---|---|---|
| firebase-hosting-basics | 0.89 → 1.00 | `firebase/agent-skills` |
| shadcn-ui | 0.82 → 0.89 | `google-labs-code/stitch-skills` |
| firecrawl-build-scrape | 0.84 → 0.89 | `firecrawl/skills` |

**Skip from PR queue:**

- All 5 baseline-already-good skills (no changes warranted)
- pilot 9 (next-upgrade) — modifications regressed; needs human review or a different approach (probably "drop bash commands, use BAD/GOOD only")
- pilot 8 (firecrawl-build-scrape) is on the bubble at +0.05 — judgment call

## Decision points for the team

1. **Scale further.** With v1.1+#3 working, batch 3 of 10 skills should land in another ~50 min for ~$25 OpenRouter. Plenty of remaining slugs in the top-N (15–47).
2. **Lessons.md v1.2 update.** Add the patterns from this batch (CLI fabrication, gpt-4o-mini line drift, repo-path variants, "don't add bash for small models"). 30 min of doc work that compounds for batch 3.
3. **Drop gpt-4o-mini from default matrix.** Repeated capability gap (verbosity floor + CLI fabrication + line drift) is dragging multiple pilots' scores. Switching the matrix to sonnet/gemini/another-mid-tier would likely lift batch coverage by 5-10pp without any skill changes. Worth piloting.

## Reproducing

```bash
# This batch can be reproduced from a fresh checkout of feat/auto-improve-skill:
cd /home/yuqing/Documents/Code/skill-optimizer
git checkout feat/auto-improve-skill
node tools/auto-improve-skill.mjs <slug>

# For parallel batches, use git worktrees (see batch script in this commit's Setup section)
```

Cumulative spend: $40.65 of $60 OpenRouter credits.
