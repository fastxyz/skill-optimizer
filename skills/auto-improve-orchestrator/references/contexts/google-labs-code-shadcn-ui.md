# Auto-pilot context: google-labs-code/stitch-skills — shadcn-ui

## Repository facts

- Repo: `google-labs-code/stitch-skills`
- License: Apache-2.0, Google CLA required (contributors must sign)
- Maintainers: google-labs-code org (Google Labs)
- Merge style: squash, conventional commits (no Release Please observed)
- CI: validates `react-components/` subtree only; shadcn-ui skill changes bypass CI gating
- Discovery index / downstream sync: listed in stitch-skills catalog; no external sync observed

## Hard constraints (additive-only PR)

- Add content ONLY to `skills/shadcn-ui/SKILL.md` (additive — new sections, examples, checklists)
- DO NOT modify other skill files or the `react-components/` source
- DO NOT bump `metadata.version` manually (no Release Please; version managed by maintainers)
- DO NOT delete or reword existing rules in `SKILL.md`
- DO NOT reorder existing sections
- Keep voice: imperative bullets, terse, code examples in TSX fenced blocks

## Frontmatter spec

```yaml
---
name: shadcn-ui
description: <string>
allowed-tools:
  - "shadcn*:*"
  - "mcp_shadcn*"
  - "Read"
  - "Write"
  - "Bash"
  - "web_fetch"
---
```

## Content shape template

Existing sections use h2 (`##`) for major topics, h3 (`###`) for sub-topics.
Code blocks use tsx/bash language tags. Narrative is imperative, concise bullet lists.
A representative addition looks like:

```markdown
## Code Review Checklist

When reviewing existing code for shadcn/ui best-practice compliance, scan each file in two passes:

### Pass 1 — File placement and visible anti-patterns

- [ ] **File location**: Custom/composed components must NOT be in `components/ui/`.
- [ ] **Class merging**: Every dynamic `className` must use `cn()`.

### Pass 2 — Absence checks (per element)

**Every interactive element** (`<div onClick>`, etc.):
- Has `role="button"`
- Has `onKeyDown` keyboard handler
- Has `tabIndex={0}`
```

## Optimization target file

**Edit:** `examples/workbench/shadcn-ui/references/shadcn-ui/SKILL.md`
(This is the vendored copy of the upstream `skills/shadcn-ui/SKILL.md`)

**Do NOT edit:**
- `examples/workbench/shadcn-ui/suite.yml`
- `examples/workbench/shadcn-ui/checks/`
- `examples/workbench/shadcn-ui/workspace/`

## Architecture intent

The stitch-skills repo provides a catalog of agent skills for Google's Stitch platform.
`SKILL.md` for shadcn-ui is the complete, self-contained skill — no split between
discovery stub and content doc (unlike vercel-labs/agent-browser pattern).
All additions go directly into `SKILL.md`.

## Risk profile

- LOW: shadcn-ui CI path is not gated; additive changes to `SKILL.md` merge quickly
- MEDIUM: Google CLA adds a one-time contributor step for new contributors
- No Release Please; maintainer decides version bumps manually

## Pre-submit checklist

1. Verify the file path comment is correct (additive-only, no deletions)
2. Verify no existing rules were deleted or reworded
3. Verify new sections appear after existing content (append pattern)
4. Confirm TSX code blocks use `tsx` language tag
5. Confirm CLA signed if submitting externally

## Previous iteration history (for re-fire context)

The prior batch-2 run (with gpt-4o-mini, May 2026) applied:
- BAD/GOOD tsx example for V1-wrong-location (added under `### Extending Components`)
- Code Review Checklist section (Pass 1 + Pass 2) at end of SKILL.md

These changes are already in `references/shadcn-ui/SKILL.md` in this workbench.
The re-fire (with gpt-5) measures whether frontier models with the improved SKILL.md
already score ≥ 0.95 (exit clean) or still have headroom for further improvement.

## Useful URLs

- Upstream repo: `https://github.com/google-labs-code/stitch-skills`
- Skill file: `https://github.com/google-labs-code/stitch-skills/blob/main/skills/shadcn-ui/SKILL.md`
