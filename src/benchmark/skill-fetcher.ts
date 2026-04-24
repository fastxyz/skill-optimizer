import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { FetchedSkill, SkillConfig, SkillVersion } from './types.js';
import {
  buildSkillReferenceAliases,
  getCommonDirectory,
  normalizePathForPrompt,
} from '../project/skill-references.js';

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
  const { content } = readLocalSkillFile(source);
  const version = buildLocalFileVersion(source);

  return { version, content };
}

function fetchFromFileWithReferences(skillConfig: SkillConfig): FetchedSkill {
  const source = skillConfig.source;
  const references = skillConfig.references ?? [];
  const referenceBaseSources = skillConfig.referenceBaseSources ?? references;
  const { resolvedPath: resolvedSkillPath, content } = readLocalSkillFile(source);
  const resolvedBaseSkillPath = resolve(process.cwd(), skillConfig.referenceBaseSource ?? source);

  const referenceFiles = references.map((referenceSource, index) => {
    const baseSource = referenceBaseSources[index] ?? referenceSource;
    const { resolvedPath: resolvedReferencePath, content: referenceContent } = readLocalReferenceFile(referenceSource);
    const resolvedBaseReferencePath = resolve(process.cwd(), baseSource);
    return {
      source: referenceSource,
      resolvedPath: resolvedReferencePath,
      resolvedBasePath: resolvedBaseReferencePath,
      content: referenceContent,
    };
  });

  const commonDirectory = getCommonDirectory([
    dirname(resolvedBaseSkillPath),
    ...referenceFiles.map((ref) => dirname(ref.resolvedPath)),
  ]);

  const frozenReferences = referenceFiles.map((ref, index) => ({
    path: skillConfig.referencePromptPaths?.[index] !== undefined
      ? normalizePathForPrompt(skillConfig.referencePromptPaths[index]!)
      : normalizePathForPrompt(relative(commonDirectory, ref.resolvedPath)),
    source: ref.source,
    content: ref.content,
    aliases: buildSkillReferenceAliases(
      resolvedSkillPath,
      ref.resolvedPath,
      resolvedBaseSkillPath,
      ref.resolvedBasePath,
      skillConfig.referencePromptPaths?.[index],
    ),
  }));

  const version = buildLocalFileVersion(source);

  return {
    version,
    content,
    references: frozenReferences,
  };
}

function readLocalSkillFile(source: string): { resolvedPath: string; content: string } {
  const resolvedPath = resolve(process.cwd(), source);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Skill file not found: ${resolvedPath} (from source: "${source}")`);
  }

  console.log(`[skill] Reading skill from file: ${resolvedPath}`);
  return {
    resolvedPath,
    content: readLocalTextFile(resolvedPath, 'skill file'),
  };
}

function readLocalReferenceFile(source: string): { resolvedPath: string; content: string } {
  const resolvedPath = resolve(process.cwd(), source);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Skill reference file not found: ${resolvedPath} (from source: "${source}")`);
  }

  return {
    resolvedPath,
    content: readLocalTextFile(resolvedPath, 'skill reference file'),
  };
}

function readLocalTextFile(resolvedPath: string, label: string): string {
  try {
    return readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read ${label} ${resolvedPath}: ${err instanceof Error ? err.message : err}`);
  }
}

function buildLocalFileVersion(source: string): SkillVersion {
  return {
    source,
    commitSha: 'local',
    ref: 'file',
    fetchedAt: new Date().toISOString(),
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
