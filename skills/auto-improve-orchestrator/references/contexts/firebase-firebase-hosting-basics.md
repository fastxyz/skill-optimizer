# Auto-pilot context: firebase/agent-skills — firebase-hosting-basics

## Repository facts

- Repo: firebase/agent-skills
- License: Apache License 2.0, CLA required (Google CLA at cla.developers.google.com)
- Maintainers: @joehan (primary), Google Firebase team
- Merge style: squash merge; no Release Please detected; version in SKILL.md frontmatter is NOT auto-managed
- CI: GitHub Actions — `sync-genkit-skills.yml` (syncs genkit skills); no frontmatter validator CI found for hosting skills; no automated test runner in CI for this skill
- Discovery index / downstream sync: syncs to firebase-tools eval pipeline (`firebase/firebase-tools/scripts/agent-evals`); also installed via `npx skills add firebase/skills`

## Hard constraints (additive-only PR)

- Add content to `skills/firebase-hosting-basics/SKILL.md` OR add a new reference file under `skills/firebase-hosting-basics/references/`
- DO NOT modify `README.md`, `CONTRIBUTING.md`, `.github/`, or other skill directories
- Use existing structure: SKILL.md + references/configuration.md + references/deploying.md
- DO NOT bump `metadata.version` (no Release Please detected, but do not modify frontmatter unless a field is required)
- Incremental improvements → PR to `main` branch; new skills or significant changes → PR to `next`
- CLA required before PR can merge

## Frontmatter spec

No dedicated frontmatter validator script found in CI for this skill. Based on SKILL.md observed structure:

```yaml
---
name: firebase-hosting-basics
description: <string — describes when to use this skill>
---
```

Two fields observed: `name` (string, matches dir name) and `description` (string). No enum constraints found.

## Content shape template

SKILL.md structure:
- H1 heading (skill name)
- `## Overview` — bullet list of key features
- Feature-comparison section (e.g., `## Hosting vs App Hosting`)
- `## Instructions` — numbered sub-sections linking to reference files
- Optional review/workflow section (already added: `## Configuration Review`)

reference file structure (e.g., configuration.md, deploying.md):
- H1 heading
- `## Key Attributes` or `## Standard Deployment` — sections with JSON code blocks
- Code blocks tagged ` ```json ` or ` ```bash `
- Mix of prose and code; mostly code-forward
- Length: ~60-115 lines per reference file

## Optimization target file

**Edit:** `skills/firebase-hosting-basics/SKILL.md` (for skill content improvements)
**Also editable:** `skills/firebase-hosting-basics/references/configuration.md`, `skills/firebase-hosting-basics/references/deploying.md`
**Do NOT edit:** other skill directories, CI files, CONTRIBUTING.md, README.md

## Architecture intent

The split between SKILL.md and references/ exists to allow per-topic contribution without touching the main skill entry point. SKILL.md is the agent's first read; it links to reference files for deeper specifics. Token economy is a secondary concern — the primary intent is per-topic versioning and contribution granularity.

## Risk profile

- LOW: incremental additions to SKILL.md or existing reference files for an established skill
- MEDIUM: adding new reference file (novel surface)
- Note: PR #120 was closed because it was submitted by an automated tool without a CLA; not a shape rejection. The change itself (improvements to a Dart skill) was substantive. Rejection was likely process-gate (CLA), not content quality.

## Pre-submit checklist

1. Ensure Google CLA is signed for the submitting account
2. Point PR to `main` branch (incremental improvement to existing skill)
3. Do not modify frontmatter `name` or bump version
4. Match existing voice: terse imperative bullets, JSON code blocks, second-person
5. Additive only — no deletions of existing content
6. Add test case to firebase-tools eval pipeline if adding new behavioral guidance

## Useful URLs

- SKILL.md: https://github.com/firebase/agent-skills/blob/main/skills/firebase-hosting-basics/SKILL.md
- configuration.md: https://github.com/firebase/agent-skills/blob/main/skills/firebase-hosting-basics/references/configuration.md
- deploying.md: https://github.com/firebase/agent-skills/blob/main/skills/firebase-hosting-basics/references/deploying.md
- CONTRIBUTING.md: https://github.com/firebase/agent-skills/blob/main/CONTRIBUTING.md
- Recent merged PRs: https://github.com/firebase/agent-skills/pulls?q=is%3Apr+is%3Amerged
