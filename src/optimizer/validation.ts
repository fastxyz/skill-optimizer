import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type { ResolvedOptimizeManifest, ValidationCommandResult, ValidationResult } from './types.js';

const execAsync = promisify(exec);

export function createValidationRunner() {
  return {
    async run(targetRepo: ResolvedOptimizeManifest['targetRepo']): Promise<ValidationResult> {
      const commands: ValidationCommandResult[] = [];

      for (const command of targetRepo.validation) {
        try {
          const result = await execAsync(command, {
            cwd: targetRepo.path,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
          });
          commands.push({
            command,
            ok: true,
            exitCode: 0,
            stdout: result.stdout,
            stderr: result.stderr,
          });
        } catch (error) {
          const err = error as Error & { code?: number; stdout?: string; stderr?: string };
          commands.push({
            command,
            ok: false,
            exitCode: typeof err.code === 'number' ? err.code : 1,
            stdout: err.stdout ?? '',
            stderr: err.stderr ?? err.message,
          });
          return { ok: false, commands };
        }
      }

      return { ok: true, commands };
    },
  };
}
