import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { runGraderCommands } from './check-runner.js';
import { loadWorkbenchCase } from './case-loader.js';
import { buildWorkbenchMetrics } from './metrics.js';
import { createWorkbenchPiSession } from './pi-agent.js';
import { runShellCommand } from './process.js';
import { buildAgentSystemPrompt } from './sandbox.js';
import { buildWorkbenchTrace, createTraceRecorder } from './trace.js';
import type { TraceRecorder } from './trace.js';
import type { WorkbenchGrade, WorkbenchResult, WorkbenchTrace, WorkbenchTraceEntry } from './types.js';
import { isRecord, writeJsonFile } from './utils.js';
import { buildWorkbenchEnv, prepareWorkbenchDirectory } from './workspace.js';

export { prepareWorkbenchDirectory } from './workspace.js';
export { buildAgentSystemPrompt } from './sandbox.js';

interface PromptSession {
  prompt(prompt: string): Promise<unknown>;
  systemPrompt?: string;
  subscribe?: (listener: (event: unknown) => void) => () => void;
  dispose?: () => void;
  state?: {
    messages?: unknown[];
  };
}

interface AgentRunnerArgs {
  mode: 'agent';
  caseName: string;
  model: string;
  task: string;
  appendSystemPrompt?: string;
  timeoutSeconds: number;
  workDir: string;
  resultsDir: string;
}

interface GradeRunnerArgs {
  mode: 'grade';
  casePath: string;
  workDir: string;
  resultsDir: string;
}

interface SetupRunnerArgs {
  mode: 'setup';
  casePath: string;
  workDir: string;
}

type ContainerRunnerArgs = AgentRunnerArgs | GradeRunnerArgs | SetupRunnerArgs;

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

const ARTIFACT_EXCLUDES = new Set(['.git', 'node_modules']);

function parseArgs(args: string[]): ContainerRunnerArgs {
  const workDir = getFlagValue(args, '--work');
  const resultsDir = getFlagValue(args, '--results');

  if (args.includes('--agent')) {
    const caseName = getFlagValue(args, '--case-name');
    const model = getFlagValue(args, '--model');
    const taskBase64 = getFlagValue(args, '--task-base64');
    const appendSystemPromptBase64 = getFlagValue(args, '--append-system-prompt-base64');
    const timeoutSeconds = Number(getFlagValue(args, '--timeout-seconds'));
    if (!caseName || !model || !taskBase64 || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || !workDir || !resultsDir) {
      throw new Error('Usage: container-runner --agent --case-name <name> --model <model> --task-base64 <task> --timeout-seconds <seconds> --work <path> --results <path>');
    }
    return {
      mode: 'agent',
      caseName,
      model,
      task: Buffer.from(taskBase64, 'base64').toString('utf-8'),
      appendSystemPrompt: appendSystemPromptBase64
        ? Buffer.from(appendSystemPromptBase64, 'base64').toString('utf-8')
        : undefined,
      timeoutSeconds,
      workDir,
      resultsDir,
    };
  }

  const casePath = getFlagValue(args, '--case');
  if (args.includes('--setup')) {
    if (!casePath || !workDir) {
      throw new Error('Usage: container-runner --setup --case <path> --work <path>');
    }
    return { mode: 'setup', casePath, workDir };
  }

  if (!args.includes('--grade') || !casePath || !workDir || !resultsDir) {
    throw new Error('Usage: container-runner --agent ... or --setup --case <path> --work <path> or --grade --case <path> --work <path> --results <path>');
  }

  return { mode: 'grade', casePath, workDir, resultsDir };
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
  recorder?: TraceRecorder;
}): boolean {
  const messages = params.session?.state?.messages;
  if (!params.caseName || !params.model || !params.startedAt) {
    return false;
  }

  if (params.recorder && params.recorder.events.length > 0) {
    writeTraceFile(params.tracePath, params.recorder.toTrace({
      caseName: params.caseName,
      model: params.model,
      startedAt: params.startedAt,
      endedAt: params.endedAt ?? new Date().toISOString(),
      messages: messages ?? [],
    }));
    return true;
  }

  if (!messages) {
    return false;
  }

  writeTraceFile(params.tracePath, buildWorkbenchTrace({
    caseName: params.caseName,
    model: params.model,
    startedAt: params.startedAt,
    endedAt: params.endedAt ?? new Date().toISOString(),
    messages,
  }));
  return true;
}

export function writeTraceFile(tracePath: string, trace: WorkbenchTrace): void {
  const header = {
    type: 'trace_start',
    schemaVersion: trace.schemaVersion ?? 1,
    caseName: trace.caseName,
    model: trace.model,
    startedAt: trace.startedAt,
    endedAt: trace.endedAt,
  };
  const lines = [header, ...trace.entries]
    .map((entry) => JSON.stringify(entry));
  writeFileSync(tracePath, `${lines.join('\n')}\n`, 'utf-8');
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

async function runSetupCommands(
  commands: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<string[]> {
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
  return errors;
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

function readTraceFile(tracePath: string, fallback: Omit<WorkbenchTrace, 'entries'>): WorkbenchTrace {
  try {
    const raw = readFileSync(tracePath, 'utf-8');
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed) && Array.isArray(parsed.entries)) {
        return parsed as unknown as WorkbenchTrace;
      }
      } catch {
        // Fall through to JSONL parsing.
      }
    }

    const rows = trimmed.length > 0
      ? trimmed.split(/\r?\n/).flatMap((line) => {
          try {
            const parsed = JSON.parse(line) as unknown;
            return isRecord(parsed) ? [parsed] : [];
          } catch {
            return [];
          }
        })
      : [];
    const header = rows.find((row) => row.type === 'trace_start');
    const entries = rows.filter(isTraceEntry) as WorkbenchTraceEntry[];
    if (header || entries.length > 0) {
      return {
        schemaVersion: 1,
        caseName: isRecord(header) && typeof header.caseName === 'string' ? header.caseName : fallback.caseName,
        model: isRecord(header) && typeof header.model === 'string' ? header.model : fallback.model,
        startedAt: isRecord(header) && typeof header.startedAt === 'string' ? header.startedAt : fallback.startedAt,
        endedAt: isRecord(header) && typeof header.endedAt === 'string' ? header.endedAt : fallback.endedAt,
        entries,
      };
    }
  } catch {
    // Grade results should still be written if trace persistence failed.
  }

  return { ...fallback, entries: [] };
}

function isTraceEntry(value: Record<string, unknown>): boolean {
  return value.type === 'message' || value.type === 'tool_call' || value.type === 'tool_result';
}

function summarizeContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }

  const text = content
    .flatMap((item) => isRecord(item) && typeof item.text === 'string' ? [item.text] : [])
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 160 ? `${text.slice(0, 157)}...` : text || undefined;
}

function logAgentEvent(event: unknown): void {
  if (!isRecord(event) || typeof event.type !== 'string') {
    return;
  }

  if (event.type === 'message_end' && isRecord(event.message)) {
    const role = typeof event.message.role === 'string' ? event.message.role : 'unknown';
    const text = summarizeContent(event.message.content);
    console.log(`[agent:${event.type}] ${role}${text ? `: ${text}` : ''}`);
    return;
  }

  if (event.type === 'tool_execution_start') {
    const name = typeof event.toolName === 'string' ? event.toolName : 'unknown';
    const args = event.args === undefined ? '' : ` ${JSON.stringify(event.args)}`;
    console.log(`[agent:${event.type}] ${name}${args}`);
    return;
  }

  if (event.type === 'tool_execution_end') {
    const name = typeof event.toolName === 'string' ? event.toolName : 'unknown';
    const status = event.isError === true ? 'error' : 'ok';
    console.log(`[agent:${event.type}] ${name} ${status}`);
    return;
  }

  if (event.type === 'turn_start' || event.type === 'turn_end' || event.type === 'agent_start' || event.type === 'agent_end') {
    console.log(`[agent:${event.type}]`);
  }
}

function logAgentSystemPrompt(systemPrompt: string): void {
  console.log('[agent:system_prompt_start]');
  console.log(systemPrompt);
  console.log('[agent:system_prompt_end]');
}

async function runAgentMode(parsed: AgentRunnerArgs): Promise<number> {
  const resultPath = join(parsed.resultsDir, 'result.json');
  const tracePath = join(parsed.resultsDir, 'trace.jsonl');
  let session: PromptSession | undefined;
  let recorder: TraceRecorder | undefined;
  let startedAt: string | undefined;

  mkdirSync(parsed.resultsDir, { recursive: true });
  process.env.WORK = parsed.workDir;
  process.env.RESULTS = parsed.resultsDir;

  try {
    startedAt = new Date().toISOString();
    const created = await createWorkbenchPiSession({
      cwd: parsed.workDir,
      modelRef: parsed.model,
      apiKeyEnv: 'OPENROUTER_API_KEY',
      appendSystemPrompt: parsed.appendSystemPrompt,
    });
    session = created.session as PromptSession;
    const systemPrompt = typeof session.systemPrompt === 'string'
      ? session.systemPrompt
      : buildAgentSystemPrompt();
    logAgentSystemPrompt(systemPrompt);
    recorder = createTraceRecorder();
    const unsubscribe = session.subscribe?.((event) => {
      recorder?.record(event);
      logAgentEvent(event);
    });

    try {
      await runAgentPromptWithTimeout(session, parsed.task, parsed.timeoutSeconds);
    } finally {
      unsubscribe?.();
    }

    const endedAt = new Date().toISOString();
    const trace = recorder.toTrace({
      caseName: parsed.caseName,
      model: parsed.model,
      startedAt,
      endedAt,
      messages: session.state?.messages ?? [],
    });
    trace.entries.unshift({
      type: 'message',
      role: 'system',
      text: systemPrompt,
      timestamp: startedAt,
    });

    writeTraceFile(tracePath, trace);
    return 0;
  } catch (error) {
    const endedAt = new Date().toISOString();
    try {
      writeBestEffortTrace({
        tracePath,
        caseName: parsed.caseName,
        model: parsed.model,
        startedAt,
        endedAt,
        session,
        recorder,
      });
    } catch {
      // Fatal result writing is more important than partial trace persistence.
    }
    writeJsonFile(resultPath, {
      caseName: parsed.caseName,
      model: parsed.model,
      endedAt,
      ...buildFatalGrade(error),
      error: error instanceof Error ? error.message : String(error),
    });
    return 1;
  }
}

async function runSetupMode(parsed: SetupRunnerArgs): Promise<number> {
  const resolved = loadWorkbenchCase(parsed.casePath);
  const env = buildContainerWorkbenchEnv({
    casePath: parsed.casePath,
    workDir: parsed.workDir,
    resultsDir: '/tmp/workbench-setup-results',
  });
  const errors = await runSetupCommands(resolved.setup, { cwd: parsed.workDir, env });
  if (errors.length > 0) {
    console.error(errors.join('\n\n---\n\n'));
    return 1;
  }
  return 0;
}

async function runGradeMode(parsed: GradeRunnerArgs): Promise<number> {
  const resultPath = join(parsed.resultsDir, 'result.json');
  const tracePath = join(parsed.resultsDir, 'trace.jsonl');
  const cleanupErrorPath = join(parsed.resultsDir, 'cleanup-error.txt');
  const resolved = loadWorkbenchCase(parsed.casePath);
  const env = buildContainerWorkbenchEnv(parsed);
  const now = new Date().toISOString();
  const trace = readTraceFile(tracePath, {
    caseName: resolved.name,
    model: resolved.model,
    startedAt: now,
    endedAt: now,
  });

  try {
    const grade = await runGraderCommands(resolved.graders, {
      cwd: parsed.workDir,
      env,
      timeoutSeconds: 120,
    });
    preserveArtifacts(resolved.artifacts, parsed.workDir, parsed.resultsDir);

    const result = buildResult({
      caseName: resolved.name,
      model: resolved.model,
      startedAt: trace.startedAt,
      endedAt: new Date().toISOString(),
      grade: {
        ...grade,
        metrics: buildWorkbenchMetrics(trace),
      },
    });

    writeJsonFile(resultPath, result);
    await runCleanupCommands(resolved.cleanup, { cwd: parsed.workDir, env }, cleanupErrorPath);
    return grade.pass ? 0 : 1;
  } catch (error) {
    writeJsonFile(resultPath, {
      caseName: resolved.name,
      model: resolved.model,
      endedAt: new Date().toISOString(),
      ...buildFatalGrade(error),
      error: error instanceof Error ? error.message : String(error),
    });
    return 1;
  }
}

export async function runContainerWorkbenchCase(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (parsed.mode === 'agent') {
    return runAgentMode(parsed);
  }
  if (parsed.mode === 'setup') {
    return runSetupMode(parsed);
  }
  return runGradeMode(parsed);
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
