# native-data-fetching eval

Eval suite for
[`expo/skills/native-data-fetching`](https://github.com/expo/skills) —
prescribes Expo networking conventions: prefer `fetch` over axios, use
`SecureStore` for tokens, keep secrets out of `EXPO_PUBLIC_` env vars, always
check `response.ok`, and use `AbortController` for request cancellation.

## Cases

### `review-client` — axios, missing response.ok, insecure token storage

Sample: `workspace/api/client.ts`

| Line | Violation | Rule |
|---|---|---|
| 1 | `import axios from 'axios'` — axios used instead of native fetch | Preferences: "Avoid axios, prefer expo/fetch" |
| 12 | `axios.get(...)` — axios call in production fetch function | Preferences: "Avoid axios, prefer expo/fetch" |
| 18 | `response.json()` called without prior `response.ok` check | Common Mistakes: "Check response status" |
| 35 | `AsyncStorage.setItem('auth_token', token)` — token stored insecurely | Common Mistakes: "Use SecureStore for sensitive data" |

### `review-dashboard` — exposed secret, no AbortController, axios again

Sample: `workspace/screens/DashboardScreen.tsx`

| Line | Violation | Rule |
|---|---|---|
| 5 | `EXPO_PUBLIC_STRIPE_SECRET_KEY` — secret embedded in client bundle | Env Variables: "Never put secrets in EXPO_PUBLIC_ variables" |
| 17–19 | `fetch(...)` in `useEffect` with no `AbortController` cleanup | Section 7: "Cancel on unmount" |
| 3 | `import axios from 'axios'` — axios used instead of fetch | Preferences: "Avoid axios, prefer expo/fetch" |
| 23 | `axios.get(...)` — axios call inside useEffect | Preferences: "Avoid axios, prefer expo/fetch" |

## Vendored snapshot

The skill normally references `references/expo-router-loaders.md` relative to
the workspace root. For deterministic eval we vendor a snapshot at
`references/expo-router-loaders.md`. The `SKILL.md` copy is verbatim from
upstream (no local-path tweak needed — the skill already uses relative local
paths, not WebFetch URLs).

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
