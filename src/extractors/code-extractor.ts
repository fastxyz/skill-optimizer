/**
 * Extract the first TypeScript/JavaScript code block from markdown.
 * Looks for ```typescript, ```ts, ```javascript, ```js, or bare ``` blocks.
 * Returns the code content or null if no code block found.
 */
export function extractCodeBlock(markdown: string): string | null {
  // Match fenced code blocks: ```lang\n...\n```
  const regex = /```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)```/;
  const match = markdown.match(regex);
  return match?.[1]?.trim() ?? null;
}

