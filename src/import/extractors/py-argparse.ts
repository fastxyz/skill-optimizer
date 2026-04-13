import { readFileSync } from 'node:fs';
import { getSdkParser } from '../../benchmark/extractors/sdk/parser.js';
import type { CliCommandDefinition, CliCommandOptionDefinition } from '../types.js';

/** Extract the content of a paren-balanced block starting at `start` (the opening paren). */
function extractParenBlock(source: string, start: number): string {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
    i++;
  }
  return source.slice(start);
}

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
  const escapedSub = subparsersVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Scan full source for add_parser calls (handles multi-line calls)
  const addParserRe = new RegExp(`(\\w+)\\s*=\\s*${escapedSub}\\.add_parser\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = addParserRe.exec(source)) !== null) {
    const parserVar = m[1]!;
    const blockStart = m.index + m[0].length - 1; // position of '('
    const block = extractParenBlock(source, blockStart);
    const nameMatch = block.match(/^\(\s*['"]([^'"]+)['"]/);
    if (!nameMatch) continue;
    const commandName = nameMatch[1]!;
    const helpMatch = block.match(/help\s*=\s*['"]([^'"]+)['"]/);
    const def: CliCommandDefinition = { command: commandName, description: helpMatch?.[1] };
    commands.push(def);
    parserVarToCmd.set(parserVar, def);
  }

  // Find add_argument calls for each parser variable — use paren-block extraction
  // so multi-line calls and arbitrary kwarg ordering are handled correctly.
  for (const [parserVar, def] of parserVarToCmd) {
    const escapedVar = parserVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const addArgRe = new RegExp(`${escapedVar}\\.add_argument\\s*\\(`, 'g');
    let argMatch: RegExpExecArray | null;
    while ((argMatch = addArgRe.exec(source)) !== null) {
      const blockStart = argMatch.index + argMatch[0].length - 1;
      const block = extractParenBlock(source, blockStart);

      // First string arg — must start with '-' to be a flag (not a positional)
      const flagMatch = block.match(/^\(\s*['"](-[^'"]+)['"]/);
      if (!flagMatch) continue;
      const flagName = flagMatch[1]!;

      // help= anywhere in the block
      const helpMatch = block.match(/help\s*=\s*['"]([^'"]+)['"]/);
      // action='store_true' anywhere in the block (handles multi-line)
      const isStoreTrue = /action\s*=\s*['"]store_true['"]/.test(block);

      const opt: CliCommandOptionDefinition = {
        name: flagName,
        description: helpMatch?.[1],
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
