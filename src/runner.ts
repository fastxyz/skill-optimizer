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
} from './types.js';
import { loadConfig, loadTasks, loadMcpTools, slugify, getModelBySlug, getModelsByTier } from './config.js';
import { createLLMClient } from './llm/index.js';
import { extract } from './extractors/index.js';
import { fetchSkill } from './skill-fetcher.js';
import { evaluateTask } from './evaluator.js';
import { computeCoverage } from './coverage.js';
import { buildSystemPrompt, buildTaskPrompt } from './prompts.js';

export interface RunnerOptions {
  configPath?: string;
  tier?: Tier;
  taskId?: string;
  modelSlug?: string;
  noCache?: boolean;
}

/**
 * Run the full benchmark.
 */
export async function runBenchmark(options: RunnerOptions = {}): Promise<BenchmarkReport> {
  // 1. Load config
  const config = loadConfig(options.configPath);

  console.log('================================================================');
  console.log(`  Skill Benchmark — ${config.name}`);
  console.log('================================================================\n');

  // 2. Determine known methods (for precision/hallucination tracking)
  let knownMethods: Set<string>;
  if (config.mode === 'code') {
    knownMethods = new Set(config.code!.methods);
  } else {
    // MCP mode: known methods are the tool names from the tools file
    const mcpTools = loadMcpTools(config.mcp!.tools);
    knownMethods = new Set(mcpTools.map(t => t.function.name));
  }

  // 3. Load tasks
  let tasks = loadTasks(config.tasks);
  console.log(`[tasks] Loaded ${tasks.length} tasks from ${config.tasks}`);

  if (options.taskId) {
    tasks = tasks.filter(t => t.id === options.taskId);
    if (tasks.length === 0) {
      console.error(`ERROR: Task '${options.taskId}' not found in ${config.tasks}`);
      process.exit(1);
    }
    console.log(`[tasks] Filtered to task: ${options.taskId}`);
  }

  // 4. Load MCP tools (if MCP mode) for chatWithTools
  let mcpToolDefs = undefined;
  if (config.mode === 'mcp') {
    mcpToolDefs = loadMcpTools(config.mcp!.tools);
    console.log(`[mcp] Loaded ${mcpToolDefs.length} tool definitions from ${config.mcp!.tools}`);
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
  const style = config.code?.style ?? 'sdk';
  const promptOptions = config.mode === 'mcp'
    ? { mode: 'mcp' as const }
    : { mode: 'code' as const, style };
  const systemPrompt = buildSystemPrompt(skill, config.name, promptOptions);
  console.log(`[prompt] Mode: ${config.mode}, style: ${style}`);
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
      console.error(`ERROR: Model '${options.modelSlug}' not found in config`);
      process.exit(1);
    }
    models = [found];
    console.log(`[models] Filtered to model: ${found.name}`);
  }

  console.log(`\n[run] ${tasks.length} tasks × ${models.length} models = ${tasks.length * models.length} evaluations\n`);

  // 9. Setup output directory
  const outputDir = resolve(config.output?.dir ?? 'benchmark-results');
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

      const start = Date.now();
      try {
        if (config.mode === 'mcp' && mcpToolDefs) {
          llmResponse = await client.chatWithTools(
            model.id,
            systemPrompt,
            buildTaskPrompt(task, promptOptions),
            mcpToolDefs,
          );
        } else {
          llmResponse = await client.chat(
            model.id,
            systemPrompt,
            buildTaskPrompt(task, promptOptions),
          );
        }
        rawResponse = llmResponse.content;
        tokenUsage = llmResponse.usage;
        llmLatencyMs = Date.now() - start;
        console.log(`  [${slug}] Response: ${rawResponse.length} chars (${llmLatencyMs}ms)`);
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

      try {
        const extracted = await extract(llmResponse!, config);
        extractedCalls = extracted.calls;
        generatedCode = extracted.generatedCode;

        if (config.mode === 'code') {
          if (generatedCode) {
            console.log(`  [${slug}] Code extracted: ${generatedCode.length} chars`);
          } else if (!error) {
            console.log(`  [${slug}] WARNING: No code block found`);
            error = error ?? 'No code block in response';
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
      });

      const status = taskResult.metrics.taskPassed ? '✅ PASS' : '❌ FAIL';
      const hallucinationInfo = taskResult.metrics.hallucinatedCalls.length > 0
        ? `  hallucinated=${taskResult.metrics.hallucinatedCalls.join(',')}`
        : '';
      console.log(
        `  [${slug}] ${status}  recall=${taskResult.metrics.toolRecall.toFixed(2)}  precision=${taskResult.metrics.toolPrecision.toFixed(2)}  toolSel=${taskResult.metrics.toolSelectionAccuracy.toFixed(2)}  argAcc=${taskResult.metrics.argAccuracy.toFixed(2)}${hallucinationInfo}`
      );

      results.push(taskResult);

      // Save raw response per model per task
      const taskModelDir = resolve(outputDir, task.id, slug);
      mkdirSync(taskModelDir, { recursive: true });
      writeFileSync(resolve(taskModelDir, 'response.md'), rawResponse, 'utf-8');
      if (generatedCode) {
        writeFileSync(resolve(taskModelDir, 'code.ts'), generatedCode, 'utf-8');
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
    config: { name: config.name, mode: config.mode },
    skillVersion,
    results,
    coverage,
    summary: {
      totalTasks,
      totalModels,
      totalEvaluations: totalEvals,
      overallPassRate: totalEvals ? passed / totalEvals : 0,
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
