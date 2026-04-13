import type { SdkLanguage } from '../../types.js';
import { pythonSdkAdapter } from './python.js';
import { rustSdkAdapter } from './rust.js';
import { typescriptSdkAdapter } from './typescript.js';
import type { RawSdkExtraction, SdkLanguageAdapter } from './types.js';

const ADAPTERS: Record<SdkLanguage, SdkLanguageAdapter> = {
  typescript: typescriptSdkAdapter,
  python: pythonSdkAdapter,
  rust: rustSdkAdapter,
};

export function getSdkAdapter(language: SdkLanguage): SdkLanguageAdapter {
  return ADAPTERS[language];
}

export async function extractSdkFromCode(code: string, language: SdkLanguage): Promise<RawSdkExtraction> {
  return getSdkAdapter(language).extract(code);
}
