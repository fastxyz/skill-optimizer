import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import ts from 'typescript';
import type { CliCommandDefinition, CliCommandOptionDefinition } from '../types.js';

function scriptKind(filePath: string): ts.ScriptKind {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function extractOptionsFromBuilder(builder: ts.Expression): CliCommandOptionDefinition[] {
  const options: CliCommandOptionDefinition[] = [];

  function visitForOptions(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'option' &&
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      const optName = `--${node.arguments[0].text}`;
      let desc: string | undefined;
      let takesValue = false;

      const config = node.arguments[1];
      if (config && ts.isObjectLiteralExpression(config)) {
        for (const prop of config.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const key = ts.isIdentifier(prop.name) ? prop.name.text : null;
          if (key === 'describe' && ts.isStringLiteral(prop.initializer)) {
            desc = prop.initializer.text;
          }
          if (key === 'type' && ts.isStringLiteral(prop.initializer)) {
            const t = prop.initializer.text;
            takesValue = t === 'string' || t === 'array' || t === 'number';
          }
        }
      }

      options.push({ name: optName, description: desc, takesValue });
    }
    ts.forEachChild(node, visitForOptions);
  }

  visitForOptions(builder);
  return options;
}

export function extractYargs(filePath: string): CliCommandDefinition[] {
  const source = readFileSync(filePath, 'utf-8');
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind(filePath));
  const commands: CliCommandDefinition[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'command' &&
      node.arguments.length >= 2 &&
      ts.isStringLiteral(node.arguments[0]!) &&
      ts.isStringLiteral(node.arguments[1]!)
    ) {
      const commandName = node.arguments[0].text.split(' ')[0]!;
      const description = node.arguments[1].text;
      const def: CliCommandDefinition = { command: commandName, description };

      const builder = node.arguments[2];
      if (builder) {
        const opts = extractOptionsFromBuilder(builder);
        if (opts.length > 0) def.options = opts;
      }

      commands.push(def);
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return commands;
}
