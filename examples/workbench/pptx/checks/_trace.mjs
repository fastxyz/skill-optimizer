import { readFileSync } from 'node:fs';

export function readTraceJsonl(tracePath) {
  return readFileSync(tracePath, 'utf-8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function readPathFromToolCall(entry) {
  if (entry?.type !== 'tool_call' || entry.name !== 'read') {
    return undefined;
  }
  const args = entry.arguments;
  if (!args || typeof args !== 'object') {
    return undefined;
  }
  if (typeof args.path === 'string') return args.path;
  if (typeof args.filePath === 'string') return args.filePath;
  return undefined;
}

function matchesPath(path, pattern) {
  if (pattern instanceof RegExp) {
    return pattern.test(path);
  }
  return path === String(pattern);
}

export function noReadPath(tracePath, forbiddenPath) {
  const forbidden = readTraceJsonl(tracePath)
    .map(readPathFromToolCall)
    .filter((path) => typeof path === 'string' && matchesPath(path, forbiddenPath));

  if (forbidden.length > 0) {
    return {
      pass: false,
      score: 0,
      evidence: forbidden.map((path) => `forbidden read path: ${path}`),
    };
  }

  return {
    pass: true,
    score: 1,
    evidence: ['no forbidden read paths found'],
  };
}

export function printResult(result) {
  console.log(JSON.stringify(result));
  process.exit(result.pass ? 0 : 1);
}
