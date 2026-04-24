import { dirname, isAbsolute, relative } from 'node:path';

export interface SkillReferencePathEntry {
  source: string;
  promptPath: string;
  baseSource?: string;
}

function isAncestorOrSame(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function normalizePathForPrompt(pathValue: string): string {
  return pathValue.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '');
}

export function getCommonDirectory(paths: string[]): string {
  if (paths.length === 0) return process.cwd();
  let common = paths[0]!;
  for (const current of paths.slice(1)) {
    while (!isAncestorOrSame(common, current)) {
      const next = dirname(common);
      if (next === common) break;
      common = next;
    }
  }
  return common;
}

export function buildCanonicalSkillReferenceEntries(
  skillPath: string,
  references: string[],
): SkillReferencePathEntry[] {
  const commonDirectory = getCommonDirectory([
    dirname(skillPath),
    ...references.map((reference) => dirname(reference)),
  ]);

  return references.map((reference) => ({
    source: reference,
    promptPath: normalizePathForPrompt(relative(commonDirectory, reference)),
  }));
}

export function buildSkillReferenceAliases(
  skillPath: string,
  referencePath: string,
  baseSkillPath: string,
  baseReferencePath: string,
  promptPath?: string,
): string[] {
  const aliases = new Set<string>();
  const candidates = [
    referencePath,
    baseReferencePath,
    relative(dirname(skillPath), referencePath),
    relative(dirname(baseSkillPath), baseReferencePath),
  ];

  for (const candidate of candidates) {
    const normalized = normalizePathForPrompt(candidate);
    if (normalized && normalized !== '.' && normalized !== promptPath) {
      aliases.add(normalized);
    }
  }

  return [...aliases];
}
