# Upstream PR drafts

Polished PR drafts for the first round of upstream contributions. Each
draft is ready to copy-paste into the actual upstream repo after a
final review. The actual `git push` to a fork + `gh pr create` is left
to the operator (the orchestrator only drafts).

## Drafts (current canonical set — 3 strong measured uplifts)

| # | Skill | Target repo | Evidence | Draft |
|---|---|---|---|---|
| 1 | web-design-guidelines (rules doc) | `vercel-labs/web-interface-guidelines` | **Strong.** v1.2.1 measured **0.92→1.00 (+0.08)** across 18 trials × 3 frontier models. 22-line additive `Per-element checklist`. | [draft](./1-vercel-labs-web-interface-guidelines.md) |
| 5 | shadcn-ui code review checklist | `google-labs-code/stitch-skills` | **Strong.** v1.3 orchestrator measured **0.667→0.889 (+0.222)** on gpt-5 frontier matrix. 50-line additive `Code Review Checklist` + custom-component placement BAD/GOOD. | [draft](./5-google-labs-code-stitch-skills-shadcn-ui.md) |
| 6 | firebase-hosting-basics configuration review | `firebase/agent-skills` | **Strong.** v1.3 orchestrator measured **0.89→1.00 (+0.11)** on frontier matrix. First full v1.3 Phase 3.5 demo (orchestrator added 2 harder cases, then iterated skill). 33-line additive `Configuration Review` (two-pass). | [draft](./6-firebase-agent-skills-hosting-basics.md) |

All three drafts have measured uplift on the frontier model matrix
(claude-sonnet-4.6, openai/gpt-5, google/gemini-2.5-pro × 3 trials).

## Process to submit each PR

1. **Fork** the upstream repo on GitHub (or use an existing fork).
2. **Clone the fork** locally outside this repo (e.g.
   `git clone git@github.com:fastxyz/<upstream-repo>.git /tmp/upstream-<repo>`).
3. **Make the changes** described in the draft on a new branch.
4. **Run any local checks** the convention doc calls for. Note: drafts #5
   and #6 require signing the **Google CLA** ([cla.developers.google.com](https://cla.developers.google.com/))
   — one-time step covering all Google-Open-Source projects.
5. **Commit + push** to the fork.
6. **Open the PR** with the title/body from the draft. Use
   `gh pr create --base main --repo <upstream> --title "..." --body "..."`.
7. **Link** the resulting URL back to this draft for traceability.

## Conventions reference

See [`../upstream-pr-conventions.md`](../upstream-pr-conventions.md) for
the per-repo title format, body convention, CI gates, and gotchas
discovered while researching each upstream.

## Methodology

The drafts above are outputs of the **auto-improve-skill** pipeline.
See [PR #50](https://github.com/fastxyz/skill-optimizer/pull/50) for
the v1.3 orchestrator architecture and `docs/auto-improve-skill-v1.3-spec.md`
in that PR for the design rationale.

Briefly: each orchestrator subagent is dispatched against one upstream
skill, runs a 5-phase pipeline (research → baseline → eval-iterate →
skill-iterate → package), and produces a proposed-upstream-changes/
directory. Drafts #5 and #6 are end-to-end v1.3 orchestrator runs;
draft #1 is from the predecessor v1.2.1 wrapper.
