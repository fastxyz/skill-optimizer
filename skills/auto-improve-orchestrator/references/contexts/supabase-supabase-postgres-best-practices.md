# Auto-pilot context: supabase/agent-skills — supabase-postgres-best-practices

## Repository facts

- Repo: supabase/agent-skills (default branch: main)
- License: MIT, no CLA
- Maintainers: gregnr (Supabase staff), Rodriguespn (active community maintainer)
- Merge style: squash, conventional commits enforced by Release Please
- CI: `Skills CI` runs `pnpm test:sanity` which executes `npx skills add` to
  confirm install — does NOT validate per-reference frontmatter; convention
  is enforced by maintainer review only
- Discovery index published at `.well-known/agent-skills/index.json` on every
  release
- Downstream sync: supabase-community/supabase-plugin receives
  workflow_dispatch on release

## Hard constraints (additive-only PR)

- Add EXACTLY ONE new file:
  `skills/supabase-postgres-best-practices/references/{prefix}-{name}.md`
- DO NOT modify `SKILL.md` — Release Please owns `metadata.version`. Manual
  edits cause merge conflicts with the bot's release PR.
- DO NOT modify `_sections.md`, `_template.md`, `_contributing.md`, the
  SKILL.md "Rule Categories by Priority" table, `release-please-config.json`,
  `package.json`, or `CHANGELOG.md`
- DO NOT add a new prefix. Use only the existing 8: `query-`, `conn-`,
  `security-`, `schema-`, `lock-`, `data-`, `monitor-`, `advanced-`
- DO NOT bump `metadata.version` in SKILL.md
- DO NOT add README.md, INSTALLATION_GUIDE.md, QUICK_REFERENCE.md, or
  CHANGELOG.md inside the skill (AGENTS.md explicitly forbids)

## Frontmatter spec for the new reference file

Required fields (exact form, comma-separated tags as a STRING, not a YAML
list):

```yaml
---
title: <Action-oriented title, ~3-8 words>
impact: <one of: CRITICAL | HIGH | MEDIUM-HIGH | MEDIUM | LOW-MEDIUM | LOW>
impactDescription: <Quantified benefit, e.g. "10-100x faster queries">
tags: <3-6 hyphenated-keywords, comma-separated, e.g. "indexes, performance, query-optimization">
---
```

## Content shape template (copy and fill)

```markdown
---
title: <Title>
impact: <CRITICAL|HIGH|MEDIUM-HIGH|MEDIUM|LOW-MEDIUM|LOW>
impactDescription: <quantified benefit>
tags: <comma, separated, keywords>
---

## <Same title as frontmatter>

<1-2 sentence explanation of the problem and why it matters.>

**Incorrect (<short parenthetical naming the problem>):**

\`\`\`sql
-- comment explaining what makes this slow/wrong
<bad SQL>
\`\`\`

**Correct (<short parenthetical naming the fix>):**

\`\`\`sql
-- comment explaining why this is better
<good SQL>
\`\`\`

<Optional: 1 follow-up subsection with another correct variant or trade-off note.>

Reference: [<Link Text>](<https URL to postgres or supabase docs>)
```

Target length: 40–80 lines, 1.2–1.9 KB. Code blocks must be tagged `sql`
(lowercase keywords). Comments explain WHY not WHAT. Use semantic
table/column names (`users`, `orders`, `customer_id`).

## Two-pass-review proposal — required reshaping

The proposed content (two-pass review, presence vs absence violations) does
NOT fit the existing single-rule SQL-transformation convention. All 28
existing references are concrete SQL anti-pattern fixes, not meta-workflow
guidance. `_contributing.md` Key Principle #1: "Show exact SQL rewrites.
Avoid philosophical advice." Key Principle #2: "Error-First Structure."

**Reshape strategy (REQUIRED before writing):** Pick the single
highest-impact concrete SQL anti-pattern that two-pass review catches and
the single-pass workflow misses. Frame the reference around that
anti-pattern. Example framing:

- Filename: `monitor-two-pass-review.md` (prefix `monitor-` because
  diagnostic workflow)
- title: "Run Two Passes on Generated SQL Reviews"
- Incorrect block: a single-pass review that approves SQL missing a
  `WHERE` (absence violation) or containing `DROP` (presence violation)
- Correct block: a two-pass review that catches both classes
- impact: MEDIUM (matches monitor-* siblings)
- impactDescription: "Catch absence-class bugs (missing WHERE, missing
  index) that single-pass review skips"
- tags: review, diagnostics, code-review, sql-review

If the reshape makes the SQL examples feel contrived, ABORT and surface a
`needs-discussion` signal in `analysis.md` (use status:
`blocked-by-skill-shape` and explain) instead of opening a borderline PR.
Open a GitHub Discussion under
<https://github.com/orgs/supabase/discussions> as the next manual step.

## PR composition (for downstream packaging)

- Branch name: `feat/{short-kebab-name}` (matches Rodriguespn convention)
- Title: `feat: <short imperative summary>` (use `feat:` for additive
  content; `fix:` only for corrections — both currently bump patch under
  bump-patch-for-minor-pre-major)
- Body shape (no PR template enforced — ignore the stale template at
  `.github/`):

  ```markdown
  ## Summary

  - <1-line what>
  - <1-line why>
  - <optional: 1 line on which prefix/section it slots into>
  ```

- Optionally append `Resolves AI-NNN` if a Linear ticket exists; otherwise
  omit.
- Single commit, single file, no co-authoring trailer required by repo
  (their merge is squash).
- DO NOT include a "Test plan" section — no merged PR uses one.

## Pre-submit checklist (auto-pilot must verify before declaring success)

1. Exactly 1 file added under
   `skills/supabase-postgres-best-practices/references/`
2. Filename matches `{existing-prefix}-{kebab-name}.md`
3. Frontmatter has `title`, `impact` (allowed enum), `impactDescription`,
   `tags` (comma-separated string)
4. Body has `## <Title>`, `**Incorrect (...):**` block with ` ```sql `,
   `**Correct (...):**` block with ` ```sql `, trailing
   `Reference: [...](https://...)` link
5. Total file size 1.0–2.0 KB, 35–90 lines
6. SKILL.md, _sections.md,_template.md, _contributing.md,
   release-please-config.json, package.json all UNCHANGED
7. `metadata.version` in SKILL.md UNCHANGED (currently "1.1.1" — Release
   Please owns it)
8. No README.md/INSTALLATION_GUIDE.md/CHANGELOG.md added anywhere

## Optimization target file

**Edit:** `references/supabase-postgres-best-practices/{new-reference}.md`
(create it as a new file under the workbench's vendored references dir, then
package it as the proposed upstream addition).

**Do NOT edit:** `references/supabase-postgres-best-practices/SKILL.md`.

## Risk flags

- HIGH: a meta-workflow reference is shape-novel for this skill; expect
  "fit-the-convention" pushback from gregnr/Rodriguespn. Reshape to
  concrete SQL anti-pattern as above OR open a Discussion first.
- MEDIUM: `npx skills add supabase/agent-skills` is publicly consumed;
  additive-only is mandatory.
- LOW: external small `feat:` PRs do merge same-day if convention is
  followed.

## Useful URLs

- Convention source of truth:
  `skills/supabase-postgres-best-practices/references/_contributing.md`
- Section taxonomy:
  `skills/supabase-postgres-best-practices/references/_sections.md`
- Reference template:
  `skills/supabase-postgres-best-practices/references/_template.md`
- Frontmatter format spec: `AGENTS.md` (symlinked as `CLAUDE.md`)
- Release config: `release-please-config.json`
- Sanity test (does NOT validate frontmatter): `test/sanity.test.ts`
- CONTRIBUTING gate: `CONTRIBUTING.md` ("open a Discussion first" for
  major changes)
