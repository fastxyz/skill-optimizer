import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, resolve, relative, join, basename } from 'node:path';
import type { WizardAnswers } from './answers.js';
import { importCommands } from '../import/index.js';

const KNOWN_MODELS: Record<string, { name: string; tier: 'flagship' | 'mid' | 'low' }> = {
  'openrouter/openai/gpt-5.4': { name: 'GPT-5.4', tier: 'flagship' },
  'openrouter/openai/gpt-5.3-codex': { name: 'GPT-5.3 Codex', tier: 'flagship' },
  'openrouter/openai/gpt-4o': { name: 'GPT-4o', tier: 'flagship' },
  'openrouter/openai/gpt-4o-mini': { name: 'GPT-4o Mini', tier: 'mid' },
  'openrouter/anthropic/claude-opus-4.6': { name: 'Claude Opus 4.6', tier: 'flagship' },
  'openrouter/anthropic/claude-sonnet-4.6': { name: 'Claude Sonnet 4.6', tier: 'flagship' },
  'openrouter/google/gemini-2.5-pro-preview': { name: 'Gemini 2.5 Pro', tier: 'flagship' },
  'openrouter/google/gemini-2.0-flash-001': { name: 'Gemini 2.0 Flash', tier: 'mid' },
  'openrouter/meta-llama/llama-3.3-70b-instruct': { name: 'Llama 3.3 70B', tier: 'mid' },
  'openrouter/mistralai/mistral-large-2411': { name: 'Mistral Large', tier: 'mid' },
  'openrouter/deepseek/deepseek-chat': { name: 'DeepSeek Chat', tier: 'mid' },
  'openrouter/qwen/qwen-2.5-72b-instruct': { name: 'Qwen 2.5 72B', tier: 'mid' },
};

function resolveModel(id: string): { id: string; name: string; tier: 'flagship' | 'mid' | 'low' } {
  const known = KNOWN_MODELS[id];
  if (known) return { id, ...known };
  const slug = id.split('/').pop() ?? id;
  const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { id, name, tier: 'mid' };
}

// Preferred optimize models in priority order — prefer stronger reasoning models
const OPTIMIZE_MODEL_PREFERENCE = [
  'openrouter/anthropic/claude-opus-4.6',
  'openrouter/openai/gpt-5.4',
  'openrouter/anthropic/claude-sonnet-4.6',
  'openrouter/openai/gpt-5.3-codex',
  'openrouter/openai/gpt-4o',
];

function pickOptimizeModel(models: string[]): string {
  for (const preferred of OPTIMIZE_MODEL_PREFERENCE) {
    if (models.includes(preferred)) return preferred;
  }
  return models[0]!;
}

export function buildConfigFromAnswers(answers: WizardAnswers, configDir: string): object {
  const { surface, repoPath, models, maxTasks, maxIterations, name } = answers;
  const projectName = name ?? basename(repoPath);

  // Paths stored in the JSON are relative to configDir so the config is portable
  const relRepo = relative(configDir, repoPath) || '.';
  // skillPath may be absolute (from wizard) or relative to repoPath (from answers file)
  const skillAbsPath = answers.skillPath
    ? (isAbsolute(answers.skillPath) ? answers.skillPath : resolve(repoPath, answers.skillPath))
    : resolve(repoPath, 'SKILL.md');
  const skillConfigPath = relative(configDir, skillAbsPath);

  const commonBenchmark = {
    apiKeyEnv: 'OPENROUTER_API_KEY',
    format: 'pi',
    timeout: 240000,
    taskGeneration: { enabled: true, maxTasks, outputDir: './.skill-optimizer' },
    models: models.map(resolveModel),
    output: { dir: '../benchmark-results' },
    verdict: { perModelFloor: 0.6, targetWeightedAverage: 0.7 },
  };

  const commonOptimize = {
    model: pickOptimizeModel(models),
    apiKeyEnv: 'OPENROUTER_API_KEY',
    allowedPaths: [skillConfigPath],
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
  const entryRelative = answers.entryFile ?? defaultEntry;

  if (surface === 'cli') {
    return {
      name: projectName,
      target: {
        surface: 'cli',
        repoPath: relRepo,
        skill: skillConfigPath,
        discovery: { mode: 'auto', sources: [join(relRepo, entryRelative)] },
        cli: { commands: './.skill-optimizer/cli-commands.json' },
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
      discovery: { mode: 'auto', sources: [join(relRepo, entryRelative)] },
      mcp: { tools: './.skill-optimizer/tools.json' },
    },
    benchmark: commonBenchmark,
    optimize: commonOptimize,
  };
}

export async function scaffoldInit(answers: WizardAnswers, cwd: string): Promise<void> {
  const configDir = resolve(cwd, 'skill-optimizer');
  const generatedDir = resolve(configDir, '.skill-optimizer');
  mkdirSync(configDir, { recursive: true });
  mkdirSync(generatedDir, { recursive: true });

  const configPath = resolve(configDir, 'skill-optimizer.json');
  const configExisted = existsSync(configPath);
  writeFileSync(configPath, JSON.stringify(buildConfigFromAnswers(answers, configDir), null, 2) + '\n', 'utf-8');
  console.log(`[init] ${configExisted ? 'Updated' : 'Created'} ${configPath}`);

  if (answers.surface === 'cli') {
    const commandsPath = resolve(generatedDir, 'cli-commands.json');
    if (existsSync(commandsPath) && !answers.entryFile) {
      // Only skip auto-extraction if no entry file was specified — otherwise re-extract
      console.log(`[init] Skipping ${commandsPath} (already exists — run import-commands to refresh)`);
    } else if (answers.entryFile) {
      console.log(`[init] Running import-commands from ${answers.entryFile}...`);
      try {
        await importCommands({
          from: answers.entryFile,
          out: commandsPath,
          scrape: false,
          depth: 2,
          cwd: answers.repoPath,
        });
      } catch (err) {
        console.warn(`[init] Warning: import-commands failed: ${err instanceof Error ? err.message : err}`);
        console.warn(`[init] Writing template cli-commands.json instead.`);
        writeCliTemplate(commandsPath);
      }
    } else {
      writeCliTemplate(commandsPath);
    }
  }

  if (answers.surface === 'mcp') {
    const toolsPath = resolve(generatedDir, 'tools.json');
    if (existsSync(toolsPath)) {
      console.log(`[init] Skipping ${toolsPath} (already exists — edit to update your tools)`);
    } else {
      writeMcpTemplate(toolsPath);
    }
  }

  printNextSteps(answers, configPath);
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

function printNextSteps(answers: WizardAnswers, configPath: string): void {
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
  console.log(`  Config:     ${configPath}`);

  console.log('\n  Next steps:');
  let step = 1;
  if (answers.surface === 'sdk') {
    console.log(`  ${step++}. Review target.discovery.sources in the config — points to your SDK entry file`);
  } else if (answers.surface === 'cli') {
    if (answers.entryFile) {
      console.log(`  ${step++}. Review skill-optimizer/.skill-optimizer/cli-commands.json — auto-extracted from your CLI`);
    } else {
      console.log(`  ${step++}. Edit skill-optimizer/.skill-optimizer/cli-commands.json — replace template with real commands`);
      console.log('     Or run: skill-optimizer import-commands --from <entry-file>');
    }
  } else {
    console.log(`  ${step++}. Edit skill-optimizer/.skill-optimizer/tools.json — replace template with your real MCP tools`);
  }
  if (skillMissing) {
    console.log(`  ${step++}. Create ${skillAbsPath} — explain your surface to the model (what it does, key concepts, usage examples)`);
  }
  console.log(`  ${step}. Run: skill-optimizer run --config ./skill-optimizer/skill-optimizer.json`);
}
