import { readFileSync } from 'node:fs';
import { getSdkParser } from '../../benchmark/extractors/sdk/parser.js';
import type { CliCommandDefinition, CliCommandOptionDefinition } from '../types.js';

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

/**
 * Extract clap command definitions from a Rust source file using tree-sitter for validation,
 * then text-based analysis for extraction.
 */
export async function extractClap(filePath: string): Promise<CliCommandDefinition[]> {
  const source = readFileSync(filePath, 'utf-8');
  const parser = await getSdkParser('rust');
  parser.parse(source); // validate only

  const commands: CliCommandDefinition[] = [];
  const subcommandSearchStr = '.subcommand(';
  let searchStart = 0;

  while (true) {
    const subIdx = source.indexOf(subcommandSearchStr, searchStart);
    if (subIdx === -1) break;

    const blockStart = subIdx + subcommandSearchStr.length - 1;
    const block = extractParenBlock(source, blockStart);

    const nameMatch = block.match(/Command\s*::\s*new\s*\(\s*"([^"]+)"\s*\)/);
    if (!nameMatch) { searchStart = subIdx + 1; continue; }
    const commandName = nameMatch[1]!;

    const aboutMatch = block.match(/\.about\s*\(\s*"([^"]+)"\s*\)/);
    const description = aboutMatch ? aboutMatch[1] : undefined;

    const options: CliCommandOptionDefinition[] = [];
    const argSearchStr = '.arg(';
    let argSearchStart = 0;
    while (true) {
      const argIdx = block.indexOf(argSearchStr, argSearchStart);
      if (argIdx === -1) break;

      const argBlockStart = argIdx + argSearchStr.length - 1;
      const argBlock = extractParenBlock(block, argBlockStart);

      const longMatch = argBlock.match(/\.long\s*\(\s*"([^"]+)"\s*\)/);
      if (longMatch) {
        const longFlag = '--' + longMatch[1];
        const helpMatch = argBlock.match(/\.help\s*\(\s*"([^"]+)"\s*\)/);
        const isBool = /SetTrue|SetFalse|store_true/.test(argBlock);
        options.push({
          name: longFlag,
          description: helpMatch ? helpMatch[1] : undefined,
          takesValue: !isBool,
        });
      }

      argSearchStart = argIdx + 1;
    }

    commands.push({ command: commandName, description, options: options.length > 0 ? options : undefined });
    searchStart = subIdx + 1;
  }

  return commands;
}
