import type { ExtractedCall, SdkLanguage } from '../../types.js';

export interface RawSdkExtraction {
  calls: ExtractedCall[];
  bindings?: Map<string, string>;
}

export interface SdkLanguageAdapter {
  language: SdkLanguage;
  fenceTags: string[];
  extract(code: string): Promise<RawSdkExtraction>;
}
