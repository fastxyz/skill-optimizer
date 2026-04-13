import * as p from '@clack/prompts';
import { resolve } from 'node:path';
import type { WizardAnswers } from './answers.js';
import { scaffoldInit } from './scaffold.js';

export const MODEL_PRESETS = [
  { value: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6  · Anthropic', hint: 'recommended' },
  { value: 'anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5   · Anthropic', hint: 'fast' },
  { value: 'openrouter/openai/gpt-4o', label: 'GPT-4o             · OpenAI' },
  { value: 'openrouter/openai/gpt-4o-mini', label: 'GPT-4o Mini        · OpenAI', hint: 'fast' },
  { value: 'openrouter/google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro     · Google' },
  { value: 'openrouter/google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash   · Google', hint: 'fast' },
  { value: 'openrouter/meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B      · Meta', hint: 'open' },
  { value: 'openrouter/mistralai/mistral-large-2411', label: 'Mistral Large      · Mistral' },
  { value: 'openrouter/deepseek/deepseek-chat', label: 'DeepSeek Chat      · DeepSeek', hint: 'open' },
  { value: 'openrouter/qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B       · Alibaba', hint: 'open' },
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
  let surface: 'sdk' | 'cli' | 'mcp';
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
      ],
    }) as 'sdk' | 'cli' | 'mcp');
  }

  // 2. Target repo path
  const repoPathRaw = cancelGuard(await p.text({
    message: 'Target repo path (absolute):',
    defaultValue: preseed?.repoPath ?? cwd,
    placeholder: preseed?.repoPath ?? cwd,
    validate: (v) => (v !== undefined && v.trim().length === 0 ? 'Required — enter the absolute path to your project' : undefined),
  }) as string);
  const repoPath = resolve(repoPathRaw.trim() || preseed?.repoPath || cwd);

  // 3. Models (multi-select)
  const selectedPresets = cancelGuard(await p.multiselect({
    message: 'Which models to benchmark? (space to toggle, enter to confirm)',
    options: MODEL_PRESETS,
    required: true,
    initialValues: ['anthropic/claude-sonnet-4-6', 'openrouter/google/gemini-2.0-flash-001'],
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

  // 4. Max tasks
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

  // 5. Max iterations
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

  // 6. Entry file (cli / mcp only)
  let entryFile: string | undefined;
  if (surface === 'cli' || surface === 'mcp') {
    const message = surface === 'cli'
      ? 'Path to CLI entry file or binary (relative to repo, leave blank to skip):'
      : 'Path to MCP server entry file (relative to repo, leave blank to skip):';
    const placeholder = surface === 'cli' ? 'src/cli.ts' : 'src/server.ts';
    const raw = cancelGuard(await p.text({ message, placeholder, defaultValue: preseed?.entryFile }) as string);
    entryFile = raw.trim() || preseed?.entryFile || undefined;
  }

  const answers: WizardAnswers = { surface, repoPath, models, maxTasks, maxIterations, entryFile, name: preseed?.name };

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

  p.outro('Config written. Next: skill-optimizer run --config ./skill-optimizer/skill-optimizer.json');
}
