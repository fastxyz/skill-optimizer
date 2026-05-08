# firebase-auth-basics eval

Eval suite for
[`firebase/agent-skills/firebase-auth-basics`](https://github.com/firebase/agent-skills) —
guide for setting up and using Firebase Authentication in web, Flutter, and Android apps.

## Cases

### `review-auth-js` — Web SDK auth patterns

Sample: `workspace/src/auth.js`

| Line | Violation | Rule |
|---|---|---|
| 4 | Missing `connectAuthEmulator` block for localhost | Connect to emulator when `location.hostname === "localhost"` |
| 11 | `auth.currentUser` used directly (synchronous, unreliable) | Use `onAuthStateChanged` to observe auth state |
| 17 | `createUserWithEmailAndPassword` missing `.catch` error handler | Auth calls must handle errors (errorCode, errorMessage) |
| 25 | `signInWithPopup` missing `try/catch` error handler | Auth calls must handle errors |

### `review-firestore-rules` — Security rules

Sample: `workspace/firestore.rules`

| Line | Violation | Rule |
|---|---|---|
| 7 | Missing `request.auth != null` guard before `.uid` comparison (null-dereference) | Always check `request.auth != null` before accessing `.uid` |
| 11 | `allow read, write: if true` — no authentication required | Use `request.auth` checks to restrict access |

## Vendored snapshot

The skill normally references local markdown docs (`references/client_sdk_web.md`,
`references/security_rules.md`, etc.). These are already local-path references in
the upstream SKILL.md — no URL tweak is needed. We vendor the full reference set at
`references/firebase-auth-basics/references/` for eval determinism. Diff vs upstream
is zero lines (SKILL.md copied verbatim).

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
