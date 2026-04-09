import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { MutationCandidate, ResolvedOptimizeManifest } from './types.js';
import { collectGitChangedFiles } from './mutation/git-changes.js';

const execFileAsync = promisify(execFile);

export function createRepoStateManager() {
  return {
    async ensureReady(targetRepo: ResolvedOptimizeManifest['targetRepo']): Promise<string> {
      const status = await git(targetRepo.path, ['status', '--porcelain']);
      if (targetRepo.requireCleanGit && status.stdout.trim() !== '') {
        throw new Error(`Target repo must be clean before optimize runs: ${targetRepo.path}`);
      }
      return 'ready';
    },

    async captureCheckpoint(targetRepo: ResolvedOptimizeManifest['targetRepo']): Promise<string> {
      const result = await git(targetRepo.path, ['rev-parse', 'HEAD']);
      return result.stdout.trim();
    },

    async restoreCheckpoint(targetRepo: ResolvedOptimizeManifest['targetRepo'], checkpoint: string): Promise<void> {
      await git(targetRepo.path, ['restore', `--source=${checkpoint}`, '--staged', '--worktree', '.']);
      await git(targetRepo.path, ['clean', '-fd']);
    },

    async listChangedFiles(targetRepo: ResolvedOptimizeManifest['targetRepo']): Promise<string[]> {
      return collectGitChangedFiles(targetRepo.path);
    },

    async updateAcceptedCheckpoint(
      targetRepo: ResolvedOptimizeManifest['targetRepo'],
      checkpoint: string,
      candidate: MutationCandidate,
      changedFiles: string[] = candidate.changedFiles,
    ): Promise<string> {
      const status = await git(targetRepo.path, ['status', '--porcelain']);
      if (status.stdout.trim() === '') {
        return checkpoint;
      }

      if (changedFiles.length === 0) {
        return checkpoint;
      }

      await git(targetRepo.path, ['add', '-A', '--', ...changedFiles]);
      await git(targetRepo.path, ['commit', '-m', buildIterationCommitMessage(candidate.summary)], {
        GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? 'skill-optimizer',
        GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? 'skill-optimizer@local',
        GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? process.env.GIT_AUTHOR_NAME ?? 'skill-optimizer',
        GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? process.env.GIT_AUTHOR_EMAIL ?? 'skill-optimizer@local',
      });
      const result = await git(targetRepo.path, ['rev-parse', 'HEAD']);
      return result.stdout.trim();
    },
  };
}

function buildIterationCommitMessage(summary: string): string {
  const normalized = summary.trim().replace(/\s+/g, ' ');
  return `chore(optimize): ${normalized || 'accept optimizer iteration'}`;
}

async function git(cwd: string, args: string[], env?: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync('git', args, { cwd, encoding: 'utf-8', env: env ? { ...process.env, ...env } : process.env });
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${err.stderr ?? err.message}`);
  }
}
