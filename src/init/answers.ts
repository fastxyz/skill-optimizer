import { readFileSync } from 'node:fs';

export interface WizardAnswers {
  surface: 'sdk' | 'cli' | 'mcp';
  repoPath: string;
  models: string[];
  maxTasks: number;
  maxIterations: number;
  /** Target overall pass rate (0–1) at which optimization stops early. Default: 0.8 */
  targetPassRate?: number;
  /** Path to SKILL.md, relative to repoPath (default: SKILL.md) */
  skillPath?: string;
  /** For cli/mcp: path to entry file or binary (relative to repoPath or absolute) */
  entryFile?: string;
  name?: string;
}

const DEFAULT_MODELS = [
  'openrouter/openai/gpt-4o',
  'openrouter/google/gemini-2.0-flash-001',
];

export function buildDefaultAnswers(surface: 'sdk' | 'cli' | 'mcp' = 'sdk', repoPath?: string): WizardAnswers {
  return {
    surface,
    repoPath: repoPath ?? process.cwd(),
    models: DEFAULT_MODELS,
    maxTasks: 20,
    maxIterations: 5,
    targetPassRate: 0.8,
  };
}

export function readAnswersFile(filePath: string): WizardAnswers {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<WizardAnswers>;
  if (!raw.surface || !['sdk', 'cli', 'mcp'].includes(raw.surface)) {
    throw new Error(`answers file must have surface: sdk | cli | mcp (got: ${JSON.stringify(raw.surface)})`);
  }
  if (!raw.repoPath) {
    throw new Error('answers file must have repoPath');
  }
  if (!Array.isArray(raw.models) || raw.models.length === 0) {
    throw new Error('answers file must have at least one model (as a JSON array)');
  }
  return {
    surface: raw.surface,
    repoPath: raw.repoPath,
    models: raw.models,
    maxTasks: raw.maxTasks ?? 20,
    maxIterations: raw.maxIterations ?? 5,
    targetPassRate: raw.targetPassRate ?? 0.8,
    skillPath: raw.skillPath,
    entryFile: raw.entryFile,
    name: raw.name,
  };
}
