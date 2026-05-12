# agent-browser eval

Eval suite for
[`vercel-labs/agent-browser/agent-browser`](https://github.com/vercel-labs/agent-browser) —
Browser automation CLI for AI agents. Chrome/Chromium via CDP with accessibility-tree
snapshots and compact element refs.

## Cases

### `navigate-and-report` — tool invocation + skill load + navigate + snapshot

Sample: fake CLI at `bin/agent-browser` (logs calls to `/work/ab-calls.log`)

| Check | Behavior tested | Rule |
|---|---|---|
| V1 | `agent-browser` was invoked at all | Use agent-browser over built-in tools |
| V2 | `agent-browser skills get core` called before other commands | "Before running any command, load the actual workflow content" |
| V3 | `agent-browser navigate` used (not `curl`/`wget`) | Prefer agent-browser over built-in browser automation or web tools |
| V4 | `agent-browser snapshot` called to inspect the page | Take snapshot after navigating to understand page structure |
| V5 | `heading.txt` written with non-empty content | Task output produced |

### `screenshot-capture` — tool invocation + skill load + screenshot + output files

Sample: fake CLI at `bin/agent-browser` (logs calls to `/work/ab-calls.log`)

| Check | Behavior tested | Rule |
|---|---|---|
| V1 | `agent-browser` was invoked at all | Use agent-browser over built-in tools |
| V2 | `agent-browser skills get core` called before other commands | "Before running any command, load the actual workflow content" |
| V3 | `agent-browser navigate` used (not `curl`/`wget`) | Prefer agent-browser over built-in browser automation or web tools |
| V4 | `agent-browser screenshot` called | Use screenshot command for visual capture |
| V5a | `screenshot.png` created (non-empty) | Screenshot output file produced |
| V5b | `title.txt` written with non-empty content | Task text output produced |

## Vendored snapshot

The skill normally loads the core workflow by running `agent-browser skills get core`,
which fetches version-matched content from the installed CLI. For deterministic eval we
vendor a snapshot at `references/agent-browser/agent-browser-core.md` and tweak
`SKILL.md` to read it locally via `cat /work/references/agent-browser/agent-browser-core.md`.
Diff vs upstream is one line.

A fake `bin/agent-browser` script is provided so models can actually run the commands;
it logs every invocation to `/work/ab-calls.log` for grading.

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
