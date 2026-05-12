# Auto-pilot context: vercel-labs/agent-browser

## Workbench is ALREADY BUILT (Tier-1 deeper eval) — skip rebuilding

`examples/workbench/agent-browser/` is already populated with a
hand-built Tier-1 eval (4 cases beyond the 2 inherited Tier-0 cases =
6 cases total) that uses **pre-recorded snapshots played back by a
stateful fake CLI**. DO NOT rebuild it. Specifically:

- **Phase 1 (Discover):** classify the skill (`tool-use`) but DO NOT
  WebFetch upstream SKILL.md or rules docs. The vendored copies at
  `references/agent-browser/SKILL.md` and
  `references/agent-browser/agent-browser-core.md` are authoritative
  for this pilot.
- **Phase 2 (Build suite):** SKIP ENTIRELY. Verify the existing
  `suite.yml`, `workspace/`, `bin/agent-browser`, `references/`, and
  `checks/` files are present and proceed. DO NOT overwrite ANY of
  them. If a file is missing, exit `status: blocked-by-error` —
  something has gone wrong with the cherry-pick, not your fault.
- **Phase 3 (Baseline):** run normally. Use the existing 6-case suite
  with the standard model matrix.

## Optimization target file

**Edit:** `references/agent-browser/agent-browser-core.md`

This is the vendored copy of upstream `skill-data/core/SKILL.md` — the
**actual workflow content** that teaches the agent how to use
agent-browser (navigate, snapshot, click @eN, type @eN, etc.). When the
agent runs `agent-browser skills get core`, the fake CLI emits this
file's contents.

**Do NOT edit:**

- `references/agent-browser/SKILL.md` — that's the discovery stub. Per
  upstream `AGENTS.md`, it's intentionally thin and should not contain
  workflow content.
- `bin/agent-browser` (the fake CLI), `suite.yml`, `workspace/`, or any
  file under `checks/` — those are the eval harness and must stay
  fixed; modifying them invalidates the measurement.

## Architecture intent (from prior research)

- Upstream repo is `vercel-labs/agent-browser` (Rust CLI for
  Chrome/Chromium automation via CDP, designed for AI agents).
- The split is intentional: `skills/agent-browser/SKILL.md` is a thin
  discovery stub; the real workflow content lives at
  `skill-data/core/SKILL.md` and is loaded by the agent at runtime via
  `agent-browser skills get core`. This keeps the SKILL.md token-cheap
  and lets the workflow doc evolve with the CLI version.
- License: Apache-2.0, no CLA observed.
- Maintainer: `ctate` (sole, very active; same-day merges for clean
  PRs).
- Strict CI: Rust fmt + clippy + test + dashboard `pnpm build` +
  version-sync. **Docs-only changes (changes confined to
  `skill-data/core/SKILL.md` or its references) pass automatically** —
  do not touch any Rust file or dashboard code.
- Conventional commits required: `feat(scope):`, `fix(scope):`,
  `docs(scope): description`. Scope is the subsystem (`docs`,
  `doctor`, `native`, etc.).
- Per upstream AGENTS.md: "Any skill improvement PR must touch
  `skill-data/core/SKILL.md` and its `references/` files, plus
  `README` and the docs MDX pages." This 4-file mirror is a packaging
  concern at PR-draft time, not auto-pilot scope. Auto-pilot should
  produce just the proposed change to `skill-data/core/SKILL.md`; the
  PR-draft step manually mirrors the relevant additions to README and
  MDX.

## What the deeper eval tests (informs which additions are likely valuable)

| Tier-0 (existing) | Tier-1 (new) |
|---|---|
| Tool-was-invoked-at-all | **Ref correctness** — agent must `click @eN` where `@eN` is the right element from the recorded snapshot |
| `skills get core` was called first | **Snapshot-first discipline** — must `snapshot` before any `click`/`type` |
| `navigate` (not `curl`/`wget`) | **No CSS selectors** — `click "#button"` fails; `click @e3` passes |
| Snapshot/screenshot was called | **Content correctness** — `title.txt` must equal the actual title from the recording, not just non-empty |
| Output file is non-empty | **State-machine path completeness** — multi-step flows: `type @e5 → type @e6 → click @e7 → re-snapshot → extract` |

Likely failure modes (and where additive guidance helps):

- Agents fall back to CSS selectors when an element name "looks
  obvious" → recipe: explicit "NEVER use CSS selectors. Always use
  `@eN` refs from the most recent snapshot." (Recipe D — BAD/GOOD
  example showing wrong vs right.)
- Agents skip `snapshot` when they "know" what's on the page → recipe:
  "Always `snapshot` immediately after `navigate`, and again after any
  `click`/`type` that changes state. The snapshot is your only source
  of valid `@eN` refs."
- Agents pick the wrong `@eN` when multiple visually-similar elements
  exist → recipe: per-action checklist "Read the snapshot's role +
  label fields before choosing a ref."
- Agents extract content from the wrong recording field (kicker vs h1
  vs byline) → recipe: explicit "When asked for the article title,
  use the `<h1>` text, not the kicker or byline."

## Hard constraints

1. **Additive only.** No deletions, no rewording of existing core.md
   content.
2. **Style:** match the existing `agent-browser-core.md` voice — terse,
   command-oriented bullet lists. Examples are encouraged (BAD/GOOD
   blocks). No prose paragraphs.
3. **Length budget:** the existing `agent-browser-core.md` is ~90 lines.
   Additions of 20–40 lines are reasonable; >60 lines is suspect (means
   you're rewriting, not augmenting).
4. **Do not modify the fake CLI or the eval harness.** If you find a
   genuine grader bug (e.g. graders mismark a correct trace), fix the
   GRADER (per the prompt's grader-vs-skill check, free retry not
   counted against iteration budget) — do NOT change the skill content
   to satisfy a buggy grader.
5. **Fake-CLI awareness.** The fake CLI is stateful — it tracks which
   page the agent is on (`/work/.ab-state`) and which post-action
   snapshot to serve next. Recordings define which `@eN` refs exist on
   each page+state. Your skill changes should encourage agents to
   actually USE the snapshot's refs, not invent them.

## Packaging

When Phase 5 packages the proposed change:

- Name files `before-skill-data-core-SKILL.md` /
  `after-skill-data-core-SKILL.md` (the upstream target file is at
  `skill-data/core/SKILL.md`)
- Put them under
  `proposed-upstream-changes/vercel-labs-agent-browser/` (matches
  prior pilot's directory layout)
- Per upstream AGENTS.md, the human PR-draft step (separate from this
  pilot) will also mirror the relevant additions into upstream
  `README.md` and the docs MDX pages. Auto-pilot is NOT responsible
  for those mirrors.

## Risk profile

- LOW for additive changes to `skill-data/core/SKILL.md` if the diff
  is small and matches existing voice. ctate ships docs-only PRs
  same-day.
- MEDIUM if the diff is large or rewords existing content (slight
  drift from "additive only" trips clippy-style review).
- HIGH if any non-docs file is touched (Rust changes trigger expensive
  CI; not in scope here).
