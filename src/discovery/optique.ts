/**
 * Static AST extractor for optique-based CLI parsers.
 *
 * Optique builds CLIs through function combinators:
 *   command("name", object({...}), { description })
 *   command("group", or(child1, child2), { description })
 *   merge(globalOptions, or(group1, group2, leafCmd))
 *
 * This module walks those combinators without executing any code.
 */
import { existsSync, readFileSync } from 'node:fs';

import ts from 'typescript';

import type { DiscoveredAction, DiscoveredActionArg } from './types.js';

export function discoverOptiqueActionsFromFile(filePath: string): DiscoveredAction[] {
  if (!existsSync(filePath)) {
    throw new Error(`Optique discovery source not found: ${filePath}`);
  }

  const sourceCode = readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, false);
  const constants = collectTopLevelConsts(sourceFile);
  const roots = collectExportedExpressions(sourceFile, constants);

  const actions: DiscoveredAction[] = [];
  for (const root of roots) {
    walkExpr(root, constants, [], actions, filePath);
  }

  return dedupeByName(actions);
}

// ── AST collection ────────────────────────────────────────────────────────────

function collectTopLevelConsts(sourceFile: ts.SourceFile): Map<string, ts.Expression> {
  const map = new Map<string, ts.Expression>();
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    if ((ts.getCombinedNodeFlags(stmt.declarationList) & ts.NodeFlags.Const) === 0) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) {
        map.set(decl.name.text, decl.initializer);
      }
    }
  }
  return map;
}

function collectExportedExpressions(
  sourceFile: ts.SourceFile,
  constants: Map<string, ts.Expression>,
): ts.Expression[] {
  const exprs: ts.Expression[] = [];
  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt) && isExportedStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (decl.initializer) exprs.push(decl.initializer);
      }
    } else if (ts.isExportAssignment(stmt)) {
      exprs.push(stmt.expression);
    } else if (ts.isExportDeclaration(stmt) && stmt.exportClause && !stmt.moduleSpecifier) {
      if (ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          const local = el.propertyName?.text ?? el.name.text;
          const init = constants.get(local);
          if (init) exprs.push(init);
        }
      }
    }
  }
  return exprs;
}

function isExportedStatement(stmt: ts.VariableStatement): boolean {
  return stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

// ── Combinator tree walker ────────────────────────────────────────────────────

function walkExpr(
  expr: ts.Expression,
  constants: Map<string, ts.Expression>,
  prefix: string[],
  actions: DiscoveredAction[],
  filePath: string,
): void {
  const node = unwrap(expr);

  // Identifier → resolve and recurse
  if (ts.isIdentifier(node)) {
    const init = constants.get(node.text);
    if (init) walkExpr(init, constants, prefix, actions, filePath);
    return;
  }

  if (!ts.isCallExpression(node)) return;

  const calleeName = getCalleeName(node);

  if (calleeName === 'command') {
    handleCommand(node, constants, prefix, actions, filePath);
  } else if (calleeName === 'merge' || calleeName === 'or') {
    // Descend into all arguments (globalOptions is an object() call → no-op)
    for (const arg of node.arguments) {
      walkExpr(arg, constants, prefix, actions, filePath);
    }
  }
}

function handleCommand(
  node: ts.CallExpression,
  constants: Map<string, ts.Expression>,
  prefix: string[],
  actions: DiscoveredAction[],
  filePath: string,
): void {
  if (node.arguments.length < 2) return;

  const name = extractStringLiteral(node.arguments[0]);
  if (!name) return;

  const newPrefix = [...prefix, name];
  const description = node.arguments[2] ? extractDescription(node.arguments[2], constants) : undefined;

  // Resolve body expression (may be an identifier referencing a const)
  const rawBody = node.arguments[1];
  const body = resolveExpr(rawBody, constants);

  const bodyCallee = getCalleeName(body);

  if (bodyCallee === 'object') {
    // Leaf command: extract args from the object call
    const cmdArgs = extractArgsFromObjectCall(body as ts.CallExpression, constants);
    actions.push({ name: newPrefix.join(' '), description, args: cmdArgs, source: filePath });
  } else if (bodyCallee === 'or') {
    // Group: walk each child with the extended prefix
    for (const child of (body as ts.CallExpression).arguments) {
      walkExpr(child, constants, newPrefix, actions, filePath);
    }
  }
}

function resolveExpr(expr: ts.Expression, constants: Map<string, ts.Expression>): ts.Expression {
  const node = unwrap(expr);
  if (ts.isIdentifier(node)) {
    const init = constants.get(node.text);
    return init ? resolveExpr(init, constants) : node;
  }
  return node;
}

// ── Argument extraction ───────────────────────────────────────────────────────

function extractArgsFromObjectCall(
  objectCall: ts.CallExpression,
  constants: Map<string, ts.Expression>,
): DiscoveredActionArg[] {
  if (objectCall.arguments.length === 0) return [];
  const objLiteral = unwrap(objectCall.arguments[0]);
  if (!ts.isObjectLiteralExpression(objLiteral)) return [];

  const result: DiscoveredActionArg[] = [];
  for (const prop of objLiteral.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = ts.isIdentifier(prop.name) ? prop.name.text : null;
    if (!key || key === 'cmd') continue; // skip the discriminant constant

    const arg = parseArgCall(key, prop.initializer, constants, false);
    if (arg) result.push(arg);
  }
  return result;
}

/**
 * Recursively parse an optique arg combinator call.
 * `propKey` is the TypeScript property name and is used as the name for positional args.
 */
function parseArgCall(
  propKey: string,
  expr: ts.Expression,
  constants: Map<string, ts.Expression>,
  forceOptional: boolean,
): DiscoveredActionArg | null {
  const node = unwrap(expr);
  if (!ts.isCallExpression(node)) return null;

  const fn = getCalleeName(node);
  if (!fn) return null;

  if (fn === 'option') {
    const arg = extractOption(node, constants);
    return arg ? { ...arg, required: forceOptional ? false : arg.required } : null;
  }

  if (fn === 'argument') {
    const description = node.arguments.length >= 2
      ? extractDescription(node.arguments[1], constants)
      : undefined;
    return { name: propKey, required: !forceOptional, type: 'string', description };
  }

  // Wrappers that make things optional or add defaults
  if (fn === 'optional' || fn === 'withDefault' || fn === 'multiple') {
    if (node.arguments.length === 0) return null;
    return parseArgCall(propKey, node.arguments[0], constants, true);
  }

  return null;
}

function extractOption(
  call: ts.CallExpression,
  constants: Map<string, ts.Expression>,
): DiscoveredActionArg | null {
  if (call.arguments.length === 0) return null;
  const name = extractStringLiteral(call.arguments[0]);
  if (!name) return null;

  // 2nd arg is either a value parser (string(), integer()) → value-taking,
  // or an opts object → boolean flag
  const hasValueParser = call.arguments.length >= 2 && isValueParserCall(call.arguments[1]);

  const optsIdx = hasValueParser ? 2 : 1;
  const description = call.arguments.length > optsIdx
    ? extractDescription(call.arguments[optsIdx], constants)
    : undefined;

  return { name, required: false, type: hasValueParser ? 'string' : 'boolean', description };
}

function isValueParserCall(expr: ts.Expression): boolean {
  const node = unwrap(expr);
  if (!ts.isCallExpression(node)) return false;
  const fn = getCalleeName(node);
  return fn !== null && ['string', 'integer', 'number', 'boolean'].includes(fn);
}

// ── Description extraction ────────────────────────────────────────────────────

function extractDescription(
  expr: ts.Expression,
  constants: Map<string, ts.Expression>,
): string | undefined {
  const node = unwrap(expr);

  if (ts.isIdentifier(node)) {
    const init = constants.get(node.text);
    return init ? extractDescription(init, constants) : undefined;
  }

  // { description: message`...` }
  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = ts.isIdentifier(prop.name) ? prop.name.text : null;
      if (key === 'description') return extractDescriptionValue(prop.initializer);
    }
  }

  return undefined;
}

function extractDescriptionValue(expr: ts.Expression): string | undefined {
  const node = unwrap(expr);

  // message`Create a new account` — tagged template literal
  if (ts.isTaggedTemplateExpression(node)) {
    const tpl = node.template;
    if (ts.isNoSubstitutionTemplateLiteral(tpl)) return tpl.text;
    if (ts.isTemplateExpression(tpl)) return tpl.head.text;
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  return undefined;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function getCalleeName(node: ts.Expression): string | null {
  if (!ts.isCallExpression(node)) return null;
  const callee = unwrap(node.expression);
  return ts.isIdentifier(callee) ? callee.text : null;
}

function extractStringLiteral(expr: ts.Expression | undefined): string | null {
  if (!expr) return null;
  const node = unwrap(expr);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function unwrap(expr: ts.Expression): ts.Expression {
  let cur = expr;
  while (
    ts.isParenthesizedExpression(cur)
    || ts.isAsExpression(cur)
    || ts.isTypeAssertionExpression(cur)
    || ts.isSatisfiesExpression(cur)
  ) {
    cur = cur.expression;
  }
  return cur;
}

function dedupeByName(actions: DiscoveredAction[]): DiscoveredAction[] {
  const map = new Map<string, DiscoveredAction>();
  for (const a of actions) map.set(a.name, a);
  return Array.from(map.values());
}
