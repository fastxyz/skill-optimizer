export function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Flag ${flag} requires a value`);
  }

  return value;
}

export function positionals(args: string[], options: { valueFlags: string[]; booleanFlags?: string[] }): string[] {
  const valueFlags = new Set(options.valueFlags);
  const booleanFlags = new Set(options.booleanFlags ?? []);
  const result: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (valueFlags.has(arg)) {
      index += 1;
      continue;
    }

    if (booleanFlags.has(arg)) {
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }

    result.push(arg);
  }

  return result;
}
