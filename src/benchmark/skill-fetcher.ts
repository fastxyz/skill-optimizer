import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { FetchedSkill, SkillConfig, SkillVersion } from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Simple hash for cache key — just a short digest of the source string */
function hashSource(source: string): string {
  let h = 0;
  for (let i = 0; i < source.length; i++) {
    h = (Math.imul(31, h) + source.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0');
}

function readCache(cachePath: string): FetchedSkill | null {
  if (!existsSync(cachePath)) return null;
  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as FetchedSkill;
  } catch {
    return null;
  }
}

function writeCache(cachePath: string, result: FetchedSkill): void {
  const cacheDir = resolve(cachePath, '..');
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf-8');
}

function isRemoteSkillSource(source: string): boolean {
  return source.startsWith('github:') || source.startsWith('https://') || source.startsWith('http://');
}

function normalizePathForPrompt(pathValue: string): string {
  return pathValue.replace(/\\/g, '/');
}

function isAncestorOrSame(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function getCommonDirectory(paths: string[]): string {
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

// ── GitHub source ──────────────────────────────────────────────────────────

/**
 * Fetch skill from GitHub: "github:org/repo/path/to/file.md"
 */
async function fetchFromGitHub(source: string, useCache: boolean): Promise<FetchedSkill> {
  // Parse "github:org/repo/path/to/file.md"
  const withoutPrefix = source.slice('github:'.length);
  const slashIdx = withoutPrefix.indexOf('/');
  const secondSlashIdx = withoutPrefix.indexOf('/', slashIdx + 1);

  if (slashIdx === -1 || secondSlashIdx === -1) {
    throw new Error(
      `Invalid github source format: "${source}". ` +
      `Expected "github:org/repo/path/to/file.md"`
    );
  }

  const org = withoutPrefix.slice(0, slashIdx);
  const repo = withoutPrefix.slice(slashIdx + 1, secondSlashIdx);
  const path = withoutPrefix.slice(secondSlashIdx + 1);

  const cacheDir = resolve('.cache');
  const cachePath = resolve(cacheDir, `skill-${hashSource(source)}.json`);

  if (useCache) {
    const cached = readCache(cachePath);
    if (cached) {
      console.log(`[skill] Using cached skill (${cached.version.commitSha.slice(0, 8)}) from ${cachePath}`);
      return cached;
    }
  }

  console.log(`[skill] Fetching from GitHub: ${org}/${repo}/${path}...`);

  // Try to get commit SHA from GitHub API (optional — don't fail if it doesn't work)
  let commitSha = 'unknown';
  try {
    const commitController = new AbortController();
    const commitTimer = setTimeout(() => commitController.abort(), 30_000);
    try {
      const commitRes = await fetch(
        `https://api.github.com/repos/${org}/${repo}/commits/main`,
        { headers: { Accept: 'application/vnd.github.v3+json' }, signal: commitController.signal }
      );
      if (commitRes.ok) {
        const commitData = (await commitRes.json()) as { sha: string };
        commitSha = commitData.sha;
      }
    } finally {
      clearTimeout(commitTimer);
    }
  } catch {
    // Non-fatal — proceed with 'unknown'
  }

  // Fetch raw content
  const rawUrl = `https://raw.githubusercontent.com/${org}/${repo}/main/${path}`;
  const skillController = new AbortController();
  const skillTimer = setTimeout(() => skillController.abort(), 30_000);
  let content: string;
  try {
    const skillRes = await fetch(rawUrl, { signal: skillController.signal });
    if (!skillRes.ok) {
      throw new Error(`Failed to fetch skill from GitHub (${rawUrl}): ${skillRes.status} ${skillRes.statusText}`);
    }
    content = await skillRes.text();
  } finally {
    clearTimeout(skillTimer);
  }

  const version: SkillVersion = {
    source,
    commitSha,
    ref: 'main',
    fetchedAt: new Date().toISOString(),
  };

  const result: FetchedSkill = { version, content };

  writeCache(cachePath, result);
  console.log(`[skill] Cached skill (${commitSha.slice(0, 8)}, ${content.length} chars) to ${cachePath}`);

  return result;
}

// ── URL source ─────────────────────────────────────────────────────────────

/**
 * Fetch skill from a direct URL: "https://..." or "http://..."
 */
async function fetchFromUrl(source: string, useCache: boolean): Promise<FetchedSkill> {
  const cacheDir = resolve('.cache');
  const cachePath = resolve(cacheDir, `skill-${hashSource(source)}.json`);

  if (useCache) {
    const cached = readCache(cachePath);
    if (cached) {
      console.log(`[skill] Using cached skill from ${cachePath}`);
      return cached;
    }
  }

  console.log(`[skill] Fetching from URL: ${source}...`);

  const urlController = new AbortController();
  const urlTimer = setTimeout(() => urlController.abort(), 30_000);
  let content: string;
  try {
    const res = await fetch(source, { signal: urlController.signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch skill from URL (${source}): ${res.status} ${res.statusText}`);
    }
    content = await res.text();
  } finally {
    clearTimeout(urlTimer);
  }

  const version: SkillVersion = {
    source,
    commitSha: 'unknown',
    ref: 'url',
    fetchedAt: new Date().toISOString(),
  };

  const result: FetchedSkill = { version, content };

  writeCache(cachePath, result);
  console.log(`[skill] Cached skill (${content.length} chars) to ${cachePath}`);

  return result;
}

// ── File source ────────────────────────────────────────────────────────────

/**
 * Read skill from local filesystem: "./path" or "/absolute/path"
 */
function fetchFromFile(source: string): FetchedSkill {
  const resolved = resolve(process.cwd(), source);

  if (!existsSync(resolved)) {
    throw new Error(`Skill file not found: ${resolved} (from source: "${source}")`);
  }

  console.log(`[skill] Reading skill from file: ${resolved}`);

  let content: string;
  try {
    content = readFileSync(resolved, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read skill file ${resolved}: ${err instanceof Error ? err.message : err}`);
  }

  const version: SkillVersion = {
    source,
    commitSha: 'local',
    ref: 'file',
    fetchedAt: new Date().toISOString(),
  };

  return { version, content };
}

function fetchFromFileWithReferences(skillConfig: SkillConfig): FetchedSkill {
  const source = skillConfig.source;
  const references = skillConfig.references ?? [];
  const resolved = resolve(process.cwd(), source);
  const referenceBaseResolved = resolve(process.cwd(), skillConfig.referenceBaseSource ?? source);

  if (!existsSync(resolved)) {
    throw new Error(`Skill file not found: ${resolved} (from source: "${source}")`);
  }

  console.log(`[skill] Reading skill from file: ${resolved}`);

  let content: string;
  try {
    content = readFileSync(resolved, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read skill file ${resolved}: ${err instanceof Error ? err.message : err}`);
  }

  const resolvedReferenceFiles = references.map((referenceSource) => {
    const resolvedReference = resolve(process.cwd(), referenceSource);
    if (!existsSync(resolvedReference)) {
      throw new Error(`Skill reference file not found: ${resolvedReference} (from source: "${referenceSource}")`);
    }
    let referenceContent: string;
    try {
      referenceContent = readFileSync(resolvedReference, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to read skill reference file ${resolvedReference}: ${err instanceof Error ? err.message : err}`);
    }
    return {
      source: referenceSource,
      resolvedPath: resolvedReference,
      content: referenceContent,
    };
  });

  const commonDirectory = getCommonDirectory([
    dirname(referenceBaseResolved),
    ...resolvedReferenceFiles.map((ref) => dirname(ref.resolvedPath)),
  ]);

  const frozenReferences = resolvedReferenceFiles.map((ref) => ({
    path: normalizePathForPrompt(relative(commonDirectory, ref.resolvedPath)),
    source: ref.source,
    content: ref.content,
  }));

  const version: SkillVersion = {
    source,
    commitSha: 'local',
    ref: 'file',
    fetchedAt: new Date().toISOString(),
  };

  return {
    version,
    content,
    references: frozenReferences,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch skill documentation from the source specified in config.
 *
 * Supported source formats:
 * - "github:org/repo/path/to/file.md" → fetch from GitHub raw content
 * - "https://..." or "http://..." → fetch from URL directly
 * - "./path" or "/absolute/path" → read from local filesystem
 *
 * Returns null if no skill config is provided (skill is optional in MCP mode).
 */
export async function fetchSkill(skillConfig: SkillConfig | undefined): Promise<FetchedSkill | null> {
  if (!skillConfig) return null;

  const source = skillConfig.source;
  const useCache = skillConfig.cache !== false;

  if (isRemoteSkillSource(source) && (skillConfig.references?.length ?? 0) > 0) {
    throw new Error('target.skill.references is only supported for local file-based target.skill.source values');
  }

  if (source.startsWith('github:')) {
    return fetchFromGitHub(source, useCache);
  } else if (source.startsWith('https://') || source.startsWith('http://')) {
    return fetchFromUrl(source, useCache);
  } else {
    if ((skillConfig.references?.length ?? 0) > 0) {
      return fetchFromFileWithReferences(skillConfig);
    }
    return fetchFromFile(source);
  }
}
