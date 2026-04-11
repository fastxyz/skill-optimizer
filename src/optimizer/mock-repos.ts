import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MOCK_REPO_NAMES = ['sdk-demo', 'cli-demo', 'mcp-demo', 'mcp-tracker-demo'] as const;

export type MockRepoName = (typeof MOCK_REPO_NAMES)[number];

export function listMockRepoTemplates(): MockRepoName[] {
  return MOCK_REPO_NAMES.filter((name) => existsSync(getMockRepoTemplatePath(name)));
}

export function getMockRepoTemplatePath(name: MockRepoName): string {
  if (!MOCK_REPO_NAMES.includes(name)) {
    throw new Error(`Unknown mock repo template: ${name}`);
  }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  return join(repoRoot, 'mock-repos', name);
}

export async function materializeMockRepo(name: MockRepoName, destinationRoot: string): Promise<string> {
  const templatePath = getMockRepoTemplatePath(name);
  if (!existsSync(templatePath)) {
    throw new Error(`Mock repo template not found: ${templatePath}`);
  }

  mkdirSync(destinationRoot, { recursive: true });
  const destinationPath = resolve(destinationRoot, name);
  assertNoPathOverlap(templatePath, destinationPath);
  rmSync(destinationPath, { recursive: true, force: true });
  cpSync(templatePath, destinationPath, {
    recursive: true,
    force: true,
  });

  await initializeGitRepo(destinationPath);
  return destinationPath;
}

async function initializeGitRepo(cwd: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd, encoding: 'utf-8' });
  await execFileAsync('git', ['config', 'user.name', 'OpenCode Mock Repo'], { cwd, encoding: 'utf-8' });
  await execFileAsync('git', ['config', 'user.email', 'opencode-mock@example.com'], { cwd, encoding: 'utf-8' });
  await execFileAsync('git', ['add', '-A'], { cwd, encoding: 'utf-8' });
  await execFileAsync('git', ['-c', 'commit.gpgsign=false', 'commit', '-m', 'chore: initialize mock repo'], { cwd, encoding: 'utf-8' });
}

function assertNoPathOverlap(templatePath: string, destinationPath: string): void {
  const source = resolve(templatePath);
  const destination = resolve(destinationPath);
  if (source === destination || source.startsWith(`${destination}${sep}`) || destination.startsWith(`${source}${sep}`)) {
    throw new Error(`Materialized destination overlaps the tracked template path: ${destination}`);
  }
}
