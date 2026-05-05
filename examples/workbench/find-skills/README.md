# find-skills Workbench Demo

This suite evaluates the [`find-skills`](https://github.com/vercel-labs/skills) meta-skill,
which teaches an agent to recognise when a request might already be solved by an installable
skill from the open agent skills ecosystem.

The eval grades **discovery instinct** — both halves:

- `discover-react-perf` (positive): agent should run `npx skills find` with a
  React/performance query and write a `npx skills add ...` install command to
  `answer.txt`.
- `no-search-readme` (negative): agent should NOT invoke the skills CLI for a
  bespoke task (summarising a local README), and should produce a 3-bullet summary.

Pure trace + workspace state grading — no network access or registry mocking.

## Run The Demo

```bash
npx tsx src/cli.ts run-suite examples/workbench/find-skills/suite.yml --trials 1
```

Results land at `examples/workbench/find-skills/.results/<run-id>/`.
