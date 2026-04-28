import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export function buildWorkbenchEnv(params: {
  caseDir: string;
  workDir: string;
  resultsDir: string;
  baseEnv?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const caseBin = join(params.caseDir, 'bin');
  const baseEnv = params.baseEnv ?? process.env;
  const pathValue = existsSync(caseBin)
    ? [caseBin, baseEnv.PATH].filter(Boolean).join(':')
    : baseEnv.PATH;

  return {
    ...baseEnv,
    ...(pathValue ? { PATH: pathValue } : {}),
    CASE: params.caseDir,
    WORK: params.workDir,
    RESULTS: params.resultsDir,
  };
}

function ensureEmptyDirectory(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });

  for (const entry of readdirSync(dirPath)) {
    rmSync(join(dirPath, entry), { recursive: true, force: true });
  }
}

function copyDirectoryContents(sourceDir: string, destinationDir: string): void {
  mkdirSync(destinationDir, { recursive: true });

  for (const entry of readdirSync(sourceDir)) {
    cpSync(join(sourceDir, entry), join(destinationDir, entry), { recursive: true });
  }
}

export function prepareWorkbenchDirectory(params: {
  referencesDir: string;
  workspaceDir?: string;
  workDir: string;
}): void {
  ensureEmptyDirectory(params.workDir);
  copyDirectoryContents(params.referencesDir, params.workDir);

  if (params.workspaceDir && existsSync(params.workspaceDir)) {
    copyDirectoryContents(params.workspaceDir, params.workDir);
  }
}
