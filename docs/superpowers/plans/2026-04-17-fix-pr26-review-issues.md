# PR #26 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 13 bugs found during code review of PR #26 (v1.1.0) as a single PR to `development`.

**Architecture:** All fixes are isolated, targeted one-to-few-line changes to existing files. No new modules. The highest-impact fixes (prompt surface preflight, init guidance, wizard validator) are done first so they're independently reviewable. Doc fixes are batched. Minor code-quality improvements (comment accuracy, structured errors) come last.

**Tech Stack:** TypeScript, Node.js, `npm test` (smoke tests), `npm run typecheck`.

---

## File Structure

Files to modify (no new files created):

- `src/benchmark/init.ts` — add `else if (surface === 'prompt')` branch to next-steps output (issue 1)
- `src/init/wizard.ts` — fix custom model ID validator to accept all three prefixes (issue 2)
- `src/tasks/generate.ts` — add prompt-surface fallback in `validateTask`; add guard comment in retry path (issues 3, 12)
- `src/cli.ts` — add `project.target.surface !== 'prompt'` guard to maxTasks check (issue 4)
- `src/doctor/checks.ts` — add surface guard to maxTasks check; fix discovery-failure hint (issues 4, 5)
- `README.md` — fix `./skill-optimizer/` → `./.skill-optimizer/` in all examples (issue 6)
- `SKILL/SKILL.md` — fix config path reference (issue 6)
- `SKILL/references/setup.md` — fix config path + update stale `gpt-4o` model ID (issues 6, 8)
- `src/project/snapshot.ts` — include `snapshotPath` in unsupported-format error (issue 7)
- `src/benchmark/runner.ts` — override `toolPrecision` for prompt surface tasks (issue 9)
- `src/project/schema.ts` — fix `apiKeyEnv` description: "by provider prefix, not format" (issue 10)
- `src/optimizer/loop.ts` — fix stale comment about agent cwd in local-skill mode (issue 11)
- `src/tasks/pi-simple-complete.ts` — export `NoTextBlocksError` class (issue 13)
- `src/tasks/default-pi-critic.ts` — catch `NoTextBlocksError` by type instead of string match (issue 13)

---

## Task 0: Set up worktree

**Files:** (no files changed — environment setup only)

- [ ] **Step 1: Create the worktree**

```bash
cd /root/openclaw-workspace/skill-benchmark
git worktree add .worktrees/fix-pr26-issues -b fix/pr26-review-issues
```

- [ ] **Step 2: Install dependencies**

```bash
cd .worktrees/fix-pr26-issues
npm install
```

- [ ] **Step 3: Verify baseline tests pass**

```bash
npm test
```

Expected: all smoke tests pass with zero failures. If anything fails, stop and investigate before making changes.

---

## Task 1: Fix prompt surface preflight in `--dry-run` and `doctor`

**Issues fixed:** 4 (maxTasks guard) and 5 (discovery-failure hint)

**Files:**
- Modify: `src/cli.ts:218`
- Modify: `src/doctor/checks.ts:14-51`

### Background

`tasks/index.ts:51` exempts prompt surfaces from the `maxTasks < inScope.length` gate with:
```typescript
if (surface.snapshot.surface !== 'prompt' && maxTasks < inScope.length) {
```
But `cli.ts` and `doctor/checks.ts` have no equivalent guard — they hard-fail for prompt configs.

Also, `doctor/checks.ts` catch block (lines 14-19) shows "Check target.discovery.sources and your manifest file" when discovery throws. Prompt surfaces use neither — they use `target.skill.source`.

- [ ] **Step 1: Fix `src/cli.ts` maxTasks check**

In `src/cli.ts`, find this block (around line 218):

```typescript
  const maxTasks = project.benchmark.taskGeneration.maxTasks;
  if (project.benchmark.taskGeneration.enabled && inScope.length > 0 && maxTasks < inScope.length) {
    console.error(`\nERROR: maxTasks (${maxTasks}) < in-scope action count (${inScope.length}).`);
    console.error(`Raise benchmark.taskGeneration.maxTasks in ${project.configPath}, or tighten target.scope.exclude.`);
    process.exit(1);
  }
```

Replace with:

```typescript
  const maxTasks = project.benchmark.taskGeneration.maxTasks;
  if (project.target.surface !== 'prompt' && project.benchmark.taskGeneration.enabled && inScope.length > 0 && maxTasks < inScope.length) {
    console.error(`\nERROR: maxTasks (${maxTasks}) < in-scope action count (${inScope.length}).`);
    console.error(`Raise benchmark.taskGeneration.maxTasks in ${project.configPath}, or tighten target.scope.exclude.`);
    process.exit(1);
  }
```

- [ ] **Step 2: Fix `src/doctor/checks.ts` — both the maxTasks guard and the discovery hint**

In `src/doctor/checks.ts`, replace the entire `checkDiscovery` function:

```typescript
export function checkDiscovery(project: ResolvedProjectConfig): Issue[] {
  const issues: Issue[] = [];
  let discovered: ReturnType<typeof discoverActionsOnly>;

  try {
    discovered = discoverActionsOnly(project);
  } catch (err) {
    const isPrompt = project.target.surface === 'prompt';
    const hint = isPrompt
      ? `Check the skill file at target.skill — ensure it has parseable capability headings`
      : `Check target.discovery.sources and your manifest file`;
    issues.push({
      code: 'discovery-failed', severity: 'error', field: 'target.discovery',
      message: `Discovery threw an error: ${err instanceof Error ? err.message : String(err)}`,
      hint,
      fixable: false,
    });
    return issues;
  }

  const { inScope } = resolveScope(discovered, project.target.scope);

  if (inScope.length === 0) {
    let surfaceHint: string;
    if (project.target.surface === 'cli') {
      surfaceHint = `Add target.cli.commands pointing at a cli-commands.json manifest, or fix target.discovery.sources`;
    } else if (project.target.surface === 'mcp') {
      surfaceHint = `Add target.mcp.tools pointing at a tools.json manifest, or fix target.discovery.sources`;
    } else if (project.target.surface === 'prompt') {
      surfaceHint = `Ensure the skill file (target.skill) contains parseable capability headings`;
    } else {
      surfaceHint = `Fix target.discovery.sources to point at your SDK entry file`;
    }
    issues.push({
      code: 'zero-actions-discovered', severity: 'error', field: 'target.discovery',
      message: `Discovery found 0 in-scope actions`,
      hint: surfaceHint,
      fixable: false,
    });
  } else {
    const maxTasks = project.benchmark.taskGeneration?.maxTasks ?? 0;
    if (project.target.surface !== 'prompt' && project.benchmark.taskGeneration?.enabled && maxTasks < inScope.length) {
      issues.push({
        code: 'max-tasks-too-low', severity: 'error', field: 'benchmark.taskGeneration.maxTasks',
        message: `maxTasks (${maxTasks}) is less than the number of in-scope actions (${inScope.length})`,
        hint: `Raise benchmark.taskGeneration.maxTasks to at least ${inScope.length}`,
        fixable: false,
      });
    }
    issues.push({
      code: 'discovery-ok', severity: 'info', field: 'target.discovery',
      message: `${inScope.length} action(s) discovered (${project.target.surface} surface)`,
      fixable: false,
    });
  }

  return issues;
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/doctor/checks.ts
git commit -m "fix(preflight): exempt prompt surface from maxTasks gate in --dry-run and doctor

Both cli.ts and doctor/checks.ts hard-failed when maxTasks < discovered capability
count for prompt surfaces, even though tasks/index.ts already exempts prompt from
this constraint. Also fixes the discovery-failure hint for prompt surfaces: the old
message pointed users at target.discovery.sources and manifests, which prompt
surfaces don't use."
```

---

## Task 2: Fix `init` next-steps for prompt surface

**Issue fixed:** 1

**Files:**
- Modify: `src/benchmark/init.ts:92-107`

### Background

The `else` branch in the next-steps output catches all surfaces that aren't `sdk` or `cli`, including the new `prompt` surface. Users running `init prompt` see instructions to configure `target.discovery.sources` and `tools.json`, which prompt surfaces don't use.

- [ ] **Step 1: Add prompt branch to next-steps output**

In `src/benchmark/init.ts`, find this block (around line 92):

```typescript
  if (surface === 'sdk') {
    console.log('       target.discovery.sources → entry file(s) for SDK discovery');
  } else if (surface === 'cli') {
    console.log('       target.discovery.sources → CLI entry file (for code-first discovery)');
    console.log('       .skill-optimizer/cli-commands.json → replace template with your real commands');
    console.log('       (cli-commands.json is used as a fallback if code-first discovery finds nothing)');
  } else {
    console.log('       target.discovery.sources → MCP server file (for code-first discovery)');
    console.log('       .skill-optimizer/tools.json → replace template with your real tools');
    console.log('       (tools.json is used as a fallback if code-first discovery finds nothing)');
  }
```

Replace with:

```typescript
  if (surface === 'sdk') {
    console.log('       target.discovery.sources → entry file(s) for SDK discovery');
  } else if (surface === 'cli') {
    console.log('       target.discovery.sources → CLI entry file (for code-first discovery)');
    console.log('       .skill-optimizer/cli-commands.json → replace template with your real commands');
    console.log('       (cli-commands.json is used as a fallback if code-first discovery finds nothing)');
  } else if (surface === 'prompt') {
    console.log('       target.skill → path to your SKILL.md or prompt document');
    console.log('       (no discovery sources needed — capabilities are read directly from the skill file)');
  } else {
    console.log('       target.discovery.sources → MCP server file (for code-first discovery)');
    console.log('       .skill-optimizer/tools.json → replace template with your real tools');
    console.log('       (tools.json is used as a fallback if code-first discovery finds nothing)');
  }
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all pass (smoke-init tests do not check `console.log` output so no test update needed here).

- [ ] **Step 3: Commit**

```bash
git add src/benchmark/init.ts
git commit -m "fix(init): add prompt-surface branch to next-steps guidance

The else branch caught 'prompt' and showed MCP instructions (target.discovery.sources,
tools.json) which don't apply. Now shows the correct guidance: target.skill path,
no discovery sources needed."
```

---

## Task 3: Fix wizard custom model ID validator

**Issue fixed:** 2

**Files:**
- Modify: `src/init/wizard.ts:129`

### Background

The validator at line 129 rejects any model ID that doesn't start with `openrouter/`. This was written before `anthropic/` and `openai/` direct-API prefixes were added. The `validate.ts` validator accepts all three prefixes; the wizard must too — especially since v1.1.0 introduces Codex auth for `openai/` models.

- [ ] **Step 1: Fix the validator**

In `src/init/wizard.ts`, find:

```typescript
      if (!v.startsWith('openrouter/')) return 'Must start with openrouter/';
```

Replace with:

```typescript
      if (!v.startsWith('openrouter/') && !v.startsWith('anthropic/') && !v.startsWith('openai/')) {
        return 'Must start with openrouter/, anthropic/, or openai/';
      }
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all pass. The smoke-init.ts tests don't exercise this specific validation path.

- [ ] **Step 3: Commit**

```bash
git add src/init/wizard.ts
git commit -m "fix(wizard): accept anthropic/ and openai/ model IDs in custom-model validator

The validator rejected any non-openrouter/ prefix, blocking direct-API model IDs
from being entered via the interactive wizard. validate.ts accepts all three prefixes;
the wizard now matches."
```

---

## Task 4: Add prompt-surface fallback in `validateTask`

**Issue fixed:** 3

**Files:**
- Modify: `src/tasks/generate.ts:226-231`

### Background

`validateTask()` throws if `rawExpectedActions` is undefined. For prompt-surface tasks, `expected_actions` is always `[]`. If the LLM elides the key instead of emitting `[]` (a common LLM behaviour with empty arrays), the generation crashes. The function already receives `knownCapabilityKeys` to detect prompt-surface context — it just needs to use it as a fallback.

- [ ] **Step 1: Add the prompt-surface fallback**

In `src/tasks/generate.ts`, find (around line 226):

```typescript
  if (!rawExpectedActions) {
    const received = JSON.stringify(Object.keys(candidate));
    throw new Error(`Task ${taskId} must include an expected_actions array (received keys: ${received})`);
  }
```

Replace with:

```typescript
  // Prompt surface: expected_actions is always []. If the LLM elided the key,
  // default to [] rather than failing — the grounding step enforces emptiness anyway.
  if (!rawExpectedActions && knownCapabilityKeys !== undefined) {
    rawExpectedActions = [];
  }

  if (!rawExpectedActions) {
    const received = JSON.stringify(Object.keys(candidate));
    throw new Error(`Task ${taskId} must include an expected_actions array (received keys: ${received})`);
  }
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all pass. The smoke-generation tests exercise the generation path and should still pass.

- [ ] **Step 3: Commit**

```bash
git add src/tasks/generate.ts
git commit -m "fix(generate): default expected_actions to [] for prompt surface when LLM elides the key

LLMs routinely omit empty-array fields despite instructions. For prompt surface
(detected via knownCapabilityKeys !== undefined), expected_actions is always []
so we default it rather than throwing. The grounding step in ground.ts enforces
emptiness for prompt tasks regardless."
```

---

## Task 5: Fix doc config path and stale model ID

**Issues fixed:** 6 and 8

**Files:**
- Modify: `README.md` (multiple occurrences)
- Modify: `SKILL/SKILL.md:42`
- Modify: `SKILL/references/setup.md` (two places)

### Background

`scaffold.ts` writes configs to `./.skill-optimizer/skill-optimizer.json` (dot-prefixed, hidden directory). All user-facing docs reference `./skill-optimizer/skill-optimizer.json` (no dot) — one character off, causes immediate config-not-found on first use.

Also, `SKILL/references/setup.md` line ~81 uses `openrouter/openai/gpt-4o` which is not in the current MODEL_PRESETS. Current presets: `gpt-5.4`, `gpt-4o-mini`, `gpt-oss-120b`.

- [ ] **Step 1: Fix README.md**

In `README.md`, find and replace all three occurrences of `./skill-optimizer/skill-optimizer.json` with `./.skill-optimizer/skill-optimizer.json`. Also fix the table at line ~116 that references `skill-optimizer/skill-optimizer.json`:

Find this block (around line 71):
```markdown
npx skill-optimizer run --config ./skill-optimizer/skill-optimizer.json
```
Replace with:
```markdown
npx skill-optimizer run --config ./.skill-optimizer/skill-optimizer.json
```

Find this block (around line 77):
```markdown
npx skill-optimizer optimize --config ./skill-optimizer/skill-optimizer.json
```
Replace with:
```markdown
npx skill-optimizer optimize --config ./.skill-optimizer/skill-optimizer.json
```

Find the table reference at ~line 116 (`skill-optimizer/skill-optimizer.json` appears in the "Key config fields" table header):
```markdown
**Key config fields** in `skill-optimizer/skill-optimizer.json`:
```
Replace with:
```markdown
**Key config fields** in `.skill-optimizer/skill-optimizer.json`:
```

- [ ] **Step 2: Fix SKILL/SKILL.md**

Find (around line 42):
```markdown
`<config-path>` is the path to your `skill-optimizer.json` — typically `./skill-optimizer/skill-optimizer.json` after running `init`, or wherever you placed it.
```
Replace with:
```markdown
`<config-path>` is the path to your `skill-optimizer.json` — typically `./.skill-optimizer/skill-optimizer.json` after running `init`, or wherever you placed it.
```

- [ ] **Step 3: Fix SKILL/references/setup.md**

Fix the config path around line 133:
```markdown
- **`skill-optimizer.json`** — main config file (commit this); when created by `init`, the default location is `./skill-optimizer/skill-optimizer.json`
```
Replace with:
```markdown
- **`skill-optimizer.json`** — main config file (commit this); when created by `init`, the default location is `./.skill-optimizer/skill-optimizer.json`
```

Fix the stale model ID around line 81 (inside the `answers.json` example):
```json
  "models": ["openrouter/anthropic/claude-sonnet-4.6", "openrouter/openai/gpt-4o"],
```
Replace with:
```json
  "models": ["openrouter/anthropic/claude-sonnet-4.6", "openrouter/openai/gpt-4o-mini"],
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass (smoke tests don't assert these doc strings).

- [ ] **Step 5: Commit**

```bash
git add README.md SKILL/SKILL.md SKILL/references/setup.md
git commit -m "fix(docs): correct config path to .skill-optimizer/ and update stale model ID

scaffold.ts writes to ./.skill-optimizer/ (dot-prefixed hidden dir) but all user docs
referenced ./skill-optimizer/ (no dot). Also updated the gpt-4o example in
setup.md to gpt-4o-mini which is in the current MODEL_PRESETS."
```

---

## Task 6: Include `snapshotPath` in unsupported-format error

**Issue fixed:** 7

**Files:**
- Modify: `src/project/snapshot.ts:71-73`

### Background

The invalid-JSON branch at line 62 already includes `snapshotPath`. The unsupported-format branch at line 71-73 doesn't, making it hard to debug which file is the problem when multiple snapshots exist.

- [ ] **Step 1: Add snapshotPath to the error**

In `src/project/snapshot.ts`, find (around line 71):

```typescript
      throw new Error(
        `Snapshot file format is not supported — delete .skill-optimizer/ and re-run the benchmark to regenerate.`,
      );
```

Replace with:

```typescript
      throw new Error(
        `Snapshot file format is not supported: ${snapshotPath} — delete .skill-optimizer/ and re-run the benchmark to regenerate.`,
      );
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/project/snapshot.ts
git commit -m "fix(snapshot): include snapshotPath in unsupported-format error message"
```

---

## Task 7: Fix `toolPrecision` for prompt surface

**Issue fixed:** 9

**Files:**
- Modify: `src/benchmark/runner.ts` (the prompt surface metrics block, around line 370-390)

### Background

For prompt surface tasks, `knownMethods` is an empty `Set` and `extractedCalls` is `[]`, so `toolPrecision` in `evaluator.ts` always computes to `0.0`. The runner already overrides `toolRecall` for prompt tasks (line ~381: `taskResult.metrics.toolRecall = promptResult.score`), but never touches `toolPrecision`. The `0.0` then rolls up into `avgToolPrecision` in the summary, making reports misleading.

The fix: set `toolPrecision = 1.0` for prompt tasks in the same block where `toolRecall` is overridden (the `promptResult.noActiveCriteria` false branch and the no-active-criteria true branch both need it).

- [ ] **Step 1: Locate the prompt surface metrics block**

Find the section in `src/benchmark/runner.ts` that looks like:

```typescript
          } else {
            taskResult.metrics.toolRecall = promptResult.score;
            taskResult.metrics.taskPassed = promptResult.score >= 0.5;
            console.log(`  [${slug}] Prompt score: ${promptResult.score.toFixed(3)} → ${taskResult.metrics.taskPassed ? 'PASS' : 'FAIL'}`);
          }
```

and the no-active-criteria branch:

```typescript
          if (promptResult.noActiveCriteria) {
            const msg = `Task "${task.id}" has no extractable criteria — fix SKILL.md section for that action`;
            taskResult.metrics.toolRecall = 0;
            taskResult.metrics.taskPassed = false;
```

- [ ] **Step 2: Add `toolPrecision = 1.0` to both branches**

Replace the entire prompt evaluation block (covering the `try { ... } catch` around the evaluatePromptResponse call):

```typescript
        try {
          const promptResult = evaluatePromptResponse(rawResponse, criteria);
          if (promptResult.noActiveCriteria) {
            const msg = `Task "${task.id}" has no extractable criteria — fix SKILL.md section for that action`;
            taskResult.metrics.toolRecall = 0;
            taskResult.metrics.toolPrecision = 1.0;
            taskResult.metrics.taskPassed = false;
            taskResult.error = taskResult.error ?? msg;
            console.error(`  [${slug}] Prompt eval error: ${msg}`);
          } else {
            taskResult.metrics.toolRecall = promptResult.score;
            taskResult.metrics.toolPrecision = 1.0;
            taskResult.metrics.taskPassed = promptResult.score >= 0.5;
            console.log(`  [${slug}] Prompt score: ${promptResult.score.toFixed(3)} → ${taskResult.metrics.taskPassed ? 'PASS' : 'FAIL'}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  [${slug}] Prompt eval error: ${msg}`);
          taskResult.metrics.toolRecall = 0;
          taskResult.metrics.toolPrecision = 1.0;
          taskResult.metrics.taskPassed = false;
          taskResult.error = taskResult.error ?? msg;
        }
```

The rationale for `1.0`: prompt tasks make no tool calls by design, so the model cannot hallucinate a wrong tool — precision is vacuously perfect. Using `1.0` (not `0`) prevents the metric from dragging down `avgToolPrecision` in mixed reports.

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: zero errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/benchmark/runner.ts
git commit -m "fix(runner): set toolPrecision=1.0 for prompt surface tasks

Prompt tasks make no tool calls by design, so toolPrecision was always 0.0 due to
the empty knownMethods Set. 0.0 rolled up into avgToolPrecision and made benchmark
reports misleading. Use 1.0 (vacuously perfect: no tool calls = no wrong tool calls),
matching the convention used for toolRecall override."
```

---

## Task 8: Fix schema description and stale comment

**Issues fixed:** 10 and 11

**Files:**
- Modify: `src/project/schema.ts:68`
- Modify: `src/optimizer/loop.ts:144-145`

### Background

**Issue 10:** `benchmark.apiKeyEnv` description says "default: OPENROUTER_API_KEY for format:pi, OPENAI_API_KEY for format:openai…" but the actual default is determined by the **model's provider prefix** (openrouter/, openai/, anthropic/), not by `benchmark.format`. A format:pi run with an `openai/` model defaults to `OPENAI_API_KEY`.

**Issue 11:** `loop.ts` comment says the agent in local-skill mode "runs with cwd=targetRepo". The actual code in `pi-coding.ts` (lines 19-24) sets cwd to `dirname(localSkillPath)` — the skill output directory — precisely to isolate the agent from the target repo.

- [ ] **Step 1: Fix the schema description in `src/project/schema.ts`**

Find (around line 68):

```typescript
  apiKeyEnv: z.string().optional().describe('Env var name for the API key (default: OPENROUTER_API_KEY for format:pi, OPENAI_API_KEY for format:openai, ANTHROPIC_API_KEY for format:anthropic)'),
```

Replace with:

```typescript
  apiKeyEnv: z.string().optional().describe('Env var name for the API key (default is determined by the model provider prefix: openrouter/ → OPENROUTER_API_KEY, openai/ → OPENAI_API_KEY, anthropic/ → ANTHROPIC_API_KEY; leave unset to use the per-provider default)'),
```

- [ ] **Step 2: Fix the stale comment in `src/optimizer/loop.ts`**

Find (around line 144):

```typescript
      // In local-skill mode: restore the repo to undo any rogue writes the agent may have made
      // (it runs with cwd=targetRepo), then skip scope validation (the local file is always in scope).
```

Replace with:

```typescript
      // In local-skill mode: restore the repo as a belt-and-suspenders safety net.
      // The agent runs with cwd=dirname(localSkillPath) (the output dir, not the target repo)
      // per pi-coding.ts, so rogue writes into the repo are unlikely but not impossible.
      // Scope validation is skipped because the local skill file is always in scope by construction.
```

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: zero errors, all pass.

- [ ] **Step 4: Commit**

```bash
git add src/project/schema.ts src/optimizer/loop.ts
git commit -m "fix(docs): correct apiKeyEnv description and loop.ts isolation comment

schema.ts: apiKeyEnv default is determined by model provider prefix (openrouter/openai/
anthropic), not by benchmark.format — a pi-format run with an openai/ model uses
OPENAI_API_KEY. loop.ts: the comment claimed the agent runs with cwd=targetRepo in
local-skill mode; actually cwd is dirname(localSkillPath) per pi-coding.ts."
```

---

## Task 9: Protect `generateCandidateTasksWithCoverage` retry path

**Issue fixed:** 12

**Files:**
- Modify: `src/tasks/generate.ts:269-275` (function signature area)

### Background

`generateCandidateTasksWithCoverage` calls `parseGeneratedTasks(retryRaw)` at line 298 without passing `knownCapabilityKeys`. If a prompt-surface snapshot were ever routed here, all `capabilityId` values from retry tasks would be silently dropped. Currently safe because `tasks/index.ts:73-80` explicitly branches prompt surface to `generateCandidateTasks`. The fix adds a defensive guard at the top of `generateCandidateTasksWithCoverage` and a comment on the retry call.

- [ ] **Step 1: Add guard and clarifying comment**

In `src/tasks/generate.ts`, find the `generateCandidateTasksWithCoverage` function (around line 269):

```typescript
export async function generateCandidateTasksWithCoverage(
  surface: DiscoveredTaskSurface,
  config: TaskGeneratorConfig,
  deps: TaskGeneratorDeps,
  inScopeActions: ActionDefinition[],
  outOfScopeActions: ActionDefinition[] = [],
): Promise<{ tasks: GeneratedTask[]; coverage: CoverageReport }> {
  // Iteration 1 — existing one-shot prompt
  const firstPass = await generateCandidateTasks(surface, config, deps);
```

Replace with:

```typescript
export async function generateCandidateTasksWithCoverage(
  surface: DiscoveredTaskSurface,
  config: TaskGeneratorConfig,
  deps: TaskGeneratorDeps,
  inScopeActions: ActionDefinition[],
  outOfScopeActions: ActionDefinition[] = [],
): Promise<{ tasks: GeneratedTask[]; coverage: CoverageReport }> {
  // Prompt surface must not enter this path — it uses generateCandidateTasks directly
  // (tasks/index.ts:73-80) because coverage enforcement does not apply and the retry
  // path would silently drop capabilityId from tasks (parseGeneratedTasks is called
  // without knownCapabilityKeys on line 298).
  if (surface.snapshot.surface === 'prompt') {
    throw new Error('generateCandidateTasksWithCoverage must not be called for prompt surface — use generateCandidateTasks directly');
  }

  // Iteration 1 — existing one-shot prompt
  const firstPass = await generateCandidateTasks(surface, config, deps);
```

- [ ] **Step 2: Run typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: zero errors, all pass. The guard will never fire under normal operation since the caller already branches away.

- [ ] **Step 3: Commit**

```bash
git add src/tasks/generate.ts
git commit -m "fix(generate): guard generateCandidateTasksWithCoverage against prompt surface

The retry path calls parseGeneratedTasks without knownCapabilityKeys, which would
silently drop capabilityId from all retry tasks if prompt surface were ever routed
here. tasks/index.ts already branches away, but the guard makes the invariant
explicit and catches accidental future misuse."
```

---

## Task 10: Replace brittle string match with structured error in critic

**Issue fixed:** 13

**Files:**
- Modify: `src/tasks/pi-simple-complete.ts` (export `NoTextBlocksError`)
- Modify: `src/tasks/default-pi-critic.ts` (catch by type)

### Background

`pi-simple-complete.ts` throws `new Error('Model returned no text blocks...')` when the model returns no text content. `default-pi-critic.ts` catches this by checking `err.message.startsWith('Model returned no text blocks')`. If the error message changes, the critic silently fails to catch it. A named error class makes the contract explicit and type-safe.

- [ ] **Step 1: Add `NoTextBlocksError` to `src/tasks/pi-simple-complete.ts`**

At the top of `src/tasks/pi-simple-complete.ts`, after the imports, add:

```typescript
export class NoTextBlocksError extends Error {
  readonly contentTypes: string;
  constructor(contentTypes: string) {
    super(`Model returned no text blocks${contentTypes ? ` (content types: ${contentTypes})` : ''}`);
    this.name = 'NoTextBlocksError';
    this.contentTypes = contentTypes;
  }
}
```

Then in the same file, find the throw at the end of `piSimpleComplete`:

```typescript
  if (!text) {
    const contentTypes = response.content.map((b) => b.type).join(', ');
    throw new Error(`Model returned no text blocks${contentTypes ? ` (content types: ${contentTypes})` : ''}`);
  }
```

Replace with:

```typescript
  if (!text) {
    const contentTypes = response.content.map((b) => b.type).join(', ');
    throw new NoTextBlocksError(contentTypes);
  }
```

- [ ] **Step 2: Update `src/tasks/default-pi-critic.ts` to catch by type**

Add the import at the top of `src/tasks/default-pi-critic.ts`:

```typescript
import { piSimpleComplete, NoTextBlocksError } from './pi-simple-complete.js';
```

(Replace the existing `import { piSimpleComplete } from './pi-simple-complete.js';`)

Then find:

```typescript
        if (err instanceof Error && err.message.startsWith('Model returned no text blocks')) {
          return '[]';
        }
```

Replace with:

```typescript
        if (err instanceof NoTextBlocksError) {
          return '[]';
        }
```

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: zero errors, all pass. The behaviour is identical — only the detection mechanism changes.

- [ ] **Step 4: Commit**

```bash
git add src/tasks/pi-simple-complete.ts src/tasks/default-pi-critic.ts
git commit -m "fix(critic): replace brittle error-string match with NoTextBlocksError class

pi-simple-complete.ts now throws NoTextBlocksError (a named subclass of Error)
instead of a generic Error with a sentinel message prefix. default-pi-critic.ts
catches by instanceof. The behaviour is unchanged but the contract is explicit
and won't silently break if the message text is ever edited."
```

---

## Final Verification

- [ ] **Run the full test suite one last time**

```bash
npm run typecheck && npm test
```

Expected: zero type errors, all smoke tests pass.

- [ ] **Check help still works**

```bash
npx tsx src/cli.ts --help
```

Expected: prints help with no errors.

- [ ] **Push and create PR**

```bash
git push -u origin fix/pr26-review-issues
gh pr create \
  --base development \
  --title "fix: address PR #26 code review findings (13 issues)" \
  --body "$(cat <<'EOF'
## Summary

Fixes 13 issues found during code review of PR #26 (v1.1.0):

- **Prompt surface preflight (critical):** `--dry-run` and `doctor` now exempt prompt surfaces from the `maxTasks < inScope` gate, matching the existing exemption in `tasks/index.ts`
- **Doctor error hints:** Discovery-failure and zero-actions hints are now surface-aware for prompt configs (points to `target.skill`, not `discovery.sources`)
- **Init guidance:** `init prompt` next-steps now shows prompt-specific guidance instead of falling through to MCP instructions
- **Wizard validator:** Custom model IDs now accept `anthropic/` and `openai/` prefixes, not just `openrouter/`
- **Task generation:** `validateTask` no longer crashes when the LLM elides `expected_actions: []` for prompt-surface tasks
- **Doc config path:** All user-facing docs now reference `.skill-optimizer/` (dot-prefixed) matching what `scaffold.ts` actually creates
- **Model ID in docs:** Updated stale `gpt-4o` example to `gpt-4o-mini` (in current presets)
- **Snapshot error:** Unsupported-format error now includes `snapshotPath` for easier debugging
- **Prompt metrics:** `toolPrecision` is now set to `1.0` for prompt tasks (was always `0.0`, making reports misleading)
- **Schema description:** `apiKeyEnv` description now correctly says defaults depend on model provider prefix, not `benchmark.format`
- **Loop comment:** Corrected stale comment in `loop.ts` — agent cwd in local-skill mode is the output dir, not the target repo
- **Generate guard:** `generateCandidateTasksWithCoverage` now throws if called with a prompt surface (invariant was implicit, now explicit)
- **Structured error:** `NoTextBlocksError` class replaces brittle `message.startsWith()` check in `default-pi-critic.ts`

## Test Plan
- [ ] `npm run typecheck` — zero errors
- [ ] `npm test` — all smoke tests pass
- [ ] Manual: `npx tsx src/cli.ts init prompt` — next-steps shows correct guidance
- [ ] Manual: `npx tsx src/cli.ts run --dry-run --config <prompt-config>` with `maxTasks:1`, 12 capabilities — no longer errors

Closes findings from: https://github.com/fastxyz/skill-optimizer/pull/26#issuecomment-4265764667
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- Issue 1 (init.ts next-steps) → Task 2 ✓
- Issue 2 (wizard validator) → Task 3 ✓
- Issue 3 (generate task fallback) → Task 4 ✓
- Issue 4 (maxTasks preflight cli + doctor) → Task 1 ✓
- Issue 5 (doctor hint) → Task 1 ✓
- Issue 6 (doc path) → Task 5 ✓
- Issue 7 (snapshot error) → Task 6 ✓
- Issue 8 (stale model ID) → Task 5 ✓
- Issue 9 (toolPrecision) → Task 7 ✓
- Issue 10 (schema description) → Task 8 ✓
- Issue 11 (loop comment) → Task 8 ✓
- Issue 12 (retry guard) → Task 9 ✓
- Issue 13 (structured error) → Task 10 ✓

**2. Placeholder scan:** No TBDs or "handle edge cases" — every step has exact code.

**3. Type consistency:** `NoTextBlocksError` is defined in Task 10 Step 1 and imported in Task 10 Step 2. All method names match existing codebase patterns.
