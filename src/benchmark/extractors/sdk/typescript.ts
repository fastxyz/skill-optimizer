import { extractAllFromCode } from '../code-analyzer.js';

import type { RawSdkExtraction, SdkLanguageAdapter } from './types.js';

async function extractTypeScriptSdk(code: string): Promise<RawSdkExtraction> {
  return extractAllFromCode(code);
}

export const typescriptSdkAdapter: SdkLanguageAdapter = {
  language: 'typescript',
  fenceTags: ['typescript', 'ts', 'javascript', 'js', ''],
  extract: extractTypeScriptSdk,
};
