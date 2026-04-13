import type Parser from 'web-tree-sitter';

import type { ExtractedCall } from '../../types.js';
import { getSdkParser } from './parser.js';
import { child, isTypeLike, sortCalls, stripQuoted } from './shared.js';
import type { RawSdkExtraction, SdkLanguageAdapter } from './types.js';

type LiteralMap = Map<string, unknown>;
type BindingMap = Map<string, string>;

function extractPythonValue(node: Parser.SyntaxNode, literalMap: LiteralMap): unknown {
  switch (node.type) {
    case 'string':
      return stripQuoted(node.text);
    case 'integer':
    case 'float':
      return node.text;
    case 'true':
      return true;
    case 'false':
      return false;
    case 'none':
      return null;
    case 'identifier':
      return literalMap.has(node.text) ? literalMap.get(node.text)! : `<${node.text}>`;
    case 'list': {
      const result: unknown[] = [];
      for (const childNode of node.namedChildren) {
        result.push(extractPythonValue(childNode, literalMap));
      }
      return result;
    }
    case 'dictionary': {
      const result: Record<string, unknown> = {};
      for (const pair of node.namedChildren) {
        if (pair.type !== 'pair') continue;
        const keyNode = pair.namedChildren[0];
        const valueNode = pair.namedChildren[1];
        if (!keyNode || !valueNode) continue;
        const key = stripQuoted(keyNode.text);
        result[key] = extractPythonValue(valueNode, literalMap);
      }
      return result;
    }
    case 'call':
      return '<dynamic>';
    case 'attribute':
      return `<${node.text}>`;
    default:
      return `<${node.type}>`;
  }
}

function parsePythonArgs(argsNode: Parser.SyntaxNode | null, literalMap: LiteralMap): Record<string, unknown> {
  if (!argsNode) return {};

  const args: Record<string, unknown> = {};
  let positionalIndex = 0;

  for (const childNode of argsNode.namedChildren) {
    if (childNode.type === 'keyword_argument') {
      const nameNode = child(childNode, 'name');
      const valueNode = child(childNode, 'value');
      if (!nameNode || !valueNode) continue;
      args[nameNode.text] = extractPythonValue(valueNode, literalMap);
      continue;
    }

    args[`_positional_${positionalIndex++}`] = extractPythonValue(childNode, literalMap);
  }

  return args;
}

function collectPythonLiteralBindings(root: Parser.SyntaxNode): LiteralMap {
  const literalMap: LiteralMap = new Map();

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'assignment') {
      const left = child(node, 'left');
      const right = child(node, 'right');
      if (left?.type === 'identifier' && right && ['string', 'integer', 'float', 'list', 'dictionary', 'true', 'false', 'none', 'identifier'].includes(right.type)) {
        literalMap.set(left.text, extractPythonValue(right, literalMap));
      }
    }

    for (const childNode of node.namedChildren) visit(childNode);
  }

  visit(root);
  return literalMap;
}

function pythonBindingFromCall(node: Parser.SyntaxNode, bindings: BindingMap): string | null {
  const fnNode = child(node, 'function');
  if (!fnNode) return null;

  if (fnNode.type === 'identifier') {
    return fnNode.text;
  }

  if (fnNode.type === 'attribute') {
    const objectNode = child(fnNode, 'object');
    const attributeNode = child(fnNode, 'attribute');
    if (!objectNode || !attributeNode) return null;
    if (isTypeLike(objectNode.text)) return objectNode.text;
    return attributeNode.text;
  }

  return null;
}

function unwrapPythonCall(node: Parser.SyntaxNode | null): Parser.SyntaxNode | null {
  if (!node) return null;
  if (node.type === 'call') return node;
  if (node.type === 'await') {
    return node.namedChildren[0] ?? null;
  }

  return null;
}

function collectPythonBindings(root: Parser.SyntaxNode): BindingMap {
  const bindings: BindingMap = new Map();

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'assignment') {
      const left = child(node, 'left');
      const right = child(node, 'right');
      const callNode = unwrapPythonCall(right);
      if (left?.type === 'identifier' && callNode?.type === 'call') {
        const source = pythonBindingFromCall(callNode, bindings);
        if (source) bindings.set(left.text, source);
      }
    }

    for (const childNode of node.namedChildren) visit(childNode);
  }

  visit(root);
  return bindings;
}

function collectPythonCalls(root: Parser.SyntaxNode, bindings: BindingMap, literalMap: LiteralMap): ExtractedCall[] {
  const calls: ExtractedCall[] = [];

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'call') {
      const fnNode = child(node, 'function');
      const argsNode = child(node, 'arguments');
      if (fnNode?.type === 'identifier') {
        const method = isTypeLike(fnNode.text) ? `${fnNode.text}.constructor` : fnNode.text;
        calls.push({
          method,
          args: parsePythonArgs(argsNode, literalMap),
          line: node.startPosition.row + 1,
          raw: node.text,
        });
      } else if (fnNode?.type === 'attribute') {
        const objectNode = child(fnNode, 'object');
        const attributeNode = child(fnNode, 'attribute');
        if (objectNode && attributeNode) {
          const owner = bindings.get(objectNode.text) ?? objectNode.text;
          calls.push({
            method: `${owner}.${attributeNode.text}`,
            args: parsePythonArgs(argsNode, literalMap),
            line: node.startPosition.row + 1,
            raw: node.text,
          });
        }
      }
    }

    for (const childNode of node.namedChildren) visit(childNode);
  }

  visit(root);
  return sortCalls(calls);
}

export async function extractPythonSdk(code: string): Promise<RawSdkExtraction> {
  const parser = await getSdkParser('python');
  const tree = parser.parse(code);
  const root = tree.rootNode;
  const literalMap = collectPythonLiteralBindings(root);
  const bindings = collectPythonBindings(root);
  const calls = collectPythonCalls(root, bindings, literalMap);
  return { calls, bindings };
}

export const pythonSdkAdapter: SdkLanguageAdapter = {
  language: 'python',
  fenceTags: ['python', 'py', ''],
  extract: extractPythonSdk,
};
