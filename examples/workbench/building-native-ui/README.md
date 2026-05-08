# building-native-ui eval

Eval suite for
[`expo/skills/building-native-ui`](https://github.com/expo/skills) —
complete guide for building beautiful apps with Expo Router, covering
library preferences, styling, navigation, responsiveness, and behavior rules.

## Cases

### `review-media-player` — Library preferences, responsiveness, and styling

Sample: `workspace/MediaPlayerScreen.tsx`

| Line | Violation | Rule |
|------|-----------|------|
| 3    | `import { Video } from 'expo-av'` — should use `expo-video` | Library Preferences: `expo-video` not `expo-av` |
| 5    | `Dimensions.get('window')` — should use `useWindowDimensions` | Responsiveness: prefer `useWindowDimensions` over `Dimensions.get()` |
| 8    | `Platform.OS` — should use `process.env.EXPO_OS` | Library Preferences: `process.env.EXPO_OS` not `Platform.OS` |
| 11   | `<SafeAreaView` from `react-native` — should use `react-native-safe-area-context` | Library Preferences: `react-native-safe-area-context` not RN SafeAreaView |
| 32   | `shadowColor`, `shadowOffset`, `elevation` legacy shadow props | Styling/Shadows: use CSS `boxShadow`, NEVER legacy RN shadow/elevation |

### `review-settings-screen` — Library preferences, responsiveness, and behavior

Sample: `workspace/SettingsScreen.tsx`

| Line | Violation | Rule |
|------|-----------|------|
| 2    | `Picker` imported from `react-native` — removed module | Library Preferences: never use modules removed from React Native |
| 3    | `import Permissions from 'expo-permissions'` — deprecated | Library Preferences: never use legacy expo-permissions |
| 8    | `useContext(ThemeContext)` — should use `React.use(ThemeContext)` | Library Preferences: `React.use` not `React.useContext` |
| 11   | `<ScrollView` missing `contentInsetAdjustmentBehavior="automatic"` | Responsiveness: always use `contentInsetAdjustmentBehavior="automatic"` on ScrollView |
| 14   | `<img` intrinsic element — should use `expo-image` Image | Library Preferences: `expo-image` Image instead of `img`; Behavior: never use intrinsic elements |

## Vendored snapshot

The skill normally ships as part of the `expo/skills` repo at
`plugins/expo/skills/building-native-ui/SKILL.md`. For deterministic eval
we vendor a snapshot at `references/building-native-ui/SKILL.md`. The skill
has no remote fetch calls, so the diff vs upstream is zero (content identical).

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4-6`
- `openrouter/openai/gpt-5-mini`
- `openrouter/google/gemini-2.5-pro`
