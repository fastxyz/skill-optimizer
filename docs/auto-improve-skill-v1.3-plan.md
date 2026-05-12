# auto-improve-orchestrator v1.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1.2.1 wrapper-spawned `claude -p` autonomous pilot with a Claude Code skill (`auto-improve-orchestrator`) that an operator's CC session invokes via the Agent tool. Each orchestrator subagent owns one skill end-to-end and dispatches its own sub-subagents.

**Architecture:** Skill-optimizer stays lean (eval engine only). Orchestration lives in `skills/auto-improve-orchestrator/` as a Claude Code skill containing 4 prompt templates (orchestrator + 3 sub-subagents) plus reference material (workflow doc, lessons, per-skill context library). Operator dispatches the orchestrator via Agent tool with `isolation: "worktree"` for parallelism.

**Tech Stack:** Markdown (skill prompts), bash (validation scripts), gray-matter (frontmatter parsing), Claude Code Agent tool.

**Working dir:** `.claude/worktrees/v1.3-impl/` (branch `feat/auto-improve-skill-v1.3`).

**Spec:** `docs/auto-improve-skill-v1.3-spec.md` (already committed at `5289092`).

---

## File Structure

After this plan executes:

```text
skills/auto-improve-orchestrator/                    # NEW skill
  SKILL.md                                           # discovery + invocation guide
  prompts/
    orchestrator.md                                  # main subagent prompt template
    research-upstream.md                             # sub-subagent: Phase 0 research
    eval-iterate.md                                  # sub-subagent: Phase 3.5 eval iteration
    skill-iterate.md                                 # sub-subagent: Phase 4 skill iteration
  references/
    workflow.md                                      # human-readable orchestrator algorithm
    lessons.md                                       # MOVED from tools/
    contexts/                                        # MOVED from tools/
      vercel-web-interface-guidelines.md
      vercel-agent-browser.md
      supabase-postgres-best-practices.md

tools/                                               # DELETIONS
  auto-improve-skill.mjs                             # DELETED
  auto-improve-skill-prompt.md                       # DELETED
  auto-improve-skill-lessons.md                      # MOVED OUT (see above)
  auto-improve-contexts/                             # MOVED OUT (see above)

CLAUDE.md                                            # UPDATED to point at new skill
```

Each file's responsibility:

- **SKILL.md** — frontmatter (name, description) + ~1 page of "how the operator invokes this" guidance. Always loaded by Claude Code when the skill is referenced.
- **prompts/orchestrator.md** — self-contained prompt template the operator dispatches via the Agent tool. Embeds the full algorithm. Reads context, dispatches sub-subagents, calls `run-suite`, packages, commits.
- **prompts/research-upstream.md** — self-contained sub-subagent prompt. Researches one upstream repo. Writes a context file. Returns short report.
- **prompts/eval-iterate.md** — self-contained sub-subagent prompt. Adds harder cases / simplifies cases / fixes grader bugs. Runs smoke check. Commits.
- **prompts/skill-iterate.md** — self-contained sub-subagent prompt. Applies one recipe (A–E) additively to the target file. Re-runs suite. Commits if uplift.
- **references/workflow.md** — human-readable description of the algorithm (mirror of what's in `prompts/orchestrator.md`, but for humans, not AI).
- **references/lessons.md** — recipes A–E + grader patterns G1–G6. Read by `prompts/skill-iterate.md` and `prompts/eval-iterate.md`.
- **references/contexts/** — per-skill upstream-research output. Read by `prompts/skill-iterate.md`. Written by `prompts/research-upstream.md`.

---

## Task 1: Move `lessons.md` into the new skill

**Files:**

- Move: `tools/auto-improve-skill-lessons.md` → `skills/auto-improve-orchestrator/references/lessons.md`

- [ ] **Step 1: Create destination dirs**

```bash
mkdir -p skills/auto-improve-orchestrator/references
```

- [ ] **Step 2: `git mv` the lessons doc**

```bash
git mv tools/auto-improve-skill-lessons.md \
       skills/auto-improve-orchestrator/references/lessons.md
```

- [ ] **Step 3: Verify the move + content unchanged**

```bash
test -f skills/auto-improve-orchestrator/references/lessons.md
test ! -f tools/auto-improve-skill-lessons.md
head -3 skills/auto-improve-orchestrator/references/lessons.md
```

Expected: file exists at new path, gone from old path, content starts with the heading from the original lessons doc.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(orchestrator): move lessons.md into new skill"
```

---

## Task 2: Move `contexts/` into the new skill

**Files:**

- Move: `tools/auto-improve-contexts/` → `skills/auto-improve-orchestrator/references/contexts/`

- [ ] **Step 1: `git mv` the entire contexts directory**

```bash
git mv tools/auto-improve-contexts \
       skills/auto-improve-orchestrator/references/contexts
```

- [ ] **Step 2: Verify the move**

```bash
ls skills/auto-improve-orchestrator/references/contexts/
test ! -d tools/auto-improve-contexts
```

Expected: 3 files at new path (`vercel-web-interface-guidelines.md`, `vercel-agent-browser.md`, `supabase-postgres-best-practices.md`), nothing at old path.

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(orchestrator): move contexts/ into new skill"
```

---

## Task 3: Delete v1.2.1 wrapper files

**Files:**

- Delete: `tools/auto-improve-skill.mjs`
- Delete: `tools/auto-improve-skill-prompt.md`

- [ ] **Step 1: Confirm files exist (sanity check before deletion)**

```bash
ls tools/auto-improve-skill.mjs tools/auto-improve-skill-prompt.md
```

Expected: both files listed.

- [ ] **Step 2: `git rm` both**

```bash
git rm tools/auto-improve-skill.mjs tools/auto-improve-skill-prompt.md
```

- [ ] **Step 3: Verify removal + tools/ dir state**

```bash
test ! -f tools/auto-improve-skill.mjs
test ! -f tools/auto-improve-skill-prompt.md
ls tools/
```

Expected: both files gone. `tools/` may now contain other unrelated files (don't touch them).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(orchestrator): remove v1.2.1 wrapper + embedded prompt

The wrapper-spawned claude -p autonomous pilot is replaced by the new
auto-improve-orchestrator Claude Code skill (built in subsequent commits).
Operator now dispatches the orchestrator subagent via the Agent tool
instead of running a Node wrapper."
```

---

## Task 4: Update CLAUDE.md to remove old wrapper references

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Read the current CLAUDE.md to find references to the old wrapper**

```bash
grep -n "auto-improve" CLAUDE.md
```

Expected: zero matches in the current file (the wrapper wasn't documented in CLAUDE.md as of the v1.2.1 work). If matches exist, note line numbers for editing in Step 2.

- [ ] **Step 2: Add a brief pointer to the new orchestrator skill in CLAUDE.md's "Important Files" section**

Find the "## Important Files" section in `CLAUDE.md`. After the existing `skills/skill-optimizer/SKILL.md` bullet, add a new bullet:

```markdown
- `skills/auto-improve-orchestrator/SKILL.md`: Claude Code skill that orchestrates auto-improvement of public agent skills. Operator dispatches the orchestrator subagent (via Agent tool with `isolation: "worktree"`) which manages research / eval-iteration / skill-iteration end-to-end for one skill. See `docs/auto-improve-skill-v1.3-spec.md` for the architecture.
```

- [ ] **Step 3: Verify the edit landed**

```bash
grep -A 1 "auto-improve-orchestrator/SKILL.md" CLAUDE.md
```

Expected: the new bullet appears.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE.md): point at new auto-improve-orchestrator skill"
```

---

## Task 5: Create `skills/auto-improve-orchestrator/SKILL.md`

**Files:**

- Create: `skills/auto-improve-orchestrator/SKILL.md`

- [ ] **Step 1: Write the SKILL.md with frontmatter + invocation guide**

Create `skills/auto-improve-orchestrator/SKILL.md` with this exact content:

````markdown
---
name: auto-improve-orchestrator
description: Use when an operator wants to auto-improve a public agent skill — research upstream conventions, iterate the eval if it's saturated/floored, iterate the skill itself, and package proposed upstream changes. Dispatch the orchestrator subagent via the Agent tool with isolation:"worktree" for one or more skills (parallel-safe).
---

# auto-improve-orchestrator

This skill manages the end-to-end auto-improvement workflow for one public
agent skill: research the upstream repo's conventions, measure baseline
on an existing eval workbench, iterate the eval if it's saturated/floored,
iterate the skill content with measured uplift, and package the proposed
upstream change.

The skill-optimizer stays lean — it ships the eval engine (`run-suite`,
`run-case`, graders, Docker harness). This orchestrator skill contains
the *workflow* logic that uses the engine.

## When to use

- Operator says "auto-improve <slug>" or "improve <skill-id>"
- Operator says "run auto-improve on these N skills" (batch)
- Operator wants to extend the orchestration logic itself

## How to invoke

The operator's CC session dispatches the orchestrator subagent via the
Agent tool. For a single skill:

```
Agent({
  description: "auto-improve <skill-id>",
  subagent_type: "general-purpose",
  isolation: "worktree",
  run_in_background: true,
  prompt: <load skills/auto-improve-orchestrator/prompts/orchestrator.md,
           substitute ${SLUG}>
})
```

For a batch of N skills, dispatch N Agent calls in a single message —
they run in parallel, each in its own worktree.

The orchestrator subagent:

1. Reads/dispatches research subagent (Phase 0) → produces context file
2. Measures baseline via `run-suite` (Phase 3) — resume-aware
3. Iterates eval via dispatch (Phase 3.5) until baseline ∈ (0.50, 0.95)
4. Iterates skill via dispatch (Phase 4) until uplift ≥ +0.05 or 2 iters
5. Packages `proposed-upstream-changes/` + `analysis.md`, commits to
   `eval/auto-pilot/<skill-id>` branch, returns summary

## Sub-subagent prompts

- `prompts/research-upstream.md` — Phase 0 research subagent template
- `prompts/eval-iterate.md` — Phase 3.5 eval-iteration subagent template
- `prompts/skill-iterate.md` — Phase 4 skill-iteration subagent template

## Reference material

- `references/workflow.md` — human-readable description of the algorithm
- `references/lessons.md` — recipes A-E + grader patterns G1-G6 (the
  skill-iterate subagent reads this)
- `references/contexts/` — per-skill upstream-research outputs (the
  skill-iterate subagent reads these; the research subagent writes them)

## Pre-conditions

- The skill's eval workbench must already exist at
  `examples/workbench/<skill-id>/`. Building initial workbenches is
  out of scope for v1.3 — operator builds them manually.
- `OPENROUTER_API_KEY` must be set in `.env` at the repo root.
- Worktree must be created via `isolation: "worktree"` for parallelism
  + isolation. Do NOT run the orchestrator subagent on the main
  worktree.

## Out of scope (deferred)

- Initial workbench construction (v1.4)
- Autonomous CI mode (no operator session)
- Automatic PR submission (operator-driven)

See `docs/auto-improve-skill-v1.3-spec.md` for the full design.
````

- [ ] **Step 2: Verify frontmatter parses**

```bash
node -e "
const matter = require('gray-matter');
const fs = require('fs');
const content = fs.readFileSync('skills/auto-improve-orchestrator/SKILL.md', 'utf-8');
const parsed = matter(content);
console.log('name:', parsed.data.name);
console.log('description length:', parsed.data.description.length);
if (!parsed.data.name || !parsed.data.description) {
  console.error('MISSING required frontmatter fields');
  process.exit(1);
}
console.log('OK');
"
```

Expected output:

```text
name: auto-improve-orchestrator
description length: 33[0-9]
OK
```

(`gray-matter` is already a project dep — it's used by the workbench loader.)

- [ ] **Step 3: Commit**

```bash
git add skills/auto-improve-orchestrator/SKILL.md
git commit -m "feat(orchestrator): create SKILL.md with invocation guide"
```

---

## Task 6: Write `references/workflow.md`

**Files:**

- Create: `skills/auto-improve-orchestrator/references/workflow.md`

This is the human-readable mirror of the orchestrator algorithm. The orchestrator subagent embeds the same logic in its prompt template (Task 10), but humans read this file to understand what the orchestrator does.

- [ ] **Step 1: Write the workflow doc**

Create `skills/auto-improve-orchestrator/references/workflow.md` with this exact content:

````markdown
# auto-improve-orchestrator workflow

This is a human-readable description of the algorithm the orchestrator
subagent follows. The same logic is embedded in
`../prompts/orchestrator.md` (the AI-targeted prompt template).

## Inputs

- `${SLUG}`: `<owner>/<repo>/<skill-id>` (e.g. `supabase/agent-skills/supabase-postgres-best-practices`)
- `${REFRESH_CONTEXT}`: optional flag, default false. If true, force re-research even if cached context file exists.

## Setup

1. Parse `SLUG` into `OWNER`, `REPO`, `SKILL_ID`.
2. Verify the orchestrator is running in a git worktree (the `isolation: "worktree"` requirement).
3. Verify the skill's workbench exists at `examples/workbench/<SKILL_ID>/`. If not, exit `blocked-by-missing-workbench`.
4. Define paths:
   - `WORKBENCH = examples/workbench/<SKILL_ID>/`
   - `CONTEXT_FILE = skills/auto-improve-orchestrator/references/contexts/<OWNER>-<SKILL_ID>.md`
5. Verify `OPENROUTER_API_KEY` is set (source `.env` from the main repo if needed).

## Phase 0: Research

If `CONTEXT_FILE` exists AND not `REFRESH_CONTEXT`:

- Read `CONTEXT_FILE`. Use it.

Else:

- Dispatch sub-subagent `prompts/research-upstream.md` with input `${SLUG}`.
- Wait for completion. Verify `CONTEXT_FILE` was written.
- Read it.

Extract from `CONTEXT_FILE`:

- `target_file` (the file the skill-iterate subagent will edit)
- `packaging_dir` (where `proposed-upstream-changes/` subdir should go)
- `additive_only_constraint` and any other hard constraints

## Phase 3: Baseline measurement

Look for the most recent `.results/<ts>/suite-result.json` in `WORKBENCH`.

If found AND its case set matches current `suite.yml`:

- Read it (resume — skip baseline run).

Else:

- Run from `WORKBENCH`: `npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3`
- Wait for completion (long-running, ~30-60 min depending on suite size).
- Read the new `suite-result.json`.

Compute `per_case_min` from `suite-result.json`:

- Group `results[]` by `caseName`.
- Per-case mean = average of trial scores for that case (across all models and trials).
- `per_case_min = min(per-case means across all cases)`.

## Phase 3.5: Eval-readiness loop

```text
EVAL_ITER = 0
While per_case_min OUTSIDE (0.50, 0.95) AND EVAL_ITER < 3:
  If per_case_min >= 0.95:
    DIRECTION = "add-harder"
  Else if per_case_min < 0.50:
    Run grader-vs-skill check:
      - Read failed trials' findings.txt
      - If models DID find the violations but grader scored wrong:
        DIRECTION = "fix-graders"
      - Else: DIRECTION = "simplify"

  Dispatch sub-subagent prompts/eval-iterate.md with:
    SKILL_ID, latest suite-result path, DIRECTION
  Wait for completion. Verify it committed workbench changes.

  Re-run baseline measurement (Phase 3, no resume — case set changed).
  EVAL_ITER += 1
```

Exit conditions:

- Still `per_case_min >= 0.95` after 3 iterations: exit `skill-genuinely-good`.
- Still `per_case_min < 0.50` after 3 iterations: exit `blocked-by-skill-shape`.

## Phase 4: Skill iteration

```text
baseline_per_case_min = per_case_min
ITER = 0

While ITER < 2:
  ITER += 1
  Dispatch sub-subagent prompts/skill-iterate.md with:
    SKILL_ID, latest suite-result path, target_file from context, ITER
  Wait for completion. Verify it committed changes.

  Read the new suite-result.json from the latest .results/<ts>/.
  new_per_case_min = recompute

  If new_per_case_min - baseline_per_case_min >= 0.05:
    Success — break.
```

Exit if no iteration cleared +0.05: status `uplift-too-small`. Still package the changes (they're additive — the operator can decide whether to ship).

## Phase 5: Package

Compose `WORKBENCH/proposed-upstream-changes/<packaging_dir>/`:

- `before-<target_file_basename>` — original target file (read from upstream's vendored copy, before any v1.3 modifications)
- `after-<target_file_basename>` — current target file content
- `README.md` — description, evidence (per-case breakdown table), how to apply

Write `WORKBENCH/analysis.md`:

```markdown
---
skill: <SLUG>
status: success | uplift-too-small | skill-genuinely-good | blocked-by-skill-shape | blocked-by-error
classification: <from CONTEXT_FILE>
baseline_per_case_min: 0.NN
final_per_case_min: 0.NN
iterations: eval=N, skill=N
total_cost_usd: NN.NN
---

# Auto-pilot run for <SLUG>

[3-6 short bullets covering: classification, what the eval surfaced,
what was changed and why, uplift result, any judgment calls.]
```

## Phase 6: Commit

```bash
git checkout -b eval/auto-pilot/<SKILL_ID>
git add WORKBENCH/analysis.md
git add WORKBENCH/proposed-upstream-changes/  # if exists
git add WORKBENCH/.results/<latest>/suite-result.json
# Skill modifications were committed by the skill-iterate subagent already
git commit -m "eval(auto-pilot): <SKILL_ID> — status=<S>, baseline=<B>→<F>"
```

DO NOT `git push`.

## Cost tracking

The orchestrator tracks cumulative `metrics.cost.total` from each `run-suite` invocation.

- Soft warning at $5: print to stderr but continue.
- Hard stop at $10: write `analysis.md` immediately with `status: budget-exceeded` and exit.

Sub-subagent dispatches (research / eval-iterate / skill-iterate) use the operator's Claude Code session under their plan and have no marginal cost.

## Return summary

The orchestrator returns to the caller (operator's CC session):

- `branch`: `eval/auto-pilot/<SKILL_ID>`
- `commit`: `<SHA>`
- `status`: one of the exit statuses above
- `baseline_per_case_min` → `final_per_case_min`
- per-case breakdown table
- `proposed-upstream-changes/` path (if status is `success` or `uplift-too-small`)

## Rules of engagement

- NEVER ask the operator a question mid-run. Decide based on the algorithm.
- NEVER `git push` to a remote.
- NEVER modify files outside `WORKBENCH` or `references/contexts/` (the research subagent writes context files; the orchestrator never modifies them directly).
- Always commit before exiting (atomic with `analysis.md` write — write analysis, then commit, then exit).
- Cost guard: track cumulative cost from each `run-suite`'s `metrics.cost.total`.
````

- [ ] **Step 2: Verify the workflow doc is well-formed markdown**

```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('skills/auto-improve-orchestrator/references/workflow.md', 'utf-8');
const headings = content.match(/^##? .*/gm) || [];
console.log('heading count:', headings.length);
console.log('first 3:', headings.slice(0, 3));
if (headings.length < 8) {
  console.error('Expected at least 8 headings (one per phase + sub-sections)');
  process.exit(1);
}
console.log('OK');
"
```

Expected: at least 8 headings (phases + sub-sections), `OK` printed.

- [ ] **Step 3: Commit**

```bash
git add skills/auto-improve-orchestrator/references/workflow.md
git commit -m "feat(orchestrator): add workflow.md (human-readable algorithm)"
```

---

## Task 7: Write `prompts/research-upstream.md`

**Files:**

- Create: `skills/auto-improve-orchestrator/prompts/research-upstream.md`

- [ ] **Step 1: Create prompts dir**

```bash
mkdir -p skills/auto-improve-orchestrator/prompts
```

- [ ] **Step 2: Write the research subagent prompt template**

Create `skills/auto-improve-orchestrator/prompts/research-upstream.md` with this exact content:

````markdown
# Sub-subagent prompt: research upstream conventions

You are a research subagent dispatched to study a single upstream
public-skill repo's contribution conventions. You produce a context
file that downstream subagents will use to ensure their proposed
changes fit the upstream's expectations and merge cleanly.

## Inputs (templated)

- `${SLUG}` — `<owner>/<repo>/<skill-id>`. Example: `supabase/agent-skills/supabase-postgres-best-practices`.
- `${OUTPUT_PATH}` — where to write the context file. Default: `skills/auto-improve-orchestrator/references/contexts/<owner>-<skill-id>.md`.

## Your job

Read the target upstream repo's contribution conventions, frontmatter
spec, prefix taxonomy, and merged-PR shape patterns. Write a verbatim-
pastable context block to `${OUTPUT_PATH}` that the orchestrator and
skill-iterate subagents will consume.

## Method

Use `gh` CLI heavily (PR list/view, file API, search, repo-files API).
Use `WebFetch` sparingly for any README or external docs (e.g.,
`docs.<vendor>.com` if a clear lead suggests external consumption).
Don't clone the repo — use the GitHub API and raw URLs.

## Questions to answer

For each, explain in your own words; cite source files/PRs you read.

1. **On-disk inventory.** What's at `skills/<skill-id>/`? List
   `SKILL.md` plus every reference file under `references/`. For each
   reference: filename, frontmatter values, content type. The
   downstream subagents need a complete inventory to pick a non-
   colliding `{prefix}` matching the existing taxonomy.

2. **Frontmatter spec — exact schema.** Read the actual sanity-test
   source code (e.g., under `tests/` or `scripts/`) and document the
   EXACT required fields, allowed values for each enum field, and any
   other validators. Don't assume from prior research — verify.

3. **Reference file content conventions.** Pick 3 representative
   existing references and document their structure: section headers,
   code-block language tags, narrative-vs-list ratio, length range.

4. **Concept-fit assessment.** If a downstream `target_file` doesn't
   match the existing template (e.g., a meta-workflow file when all
   existing references are single-rule transformations), flag this as
   "shape-novel" with a rejection-risk estimate (LOW / MEDIUM / HIGH).

5. **Prefix taxonomy.** What `{prefix}-` values exist? Are they locked
   to a section taxonomy file (e.g., `_sections.md`)? Adding a new
   prefix may require modifying that file (which violates additive-
   only).

6. **Recent merged additive PRs.** Look at the last 5–10 merged PRs
   that added/modified content for THIS skill (or similar skills if
   this one has few). Document: typical file count, body shape,
   commit-message convention, time-to-merge, maintainer.

7. **Closed-without-merge PRs.** Look at the last 3–5 closed PRs
   that DIDN'T merge. What was the rejection signal? "Discussion-
   first gate violated", "shape-novel", "duplicates X", etc.

8. **Release Please / version bumping.** Is `metadata.version` in
   `SKILL.md` auto-managed by Release Please? If yes, downstream
   subagents must NOT manually bump it.

9. **Architecture intent for SKILL.md vs `references/` split.** Why
   split? Token economy? Per-rule contributions? Independent
   versioning? The downstream skill-iterate subagent needs to know
   whether to add new rules to `SKILL.md` or as a new `references/`
   file.

10. **Other consumers.** Is this skill referenced/installed/fetched by
    anything outside the upstream repo? Install scripts, blog posts,
    docs sites, downstream forks. Affects how additive-only the
    proposed changes must be.

11. **License + CLA.** What license? Any CLA bot? Affects whether
    contributors need extra setup.

12. **CI gates.** What does CI check? Frontmatter validators, format
    checkers, test runners?

## Output format

Write `${OUTPUT_PATH}` with this structure:

```markdown
# Auto-pilot context: <upstream-org>/<upstream-repo> — <skill-id>

## Repository facts

- Repo: <owner/repo>
- License: <type>, CLA <yes/no>
- Maintainers: <list>
- Merge style: <squash/rebase/merge>, conventional commits enforced by <Release Please / nothing>
- CI: <what runs>
- Discovery index / downstream sync: <if any>

## Hard constraints (additive-only PR)

- Add EXACTLY ONE new file at <path>
- DO NOT modify <list of files maintainer-owned>
- Use only existing prefixes: <list>
- DO NOT bump version (<who owns it>)
- Other don'ts: <list>

## Frontmatter spec

```yaml
---
<field>: <type/example>
...
---
```

## Content shape template

[copy-and-fill template matching upstream's existing references]

## Optimization target file

**Edit:** `<repo-relative path>`
**Do NOT edit:** `<other paths>`

## Architecture intent

[2-3 sentences explaining the upstream's design rationale]

## Risk profile

- HIGH/MEDIUM/LOW for <reason>

## Pre-submit checklist

1. <item>
2. <item>
...

## Useful URLs

- <links to source-of-truth files in the upstream repo>
```

## Commit

After writing `${OUTPUT_PATH}`, commit on the current branch:

```bash
git add ${OUTPUT_PATH}
git commit -m "docs(contexts): research upstream for ${SLUG}"
```

DO NOT push.

## Return report

Return to caller (orchestrator subagent) under 400 words:

- On-disk inventory summary (file count + frontmatter overview)
- Frontmatter spec (the exact required fields)
- Content conventions (1 example structure)
- Concept fit (if applicable)
- Prefix recommendation
- Recent PR shape pattern
- Net rejection risk: LOW / MEDIUM / HIGH + rationale
- The verbatim context block path

If a question genuinely can't be answered from public signals, say so
explicitly. Don't speculate.
````

- [ ] **Step 3: Verify the prompt has the expected templated variables**

```bash
grep -E '\$\{(SLUG|OUTPUT_PATH)\}' \
  skills/auto-improve-orchestrator/prompts/research-upstream.md \
  | wc -l
```

Expected: at least 4 occurrences (each var used at least twice).

- [ ] **Step 4: Commit**

```bash
git add skills/auto-improve-orchestrator/prompts/research-upstream.md
git commit -m "feat(orchestrator): add research-upstream sub-subagent prompt"
```

---

## Task 8: Write `prompts/eval-iterate.md`

**Files:**

- Create: `skills/auto-improve-orchestrator/prompts/eval-iterate.md`

- [ ] **Step 1: Write the eval-iterate subagent prompt template**

Create `skills/auto-improve-orchestrator/prompts/eval-iterate.md` with this exact content:

````markdown
# Sub-subagent prompt: iterate the eval workbench

You are a sub-subagent dispatched to make a focused change to one
skill's eval workbench so that downstream skill-iteration has real
headroom (baseline lands in `(0.50, 0.95)`).

## Inputs (templated)

- `${SKILL_ID}` — leaf id, e.g. `supabase-postgres-best-practices`.
- `${WORKBENCH_DIR}` — `examples/workbench/${SKILL_ID}/`.
- `${SUITE_RESULT_PATH}` — path to the most recent `.results/<ts>/suite-result.json`.
- `${DIRECTION}` — one of:
  - `add-harder` — add 2-3 new cases that surface absence-type
    violations the existing graders don't catch
  - `simplify` — remove ambiguous violations from existing workspace
    files; tighten task descriptions
  - `fix-graders` — apply recipes G1-G6 from `references/lessons.md`
    (line-tolerance, fuzzy keywords, etc.)
- `${LESSONS_PATH}` — `skills/auto-improve-orchestrator/references/lessons.md`. Read this for grader-pattern recipes G1-G6 (relevant for `fix-graders`) and the load-bearing prior on absence-type rules (relevant for `add-harder`).

## What to do (per direction)

### `add-harder`

1. Read the current `${SUITE_RESULT_PATH}` to identify which rules are
   ALREADY at ceiling (per-case score == 1.00). New cases should
   target absence-type variants of these rules that the existing
   workspace files don't exercise.
2. Read `${LESSONS_PATH}` § "The load-bearing prior" — absence-type
   rules are 5-10× harder than presence-type. New cases should force
   enumeration (multi-statement files, mixed correct + incorrect
   patterns, invariants that span statements).
3. Write 2-3 NEW workspace files under `${WORKBENCH_DIR}/workspace/`.
   Each file = one new case. Realistic content (not contrived).
   Lowercase SQL keywords if applicable; semantic table/column names.
4. Write 2-3 NEW grader files under `${WORKBENCH_DIR}/checks/`. Each
   grader = one new case. Use `_grader-utils.mjs` helpers
   (`looseRange`, `fuzzyKeyword`, `tolerantKeyword`).
5. Update `${WORKBENCH_DIR}/suite.yml` to include the new cases. Don't
   touch existing cases.
6. Run a smoke check at `${WORKBENCH_DIR}/checks/smoke-graders.mjs`:
   - Hand-craft GOOD `findings.txt` per new grader → assert
     `pass=true score=1`
   - Hand-craft BAD `findings.txt` (missing 1-2 violations) → assert
     `pass=false score<1`
   - Hand-craft EMPTY → assert `pass=false score=0`
   - Run: `node ${WORKBENCH_DIR}/checks/smoke-graders.mjs`
   - All assertions must pass.

### `simplify`

1. Read `${SUITE_RESULT_PATH}` to identify which cases are scoring
   `< 0.50`. Read failed trials' `findings.txt` to understand WHY:
   ambiguous tasks, contrived violations, multiple valid answers.
2. Edit existing workspace files to remove ambiguity (clearer task
   description, fewer red-herring statements, tighter line ranges).
3. Update graders if the violations themselves changed.
4. Run the smoke check (same shape as `add-harder`).

### `fix-graders`

1. Read failed trials' `findings.txt` (paths in `${SUITE_RESULT_PATH}`'s
   `results[].trials[].resultPath`). If models DID find the violations
   but the grader scored wrong (line off by ±5, keyword mismatch,
   format variant), this is a grader bug.
2. Apply recipes G1-G6 from `${LESSONS_PATH}`:
   - G1: widen `looseRange` from default 8 to 10-12 if line drift is
     systematic
   - G2: replace hand-written keyword regex with `fuzzyKeyword`
   - G4: replace `/exact-stem/i` with `tolerantKeyword('stem')`
   - G6: split per-finding-line check (don't credit cross-finding keyword matches)
3. Run the smoke check.

## Tools allowed

Read, Edit, Write, Bash, Glob.

## Constraints

- Additive ONLY for `add-harder` (no changes to existing cases or
  graders unless their helpers need extension).
- Edits ONLY for `simplify` and `fix-graders` (no new cases).
- Smoke check MUST pass before commit.
- DO NOT run `npx tsx ../../../src/cli.ts run-suite` (that's the
  orchestrator's job; you just modify the workbench).
- DO NOT modify the `references/` (vendored skill content) — those are
  fixed inputs.

## Commit

After smoke check passes:

```bash
git add ${WORKBENCH_DIR}
git commit -m "feat(eval): ${DIRECTION} for ${SKILL_ID} (cases: <list>)"
```

DO NOT push.

## Return report

Return to caller (orchestrator subagent) under 300 words:

- Direction: `add-harder` | `simplify` | `fix-graders`
- Cases added/modified (names + 1-line description each)
- Predicted baseline impact (rough: "frontier models will likely miss
  X% of new checks because Y")
- Smoke-check result (N/N assertions pass)
- Blockers, if any
- Branch + commit SHA
````

- [ ] **Step 2: Verify the prompt has expected template variables**

```bash
grep -E '\$\{(SKILL_ID|WORKBENCH_DIR|SUITE_RESULT_PATH|DIRECTION|LESSONS_PATH)\}' \
  skills/auto-improve-orchestrator/prompts/eval-iterate.md \
  | wc -l
```

Expected: at least 8 occurrences (5 vars, most used multiple times).

- [ ] **Step 3: Commit**

```bash
git add skills/auto-improve-orchestrator/prompts/eval-iterate.md
git commit -m "feat(orchestrator): add eval-iterate sub-subagent prompt"
```

---

## Task 9: Write `prompts/skill-iterate.md`

**Files:**

- Create: `skills/auto-improve-orchestrator/prompts/skill-iterate.md`

- [ ] **Step 1: Write the skill-iterate subagent prompt template**

Create `skills/auto-improve-orchestrator/prompts/skill-iterate.md` with this exact content:

````markdown
# Sub-subagent prompt: iterate the skill content

You are a sub-subagent dispatched to apply ONE additive recipe to a
target file in a skill's vendored content, then re-measure to see if
the change moves per-case-min by ≥+0.05.

## Inputs (templated)

- `${SKILL_ID}` — leaf id (e.g. `supabase-postgres-best-practices`).
- `${WORKBENCH_DIR}` — `examples/workbench/${SKILL_ID}/`.
- `${SUITE_RESULT_PATH}` — path to the most recent `.results/<ts>/suite-result.json`.
- `${TARGET_FILE}` — path to the file to edit (extracted from the
  `${CONTEXT_FILE}`'s "Optimization target file" directive). Example:
  `${WORKBENCH_DIR}/references/<skill-id>/<file>.md`.
- `${CONTEXT_FILE}` — `skills/auto-improve-orchestrator/references/contexts/<owner>-<skill-id>.md`.
- `${LESSONS_PATH}` — `skills/auto-improve-orchestrator/references/lessons.md`.
- `${ITERATION}` — `1` or `2`.

## What to do

1. **Read the inputs.** Read `${SUITE_RESULT_PATH}`, `${CONTEXT_FILE}`,
   `${LESSONS_PATH}`, `${TARGET_FILE}`.

2. **Diagnose missed rules.** From `${SUITE_RESULT_PATH}`, identify:
   - Per-case scores (group `results[]` by `caseName`, average trial
     scores per case).
   - Per-rule miss frequency (read failed trials' `findings.txt`,
     identify which violation IDs were missed across trials/models).
   - Categorize each missed rule: visible-pattern / absence-of-attribute /
     state-machine / subjective.

3. **Match to a recipe.** From `${LESSONS_PATH}` § "Optimization
   patterns":
   - **Recipe A** (two-pass workflow) — code-reviewer skills with mixed
     presence/absence rules
   - **Recipe B** (verify-tool-installed nudge) — tool-use skills where
     models fall back to `curl`/`npm i`
   - **Recipe C** (per-element checklists) — skills with rules grouped
     by element type
   - **Recipe D** (BAD/GOOD examples) — anti-patterns where the bad
     pattern looks idiomatic
   - **Recipe E** (rationale + bug-story) — state-machine violations

   Pick the recipe that best matches the dominant failure mode for
   THIS iteration. If iteration 2 and recipe X was tried in iteration
   1 with insufficient uplift, pick a DIFFERENT recipe.

4. **Apply the recipe ADDITIVELY to `${TARGET_FILE}`.** Read
   `${CONTEXT_FILE}`'s "Hard constraints" — your edit must comply
   (e.g., additive-only, terse imperative bullets, specific style).
   Match the surrounding voice in `${TARGET_FILE}`.

5. **Re-run the suite from `${WORKBENCH_DIR}`:**

   ```bash
   cd ${WORKBENCH_DIR}
   set -a; . ../../../.env; set +a
   npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3 \
     2>&1 | tee /tmp/skill-iter-${ITERATION}-${SKILL_ID}.log
   ```

   Wait for completion (~30-60 min depending on suite size).

6. **Compute new per_case_min.** Read the new `.results/<latest>/suite-result.json`. Group by `caseName`. Per-case mean. Min across cases.

7. **Compare to baseline.** The orchestrator passed you `${SUITE_RESULT_PATH}` (the previous result). Compute:
   - `prev_per_case_min` from `${SUITE_RESULT_PATH}`
   - `new_per_case_min` from the new run
   - `uplift = new_per_case_min - prev_per_case_min`

8. **Commit if uplift OR final iteration.** Even if uplift is small,
   commit (the orchestrator may want the additive change as
   `uplift-too-small` packaging):

   ```bash
   git add ${TARGET_FILE}
   git commit -m "feat(${SKILL_ID}): iterate ${ITERATION} — Recipe <X>"
   ```

   Skip pushing.

## Tools allowed

Read, Edit, Bash, Glob.

## Constraints

- Additive ONLY. No deletions, no rewording of existing target-file
  content. The `${CONTEXT_FILE}` may specify additional constraints
  (e.g., specific frontmatter fields, prefix restrictions); honor all
  of them.
- DO NOT touch `${WORKBENCH_DIR}/checks/`, `${WORKBENCH_DIR}/workspace/`,
  `${WORKBENCH_DIR}/suite.yml` — those are eval harness, not skill
  content. (Eval changes are the eval-iterate subagent's job.)
- DO NOT modify `${LESSONS_PATH}` or other reference material outside
  `${TARGET_FILE}`.

## Cost guard

If the suite re-run fails or takes longer than the wrapper's default
timeout, exit with status `blocked-by-error` and a brief explanation.

## Return report

Return to caller (orchestrator subagent) under 300 words:

- Recipe applied (A/B/C/D/E)
- Diff summary (what was added, ~lines)
- Per-case scores: prev → new (table)
- per_case_min: prev → new
- uplift: ±N.NN
- Verdict: `success` (uplift ≥ +0.05) | `uplift-too-small` (less)
- Branch + commit SHA + new `.results/<ts>/` path
````

- [ ] **Step 2: Verify template variables**

```bash
grep -E '\$\{(SKILL_ID|WORKBENCH_DIR|SUITE_RESULT_PATH|TARGET_FILE|CONTEXT_FILE|LESSONS_PATH|ITERATION)\}' \
  skills/auto-improve-orchestrator/prompts/skill-iterate.md \
  | wc -l
```

Expected: at least 12 occurrences (7 vars, most used multiple times).

- [ ] **Step 3: Commit**

```bash
git add skills/auto-improve-orchestrator/prompts/skill-iterate.md
git commit -m "feat(orchestrator): add skill-iterate sub-subagent prompt"
```

---

## Task 10: Write `prompts/orchestrator.md`

**Files:**

- Create: `skills/auto-improve-orchestrator/prompts/orchestrator.md`

This is the main orchestrator prompt the operator dispatches via the Agent tool.

- [ ] **Step 1: Write the orchestrator prompt template**

Create `skills/auto-improve-orchestrator/prompts/orchestrator.md` with this exact content:

````markdown
# Orchestrator subagent: end-to-end auto-improve for one skill

You are dispatched as an autonomous orchestrator for a single public
agent skill: `${SLUG}`. You own this skill end-to-end. You make
decisions about when to research, when to iterate the eval, when to
iterate the skill, and when to package. You are running in your own
git worktree (created by `isolation: "worktree"`).

## Inputs (templated)

- `${SLUG}` — `<owner>/<repo>/<skill-id>`. Example: `supabase/agent-skills/supabase-postgres-best-practices`.
- `${MAIN_REPO_PATH}` — absolute path to the operator's main repo (your worktree's parent). Example: `/home/yuqing/Documents/Code/skill-optimizer`. Used for `.env` access.
- `${REFRESH_CONTEXT}` — optional flag, default `false`. If `true`, force re-research even if cached context file exists.

## Setup

1. Parse `${SLUG}` into `OWNER`, `REPO`, `SKILL_ID`:

   ```bash
   IFS=/ read -r OWNER REPO SKILL_ID <<< "${SLUG}"
   ```

2. Verify you're in a git worktree (not the main repo):

   ```bash
   GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
   GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
   if [ "$GIT_DIR" = "$GIT_COMMON" ]; then
     echo "ERROR: not running in a worktree. The orchestrator requires isolation:'worktree'." >&2
     exit 1
   fi
   ```

3. Verify the skill's workbench exists:

   ```bash
   WORKBENCH=examples/workbench/${SKILL_ID}/
   if [ ! -d "$WORKBENCH" ]; then
     # Write analysis.md with status:blocked-by-missing-workbench, then exit
     mkdir -p "$WORKBENCH"
     cat > "${WORKBENCH}analysis.md" <<EOF
   ---
   skill: ${SLUG}
   status: blocked-by-missing-workbench
   ---

   Initial workbench at examples/workbench/${SKILL_ID}/ does not exist.
   v1.3 only iterates existing workbenches; building initial workbenches
   is out of scope (deferred to v1.4).
   EOF
     # No commit needed since the workbench dir was just created
     exit 1
   fi
   ```

4. Define paths:

   ```bash
   CONTEXT_FILE=skills/auto-improve-orchestrator/references/contexts/${OWNER}-${SKILL_ID}.md
   LESSONS=skills/auto-improve-orchestrator/references/lessons.md
   ```

5. Source `.env` from the main repo (provides `OPENROUTER_API_KEY`):

   ```bash
   if [ -f "${MAIN_REPO_PATH}/.env" ]; then
     set -a; . "${MAIN_REPO_PATH}/.env"; set +a
   fi
   if [ -z "${OPENROUTER_API_KEY:-}" ]; then
     echo "ERROR: OPENROUTER_API_KEY not set" >&2
     # Write analysis.md with status:blocked-by-error and exit
     exit 1
   fi
   ```

6. Initialize cost tracker:

   ```bash
   CUMULATIVE_COST=0
   ```

## Phase 0: Research

```bash
if [ -f "$CONTEXT_FILE" ] && [ "${REFRESH_CONTEXT:-false}" != "true" ]; then
  echo "Phase 0: using cached context at $CONTEXT_FILE"
else
  echo "Phase 0: dispatching research-upstream subagent for ${SLUG}"
  # Dispatch via Agent tool (load skills/auto-improve-orchestrator/prompts/research-upstream.md,
  # substitute ${SLUG} and ${OUTPUT_PATH}=${CONTEXT_FILE}).
  # Wait for completion. Verify CONTEXT_FILE was written.
fi

# Read CONTEXT_FILE; extract: target_file, packaging_dir, additive_only_constraint
```

When dispatching the research subagent, use:

- `subagent_type: "general-purpose"`
- `description: "research <slug>"`
- (no `isolation`) — research subagent runs in YOUR worktree (writes the context file)
- `prompt`: load `skills/auto-improve-orchestrator/prompts/research-upstream.md` and substitute `${SLUG}` and `${OUTPUT_PATH}`

## Phase 3: Baseline measurement

Find the most recent `.results/<ts>/suite-result.json`:

```bash
LATEST_RESULTS=$(ls -td ${WORKBENCH}.results/*/ 2>/dev/null | head -1)
LATEST_SUITE_JSON=${LATEST_RESULTS}suite-result.json
```

If `LATEST_SUITE_JSON` exists AND its `cases` field matches the current `${WORKBENCH}suite.yml`'s case names:

- Read it (resume — skip baseline run).

Else:

```bash
cd ${WORKBENCH}
set -a; . ${MAIN_REPO_PATH}/.env; set +a
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3 \
  2>&1 | tee /tmp/orchestrator-baseline-${SKILL_ID}.log
cd -
LATEST_RESULTS=$(ls -td ${WORKBENCH}.results/*/ | head -1)
LATEST_SUITE_JSON=${LATEST_RESULTS}suite-result.json
```

Read `LATEST_SUITE_JSON` (use `node -e "console.log(JSON.parse(...))"` or `jq`).

Compute `per_case_min`:

```bash
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$LATEST_SUITE_JSON', 'utf-8'));
const byCase = {};
for (const r of data.results) {
  if (!byCase[r.caseName]) byCase[r.caseName] = [];
  byCase[r.caseName].push(r.meanScore);
}
const perCaseMeans = Object.entries(byCase).map(([c, scores]) => ({
  case: c,
  mean: scores.reduce((a, b) => a + b, 0) / scores.length,
}));
perCaseMeans.sort((a, b) => a.mean - b.mean);
console.log(JSON.stringify({
  perCaseMin: perCaseMeans[0].mean,
  perCaseMinName: perCaseMeans[0].case,
  perCaseBreakdown: perCaseMeans,
}, null, 2));
"
```

Track the cost:

```bash
COST_THIS_RUN=$(node -e "
const data = JSON.parse(require('fs').readFileSync('$LATEST_SUITE_JSON', 'utf-8'));
const sum = (data.metrics?.cost?.total) || 0;
console.log(sum);
")
CUMULATIVE_COST=$(node -e "console.log($CUMULATIVE_COST + $COST_THIS_RUN)")
if (( $(echo "$CUMULATIVE_COST > 10" | bc -l) )); then
  echo "ERROR: cumulative cost \$$CUMULATIVE_COST > \$10 hard cap" >&2
  # Write analysis.md status:budget-exceeded and exit
  exit 1
fi
if (( $(echo "$CUMULATIVE_COST > 5" | bc -l) )); then
  echo "WARN: cumulative cost \$$CUMULATIVE_COST > \$5 soft warning" >&2
fi
```

## Phase 3.5: Eval-readiness loop

```bash
EVAL_ITER=0
while [ "$EVAL_ITER" -lt 3 ]; do
  if (( $(echo "$PER_CASE_MIN >= 0.95" | bc -l) )); then
    DIRECTION="add-harder"
  elif (( $(echo "$PER_CASE_MIN < 0.50" | bc -l) )); then
    # Run grader-vs-skill check: read failed trials' findings.txt;
    # if models DID find the violations but grader scored wrong,
    # DIRECTION="fix-graders"; else "simplify".
    DIRECTION="..."
  else
    break  # in (0.50, 0.95) — proceed to skill iteration
  fi

  # Dispatch eval-iterate subagent (load prompts/eval-iterate.md, substitute vars)
  # Wait. Verify it committed.

  # Re-run baseline (no resume — case set changed)
  # Recompute PER_CASE_MIN
  EVAL_ITER=$((EVAL_ITER + 1))
done

# Exit conditions
if (( $(echo "$PER_CASE_MIN >= 0.95" | bc -l) )); then
  # Write analysis.md status:skill-genuinely-good and commit
  exit 0
fi
if (( $(echo "$PER_CASE_MIN < 0.50" | bc -l) )); then
  # Write analysis.md status:blocked-by-skill-shape and commit
  exit 0
fi
```

When dispatching eval-iterate, use:

- `subagent_type: "general-purpose"`
- `description: "eval-iterate ${DIRECTION} ${SKILL_ID}"`
- `prompt`: load `prompts/eval-iterate.md` and substitute `${SKILL_ID}`, `${WORKBENCH_DIR}`, `${SUITE_RESULT_PATH}`, `${DIRECTION}`, `${LESSONS_PATH}`

## Phase 4: Skill iteration

```bash
BASELINE_PER_CASE_MIN=$PER_CASE_MIN
ITER=0
SUCCESS=false

while [ "$ITER" -lt 2 ]; do
  ITER=$((ITER + 1))

  # Dispatch skill-iterate subagent
  # Wait. Verify it committed.

  # Find the new latest .results/<ts>/suite-result.json
  # Recompute NEW_PER_CASE_MIN

  UPLIFT=$(node -e "console.log($NEW_PER_CASE_MIN - $BASELINE_PER_CASE_MIN)")
  if (( $(echo "$UPLIFT >= 0.05" | bc -l) )); then
    SUCCESS=true
    break
  fi

  # Track cost again — re-run-suite happened
  # If cost > 10, exit budget-exceeded
done
```

When dispatching skill-iterate:

- `subagent_type: "general-purpose"`
- `description: "skill-iterate ${ITER} ${SKILL_ID}"`
- `prompt`: load `prompts/skill-iterate.md` and substitute all 7 inputs

## Phase 5: Package

If `SUCCESS=true` or `uplift-too-small` (the additive change is still
worth packaging):

```bash
# Read CONTEXT_FILE for packaging_dir
PACKAGING_DIR="${WORKBENCH}proposed-upstream-changes/${PACKAGING_DIR_FROM_CONTEXT}"
mkdir -p "$PACKAGING_DIR"

# Read the original target file (before any v1.3 mods).
# This is the version on the FIRST commit on this orchestrator's branch.
git show HEAD~${ITER}:${TARGET_FILE} > "${PACKAGING_DIR}/before-$(basename ${TARGET_FILE})"

# Current target file is the after version
cp "${TARGET_FILE}" "${PACKAGING_DIR}/after-$(basename ${TARGET_FILE})"

# Write a packaging README
cat > "${PACKAGING_DIR}/README.md" <<EOF
# Proposed upstream change for ${SLUG}

[summary, evidence per-case breakdown, how to apply]
EOF
```

Write `${WORKBENCH}analysis.md`:

```markdown
---
skill: ${SLUG}
status: success | uplift-too-small | skill-genuinely-good | blocked-by-skill-shape | blocked-by-error
classification: <from CONTEXT_FILE>
baseline_per_case_min: 0.NN
final_per_case_min: 0.NN
iterations: eval=N, skill=N
total_cost_usd: NN.NN
---

# Auto-pilot run for ${SLUG}

[3-6 short bullets covering: what was done, why, evidence, judgment calls]
```

## Phase 6: Final commit

```bash
git checkout -b eval/auto-pilot/${SKILL_ID} 2>/dev/null || git checkout eval/auto-pilot/${SKILL_ID}
git add ${WORKBENCH}analysis.md
[ -d "$PACKAGING_DIR" ] && git add "$PACKAGING_DIR"
git add ${LATEST_RESULTS}suite-result.json
git commit -m "eval(auto-pilot): ${SKILL_ID} — status=$STATUS, baseline=$BASELINE_PER_CASE_MIN→$PER_CASE_MIN"
```

DO NOT push.

## Return summary

Return to caller (operator's CC session) under 300 words:

- Branch: `eval/auto-pilot/${SKILL_ID}`
- Final commit SHA: `<sha>`
- Status: one of the exit statuses
- Baseline → final per-case-min
- Per-case breakdown (table)
- Proposed-upstream-changes path (if applicable)
- Cumulative cost: $N.NN

## Hard rules

- NEVER ask the operator a question mid-run.
- NEVER `git push`.
- NEVER modify files outside `${WORKBENCH}` or `${CONTEXT_FILE}`.
- Always commit before exiting (even on error: write `analysis.md` with the right status, then commit).
- Cost guard: hard stop at $10 cumulative `metrics.cost.total`.
````

- [ ] **Step 2: Verify template variables**

```bash
grep -E '\$\{(SLUG|MAIN_REPO_PATH|REFRESH_CONTEXT)\}' \
  skills/auto-improve-orchestrator/prompts/orchestrator.md \
  | wc -l
```

Expected: at least 5 occurrences.

- [ ] **Step 3: Commit**

```bash
git add skills/auto-improve-orchestrator/prompts/orchestrator.md
git commit -m "feat(orchestrator): add orchestrator main prompt template"
```

---

## Task 11: Smoke validation script

Validates that the new skill files are well-formed before any end-to-end test.

**Files:**

- Create: `skills/auto-improve-orchestrator/.smoke-check.mjs`

- [ ] **Step 1: Write the smoke check**

Create `skills/auto-improve-orchestrator/.smoke-check.mjs` with this exact content:

```js
#!/usr/bin/env node
// Smoke check for the auto-improve-orchestrator skill.
// Validates: SKILL.md frontmatter, prompt template variables, file existence.

import { readFileSync, existsSync } from 'node:fs';
import matter from 'gray-matter';

const skillRoot = 'skills/auto-improve-orchestrator';
let failures = 0;

function check(condition, msg) {
  if (condition) {
    console.log(`OK: ${msg}`);
  } else {
    console.error(`FAIL: ${msg}`);
    failures++;
  }
}

// 1. SKILL.md exists + frontmatter parses
const skillMdPath = `${skillRoot}/SKILL.md`;
check(existsSync(skillMdPath), `${skillMdPath} exists`);
if (existsSync(skillMdPath)) {
  const parsed = matter(readFileSync(skillMdPath, 'utf-8'));
  check(parsed.data.name === 'auto-improve-orchestrator', 'SKILL.md name = "auto-improve-orchestrator"');
  check(typeof parsed.data.description === 'string' && parsed.data.description.length > 50, 'SKILL.md description is non-trivial');
}

// 2. All four prompt files exist
for (const name of ['orchestrator.md', 'research-upstream.md', 'eval-iterate.md', 'skill-iterate.md']) {
  check(existsSync(`${skillRoot}/prompts/${name}`), `prompts/${name} exists`);
}

// 3. workflow.md + lessons.md + at least one context exist
check(existsSync(`${skillRoot}/references/workflow.md`), 'references/workflow.md exists');
check(existsSync(`${skillRoot}/references/lessons.md`), 'references/lessons.md exists');
check(existsSync(`${skillRoot}/references/contexts`), 'references/contexts/ exists');

// 4. Each prompt has its expected templated variables
const expectedVars = {
  'orchestrator.md': ['SLUG', 'MAIN_REPO_PATH'],
  'research-upstream.md': ['SLUG', 'OUTPUT_PATH'],
  'eval-iterate.md': ['SKILL_ID', 'WORKBENCH_DIR', 'SUITE_RESULT_PATH', 'DIRECTION', 'LESSONS_PATH'],
  'skill-iterate.md': ['SKILL_ID', 'WORKBENCH_DIR', 'SUITE_RESULT_PATH', 'TARGET_FILE', 'CONTEXT_FILE', 'LESSONS_PATH', 'ITERATION'],
};
for (const [file, vars] of Object.entries(expectedVars)) {
  const content = readFileSync(`${skillRoot}/prompts/${file}`, 'utf-8');
  for (const v of vars) {
    check(content.includes(`\${${v}}`), `prompts/${file} contains \${${v}}`);
  }
}

// 5. Old wrapper files are gone
check(!existsSync('tools/auto-improve-skill.mjs'), 'tools/auto-improve-skill.mjs is gone');
check(!existsSync('tools/auto-improve-skill-prompt.md'), 'tools/auto-improve-skill-prompt.md is gone');
check(!existsSync('tools/auto-improve-skill-lessons.md'), 'tools/auto-improve-skill-lessons.md moved out of tools/');
check(!existsSync('tools/auto-improve-contexts'), 'tools/auto-improve-contexts/ moved out of tools/');

// 6. Lessons + contexts at new paths
check(existsSync(`${skillRoot}/references/lessons.md`), 'lessons at new path');
check(existsSync(`${skillRoot}/references/contexts/supabase-postgres-best-practices.md`), 'supabase context at new path');

if (failures > 0) {
  console.error(`\n${failures} smoke checks failed`);
  process.exit(1);
}
console.log(`\nAll smoke checks passed`);
```

- [ ] **Step 2: Run the smoke check**

```bash
node skills/auto-improve-orchestrator/.smoke-check.mjs
```

Expected: all checks pass, final line `All smoke checks passed`. Exit code 0.

- [ ] **Step 3: Commit the smoke script**

```bash
git add skills/auto-improve-orchestrator/.smoke-check.mjs
git commit -m "test(orchestrator): smoke validation script for skill structure"
```

---

## Task 12: End-to-end validation on supabase

Validates that the orchestrator subagent actually works by dispatching it on the supabase skill (which has an existing workbench at `examples/workbench/supabase-postgres-best-practices/` from this session's prior work).

This task is partially manual — the operator's CC session does the dispatch. The plan specifies what to dispatch and how to verify.

- [ ] **Step 1: Verify pre-conditions for the test run**

```bash
# Workbench exists (from supabase-pilot-v2 worktree's prior commits)
ls examples/workbench/supabase-postgres-best-practices/suite.yml 2>&1 || echo "MISSING — bring in from another worktree"

# Context file exists (already there from v1.2.1 work)
ls skills/auto-improve-orchestrator/references/contexts/supabase-postgres-best-practices.md

# Recent suite-result.json exists (resume should kick in)
ls examples/workbench/supabase-postgres-best-practices/.results/*/suite-result.json 2>&1 | head -1
```

If the workbench is missing on `feat/auto-improve-skill-v1.3`, cherry-pick from the supabase-pilot-v2 worktree's branch:

```bash
# From the v1.3-impl worktree:
git checkout eval/auto-pilot/supabase-postgres-best-practices-v2 -- \
  examples/workbench/supabase-postgres-best-practices/
git commit -m "test(e2e): import supabase workbench for v1.3 validation"
```

- [ ] **Step 2: Dispatch the orchestrator subagent (operator's CC session does this)**

The operator dispatches via the Agent tool:

```
Agent({
  description: "auto-improve supabase-postgres-best-practices",
  subagent_type: "general-purpose",
  isolation: "worktree",
  run_in_background: true,
  prompt: <load skills/auto-improve-orchestrator/prompts/orchestrator.md,
           substitute:
             ${SLUG} = "supabase/agent-skills/supabase-postgres-best-practices"
             ${MAIN_REPO_PATH} = "/home/yuqing/Documents/Code/skill-optimizer"
             ${REFRESH_CONTEXT} = "false">
})
```

- [ ] **Step 3: Wait for orchestrator completion (long-running, 30-60 min)**

The orchestrator runs in its own worktree. You'll get a notification when it completes.

Expected behavior:

- **Phase 0:** finds existing context file at `skills/auto-improve-orchestrator/references/contexts/supabase-postgres-best-practices.md` — no re-research.
- **Phase 3:** finds existing recent `suite-result.json` from v1.2.1 v2 work — RESUMES (no re-run).
- **Phase 3.5:** computes `per_case_min` from the existing results. The supabase v2 baseline had `update-without-where` at 77.8% (per the spec § "Validation"), so `per_case_min ≈ 0.78`. This is in `(0.50, 0.95)` — NO eval iteration needed; proceed to Phase 4.
- **Phase 4:** dispatches `skill-iterate` subagent with `target_file = monitor-two-pass-review.md` (from context). The subagent applies a recipe additively, re-runs the suite, computes uplift.
- **Phase 5/6:** if uplift ≥ +0.05 on `update-without-where`, packages + commits as `success`. Otherwise commits as `uplift-too-small`.

- [ ] **Step 4: Verify the orchestrator's output**

After completion, check:

```bash
# A new branch exists
git branch | grep eval/auto-pilot/supabase-postgres-best-practices

# A commit on it
git log -1 eval/auto-pilot/supabase-postgres-best-practices --oneline

# analysis.md has a real status (not "pending")
git show eval/auto-pilot/supabase-postgres-best-practices:examples/workbench/supabase-postgres-best-practices/analysis.md | head -10
```

Expected: branch exists, commit message includes status, analysis frontmatter has `status: success` or `status: uplift-too-small` (not `pending` or `blocked-by-error`).

- [ ] **Step 5: If validation passed, commit a note**

```bash
cat > docs/auto-improve-skill-v1.3-validation.md <<'EOF'
# v1.3 validation result

Date: 2026-05-12
Skill tested: supabase/agent-skills/supabase-postgres-best-practices

The orchestrator subagent was dispatched on the existing supabase
workbench. Result: <status>, baseline <BASE> → final <FINAL>.

The dispatched orchestrator:
- Found cached context — no re-research.
- Found recent suite-result — resumed from cached baseline.
- per_case_min was X.XX → triggered Phase 4 skill iteration (or:
  was at ceiling/floor, triggered eval iteration).
- skill-iterate subagent applied Recipe <X>; uplift was ±N.NN.
- Packaged proposed-upstream-changes/ at <path>.

Branch: eval/auto-pilot/supabase-postgres-best-practices (commit <SHA>).

v1.3 is validated end-to-end.
EOF

git add docs/auto-improve-skill-v1.3-validation.md
git commit -m "test(e2e): document v1.3 validation result on supabase"
```

(Fill in the actual values after the orchestrator completes — this template is what gets committed at the end.)

---

## Self-Review

After writing the plan, I checked it against the spec for coverage, placeholders, and consistency.

**Spec coverage:**

- §"Architecture overview" — Tasks 1-5 (deletions/moves) and 5-10 (new skill files) cover all listed deliverables. ✓
- §"Sub-subagent designs" — Tasks 7, 8, 9 implement the three sub-subagent prompts with the inputs/outputs specified in the spec. ✓
- §"Orchestrator algorithm" — Task 10 embeds the algorithm. ✓
- §"Parallelism guarantees" — Worktree isolation is enforced by Task 10's setup check (steps 2 of orchestrator.md content). ✓
- §"Cost model" — Task 10's orchestrator template includes cost tracking with $5 warn / $10 hard stop. ✓
- §"Cleanup of v1.2.1 artifacts" — Tasks 1-4 do all the deletes/moves/CLAUDE.md update. ✓
- §"Validation / acceptance criteria" — Tasks 11-12 cover validation #1-#5. ✓

**Placeholder scan:** No "TBD", "TODO", "fill in details", or vague-error-handling instructions in any task. Each step has either complete code or an exact bash command. ✓

**Type / path consistency:**

- `skills/auto-improve-orchestrator/` is the new skill root, used identically across all tasks. ✓
- `${SKILL_ID}`, `${SLUG}`, `${OWNER}`, `${REPO}` follow the same parsing convention everywhere. ✓
- Sub-subagent input names match between Task 8/9/10 (e.g., `${WORKBENCH_DIR}` is the same in all places). ✓
- `per_case_min` is the consistent metric throughout (not aliased as `perCaseMinimum` or `min_score`). ✓

No issues found.

---

## Execution Handoff

Plan complete and saved to `docs/auto-improve-skill-v1.3-plan.md` (in the `feat/auto-improve-skill-v1.3` worktree at `.claude/worktrees/v1.3-impl/`).

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Each task is self-contained enough to be one focused subagent.

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
