# Auto-improve-skill pilot runs

> **Note (v1.3):** The `tools/auto-improve-skill.mjs` wrapper referenced in this README has been removed. The current invocation is via the `skills/auto-improve-orchestrator/` Claude Code skill — operator dispatches the orchestrator subagent via the Agent tool. See `docs/auto-improve-skill-v1.3-spec.md` and `skills/auto-improve-orchestrator/SKILL.md` for current usage. The historical commands in this file are preserved for reference but should not be used.

Summaries of batched runs of the `tools/auto-improve-skill.mjs` auto-pilot
against public agent skills from our prioritized top-N list. Each summary
documents what skills ran, what the auto-pilot proposed, what worked, what
didn't, and what changes we should make to the prompt before the next batch.

The per-skill eval artifacts (suite, graders, vendored upstream, proposed-upstream-changes/)
live on `eval/auto-pilot/<skill-id>` branches and the consolidated
`eval/auto-pilot/batch-<n>-<date>` branches.

## Index

- [`2026-05-08-auto-improve-pilot-summary.md`](./2026-05-08-auto-improve-pilot-summary.md)
  — Batch 1, 3 skills (agent-browser, supabase-postgres-best-practices, pdf).
  Validated end-to-end. 3/3 success.
- [`2026-05-09-auto-improve-batch-2-summary.md`](./2026-05-09-auto-improve-batch-2-summary.md)
  — Batch 2, 10 skills (pptx, next-best-practices, firebase-auth-basics,
  firebase-hosting-basics, building-native-ui, shadcn-ui, native-data-fetching,
  firecrawl-build-scrape, next-upgrade, prd). 8/10 success, 2/10 uplift-too-small.

## How to run a new batch

```bash
# Single skill from the main repo:
node tools/auto-improve-skill.mjs <owner>/<repo>/<skill-id> [--budget 10]

# Parallel batch via git worktrees:
for i in {1..N}; do
  git worktree add ../wt-pilot-$i -b auto-pilot/wt-batch-$i feat/auto-improve-skill
  cp -al node_modules dist ../wt-pilot-$i/
  cp .env ../wt-pilot-$i/
done

# Then fire one wrapper invocation per worktree in parallel.
```

After all pilots complete, cherry-pick each `eval/auto-pilot/<skill-id>` onto
a consolidated batch branch and open a PR.
