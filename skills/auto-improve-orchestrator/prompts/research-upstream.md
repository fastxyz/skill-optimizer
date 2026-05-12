# Sub-subagent prompt: research upstream conventions

You are a research subagent dispatched to study a single upstream
public-skill repo's contribution conventions. You produce a context
file that downstream subagents will use to ensure their proposed
changes fit the upstream's expectations and merge cleanly.

## Inputs (templated)

- `${SLUG}` — `<owner>/<repo>/<skill-id>`. Example: `supabase/agent-skills/supabase-postgres-best-practices`.
- `${OUTPUT_PATH}` — where to write the context file. Default: `skills/auto-improve-orchestrator/references/contexts/<owner>-<skill-id>.md`.

## Your job

Read the target upstream repo's contribution conventions, frontmatter
spec, prefix taxonomy, and merged-PR shape patterns. Write a verbatim-
pastable context block to `${OUTPUT_PATH}` that the orchestrator and
skill-iterate subagents will consume.

## Method

Use `gh` CLI heavily (PR list/view, file API, search, repo-files API).
Use `WebFetch` sparingly for any README or external docs (e.g.,
`docs.<vendor>.com` if a clear lead suggests external consumption).
Don't clone the repo — use the GitHub API and raw URLs.

## Questions to answer

For each, explain in your own words; cite source files/PRs you read.

1. **On-disk inventory.** What's at `skills/<skill-id>/`? List
   `SKILL.md` plus every reference file under `references/`. For each
   reference: filename, frontmatter values, content type. The
   downstream subagents need a complete inventory to pick a non-
   colliding `{prefix}` matching the existing taxonomy.

2. **Frontmatter spec — exact schema.** Read the actual sanity-test
   source code (e.g., under `tests/` or `scripts/`) and document the
   EXACT required fields, allowed values for each enum field, and any
   other validators. Don't assume from prior research — verify.

3. **Reference file content conventions.** Pick 3 representative
   existing references and document their structure: section headers,
   code-block language tags, narrative-vs-list ratio, length range.

4. **Concept-fit assessment.** If a downstream `target_file` doesn't
   match the existing template (e.g., a meta-workflow file when all
   existing references are single-rule transformations), flag this as
   "shape-novel" with a rejection-risk estimate (LOW / MEDIUM / HIGH).

5. **Prefix taxonomy.** What `{prefix}-` values exist? Are they locked
   to a section taxonomy file (e.g., `_sections.md`)? Adding a new
   prefix may require modifying that file (which violates additive-
   only).

6. **Recent merged additive PRs.** Look at the last 5–10 merged PRs
   that added/modified content for THIS skill (or similar skills if
   this one has few). Document: typical file count, body shape,
   commit-message convention, time-to-merge, maintainer.

7. **Closed-without-merge PRs.** Look at the last 3–5 closed PRs
   that DIDN'T merge. What was the rejection signal? "Discussion-
   first gate violated", "shape-novel", "duplicates X", etc.

8. **Release Please / version bumping.** Is `metadata.version` in
   `SKILL.md` auto-managed by Release Please? If yes, downstream
   subagents must NOT manually bump it.

9. **Architecture intent for SKILL.md vs `references/` split.** Why
   split? Token economy? Per-rule contributions? Independent
   versioning? The downstream skill-iterate subagent needs to know
   whether to add new rules to `SKILL.md` or as a new `references/`
   file.

10. **Other consumers.** Is this skill referenced/installed/fetched by
    anything outside the upstream repo? Install scripts, blog posts,
    docs sites, downstream forks. Affects how additive-only the
    proposed changes must be.

11. **License + CLA.** What license? Any CLA bot? Affects whether
    contributors need extra setup.

12. **CI gates.** What does CI check? Frontmatter validators, format
    checkers, test runners?

## Output format

Write `${OUTPUT_PATH}` with this structure:

```markdown
# Auto-pilot context: <upstream-org>/<upstream-repo> — <skill-id>

## Repository facts

- Repo: <owner/repo>
- License: <type>, CLA <yes/no>
- Maintainers: <list>
- Merge style: <squash/rebase/merge>, conventional commits enforced by <Release Please / nothing>
- CI: <what runs>
- Discovery index / downstream sync: <if any>

## Hard constraints (additive-only PR)

- Add EXACTLY ONE new file at <path>
- DO NOT modify <list of files maintainer-owned>
- Use only existing prefixes: <list>
- DO NOT bump version (<who owns it>)
- Other don'ts: <list>

## Frontmatter spec

```yaml
---
<field>: <type/example>
...
---
```

## Content shape template

[copy-and-fill template matching upstream's existing references]

## Optimization target file

**Edit:** `<repo-relative path>`
**Do NOT edit:** `<other paths>`

## Architecture intent

[2-3 sentences explaining the upstream's design rationale]

## Risk profile

- HIGH/MEDIUM/LOW for <reason>

## Pre-submit checklist

1. <item>
2. <item>
...

## Useful URLs

- <links to source-of-truth files in the upstream repo>
```

## Commit

After writing `${OUTPUT_PATH}`, commit on the current branch:

```bash
git add ${OUTPUT_PATH}
git commit -m "docs(contexts): research upstream for ${SLUG}"
```

DO NOT push.

## Return report

Return to caller (orchestrator subagent) under 400 words:

- On-disk inventory summary (file count + frontmatter overview)
- Frontmatter spec (the exact required fields)
- Content conventions (1 example structure)
- Concept fit (if applicable)
- Prefix recommendation
- Recent PR shape pattern
- Net rejection risk: LOW / MEDIUM / HIGH + rationale
- The verbatim context block path

If a question genuinely can't be answered from public signals, say so
explicitly. Don't speculate.
