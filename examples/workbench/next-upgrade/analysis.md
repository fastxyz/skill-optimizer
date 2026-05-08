---
skill: vercel-labs/next-skills/next-upgrade
status: uplift-too-small
classification: code-reviewer
baseline_rule_coverage: 0.83
final_rule_coverage: 0.76
modifications_tried: 2
total_cost_usd: 0.94
---

# Auto-pilot run for `vercel-labs/next-skills/next-upgrade`

- **Classification:** Initially classified as code-patterns (agent applies transforms), but
  workspace permission issues (files read-only in Docker) made code-modification graders
  unreliable. Reclassified as code-reviewer — agent reads files and writes findings.txt.

- **Seed:** 1 case (`review-starter-app`) with 6 violations across 4 files:
  `package.json` (v14 version), `app/page.tsx` (viewport in metadata + sync searchParams),
  `app/[id]/page.tsx` (sync params), `app/api/route.ts` (sync cookies + headers).

- **Grader calibration:** Initial graders had two problems: (1) violation COMMENTS in seed
  files contained the exact patterns the graders checked (all code-modification graders
  false-passed); (2) `pkg-version` grader used `looseRange(12)` but models write
  `package.json:1` or `:2` for file-level version issues (off by 10+ lines). Fixed by
  switching to `findings.txt` shape and using `range(1,25)` for package.json. Calibration
  runs not counted in iteration budget.

- **Baseline (after calibration):** 45/54 = 0.833 rule-coverage. Claude 3/3 perfect;
  Gemini 2/3 perfect (1 miss: route-headers); GPT-4o-mini 2/3 had 5/6 (missed
  page-searchparams). 1/3 GPT trial failed completely: model ran `npx next-upgrade`
  (fabricated CLI), got error, wrote error to findings.txt.

- **Iteration 1:** Added per-element grep checklist with bash commands to SKILL.md.
  Coverage DROPPED to 0.685 — bash commands caused GPT-4o-mini to try executing them
  rather than reading files, producing further confusion. Recipe for this skill type:
  do NOT include bash commands in skill instructions.

- **Iteration 2:** Replaced bash commands with pure BAD/GOOD code examples (Recipe D)
  for async params/searchParams. Coverage was 0.759 — still below baseline. GPT-4o-mini
  still inconsistent: 1 trial perfect, 2 trials near-zero (model tried CLI tools or
  wrote very sparse findings). Gemini also had 1 trial miss searchParams/params.

- **Root cause of uplift failure:** GPT-4o-mini (and occasionally Gemini) tries to run
  `npx next-upgrade` or similar CLI tools before reviewing files. When the CLI fails,
  the model either gives up or writes the error as findings. Neither skill modification
  addressed this CLI-fixation behavior reliably. The BAD/GOOD examples helped some
  Gemini trials but couldn't overcome GPT's architectural limitation on tool-use vs
  code-review framing.
