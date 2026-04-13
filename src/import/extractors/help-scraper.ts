import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CliCommandDefinition, CliCommandOptionDefinition } from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * Pure parser: given the text output of `<binary> [prefix...] --help`,
 * returns the subcommands and their options found in that output.
 */
export function parseHelpOutput(text: string, prefix: string[]): CliCommandDefinition[] {
  const lines = text.split('\n');

  let inCommands = false;
  let inOptions = false;

  const commands: CliCommandDefinition[] = [];
  const optionsBuf: CliCommandOptionDefinition[] = [];

  const COMMANDS_HEADER = /^(Commands|Subcommands):\s*$/i;
  const OPTIONS_HEADER = /^(Options|Flags|Global Options):\s*$/i;
  // Match a subcommand line: leading whitespace, non-dash first char, name token, optional description
  const CMD_LINE = /^\s+(\S+)\s*(.*)/;
  // Match an option line: leading whitespace, dash-starting flag
  const OPT_LINE = /^\s+(-\S+(?:,\s*--\S+)?)\s+(.*)/;

  for (const line of lines) {
    const trimmed = line.trim();

    // Blank line resets section state
    if (trimmed === '') {
      inCommands = false;
      inOptions = false;
      continue;
    }

    // Detect section headers
    if (COMMANDS_HEADER.test(trimmed)) {
      inCommands = true;
      inOptions = false;
      continue;
    }
    if (OPTIONS_HEADER.test(trimmed)) {
      inOptions = true;
      inCommands = false;
      continue;
    }

    if (inCommands) {
      const m = CMD_LINE.exec(line);
      if (m) {
        const rawName = m[1]!;
        // Skip if it looks like a flag line
        if (rawName.startsWith('-')) continue;
        // Strip positional hints like <name> or [name] from the token
        const name = rawName.replace(/[<[].*/g, '').trim();
        if (!name) continue;
        const description = m[2]!.trim();

        const commandStr = prefix.length > 0 ? [...prefix, name].join(' ') : name;
        commands.push({ command: commandStr, description: description || undefined });
      }
    } else if (inOptions) {
      const m = OPT_LINE.exec(line);
      if (m) {
        const flagStr = m[1]!.trim();
        const desc = m[2]!.trim();
        // takesValue if the flag string contains <word> or [word]
        const takesValue = /<\w+>|\[\w+\]/.test(flagStr);
        optionsBuf.push({
          name: flagStr,
          description: desc || undefined,
          takesValue,
        });
      }
    }
  }

  // If we have options and prefix is non-empty, attach them to the command
  // whose name matches prefix.join(' ')
  if (prefix.length > 0 && optionsBuf.length > 0) {
    const parentName = prefix.join(' ');
    const parentCmd = commands.find((c) => c.command === parentName);
    if (parentCmd) {
      parentCmd.options = optionsBuf;
    }
  }

  return commands;
}

/**
 * BFS scraper: runs `binary [prefix...] --help` for each discovered subcommand
 * up to `opts.depth` levels deep.
 */
export async function scrapeHelp(
  binary: string,
  opts: { depth: number; cwd?: string },
): Promise<CliCommandDefinition[]> {
  const { depth, cwd } = opts;
  const all: CliCommandDefinition[] = [];
  const seen = new Set<string>();

  // BFS queue of prefix arrays
  const queue: string[][] = [[]];

  while (queue.length > 0) {
    const prefix = queue.shift()!;
    const args = [...prefix, '--help'];

    let stdout = '';
    try {
      const result = await execFileAsync(binary, args, {
        cwd,
        encoding: 'utf-8',
        timeout: 5000,
      });
      stdout = result.stdout;
    } catch (err: unknown) {
      // Some CLIs exit non-zero for --help or print to stderr
      const e = err as { stdout?: string; stderr?: string };
      stdout = e.stdout ?? e.stderr ?? '';
    }

    const discovered = parseHelpOutput(stdout, prefix);

    for (const cmd of discovered) {
      if (!seen.has(cmd.command)) {
        seen.add(cmd.command);
        all.push(cmd);

        // Only recurse if we haven't reached max depth
        if (prefix.length < depth) {
          // The next prefix is the parts of this command name
          queue.push(cmd.command.split(' '));
        }
      }
    }
  }

  return all;
}
