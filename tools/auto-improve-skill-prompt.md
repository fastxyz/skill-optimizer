# Auto-improve a public agent skill

You are running an autonomous skill-improvement pilot. Do all five
phases below without asking questions mid-run. If you can't proceed,
exit cleanly to `analysis.md` (see "Stop conditions" at the end).

**Target slug:** `${SLUG}` — format `<owner>/<repo>/<skill-id>`.

**Reference run (the manual baseline you must reproduce on
web-design-guidelines):** `examples/workbench/web-design-guidelines/`.
Read it before starting if you've never seen this layout.

---

## Setup

1. Parse `${SLUG}` into `OWNER`, `REPO`, `SKILL_ID`. The case dir is
   `examples/workbench/${SKILL_ID}/` — skill-id leaf only. The wrapper
   has already created the empty dir for you.
2. Verify `OPENROUTER_API_KEY` is set; if not, exit with `analysis.md
   status: blocked-by-error` and message "OPENROUTER_API_KEY not set".

---

## Phase 1 — Discover

1. Fetch the upstream `SKILL.md` via WebFetch from
   `https://raw.githubusercontent.com/<OWNER>/<REPO>/main/skills/<SKILL_ID>/SKILL.md`
   (try `master` if `main` 404s; some repos use `<skill-id>/SKILL.md`
   at the repo root — fall back to that if needed).
2. If the SKILL.md references one or more rules-doc URLs (look for
   WebFetch instructions or raw GitHub URLs), fetch each.
3. Read the SKILL.md and any rules docs. Classify the skill type as
   exactly one of:
    - **document-producer** — produces structured output files (PDF,
      docx, xlsx, JSON). Eval shape: graders inspect the produced file.
    - **code-reviewer** — reads code and outputs findings. Eval shape:
      seed code with known violations, grade on found findings.
    - **tool-use / mcp-driver** — drives external tools or APIs. Eval
      shape: graders inspect tool-call traces.
    - **code-patterns** — prescribes code conventions / scaffolds. Eval
      shape: ask agent to apply patterns to a starter, grade resulting
      code.
    - **other / unclear** — exit `analysis.md status: blocked-by-skill-shape`.
4. Pick the closest matching template under `examples/workbench/`:
    - code-reviewer → mirror `examples/workbench/web-design-guidelines/`
    - document-producer → mirror `examples/workbench/pdf/`
    - tool-use / mcp-driver → mirror `examples/workbench/mcp/`
    - code-patterns → mirror `examples/workbench/find-skills/`
5. Persist the classification to `examples/workbench/${SKILL_ID}/analysis.md`
   immediately (frontmatter only, status pending) so a partial run
   leaves a trail.

**Self-checkpoint:** if you can't classify with high confidence, exit
blocked. Do not invent a new shape.

---

## Phase 2 — Build suite

1. Write `examples/workbench/${SKILL_ID}/references/${SKILL_ID}/SKILL.md`
   — a copy of the upstream skill, with one minimal tweak: change any
   remote `WebFetch` calls in the skill to read from a local
   `command.md` (or equivalent) bundled in the same `references/`
   directory. This is for eval determinism.
2. If there's a remote rules doc, vendor it as
   `references/${SKILL_ID}/<rules-filename>`.
3. Seed sample input files in `workspace/`: 1–3 files matching the
   skill's shape, 4–6 known violations per file, each violation on a
   distinct line range mapped to one upstream rule.
4. Write graders in `checks/`: one `grade-<sample>-findings.mjs` per
   sample, sharing `checks/_grader-utils.mjs` (copy verbatim from
   `examples/workbench/web-design-guidelines/checks/_grader-utils.mjs`).
5. Write `suite.yml` with the standard 3-model matrix:

   ```yaml
   models:
     - openrouter/anthropic/claude-sonnet-4.6
     - openrouter/openai/gpt-5-mini
     - openrouter/google/gemini-2.5-pro
   env:
     - OPENROUTER_API_KEY
   timeoutSeconds: 600
   ```

6. Write a Cases-table README modeled on
   `examples/workbench/web-design-guidelines/README.md`.

**Self-checkpoint:** if you can't seed ≥3 reasonable violations, exit
`status: blocked-by-skill-shape`.

---

## Phase 3 — Baseline

1. From the case directory, run:

   ```bash
   set -a; . ./.env; set +a
   npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3 \
     2>&1 | tee /tmp/${SKILL_ID}-baseline.log
   ```

2. Aggregate per-rule miss frequency, per-model strict-pass rate, and
   overall **rule-coverage rate** = (sum identified) / (sum expected)
   across all trials.
3. If baseline rule-coverage < 0.50, exit `status: blocked-by-skill-shape`.
4. If baseline rule-coverage ≥ 0.95, exit `status: success` with
   `final_rule_coverage = baseline` (skill needs no changes on these
   cases).
5. Persist baseline numbers in `analysis.md`.

---

## Phase 4 — Iterate (max 2 loops)

For each iteration `I` (1 then 2):

1. **Diagnose** — list the highest-miss-frequency rules. Use this prior
   from the manual web-design-guidelines run:

   > Rules about *absence* (a missing attribute, branch, or focus
   > replacement) are 5–10× harder than rules about *presence* (a
   > literal token in code). Examples and per-element checklists help
   > most for absence-type rules.

   Categorize each missed rule: visible-pattern / absence-of-attribute /
   state-machine / subjective.

2. **Modify** — write a *minimal additive* edit:
    - Add a per-element checklist entry to the rules doc.
    - Add a BAD/GOOD code example for a missed rule.
    - Add a two-pass-workflow nudge to the SKILL.md.
    - Tighten ambiguous rule wording.

   Edits must be additive: no rule deletions, no wording changes to
   existing rules.

3. **Re-run** the same `run-suite --trials 3` command and compute new
   rule-coverage.

4. **Decide:**
    - `new - baseline ≥ +0.05` → stop, success.
    - `I == 2` → stop, uplift-too-small.
    - Else loop.

**Cost guard:** sum `metrics.cost.total` from each run's `result.json`.
If cumulative cost > $3.00, exit `status: budget-exceeded` immediately.

---

## Phase 5 — Package

If final status is `success`:

1. Create `proposed-upstream-changes/` with:

   ```text
   proposed-upstream-changes/
     README.md
     <owner-repo>/before-SKILL.md
     <owner-repo>/after-SKILL.md
     <rules-repo>/before-<rules>.md   # if separate rules doc
     <rules-repo>/after-<rules>.md
   ```

2. The `after-SKILL.md` must contain the proposed upstream change but
   NOT the local-path tweak from Phase 2 (revert that line). Diff vs
   upstream should be purely additive.

3. Write `proposed-upstream-changes/README.md` modeled on
   `examples/workbench/web-design-guidelines/proposed-upstream-changes/README.md`.

If status is anything else, skip Phase 5.

---

## Always: write `analysis.md`

Final write to `examples/workbench/${SKILL_ID}/analysis.md`:

```markdown
---
skill: ${SLUG}
status: success | uplift-too-small | blocked-by-skill-shape |
  budget-exceeded | blocked-by-error
classification: code-reviewer | document-producer | tool-use | code-patterns
baseline_rule_coverage: 0.NN
final_rule_coverage: 0.NN
modifications_tried: N
total_cost_usd: NN.NN
---

# Auto-pilot run for `${SLUG}`

3–6 short bullets covering: classification rationale, what you seeded,
baseline failure pattern, modification tried + reason, uplift result,
any judgment calls.
```

---

## Always: commit (do NOT push)

```bash
git checkout -b eval/auto-pilot/${SKILL_ID}
git add examples/workbench/${SKILL_ID}/
git commit -m "eval(auto-pilot): ${SKILL_ID} — status=<s>, coverage <baseline>→<final>"
```

Do **not** `git push`. The orchestrator reads `analysis.md` and reports.

---

## Stop conditions (summary)

| Condition | Action |
| --- | --- |
| Two iterations of Phase 4 done | Stop, write `analysis.md` |
| Cumulative cost > $3.00 | Stop, `status: budget-exceeded` |
| Phase 1 can't classify | Stop, `status: blocked-by-skill-shape` |
| Phase 2 can't seed ≥3 violations | Stop, `status: blocked-by-skill-shape` |
| Baseline rule-coverage < 0.50 | Stop, `status: blocked-by-skill-shape` |
| Hard error not recovered in 1 retry | Stop, `status: blocked-by-error` |

You **never** ask the operator a question mid-run.
