---
skill: expo/skills/native-data-fetching
status: success
classification: code-reviewer
baseline_rule_coverage: 1.00
final_rule_coverage: 1.00
modifications_tried: 0
total_cost_usd: 1.00
---

# Auto-pilot run for `expo/skills/native-data-fetching`

- Skill fetched from `plugins/expo/skills/native-data-fetching/SKILL.md` in the `expo/skills` repo (path differs from the simple `skills/<id>/SKILL.md` template — the repo uses a `plugins/expo/skills/` prefix).
- Classified as **code-reviewer**: prescribes Expo networking conventions (fetch over axios, SecureStore for tokens, keep secrets out of `EXPO_PUBLIC_` env vars, always check `response.ok`, use AbortController for cancellation) and the agent reviews code files against these rules.
- Seeded 2 TypeScript/TSX files with 3 violations each (6 total): `api/client.ts` (axios import, missing `response.ok` check, `AsyncStorage` token storage) and `screens/DashboardScreen.tsx` (secret in `EXPO_PUBLIC_`, no `AbortController`, axios usage).
- The skill already uses local `references/` paths rather than WebFetch URLs — no local-path tweak needed in the vendored copy.
- Baseline: 18/18 trials passed across 3 models × 2 cases × 3 trials = **rule-coverage 1.00**. No modifications required.
- Exiting clean per "exit clean on already-good skill" pattern from lessons.md.
