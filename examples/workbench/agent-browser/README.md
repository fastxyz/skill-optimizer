# agent-browser eval

Eval suite for
[`vercel-labs/agent-browser/agent-browser`](https://github.com/vercel-labs/agent-browser) —
browser automation CLI for AI agents (Chrome/Chromium via CDP with
accessibility-tree snapshots).

## Cases

### `capture-homepage` — core loop + screenshot + title extraction

Sample: `https://example.com` (served by mock CLI)

| Check | Pattern | Rule |
|---|---|---|
| home.png created | screenshot command called and file exists | core quickstart |
| title.txt written | get title + write to file | `get title` command |
| `open` called | agent-browser open invoked | core loop step 1 |
| `snapshot` called | accessibility tree read before action | core loop step 2 |

### `search-screenshot` — form fill + smart wait + re-snapshot

Sample: `https://duckduckgo.com` search flow (served by mock CLI)

| Check | Pattern | Rule |
|---|---|---|
| search-results.png created | screenshot after navigation | core quickstart |
| `fill` used | clear-then-type for search box | fill vs type distinction |
| smart wait after submit | `--load`, `--url`, or `--text` wait | Waiting section |
| snapshot called 2+ times | re-snapshot after navigation | core loop step 4 |

### `extract-stories` — accessibility tree data extraction

Sample: `https://news.ycombinator.com` (served by mock CLI)

| Check | Pattern | Rule |
|---|---|---|
| stories.txt has 3+ lines | extracted 3 story titles | data extraction workflow |
| `snapshot` called | accessibility tree used for extraction | core loop + extract-data |
| `open` called for HN | navigated to correct URL | core loop step 1 |
| `close` called when done | browser closed after task | quickstart |

## Vendored snapshot

The skill normally loads core workflow content from the CLI at runtime:
`agent-browser skills get core`. For deterministic eval we vendor a
snapshot at `references/agent-browser/core.md` and tweak `SKILL.md` to
mention the local path. The mock CLI also returns the vendored content
when `agent-browser skills get core` is called.

The `bin/agent-browser` mock CLI records all commands to `command-log.txt`
and returns realistic static responses for `snapshot`, `get text`, and
`screenshot` without requiring a real browser.

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4.6`
- `openrouter/openai/gpt-5-mini`
- `openrouter/google/gemini-2.5-pro`
