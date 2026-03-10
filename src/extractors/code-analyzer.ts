import Parser from 'web-tree-sitter';
import { createRequire } from 'node:module';

import type { ExtractedCall } from '../types.js';

const require = createRequire(import.meta.url);

// ── Lazy singleton parser ──────────────────────────────────────────────────

let parser: Parser | null = null;

async function initParser(): Promise<Parser> {
  if (parser) return parser;

  await Parser.init();
  parser = new Parser();

  const wasmPath = require.resolve('tree-sitter-wasms/out/tree-sitter-typescript.wasm');
  const TypeScript = await Parser.Language.load(wasmPath);
  parser.setLanguage(TypeScript);

  return parser;
}

// ── Argument extraction ────────────────────────────────────────────────────

/**
 * Extract a scalar value from a tree-sitter node.
 * Returns a string representation or a sentinel for dynamic values.
 */
function extractScalar(node: Parser.SyntaxNode): unknown {
  switch (node.type) {
    case 'string':
    case 'string_fragment': {
      // Strip surrounding quotes
      const text = node.text;
      if (
        (text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'")) ||
        (text.startsWith('`') && text.endsWith('`'))
      ) {
        return text.slice(1, -1);
      }
      return text;
    }
    case 'number':
      return node.text;
    case 'true':
      return true;
    case 'false':
      return false;
    case 'null':
      return null;
    case 'undefined':
      return undefined;
    case 'template_string':
      return '<template>';
    case 'identifier':
      return `<${node.text}>`;
    case 'member_expression':
      return `<${node.text}>`;
    case 'binary_expression':
    case 'call_expression':
    case 'await_expression':
      return '<dynamic>';
    default:
      return `<${node.type}>`;
  }
}

/**
 * Parse an object literal node into a key-value record.
 */
function parseObjectLiteral(node: Parser.SyntaxNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const child of node.namedChildren) {
    if (child.type === 'pair') {
      const keyNode = child.namedChildren[0];
      const valueNode = child.namedChildren[1];
      if (!keyNode || !valueNode) continue;

      // Key can be identifier, string, or computed
      let key: string;
      if (keyNode.type === 'property_identifier' || keyNode.type === 'identifier') {
        key = keyNode.text;
      } else if (keyNode.type === 'string') {
        key = keyNode.text.slice(1, -1);
      } else {
        key = keyNode.text;
      }

      result[key] = extractScalar(valueNode);
    } else if (child.type === 'shorthand_property_identifier') {
      // { foo } shorthand
      result[child.text] = `<${child.text}>`;
    } else if (child.type === 'spread_element') {
      result['...spread'] = '<spread>';
    }
  }

  return result;
}

/**
 * Parse the arguments node of a call/new expression.
 * Returns a record of extracted arguments.
 * All positional args use `_positional_${index}` keys.
 */
function parseArguments(argsNode: Parser.SyntaxNode): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  let positionalIndex = 0;

  for (const child of argsNode.namedChildren) {
    if (child.type === 'object') {
      // Merge object literal into args (first object wins for named args)
      const obj = parseObjectLiteral(child);
      Object.assign(args, obj);
    } else if (child.type === 'string') {
      const value = extractScalar(child);
      const key = `_positional_${positionalIndex}`;
      args[key] = value;
      positionalIndex++;
    } else if (child.type === 'number') {
      const key = `_positional_${positionalIndex}`;
      args[key] = child.text;
      positionalIndex++;
    } else if (child.type === 'template_string') {
      const key = `_positional_${positionalIndex}`;
      args[key] = '<template>';
      positionalIndex++;
    } else if (child.type === 'identifier') {
      const key = `_positional_${positionalIndex}`;
      args[key] = `<${child.text}>`;
      positionalIndex++;
    } else if (child.type === 'true' || child.type === 'false') {
      const key = `_positional_${positionalIndex}`;
      args[key] = child.type === 'true';
      positionalIndex++;
    } else if (child.type === 'null') {
      const key = `_positional_${positionalIndex}`;
      args[key] = null;
      positionalIndex++;
    } else if (child.type === 'member_expression' || child.type === 'call_expression') {
      const key = `_positional_${positionalIndex}`;
      args[key] = '<dynamic>';
      positionalIndex++;
    } else if (child.type === 'await_expression') {
      const key = `_positional_${positionalIndex}`;
      args[key] = '<dynamic>';
      positionalIndex++;
    }
    // Skip commas and other punctuation (non-named children)
  }

  return args;
}

// ── Variable tracking ──────────────────────────────────────────────────────

/**
 * Tracks which variable names are bound to which SDK class.
 * e.g. { provider: 'FastProvider', wallet: 'FastWallet' }
 */
type VarMap = Map<string, string>;

/**
 * Walk the entire tree once to collect variable-to-class assignments.
 * Handles:
 *   const provider = new FastProvider(...)
 *   const wallet = await FastWallet.fromKeyfile(...)
 *   const wallet = FastWallet.generate(provider)
 */
function collectVariableBindings(rootNode: Parser.SyntaxNode, sdkClasses: Set<string>): VarMap {
  const varMap: VarMap = new Map();

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'variable_declarator' || node.type === 'assignment_expression') {
      const nameNode =
        node.type === 'variable_declarator'
          ? node.childForFieldName('name')
          : node.childForFieldName('left');
      const valueNode =
        node.type === 'variable_declarator'
          ? node.childForFieldName('value')
          : node.childForFieldName('right');

      if (!nameNode || !valueNode) {
        for (const child of node.children) visit(child);
        return;
      }

      const varName = nameNode.text;
      const sdkClass = detectSdkClassFromExpr(valueNode, sdkClasses);
      if (sdkClass) {
        varMap.set(varName, sdkClass);
      }
    }

    for (const child of node.children) {
      visit(child);
    }
  }

  visit(rootNode);
  return varMap;
}

/**
 * Given an expression node (possibly wrapped in await), detect which SDK class
 * it produces. Returns the class name or null.
 */
function detectSdkClassFromExpr(node: Parser.SyntaxNode, sdkClasses: Set<string>): string | null {
  // Unwrap await
  if (node.type === 'await_expression') {
    const inner = node.namedChildren[0];
    if (inner) return detectSdkClassFromExpr(inner, sdkClasses);
    return null;
  }

  // new FastProvider(...) → FastProvider
  if (node.type === 'new_expression') {
    const constructorNode = node.childForFieldName('constructor');
    if (constructorNode && sdkClasses.has(constructorNode.text)) {
      return constructorNode.text;
    }
    return null;
  }

  // FastWallet.fromKeyfile(...) → FastWallet
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    if (!fn) return null;

    if (fn.type === 'member_expression') {
      const obj = fn.childForFieldName('object');
      const prop = fn.childForFieldName('property');
      if (obj && prop && sdkClasses.has(obj.text)) {
        return obj.text;
      }
    }
    return null;
  }

  return null;
}

// ── Call extraction ────────────────────────────────────────────────────────

/**
 * Normalize a method name given the variable map.
 * e.g. wallet.send → FastWallet.send (if wallet → FastWallet)
 */
function normalizeMethod(
  objectName: string,
  propertyName: string,
  varMap: VarMap,
  sdkClasses: Set<string>,
): string {
  // Direct SDK class reference (static call)
  if (sdkClasses.has(objectName)) {
    return `${objectName}.${propertyName}`;
  }

  // Variable that was assigned from an SDK class
  const sdkClass = varMap.get(objectName);
  if (sdkClass) {
    return `${sdkClass}.${propertyName}`;
  }

  // Unknown — keep as-is
  return `${objectName}.${propertyName}`;
}

/**
 * Walk the tree and collect all SDK-relevant call/new expressions.
 */
function collectCalls(
  rootNode: Parser.SyntaxNode,
  varMap: VarMap,
  code: string,
  sdkClasses: Set<string>,
): ExtractedCall[] {
  const calls: ExtractedCall[] = [];
  // Track which node IDs we've already processed to avoid double-counting
  // (e.g. a call_expression inside an await_expression)
  const visited = new Set<number>();

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'new_expression' && !visited.has(node.id)) {
      visited.add(node.id);
      const extracted = extractNewExpression(node, varMap, code, sdkClasses);
      if (extracted) calls.push(extracted);
    } else if (node.type === 'call_expression' && !visited.has(node.id)) {
      visited.add(node.id);
      const extracted = extractCallExpression(node, varMap, code, sdkClasses);
      if (extracted) calls.push(extracted);
    }

    for (const child of node.children) {
      visit(child);
    }
  }

  visit(rootNode);
  return calls;
}

/**
 * Extract a `new X(...)` expression.
 */
function extractNewExpression(
  node: Parser.SyntaxNode,
  varMap: VarMap,
  _code: string,
  sdkClasses: Set<string>,
): ExtractedCall | null {
  const constructorNode = node.childForFieldName('constructor');
  if (!constructorNode) return null;

  const className = constructorNode.text;
  if (!sdkClasses.has(className)) return null;

  const method = `${className}.constructor`;
  const argsNode = node.childForFieldName('arguments');
  const args = argsNode ? parseArguments(argsNode) : {};

  return {
    method,
    args,
    line: node.startPosition.row + 1,
    raw: node.text,
  };
}

/**
 * Extract a `obj.method(...)` or `Class.staticMethod(...)` call expression.
 */
function extractCallExpression(
  node: Parser.SyntaxNode,
  varMap: VarMap,
  _code: string,
  sdkClasses: Set<string>,
): ExtractedCall | null {
  const fnNode = node.childForFieldName('function');
  if (!fnNode) return null;

  // We only care about member expressions: obj.method(...)
  if (fnNode.type !== 'member_expression') return null;

  const objNode = fnNode.childForFieldName('object');
  const propNode = fnNode.childForFieldName('property');
  if (!objNode || !propNode) return null;

  // Get the base object name (handle optional chaining: obj?.method)
  const objectName = objNode.text.replace(/\?$/, '');
  const propertyName = propNode.text;

  const method = normalizeMethod(objectName, propertyName, varMap, sdkClasses);

  // Only extract if it's an SDK method or a known variable
  const isKnownSdk =
    sdkClasses.has(objectName) || varMap.has(objectName);
  if (!isKnownSdk) return null;

  const argsNode = node.childForFieldName('arguments');
  const args = argsNode ? parseArguments(argsNode) : {};

  return {
    method,
    args,
    line: node.startPosition.row + 1,
    raw: node.text,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse TypeScript code and extract all SDK method calls with their arguments.
 * Uses web-tree-sitter for accurate AST parsing.
 *
 * @param code - TypeScript/JavaScript source code to analyze
 * @param classes - SDK class names to track (e.g. ["FastProvider", "FastWallet"])
 */
export async function extractFromCode(code: string, classes: string[]): Promise<ExtractedCall[]> {
  const sdkClasses = new Set(classes);
  const p = await initParser();
  const tree = p.parse(code);
  const root = tree.rootNode;

  // First pass: collect variable bindings
  const varMap = collectVariableBindings(root, sdkClasses);

  // Second pass: collect all calls
  const calls = collectCalls(root, varMap, code, sdkClasses);

  // Sort by line number
  calls.sort((a, b) => a.line - b.line);

  return calls;
}
