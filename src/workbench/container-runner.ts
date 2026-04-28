import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { runGraderCommands } from './check-runner.js';
import { loadWorkbenchCase } from './case-loader.js';
import { buildTrialSummary, buildWorkbenchMetrics } from './metrics.js';
import { createWorkbenchPiSession } from './pi-agent.js';
import { runShellCommand } from './process.js';
import { buildWorkbenchTrace } from './trace.js';
import type { WorkbenchGrade, WorkbenchResult } from './types.js';
import { isRecord, writeJsonFile } from './utils.js';
import { buildWorkbenchEnv, prepareWorkbenchDirectory } from './workspace.js';

export { prepareWorkbenchDirectory } from './workspace.js';

interface PromptSession {
  prompt(prompt: string): Promise<unknown>;
  state?: {
    messages?: unknown[];
  };
}

interface ContainerRunnerArgs {
  casePath: string;
  workDir: string;
  resultsDir: string;
}

export function buildContainerWorkbenchEnv(params: {
  casePath: string;
  workDir: string;
  resultsDir: string;
  baseEnv?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  return buildWorkbenchEnv({
    caseDir: dirname(params.casePath),
    workDir: params.workDir,
    resultsDir: params.resultsDir,
    baseEnv: params.baseEnv,
  });
}

const TREE_EXCLUDES = new Set(['.git', 'node_modules']);
const ARTIFACT_EXCLUDES = new Set(['.git', 'node_modules']);

function parseArgs(args: string[]): ContainerRunnerArgs {
  const casePath = getFlagValue(args, '--case');
  const workDir = getFlagValue(args, '--work');
  const resultsDir = getFlagValue(args, '--results');

  if (!casePath || !workDir || !resultsDir) {
    throw new Error('Usage: container-runner --case <path> --work <path> --results <path>');
  }

  return { casePath, workDir, resultsDir };
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Flag ${flag} requires a value`);
  }

  return value;
}

function buildReferenceTree(rootDir: string): string {
  const lines: string[] = ['.'];

  const walk = (dirPath: string, prefix: string) => {
    const entries = readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => !TREE_EXCLUDES.has(entry.name))
      .sort((left, right) => {
        if (left.isDirectory() && !right.isDirectory()) return -1;
        if (!left.isDirectory() && right.isDirectory()) return 1;
        return left.name.localeCompare(right.name);
      });

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isFile()) {
        continue;
      }

      const line = `${prefix}${entry.name}${entry.isDirectory() ? '/' : ''}`;
      lines.push(line);

      if (entry.isDirectory()) {
        walk(join(dirPath, entry.name), `${prefix}  `);
      }
    }
  };

  walk(rootDir, '  ');
  return lines.join('\n');
}

function listFiles(rootDir: string): string[] {
  const files: string[] = [];
  const walk = (dirPath: string) => {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      if (ARTIFACT_EXCLUDES.has(entry.name)) {
        continue;
      }
      const path = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.isFile()) {
        files.push(path);
      }
    }
  };
  walk(rootDir);
  return files;
}

export function preserveArtifacts(patterns: string[], workDir: string, resultsDir: string): void {
  if (patterns.length === 0) {
    return;
  }

  const artifactDir = join(resultsDir, 'artifacts');
  for (const filePath of listFiles(workDir)) {
    const relativePath = relative(workDir, filePath).replace(/\\/g, '/');
    if (!patterns.some((pattern) => matchesArtifactPattern(relativePath, pattern))) {
      continue;
    }
    const destination = join(artifactDir, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(filePath, destination);
  }
}

function matchesArtifactPattern(relativePath: string, pattern: string): boolean {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.endsWith('/**')) {
    const prefix = normalized.slice(0, -3);
    return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
  }
  if (!normalized.includes('*')) {
    return relativePath === normalized;
  }

  const escaped = normalized
    .replace(/\*\*\//g, '__GLOBSTAR_DIR__')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '__STAR__')
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/__GLOBSTAR_DIR__/g, '(?:.*/)?')
    .replace(/__GLOBSTAR__/g, '.*')
    .replace(/__STAR__/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(relativePath);
}

export async function runAgentPromptWithTimeout(
  session: PromptSession,
  prompt: string,
  timeoutSeconds: number,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      session.prompt(prompt),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Agent timed out after ${timeoutSeconds} seconds`));
        }, timeoutSeconds * 1000);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  const messages = session.state?.messages ?? [];
  const lastMessage = messages[messages.length - 1];
  if (!isRecord(lastMessage) || lastMessage.role !== 'assistant') {
    return;
  }

  if (lastMessage.stopReason === 'error' || lastMessage.stopReason === 'aborted') {
    const errorMessage = typeof lastMessage.errorMessage === 'string'
      ? lastMessage.errorMessage
      : `Agent request ${lastMessage.stopReason}`;
    throw new Error(errorMessage);
  }
}

export function writeBestEffortTrace(params: {
  tracePath: string;
  caseName?: string;
  model?: string;
  startedAt?: string;
  endedAt?: string;
  session?: PromptSession;
}): boolean {
  const messages = params.session?.state?.messages;
  if (!params.caseName || !params.model || !params.startedAt || !messages) {
    return false;
  }

  writeJsonFile(params.tracePath, buildWorkbenchTrace({
    caseName: params.caseName,
    model: params.model,
    startedAt: params.startedAt,
    endedAt: params.endedAt ?? new Date().toISOString(),
    messages,
  }));
  return true;
}

async function runCommands(commands: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }): Promise<void> {
  for (const command of commands) {
    const result = await runShellCommand(command, {
      cwd: opts.cwd,
      env: opts.env,
    });

    if (result.exitCode !== 0) {
      const details = [
        `Command failed: ${command}`,
        `exitCode: ${String(result.exitCode)}`,
        result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : null,
        result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ].filter(Boolean);
      throw new Error(details.join('\n\n'));
    }
  }
}

async function runCleanupCommands(
  commands: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
  cleanupErrorPath: string,
): Promise<void> {
  if (commands.length === 0) {
    return;
  }

  const errors: string[] = [];
  for (const command of commands) {
    const result = await runShellCommand(command, {
      cwd: opts.cwd,
      env: opts.env,
    });

    if (result.exitCode !== 0) {
      errors.push([
        `Command failed: ${command}`,
        `exitCode: ${String(result.exitCode)}`,
        result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : null,
        result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ].filter(Boolean).join('\n\n'));
    }
  }

  if (errors.length > 0) {
    writeFileSync(cleanupErrorPath, `${errors.join('\n\n---\n\n')}\n`, 'utf-8');
  }
}

function buildFatalGrade(error: unknown): WorkbenchGrade {
  return {
    pass: false,
    score: 0,
    evidence: [error instanceof Error ? error.message : String(error)],
  };
}

function buildResult(params: {
  caseName: string;
  model: string;
  startedAt: string;
  endedAt: string;
  grade: WorkbenchGrade;
}): WorkbenchResult {
  return {
    caseName: params.caseName,
    model: params.model,
    startedAt: params.startedAt,
    endedAt: params.endedAt,
    ...params.grade,
  };
}

function buildPrompt(tree: string, task: string): string {
  return [
    'You are running inside an isolated Docker container.',
    'Everything you need for this task is in /work.',
    'Read the references before acting.',
    'Use shell/read/write/edit tools as needed.',
    'Create or modify files only under /work.',
    'Validate your result before finishing.',
    '',
    'Reference tree:',
    tree,
    '',
    'Task:',
    task,
  ].join('\n');
}

export async function runContainerWorkbenchCase(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const resultPath = join(parsed.resultsDir, 'result.json');
  const tracePath = join(parsed.resultsDir, 'trace.json');
  const summaryPath = join(parsed.resultsDir, 'trial-summary.json');
  const cleanupErrorPath = join(parsed.resultsDir, 'cleanup-error.txt');
  let wroteResult = false;
  let session: PromptSession | undefined;
  let caseName: string | undefined;
  let model: string | undefined;
  let startedAt: string | undefined;

  mkdirSync(parsed.resultsDir, { recursive: true });

  try {
    const resolved = loadWorkbenchCase(parsed.casePath);
    startedAt = new Date().toISOString();
    caseName = resolved.name;
    model = resolved.model;
    const env = buildContainerWorkbenchEnv(parsed);

    prepareWorkbenchDirectory({
      referencesDir: resolved.referencesDir,
      workspaceDir: join(dirname(parsed.casePath), 'workspace'),
      workDir: parsed.workDir,
    });

    await runCommands(resolved.setup, { cwd: parsed.workDir, env });

    const tree = buildReferenceTree(parsed.workDir);
    process.env.PATH = env.PATH;

    const created = await createWorkbenchPiSession({
      cwd: parsed.workDir,
      modelRef: resolved.model,
      apiKeyEnv: 'OPENROUTER_API_KEY',
    });
    session = created.session as PromptSession;

    await runAgentPromptWithTimeout(session, buildPrompt(tree, resolved.task), resolved.timeoutSeconds);

    const endedAt = new Date().toISOString();
    const trace = buildWorkbenchTrace({
      caseName: resolved.name,
      model: resolved.model,
      startedAt,
      endedAt,
        messages: session.state?.messages ?? [],
      });

    writeJsonFile(tracePath, trace);

    const grade = await runGraderCommands(resolved.graders, {
      cwd: parsed.workDir,
      env,
      timeoutSeconds: 120,
    });

    preserveArtifacts(resolved.artifacts, parsed.workDir, parsed.resultsDir);

    const result = buildResult({
      caseName: resolved.name,
      model: resolved.model,
      startedAt,
      endedAt: new Date().toISOString(),
      grade: {
        ...grade,
        metrics: buildWorkbenchMetrics(trace),
      },
    });

    writeJsonFile(resultPath, result);
    writeJsonFile(summaryPath, buildTrialSummary({ trace, result }));
    wroteResult = true;

    await runCleanupCommands(resolved.cleanup, { cwd: parsed.workDir, env }, cleanupErrorPath);
    return grade.pass ? 0 : 1;
  } catch (error) {
    if (!wroteResult) {
      const endedAt = new Date().toISOString();
      try {
        const resolved = loadWorkbenchCase(parsed.casePath);
        caseName = caseName ?? resolved.name;
        model = model ?? resolved.model;
      } catch {
        // Keep fatal result writable even if the case itself is malformed.
      }
      try {
        writeBestEffortTrace({
          tracePath,
          caseName,
          model,
          startedAt,
          endedAt,
          session,
        });
      } catch {
        // Fatal result writing is more important than partial trace persistence.
      }
      writeJsonFile(resultPath, {
        caseName,
        model,
        endedAt,
        ...buildFatalGrade(error),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (existsSync(parsed.casePath)) {
      try {
        const resolved = loadWorkbenchCase(parsed.casePath);
        const env = buildContainerWorkbenchEnv(parsed);
        await runCleanupCommands(resolved.cleanup, { cwd: parsed.workDir, env }, cleanupErrorPath);
      } catch {
        // Ignore cleanup/load errors in fatal path.
      }
    }

    return 1;
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  const normalized = entry.replace(/\\/g, '/');
  return normalized.endsWith('/container-runner.js') || normalized.endsWith('/container-runner.ts');
}


if (isMainModule()) {
  void runContainerWorkbenchCase(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
