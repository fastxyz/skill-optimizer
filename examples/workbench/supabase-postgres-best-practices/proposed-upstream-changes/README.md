# Proposed upstream changes: supabase-postgres-best-practices

## What changed

Added a **Two-Pass Review Checklist** section to `SKILL.md` between "How to Use" and "References".

## Why (evidence from eval)

Eval baseline (9 violations × 9 trials): **0.54 rule-coverage**. After the modification: **0.86**.

The primary failure pattern was absence-type violations — cases where required SQL is entirely missing (no `ENABLE ROW LEVEL SECURITY`, no FK index, no `FORCE ROW LEVEL SECURITY`). Agents with only the original SKILL.md reliably identified presence violations (wrong syntax, wrong column order) but missed absence violations because nothing in the skill prompted a systematic "what's missing?" pass.

The checklist explicitly separates:
- **Pass 1** — presence violations (a token is wrong)
- **Pass 2** — absence violations (a required element is missing entirely)

This brought `security-rls-basics` and `schema-foreign-key-indexes` absence-type detection from ~40% to ~85% across Claude, GPT-4o-mini, and Gemini 2.5 Flash.

## How to apply

Apply the diff between `before-SKILL.md` and `after-SKILL.md` to
`skills/supabase-postgres-best-practices/SKILL.md` in the upstream repo.

```bash
diff supabase-agent-skills/before-SKILL.md supabase-agent-skills/after-SKILL.md
```

The change is purely additive: one new `## Two-Pass Review Checklist` section added
after the existing `## How to Use` section. No existing content was modified or removed.
