# agent-browser eval

Eval suite for
[`vercel-labs/agent-browser/agent-browser`](https://github.com/vercel-labs/agent-browser) —
Browser automation CLI for AI agents. Chrome/Chromium via CDP with accessibility-tree
snapshots and compact `@eN` element refs.

## Cases

The suite has two tiers. Tier-0 inherits from the v1 baseline and grades only
that the right CLI subcommands were invoked. Tier-1 grades the actual value of
the skill: snapshot-driven workflows, `@eN` ref discipline, and content
correctness derived from pre-recorded accessibility trees.

### Tier-0 — command presence

#### `navigate-and-report` — tool invocation + skill load + navigate + snapshot

| Check | Behavior tested | Rule |
|---|---|---|
| V1 | `agent-browser` was invoked at all | Use agent-browser over built-in tools |
| V2 | `agent-browser skills get core` called before other commands | "Before running any command, load the actual workflow content" |
| V3 | `agent-browser navigate` used (not `curl`/`wget`) | Prefer agent-browser over built-in browser automation or web tools |
| V4 | `agent-browser snapshot` called to inspect the page | Take snapshot after navigating to understand page structure |
| V5 | `heading.txt` written with non-empty content | Task output produced |

#### `screenshot-capture` — tool invocation + skill load + screenshot + output files

| Check | Behavior tested | Rule |
|---|---|---|
| V1 | `agent-browser` was invoked at all | Use agent-browser over built-in tools |
| V2 | `agent-browser skills get core` called before other commands | "Before running any command, load the actual workflow content" |
| V3 | `agent-browser navigate` used (not `curl`/`wget`) | Prefer agent-browser over built-in browser automation or web tools |
| V4 | `agent-browser screenshot` called | Use screenshot command for visual capture |
| V5a | `screenshot.png` created (non-empty) | Screenshot output file produced |
| V5b | `title.txt` written with non-empty content | Task text output produced |

### Tier-1 — snapshot-driven `@eN` refs and content correctness

These cases play back **pre-recorded accessibility-tree snapshots** so the
grader can verify the agent reached the right element, took the right
state-machine path, and extracted the right text. See
[Recording playback](#recording-playback) below.

#### `ref-based-search` — Wikipedia-style search via `@eN` refs

Recordings: `references/agent-browser/recordings/wikipedia/`
(`snapshot.out`, `snapshot-after-search.out`, `transitions.txt`)

| Check | Behavior tested |
|---|---|
| V1 | agent-browser was invoked |
| V2 | snapshot called BEFORE the first click/type (snapshot-first discipline) |
| V3 | `type @e7 …` — typed into the searchbox by its accessibility ref, not a CSS selector |
| V4 | `click @e8` — clicked the submit button by its ref, not the searchbox or another link |
| V5 | snapshot re-taken AFTER `click @e8` (must observe the new page) |
| V6 | `top-result.txt` contains the actual top result ("Hypertext Transfer Protocol") from the recorded results page |
| V7 | no CSS-selector-style refs anywhere in click/type calls |

#### `ref-disambiguation` — pick the right of two visually-similar buttons

Recordings: `references/agent-browser/recordings/signin-signup/`
(buttons `@e5 "Sign In"` vs `@e6 "Sign Up"`, with separate post-click pages)

| Check | Behavior tested |
|---|---|
| V1 | agent-browser was invoked |
| V2 | snapshot-first discipline |
| V3 | clicked `@e5` (Sign In), NOT `@e6` (Sign Up) |
| V4 | exactly one click on `@e5` (no retry loop) |
| V5 | `next-heading.txt` matches the Sign In flow heading (NOT the Sign Up heading) |
| V6 | no CSS-selector-style refs |

#### `output-correctness` — extract the right text from three plausible candidates

Recordings: `references/agent-browser/recordings/blog-article/`. The page has
a kicker tagline, a level-1 article heading, and a byline — only the heading
is the article title.

| Check | Behavior tested |
|---|---|
| V1 | agent-browser was invoked |
| V2 | snapshot was called |
| V3 | `title.txt` matches the article title exactly ("Why We Migrated Our Build System to Bazel") |
| V4 | `title.txt` does NOT include the kicker "FROM THE PLATFORM TEAM" |
| V5 | `title.txt` does NOT include the byline ("By Jordan Lee") |
| V6 | no CSS-selector-style refs |

#### `multi-step-state` — full state-machine traversal across a 2-field form

Recordings: `references/agent-browser/recordings/multistep-form/` —
`initial -> name-entered -> email-entered -> submitted`. Each post-action
snapshot reveals new state (filled values, button-disabled flag, then a
confirmation page with code `NL-7QF3-2026`).

| Check | Behavior tested |
|---|---|
| V1 | agent-browser was invoked |
| V2 | snapshot-first discipline |
| V3 | full path traversed in order: `type @e5` -> `type @e6` -> `click @e7` |
| V4 | the value typed into `@e6` is an email-shaped string (matches "<ada@example.com>") |
| V5 | snapshot re-taken AFTER the final click (must observe confirmation page) |
| V6 | `confirm.txt` contains "NL-7QF3-2026" (extracted from the post-submit recording) |
| V7 | no CSS-selector-style refs |

## Recording playback

The Tier-1 cases use **fabricated but realistic** accessibility-tree
recordings. Real `agent-browser` would need a Rust binary plus a headless
Chrome inside the Docker workbench; the eval avoids that by replaying static
fixtures that look exactly like real `snapshot` output.

Layout per page:

```text
references/agent-browser/recordings/<page>/
  transitions.txt        # URL match, initial state, click/type -> next-state rules
  snapshot.out           # initial snapshot
  snapshot-<state>.out   # one file per reachable post-action state
```

`transitions.txt` example:

```text
url=https://en.wikipedia.org/wiki/Main_Page
url-prefix=https://en.wikipedia.org
state=initial

type  @e7 -> initial
click @e8 -> after-search
```

The fake CLI at `bin/agent-browser`:

- Logs every invocation to `/work/ab-calls.log` (graders depend on this).
- Maintains a 2-line state cookie at `/work/.ab-state` (`page=…`, `state=…`).
- On `navigate <url>`: matches the URL against each recording's `url=` /
  `url-prefix=` and resets to that page's `state=`.
- On `snapshot`: emits the recorded `snapshot[-<state>].out` for the current
  page+state. Falls back to the legacy generic `Example Domain` snapshot when
  no page is set (this preserves Tier-0 behaviour).
- On `click @eN` / `type @eN …`: looks up matching transitions and advances
  state if a rule fires. Always echoes a realistic `Clicked @eN` /
  `Typed "…" into @eN` line.
- For `screenshot`, `evaluate`, `skills get …`, `version`, `which`: returns
  canned but shape-correct output.

The CLI accepts an `AB_WORK` environment variable so it can be smoke-tested
outside Docker against a local sandbox directory; in production the workbench
mounts the agent at `/work` so the default applies.

## Vendored snapshot

The skill normally loads the core workflow by running
`agent-browser skills get core`, which fetches version-matched content from
the installed CLI. For deterministic eval we vendor a snapshot at
`references/agent-browser/agent-browser-core.md` (updated for `@eN` ref
syntax) and tweak `SKILL.md` to read it locally via
`cat /work/references/agent-browser/agent-browser-core.md`. Diff vs upstream
is one line.

## Smoke-check the graders

Before spending real model dollars, verify each grader's checks fire as
designed. The smoke script crafts good and bad `ab-calls.log` + output-file
fixtures for every Tier-1 case and asserts the JSON envelope:

```bash
node examples/workbench/agent-browser/checks/smoke-graders.mjs
```

It runs each grader twice or more (one GOOD scenario expected to pass, plus
one or more BAD scenarios that must fail with specific evidence substrings).
The script exits non-zero if any assertion is violated. There are 14
assertions across the 4 new graders; failures preserve the temp workspace
for triage.

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4.6`
- `openrouter/openai/gpt-5`
- `openrouter/google/gemini-2.5-pro`
