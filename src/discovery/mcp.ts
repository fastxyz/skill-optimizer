import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ts from 'typescript';

import type { DiscoveryOptions, DiscoveredAction, DiscoveredActionArg, McpDiscoverySnapshot } from './types.js';

type LiteralPrimitive = string | number | boolean | null;
interface LiteralObject {
  [key: string]: LiteralValue;
}
interface LiteralArray extends Array<LiteralValue> {}
type LiteralValue = LiteralPrimitive | LiteralObject | LiteralArray;

export function discoverMcpSurfaceFromSources(sources: string[], options: DiscoveryOptions = {}): McpDiscoverySnapshot {
  const baseDir = options.baseDir ?? process.cwd();
  const resolvedSources = sources.map((source) => resolve(baseDir, source));
  const discoveredActions: DiscoveredAction[] = [];

  for (const sourcePath of resolvedSources) {
    discoveredActions.push(...discoverMcpActionsFromSourceFile(sourcePath));
  }

  const uniqueActions = dedupeActionsByName(discoveredActions);

  return {
    surface: 'mcp',
    actions: uniqueActions,
    sources: resolvedSources,
  };
}

function discoverMcpActionsFromSourceFile(filePath: string): DiscoveredAction[] {
  if (!existsSync(filePath)) {
    throw new Error(`MCP discovery source file not found: ${filePath}`);
  }

  let sourceCode: string;
  try {
    sourceCode = readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read MCP discovery source file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, false);
  const constants = collectTopLevelConstInitializers(sourceFile);
  const candidates = collectExportedLiteralCandidates(sourceFile, constants);
  const actions: DiscoveredAction[] = [];

  for (const candidate of candidates) {
    const toolObjects = extractToolObjects(candidate);
    for (const toolObject of toolObjects) {
      const action = toDiscoveredAction(toolObject, filePath);
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

function extractToolObjects(candidate: LiteralValue): LiteralObject[] {
  if (Array.isArray(candidate)) {
    return candidate.filter(isLiteralObject);
  }

  if (!isLiteralObject(candidate)) {
    return [];
  }

  if (looksLikeToolDefinition(candidate)) {
    return [candidate];
  }

  const tools = candidate.tools;
  if (Array.isArray(tools)) {
    return tools.filter(isLiteralObject);
  }

  return [];
}

function looksLikeToolDefinition(value: LiteralObject): boolean {
  return typeof value.type === 'string' && isLiteralObject(value.function);
}

function toDiscoveredAction(toolDefinition: LiteralObject, source: string): DiscoveredAction | null {
  const fn = toolDefinition.function;
  if (!isLiteralObject(fn)) {
    return null;
  }

  const name = fn.name;
  if (typeof name !== 'string' || name.trim() === '') {
    return null;
  }

  const description = typeof fn.description === 'string' ? fn.description : undefined;
  const parameters = isLiteralObject(fn.parameters) ? fn.parameters : null;
  const properties = parameters && isLiteralObject(parameters.properties) ? parameters.properties : {};
  const requiredNames = parameters ? asRequiredArray(parameters.required) : [];

  const args: DiscoveredActionArg[] = [];
  for (const [argName, schemaValue] of Object.entries(properties)) {
    if (!isLiteralObject(schemaValue)) {
      continue;
    }

    args.push({
      name: argName,
      required: requiredNames.includes(argName),
      type: typeof schemaValue.type === 'string' ? schemaValue.type : undefined,
      description: typeof schemaValue.description === 'string' ? schemaValue.description : undefined,
      schema: schemaValue,
    });
  }

  return {
    name,
    description,
    args,
    source,
  };
}

function asRequiredArray(value: LiteralValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
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
