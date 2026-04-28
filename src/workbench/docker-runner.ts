import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stringify as stringifyYaml } from 'yaml';

import { loadWorkbenchCase } from './case-loader.js';
import { runShellCommand } from './process.js';
import type { ResolvedWorkbenchCase, WorkbenchCaseConfig } from './types.js';
import { timestampSlug } from './utils.js';

const DEFAULT_WORKBENCH_IMAGE = 'skill-optimizer-workbench:local';

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
  if (params.source.artifacts.length > 0) {
    bundled.artifacts = [...params.source.artifacts];
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
    tracePath: join(resultsDir, 'trace.json'),
    summaryPath: join(resultsDir, 'trial-summary.json'),
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

export async function runDockerWorkbenchCase(
  options: RunDockerWorkbenchCaseOptions,
): Promise<DockerWorkbenchRunResult> {
  const repoRoot = packageRootFromModuleUrl(import.meta.url);
  const image = options.image ?? DEFAULT_WORKBENCH_IMAGE;
  const resolvedCase = resolveDockerWorkbenchCase(options);
  const prepared = prepareDockerWorkbenchRun({ ...options, case: resolvedCase });

  try {
    await ensureDockerImage(image, repoRoot);

    const envArgs = resolvedCase.env
      .filter((name) => process.env[name] !== undefined)
      .map((name) => `-e ${name}`)
      .join(' ');

    const dockerRun = await runShellCommand(
      [
        'docker run --rm',
        `-v ${shellQuote(`${prepared.caseDir}:/case:ro`)}`,
        `-v ${shellQuote(`${prepared.workDir}:/work:rw`)}`,
        `-v ${shellQuote(`${prepared.resultsDir}:/results:rw`)}`,
        envArgs,
        shellQuote(image),
        '--case /case/case.yml',
        '--work /work',
        '--results /results',
      ].filter(Boolean).join(' '),
      { cwd: repoRoot },
    );

    if (dockerRun.exitCode !== 0 && !existsSync(prepared.resultPath)) {
      throw new Error([
        'Docker run failed',
        dockerRun.stdout.trim(),
        dockerRun.stderr.trim(),
      ].filter(Boolean).join('\n\n'));
    }

    if (options.keepWorkspace) {
      const workspacePath = join(prepared.resultsDir, 'workspace');
      rmSync(workspacePath, { recursive: true, force: true });
      cpSync(prepared.workDir, workspacePath, { recursive: true });
      return { ...prepared, workspacePath };
    }

    return prepared;
  } finally {
    prepared.cleanup();
  }
}
