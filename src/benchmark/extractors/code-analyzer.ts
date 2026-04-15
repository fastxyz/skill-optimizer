import Parser from 'web-tree-sitter';

import type { ExtractedCall } from '../types.js';
import { getSdkParser } from './sdk/parser.js';

// ── Lazy singleton parser ──────────────────────────────────────────────────

async function initParser(): Promise<Parser> {
  return getSdkParser('typescript');
}

// ── Argument extraction ────────────────────────────────────────────────────

type LiteralMap = Map<string, unknown>;

function parseArrayLiteral(node: Parser.SyntaxNode, literalMap: LiteralMap = new Map()): unknown[] {
  const result: unknown[] = [];

  for (const child of node.namedChildren) {
    if (child.type === 'spread_element') {
      result.push('<spread>');
      continue;
    }
    result.push(extractValue(child, literalMap));
  }

  return result;
}

/**
 * Extract a value from a tree-sitter node.
 * Returns nested structures for object/array literals and sentinels for dynamic values.
 */
function extractValue(node: Parser.SyntaxNode, literalMap: LiteralMap = new Map()): unknown {
  switch (node.type) {
    case 'object':
      return parseObjectLiteral(node, literalMap);
    case 'array':
      return parseArrayLiteral(node, literalMap);
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
      return literalMap.has(node.text) ? literalMap.get(node.text)! : `<${node.text}>`;
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
function parseObjectLiteral(node: Parser.SyntaxNode, literalMap: LiteralMap = new Map()): Record<string, unknown> {
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

      result[key] = extractValue(valueNode, literalMap);
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
function parseArguments(argsNode: Parser.SyntaxNode, literalMap: LiteralMap = new Map()): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  let positionalIndex = 0;

  for (const child of argsNode.namedChildren) {
    if (child.type === 'object') {
      // Merge object literal into args (first object wins for named args)
      const obj = parseObjectLiteral(child, literalMap);
      Object.assign(args, obj);
    } else if (child.type === 'string') {
      const value = extractValue(child, literalMap);
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
    } else if (child.type === 'array') {
      const key = `_positional_${positionalIndex}`;
      args[key] = parseArrayLiteral(child, literalMap);
      positionalIndex++;
    } else if (child.type === 'identifier') {
      const key = `_positional_${positionalIndex}`;
      args[key] = extractValue(child, literalMap);
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
 * Collect literal variable bindings from the AST via a single top-down pass.
 *
 * Limitation: forward references are not resolved. If code declares
 * `const result = x402Pay({ wallet: myWallet })` before `const myWallet = { type: 'evm' }`,
 * `myWallet` will resolve to a sentinel `<myWallet>` instead of the object literal.
 * In practice, LLM-generated code almost always declares variables before use.
 */
function collectLiteralBindings(rootNode: Parser.SyntaxNode): LiteralMap {
  const literalMap: LiteralMap = new Map();

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

      if (nameNode?.type === 'identifier' && valueNode) {
        if (['object', 'array', 'string', 'number', 'true', 'false', 'null', 'template_string', 'identifier'].includes(valueNode.type)) {
          literalMap.set(nameNode.text, extractValue(valueNode, literalMap));
        }
      }
    }

    for (const child of node.children) visit(child);
  }

  visit(rootNode);
  return literalMap;
}

/**
 * Walk the entire tree once to collect variable-to-class assignments.
 * Handles:
 *   const provider = new FastProvider(...)
 *   const wallet = await FastWallet.fromKeyfile(...)
 *   const wallet = FastWallet.generate(provider)
 */
function collectVariableBindings(
  rootNode: Parser.SyntaxNode,
  sdkClasses: Set<string>,
  knownFunctions: Set<string> = new Set(),
  fnReturns: Map<string, string> = new Map(),
): VarMap {
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
      const sdkClass = detectSdkClassFromExpr(valueNode, sdkClasses, knownFunctions, fnReturns);
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
function detectSdkClassFromExpr(
  node: Parser.SyntaxNode,
  sdkClasses: Set<string>,
  knownFunctions: Set<string> = new Set(),
  fnReturns: Map<string, string> = new Map(),
): string | null {
  // Unwrap await
  if (node.type === 'await_expression') {
    const inner = node.namedChildren[0];
    if (inner) return detectSdkClassFromExpr(inner, sdkClasses, knownFunctions, fnReturns);
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

  // FastWallet.fromKeyfile(...) → FastWallet, or fast(...) → FastClient via fnReturns
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    if (!fn) return null;
    if (fn.type === 'identifier' && fnReturns.has(fn.text)) {
      return fnReturns.get(fn.text)!;
    }
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
  literalMap: LiteralMap,
  code: string,
  sdkClasses: Set<string>,
  knownFunctions: Set<string> = new Set(),
): ExtractedCall[] {
  const calls: ExtractedCall[] = [];
  // Track which node IDs we've already processed to avoid double-counting
  // (e.g. a call_expression inside an await_expression)
  const visited = new Set<number>();

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'new_expression' && !visited.has(node.id)) {
      visited.add(node.id);
      const extracted = extractNewExpression(node, varMap, literalMap, code, sdkClasses);
      if (extracted) calls.push(extracted);
    } else if (node.type === 'call_expression' && !visited.has(node.id)) {
      visited.add(node.id);
      const extracted = extractCallExpression(node, varMap, literalMap, code, sdkClasses, knownFunctions);
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
  literalMap: LiteralMap,
  _code: string,
  sdkClasses: Set<string>,
): ExtractedCall | null {
  const constructorNode = node.childForFieldName('constructor');
  if (!constructorNode) return null;

  const className = constructorNode.text;
  if (!sdkClasses.has(className)) return null;

  const method = `${className}.constructor`;
  const argsNode = node.childForFieldName('arguments');
  const args = argsNode ? parseArguments(argsNode, literalMap) : {};

  return {
    method,
    args,
    line: node.startPosition.row + 1,
    raw: node.text,
  };
}

/**
 * Extract a `obj.method(...)` or `Class.staticMethod(...)` call expression,
 * or a standalone function call like `x402Pay(...)`.
 */
function extractCallExpression(
  node: Parser.SyntaxNode,
  varMap: VarMap,
  literalMap: LiteralMap,
  _code: string,
  sdkClasses: Set<string>,
  knownFunctions: Set<string> = new Set(),
): ExtractedCall | null {
  const fnNode = node.childForFieldName('function');
  if (!fnNode) return null;

  // Standalone function call (e.g. x402Pay(...), fast(...))
  if (fnNode.type === 'identifier' && knownFunctions.has(fnNode.text)) {
    const method = fnNode.text;
    const argsNode = node.childForFieldName('arguments');
    const args = argsNode ? parseArguments(argsNode, literalMap) : {};
    return { method, args, line: node.startPosition.row + 1, raw: node.text };
  }

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
  const args = argsNode ? parseArguments(argsNode, literalMap) : {};

  return {
    method,
    args,
    line: node.startPosition.row + 1,
    raw: node.text,
  };
}

// ── Generic extraction (no config hints) ───────────────────────────────────

interface RawExtraction {
  calls: ExtractedCall[];
  bindings: Map<string, string>;  // variable → source function/class name
}

/**
 * Walk the tree and collect ALL variable-to-source bindings generically.
 * Handles:
 *   const f = fast(...)         → f bound to 'fast'
 *   const allset = new AllSetProvider(...) → allset bound to 'AllSetProvider'
 *   const w = await FastWallet.fromKeyfile(...) → w bound to 'FastWallet'
 */
function collectAllVariableBindings(rootNode: Parser.SyntaxNode): Map<string, string> {
  const bindings = new Map<string, string>();

  function getSourceName(node: Parser.SyntaxNode): string | null {
    // Unwrap await
    if (node.type === 'await_expression') {
      const inner = node.namedChildren[0];
      if (inner) return getSourceName(inner);
      return null;
    }
    // new ClassName(...)
    if (node.type === 'new_expression') {
      const ctor = node.childForFieldName('constructor');
      if (ctor?.type === 'identifier') return ctor.text;
      return null;
    }
    // func(...) or Class.staticMethod(...)
    if (node.type === 'call_expression') {
      const fn = node.childForFieldName('function');
      if (!fn) return null;
      if (fn.type === 'identifier') return fn.text;
      if (fn.type === 'member_expression') {
        const obj = fn.childForFieldName('object');
        if (obj?.type === 'identifier') return obj.text;
      }
      return null;
    }
    return null;
  }

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'variable_declarator' || node.type === 'assignment_expression') {
      const nameNode = node.type === 'variable_declarator'
        ? node.childForFieldName('name')
        : node.childForFieldName('left');
      const valueNode = node.type === 'variable_declarator'
        ? node.childForFieldName('value')
        : node.childForFieldName('right');

      if (nameNode?.type === 'identifier' && valueNode) {
        const source = getSourceName(valueNode);
        if (source) bindings.set(nameNode.text, source);
      }
    }
    for (const child of node.children) visit(child);
  }

  visit(rootNode);
  return bindings;
}

/**
 * Walk the tree and collect ALL call/new expressions (no filtering).
 */
function collectAllCalls(
  rootNode: Parser.SyntaxNode,
  bindings: Map<string, string>,
  literalMap: LiteralMap,
): ExtractedCall[] {
  const calls: ExtractedCall[] = [];
  const visited = new Set<number>();

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'new_expression' && !visited.has(node.id)) {
      visited.add(node.id);
      const ctor = node.childForFieldName('constructor');
      if (ctor?.type === 'identifier') {
        const method = `${ctor.text}.constructor`;
        const argsNode = node.childForFieldName('arguments');
        const args = argsNode ? parseArguments(argsNode, literalMap) : {};
        calls.push({ method, args, line: node.startPosition.row + 1, raw: node.text });
      }
    } else if (node.type === 'call_expression' && !visited.has(node.id)) {
      visited.add(node.id);
      const fnNode = node.childForFieldName('function');
      if (!fnNode) { /* skip */ }
      else if (fnNode.type === 'identifier') {
        // standalone: fast(...), x402Pay(...), console.log(...)
        const method = fnNode.text;
        const argsNode = node.childForFieldName('arguments');
        const args = argsNode ? parseArguments(argsNode, literalMap) : {};
        calls.push({ method, args, line: node.startPosition.row + 1, raw: node.text });
      } else if (fnNode.type === 'member_expression') {
        // member: f.setup(), allset.sendToFast(), FastWallet.fromKeyfile()
        const objNode = fnNode.childForFieldName('object');
        const propNode = fnNode.childForFieldName('property');
        if (objNode && propNode) {
          const objectName = objNode.text.replace(/\?$/, '');
          const propertyName = propNode.text;
          const method = `${objectName}.${propertyName}`;
          const argsNode = node.childForFieldName('arguments');
          const args = argsNode ? parseArguments(argsNode, literalMap) : {};
          calls.push({ method, args, line: node.startPosition.row + 1, raw: node.text });
        }
      }
    }
    for (const child of node.children) visit(child);
  }

  visit(rootNode);
  return calls;
}

/**
 * Parse TypeScript code and extract ALL calls generically — no config hints needed.
 * Returns raw calls (e.g. 'f.setup', not 'FastClient.setup') plus a binding graph
 * that the evaluator can use to resolve types from task expectations.
 */
export async function extractAllFromCode(code: string): Promise<RawExtraction> {
  const p = await initParser();
  const tree = p.parse(code);
  const root = tree.rootNode;
  const literalMap = collectLiteralBindings(root);
  const bindings = collectAllVariableBindings(root);
  const calls = collectAllCalls(root, bindings, literalMap);
  calls.sort((a, b) => a.line - b.line);
  return { calls, bindings };
}

