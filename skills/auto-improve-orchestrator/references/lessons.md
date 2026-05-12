# Auto-improve-skill — Lessons learned

This is a **living doc**. The auto-pilot reads it during Phase 4 (Diagnose

+ Modify). Every pilot adds patterns it discovered to the relevant
section. Pilot N benefits from patterns surfaced in pilots 1..N-1; the
auto-pilot doesn't have to rediscover them from zero.

**How to use this from the prompt:** Phase 4 reads this file before
choosing what to modify. Match the failure pattern you observe to a
recipe below; if no recipe matches, do the diagnosis from first
principles, then add a new entry here at the end of the run.

---

## The load-bearing prior

> **Rules about *absence* (a missing attribute, a missing branch, a
> missing focus replacement) are 5–10× harder for models than rules
> about *presence* (a literal token in the code).**

Source: manual web-design-guidelines run + auto-pilot supabase pilot
(2026-05-08) — both surfaced this independently. Use it to categorize
every missed rule before deciding what to modify.

| Rule pattern | Relative miss rate | What helps |
|---|---|---|
| Visible bad pattern (literal token in code) | low | Often catches itself; the rule wording is enough |
| Anti-pattern that "looks normal" (e.g., `<button disabled={!form.valid}>`) | medium-high | BAD/GOOD example + rationale + bug-story |
| Missing attribute (e.g., `<img>` without `alt`) | high | Per-element checklist |
| Missing branch (e.g., empty-state, error-handling) | high | Per-call-site checklist |
| State-machine violation (e.g., disabled-then-enabled timing) | very high | Inline trace narration |
| Subjective / judgment-based rules | depends on phrasing | Often skip; LLM-as-judge is out of scope |

---

## Optimization patterns (Phase-4 modify recipes)

### A. Two-pass workflow

**When to use:** code-reviewer skills with mixed presence/absence rules.

**Recipe:** add a new section near the top of `SKILL.md`:

```markdown
## How It Works

Review each file in TWO passes — both are required.

### Pass 1 — Visible anti-patterns

Scan for literal patterns: `<div onClick>` for actions, `transition: all`,
`outline-none` className, `onPaste={(e) => e.preventDefault()}`, etc.

### Pass 2 — Absences (per-element checklist)

The most-missed rules are about *what's missing*. After Pass 1, walk
each `<img>`, `<input>`, `<button>`, etc. once and run the per-element
checklist in <rules-doc>.
```

**Empirical evidence:**

+ Manual web-design-guidelines: 26/36 → 31/36 (+14pp) on the 4-case
  suite, sonnet 83% → 100%
+ Auto-pilot supabase: 0.54 → 0.86 (+32pp) on 9 SQL violations

**When NOT to use:** document-producer skills (the agent builds output,
isn't reviewing). Tool-use skills usually want a different fix (see B).

### B. Verify-tool-installed nudge

**When to use:** tool-use skills where models reach for `curl`, `npm i`,
or other fallbacks instead of the prescribed CLI.

**Recipe:** add a "Setup" or "Pre-flight" section to `SKILL.md`:

```markdown
## Pre-flight

The CLI is pre-installed. Verify with `which agent-browser` before
starting. **Do not** `npm install` it; **do not** fall back to `curl`
for HTTP fetches.
```

**Empirical evidence:** auto-pilot agent-browser pilot — gpt-5-mini and
gemini both fell back to `curl` or tried `npm i -g` before the nudge.

### C. Per-element checklists

**When to use:** code-reviewer skills with rules grouped by element type
(every `<img>`, every `<input>`, every `<form>`).

**Recipe:** in the rules doc, add a "Per-element review" section
listing checks per element type. Format that worked for
web-design-guidelines:

```markdown
## Per-element review (Pass 2)

**Every `<img>`:**
- explicit `width` AND `height` (prevents CLS)
- above-fold critical → `priority` or `fetchpriority="high"`
- below-fold → `loading="lazy"`

**Every `<input>`:**
- `autoComplete` set
- correct `type`
- `<label htmlFor>` or wrapping `<label>`
- emails/codes → `spellCheck={false}`
```

**Empirical evidence:** closed most absence-type misses on
web-design-guidelines after the two-pass workflow was added.

### D. BAD / GOOD code examples

**When to use:** anti-pattern rules where the bad pattern looks
idiomatic; rules that depend on a state-machine; rules that contradict
common React/JS patterns the model has seen in training data.

**Recipe:** under the rule, add a fenced JSX block with BAD and GOOD
side-by-side. Example structure (rendered into the rules doc verbatim):

````text
**Submit button stays enabled until request starts.**

```jsx
// BAD: button disables based on form state. User types → deletes →
// button flickers off → autofill races with state.
<button type="submit" disabled={!email}>Submit</button>

// GOOD: stays enabled. Spinner appears during the request.
<button type="submit" disabled={submitting}>
  {submitting ? <Spinner /> : 'Submit'}
</button>
```
````

**Empirical evidence:** manual web-design-guidelines run — the rules
that needed examples (submit-disabled, paste-blocking, missing
autoComplete, image priority hint) all closed their miss rates by 60-100%
after the example was added.

### E. Rationale + bug-story

**When to use:** state-machine violations, lifecycle bugs,
non-obvious-failure rules.

**Recipe:** narrate the failure case inline with the rule. Example:

```markdown
NEVER `disabled={!form.valid}` — the user types, then deletes a
character to fix a typo, the button flickers off, and the paste-fill
races with state. Tested users will assume the button is broken.
```

The narration gives the model a "why this rule matters" hook that pure
declarative rules don't provide.

---

## Grader-reliability patterns (Phase-2 build-suite recipes)

These are common ways graders go wrong on first build. Pre-tune your
graders to avoid them; if you see the failure mode at baseline, fix the
grader as iteration 1 (do not propose a skill change yet).

### G1. Line tolerance ±5–8 (not ±0–3)

LLM line-counting is unreliable. Models report violations 1-3 lines off
from the actual line in multi-line JSX/SQL/code. Use the `looseRange`
helper (default tolerance ±8):

```javascript
{ id: 'rule-id', lines: looseRange(18), keywords: [/.../i] }
// Accepts lines 10-26.
```

`looseRange(N, tolerance)` is defined in `_grader-utils.mjs`. Prefer it
over hand-rolling `range(N-3, N+3)` — the default already absorbs the
common drift width seen across all 4 prior pilots.

### G2. Hyphen-tolerant keyword regex

Models output "empty-state" when the rule says "empty state", or
"clickable-handler" when the rule says "clickable handler". Use the
`fuzzyKeyword` helper:

```javascript
keywords: [fuzzyKeyword('empty state')]   // matches "empty state" and "empty-state"
keywords: [fuzzyKeyword('aria label')]    // matches "aria-label" and "aria label"
```

`fuzzyKeyword(phrase)` is defined in `_grader-utils.mjs`. It escapes
regex metacharacters and replaces internal whitespace with `[-\s]*`,
so callers don't have to hand-roll the regex.

### G3. Per-finding-line keyword matching (not whole-text)

Don't `keywords.some(re => re.test(fullText))` — that produces spurious
cross-matches when keyword X appears in a different rule's finding line.
Use `_grader-utils.mjs`'s built-in per-finding-line matcher (split
findings.txt by line, match within each line).

### G4. Multiple keyword variants

Models phrase the same concept several ways:

+ "covering" / "does not cover" / "missing covering index"
+ "label" / "aria-label" / "labeled"
+ "hover" / "hover state" / "hover:bg-*"

Use the `tolerantKeyword` helper for word-stem matching:

```javascript
keywords: [tolerantKeyword('cover')]    // matches "cover", "covering", "covered"
keywords: [tolerantKeyword('label')]    // matches "label", "labeled", "labels"
```

For multiple distinct stems on the same rule, use an array — the grader
treats them as alternatives:

```javascript
keywords: [tolerantKeyword('hover'), fuzzyKeyword('hover state')]
```

Both `tolerantKeyword` and `fuzzyKeyword` are defined in `_grader-utils.mjs`.

### G5. Set-semantics for sibling/list assertions

When the grader checks a list of items, sort and compare — the model
emits items in different orders.

```javascript
const names = pdf.repo_siblings_in_cohort_names.split(' | ');
assert.deepEqual(names.sort(), ['docx', 'xlsx']);  // not deepEqual to ordered array
```

### G6. Verbosity floor for terse models

Gemini sometimes outputs 3-4 line responses. Don't grade strict-pass on
"all 5 violations found" — many gemini failures are *truncated output*,
not missed rules. Compute rule-coverage rate (sum-found / sum-expected)
as the load-bearing metric instead of binary pass.

---

## Default seeded violation types per skill shape

When the auto-pilot builds a case in Phase 2, seed at least one
violation from each category for the skill's shape. This ensures
coverage of the absence-vs-presence axis and exposes whether the skill
needs Pattern A (two-pass workflow), Pattern C (per-element
checklists), or something else.

### code-reviewer

Seed at least one of each:

1. Visible token misuse (e.g., `<div onClick>` for action)
2. Missing attribute (e.g., `<input>` without `autoComplete`)
3. Missing branch / no-empty-state (e.g., `array.map()` with no fallback for `[]`)
4. Anti-pattern that "looks normal" (e.g., `disabled={!form.valid}`)
5. State-machine violation (e.g., submit timing, focus on error)

### tool-use / mcp-driver

Seed at least one of each:

1. Reaches-for-fallback (model uses `curl`/`npm i` instead of the prescribed CLI)
2. Wrong tool flag (passes `--user` when the skill calls for `--principal`)
3. Missing required step (skips snapshot, skips re-snapshot after action)
4. Output not validated (returns trace.jsonl without checking required artifacts)

### document-producer

Seed at least one of each:

1. Missing required field in output (e.g., `answer.json` has no `risk_flags` key)
2. Wrong format (e.g., `2025-01-15` when the skill says `Intl.DateTimeFormat`)
3. Edge-case input (e.g., empty input, very long input, pre-corrupted file)
4. Format-only-correct: output validates but is unusable (e.g., PDF renders blank)

### code-patterns

Seed at least one of each:

1. Wrong convention applied (skill says use 2-space indent, output uses 4)
2. Pattern not applied at all (skill says use `useReducer`, output uses `useState`)
3. Incorrect composition (uses prescribed pattern but in the wrong order)

---

## Failure modes / known anti-patterns to avoid (Phase-4 don'ts)

### Don't manufacture problems

If baseline rule-coverage is ≥ 0.95, *exit clean*. Do not propose
modifications to a skill that already works. The goal is upstream PR
quality, not modification volume.

**Source:** auto-pilot pdf pilot — baseline 1.00, no modifications
proposed. Maintainers will lose trust in our PRs if we open them for
non-issues.

### Don't make breaking changes

All proposed modifications must be **additive**: new sections, new
examples, new checklists. Never:

+ Delete an existing rule
+ Change the wording of an existing rule  
+ Reorder existing sections
+ Remove URLs or references in the skill

This keeps the diff vs upstream small and the PR low-risk.

### Don't burn iteration 1 on the wrong problem

When baseline scores low, *first* check: is the grader the problem? Look
at the actual `findings.txt` from failed trials. If models *did* identify
the violations but the grader scored them wrong (line numbers off,
keyword mismatch, format variant), fix the grader as iteration 0 (don't
count it against the 2-iteration budget).

**Source:** auto-pilot supabase + agent-browser pilots — both spent
iteration 1 on grader fixes before reaching skill modification.

---

## Run-record protocol

Every pilot adds an entry to one of these tables when it discovers
something new. Format:

```markdown
**[skill-name] (date):** what was new — link to commit.
```

### Patterns added by pilots

+ **manual web-design-guidelines (2026-05-06):** Two-pass workflow + per-element
  checklists + 5 BAD/GOOD examples. Lifted 4-case suite from 72% → 86%.
+ **auto-pilot supabase (2026-05-08):** Independently rediscovered two-pass
  workflow. Added it to a SQL skill. 0.54 → 0.86.
+ **auto-pilot agent-browser (2026-05-08):** Found that grader was over-strict
  for non-interactive ops. Demoted snapshot from required to evidence-only.
  Also surfaced "Verify-tool-installed nudge" pattern.
+ **auto-pilot pdf (2026-05-08):** Validated "exit clean on already-good skill"
  — no modifications proposed; baseline 1.00.

### Grader patterns added by pilots

+ **manual web-design-guidelines (2026-05-06):** ±5-8 line tolerance, hyphen
  regex, per-finding-line matching, keyword variants.
+ **auto-pilot supabase (2026-05-08):** "covering" / "does not cover" alternation
  pattern. Confirmed ±3 → ±8 line widening is needed by default.

+ **auto-pilot supabase v2 (2026-05-12):** Upstream constraints required adding a new reference file (`monitor-two-pass-review.md`) instead of editing SKILL.md. Baseline was already 1.00 (calibrated graders from prior run). Pattern: when a re-run starts from calibrated graders, the Phase 3 exit condition fires before Phase 4 — the "modification" step then serves purely as upstream PR packaging rather than eval improvement.

(Future pilots: append your additions here.)
