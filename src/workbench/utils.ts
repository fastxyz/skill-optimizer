import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { WorkbenchResult } from './types.js';

export function timestampSlug(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate())].join('') +
    '-' +
    [pad(date.getUTCHours()), pad(date.getUTCMinutes()), pad(date.getUTCSeconds())].join('');
}

export function writeJsonFile(filePath: string, value: unknown, options: { ensureDir?: boolean } = {}): void {
  if (options.ensureDir) {
    mkdirSync(dirname(filePath), { recursive: true });
  }
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

export function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
}

export function readWorkbenchResultFile(filePath: string): WorkbenchResult {
  const parsed = readJsonFile(filePath);
  if (!isRecord(parsed)) {
    throw new Error(`Workbench result must contain an object: ${filePath}`);
  }
  if (typeof parsed.pass !== 'boolean') {
    throw new Error(`Workbench result pass must be boolean: ${filePath}`);
  }
  if (typeof parsed.score !== 'number' || !Number.isFinite(parsed.score)) {
    throw new Error(`Workbench result score must be a finite number: ${filePath}`);
  }
  if (!Array.isArray(parsed.evidence) || !parsed.evidence.every((item) => typeof item === 'string')) {
    throw new Error(`Workbench result evidence must be an array of strings: ${filePath}`);
  }
  return {
    ...(parsed as Partial<WorkbenchResult>),
    pass: parsed.pass,
    score: parsed.score,
    evidence: parsed.evidence,
  };
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\''`)}'`;
}

export function slugPathSegment(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
