import { readFileSync } from 'node:fs';

import ts from 'typescript';

import type { CliCommandDefinition } from '../types.js';

function getScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function walkChainUp(node: ts.Node, def: CliCommandDefinition): void {
  // node.parent is the PropertyAccessExpression (the `.command`/`.description`/etc access)
  // node.parent.parent is the next CallExpression in the chain
  const propAccess = node.parent;
  if (!propAccess || !ts.isPropertyAccessExpression(propAccess)) return;
  const nextCall = propAccess.parent;
  if (!nextCall || !ts.isCallExpression(nextCall)) return;

  const method = propAccess.name.text;
  if (method === 'description' && nextCall.arguments[0] !== undefined && ts.isStringLiteral(nextCall.arguments[0])) {
    def.description = nextCall.arguments[0].text;
  } else if (method === 'option' && nextCall.arguments[0] !== undefined && ts.isStringLiteral(nextCall.arguments[0])) {
    const flagStr = nextCall.arguments[0].text;
    const desc =
      nextCall.arguments[1] !== undefined && ts.isStringLiteral(nextCall.arguments[1])
        ? nextCall.arguments[1].text
        : undefined;
    const takesValue = /<\w+>|\[\w+\]/.test(flagStr);
    if (!def.options) def.options = [];
    def.options.push({ name: flagStr, description: desc, takesValue });
  }
  // Continue walking up the chain
  walkChainUp(nextCall, def);
}

/**
 * Extract commander.js command definitions from a TypeScript/JavaScript source file
 * using the TypeScript Compiler API.
 */
export function extractCommander(filePath: string): CliCommandDefinition[] {
  const source = readFileSync(filePath, 'utf-8');
  const scriptKind = getScriptKind(filePath);
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);

  const commands: CliCommandDefinition[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (
        ts.isPropertyAccessExpression(expr) &&
        expr.name.text === 'command' &&
        node.arguments[0] !== undefined &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const rawName = node.arguments[0].text;
        // Strip positional placeholders: 'delete <id>' → 'delete'
        const commandName = rawName.split(' ')[0]!;

        const def: CliCommandDefinition = { command: commandName };
        walkChainUp(node, def);
        commands.push(def);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return commands;
}
