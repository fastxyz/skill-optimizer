# firebase-hosting-basics eval

Eval suite for
[`firebase/agent-skills/firebase-hosting-basics`](https://github.com/firebase/agent-skills) —
skill for working with Firebase Hosting (Classic): deploying static web apps and SPAs.

## Cases

### `review-firebase-config` — firebase.json best practices

Sample: `workspace/firebase-app/firebase.json`

| Line | Violation | Rule |
|---|---|---|
| 3  | `"public": "src"` — wrong directory; SPA builds output to `dist` or `build`, not `src` | `public` should point to build output dir |
| 5  | `ignore` list missing `**/.*` and `**/node_modules/**` patterns | Default ignores: `firebase.json`, `**/.*`, `**/node_modules/**` |
| 7  | `"cleanUrls": false` — should be `true` for clean URL paths | `cleanUrls` best practice is `true` |
| 12 | `"type": 200` — invalid redirect type; must be `301` or `302` | Redirects accept only `301` (permanent) or `302` (temporary) |
| 15–20 | No SPA catch-all rewrite `**` → `/index.html`; direct deep-links will return 404 | SPAs need `{ "source": "**", "destination": "/index.html" }` |

## Vendored snapshot

The skill normally reads `references/configuration.md` and `references/deploying.md` from the
same directory as `SKILL.md`. For deterministic eval we vendor a snapshot at
`references/firebase-hosting-basics/` and tweak `SKILL.md` to use local relative links
(removing the `references/` path prefix). Diff vs upstream is two lines.

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4-6`
- `openrouter/openai/gpt-4o-mini`
- `openrouter/google/gemini-2.5-pro`
