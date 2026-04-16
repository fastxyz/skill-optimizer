import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ts from 'typescript';

import type { ActionArgSchema } from '../actions/types.js';
import type { CliDiscoverySnapshot, DiscoveryOptions, DiscoveredAction } from './types.js';
import { discoverOptiqueActionsFromFile } from './optique.js';

type LiteralPrimitive = string | number | boolean | null;
interface LiteralObject {
  [key: string]: LiteralValue;
}
interface LiteralArray extends Array<LiteralValue> {}
type LiteralValue = LiteralPrimitive | LiteralObject | LiteralArray;

export function discoverCliSurfaceFromSources(sources: string[], options: DiscoveryOptions = {}): CliDiscoverySnapshot {
  const baseDir = options.baseDir ?? process.cwd();
  const resolvedSources = sources.map((source) => resolve(baseDir, source));
  const discoveredActions: DiscoveredAction[] = [];

  for (const sourcePath of resolvedSources) {
    discoveredActions.push(...discoverCliActionsFromSourceFile(sourcePath));
  }

  return {
    surface: 'cli',
    actions: dedupeActionsByName(discoveredActions),
    sources: resolvedSources,
  };
}

function discoverCliActionsFromSourceFile(filePath: string): DiscoveredAction[] {
  if (!existsSync(filePath)) {
    throw new Error(`CLI discovery source file not found: ${filePath}`);
  }

  let sourceCode: string;
  try {
    sourceCode = readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read CLI discovery source file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Fast path: optique combinator CLI — literal extractor can't handle function calls
  if (/@optique\/core/.test(sourceCode)) {
    return discoverOptiqueActionsFromFile(filePath);
  }

  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, false);
  const constants = collectTopLevelConstInitializers(sourceFile);
  const candidates = collectExportedLiteralCandidates(sourceFile, constants);
  const actions: DiscoveredAction[] = [];

  for (const candidate of candidates) {
    const commandEntries = extractCommandEntries(candidate);
    for (const commandEntry of commandEntries) {
      const action = toDiscoveredAction(commandEntry, filePath);
      if (action) {
        actions.push(action);
      }
    }
  }

  return actions;
}

function collectTopLevelConstInitializers(sourceFile: ts.SourceFile): Map<string, ts.Expression> {
  const constants = new Map<string, ts.Expression>();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    if ((ts.getCombinedNodeFlags(statement.declarationList) & ts.NodeFlags.Const) === 0) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }

      constants.set(declaration.name.text, declaration.initializer);
    }
  }

  return constants;
}

function collectExportedLiteralCandidates(sourceFile: ts.SourceFile, constants: Map<string, ts.Expression>): LiteralValue[] {
  const candidates: LiteralValue[] = [];

  for (const statement of sourceFile.statements) {
    if (isExportedVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer) {
          continue;
        }

        const value = readLiteralValue(declaration.initializer, constants, new Set());
        if (value !== undefined) {
          candidates.push(value);
        }
      }

      continue;
    }

    if (ts.isExportAssignment(statement)) {
      const value = readLiteralValue(statement.expression, constants, new Set());
      if (value !== undefined) {
        candidates.push(value);
      }
      continue;
    }

    if (!ts.isExportDeclaration(statement) || !statement.exportClause || statement.moduleSpecifier) {
      continue;
    }

    if (!ts.isNamedExports(statement.exportClause)) {
      continue;
    }

    for (const element of statement.exportClause.elements) {
      const localName = element.propertyName?.text ?? element.name.text;
      const expression = constants.get(localName);
      if (!expression) {
        continue;
      }

      const value = readLiteralValue(expression, constants, new Set());
      if (value !== undefined) {
        candidates.push(value);
      }
    }
  }

  return candidates;
}

function isExportedVariableStatement(statement: ts.Statement): statement is ts.VariableStatement {
  return ts.isVariableStatement(statement)
    && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function readLiteralValue(node: ts.Expression, constants: Map<string, ts.Expression>, stack: Set<string>): LiteralValue | undefined {
  const expression = unwrapExpression(node);

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text);
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  if (ts.isIdentifier(expression)) {
    const constant = constants.get(expression.text);
    if (!constant || stack.has(expression.text)) {
      return undefined;
    }

    stack.add(expression.text);
    const value = readLiteralValue(constant, constants, stack);
    stack.delete(expression.text);
    return value;
  }

  if (ts.isArrayLiteralExpression(expression)) {
    const values: LiteralValue[] = [];

    for (const element of expression.elements) {
      if (!ts.isExpression(element)) {
        return undefined;
      }

      const value = readLiteralValue(element, constants, stack);
      if (value === undefined) {
        return undefined;
      }

      values.push(value);
    }

    return values;
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const objectValue: LiteralObject = {};

    for (const property of expression.properties) {
      if (ts.isPropertyAssignment(property)) {
        const key = propertyNameToString(property.name);
        if (!key) {
          return undefined;
        }

        const value = readLiteralValue(property.initializer, constants, stack);
        if (value === undefined) {
          return undefined;
        }

        objectValue[key] = value;
        continue;
      }

      if (ts.isShorthandPropertyAssignment(property)) {
        const key = property.name.text;
        const value = readLiteralValue(property.name, constants, stack);
        if (value === undefined) {
          return undefined;
        }

        objectValue[key] = value;
        continue;
      }

      return undefined;
    }

    return objectValue;
  }

  return undefined;
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
}

function propertyNameToString(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

function extractCommandEntries(candidate: LiteralValue): LiteralObject[] {
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter(isLiteralObject);
}

function toDiscoveredAction(commandEntry: LiteralObject, source: string): DiscoveredAction | null {
  const command = commandEntry.command;
  if (typeof command !== 'string' || command.trim() === '') {
    return null;
  }

  const description = typeof commandEntry.description === 'string' ? commandEntry.description : undefined;
  const args = extractActionArgs(commandEntry.options);

  return {
    name: command,
    description,
    args,
    source,
  };
}

function extractActionArgs(options: LiteralValue | undefined): ActionArgSchema[] {
  if (!Array.isArray(options)) {
    return [];
  }

  const args: ActionArgSchema[] = [];
  for (const option of options) {
    if (!isLiteralObject(option)) {
      continue;
    }

    const name = option.name;
    if (typeof name !== 'string' || name.trim() === '') {
      continue;
    }

    const takesValue = typeof option.takesValue === 'boolean' ? option.takesValue : undefined;
    args.push({
      name,
      required: false,
      type: takesValue === true ? 'string' : takesValue === false ? 'boolean' : undefined,
      description: typeof option.description === 'string' ? option.description : undefined,
    });
  }

  return args;
}

function isLiteralObject(value: unknown): value is LiteralObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function dedupeActionsByName(actions: DiscoveredAction[]): DiscoveredAction[] {
  const map = new Map<string, DiscoveredAction>();
  for (const action of actions) {
    map.set(action.name, action);
  }
  return Array.from(map.values());
}
