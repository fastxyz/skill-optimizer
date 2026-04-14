import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, resolve, relative, join, basename } from 'node:path';
import type { WizardAnswers } from './answers.js';
import { importCommands } from '../import/index.js';

const KNOWN_MODELS: Record<string, { name: string; tier: 'flagship' | 'mid' | 'low' }> = {
  // DeepSeek
  'openrouter/deepseek/deepseek-v3-2': { name: 'DeepSeek V3.2', tier: 'flagship' },
  // Anthropic
  'openrouter/anthropic/claude-opus-4-6': { name: 'Claude Opus 4.6', tier: 'flagship' },
  'openrouter/anthropic/claude-sonnet-4-6': { name: 'Claude Sonnet 4.6', tier: 'flagship' },
  // MiniMax
  'openrouter/minimax/minimax-m2-7': { name: 'MiniMax M2.7', tier: 'flagship' },
  'openrouter/minimax/minimax-m2-5': { name: 'MiniMax M2.5', tier: 'mid' },
  // Google
  'openrouter/google/gemini-3-flash-preview': { name: 'Gemini 3 Flash Preview', tier: 'mid' },
  'openrouter/google/gemini-3-1-pro-preview': { name: 'Gemini 3.1 Pro Preview', tier: 'flagship' },
  'openrouter/google/gemini-2-5-flash': { name: 'Gemini 2.5 Flash', tier: 'mid' },
  'openrouter/google/gemini-2-5-flash-lite': { name: 'Gemini 2.5 Flash Lite', tier: 'low' },
  'openrouter/google/gemma-4-31b-it': { name: 'Gemma 4 31B-it', tier: 'mid' },
  // Qwen
  'openrouter/qwen/qwen3-5-397b-a17b': { name: 'Qwen3.5 397B A17B', tier: 'flagship' },
  'openrouter/qwen/qwen3-6-plus': { name: 'Qwen 3.6 Plus', tier: 'mid' },
  // Xiaomi
  'openrouter/xiaomi/mimo-v2-pro': { name: 'MiMo-V2-Pro', tier: 'mid' },
  // Nvidia
  'openrouter/nvidia/nemotron-3-super-120b-a12b': { name: 'Nemotron 3 Super 120B', tier: 'mid' },
  // Moonshot
  'openrouter/moonshotai/kimi-k2-5': { name: 'Kimi K2.5', tier: 'flagship' },
  // xAI
  'openrouter/x-ai/grok-4-1-fast': { name: 'Grok 4.1 Fast', tier: 'flagship' },
  // OpenAI
  'openrouter/openai/gpt-5-4': { name: 'GPT-5.4', tier: 'flagship' },
  'openrouter/openai/gpt-4o-mini': { name: 'GPT-4o Mini', tier: 'mid' },
  'openrouter/openai/gpt-oss-120b': { name: 'GPT-OSS 120B', tier: 'mid' },
  // Meta
  'openrouter/meta-llama/llama-4-maverick': { name: 'Llama 4 Maverick', tier: 'mid' },
  // Z-AI
  'openrouter/z-ai/glm-5': { name: 'GLM 5', tier: 'mid' },
  'openrouter/z-ai/glm-5-1': { name: 'GLM 5.1', tier: 'mid' },
  'openrouter/z-ai/glm-5-turbo': { name: 'GLM 5 Turbo', tier: 'low' },
};

function resolveModel(id: string): { id: string; name: string; tier: 'flagship' | 'mid' | 'low' } {
  const known = KNOWN_MODELS[id];
  if (known) return { id, ...known };
  const slug = id.split('/').pop() ?? id;
  const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { id, name, tier: 'mid' };
}


export function buildConfigFromAnswers(answers: WizardAnswers, configDir: string): object {
  const { surface, repoPath, models, maxTasks, maxIterations, name } = answers;
  const targetPassRate = answers.targetPassRate ?? 0.8;
  const projectName = name ?? basename(repoPath);

  // Paths stored in the JSON are relative to configDir so the config is portable
  const relRepo = relative(configDir, repoPath) || '.';
  // skillPath may be absolute (from wizard) or relative to repoPath (from answers file)
  const skillAbsPath = answers.skillPath
    ? (isAbsolute(answers.skillPath) ? answers.skillPath : resolve(repoPath, answers.skillPath))
    : resolve(repoPath, 'SKILL.md');
  // target.skill and discovery.sources are resolved relative to configDir by the loader
  const skillConfigPath = relative(configDir, skillAbsPath);
  // optimize.allowedPaths are validated relative to repoPath (not configDir) by the validator
  const skillAllowedPath = relative(repoPath, skillAbsPath);

  const commonBenchmark = {
    apiKeyEnv: 'OPENROUTER_API_KEY',
    format: 'pi',
    timeout: 240000,
    taskGeneration: { enabled: true, maxTasks, outputDir: '.' },
    models: models.map(resolveModel),
    output: { dir: '../benchmark-results' },
    verdict: { perModelFloor: Math.max(0.5, targetPassRate - 0.2), targetWeightedAverage: targetPassRate },
  };

  const commonOptimize = {
    model: 'openrouter/anthropic/claude-sonnet-4-6',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    allowedPaths: [skillAllowedPath],
    validation: [],
    maxIterations,
  };

  if (surface === 'sdk') {
    return {
      name: projectName,
      target: {
        surface: 'sdk',
        repoPath: relRepo,
        skill: skillConfigPath,
        discovery: { mode: 'auto', sources: [join(relRepo, 'src/index.ts')] },
      },
      benchmark: commonBenchmark,
      optimize: commonOptimize,
    };
  }

  const defaultEntry = surface === 'cli' ? 'src/cli.ts' : 'src/server.ts';
  // entryFile from wizard is now absolute; compute relative to configDir for config JSON
  const entryAbsPath = answers.entryFile
    ? answers.entryFile
    : resolve(repoPath, defaultEntry);
  const entryConfigPath = relative(configDir, entryAbsPath);

  if (surface === 'cli') {
    return {
      name: projectName,
      target: {
        surface: 'cli',
        repoPath: relRepo,
        skill: skillConfigPath,
        discovery: { mode: 'auto', sources: [entryConfigPath] },
        cli: { commands: './cli-commands.json' },
      },
      benchmark: commonBenchmark,
      optimize: commonOptimize,
    };
  }

  // mcp
  return {
    name: projectName,
    target: {
      surface: 'mcp',
      repoPath: relRepo,
      skill: skillConfigPath,
      discovery: { mode: 'auto', sources: [entryConfigPath] },
      mcp: { tools: './tools.json' },
    },
    benchmark: commonBenchmark,
    optimize: commonOptimize,
  };
}

export async function scaffoldInit(answers: WizardAnswers, cwd: string): Promise<void> {
  const generatedDir = resolve(cwd, '.skill-optimizer');
  mkdirSync(generatedDir, { recursive: true });

  const configPath = resolve(generatedDir, 'skill-optimizer.json');
  const configExisted = existsSync(configPath);
  writeFileSync(configPath, JSON.stringify(buildConfigFromAnswers(answers, generatedDir), null, 2) + '\n', 'utf-8');
  console.log(`[init] ${configExisted ? 'Updated' : 'Created'} ${configPath}`);

  // 'extracted' = auto-extracted from source, 'template' = placeholder written, undefined = n/a
  let commandsSource: 'extracted' | 'template' | undefined;

  if (answers.surface === 'cli') {
    const commandsPath = resolve(generatedDir, 'cli-commands.json');
    if (answers.entryFile) {
      console.log(`[init] Running import-commands from ${answers.entryFile}...`);
      try {
        const TIMEOUT_MS = 20_000;
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS),
        );
        await Promise.race([
          importCommands({ from: answers.entryFile, out: commandsPath, scrape: false, depth: 2, cwd: answers.repoPath, force: true }),
          timeout,
        ]);
        commandsSource = 'extracted';
      } catch (err) {
        console.warn(`[init] Warning: import-commands failed: ${err instanceof Error ? err.message : err}`);
        console.warn('[init] Writing template cli-commands.json instead — edit it with your real commands.');
        writeCliTemplate(commandsPath);
        commandsSource = 'template';
      }
    } else if (!existsSync(commandsPath)) {
      writeCliTemplate(commandsPath);
      commandsSource = 'template';
    }
    // If it already exists and no entry file was given, leave it untouched (commandsSource stays undefined)
  }

  if (answers.surface === 'mcp') {
    const toolsPath = resolve(generatedDir, 'tools.json');
    if (!existsSync(toolsPath)) {
      writeMcpTemplate(toolsPath);
    }
  }

  printNextSteps(answers, configPath, commandsSource);
}

function writeCliTemplate(commandsPath: string): void {
  const commands = [
    {
      command: 'example-create',
      description: 'Create a new item',
      options: [{ name: '--name', takesValue: true, description: 'Name for the item' }],
    },
    {
      command: 'example-list',
      description: 'List all items',
      options: [{ name: '--format', takesValue: true, description: 'Output format: json | table (default: table)' }],
    },
  ];
  writeFileSync(commandsPath, JSON.stringify(commands, null, 2) + '\n', 'utf-8');
  console.log(`[init] Created ${commandsPath} (template — edit or run import-commands to replace)`);
}

function writeMcpTemplate(toolsPath: string): void {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_data',
        description: 'Get data for a given item ID',
        parameters: {
          type: 'object',
          properties: { item_id: { type: 'string', description: 'The item identifier' } },
          required: ['item_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'send_data',
        description: 'Send data to a recipient',
        parameters: {
          type: 'object',
          properties: {
            value: { type: 'string', description: 'The data to send' },
            recipient: { type: 'string', description: 'The recipient identifier' },
          },
          required: ['value', 'recipient'],
        },
      },
    },
  ];
  writeFileSync(toolsPath, JSON.stringify(tools, null, 2) + '\n', 'utf-8');
  console.log(`[init] Created ${toolsPath} (template — edit with your real tools)`);
}

function printNextSteps(answers: WizardAnswers, configPath: string, commandsSource: 'extracted' | 'template' | undefined): void {
  const skillAbsPath = answers.skillPath
    ? (isAbsolute(answers.skillPath) ? answers.skillPath : resolve(answers.repoPath, answers.skillPath))
    : resolve(answers.repoPath, 'SKILL.md');
  const skillMissing = !existsSync(skillAbsPath);

  console.log('\n[init] Done!');
  console.log(`  Surface:    ${answers.surface}`);
  console.log(`  Repo:       ${answers.repoPath}`);
  console.log(`  SKILL.md:   ${skillAbsPath}${skillMissing ? ' (not found yet — create it)' : ''}`);
  console.log(`  Models:     ${answers.models.length} — ${answers.models.map(m => m.split('/').pop()).join(', ')}`);
  console.log(`  Tasks:      up to ${answers.maxTasks} per run`);
  console.log(`  Iterations: up to ${answers.maxIterations}`);
  console.log(`  Target:     ${Math.round((answers.targetPassRate ?? 0.8) * 100)}% pass rate`);
  console.log(`  Config:     ${configPath}`);

  // Only show a manifest step if user action is actually required
  const needsManifestEdit =
    (answers.surface === 'cli' && commandsSource === 'template') ||
    answers.surface === 'mcp';

  const steps: string[] = [];

  if (needsManifestEdit) {
    if (answers.surface === 'cli') {
      steps.push(
        'Edit .skill-optimizer/cli-commands.json — replace the template with your real commands\n' +
        '     (or rerun with an entry file: skill-optimizer import-commands --from <entry-file>)',
      );
    } else {
      steps.push('Edit .skill-optimizer/tools.json — replace the template with your real MCP tools');
    }
  }

  if (skillMissing) {
    steps.push(`Create ${skillAbsPath}\n     Explain your surface to the model: what it does, key concepts, usage examples`);
  }

  steps.push('Run: skill-optimizer optimize --config ./.skill-optimizer/skill-optimizer.json');

  if (steps.length > 0) {
    console.log('\n  Next steps:');
    steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  }
}
