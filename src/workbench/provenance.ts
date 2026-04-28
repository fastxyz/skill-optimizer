import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { WorkbenchProvenanceFile, WorkbenchSourceConfig } from './types.js';
import { isRecord, readJsonFile } from './utils.js';

export function validateSuiteProvenance(suiteDir: string, source: WorkbenchSourceConfig | undefined): void {
  if (!source) {
    return;
  }

  const provenancePath = join(suiteDir, 'provenance.json');
  if (!existsSync(provenancePath)) {
    throw new Error(`Suite source metadata requires provenance.json: ${provenancePath}`);
  }

  const provenance = readProvenanceFile(provenancePath);
  if (provenance.type !== source.type) {
    throw new Error(`provenance type mismatch: expected ${source.type}, got ${String(provenance.type)}`);
  }
  if (provenance.url !== source.url) {
    throw new Error(`provenance url mismatch: expected ${source.url}, got ${String(provenance.url)}`);
  }
  if (provenance.ref !== source.ref) {
    throw new Error(`provenance ref mismatch: expected ${source.ref}, got ${String(provenance.ref)}`);
  }
  if (!Array.isArray(provenance.includedPaths)) {
    throw new Error('provenance includedPaths must be an array');
  }

  const sourceRoot = resolve(suiteDir, 'references', 'source');
  for (const includedPath of source.includedPaths) {
    if (!provenance.includedPaths.includes(includedPath)) {
      throw new Error(`provenance includedPaths missing ${includedPath}`);
    }
    const includedAbsolutePath = resolve(sourceRoot, includedPath);
    const includedRelativePath = relative(sourceRoot, includedAbsolutePath);
    if (isAbsolute(includedPath) || includedRelativePath === '..' || includedRelativePath.startsWith(`..${sep}`) || isAbsolute(includedRelativePath)) {
      throw new Error(`provenance included path must stay under references/source: ${includedPath}`);
    }
    if (!existsSync(includedAbsolutePath)) {
      throw new Error(`provenance included path does not exist under references/source: ${includedPath}`);
    }
  }
}

function readProvenanceFile(filePath: string): WorkbenchProvenanceFile {
  const parsed = readJsonFile(filePath);
  if (!isRecord(parsed)) {
    throw new Error(`provenance.json must contain an object: ${filePath}`);
  }
  if (parsed.type !== 'git') {
    throw new Error(`provenance type must be git: ${filePath}`);
  }
  if (typeof parsed.url !== 'string' || parsed.url.trim() === '') {
    throw new Error(`provenance url must be a non-empty string: ${filePath}`);
  }
  if (typeof parsed.ref !== 'string' || parsed.ref.trim() === '') {
    throw new Error(`provenance ref must be a non-empty string: ${filePath}`);
  }
  if (!Array.isArray(parsed.includedPaths) || !parsed.includedPaths.every((item) => typeof item === 'string')) {
    throw new Error(`provenance includedPaths must be an array of strings: ${filePath}`);
  }
  if (typeof parsed.fetchedAt !== 'string' || parsed.fetchedAt.trim() === '') {
    throw new Error(`provenance fetchedAt must be a non-empty string: ${filePath}`);
  }

  return {
    type: 'git',
    url: parsed.url,
    ref: parsed.ref,
    includedPaths: parsed.includedPaths,
    fetchedAt: parsed.fetchedAt,
  };
}
