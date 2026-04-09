import type Parser from 'web-tree-sitter';

import type { ExtractedCall } from '../../types.js';

export function stripQuoted(text: string): string {
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('`') && text.endsWith('`'))
  ) {
    return text.slice(1, -1);
  }

  return text;
}

export function isTypeLike(name: string): boolean {
  return /^[A-Z]/.test(name);
}

export function sortCalls(calls: ExtractedCall[]): ExtractedCall[] {
  calls.sort((a, b) => a.line - b.line);
  return calls;
}

export function child(node: Parser.SyntaxNode, field: string): Parser.SyntaxNode | null {
  return node.childForFieldName(field);
}
