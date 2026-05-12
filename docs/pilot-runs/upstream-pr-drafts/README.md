# Upstream PR drafts

Polished PR drafts for the first round of upstream contributions. Each
draft is ready to copy-paste into the actual upstream repo after a
final review. The actual `git push` to a fork + `gh pr create` is left
to the operator (the orchestrator only drafts).

## Drafts in this round (top 3 skills from prioritized list)

| # | Skill | Target repo | Status |
|---|---|---|---|
| 1 | web-design-guidelines (SKILL.md) | `vercel-labs/agent-skills` | [draft](./1-vercel-labs-agent-skills-web-design-guidelines.md) |
| 2 | web-design-guidelines (rules doc) | `vercel-labs/web-interface-guidelines` | [draft](./2-vercel-labs-web-interface-guidelines.md) |
| 3 | agent-browser (Pre-flight section) | `vercel-labs/agent-browser` | [draft](./3-vercel-labs-agent-browser-pre-flight.md) |
| 4 | supabase-postgres-best-practices | `supabase/agent-skills` | [draft](./4-supabase-agent-skills-two-pass.md) |

## Process to submit each PR

1. **Fork** the upstream repo on GitHub (or use an existing fork).
2. **Clone the fork** locally outside this repo (e.g.
   `git clone git@github.com:fastxyz/<upstream-repo>.git /tmp/upstream-<repo>`).
3. **Make the changes** described in the draft on a new branch.
4. **Run any local checks** the convention doc calls for (e.g.
   `pnpm test:sanity` for supabase).
5. **Commit + push** to the fork.
6. **Open the PR** with the title/body from the draft. Use
   `gh pr create --base main --repo <upstream> --title "..." --body "..."`.
7. **Link** the resulting URL back to this draft for traceability.

## Conventions reference

See [`../upstream-pr-conventions.md`](../upstream-pr-conventions.md) for
the per-repo title format, body convention, CI gates, and gotchas
discovered while researching each upstream.
