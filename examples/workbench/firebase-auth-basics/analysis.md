---
skill: firebase/agent-skills/firebase-auth-basics
status: success
classification: code-reviewer
baseline_rule_coverage: 1.00
final_rule_coverage: 1.00
modifications_tried: 0
total_cost_usd: 0.60
---

# Auto-pilot run for `firebase/agent-skills/firebase-auth-basics`

- **Classification: code-reviewer** — skill prescribes Firebase Auth best practices (onAuthStateChanged, error handling, emulator connection, security rules); well-suited to seed-and-grade eval pattern.
- **Seeded 6 violations** across 2 files: `src/auth.js` (4 violations — missing emulator connection, direct `auth.currentUser` access, missing `.catch` on email sign-up, missing `try/catch` on Google sign-in) and `firestore.rules` (2 violations — missing `request.auth != null` null guard, unauthenticated write rule).
- **Baseline rule coverage: 1.00** on 16 completed trials (3 models × 2 cases × 3 trials = 18 total; 2 Gemini trials failed with transient SSE stream infrastructure errors unrelated to skill quality).
- **No modifications needed**: all models (Claude, GPT-5-mini, Gemini) reliably identified all seeded violations on first attempt; the skill's guidance is clear and effective.
- **No proposed upstream changes**: per lessons.md §"Don't manufacture problems", baseline ≥ 0.95 → exit clean.
- Total cost: ~$0.60 across 16 successful trials.
