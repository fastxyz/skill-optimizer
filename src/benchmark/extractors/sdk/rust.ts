import type Parser from 'web-tree-sitter';

import type { ExtractedCall } from '../../types.js';
import { getSdkParser } from './parser.js';
import { child, sortCalls, stripQuoted } from './shared.js';
import type { RawSdkExtraction, SdkLanguageAdapter } from './types.js';

type LiteralMap = Map<string, unknown>;
type BindingMap = Map<string, string>;

function extractRustValue(node: Parser.SyntaxNode, literalMap: LiteralMap): unknown {
  switch (node.type) {
    case 'string_literal':
      return stripQuoted(node.text);
    case 'integer_literal':
    case 'float_literal':
      return node.text;
    case 'boolean_literal':
      return node.text === 'true';
    case 'identifier':
      return literalMap.has(node.text) ? literalMap.get(node.text)! : `<${node.text}>`;
    case 'array_expression': {
      const result: unknown[] = [];
      for (const childNode of node.namedChildren) {
        result.push(extractRustValue(childNode, literalMap));
      }
      return result;
    }
    case 'struct_expression': {
      const result: Record<string, unknown> = {};
      const bodyNode = child(node, 'body');
      if (!bodyNode) return result;
      for (const fieldNode of bodyNode.namedChildren) {
        if (fieldNode.type !== 'field_initializer') continue;
        const nameNode = child(fieldNode, 'name');
        const valueNode = child(fieldNode, 'value');
        if (!nameNode || !valueNode) continue;
        result[nameNode.text] = extractRustValue(valueNode, literalMap);
      }
      return result;
    }
    case 'call_expression': {
      const fnNode = child(node, 'function');
      const argsNode = child(node, 'arguments');
      if (fnNode?.type === 'field_expression') {
        const valueNode = child(fnNode, 'value');
        const fieldNode = child(fnNode, 'field');
        if (fieldNode?.text === 'into' && valueNode && argsNode?.namedChildren.length === 0) {
          return extractRustValue(valueNode, literalMap);
        }
      }
      return '<dynamic>';
    }
    default:
      return `<${node.type}>`;
  }
}

function parseRustArgs(argsNode: Parser.SyntaxNode | null, literalMap: LiteralMap): Record<string, unknown> {
  if (!argsNode) return {};

  const args: Record<string, unknown> = {};
  let positionalIndex = 0;

  for (const childNode of argsNode.namedChildren) {
    if (childNode.type === 'struct_expression') {
      Object.assign(args, extractRustValue(childNode, literalMap) as Record<string, unknown>);
      continue;
    }

    args[`_positional_${positionalIndex++}`] = extractRustValue(childNode, literalMap);
  }

  return args;
}

function collectRustLiteralBindings(root: Parser.SyntaxNode): LiteralMap {
  const literalMap: LiteralMap = new Map();

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'let_declaration') {
      const patternNode = child(node, 'pattern');
      const valueNode = child(node, 'value');
      if (patternNode?.type === 'identifier' && valueNode && ['string_literal', 'integer_literal', 'float_literal', 'boolean_literal', 'array_expression', 'struct_expression', 'identifier'].includes(valueNode.type)) {
        literalMap.set(patternNode.text, extractRustValue(valueNode, literalMap));
      }
    }

    for (const childNode of node.namedChildren) visit(childNode);
  }

  visit(root);
  return literalMap;
}

function rustBindingFromCall(node: Parser.SyntaxNode): string | null {
  const fnNode = child(node, 'function');
  if (!fnNode) return null;

  if (fnNode.type === 'identifier') return fnNode.text;
  if (fnNode.type === 'scoped_identifier') {
    const pathNode = child(fnNode, 'path');
    return pathNode?.text ?? null;
  }
  if (fnNode.type === 'field_expression') {
    const fieldNode = child(fnNode, 'field');
    return fieldNode?.text ?? null;
  }

  return null;
}

function resolveRustOwner(node: Parser.SyntaxNode | null, bindings: BindingMap): string | null {
  if (!node) return null;

  if (node.type === 'identifier') {
    return bindings.get(node.text) ?? node.text;
  }

  if (node.type === 'try_expression') {
    return resolveRustOwner(node.namedChildren[0] ?? null, bindings);
  }

  if (node.type === 'call_expression') {
    const fnNode = child(node, 'function');
    if (!fnNode) return null;
    if (fnNode.type === 'scoped_identifier') {
      return child(fnNode, 'path')?.text ?? null;
    }
    if (fnNode.type === 'field_expression') {
      const valueNode = child(fnNode, 'value');
      const fieldNode = child(fnNode, 'field');
      if (valueNode?.type === 'identifier' && fieldNode) {
        return fieldNode.text;
      }
      return resolveRustOwner(valueNode, bindings);
    }
    if (fnNode.type === 'identifier') {
      return fnNode.text;
    }
  }

  if (node.type === 'field_expression') {
    return resolveRustOwner(child(node, 'value'), bindings);
  }

  return null;
}

function unwrapRustCall(node: Parser.SyntaxNode | null): Parser.SyntaxNode | null {
  if (!node) return null;
  if (node.type === 'call_expression') return node;
  if (node.type === 'try_expression') return node.namedChildren[0] ?? null;
  return null;
}

function collectRustBindings(root: Parser.SyntaxNode): BindingMap {
  const bindings: BindingMap = new Map();

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'let_declaration') {
      const patternNode = child(node, 'pattern');
      const valueNode = child(node, 'value');
      const callNode = unwrapRustCall(valueNode);
      if (patternNode?.type === 'identifier' && callNode?.type === 'call_expression') {
        const source = rustBindingFromCall(callNode);
        if (source) bindings.set(patternNode.text, source);
      }
    }

    for (const childNode of node.namedChildren) visit(childNode);
  }

  visit(root);
  return bindings;
}

function collectRustCalls(root: Parser.SyntaxNode, bindings: BindingMap, literalMap: LiteralMap): ExtractedCall[] {
  const calls: ExtractedCall[] = [];

  function visit(node: Parser.SyntaxNode): void {
    for (const childNode of node.namedChildren) visit(childNode);

    if (node.type === 'call_expression') {
      const fnNode = child(node, 'function');
      const argsNode = child(node, 'arguments');
      if (fnNode?.type === 'identifier') {
        calls.push({
          method: fnNode.text,
          args: parseRustArgs(argsNode, literalMap),
          line: node.startPosition.row + 1,
          raw: node.text,
        });
      } else if (fnNode?.type === 'scoped_identifier') {
        const pathNode = child(fnNode, 'path');
        const nameNode = child(fnNode, 'name');
        if (pathNode && nameNode) {
          calls.push({
            method: `${pathNode.text}.${nameNode.text}`,
            args: parseRustArgs(argsNode, literalMap),
            line: node.startPosition.row + 1,
            raw: node.text,
          });
        }
      } else if (fnNode?.type === 'field_expression') {
        const valueNode = child(fnNode, 'value');
        const fieldNode = child(fnNode, 'field');
        const owner = resolveRustOwner(valueNode, bindings);
        if (owner && fieldNode) {
          calls.push({
            method: `${owner}.${fieldNode.text}`,
            args: parseRustArgs(argsNode, literalMap),
            line: node.startPosition.row + 1,
            raw: node.text,
          });
        }
      }
    }
  }

  visit(root);
  return sortCalls(calls);
}

async function extractRustSdk(code: string): Promise<RawSdkExtraction> {
  const parser = await getSdkParser('rust');
  const tree = parser.parse(code);
  const root = tree.rootNode;
  const literalMap = collectRustLiteralBindings(root);
  const bindings = collectRustBindings(root);
  const calls = collectRustCalls(root, bindings, literalMap);
  return { calls, bindings };
}

export const rustSdkAdapter: SdkLanguageAdapter = {
  language: 'rust',
  fenceTags: ['rust', 'rs', ''],
  extract: extractRustSdk,
};
