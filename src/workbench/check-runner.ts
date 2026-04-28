import { runShellCommand } from './process.js';
import type { ProcessResult } from './process.js';
import type { WorkbenchGrade, WorkbenchGraderConfig, WorkbenchGraderResult } from './types.js';

function parseFirstJsonObject(stdout: string): Record<string, unknown> | null {
  const firstBrace = stdout.indexOf('{');
  const lastBrace = stdout.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    const parsed = JSON.parse(stdout.slice(firstBrace, lastBrace + 1));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeEvidence(evidence: unknown): string[] {
  if (Array.isArray(evidence)) {
    return evidence.map((value) => String(value));
  }

  if (typeof evidence === 'string') {
    return [evidence];
  }

  if (evidence === undefined || evidence === null) {
    return [];
  }

  return [String(evidence)];
}

function clampScore(score: unknown, pass: boolean): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return pass ? 1 : 0;
  }

  return Math.max(0, Math.min(1, score));
}

export function normalizeCheckResult(result: ProcessResult): WorkbenchGrade {
  if (result.timedOut === true) {
    const json = parseFirstJsonObject(result.stdout);
    const evidence = ['check command timed out'];
    if (json !== null) {
      evidence.push(...normalizeEvidence(json.evidence));
    } else if (result.stdout.trim().length > 0) {
      evidence.push(result.stdout.trim());
    }
    if (result.stderr.trim().length > 0) {
      evidence.push(result.stderr.trim());
    }

    return {
      pass: false,
      score: 0,
      evidence,
    };
  }

  const json = parseFirstJsonObject(result.stdout);
  if (json !== null) {
    const pass =
      typeof json.pass === 'boolean' ? json.pass : result.exitCode === 0;
    const score = clampScore(json.score, pass);
    const evidence = normalizeEvidence(json.evidence);

    return {
      pass,
      score,
      evidence,
    };
  }

  if (result.exitCode === 0) {
    return {
      pass: true,
      score: 1,
      evidence: result.stdout.trim().length > 0 ? [result.stdout.trim()] : [],
    };
  }

  const evidence: string[] = [];
  if (result.stderr.trim().length > 0) {
    evidence.push(result.stderr.trim());
  }

  if (result.stdout.trim().length > 0) {
    evidence.push(result.stdout.trim());
  }

  return {
    pass: false,
    score: 0,
    evidence,
  };
}

export async function runCheckCommand(
  command: string,
  opts: { cwd: string; env?: NodeJS.ProcessEnv; timeoutSeconds?: number },
): Promise<WorkbenchGrade> {
  const processResult = await runShellCommand(command, opts);
  return normalizeCheckResult(processResult);
}

export async function runGraderCommands(
  graders: WorkbenchGraderConfig[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; timeoutSeconds?: number },
): Promise<WorkbenchGrade> {
  const results: WorkbenchGraderResult[] = [];

  for (const grader of graders) {
    const grade = await runCheckCommand(grader.command, opts);
    results.push({
      ...grade,
      name: grader.name,
      command: grader.command,
    });
  }

  const passed = results.filter((result) => result.pass).length;
  const evidence = results.flatMap((result) => {
    if (result.evidence.length === 0) {
      return [`${result.name}: ${result.pass ? 'PASS' : 'FAIL'}`];
    }

    return result.evidence.map((line) => `${result.name}: ${line}`);
  });

  return {
    pass: passed === results.length,
    score: results.length === 0 ? 0 : passed / results.length,
    evidence,
    graders: results,
  };
}
