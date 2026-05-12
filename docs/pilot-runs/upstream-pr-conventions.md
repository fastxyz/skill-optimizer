# Upstream PR conventions for skill repositories

Operational guide for submitting skill-improvement PRs to upstream
maintainers. Each row was verified by reading the repo's
`AGENTS.md` / `CONTRIBUTING.md` / `.github/workflows/` + scanning the
last 5–10 merged PRs. Update this doc when we observe new patterns.

## Quick reference

| Repo | License | Style | Title format | Body | CI gates | CLA |
|---|---|---|---|---|---|---|
| `vercel-labs/agent-skills` | (no LICENSE) | casual | `{skill}: <change>` | `## Summary` + `## Test plan` | path-filtered (only fires for react-best-practices changes) | no |
| `vercel-labs/web-interface-guidelines` | MIT | terse | sentence-case freeform, optional `feat:`/`fix:` | 1–2 sentences | none (no workflows) | no |
| `vercel-labs/agent-browser` | Apache-2.0 | formal | `feat/fix/docs(scope): description` (conventional commits) | `## Summary` + `## Test plan` | Rust fmt/clippy/test + dashboard build + version-sync | no CLA bot observed |
| `supabase/agent-skills` | MIT | formal | `feat/fix/docs: description` (conventional commits, used by Release Please) | terse `## Summary` bullets | `pnpm test:sanity` only | no (CONTRIBUTING.md states MIT auto-license) |

## Per-repo notes

### `vercel-labs/agent-skills`

- **Title**: `{skill-name}: <what changed>` — skill name as the scope, no
  conventional-commit prefix needed.
- **Body**: Multi-section. Use `## Summary` bullets + `## Test plan`
  checkboxes. 600–2500 chars is the observed norm. Claude Code footer
  (`🤖 Generated with Claude Code`) is fully normalized — appears in
  multiple merged PRs.
- **CI**: One workflow (`react-best-practices-ci.yml`) is path-filtered;
  unless our change touches `skills/react-best-practices/**`, it won't
  fire. Vercel deploy preview is cosmetic, not blocking.
- **Merge style**: Squash. Maintainer (`bhrigu123`) approves silently and
  same-day for clean PRs.
- **PR scope**: Tight per-skill (one skill per PR). Improvements to
  existing skills merge faster than new-skill additions (PR #238
  proposing a brand-new skill has sat for weeks).
- **Gotcha**: Some skills have a `.zip` alongside the directory. Not
  blocking but a known convention.

### `vercel-labs/web-interface-guidelines`

- **Title**: Freeform sentence (e.g., `Add translate="no" guideline for
  verbatim content`) or `feat:`/`fix:` prefix — both merged.
- **Body**: Minimal. PR #20 is exemplary: two sentences of rationale, no
  headers. 0–400 chars is the observed norm.
- **CI**: No workflows. Zero automated checks.
- **Merge style**: Silent approve from `JohnPhamous` (Vercel staff).
- **Sync constraint**: `README.md` and `AGENTS.md` are dual copies of
  the same content (one human-readable, one agent-readable). If we add
  or change a guideline, **touch both files** in the same PR. PR #20
  did this; ours should too.
- **Pace**: Repo is low-traffic (48 forks, last merge ~5 weeks ago).
  Expect slow response. Don't optimize for immediate merge.

### `vercel-labs/agent-browser`

- **Title**: Strict conventional commits — `feat(scope): description`,
  `fix(scope): description`, `docs: description`. Scope is the
  subsystem (`docs`, `doctor`, `native`, etc.).
- **Body**: `## Summary` (2 bullets) + `## Test plan` (2 checkboxes).
  PR #1305 is a reference template.
- **CI**: Strict. Three blocking jobs (Rust fmt+clippy+test, dashboard
  pnpm build, version-sync). **Docs-only and skill-data-only changes
  should pass automatically**; anything touching Rust will trigger
  expensive checks.
- **Merge style**: `ctate` is sole maintainer; very active, merges
  same-day silently for clean PRs.
- **Critical gotcha**: Skill content lives at
  `skill-data/core/SKILL.md`, **not** at `skills/agent-browser/SKILL.md`
  (which is intentionally a thin stub per AGENTS.md). Any meaningful
  skill change touches:

  1. `skill-data/core/SKILL.md`
  2. `skill-data/core/references/*.md` (the per-rule reference docs)
  3. `README.md`
  4. The docs MDX pages

  Per AGENTS.md, omitting any of these is grounds for rejection. Use
  HTML `<table>` syntax in MDX (not markdown pipe tables).
- **PR scope**: Tight per subsystem. Docs-only changes are the
  lowest-friction path — they bypass the Rust CI gates.

### `supabase/agent-skills`

- **Title**: Strict conventional commits — `feat: <description>`,
  `fix: <description>`, `docs: <description>`. Release Please uses these
  to determine semver bumps. **Do not** bump `metadata.version`
  manually in SKILL.md — Release Please handles it post-merge.
- **Body**: Short `## Summary` with 1–4 bullets. Link issues with
  `Resolves AI-NNN` if applicable. No template.
- **CI**: One job — `Skills CI` runs `pnpm test:sanity`. Sanity tests
  check that new reference files follow the `{prefix}-{name}.md`
  naming convention with valid frontmatter (`title`, `impact`, `tags`).
  Run `pnpm test:sanity` locally before submitting.
- **Merge style**: Squash. `gregnr` (Supabase staff) and `Rodriguespn`
  (sole active community maintainer) merge in under 30 min for clean
  PRs by core team members; external PRs may need a single LGTM.
- **PR scope**: Additive file change only. Add a new reference file
  under `skills/<skill-id>/references/{prefix}-{name}.md` with proper
  frontmatter + Incorrect/Correct examples. CONTRIBUTING.md says
  significant new skills need a prior GitHub Discussion; reference
  additions don't.

## Process for our own PRs

For each PR we submit:

1. **Branch** off a fresh local clone of the upstream repo, NOT off our
   `examples/workbench/<skill-id>/proposed-upstream-changes/`. Copy the
   `after-*.md` content into the actual upstream file paths.
2. **Run any local checks** the repo requires (e.g., `pnpm test:sanity`
   for supabase).
3. **Title and body** per the table above.
4. **Add the Claude Code footer** unless the repo's style sheet objects
   (vercel-labs repos accept it; supabase hasn't shown a precedent
   either way).
5. **Cap each PR to one skill**. If a skill has both a SKILL.md change
   and a rules-doc change (as web-design-guidelines does, spanning two
   repos), open two PRs and reference each from the other.

## Reference: which repo each skill lives in

| Our top-N skill | SKILL.md repo | Rules doc repo (if separate) |
|---|---|---|
| `vercel-labs/agent-skills/web-design-guidelines` | `vercel-labs/agent-skills` | `vercel-labs/web-interface-guidelines` |
| `vercel-labs/agent-browser/agent-browser` | `vercel-labs/agent-browser` (`skill-data/core/SKILL.md`) | n/a (inline) |
| `supabase/agent-skills/supabase-postgres-best-practices` | `supabase/agent-skills` | n/a (inline via `references/`) |

Future skills we run on will surface their own conventions. Append
them here.
