# auto-improve-skill v1.3 — design proposal

**Status:** draft, written 2026-05-12 during the v1.2.1 PR-prep session.
**Audience:** team review before implementation.
**Tracking:** the in-flight v1.2.1 pilot work (web-design-guidelines /
agent-browser / supabase) is the empirical basis for this proposal.

## Executive summary

v1.3 adds two structural phases to the auto-improve-skill pipeline,
both motivated by failure modes observed across 4 v1.2.1 pilots:

1. **Phase 0 — Research-first context.** A research subagent reads the
   target upstream repo's contribution conventions, frontmatter spec,
   prefix taxonomy, and merged-PR shape patterns, and writes a context
   file that v1.2.1's `--context` flag consumes. Without this, the
   auto-pilot produces output that requires manual reformulation
   before submission.
2. **Phase 3.5 — Eval-readiness loop.** The pipeline iterates on the
   eval (seed harder/simpler cases) until baseline lands in the
   "interesting zone" `(0.50, 0.95)`. Without this, baselines saturate
   at 1.00 (no headroom to demonstrate uplift) or floor at <0.50 (skill
   shape blocks measurement).

The skill-iteration loop (current Phase 4) is unchanged.

## Lesson 1 — Research-first context is mandatory

### Evidence (4 pilots this session)

| Skill | Without context | With researched context |
|---|---|---|
| web-design-guidelines | Manual proposal needed retargeting (SKILL.md→command.md), reformulation across 3 stylistic siblings, frontmatter mismatch. Manual labor: ~2 hours per PR. | Auto-pilot produced a clean, mergeable diff to the right file in the right voice. Manual labor: ~10 min mirror to AGENTS.md/README.md. |
| agent-browser | Auto-pilot proposed editing `skills/agent-browser/SKILL.md`. Per upstream `AGENTS.md`, that file is intentionally a discovery stub; real content lives at `skill-data/core/SKILL.md`. Manual retarget required. | (Pending — pilot in flight; context file says edit `agent-browser-core.md` and produced output names `before-skill-data-core-SKILL.md`.) |
| supabase (batch-1) | Produced shape-novel `references/review-...md` with non-existent prefix (`review-`), missing `impactDescription` frontmatter field, philosophical-style content (MEDIUM-HIGH rejection risk per CONTRIBUTING patterns). | Auto-pilot reshaped into convention-perfect SQL anti-pattern under correct prefix (`monitor-`), full 4-field frontmatter, `**Incorrect**`/`**Correct**` SQL blocks per `_template.md`, trailing `Reference:` link. Zero manual reformulation needed. |

### Generalization

The auto-pilot is good at *finding what to change* (which rules, which
files, which absence-type gaps). It is bad at *fitting upstream
conventions*: frontmatter schemas, file-location norms, prefix
taxonomies, additive-only rules, "Discussion-first" gates, voice
consistency. Conventions are repo-specific tribal knowledge that
cannot be inferred from reading the SKILL.md alone.

### Phase 0 design

```text
Phase 0 — Research upstream (NEW, runs before Phase 1)

Inputs:
  - target slug <owner>/<repo>/<skill-id>

Subtasks (executed by a research subagent):
  1. Repo metadata: license, CLA, default branch, recent activity
  2. Read CONTRIBUTING.md, AGENTS.md, .github/PULL_REQUEST_TEMPLATE.md,
     CODEOWNERS, .github/workflows/*.yml
  3. Read skill-specific convention files: _contributing.md,
     _template.md, _sections.md (or equivalents)
  4. Read sanity-test source if present (don't trust prior assumptions
     about what CI validates)
  5. Sample last 10 merged PRs to the target skill (or repo) for shape:
     file count, body shape, conventional-commit usage, scope sizing
  6. Sample last 5 closed-without-merge PRs for rejection signals:
     "Discussion-first gate violated", "shape-novel content rejected",
     etc.
  7. Identify other consumers (gh search for raw URL references; check
     for install scripts; check repo's own README for distribution
     channels)

Output:
  tools/auto-improve-contexts/<owner>-<skill>.md
  - Repository facts (license, CI, maintainers, merge style)
  - Hard constraints (additive-only, file-location, prefix taxonomy,
    forbidden modifications)
  - Frontmatter spec (exact required fields + allowed values)
  - Content shape template (copy-and-fill)
  - Optimization target file (where the skill change should land)
  - Risk profile (LOW/MEDIUM/HIGH + reasons)
  - Pre-submit checklist (what auto-pilot must verify)
  - Useful URLs

Cost: ~$0.50–$1.00 per skill (single subagent invocation).

Caching: context files are committed to the repo. Re-running on the
same skill within 30 days: skip Phase 0, reuse cached context (with
explicit `--refresh-context` flag to force re-research).

Operator override: `--context <path>` flag continues to work; if
provided, Phase 0 is skipped.
```

## Lesson 2 — Two-loop iteration: eval AND skill

### Evidence

| Skill | Initial baseline | Failure mode | Manual fix |
|---|---|---|---|
| agent-browser (Tier-0 only) | 0.97 | Shallow eval — only graded command-presence, not the skill's actual value prop (ref-based interaction, snapshot interpretation, multi-step state) | Built Tier-1 cases via subagent (~half-day): pre-recorded fixtures, stateful fake CLI, 4 new cases targeting the differentiator |
| supabase (calibrated graders, frontier models) | 1.00 | Eval saturated; calibrated graders + capable models perfect-detect the 9 seeded violations | Built deeper eval via subagent (~30 min): 3 new cases with absence-type violations requiring enumeration across multi-statement files |

In both cases, the **eval was the bug, not the skill**. The skill-
iteration loop in Phase 4 can't escape the dead zone — it just exits
"baseline >= 0.95, success" with no measurement.

### Phase 3.5 design

```text
Phase 3.5 — Eval-readiness loop (NEW, between Phase 3 and Phase 4)

while baseline NOT IN (0.50, 0.95):
  if baseline >= 0.95:
    dispatch eval-iteration subagent with prompt:
      "Add 2-3 cases targeting absence-type rules / failure modes
       not yet exercised. Realistic seedings, force enumeration.
       Don't touch existing cases."
  elif baseline < 0.50:
    options (operator-decided or auto-judged):
      a) Grader miscalibrated → run grader-vs-skill check (existing
         in Phase 4); if grader bug, fix and re-baseline
      b) Cases too contrived → simplify (remove ambiguous violations,
         tighten task descriptions)
      c) Skill genuinely doesn't address this shape → exit
         "blocked-by-skill-shape" honestly
  re-measure baseline
  abort if iteration count > 3 (eval is harder to converge than skill)

Then proceed to Phase 4 unchanged.

Cost: ~$1.00 per eval iteration (subagent + smoke check). Bounded at
3 iterations.

Convergence criterion: baseline in (0.50, 0.95). The interesting zone.
```

### Why these bounds?

- **>= 0.95**: ceiling effect; can't measure uplift because there's no
  headroom. Even +0.04 wouldn't clear our existing 0.05 success
  threshold.
- **< 0.50**: floor effect; either the eval is broken (grader bugs,
  ambiguous tasks) or the skill genuinely doesn't address the seeded
  rules. In either case, the optimizer can't reliably improve.
- **(0.50, 0.95)**: the optimizer has clear signal. Both successful
  iteration and lack-of-improvement are interpretable.

## Combined v1.3 architecture

```text
0. Research upstream → context file (NEW)
1. Discover skill, classify
2. Build initial suite
3. Measure baseline
3.5 Eval-readiness loop (NEW):
    while baseline NOT IN (0.50, 0.95): iterate eval
4. Skill-iteration loop (existing):
    while uplift < 0.05 AND iterations < 2: iterate skill
5. Re-check baseline (did eval drift after skill change?)
6. Package
```

## Implementation cost

| Component | Effort | Cost per pilot run |
|---|---|---|
| Phase 0 research subagent | ~1 day to write the prompt template + repo-detection logic | +$0.50–$1.00 |
| Phase 3.5 eval-iteration subagent | ~2 days to write the subagent prompt + integration into the wrapper loop | +$1.00 per eval iteration (bounded at 3) |
| Wrapper integration | ~1 day for new flags (`--refresh-context`, `--max-eval-iterations`), result aggregation, telemetry | n/a |
| Testing on 5 representative skills | ~1 day | ~$10 total |

**Total v1.3 build cost:** ~5 days of work + ~$15 of pilot runs to
validate.

**Per-pilot incremental cost:** ~$1.50–$5.00 over v1.2.1, depending on
how many eval iterations are needed (most skills will converge in 0–1).

## Migration / backwards compatibility

- v1.2.1 wrapper continues to work standalone (`--context` flag is
  preserved).
- v1.3 is opt-in via a new flag, e.g. `--research` to enable Phase 0
  and `--auto-eval` to enable Phase 3.5. Default off until validated.
- Once validated, defaults flip to on; operator can opt out via
  `--no-research` / `--no-auto-eval`.

## Open questions

1. **Research-subagent prompt template** — should the Phase 0 subagent
   prompt be skill-classification-aware? E.g. ask different questions
   for code-reviewer vs tool-use vs document-producer skills. Probably
   yes, but adds template branching complexity.
2. **Eval-iteration subagent prompt template** — same question. The
   "what makes a harder case" guidance differs sharply by skill type.
3. **When to refuse eval iteration** — if baseline is at 1.00 because
   the skill genuinely is excellent at its job, we shouldn't fabricate
   harder cases. How does Phase 3.5 distinguish "ceiling because skill
   is good" from "ceiling because eval is shallow"?
   - One heuristic: if the existing eval already exercises the skill's
     stated value prop (per the SKILL.md description), assume good. If
     it tests only mechanical command presence, assume shallow.
   - This needs a "value-prop coverage" check in Phase 3.5, ideally
     read from the skill's frontmatter description.
4. **Cost ceiling** — Phase 0 + Phase 3.5 each cost ~$1; Phase 4 costs
   $1–3. v1.3 raises typical pilot cost from ~$2 (v1.2.1) to ~$3–6.
   Still within the $10 wrapper budget but worth keeping under
   observation.
5. **When to accept lossy reshape** — supabase v1.2.1 forced reshape
   from "two-pass meta-workflow" into "concrete SQL anti-pattern with
   `**Incorrect**`/`**Correct**` blocks". Worked beautifully. Will
   this transfer to other skills, or did we get lucky with supabase's
   tight `_template.md`? Probably needs more pilots before generalizing.

## Open architectural questions (longer-term)

- **Should the auto-pilot also produce the AGENTS.md/README.md mirrors
  for repos with multi-file convention (PR #23 shape)?** Currently
  manual at PR-draft time. Could be a separate "packaging" subagent.
- **Should we treat upstream PR-submission as a phase too (Phase 6)?**
  i.e. fork-clone-push-create-PR automation. Operator-gated for high-
  visibility actions, but otherwise plausible.
- **Can the research subagent be made repo-agnostic?** Right now we
  assumed a "skill repo" structure. For repos with non-standard layout
  (vendored skills, monorepos, etc.) the research needs different
  patterns.

## Provenance

This design is grounded in the v1.2.1 pilot session captured in:

- `docs/pilot-runs/upstream-pr-drafts/1-vercel-labs-web-interface-guidelines.md`
- (pending) `docs/pilot-runs/upstream-pr-drafts/3-vercel-labs-agent-browser-*.md`
- (pending) `docs/pilot-runs/upstream-pr-drafts/4-supabase-agent-skills-*.md`
- `tools/auto-improve-contexts/{vercel-web-interface-guidelines,
  vercel-agent-browser, supabase-postgres-best-practices}.md`
- Eval branches: `eval/auto-pilot/web-design-guidelines`,
  `eval/auto-pilot/agent-browser` (in flight),
  `eval/auto-pilot/supabase-postgres-best-practices-v2` (in flight).
