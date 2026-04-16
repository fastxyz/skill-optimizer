import { readFileSync } from 'node:fs';
import type Parser from 'web-tree-sitter';
import { getSdkParser } from '../../benchmark/extractors/sdk/parser.js';
import type { CliCommandDefinition, CliCommandOptionDefinition } from '../types.js';

function stripDocstring(raw: string): string {
  const m = raw.match(/^['"]{1,3}([\s\S]*?)['"]{1,3}$/);
  if (m) return m[1]!.trim();
  return raw.trim();
}

function getDocstring(funcDef: Parser.SyntaxNode): string | undefined {
  // Find the 'block' child of the function definition
  let block: Parser.SyntaxNode | null = null;
  for (const child of funcDef.children) {
    if (child.type === 'block') {
      block = child;
      break;
    }
  }
  if (!block) return undefined;

  // First child of block that is expression_statement containing a string
  for (const child of block.children) {
    if (child.type === 'expression_statement') {
      for (const inner of child.children) {
        if (inner.type === 'string') {
          return stripDocstring(inner.text);
        }
      }
    }
  }
  return undefined;
}

function walkTree(node: Parser.SyntaxNode, source: string): CliCommandDefinition[] {
  const results: CliCommandDefinition[] = [];

  if (node.type === 'decorated_definition') {
    const decorators: Parser.SyntaxNode[] = [];
    let funcDef: Parser.SyntaxNode | null = null;

    for (const child of node.children) {
      if (child.type === 'decorator') {
        decorators.push(child);
      } else if (child.type === 'function_definition') {
        funcDef = child;
      }
    }

    if (funcDef) {
      // Check if any decorator is a command decorator (but not group)
      let isCommand = false;
      const options: CliCommandOptionDefinition[] = [];

      for (const dec of decorators) {
        const decoratorText = source.slice(dec.startIndex, dec.endIndex);
        const isCommandDec =
          /\.command\s*\(\s*\)/.test(decoratorText) ||
          /^@click\.command\s*\(/.test(decoratorText);
        const isOptionDec = /\.option\s*\(/.test(decoratorText);

        if (isCommandDec) {
          isCommand = true;
        } else if (isOptionDec) {
          const flagMatch = decoratorText.match(/\.option\s*\(\s*['"]([^'"]+)['"]/);
          const helpMatch = decoratorText.match(/help\s*=\s*['"]([^'"]+)['"]/);
          const isFlag = /is_flag\s*=\s*True/.test(decoratorText);

          if (flagMatch) {
            options.push({
              name: flagMatch[1]!,
              description: helpMatch ? helpMatch[1] : undefined,
              takesValue: !isFlag,
            });
          }
        }
      }

      if (isCommand) {
        const nameNode = funcDef.childForFieldName('name');
        const rawName = nameNode ? nameNode.text : '';
        const commandName = rawName.replace(/_/g, '-');
        const description = getDocstring(funcDef);

        const def: CliCommandDefinition = { command: commandName };
        if (description !== undefined) def.description = description;
        if (options.length > 0) def.options = options;

        results.push(def);
      }
    }
  }

  for (const child of node.children) {
    results.push(...walkTree(child, source));
  }

  return results;
}

/**
 * Extract click command definitions from a Python source file using tree-sitter.
 */
export async function extractClick(filePath: string): Promise<CliCommandDefinition[]> {
  const source = readFileSync(filePath, 'utf-8');
  const parser = await getSdkParser('python');
  const tree = parser.parse(source);
  return walkTree(tree.rootNode, source);
}
