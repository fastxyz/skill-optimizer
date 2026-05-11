---
skill: expo/skills/building-native-ui
status: success
classification: code-patterns
baseline_rule_coverage: 0.99
final_rule_coverage: 0.99
modifications_tried: 0
total_cost_usd: 0.67
---

# Auto-pilot run for `expo/skills/building-native-ui`

- Skill fetched from `https://github.com/expo/skills` — actual path is `plugins/expo/skills/building-native-ui/SKILL.md` (not the standard `skills/<id>/SKILL.md` layout)
- Classified as **code-patterns**: comprehensive Expo Router UI guidelines covering library preferences, styling, navigation, responsiveness, and behavior rules; evaluated using code-reviewer shape (seed violations → grade findings)
- Two sample files seeded with 5 violations each: `MediaPlayerScreen.tsx` (expo-av, Dimensions.get, Platform.OS, RN SafeAreaView, legacy shadow props) and `SettingsScreen.tsx` (expo-permissions, removed Picker, useContext→React.use, missing contentInsetAdjustmentBehavior, img element)
- Baseline run: 3 trials × 2 cases × 3 models = 18 trials; 17/18 passed; 89/90 violations found across all graders (rule-coverage = 0.989)
- Only miss: `useContext→React.use` rule missed once by gpt-5-mini (1/18 trials) — absence-of-alternative-API pattern per lessons.md, expected medium-high difficulty; single miss in 18 trials does not warrant modification
- Exiting success per Phase 3 rule (baseline ≥ 0.95); no upstream skill changes proposed
