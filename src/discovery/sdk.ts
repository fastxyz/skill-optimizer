import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

import ts from 'typescript';

import type { DiscoveryOptions, DiscoveredAction, DiscoveredActionArg, SdkDiscoverySnapshot } from './types.js';

export function discoverSdkSurfaceFromSources(sources: string[], options: DiscoveryOptions = {}): SdkDiscoverySnapshot {
  const baseDir = options.baseDir ?? process.cwd();
  const resolvedSources = sources.map((source) => resolve(baseDir, source));
  const discoveredActions: DiscoveredAction[] = [];
  const visited = new Set<string>();

  for (const sourcePath of resolvedSources) {
    discoveredActions.push(...discoverSdkActionsFromSourceFile(sourcePath, visited));
  }

  return {
    surface: 'sdk',
    actions: dedupeActionsByName(discoveredActions),
    sources: resolvedSources,
  };
}

function discoverSdkActionsFromSourceFile(filePath: string, visited: Set<string>): DiscoveredAction[] {
  if (visited.has(filePath)) {
    return [];
  }
  visited.add(filePath);

  if (!existsSync(filePath)) {
    throw new Error(`SDK discovery source file not found: ${filePath}`);
  }

  let sourceCode: string;
  try {
    sourceCode = readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read SDK discovery source file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, false, scriptKindFromPath(filePath));
  return collectDiscoveredActions(sourceFile, filePath, visited);
}

function collectDiscoveredActions(sourceFile: ts.SourceFile, sourcePath: string, visited: Set<string>): DiscoveredAction[] {
  const actions: DiscoveredAction[] = [];
  const topLevelClasses = new Map<string, ts.ClassDeclaration>();
  const topLevelFunctions = new Map<string, ts.FunctionDeclaration>();
  const exportedNames = new Set<string>();
  let defaultExportName: string | null = null;

  for (const statement of sourceFile.statements) {
    if (ts.isClassDeclaration(statement) && statement.name) {
      topLevelClasses.set(statement.name.text, statement);
      if (hasExportModifier(statement)) {
        exportedNames.add(statement.name.text);
      }
      if (hasDefaultModifier(statement)) {
        defaultExportName = statement.name.text;
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      topLevelFunctions.set(statement.name.text, statement);
      if (hasExportModifier(statement)) {
        exportedNames.add(statement.name.text);
      }
      if (hasDefaultModifier(statement)) {
        defaultExportName = statement.name.text;
      }
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause && !statement.moduleSpecifier && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const localName = element.propertyName?.text ?? element.name.text;
        exportedNames.add(localName);
      }
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const targetPath = resolveRelativeModuleSource(sourcePath, statement.moduleSpecifier.text);
      if (!targetPath) {
        continue;
      }

      const reExportedActions = discoverSdkActionsFromSourceFile(targetPath, visited);
      if (!statement.exportClause) {
        actions.push(...reExportedActions);
        continue;
      }

      if (!ts.isNamedExports(statement.exportClause)) {
        continue;
      }

      for (const element of statement.exportClause.elements) {
        const localName = element.propertyName?.text ?? element.name.text;
        const exportedName = element.name.text;
        actions.push(...reExportedActions
          .filter((action) => action.name === localName || action.name.startsWith(`${localName}.`))
          .map((action) => renameReExportedAction(action, localName, exportedName)));
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      const expression = unwrapExpression(statement.expression);
      if (ts.isIdentifier(expression)) {
        defaultExportName = expression.text;
      } else if ((ts.isClassExpression(expression) || ts.isFunctionExpression(expression)) && expression.name) {
        defaultExportName = expression.name.text;
      }
    }
  }

  for (const className of exportedNames) {
    const classDeclaration = topLevelClasses.get(className);
    if (classDeclaration) {
      actions.push(...actionsFromClassDeclaration(classDeclaration, sourcePath));
      continue;
    }

    const functionDeclaration = topLevelFunctions.get(className);
    if (functionDeclaration) {
      actions.push(actionFromFunctionDeclaration(functionDeclaration, sourcePath));
    }
  }

  if (defaultExportName) {
    const classDeclaration = topLevelClasses.get(defaultExportName);
    if (classDeclaration) {
      actions.push(...actionsFromClassDeclaration(classDeclaration, sourcePath));
    }

    const functionDeclaration = topLevelFunctions.get(defaultExportName);
    if (functionDeclaration) {
      actions.push(actionFromFunctionDeclaration(functionDeclaration, sourcePath));
    }
  }

  return actions;
}

function resolveRelativeModuleSource(fromPath: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const rawCandidate = resolve(fromPath, '..', specifier);
  const candidates = [
    rawCandidate,
    resolve(fromPath, '..', `${specifier}.ts`),
    resolve(fromPath, '..', `${specifier}.tsx`),
    resolve(fromPath, '..', `${specifier}.js`),
    resolve(fromPath, '..', `${specifier}.mjs`),
    resolve(fromPath, '..', `${specifier}.cjs`),
    resolve(fromPath, '..', specifier, 'index.ts'),
    resolve(fromPath, '..', specifier, 'index.tsx'),
    resolve(fromPath, '..', specifier, 'index.js'),
    resolve(fromPath, '..', specifier, 'index.mjs'),
    resolve(fromPath, '..', specifier, 'index.cjs'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function actionsFromClassDeclaration(classDeclaration: ts.ClassDeclaration, source: string): DiscoveredAction[] {
  const className = classDeclaration.name?.text;
  if (!className) {
    return [];
  }

  const actions: DiscoveredAction[] = [];

  for (const member of classDeclaration.members) {
    if (ts.isConstructorDeclaration(member)) {
      if (hasPrivateOrProtectedModifier(member)) {
        continue;
      }

      actions.push({
        name: `${className}.constructor`,
        args: extractArgsFromParameters(member.parameters),
        source,
      });
      continue;
    }

    if (!ts.isMethodDeclaration(member)) {
      continue;
    }

    if (hasPrivateOrProtectedModifier(member)) {
      continue;
    }

    const methodName = methodNameFromClassElement(member.name);
    if (!methodName) {
      continue;
    }

    actions.push({
      name: `${className}.${methodName}`,
      args: extractArgsFromParameters(member.parameters),
      source,
    });
  }

  return actions;
}

function actionFromFunctionDeclaration(functionDeclaration: ts.FunctionDeclaration, source: string): DiscoveredAction {
  return {
    name: functionDeclaration.name!.text,
    args: extractArgsFromParameters(functionDeclaration.parameters),
    source,
  };
}

function extractArgsFromParameters(parameters: ts.NodeArray<ts.ParameterDeclaration>): DiscoveredActionArg[] {
  const args: DiscoveredActionArg[] = [];

  for (const parameter of parameters) {
    if (!ts.isIdentifier(parameter.name)) {
      continue;
    }

    args.push({
      name: parameter.name.text,
      required: !parameter.questionToken && !parameter.initializer && !parameter.dotDotDotToken,
    });
  }

  return args;
}

function scriptKindFromPath(filePath: string): ts.ScriptKind {
  const extension = extname(filePath).toLowerCase();

  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
    return ts.ScriptKind.JS;
  }

  if (extension === '.jsx') {
    return ts.ScriptKind.JSX;
  }

  if (extension === '.tsx') {
    return ts.ScriptKind.TSX;
  }

  return ts.ScriptKind.TS;
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }

  return ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function hasDefaultModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }

  return ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) === true;
}

function hasPrivateOrProtectedModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }

  return ts.getModifiers(node)?.some((modifier) => {
    return modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword;
  }) === true;
}

function methodNameFromClassElement(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return null;
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
}

function dedupeActionsByName(actions: DiscoveredAction[]): DiscoveredAction[] {
  const map = new Map<string, DiscoveredAction>();
  for (const action of actions) {
    map.set(action.name, action);
  }
  return Array.from(map.values());
}

function renameReExportedAction(action: DiscoveredAction, localName: string, exportedName: string): DiscoveredAction {
  if (localName === exportedName) {
    return action;
  }

  if (action.name === localName) {
    return {
      ...action,
      name: exportedName,
    };
  }

  if (action.name.startsWith(`${localName}.`)) {
    return {
      ...action,
      name: `${exportedName}${action.name.slice(localName.length)}`,
    };
  }

  return action;
}
