import type { SdkLanguage } from '../types.js';

const SDK_FENCE_TAGS: Record<SdkLanguage, string[]> = {
  typescript: ['typescript', 'ts', 'javascript', 'js', ''],
  python: ['python', 'py', ''],
  rust: ['rust', 'rs', ''],
};

/**
 * Extract the first SDK-language code block from markdown.
 * Returns the code content or null if no code block found.
 */
export function extractSdkCodeBlock(markdown: string, language: SdkLanguage): string | null {
  const regex = /```([^\n`]*)\n([\s\S]*?)```/g;
  const allowedTags = new Set(SDK_FENCE_TAGS[language]);

  for (const match of markdown.matchAll(regex)) {
    const tag = (match[1] ?? '').trim().toLowerCase();
    if (allowedTags.has(tag)) {
      return (match[2] ?? '').trim() || null;
    }
  }

  return null;
}

export function extractCodeBlock(markdown: string): string | null {
  return extractSdkCodeBlock(markdown, 'typescript');
}
