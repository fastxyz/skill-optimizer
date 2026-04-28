import { spawn } from 'node:child_process';

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export async function runShellCommand(
  command: string,
  opts: { cwd: string; env?: NodeJS.ProcessEnv; timeoutSeconds?: number },
): Promise<ProcessResult> {
  return await new Promise<ProcessResult>((resolve) => {
    const isWindows = process.platform === 'win32';
    const executable = isWindows ? 'cmd.exe' : '/bin/sh';
    const args = isWindows ? ['/d', '/s', '/c', command] : ['-lc', command];

    const child = spawn(executable, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let resolved = false;

    const timeoutMs =
      typeof opts.timeoutSeconds === 'number' && opts.timeoutSeconds > 0
        ? opts.timeoutSeconds * 1000
        : undefined;

    const timeout =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, timeoutMs);

    const finish = (exitCode: number | null) => {
      if (resolved) {
        return;
      }

      resolved = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }

      const normalizedExitCode = timedOut
        ? typeof exitCode === 'number' && exitCode !== 0
          ? exitCode
          : 124
        : exitCode;

      resolve({
        exitCode: normalizedExitCode,
        stdout,
        stderr,
        ...(timedOut ? { timedOut: true } : {}),
      });
    };

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      stderr += `${error.message}\n`;
      finish(1);
    });

    child.on('close', (code) => {
      finish(code);
    });
  });
}
