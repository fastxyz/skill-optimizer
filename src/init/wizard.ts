import * as p from '@clack/prompts';
import { resolve } from 'node:path';
import type { WizardAnswers } from './answers.js';
import { scaffoldInit } from './scaffold.js';

// All values use OpenRouter model IDs (openrouter/provider/model).
// Ordered by OpenRouter weekly token volume (top 20).
export const MODEL_PRESETS = [
  // DeepSeek
  { value: 'openrouter/deepseek/deepseek-v3.2',            label: 'DeepSeek V3.2          · DeepSeek',  hint: '#1' },
  // Anthropic
  { value: 'openrouter/anthropic/claude-opus-4.6',         label: 'Claude Opus 4.6        · Anthropic', hint: 'flagship' },
  { value: 'openrouter/anthropic/claude-sonnet-4.6',       label: 'Claude Sonnet 4.6      · Anthropic' },
  // MiniMax
  { value: 'openrouter/minimax/minimax-m2.7',              label: 'MiniMax M2.7           · MiniMax',   hint: 'flagship' },
  { value: 'openrouter/minimax/minimax-m2.5',              label: 'MiniMax M2.5           · MiniMax' },
  // Google
  { value: 'openrouter/google/gemini-3-flash-preview',     label: 'Gemini 3 Flash Preview · Google',    hint: 'fast' },
  { value: 'openrouter/google/gemini-3.1-pro-preview',     label: 'Gemini 3.1 Pro Preview · Google',    hint: 'flagship' },
  { value: 'openrouter/google/gemini-2.5-flash',           label: 'Gemini 2.5 Flash       · Google',    hint: 'fast' },
  { value: 'openrouter/google/gemini-2.5-flash-lite',      label: 'Gemini 2.5 Flash Lite  · Google',    hint: 'fast' },
  { value: 'openrouter/google/gemma-4-31b-it',             label: 'Gemma 4 31B-it         · Google',    hint: 'open' },
  // Qwen
  { value: 'openrouter/qwen/qwen3.5-397b-a17b',            label: 'Qwen3.5 397B A17B      · Alibaba',   hint: 'MoE' },
  { value: 'openrouter/qwen/qwen3.6-plus',                 label: 'Qwen 3.6 Plus          · Alibaba',   hint: 'open' },
  // Xiaomi
  { value: 'openrouter/xiaomi/mimo-v2-pro',                label: 'MiMo-V2-Pro            · Xiaomi' },
  // Nvidia
  { value: 'openrouter/nvidia/nemotron-3-super-120b-a12b', label: 'Nemotron 3 Super 120B  · Nvidia',    hint: 'open' },
  // Moonshot
  { value: 'openrouter/moonshotai/kimi-k2.5',              label: 'Kimi K2.5              · Moonshot',  hint: 'flagship' },
  // xAI
  { value: 'openrouter/x-ai/grok-4.1-fast',               label: 'Grok 4.1 Fast          · xAI' },
  // OpenAI
  { value: 'openrouter/openai/gpt-5.4',                    label: 'GPT-5.4                · OpenAI',    hint: 'flagship' },
  { value: 'openrouter/openai/gpt-4o-mini',                label: 'GPT-4o Mini            · OpenAI',    hint: 'fast' },
  { value: 'openrouter/openai/gpt-oss-120b',               label: 'GPT-OSS 120B           · OpenAI',    hint: 'open' },
  // Meta
  { value: 'openrouter/meta-llama/llama-4-maverick',       label: 'Llama 4 Maverick       · Meta',      hint: 'open' },
  // Z-AI
  { value: 'openrouter/z-ai/glm-5',                        label: 'GLM 5                  · Z-AI' },
  { value: 'openrouter/z-ai/glm-5.1',                      label: 'GLM 5.1                · Z-AI',      hint: 'new' },
  { value: 'openrouter/z-ai/glm-5-turbo',                  label: 'GLM 5 Turbo            · Z-AI',      hint: 'fast' },
];

function cancelGuard<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }
  return value as T;
}

export async function runWizard(cwd: string, preseed?: Partial<WizardAnswers>): Promise<void> {
  p.intro('skill-optimizer init');

  // 1. Surface
  let surface: 'sdk' | 'cli' | 'mcp' | 'prompt';
  if (preseed?.surface) {
    surface = preseed.surface;
    p.log.info(`Surface: ${surface}`);
  } else {
    surface = cancelGuard(await p.select({
      message: 'What surface are you targeting?',
      options: [
        { value: 'sdk', label: 'sdk', hint: 'TypeScript / Python / Rust library' },
        { value: 'cli', label: 'cli', hint: 'command-line tool with subcommands' },
        { value: 'mcp', label: 'mcp', hint: 'MCP server with tools' },
        { value: 'prompt', label: 'prompt', hint: 'markdown skill/prompt file' },
      ],
    }) as 'sdk' | 'cli' | 'mcp' | 'prompt');
  }

  // 2. Target repo path
  const repoPathRaw = cancelGuard(await p.text({
    message: 'Target repo path (absolute):',
    defaultValue: preseed?.repoPath ?? cwd,
    placeholder: preseed?.repoPath ?? cwd,
    validate: (v) => (v !== undefined && v.trim().length === 0 ? 'Required — enter the absolute path to your project' : undefined),
  }) as string);
  const repoPath = resolve(repoPathRaw.trim() || preseed?.repoPath || cwd);

  // 3. Entry file (cli / mcp only) — grouped with paths
  let entryFile: string | undefined;
  if (surface === 'cli' || surface === 'mcp') {
    const message = surface === 'cli'
      ? 'Absolute path to CLI entry file or binary (leave blank to skip auto-extraction):'
      : 'Absolute path to MCP server entry file (leave blank to skip auto-extraction):';
    const defaultEntry = surface === 'cli' ? 'src/cli.ts' : 'src/server.ts';
    const defaultEntryAbs = preseed?.entryFile
      ? resolve(preseed.entryFile.startsWith('/') ? preseed.entryFile : resolve(repoPath, preseed.entryFile))
      : resolve(repoPath, defaultEntry);
    const raw = cancelGuard(await p.text({ message, placeholder: defaultEntryAbs, defaultValue: defaultEntryAbs }) as string);
    const rawTrimmed = raw.trim();
    entryFile = rawTrimmed
      ? (rawTrimmed.startsWith('/') ? rawTrimmed : resolve(repoPath, rawTrimmed))
      : undefined;
  }

  // 4. SKILL.md path
  const defaultSkillPath = preseed?.skillPath
    ? resolve(preseed.skillPath.startsWith('/') ? preseed.skillPath : resolve(repoPath, preseed.skillPath))
    : resolve(repoPath, 'SKILL.md');
  const skillPathRaw = cancelGuard(await p.text({
    message: 'Absolute path to your SKILL.md:',
    placeholder: defaultSkillPath,
    defaultValue: defaultSkillPath,
  }) as string);
  const skillPathTrimmed = skillPathRaw.trim();
  const skillPath = skillPathTrimmed
    ? (skillPathTrimmed.startsWith('/') ? skillPathTrimmed : resolve(repoPath, skillPathTrimmed))
    : defaultSkillPath;

  // 5. Models (multi-select)
  const selectedPresets = cancelGuard(await p.multiselect({
    message: 'Which models to benchmark? (space to toggle, enter to confirm)',
    options: MODEL_PRESETS,
    required: true,
    initialValues: ['openrouter/anthropic/claude-sonnet-4.6', 'openrouter/deepseek/deepseek-v3.2', 'openrouter/google/gemini-2.5-flash'],
  }) as string[]);
  const models: string[] = selectedPresets;

  // Optional custom model
  const customModel = cancelGuard(await p.text({
    message: 'Add a custom model ID? (leave blank to skip)',
    placeholder: 'openrouter/provider/model-name',
    validate: (v) => {
      if (!v || !v.trim()) return undefined;
      if (!v.startsWith('openrouter/')) return 'Must start with openrouter/';
      return undefined;
    },
  }) as string);
  if (customModel.trim()) models.push(customModel.trim());

  // 6. Max tasks
  const maxTasksRaw = cancelGuard(await p.text({
    message: 'Max tasks to generate per benchmark run:',
    defaultValue: '20',
    placeholder: '20',
    validate: (v) => {
      const n = parseInt(v ?? '', 10);
      if (isNaN(n) || n < 1) return 'Must be a positive integer';
      return undefined;
    },
  }) as string);
  const maxTasks = parseInt(maxTasksRaw || '20', 10);

  // 7. Max iterations
  const maxIterationsRaw = cancelGuard(await p.text({
    message: 'Max optimize iterations:',
    defaultValue: '5',
    placeholder: '5',
    validate: (v) => {
      const n = parseInt(v ?? '', 10);
      if (isNaN(n) || n < 1) return 'Must be a positive integer';
      return undefined;
    },
  }) as string);
  const maxIterations = parseInt(maxIterationsRaw || '5', 10);

  // 8. Target pass rate
  const targetPassRateRaw = cancelGuard(await p.text({
    message: 'Target pass rate to stop optimization early (%):',
    defaultValue: '80',
    placeholder: '80',
    validate: (v) => {
      const n = parseFloat(v ?? '');
      if (isNaN(n) || n < 1 || n > 100) return 'Must be a number between 1 and 100';
      return undefined;
    },
  }) as string);
  const targetPassRate = parseFloat(targetPassRateRaw || '80') / 100;

  const answers: WizardAnswers = { surface, repoPath, models, maxTasks, maxIterations, targetPassRate, skillPath, entryFile, name: preseed?.name };

  const spinner = p.spinner();
  spinner.start('Scaffolding...');
  try {
    await scaffoldInit(answers, cwd);
    spinner.stop('Done!');
  } catch (err) {
    spinner.stop('Error during scaffolding');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  p.outro('Config written. Next: skill-optimizer optimize --config ./.skill-optimizer/skill-optimizer.json');
}
