# Upstream context: vercel-labs/web-interface-guidelines

This pilot targets the **rules doc** consumed by the
`vercel-labs/agent-skills/web-design-guidelines` skill, not the skill
itself. The SKILL.md is a thin Claude-Code-specific adapter and is NOT
the right optimization target for this pilot.

## Optimization target file

**Edit:** `references/web-design-guidelines/command.md`
**Do NOT edit:** `references/web-design-guidelines/SKILL.md`

The SKILL.md is essentially untouched in upstream history (the last
substantive change was its initial commit). All meaningful improvements
should land in `command.md`, which is the canonical Vercel design
artifact distributed natively to 7 agent tools (Amp Code, Claude Code,
Cursor, OpenCode, Windsurf, Antigravity, Gemini CLI) via `install.sh`,
plus consumed by 10+ downstream repos via raw GitHub URL fetch.

## Architecture intent (from upstream research)

- `command.md` is the **canonical source of truth**. The skill is one
  of many thin downstream adapters (others: 7 native tool installs +
  the `vercel-labs/agent-skills` wrapper).
- `command.md`, `AGENTS.md`, and `README.md` are three stylistic
  reformulations of the same rule set, each distributed through a
  different channel. The auto-pilot only needs to optimize `command.md`
  here; the AGENTS.md / README.md mirrors are produced manually at
  PR-draft time.
- The skill always WebFetches `main` (no commit pinning), confirming
  the rules doc is expected to evolve independently and downstream
  consumers ride latest.

## Hard constraints

1. **Additive only.** Every merged PR in the last year is additive
   (add rules, reword rules, fix links, add tool installers). Zero
   restructure / reorganization PRs have been merged. **Do not delete,
   reorder, or substantively reword existing rules.**
2. **Do not consolidate or restructure.** Merging `command.md` content
   into the SKILL.md, or splitting `command.md` into multiple files,
   would break `install.sh` and sever the canonical URL that 10+
   external repos and vercel.com/design link to. Risk of rejection:
   HIGH.
3. **Two-pass workflow goes in `command.md` only.** Meta-instructions
   about "how to apply the rules" (e.g. Pass 1 = visible / Pass 2 =
   absences) fit `command.md` because it's the file consumed at audit
   time. They do NOT fit `AGENTS.md` (ambient project context, read at
   every coding action — the agent isn't "doing a review"). Out of
   scope here, but worth knowing the scope limit.
4. **Rule additions / clarifications are in scope.** Per-element
   checklists, BAD/GOOD examples, and explicit "missing X" rules are
   the kinds of changes the merged-PR pattern welcomes (PR #23 is the
   canonical precedent — adds `translate="no"` guideline as an additive
   rule).
5. **Maintain frontmatter.** `command.md` starts with YAML frontmatter
   (`description:`, `argument-hint:`). Preserve it.
6. **Style:** terse imperative bullets (e.g. `- Icon-only buttons need
   \`aria-label\``). Match the existing voice. No prose, no rationale
   in-line, no "MUST/SHOULD/NEVER" (that's the AGENTS.md voice).

## Where headroom likely lies (prior from manual eval)

The load-bearing prior from `auto-improve-skill-lessons.md` applies:
absence-type rules ("a missing attribute", "a missing branch") are
5-10x harder than presence-type rules ("a wrong token in code"). Prior
manual eval on this skill showed the biggest uplift came from:

- Per-element absence checklists (`<img>`, `<input>`, `<button>` —
  walk each one, flag missing attributes)
- BAD/GOOD code examples for anti-patterns where the bad pattern looks
  idiomatic (`disabled={!form.valid}`, `onPaste={(e) => e.preventDefault()}`)
- Explicit "missing X" rules where the rule is currently phrased only
  as a presence check

When seeding violations, lean toward absence-type — that's where the
existing `command.md` likely has gaps and where additive rules will
create measurable uplift.

## Packaging

When Phase 5 packages the proposed change:

- Name files `before-command.md` / `after-command.md` (not
  `before-SKILL.md`)
- Put them under `proposed-upstream-changes/vercel-labs-web-interface-guidelines/`
  (the rules-doc repo)
- Do not produce a `before-SKILL.md` / `after-SKILL.md` for the
  `vercel-labs-agent-skills` repo — we're not changing it
- The PR-draft step (manual, separate from this pilot) will produce
  `AGENTS.md` (MUST/SHOULD/NEVER style) and `README.md` (prose style)
  reformulations of the same change set, following the PR #23
  precedent of touching all 3 files in one PR
