// Grader for SettingsScreen.tsx violations.
// Expected: 5 violations seeded across library preferences, responsiveness, and behavior rules.

import { join } from 'node:path';
import { gradeFindings, looseRange, fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';

const work = process.env.WORK;
const findingsPath = join(work, 'findings.txt');
const file = 'SettingsScreen.tsx';

const expected = [
  {
    // Line 3: `import Permissions from 'expo-permissions'` — legacy, never use
    id: 'expo-permissions-deprecated',
    lines: looseRange(3),
    keywords: [fuzzyKeyword('expo-permissions'), tolerantKeyword('permission'), fuzzyKeyword('deprecated')],
  },
  {
    // Line 2: `Picker` imported from react-native — removed module, never use
    id: 'picker-removed-from-rn',
    lines: looseRange(2),
    keywords: [tolerantKeyword('Picker'), fuzzyKeyword('removed'), fuzzyKeyword('react-native')],
  },
  {
    // Line 8: `useContext(ThemeContext)` — should use `React.use(ThemeContext)`
    id: 'use-context-not-react-use',
    lines: looseRange(8),
    keywords: [fuzzyKeyword('useContext'), fuzzyKeyword('React.use'), fuzzyKeyword('use context')],
  },
  {
    // Line 11: `<ScrollView` missing `contentInsetAdjustmentBehavior="automatic"`
    id: 'scroll-view-missing-content-inset',
    lines: looseRange(11),
    keywords: [fuzzyKeyword('contentInsetAdjustmentBehavior'), fuzzyKeyword('content inset'), fuzzyKeyword('automatic'), fuzzyKeyword('ScrollView')],
  },
  {
    // Line 14: `<img` element — should use expo-image Image component
    id: 'img-element-not-expo-image',
    lines: looseRange(14),
    keywords: [fuzzyKeyword('img'), fuzzyKeyword('expo-image'), fuzzyKeyword('Image'), tolerantKeyword('intrinsic')],
  },
];

gradeFindings({ findingsPath, file, expected });
