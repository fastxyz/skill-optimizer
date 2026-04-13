import { readFileSync } from 'node:fs';
import { getSdkParser } from '../../benchmark/extractors/sdk/parser.js';
import type { CliCommandDefinition, CliCommandOptionDefinition } from '../types.js';

export async function extractArgparse(filePath: string): Promise<CliCommandDefinition[]> {
  const source = readFileSync(filePath, 'utf-8');
  // Use tree-sitter just to validate it parses (will throw on syntax error)
  const parser = await getSdkParser('python');
  parser.parse(source); // validate only

  const lines = source.split('\n');

  // Find subparsers variable
  let subparsersVar: string | null = null;
  for (const line of lines) {
    const m = line.match(/(\w+)\s*=\s*\w+\.add_subparsers\s*\(/);
    if (m) { subparsersVar = m[1]!; break; }
  }
  if (!subparsersVar) return [];

  // Find parser variables and commands
  const commands: CliCommandDefinition[] = [];
  const parserVarToCmd = new Map<string, CliCommandDefinition>();
  // Escape the subparsers variable name for use in regex
  const escapedSub = subparsersVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const line of lines) {
    const m = line.match(
      new RegExp(`(\\w+)\\s*=\\s*${escapedSub}\\.add_parser\\s*\\(\\s*['"]([^'"]+)['"](?:\\s*,\\s*help\\s*=\\s*['"]([^'"]+)['"])?`)
    );
    if (!m) continue;
    const parserVar = m[1]!;
    const commandName = m[2]!;
    const helpText = m[3];
    const def: CliCommandDefinition = { command: commandName, description: helpText };
    commands.push(def);
    parserVarToCmd.set(parserVar, def);
  }

  // Find add_argument calls for each parser variable
  for (const [parserVar, def] of parserVarToCmd) {
    const escapedVar = parserVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const argRegex = new RegExp(
      `${escapedVar}\\.add_argument\\s*\\(\\s*['"](-[^'"]+)['"](?:\\s*,\\s*help\\s*=\\s*['"]([^'"]+)['"])?`,
      'g'
    );
    let argMatch: RegExpExecArray | null;
    while ((argMatch = argRegex.exec(source)) !== null) {
      const flagName = argMatch[1]!;
      if (!flagName.startsWith('-')) continue; // skip positionals
      const helpText2 = argMatch[2];
      // Find the full line to check for store_true
      const lineStart = source.lastIndexOf('\n', argMatch.index) + 1;
      const lineEnd = source.indexOf('\n', argMatch.index);
      const fullLine = source.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      const isStoreTrue = /action\s*=\s*['"]store_true['"]/.test(fullLine);
      const opt: CliCommandOptionDefinition = {
        name: flagName,
        description: helpText2,
        takesValue: !isStoreTrue,
      };
      if (!def.options) def.options = [];
      if (!def.options.find(o => o.name === flagName)) {
        def.options.push(opt);
      }
    }
  }

  return commands;
}
