# Optimization Loop

This guide covers when and how to use the automatic optimizer, how to interpret its results, and what to do when it doesn't converge.

## 1. When to Optimize vs. Fix Manually

**Fix manually** when the benchmark reveals a clear, localized problem — a missing section, a wrong example, an outdated method name. Manual fixes are faster and more precise for known issues.

**Run the optimizer** when failures are scattered across multiple models and tasks with no obvious single fix. The optimizer systematically tries mutations to your SKILL.md and keeps only changes that improve scores.

A good workflow: run a benchmark, fix the obvious stuff by hand, re-benchmark, then let the optimizer handle whatever's left.

## 2. How the Loop Works

1. **Baseline benchmark** — establish starting scores for all models
2. **Copy** — your SKILL.md is copied to `.skill-optimizer/skill-v0.md` (original is never touched)
3. **Failure analysis** — identify patterns in what models get wrong
4. **Mutation** — a mutation agent (powered by `optimize.model`, defaults to Claude Opus via OpenRouter) proposes edits to the versioned copy
5. **Re-benchmark** — run all models against all tasks using the mutated skill
6. **Accept or reject** — the mutation is accepted only if:
   - The weighted average improves by at least `minImprovement`
   - No model that was above the floor drops below it
7. **Rollback** if rejected — revert to the previous version
8. **Repeat** up to `maxIterations` times
9. **Progress table** — final output shows Baseline -> each iteration -> Final -> delta per model

## 3. Safety Guarantees

The optimizer is designed to be safe to run:

- **Your original SKILL.md is never modified.** All edits happen on versioned copies in `.skill-optimizer/skill-v0.md`, `skill-v1.md`, etc.
- **`requireCleanGit`** is enforced by default — the optimizer won't run if your target repo has uncommitted changes
- **`allowedPaths`** constrains which files the mutation agent can edit (defaults to just the skill file)
- **Stabilization window** prevents oscillation — if the same mutation keeps getting accepted and rejected, the optimizer exits early

## 4. Running the Optimizer

```bash
npx skill-optimizer optimize --config <config-path>
```

Output during the run:
- Current iteration number and total
- Per-model scores after each mutation attempt
- Accept/reject decision with reasoning
- Running progress table

The optimizer can take several minutes per iteration (it runs a full benchmark each time).

## 5. Key Config Knobs

| Setting | Default | What it controls |
|---------|---------|------------------|
| `optimize.maxIterations` | `5` | Upper bound on optimization rounds |
| `optimize.mode` | `"stable-surface"` | `"stable-surface"`: reuse tasks across iterations (faster, apples-to-apples). `"surface-changing"`: regenerate tasks each iteration (if skill changes might affect task phrasing) |
| `optimize.model` | `"openrouter/anthropic/claude-opus-4.6"` | Which LLM writes mutations |
| `optimize.enabled` | `true` | Set to `false` to skip optimization (useful in CI) |
| `optimize.requireCleanGit` | `true` | Block optimizer if target repo has uncommitted changes |

## 6. Interpreting Results

**Progress table** — rows are models, columns are iterations. Shows the score trajectory for each model across the optimization run.

**Accepted iteration** — the mutation improved scores without violating either gate. The versioned copy advances to `skill-v{N+1}.md`.

**Rejected iteration** — the mutation either didn't improve the weighted average enough, or it caused a model to drop below the floor. The previous version is kept and the optimizer tries a different mutation.

**Early exit** — if scores plateau for consecutive iterations, the optimizer may stop before reaching `maxIterations`. This is normal and means further mutations aren't producing meaningful improvements.

## 7. After Optimization

The best version is the highest-numbered `skill-v{N}.md` in `.skill-optimizer/`. To apply it:

```bash
# 1. See what changed
diff SKILL.md .skill-optimizer/skill-v3.md   # adjust N to your highest version

# 2. Review the diff — the optimizer is a tool, not an oracle
#    Look for: overly specific examples, removed important context, awkward phrasing

# 3. Copy it back
cp .skill-optimizer/skill-v3.md SKILL.md

# 4. Commit
git add SKILL.md
git commit -m "docs: apply skill-optimizer improvements (v3)"
```

## 8. When It Doesn't Converge

If the optimizer oscillates or plateaus without reaching your target scores:

**Narrow the scope** — exclude actions that are inherently ambiguous or rarely used. A smaller, cleaner scope gives the optimizer more room to improve what matters.

**Improve discovery** — make sure `discovery.sources` points at the right files. If the surface is incomplete (missing actions), the optimizer is working with bad data.

**Manual intervention** — read the failure analysis output from the last iteration. It often reveals patterns that a targeted manual edit can fix more effectively than automated mutation.

**Adjust gates** — if `perModelFloor` or `targetWeightedAverage` are set very high, lower them to something achievable first. Optimize to hit that floor, then ratchet up gradually.

**Try different models** — change `optimize.model` to a different LLM. Different models have different strengths in rewriting documentation.
