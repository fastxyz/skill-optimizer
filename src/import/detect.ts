import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve, basename } from 'node:path';
import type { DetectionResult } from './types.js';

function inferBinaryHint(fromPath: string, cwd: string): string | undefined {
  const pkgPath = resolve(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      const bin = pkg['bin'];
      if (typeof bin === 'string') return bin;
      if (typeof bin === 'object' && bin !== null) {
        const keys = Object.keys(bin as object);
        if (keys.length > 0) return keys[0];
      }
    } catch { /* ignore */ }
  }

  const pyprojPath = resolve(cwd, 'pyproject.toml');
  if (existsSync(pyprojPath)) {
    const content = readFileSync(pyprojPath, 'utf-8');
    const m = content.match(/\[project\.scripts\][\s\S]*?\n(\S+)\s*=/);
    if (m) return m[1];
  }

  return basename(fromPath).replace(/\.[^.]+$/, '') || undefined;
}

export function detectFramework(fromPath: string, cwd: string): DetectionResult {
  const abs = resolve(cwd, fromPath);
  const ext = extname(abs).toLowerCase();
  const binaryHint = inferBinaryHint(fromPath, cwd);

  if (ext === '.py') {
    if (!existsSync(abs)) return { kind: 'unknown', binaryHint };
    const content = readFileSync(abs, 'utf-8');
    if (/import typer|from typer/.test(content)) return { kind: 'typer', binaryHint };
    if (/import click|from click/.test(content)) return { kind: 'click', binaryHint };
    if (/import argparse|from argparse/.test(content)) return { kind: 'argparse', binaryHint };
    return { kind: 'unknown', binaryHint };
  }

  if (ext === '.rs' || basename(abs) === 'Cargo.toml') {
    return { kind: 'clap', binaryHint };
  }

  if (['.ts', '.tsx', '.js', '.mjs', '.cjs'].includes(ext)) {
    if (!existsSync(abs)) return { kind: 'unknown', binaryHint };
    const content = readFileSync(abs, 'utf-8');
    if (/from ['"]commander['"]|require\(['"]commander['"]\)/.test(content)) return { kind: 'commander', binaryHint };
    if (/from ['"]yargs['"]|require\(['"]yargs['"]\)/.test(content)) return { kind: 'yargs', binaryHint };
    if (/@optique\/core/.test(content)) return { kind: 'optique', binaryHint };
    return { kind: 'unknown', binaryHint };
  }

  // No recognized extension — treat fromPath as a binary name
  return { kind: 'unknown', binaryHint: fromPath };
}
