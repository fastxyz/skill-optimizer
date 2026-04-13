import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function collectGitChangedFiles(cwd: string): Promise<string[]> {
  const [unstaged, staged, untracked, ignored] = await Promise.all([
    gitList(cwd, ['diff', '--name-only']),
    gitList(cwd, ['diff', '--name-only', '--cached']),
    gitList(cwd, ['ls-files', '--others', '--exclude-standard']),
    gitList(cwd, ['ls-files', '--others', '-i', '--exclude-standard']),
  ]);

  return [...new Set([...unstaged, ...staged, ...untracked, ...ignored])].sort();
}

async function gitList(cwd: string, args: string[]): Promise<string[]> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf-8' });
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
