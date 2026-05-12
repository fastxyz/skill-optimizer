# Upstream PR drafts

Polished PR drafts for the first round of upstream contributions. Each
draft is ready to copy-paste into the actual upstream repo after a
final review. The actual `git push` to a fork + `gh pr create` is left
to the operator (the orchestrator only drafts).

## Drafts (current canonical set)

| # | Skill | Target repo | Provenance | Status |
|---|---|---|---|---|
| 1 | web-design-guidelines (rules doc) | `vercel-labs/web-interface-guidelines` | v1.2.1 auto-pilot, eval 0.92→1.00 | [draft](./1-vercel-labs-web-interface-guidelines.md) |
| 3 | agent-browser (Pre-flight) | `vercel-labs/agent-browser` | v1.0 auto-pilot baseline 0.97 (preventive, unmeasured fix); deeper-eval v1.2.1 pilot in flight | [draft](./3-vercel-labs-agent-browser-pre-flight.md) |
| 4 | supabase-postgres-best-practices | `supabase/agent-skills` | v1.2.1 pilot in flight (with intent context file forcing reshape to fit upstream convention) | [draft](./4-supabase-agent-skills-two-pass.md) |

The wrapper-skill PR target (`vercel-labs/agent-skills/skills/web-design-guidelines/SKILL.md`)
was dropped — see `superseded/README.md`. The SKILL.md is a thin
discovery-stub adapter; all value lives in `command.md` (PR #1).

## Process to submit each PR

1. **Fork** the upstream repo on GitHub (or use an existing fork).
2. **Clone the fork** locally outside this repo (e.g.
   `git clone git@github.com:fastxyz/<upstream-repo>.git /tmp/upstream-<repo>`).
3. **Make the changes** described in the draft on a new branch.
4. **Run any local checks** the convention doc calls for (e.g.
   `pnpm test:sanity` for supabase — but note: sanity test does NOT
   validate per-reference frontmatter; convention is enforced by
   maintainer review).
5. **Commit + push** to the fork.
6. **Open the PR** with the title/body from the draft. Use
   `gh pr create --base main --repo <upstream> --title "..." --body "..."`.
7. **Link** the resulting URL back to this draft for traceability.

## Conventions reference

See [`../upstream-pr-conventions.md`](../upstream-pr-conventions.md) for
the per-repo title format, body convention, CI gates, and gotchas
discovered while researching each upstream.

## Superseded drafts

Earlier drafts (pre-v1.2.1, pre-research) are archived under
[`superseded/`](./superseded/) for historical reference.
