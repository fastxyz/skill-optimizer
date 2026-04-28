import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stringify as stringifyYaml } from 'yaml';

import { loadWorkbenchCase } from './case-loader.js';
import { runShellCommand } from './process.js';
import type { ResolvedWorkbenchCase, WorkbenchCaseConfig } from './types.js';
import { timestampSlug } from './utils.js';
import { prepareWorkbenchDirectory } from './workspace.js';

const DEFAULT_WORKBENCH_IMAGE = 'skill-optimizer-workbench:local';
const AGENT_RESULTS_DIR = '/tmp/workbench-results';
const AGENT_PATH = '/work/bin:/work/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

export function packageRootFromModuleUrl(moduleUrl: string): string {
  return dirname(dirname(dirname(fileURLToPath(moduleUrl))));
}

export interface RunDockerWorkbenchCaseOptions {
  casePath?: string;
  case?: ResolvedWorkbenchCase;
  outDir?: string;
  resultsDir?: string;
  model?: string;
  image?: string;
  keepWorkspace?: boolean;
  appendSystemPrompt?: string;
}

export interface DockerWorkbenchRunResult {
  tempDir: string;
  caseDir: string;
  bundledCasePath: string;
  workDir: string;
  resultsDir: string;
  resultPath: string;
  tracePath: string;
  summaryPath?: string;
  workspacePath?: string;
  cleanup: () => void;
}

export interface PrepareDockerWorkbenchRunOptions {
  casePath?: string;
  case?: ResolvedWorkbenchCase;
  outDir?: string;
  resultsDir?: string;
  model?: string;
  now?: Date;
  tempRoot?: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function dockerSandboxFlags(): string[] {
  return [
    '--cap-drop=ALL',
    '--security-opt no-new-privileges',
    '--pids-limit 512',
  ];
}

function dockerCacheEnvFlags(): string[] {
  return [
    '-e XDG_CACHE_HOME=/work/.cache',
    '-e PIP_CACHE_DIR=/work/.cache/pip',
    '-e NPM_CONFIG_CACHE=/work/.cache/npm',
  ];
}

export function buildDockerAgentCommand(params: {
  image: string;
  containerName: string;
  workDir: string;
  caseName: string;
  model: string;
  task: string;
  appendSystemPrompt?: string;
  timeoutSeconds: number;
  envNames: string[];
}): string {
  const envArgs = params.envNames.map((name) => `-e ${name}`).join(' ');
  const taskBase64 = Buffer.from(params.task, 'utf-8').toString('base64');
  const appendSystemPromptBase64 = params.appendSystemPrompt
    ? Buffer.from(params.appendSystemPrompt, 'utf-8').toString('base64')
    : undefined;
  return [
    'docker run',
    `--name ${shellQuote(params.containerName)}`,
    ...dockerSandboxFlags(),
    '--workdir /work',
    `-e PATH=${AGENT_PATH}`,
    ...dockerCacheEnvFlags(),
    `-v ${shellQuote(`${params.workDir}:/work:rw`)}`,
    envArgs,
    shellQuote(params.image),
    '--agent',
    '--work /work',
    `--results ${AGENT_RESULTS_DIR}`,
    `--case-name ${shellQuote(params.caseName)}`,
    `--model ${shellQuote(params.model)}`,
    `--timeout-seconds ${params.timeoutSeconds}`,
    `--task-base64 ${shellQuote(taskBase64)}`,
    appendSystemPromptBase64
      ? `--append-system-prompt-base64 ${shellQuote(appendSystemPromptBase64)}`
      : '',
  ].filter(Boolean).join(' ');
}

export function buildDockerSetupCommand(params: {
  image: string;
  caseDir: string;
  workDir: string;
  envNames: string[];
}): string {
  const envArgs = params.envNames.map((name) => `-e ${name}`).join(' ');
  return [
    'docker run --rm',
    ...dockerSandboxFlags(),
    '--workdir /work',
    ...dockerCacheEnvFlags(),
    `-v ${shellQuote(`${params.caseDir}:/case:ro`)}`,
    `-v ${shellQuote(`${params.workDir}:/work:rw`)}`,
    envArgs,
    shellQuote(params.image),
    '--setup',
    '--case /case/case.yml',
    '--work /work',
  ].filter(Boolean).join(' ');
}

function agentContainerName(tempDir: string): string {
  return `skill-optimizer-agent-${tempDir.split('/').pop() ?? 'run'}`;
}

async function copyAgentResults(containerName: string, resultsDir: string, repoRoot: string): Promise<void> {
  const copy = await runShellCommand(
    `docker cp ${shellQuote(`${containerName}:${AGENT_RESULTS_DIR}/.`)} ${shellQuote(resultsDir)}`,
    { cwd: repoRoot },
  );

  if (copy.exitCode !== 0) {
    throw new Error([
      'Failed to copy agent results from Docker container',
      copy.stdout.trim(),
      copy.stderr.trim(),
    ].filter(Boolean).join('\n\n'));
  }
}

async function removeContainer(containerName: string, repoRoot: string): Promise<void> {
  await runShellCommand(`docker rm -f ${shellQuote(containerName)}`, { cwd: repoRoot });
}

export function buildDockerGradeCommand(params: {
  image: string;
  caseDir: string;
  workDir: string;
  resultsDir: string;
  envNames: string[];
}): string {
  const envArgs = params.envNames.map((name) => `-e ${name}`).join(' ');
  return [
    'docker run --rm',
    ...dockerSandboxFlags(),
    '--workdir /work',
    ...dockerCacheEnvFlags(),
    `-v ${shellQuote(`${params.caseDir}:/case:ro`)}`,
    `-v ${shellQuote(`${params.workDir}:/work:rw`)}`,
    `-v ${shellQuote(`${params.resultsDir}:/results:rw`)}`,
    envArgs,
    shellQuote(params.image),
    '--grade',
    '--case /case/case.yml',
    '--work /work',
    '--results /results',
  ].filter(Boolean).join(' ');
}

function buildBundledCaseFile(params: {
  source: ReturnType<typeof loadWorkbenchCase>;
  modelOverride?: string;
}): WorkbenchCaseConfig {
  const bundled: WorkbenchCaseConfig = {
    name: params.source.name,
    references: './references',
    task: params.source.task,
    graders: params.source.graders.map((grader) => ({ ...grader })),
    model: params.modelOverride ?? params.source.model,
    timeoutSeconds: params.source.timeoutSeconds,
  };

  if (params.source.env.length > 0) {
    bundled.env = [...params.source.env];
  }
  if (params.source.setup.length > 0) {
    bundled.setup = [...params.source.setup];
  }
  if (params.source.cleanup.length > 0) {
    bundled.cleanup = [...params.source.cleanup];
  }

  return bundled;
}

function copyDirectoryContents(sourceDir: string, destinationDir: string): void {
  mkdirSync(destinationDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    cpSync(join(sourceDir, entry), join(destinationDir, entry), { recursive: true });
  }
}

function copyCaseSupportDir(sourceCaseDir: string, bundledCaseDir: string, name: string): void {
  const sourceDir = join(sourceCaseDir, name);
  if (!existsSync(sourceDir)) {
    return;
  }

  const destinationDir = join(bundledCaseDir, name);
  rmSync(destinationDir, { recursive: true, force: true });
  cpSync(sourceDir, destinationDir, { recursive: true });
}

function copyCaseSupportDirs(sourceCaseDir: string, bundledCaseDir: string): void {
  for (const name of ['checks', 'fixtures', 'bin', 'workspace']) {
    copyCaseSupportDir(sourceCaseDir, bundledCaseDir, name);
  }
}

function copyAgentSupportDirs(sourceCaseDir: string, workDir: string): void {
  copyCaseSupportDir(sourceCaseDir, workDir, 'bin');
}

function resolveDockerWorkbenchCase(options: { casePath?: string; case?: ResolvedWorkbenchCase }): ResolvedWorkbenchCase {
  if (options.case) {
    return options.case;
  }
  if (options.casePath) {
    return loadWorkbenchCase(options.casePath);
  }
  throw new Error('Workbench Docker run requires a casePath or inline case');
}

export function prepareDockerWorkbenchRun(
  options: PrepareDockerWorkbenchRunOptions,
): DockerWorkbenchRunResult {
  const resolvedCase = resolveDockerWorkbenchCase(options);
  const resultsBase = resolve(options.outDir ?? join(resolvedCase.configDir, '.results'));
  const resultsDir = options.resultsDir
    ? resolve(options.resultsDir)
    : join(resultsBase, timestampSlug(options.now ?? new Date()));
  const tempRoot = resolve(options.tempRoot ?? tmpdir());
  mkdirSync(tempRoot, { recursive: true });
  const tempDir = mkdtempSync(join(tempRoot, 'skill-optimizer-workbench-'));
  const caseDir = join(tempDir, 'case');
  const referencesDir = join(caseDir, 'references');
  const bundledCasePath = join(caseDir, 'case.yml');
  const workDir = join(tempDir, 'work');

  mkdirSync(referencesDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });
  mkdirSync(resultsDir, { recursive: true });

  copyDirectoryContents(resolvedCase.referencesDir, referencesDir);
  copyCaseSupportDirs(resolvedCase.configDir, caseDir);
  prepareWorkbenchDirectory({
    referencesDir: resolvedCase.referencesDir,
    workspaceDir: join(resolvedCase.configDir, 'workspace'),
    workDir,
  });
  copyAgentSupportDirs(resolvedCase.configDir, workDir);

  const bundledCase = buildBundledCaseFile({
    source: resolvedCase,
    modelOverride: options.model,
  });
  writeFileSync(bundledCasePath, `${stringifyYaml(bundledCase)}`, 'utf-8');

  return {
    tempDir,
    caseDir,
    bundledCasePath,
    workDir,
    resultsDir,
    resultPath: join(resultsDir, 'result.json'),
    tracePath: join(resultsDir, 'trace.jsonl'),
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

async function ensureDockerImage(image: string, repoRoot: string): Promise<void> {
  const inspect = await runShellCommand(`docker image inspect ${shellQuote(image)}`, { cwd: repoRoot });
  if (inspect.exitCode === 0) {
    return;
  }

  const dockerfilePath = join(repoRoot, 'docker', 'workbench-runner.Dockerfile');
  if (!existsSync(dockerfilePath)) {
    throw new Error(`Dockerfile not found: ${dockerfilePath}`);
  }

  const build = await runShellCommand(
    `docker build -t ${shellQuote(image)} -f ${shellQuote(dockerfilePath)} .`,
    { cwd: repoRoot },
  );

  if (build.exitCode !== 0) {
    throw new Error([
      `Failed to build Docker image ${image}`,
      build.stdout.trim(),
      build.stderr.trim(),
    ].filter(Boolean).join('\n\n'));
  }
}

function writeFatalResult(params: {
  resultPath: string;
  caseName: string;
  model: string;
  evidence: string[];
}): void {
  writeFileSync(params.resultPath, JSON.stringify({
    caseName: params.caseName,
    model: params.model,
    endedAt: new Date().toISOString(),
    pass: false,
    score: 0,
    evidence: params.evidence,
  }, null, 2), 'utf-8');
}

function readTrialPass(resultPath: string): boolean | undefined {
  try {
    const parsed = JSON.parse(readFileSync(resultPath, 'utf-8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || !('pass' in parsed)) {
      return undefined;
    }
    return Boolean((parsed as { pass?: unknown }).pass);
  } catch {
    return undefined;
  }
}

function copyWorkspaceIfRequested(
  prepared: DockerWorkbenchRunResult,
  keepWorkspace: boolean | undefined,
): DockerWorkbenchRunResult {
  const passed = readTrialPass(prepared.resultPath);
  if (!keepWorkspace && passed !== false) {
    return prepared;
  }

  const workspacePath = join(prepared.resultsDir, 'workspace');
  rmSync(workspacePath, { recursive: true, force: true });
  cpSync(prepared.workDir, workspacePath, { recursive: true });
  return { ...prepared, workspacePath };
}

export async function runDockerWorkbenchCase(
  options: RunDockerWorkbenchCaseOptions,
): Promise<DockerWorkbenchRunResult> {
  const repoRoot = packageRootFromModuleUrl(import.meta.url);
  const image = options.image ?? DEFAULT_WORKBENCH_IMAGE;
  const resolvedCase = resolveDockerWorkbenchCase(options);
  const prepared = prepareDockerWorkbenchRun({ ...options, case: resolvedCase });
  const containerName = agentContainerName(prepared.tempDir);

  try {
    await ensureDockerImage(image, repoRoot);

    const envNames = resolvedCase.env
      .filter((name) => process.env[name] !== undefined)
      .map((name) => name);

    if (resolvedCase.setup.length > 0) {
      const setupCommand = buildDockerSetupCommand({
        image,
        caseDir: prepared.caseDir,
        workDir: prepared.workDir,
        envNames,
      });
      const setupRun = await runShellCommand(setupCommand, { cwd: repoRoot });
      if (setupRun.exitCode !== 0) {
        writeFatalResult({
          resultPath: prepared.resultPath,
          caseName: resolvedCase.name,
          model: options.model ?? resolvedCase.model,
          evidence: [
            'setup failed',
            setupRun.stdout.trim(),
            setupRun.stderr.trim(),
          ].filter(Boolean),
        });
        return copyWorkspaceIfRequested(prepared, true);
      }
    }

    const agentCommand = buildDockerAgentCommand({
      image,
      containerName,
      workDir: prepared.workDir,
      caseName: resolvedCase.name,
      model: options.model ?? resolvedCase.model,
      task: resolvedCase.task,
      appendSystemPrompt: options.appendSystemPrompt,
      timeoutSeconds: resolvedCase.timeoutSeconds,
      envNames,
    });
    const agentRun = await runShellCommand(agentCommand, { cwd: repoRoot });
    await copyAgentResults(containerName, prepared.resultsDir, repoRoot);

    if (agentRun.exitCode !== 0) {
      if (!existsSync(prepared.resultPath)) {
        throw new Error([
        'Docker agent run failed',
        agentRun.stdout.trim(),
        agentRun.stderr.trim(),
      ].filter(Boolean).join('\n\n'));
      }
    } else {
      const gradeCommand = buildDockerGradeCommand({
        image,
        caseDir: prepared.caseDir,
        workDir: prepared.workDir,
        resultsDir: prepared.resultsDir,
        envNames,
      });
      const gradeRun = await runShellCommand(gradeCommand, { cwd: repoRoot });

      if (gradeRun.exitCode !== 0 && !existsSync(prepared.resultPath)) {
        throw new Error([
          'Docker grade run failed',
          gradeRun.stdout.trim(),
          gradeRun.stderr.trim(),
        ].filter(Boolean).join('\n\n'));
      }
    }

    return copyWorkspaceIfRequested(prepared, options.keepWorkspace);
  } finally {
    await removeContainer(containerName, repoRoot);
    prepared.cleanup();
  }
}
