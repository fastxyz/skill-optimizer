import type { ExtractedCall } from '../types.js';

type CommandLine = { text: string; line: number };

/**
 * Strict v1 contract: exactly one fenced bash/sh block.
 * Returns null when none or multiple shell blocks are present.
 */
export function extractShellBlock(markdown: string): string | null {
  const blockRegex = /```([^\n`]*)\n([\s\S]*?)```/g;
  const shellBlocks: string[] = [];

  for (const match of markdown.matchAll(blockRegex)) {
    const lang = (match[1] ?? '').trim().toLowerCase();
    if (lang === 'bash' || lang === 'sh') {
      shellBlocks.push((match[2] ?? '').trim());
    }
  }

  if (shellBlocks.length !== 1) return null;
  return shellBlocks[0];
}

/**
 * Parse one markdown response with a single fenced shell block into calls.
 */
export function extractFromCliMarkdown(markdown: string, knownCommands?: readonly string[]): ExtractedCall[] {
  const shell = extractShellBlock(markdown);
  if (!shell) return [];

  return parseShellCommands(shell, knownCommands);
}

/**
 * Parse shell script content into extracted CLI calls.
 */
export function parseShellCommands(shell: string, knownCommands?: readonly string[]): ExtractedCall[] {
  const commands = splitCommands(shell);
  const calls: ExtractedCall[] = [];

  for (const cmd of commands) {
    const call = parseSingleCommand(cmd.text, cmd.line, knownCommands);
    if (call) calls.push(call);
  }

  return calls;
}

function splitCommands(shell: string): CommandLine[] {
  const lines = shell.replace(/\r\n/g, '\n').split('\n');
  const commands: CommandLine[] = [];

  let current = '';
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (!current) {
      startLine = i + 1;
      current = trimmed;
    } else {
      current = `${current} ${trimmed}`;
    }

    if (current.endsWith('\\')) {
      current = current.slice(0, -1).trimEnd();
      continue;
    }

    commands.push(...splitCommandChain(current.trim(), startLine));
    current = '';
  }

  if (current) {
    commands.push(...splitCommandChain(current.trim(), startLine));
  }

  return commands;
}

function splitCommandChain(command: string, line: number): CommandLine[] {
  const parts: CommandLine[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) parts.push({ text: trimmed, line });
    current = '';
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const next = command[i + 1];

    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }

    if (ch === '\\' && quote !== "'") {
      escaping = true;
      current += ch;
      continue;
    }

    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch as '"' | "'";
      current += ch;
      continue;
    }

    if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
      flush();
      i++;
      continue;
    }

    if (ch === ';' || ch === '|') {
      flush();
      continue;
    }

    current += ch;
  }

  flush();
  return parts;
}

function parseSingleCommand(command: string, line: number, knownCommands?: readonly string[]): ExtractedCall | null {
  const tokens = tokenizeShell(command);
  if (tokens.length === 0) return null;

  let i = 0;
  const env: Record<string, string> = {};

  while (i < tokens.length && isEnvAssignment(tokens[i])) {
    const [key, ...rest] = tokens[i].split('=');
    env[key] = rest.join('=');
    i++;
  }

  if (i >= tokens.length) return null;

  const { methodParts, nextIndex } = resolveMethod(tokens, i, knownCommands);
  i = nextIndex;

  const args: Record<string, unknown> = {};
  if (Object.keys(env).length > 0) {
    args.env = env;
  }

  let positionalIndex = 0;
  let forcePositional = false;

  while (i < tokens.length) {
    const token = tokens[i];

    if (forcePositional) {
      args[`_positional_${positionalIndex++}`] = token;
      i++;
      continue;
    }

    if (token === '--') {
      forcePositional = true;
      i++;
      continue;
    }

    if (token.startsWith('--')) {
      const withoutPrefix = token.slice(2);
      const eqIndex = withoutPrefix.indexOf('=');

      if (eqIndex >= 0) {
        const key = withoutPrefix.slice(0, eqIndex);
        const value = withoutPrefix.slice(eqIndex + 1);
        args[key] = value;
        i++;
        continue;
      }

      const key = withoutPrefix;
      const next = tokens[i + 1];
      if (next && !next.startsWith('-')) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = true;
        i++;
      }
      continue;
    }

    if (token.startsWith('-') && token !== '-') {
      const key = token.slice(1);
      const next = tokens[i + 1];
      if (next && !next.startsWith('-')) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = true;
        i++;
      }
      continue;
    }

    args[`_positional_${positionalIndex++}`] = token;
    i++;
  }

  return {
    method: methodParts.join(' '),
    args,
    line,
    raw: command,
  };
}

function findKnownCommand(
  tokens: string[],
  fromIndex: number,
  knownSet: Set<string>,
): { methodParts: string[]; nextIndex: number } | null {
  for (let end = tokens.length; end > fromIndex; end--) {
    const candidateTokens = tokens.slice(fromIndex, end);
    if (candidateTokens.some((token) => token === '--' || token.startsWith('-'))) {
      continue;
    }
    if (knownSet.has(candidateTokens.join(' '))) {
      return { methodParts: candidateTokens, nextIndex: end };
    }
  }
  return null;
}

function resolveMethod(
  tokens: string[],
  startIndex: number,
  knownCommands?: readonly string[],
): { methodParts: string[]; nextIndex: number } {
  if (knownCommands && knownCommands.length > 0) {
    const knownSet = new Set(knownCommands.map((command) => command.trim()).filter(Boolean));

    // Try matching from startIndex first, then skip one token (the executable name, e.g. "fast")
    const match =
      findKnownCommand(tokens, startIndex, knownSet) ??
      (startIndex + 1 < tokens.length ? findKnownCommand(tokens, startIndex + 1, knownSet) : null);

    if (match) return match;
  }

  const executable = tokens[startIndex];
  let nextIndex = startIndex + 1;
  const methodParts = [executable];
  while (nextIndex < tokens.length) {
    const token = tokens[nextIndex];
    if (token === '--' || token.startsWith('-')) break;
    if (!isLikelySubcommand(token)) break;

    methodParts.push(token);
    nextIndex++;
  }

  return { methodParts, nextIndex };
}

function tokenizeShell(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }

    if (ch === '\\' && quote !== "'") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch as '"' | "'";
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current) tokens.push(current);
  return tokens;
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

function isLikelySubcommand(token: string): boolean {
  return /^[A-Za-z][A-Za-z-]*$/.test(token);
}
