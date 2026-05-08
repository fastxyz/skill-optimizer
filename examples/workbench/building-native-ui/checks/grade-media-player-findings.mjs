// Grader for MediaPlayerScreen.tsx violations.
// Expected: 5 violations seeded across library preferences, responsiveness, and styling rules.

import { join } from 'node:path';
import { gradeFindings, looseRange, fuzzyKeyword, tolerantKeyword } from './_grader-utils.mjs';

const work = process.env.WORK;
const findingsPath = join(work, 'findings.txt');
const file = 'MediaPlayerScreen.tsx';

const expected = [
  {
    // Line 3: `import { Video } from 'expo-av'` — should use expo-video, not expo-av
    id: 'expo-av-not-expo-video',
    lines: looseRange(3),
    keywords: [fuzzyKeyword('expo-av'), tolerantKeyword('expo-video'), tolerantKeyword('expo-audio')],
  },
  {
    // Line 5: `Dimensions.get('window')` — should use useWindowDimensions
    id: 'dimensions-get-not-hook',
    lines: looseRange(5),
    keywords: [fuzzyKeyword('Dimensions'), fuzzyKeyword('useWindowDimensions'), fuzzyKeyword('window dimensions')],
  },
  {
    // Line 8: `Platform.OS` — should use `process.env.EXPO_OS`
    id: 'platform-os-not-expo-os',
    lines: looseRange(8),
    keywords: [fuzzyKeyword('Platform.OS'), fuzzyKeyword('EXPO_OS'), fuzzyKeyword('process.env')],
  },
  {
    // Line 11: `<SafeAreaView` from react-native — should use react-native-safe-area-context
    id: 'rn-safe-area-view-wrong-import',
    lines: looseRange(11),
    keywords: [fuzzyKeyword('SafeAreaView'), fuzzyKeyword('safe-area-context'), fuzzyKeyword('safe area context')],
  },
  {
    // Line 32: `shadowColor` legacy shadow props — should use CSS `boxShadow`
    id: 'legacy-shadow-not-box-shadow',
    lines: looseRange(32),
    keywords: [fuzzyKeyword('shadowColor'), fuzzyKeyword('boxShadow'), fuzzyKeyword('box shadow'), fuzzyKeyword('legacy shadow'), tolerantKeyword('elevation')],
  },
];

gradeFindings({ findingsPath, file, expected });
