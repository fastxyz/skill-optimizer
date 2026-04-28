#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { config as loadDotenv } from 'dotenv';

import { runWorkbenchReferenceSolutionsFromCli } from './workbench/reference-solutions.js';
import { runWorkbenchCaseFromCli } from './workbench/run-case.js';
import { runWorkbenchSuiteFromCli } from './workbench/run-suite.js';

loadDotenv({ override: true, quiet: true });

function printUsage(): void {
  console.log(`
Skill Optimizer Workbench

Usage:
  skill-optimizer run-case <case.yml>
  skill-optimizer run-suite <suite.yml>
  skill-optimizer verify-suite <suite.yml>

Run-case options:
  --out <path>                                  Results directory (default: <case-dir>/.results)
  --model <model>                               Override case model
  --models <models>                             Comma-separated OpenRouter model refs
  --trials <n>                                  Number of independent trials (default: 1)
  --concurrency <n>                             Maximum concurrent trial containers (default: 1)
  --image <image>                               Docker image (default: skill-optimizer-workbench:local)
  --keep-workspace                              Copy final /work into results/workspace; failures are always preserved

Run-suite options:
  --out <path>                                  Results directory (default: <suite-dir>/.results)
  --trials <n>                                  Number of independent trials per case/model (default: 1)
  --concurrency <n>                             Maximum concurrent trial containers (default: 1)
  --image <image>                               Docker image (default: skill-optimizer-workbench:local)
  --keep-workspace                              Copy final /work into each result workspace; failures are always preserved

Validation commands:
  verify-suite <suite.yml> [--out <path>]        Run authored reference solutions through graders

Examples:
  skill-optimizer run-case ./case.yml
  skill-optimizer run-case ./case.yml --keep-workspace
  skill-optimizer run-suite ./suite.yml --trials 3
  skill-optimizer run-case ./case.yml --models openrouter/google/gemini-2.5-flash,openrouter/openai/gpt-5.4
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const commands = new Set(['run-case', 'run-suite', 'verify-suite']);
  if (!commands.has(command ?? '')) {
    if (command) {
      console.error(`ERROR: Unknown command '${command}'.`);
    }
    printUsage();
    process.exit(1);
  }

  if (command === 'run-case') {
    await runWorkbenchCaseFromCli(args.slice(1));
  } else if (command === 'run-suite') {
    await runWorkbenchSuiteFromCli(args.slice(1));
  } else if (command === 'verify-suite') {
    await runWorkbenchReferenceSolutionsFromCli(args.slice(1));
  }
  process.exit(process.exitCode ?? 0);
}

function isExecutedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isExecutedDirectly()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
