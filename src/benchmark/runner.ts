import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  Tier,
  BenchmarkConfig,
  TaskDefinition,
  TaskResult,
  BenchmarkReport,
  ModelConfig,
  ExtractedCall,
  MethodCoverage,
  SkillVersion,
  ModelSummary,
  TaskSummary,
  ToolExecutor,
  McpToolDefinition,
} from './types.js';
import { getExpectedActionName, getExpectedActions } from './types.js';
import { loadConfig, loadTasks, loadMcpTools, loadCliCommands, slugify, getModelBySlug, getModelsByTier } from './config.js';
import { createLLMClient } from './llm/index.js';
import { extract } from './extractors/index.js';
import { fetchSkill } from './skill-fetcher.js';
import { evaluateTask } from './evaluator.js';
import { computeCoverage } from './coverage.js';
import { buildSystemPrompt, buildTaskPrompt } from './prompts.js';

function buildWebFetchTool(): McpToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch a reference document by path. Use this to load SDK documentation referenced in the skill.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Path to the reference document' } },
        required: ['url'],
      },
    },
  };
}

function createReferenceExecutor(baseUrl: string, allowedPaths: string[]): { executor: ToolExecutor; fetchedPaths: string[] } {
  const fetched: string[] = [];
  const allowed = new Set(allowedPaths);
  const executor: ToolExecutor = async (name, args) => {
    if (name !== 'web_fetch') return `Error: Unknown tool "${name}"`;
    let url = (args.url ?? args.path ?? '') as string;
    url = url.replace(/^\/+/, '');
    const prefix = baseUrl.replace(/\/+$/, '') + '/';
    if (url.startsWith(prefix)) url = url.slice(prefix.length);
    if (url.startsWith('https://')) {
      const idx = url.indexOf(prefix);
      if (idx !== -1) url = url.slice(idx + prefix.length);
    }
    if (!allowed.has(url)) return `Error: Path "${url}" not in allowed list. Available: ${allowedPaths.join(', ')}`;
    fetched.push(url);
    const fullUrl = `${baseUrl.replace(/\/+$/, '')}/${url}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const res = await fetch(fullUrl, { signal: controller.signal });
        if (!res.ok) return `Error: HTTP ${res.status} fetching ${fullUrl}`;
        return await res.text();
      } finally { clearTimeout(timer); }
    } catch (err) { return `Error: ${err instanceof Error ? err.message : String(err)}`; }
  };
  return { executor, fetchedPaths: fetched };
}

function formatMcpResponseContent(
  textContent: string,
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
): string {
  const parts: string[] = [];
  const trimmed = textContent.trim();
  if (trimmed) {
    parts.push(trimmed);
  }
  if (toolCalls.length > 0) {
    parts.push(`Tool calls:\n${JSON.stringify(toolCalls, null, 2)}`);
  }
  return parts.join('\n\n');
}

export interface RunnerOptions {
  configPath?: string;
  tier?: Tier;
  taskId?: string;
  modelSlug?: string;
  noCache?: boolean;
  outputDir?: string;
}

/**
 * Run the full benchmark.
 */
export async function runBenchmark(options: RunnerOptions = {}): Promise<BenchmarkReport> {
  // 1. Load config
  const { config, configDir } = loadConfig(options.configPath);

  console.log('================================================================');
  console.log(`  Skill Benchmark — ${config.name}`);
  console.log('================================================================\n');

  // 2. Load tasks first (needed for known action derivation)
  let tasks = loadTasks(config.tasks, configDir);

  // 3. Determine known actions (for precision/hallucination tracking)
  let knownMethods: Set<string>;
  let cliCommands: ReturnType<typeof loadCliCommands> | undefined = undefined;
  let mcpToolDefs: ReturnType<typeof loadMcpTools> | undefined = undefined;
  if (config.surface === 'sdk') {
    // Derive from task expected actions + optional sdk.apiSurface
    const fromTasks = new Set<string>();
    for (const task of tasks) {
      for (const action of getExpectedActions(task)) {
        fromTasks.add(getExpectedActionName(action));
      }
    }
    const apiSurface = config.sdk?.apiSurface ?? config.sdk?.methods ?? [];
    knownMethods = new Set([...fromTasks, ...apiSurface]);
  } else if (config.surface === 'cli') {
    cliCommands = loadCliCommands(config.cli!.commands, configDir);
    knownMethods = new Set(cliCommands.map((c) => c.command));
  } else {
    // MCP surface: load tools once, reuse for both knownMethods and chatWithTools
    mcpToolDefs = config.mcpToolDefinitions ?? (config.mcp ? loadMcpTools(config.mcp.tools, configDir) : []);
    knownMethods = new Set(mcpToolDefs.map(t => t.function.name));
  }
  console.log(`[tasks] Loaded ${tasks.length} tasks from ${config.tasks}`);

  if (options.taskId) {
    tasks = tasks.filter(t => t.id === options.taskId);
    if (tasks.length === 0) {
      throw new Error(`Task '${options.taskId}' not found in ${config.tasks}`);
    }
    console.log(`[tasks] Filtered to task: ${options.taskId}`);
  }

  // 4. Log known definitions (already loaded in step 3)
  if (config.surface === 'mcp' && mcpToolDefs) {
    const sourceLabel = config.surfaceSnapshot ? 'surface snapshot' : config.mcp?.tools ?? 'MCP manifest';
    console.log(`[mcp] Loaded ${mcpToolDefs.length} tool definitions from ${sourceLabel}`);
  } else if (config.surface === 'cli' && cliCommands) {
    console.log(`[cli] Loaded ${cliCommands.length} command definitions from ${config.cli!.commands}`);
  }

  // 5. Fetch skill doc (optional — may be null)
  const skill = await fetchSkill(options.noCache
    ? { ...config.skill, cache: false } as typeof config.skill
    : config.skill
  );
  if (skill) {
    console.log(`[skill] Version: ${skill.version.source}@${skill.version.commitSha.slice(0, 8)}\n`);
  } else {
    console.log('[skill] No skill configured — using generic system prompt\n');
  }

  // 6. Build system prompt
  const promptOptions = {
    surface: config.surface,
    agentic: Boolean(config.agentic),
    shell: config.cli?.shell,
    sdkLanguage: config.sdk?.language,
  };
  const systemPrompt = buildSystemPrompt(skill, config.name, promptOptions);
  console.log(`[prompt] Surface: ${config.surface}`);
  console.log(`[prompt] System prompt: ${systemPrompt.length} chars\n`);

  // 7. Create LLM client
  const client = createLLMClient(config.llm);

  // 8. Select models
  let models: ModelConfig[] = [...config.llm.models];
  if (options.tier) {
    models = getModelsByTier(config, options.tier);
    console.log(`[models] Filtered to tier: ${options.tier} (${models.length} models)`);
  }
  if (options.modelSlug) {
    const found = getModelBySlug(config, options.modelSlug);
    if (!found) {
      throw new Error(`Model '${options.modelSlug}' not found in config`);
    }
    models = [found];
    console.log(`[models] Filtered to model: ${found.name}`);
  }

  console.log(`\n[run] ${tasks.length} tasks × ${models.length} models = ${tasks.length * models.length} evaluations\n`);

  // 9. Setup output directory
  const outputDir = options.outputDir
    ? resolve(options.outputDir)
    : resolve(configDir, config.output?.dir ?? 'benchmark-results');
  mkdirSync(outputDir, { recursive: true });

  // 10. Run evaluations
  const results: TaskResult[] = [];

  for (const task of tasks) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Task: ${task.id}`);
    console.log(`  Prompt: ${task.prompt.slice(0, 80)}${task.prompt.length > 80 ? '...' : ''}`);
    console.log('─'.repeat(60));

    for (const model of models) {
      const slug = slugify(model.name);
      console.log(`\n  [${slug}] Calling ${model.name}...`);

      let rawResponse = '';
      let llmLatencyMs = 0;
      let tokenUsage;
      let error: string | undefined;
      let llmResponse;
      let fetchedPaths: string[] = [];

      const start = Date.now();
      try {
        if (config.agentic) {
          const ref = createReferenceExecutor(
            config.agentic.references.baseUrl, config.agentic.references.allowedPaths,
          );
          llmResponse = await client.chatAgentLoop(
            model.id, systemPrompt, buildTaskPrompt(task, promptOptions),
            [buildWebFetchTool()], ref.executor, config.agentic.maxTurns ?? 5,
          );
          fetchedPaths = ref.fetchedPaths;
        } else if (config.surface === 'mcp' && mcpToolDefs) {
          llmResponse = await client.chatWithTools(
            model.id,
            systemPrompt,
            buildTaskPrompt(task, promptOptions),
            mcpToolDefs,
          );
        } else {
          // SDK and CLI surfaces both use plain chat transport.
          llmResponse = await client.chat(
            model.id,
            systemPrompt,
            buildTaskPrompt(task, promptOptions),
          );
        }
        rawResponse = llmResponse.content;
        if (config.surface === 'mcp' && (llmResponse.toolCalls?.length ?? 0) > 0) {
          rawResponse = formatMcpResponseContent(llmResponse.content, llmResponse.toolCalls ?? []);
        }
        tokenUsage = llmResponse.usage;
        llmLatencyMs = Date.now() - start;
        const toolCallCount = llmResponse.toolCalls?.length ?? 0;
        if (config.surface === 'mcp') {
          const toolLabel = `${toolCallCount} tool call${toolCallCount === 1 ? '' : 's'}`;
          if (toolCallCount > 0 && llmResponse.content.length === 0) {
            console.log(
              `  [${slug}] Structured response: ${toolLabel}, no text reply (${llmLatencyMs}ms)`,
            );
          } else if (toolCallCount > 0) {
            console.log(
              `  [${slug}] Structured response: ${toolLabel} + ${llmResponse.content.length} chars text (${llmLatencyMs}ms)`,
            );
          } else {
            console.log(`  [${slug}] Text response: ${llmResponse.content.length} chars (${llmLatencyMs}ms)`);
          }
        } else {
          console.log(`  [${slug}] Response: ${rawResponse.length} chars (${llmLatencyMs}ms)`);
        }
      } catch (err) {
        llmLatencyMs = Date.now() - start;
        error = err instanceof Error ? err.message : String(err);
        console.error(`  [${slug}] FAILED: ${error}`);
        // Create a minimal empty response for extraction
        llmResponse = { content: '', usage: undefined };
      }

      // Extract calls from response
      let extractedCalls: ExtractedCall[] = [];
      let generatedCode: string | null = null;
      let bindings: Map<string, string> | undefined;

      try {
        const extractionConfig = config.surface === 'cli' && cliCommands
          ? {
              ...config,
              cli: {
                ...config.cli,
                commandDefinitions: cliCommands,
              },
            }
          : config;

        const extracted = await extract(llmResponse!, extractionConfig as BenchmarkConfig);
        extractedCalls = extracted.calls;
        generatedCode = extracted.generatedCode;
        bindings = extracted.bindings;

        if (config.surface === 'sdk') {
          const sdkLanguage = config.sdk?.language ?? 'typescript';
          if (generatedCode) {
            console.log(`  [${slug}] ${sdkLanguage} code extracted: ${generatedCode.length} chars`);
          } else if (!error) {
            console.log(`  [${slug}] WARNING: No ${sdkLanguage} code block found`);
            error = error ?? `No ${sdkLanguage} code block in response`;
          }
        }

        if (config.surface === 'cli') {
          if (generatedCode) {
            console.log(`  [${slug}] Command block extracted: ${generatedCode.length} chars`);
          } else if (!error) {
            console.log(`  [${slug}] WARNING: No shell command block found`);
            error = error ?? 'No shell command block in response';
          }
        }

        if (extractedCalls.length > 0) {
          console.log(`  [${slug}] Extracted ${extractedCalls.length} calls: ${extractedCalls.map(c => c.method).join(', ')}`);
        }
      } catch (err) {
        console.error(`  [${slug}] Extraction error: ${err instanceof Error ? err.message : err}`);
        error = error ?? `Extraction failed: ${err instanceof Error ? err.message : err}`;
      }

      // Evaluate
      const taskResult = evaluateTask({
        task,
        model,
        generatedCode,
        rawResponse,
        extractedCalls,
        llmLatencyMs,
        tokenUsage,
        error,
        knownMethods,
        bindings,
        surface: config.surface,
      });

      if (config.agentic && task.expected_fetches) {
        const actualFetches = fetchedPaths;
        const expectedSet = new Set(task.expected_fetches);
        const actualSet = new Set(actualFetches);
        const matched = [...expectedSet].filter(f => actualSet.has(f));
        taskResult.metrics.fetchRecall = expectedSet.size === 0 ? 1.0 : matched.length / expectedSet.size;
        taskResult.metrics.fetchPrecision = actualSet.size === 0 ? 0.0 : matched.length / actualSet.size;
        taskResult.metrics.actualFetches = actualFetches;
        taskResult.metrics.taskPassed = taskResult.metrics.taskPassed && taskResult.metrics.fetchRecall === 1.0;
        const fetchStatus = taskResult.metrics.fetchRecall === 1.0 ? 'correct' : 'WRONG';
        console.log(`  [${slug}] Fetched: [${actualFetches.join(', ')}] (${fetchStatus})`);
      }

      const status = taskResult.metrics.taskPassed ? '✅ PASS' : '❌ FAIL';
      console.log(
        `  [${slug}] ${status}  recall=${taskResult.metrics.toolRecall.toFixed(2)}`
      );

      results.push(taskResult);

      // Save raw response per model per task
      const taskModelDir = resolve(outputDir, task.id, slug);
      mkdirSync(taskModelDir, { recursive: true });
      writeFileSync(resolve(taskModelDir, 'response.md'), rawResponse, 'utf-8');
      if (generatedCode) {
        const generatedFile = config.surface === 'sdk'
          ? config.sdk?.language === 'python'
            ? 'code.py'
            : config.sdk?.language === 'rust'
              ? 'code.rs'
              : 'code.ts'
          : config.surface === 'cli'
            ? 'commands.sh'
            : 'generated.txt';
        writeFileSync(resolve(taskModelDir, generatedFile), generatedCode, 'utf-8');
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 1_000));
    }
  }

  // 11. Compute coverage
  const allMethods = Array.from(knownMethods);
  const coverage = computeCoverage(tasks, allMethods);

  // 12. Build report
  const skillVersion: SkillVersion = skill?.version ?? {
    source: 'none',
    commitSha: 'none',
    ref: 'none',
    fetchedAt: new Date().toISOString(),
  };
  const report = buildBenchmarkReport(
    results,
    coverage,
    skillVersion,
    tasks.length,
    models.length,
    config,
    outputDir,
  );

  // 13. Save report
  const jsonPath = resolve(outputDir, 'report.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n[output] Report saved to ${jsonPath}`);

  return report;
}

/**
 * Build the full benchmark report with summaries.
 */
function buildBenchmarkReport(
  results: TaskResult[],
  coverage: MethodCoverage[],
  skillVersion: SkillVersion,
  totalTasks: number,
  totalModels: number,
  config: BenchmarkConfig,
  outputDir: string,
): BenchmarkReport {
  const passed = results.filter(r => r.metrics.taskPassed).length;
  const totalEvals = results.length;

  // Per-model summary
  const perModel: Record<string, ModelSummary> = {};
  const modelGroups = new Map<string, TaskResult[]>();
  for (const r of results) {
    const key = r.model.id;
    if (!modelGroups.has(key)) modelGroups.set(key, []);
    modelGroups.get(key)!.push(r);
  }
  for (const [modelId, runs] of modelGroups) {
    const p = runs.filter(r => r.metrics.taskPassed).length;
    perModel[modelId] = {
      passRate: runs.length ? p / runs.length : 0,
      avgRecall: runs.length ? runs.reduce((s, r) => s + r.metrics.toolRecall, 0) / runs.length : 0,
      avgPrecision: runs.length ? runs.reduce((s, r) => s + r.metrics.toolPrecision, 0) / runs.length : 0,
      avgToolSelectionAccuracy: runs.length ? runs.reduce((s, r) => s + r.metrics.toolSelectionAccuracy, 0) / runs.length : 0,
      avgArgAccuracy: runs.length ? runs.reduce((s, r) => s + r.metrics.argAccuracy, 0) / runs.length : 0,
      avgHallucinationRate: runs.length ? runs.reduce((s, r) => s + r.metrics.hallucinationRate, 0) / runs.length : 0,
      tasksRun: runs.length,
    };
  }

  // Per-task summary
  const perTask: Record<string, TaskSummary> = {};
  const taskGroups = new Map<string, TaskResult[]>();
  for (const r of results) {
    const key = r.task.id;
    if (!taskGroups.has(key)) taskGroups.set(key, []);
    taskGroups.get(key)!.push(r);
  }
  for (const [taskId, runs] of taskGroups) {
    const p = runs.filter(r => r.metrics.taskPassed).length;
    perTask[taskId] = {
      passRate: runs.length ? p / runs.length : 0,
      avgRecall: runs.length ? runs.reduce((s, r) => s + r.metrics.toolRecall, 0) / runs.length : 0,
      avgToolSelectionAccuracy: runs.length ? runs.reduce((s, r) => s + r.metrics.toolSelectionAccuracy, 0) / runs.length : 0,
      avgArgAccuracy: runs.length ? runs.reduce((s, r) => s + r.metrics.argAccuracy, 0) / runs.length : 0,
    };
  }

  // Per-tier summary
  const tiers: Tier[] = ['flagship', 'mid', 'low'];
  const perTier = {} as Record<Tier, { passRate: number; avgRecall: number; avgToolSelectionAccuracy: number; avgArgAccuracy: number }>;
  for (const tier of tiers) {
    const tierResults = results.filter(r => r.model.tier === tier);
    const p = tierResults.filter(r => r.metrics.taskPassed).length;
    perTier[tier] = {
      passRate: tierResults.length ? p / tierResults.length : 0,
      avgRecall: tierResults.length
        ? tierResults.reduce((s, r) => s + r.metrics.toolRecall, 0) / tierResults.length
        : 0,
      avgToolSelectionAccuracy: tierResults.length
        ? tierResults.reduce((s, r) => s + r.metrics.toolSelectionAccuracy, 0) / tierResults.length
        : 0,
      avgArgAccuracy: tierResults.length
        ? tierResults.reduce((s, r) => s + r.metrics.argAccuracy, 0) / tierResults.length
        : 0,
    };
  }

  const coveredCount = coverage.filter(c => c.covered).length;

  return {
    timestamp: new Date().toISOString(),
    config: {
      name: config.name,
      surface: config.surface,
      outputDir,
    },
    skillVersion,
    results,
    coverage,
    summary: {
      totalTasks,
      totalModels,
      totalEvaluations: totalEvals,
      overallPassRate: totalEvals ? passed / totalEvals : 0,
      weightedAverage: (() => {
        const weights = config.llm.models.map((m) => ({ id: m.id, w: m.weight ?? 1 }));
        const totalWeight = weights.reduce((acc, x) => acc + x.w, 0);
        return totalWeight > 0
          ? weights.reduce((acc, { id, w }) => acc + w * (perModel[id]?.passRate ?? 0), 0) / totalWeight
          : 0;
      })(),
      avgToolRecall: totalEvals
        ? results.reduce((s, r) => s + r.metrics.toolRecall, 0) / totalEvals
        : 0,
      avgToolPrecision: totalEvals
        ? results.reduce((s, r) => s + r.metrics.toolPrecision, 0) / totalEvals
        : 0,
      avgToolSelectionAccuracy: totalEvals
        ? results.reduce((s, r) => s + r.metrics.toolSelectionAccuracy, 0) / totalEvals
        : 0,
      avgArgAccuracy: totalEvals
        ? results.reduce((s, r) => s + r.metrics.argAccuracy, 0) / totalEvals
        : 0,
      avgHallucinationRate: totalEvals
        ? results.reduce((s, r) => s + r.metrics.hallucinationRate, 0) / totalEvals
        : 0,
      methodCoveragePercent: coverage.length ? coveredCount / coverage.length : 0,
      perModel,
      perTask,
      perTier,
    },
  };
}
