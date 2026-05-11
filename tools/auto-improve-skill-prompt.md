# Auto-improve a public agent skill

You are running an autonomous skill-improvement pilot. Do all five
phases below without asking questions mid-run. If you can't proceed,
exit cleanly to `analysis.md` (see "Stop conditions" at the end).

**Target slug:** `${SLUG}` — format `<owner>/<repo>/<skill-id>`.

**Reference run (the manual baseline you must reproduce on
web-design-guidelines):** `examples/workbench/web-design-guidelines/`.
If `examples/workbench/web-design-guidelines/` has source files
(`suite.yml`, `checks/`, etc.), read them as a layout reference.
If only `.results/` is present, the case sources are on a different
branch — proceed without it; the prompt is self-sufficient.

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
    - code-reviewer → use the case directory layout described in this
      prompt (the structure under Phase 2). If
      `examples/workbench/web-design-guidelines/` source files are
      available, you can use them as a concrete example, but do not
      require them.
    - document-producer → mirror `examples/workbench/pdf/`
    - tool-use / mcp-driver → mirror `examples/workbench/mcp/`
    - code-patterns → use the layout described in Phase 2 (no
      guaranteed local template for this type)
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
   sample, sharing `checks/_grader-utils.mjs`. Write the following
   file content to `examples/workbench/${SKILL_ID}/checks/_grader-utils.mjs`
   (verbatim):

   ```js
   // Shared grader logic for web-design-guidelines eval cases.
   //
   // Each finding is assumed to be one line in findings.txt that references
   // "<File>.tsx:<line>" (line numbers come from the agent — they're often
   // off by ±1-2 due to LLM line-counting). A violation is considered "found"
   // when at least one finding line:
   //   (a) references a line number within the violation's accepted range, AND
   //   (b) contains at least one of the violation's distinguishing keywords.
   //
   // This per-finding-line check prevents spurious cross-matches (e.g. the
   // keyword "label" from a different finding being credited to a paste rule).

   import { existsSync, readFileSync } from 'node:fs';

   export function gradeFindings({ findingsPath, file, expected }) {
     const failures = [];
     const found = new Set();

     if (!existsSync(findingsPath)) {
       failures.push('findings.txt was not created');
       return emitResult({ found, expected, failures });
     }

     const text = readFileSync(findingsPath, 'utf-8');
     const refRe = new RegExp(`${escapeRe(file)}\\s*[:#]\\s*(\\d+)`, 'i');
     const findingLines = text.split(/\r?\n/).filter((ln) => refRe.test(ln));

     for (const v of expected) {
       for (const line of findingLines) {
         const m = line.match(refRe);
         if (!m) continue;
         const lineNum = Number(m[1]);
         if (!v.lines.includes(lineNum)) continue;
         if (!v.keywords.some((re) => re.test(line))) continue;
         found.add(v.id);
         break;
       }
     }

     return emitResult({ found, expected, failures });
   }

   function emitResult({ found, expected, failures }) {
     const missing = expected.filter((v) => !found.has(v.id)).map((v) => v.id);
     const score = found.size / expected.length;
     const pass = found.size === expected.length;

     console.log(JSON.stringify({
       pass,
       score,
       evidence: [
         `${found.size}/${expected.length} expected violations identified`,
         ...[...found].map((id) => `+ ${id}`),
         ...missing.map((id) => `- missing: ${id}`),
         ...failures,
       ],
     }));
     return pass;
   }

   function escapeRe(s) {
     return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
   }

   // Helper: build an inclusive line range [start, start+1, ..., end].
   export function range(start, end) {
     const out = [];
     for (let i = start; i <= end; i++) out.push(i);
     return out;
   }

   // Helper: centered loose range — accepts the violation line ± tolerance.
   // Default tolerance ±8 handles LLM line-counting drift on multi-line elements.
   // PREFER this over `range(N-3, N+3)` — see lessons.md § G1.
   export function looseRange(centerLine, tolerance = 8) {
     return range(centerLine - tolerance, centerLine + tolerance);
   }

   // Helper: hyphen-tolerant keyword regex — `fuzzyKeyword('empty state')`
   // matches both "empty state" and "empty-state" and "emptystate".
   // PREFER this over hand-writing `/empty[-\s]+state/` — see lessons.md § G2.
   export function fuzzyKeyword(phrase) {
     const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
     const flexible = escaped.replace(/\s+/g, '[-\\s]*');
     return new RegExp(flexible, 'i');
   }

   // Helper: prefix-tolerant keyword — `tolerantKeyword('cover')` matches
   // "cover", "covering", "covered", "does not cover".
   // PREFER this over `/covering/i` — see lessons.md § G4.
   export function tolerantKeyword(stem) {
     const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
     return new RegExp(`\\b${escaped}\\w*`, 'i');
   }
   ```

5. Write `suite.yml` with the standard 3-model matrix:

   ```yaml
   models:
     - openrouter/anthropic/claude-sonnet-4.6
     - openrouter/openai/gpt-5
     - openrouter/google/gemini-2.5-pro
   env:
     - OPENROUTER_API_KEY
   timeoutSeconds: 600
   ```

6. Write a Cases-table README. If
   `examples/workbench/web-design-guidelines/README.md` is available,
   use it as a concrete example; otherwise use the following skeleton
   (fill in all `<…>` placeholders):

   ```markdown
   # <skill-name> eval

   Eval suite for
   [`<owner>/<repo>/<skill-id>`](https://github.com/<owner>/<repo>) —
   <one-line description from the upstream SKILL.md>.

   ## Cases

   ### `review-<sample-name>` — <rule family>

   Sample: `workspace/<SampleName>.<ext>`

   | Line | Violation | Rule |
   |---|---|---|
   | <N>  | <short violation description>             | <rule from upstream> |
   | <N>  | <short violation description>             | <rule from upstream> |

   (repeat for each seeded violation)

   ## Vendored snapshot

   The skill normally <fetches rules from where>. For deterministic eval
   we vendor a snapshot at `references/<skill-id>/<rules-filename>` and
   tweak `SKILL.md` to read it locally. Diff vs upstream is one line.

   ## Run

   \`\`\`bash
   export OPENROUTER_API_KEY=sk-or-...
   npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
   \`\`\`

   ## Models

   The suite runs a 3-provider mid-tier matrix:

   - `openrouter/anthropic/claude-sonnet-4.6`
   - `openrouter/openai/gpt-5`
   - `openrouter/google/gemini-2.5-pro`
   ```

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

**Before iterating, read `tools/auto-improve-skill-lessons.md`** — it has
recipes A-E for optimization patterns and G1-G6 for grader-reliability
patterns, each with empirical evidence from prior pilots. Match your
observed failure pattern to a recipe before designing a custom fix.

For each iteration `I` (1 then 2):

1. **Diagnose** — list the highest-miss-frequency rules. Use this prior
   (from `auto-improve-skill-lessons.md` § "The load-bearing prior"):

   > Rules about *absence* (a missing attribute, branch, or focus
   > replacement) are 5–10× harder than rules about *presence* (a
   > literal token in code). Examples and per-element checklists help
   > most for absence-type rules.

   Categorize each missed rule: visible-pattern / absence-of-attribute /
   state-machine / subjective.

   **Grader-vs-skill check (do this first):** look at actual
   `findings.txt` from failed trials. If models *did* identify the
   violations but the grader scored them wrong (line numbers off,
   keyword mismatch, format variant), the grader is the bug. Apply
   recipes G1-G6 from the lessons doc and re-run *without* counting
   this against the 2-iteration budget. Only proceed to skill
   modification once the grader is calibrated.

2. **Modify** — write a *minimal additive* edit using the recipes
   from `auto-improve-skill-lessons.md` § "Optimization patterns":
    - **Recipe A** (two-pass workflow) for code-reviewer skills with
      mixed presence/absence rules
    - **Recipe B** (verify-tool-installed nudge) for tool-use skills
      where models fall back to `curl`/`npm i`
    - **Recipe C** (per-element checklists) for skills with rules
      grouped by element type
    - **Recipe D** (BAD/GOOD examples) for anti-patterns where the
      bad pattern looks idiomatic
    - **Recipe E** (rationale + bug-story) for state-machine
      violations

   Edits must be additive: no rule deletions, no wording changes to
   existing rules. (See lessons doc § "Don't make breaking changes".)

   After the run completes, **append a one-line entry to
   `tools/auto-improve-skill-lessons.md` § "Run-record protocol"**
   documenting any new pattern your pilot surfaced. The doc is a
   living artifact; future pilots benefit from yours.

3. **Re-run** the same `run-suite --trials 3` command and compute new
   rule-coverage.

4. **Decide:**
    - `new - baseline ≥ +0.05` → stop, success.
    - `I == 2` → stop, uplift-too-small.
    - Else loop.

**Cost guard:** sum `metrics.cost.total` from each run's `result.json`.
If cumulative cost > $7.00, exit `status: budget-exceeded` immediately.
Leave a $2-3 buffer below the wrapper's `--max-budget-usd` so you have
room to finish "Always: write analysis.md AND commit" cleanly.

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

3. Write `proposed-upstream-changes/README.md`. If
   `examples/workbench/web-design-guidelines/proposed-upstream-changes/README.md`
   is available, use it as a style reference; otherwise write a short
   summary covering: what changed, why (evidence from eval results),
   and how to apply the diff upstream.

If status is anything else, skip Phase 5.

---

## Always: write `analysis.md` AND commit (do NOT push)

**This is a single atomic step. Both must happen, in this order, every time
the run ends — success, blocked, or out of budget.** Do not write
`analysis.md` and stop there. Do not commit without writing
`analysis.md` first.

Step A — write `examples/workbench/${SKILL_ID}/analysis.md`:

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

Step B — IMMEDIATELY after writing `analysis.md`, run these git commands
(do not pause, do not call any other tool first, just run them):

```bash
git checkout -b eval/auto-pilot/${SKILL_ID}
git add examples/workbench/${SKILL_ID}/suite.yml \
        examples/workbench/${SKILL_ID}/README.md \
        examples/workbench/${SKILL_ID}/analysis.md \
        examples/workbench/${SKILL_ID}/references/ \
        examples/workbench/${SKILL_ID}/workspace/ \
        examples/workbench/${SKILL_ID}/checks/
[ -d examples/workbench/${SKILL_ID}/proposed-upstream-changes ] \
  && git add examples/workbench/${SKILL_ID}/proposed-upstream-changes/
git commit -m "eval(auto-pilot): ${SKILL_ID} — status=<s>, coverage <baseline>→<final>"
```

Do **not** `git push`. The orchestrator reads `analysis.md` and reports.

If you find yourself running low on budget or context: **skip everything
else and do this section first.** A run with results-but-no-analysis-or-commit
is worse than a run with truncated results that committed cleanly.

---

## Stop conditions (summary)

| Condition | Action |
| --- | --- |
| Two iterations of Phase 4 done | Stop, write `analysis.md` |
| Cumulative cost > $7.00 (or 70% of wrapper budget) | Stop, `status: budget-exceeded` |
| Phase 1 can't classify | Stop, `status: blocked-by-skill-shape` |
| Phase 2 can't seed ≥3 violations | Stop, `status: blocked-by-skill-shape` |
| Baseline rule-coverage < 0.50 | Stop, `status: blocked-by-skill-shape` |
| Hard error not recovered in 1 retry | Stop, `status: blocked-by-error` |

You **never** ask the operator a question mid-run.
