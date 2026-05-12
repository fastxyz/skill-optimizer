# PR #3 — vercel-labs/agent-browser: add Pre-flight section

**Target:** `vercel-labs/agent-browser`
**File:** `skill-data/core/SKILL.md` (NOT `skills/agent-browser/SKILL.md` — see Caveats)
**Base branch:** `main`
**Title:** `docs(skill): add pre-flight section discouraging curl/wget fallback`

## Body

```markdown
## Summary

- Adds a small additive `## Pre-flight` section to the core skill telling agents to verify the CLI is installed (`which agent-browser`) and NOT to fall back to `curl`, `wget`, `requests`, or `npm install`/`npx`.
- Closes a real failure mode: across a 3-model eval matrix (claude-sonnet-4.6, openai/gpt-5, google/gemini-2.5-pro × 3 trials × 2 cases), Gemini fell back to `curl` for HTTP fetches once in 9 trials despite the skill prescribing `agent-browser navigate`. Smaller/older models in earlier runs (gpt-5-mini) did this more frequently.
- Purely additive — 11 lines inserted, no existing content changed.

## Test plan

- [ ] Read the diff; confirm additive only
- [ ] Verify no formatting regressions in the surrounding sections
- [ ] (Optional) Run the agent-browser self-tests if any
```

## File diff

Target: `skill-data/core/SKILL.md` (the real content file per `AGENTS.md`)

```diff
@@ near the top of the file, after the initial install/intro block @@

 Install: `npm i -g agent-browser && agent-browser install`

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

 This file is a discovery stub, not the usage guide. Before running any
```

The full proposed `after-SKILL.md` is checked into our repo at:

- [`examples/workbench/agent-browser/proposed-upstream-changes/vercel-labs-agent-browser/after-SKILL.md`](../../../examples/workbench/agent-browser/proposed-upstream-changes/vercel-labs-agent-browser/after-SKILL.md)
  (note: the auto-pilot's proposal points at `skills/agent-browser/SKILL.md`; for the
  upstream PR we re-target to `skill-data/core/SKILL.md` per AGENTS.md)

## Caveats

1. **Location adjustment.** The auto-pilot proposed adding Pre-flight
   to `skills/agent-browser/SKILL.md`. Per the upstream `AGENTS.md`,
   that file is intentionally a thin discovery stub and feature content
   lives in `skill-data/core/SKILL.md`. We retarget the change to the
   correct file when submitting.

2. **CI strictness.** This repo runs Rust fmt/clippy/test + dashboard
   `pnpm build` + version-sync on every PR. Docs-only changes should
   pass automatically. If anything trips, the diff is so small that
   the fix is trivial.

3. **No dashboard/MDX page update needed?** Per AGENTS.md, "Any skill
   improvement PR must touch `skill-data/core/SKILL.md` and its
   `references/` files, plus README and docs MDX pages." This change
   is so minor (a single ## section) that it likely doesn't need the
   README or MDX updates — but worth checking with the maintainer
   (`ctate`) in the PR description if you want zero-friction merge.
   Alternative: also add a one-line bullet to README's "Tips" or
   equivalent that says "verify install with `which agent-browser`".

4. **Deeper-eval pilot timed out.** A v1.2.1 re-run with 4 new Tier-1
   cases (ref-based-search, ref-disambiguation, output-correctness,
   multi-step-state — pre-recorded fixtures, stateful fake CLI, all
   smoke-tested) was attempted in this session to surface harder
   failure modes than the original 2-case Tier-0 eval. The pilot was
   killed by the wrapper's 90-min hard timeout mid-baseline (50/54
   trials complete, no Phase 5 commit). The deeper eval itself is
   committed at branch `eval/agent-browser-deeper-v1` (commit
   `f0883ad`); the partial baseline trial data is preserved at
   `examples/workbench/agent-browser/.results/20260512-101220/` and
   could be analyzed in a future session. For this PR we ship the
   original Pre-flight diff (eval baseline 0.97, 1 of 9 Gemini trials
   used `curl` instead of `agent-browser navigate`) since the deeper
   eval's measurement was incomplete.

## Operator steps to submit

```bash
# 1. Clone fork
git clone git@github.com:fastxyz/agent-browser.git /tmp/upstream-agent-browser
cd /tmp/upstream-agent-browser
git remote add upstream https://github.com/vercel-labs/agent-browser.git
git fetch upstream
git checkout -b docs/skill-pre-flight upstream/main

# 2. Apply the change (manual edit to skill-data/core/SKILL.md)
# The diff is small — paste the +11 lines after the install line.

# 3. Commit + push (conventional commits per the repo's style)
git add skill-data/core/SKILL.md
git commit -m "docs(skill): add pre-flight section discouraging curl/wget fallback"
git push -u origin docs/skill-pre-flight

# 4. Open PR
gh pr create --repo vercel-labs/agent-browser --base main \
  --title "docs(skill): add pre-flight section discouraging curl/wget fallback" \
  --body-file path/to/this-draft-body.md
```
