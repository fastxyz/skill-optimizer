import type { MutationCandidate, MutationContext } from '../types.js';
import { collectGitChangedFiles } from './git-changes.js';

export class PiCodingMutationExecutor {
  async apply(context: MutationContext): Promise<MutationCandidate> {
    const packages = await importPiPackages();
    const ai = await importPiAi();

    const mutation = context.manifest.mutation;
    if (!mutation) {
      throw new Error('Optimize manifest must define a "mutation" section for pi-coding execution');
    }

    const model = ai.getModel(mutation.provider as never, mutation.model);
    if (!model) {
      throw new Error(`Could not resolve pi model ${mutation.provider}/${mutation.model}`);
    }

    const authStorage = packages.AuthStorage.create();
    if (mutation.apiKeyEnv) {
      const apiKey = process.env[mutation.apiKeyEnv];
      if (!apiKey) {
        throw new Error(`Missing mutation API key env var: ${mutation.apiKeyEnv}`);
      }
      authStorage.setRuntimeApiKey(mutation.provider as never, apiKey);
    }

    const modelRegistry = packages.ModelRegistry.create(authStorage);
    const { session } = await packages.createAgentSession({
      cwd: context.manifest.targetRepo.path,
      model,
      thinkingLevel: mutation.thinkingLevel ?? 'medium',
      authStorage,
      modelRegistry,
      tools: packages.createCodingTools(context.manifest.targetRepo.path),
      sessionManager: packages.SessionManager.inMemory(),
    });

    await session.prompt(buildMutationPrompt(context));
    const changedFiles = await collectGitChangedFiles(context.manifest.targetRepo.path);

    return {
      summary: context.failureBuckets[0]?.kind
        ? `address ${context.failureBuckets[0].kind}`
        : 'address benchmark failures',
      changedFiles,
    };
  }
}

function buildMutationPrompt(context: MutationContext): string {
  const allowedPaths = context.manifest.targetRepo.allowedPaths.map((path) => `- ${path}`).join('\n');
  const failureSummary = context.failureBuckets.length === 0
    ? '- No failure buckets were detected; improve benchmark pass rate conservatively.'
    : context.failureBuckets.map((bucket) => `- ${bucket.kind}: ${bucket.count} failures across tasks ${bucket.taskIds.join(', ')}`).join('\n');

  return [
    'Improve this repository for LLM usability based on benchmark feedback.',
    '',
    'Constraints:',
    '- Only edit files under these allowed paths:',
    allowedPaths,
    '- Preserve overall product correctness.',
    '- Prefer the smallest change that improves agent usability.',
    '',
    `Current overall pass rate: ${context.currentReport.summary.overallPassRate.toFixed(3)}`,
    'Failure buckets:',
    failureSummary,
    '',
    'Make the changes directly in the repo and stop when the changes are applied.',
  ].join('\n');
}

async function importPiPackages() {
  return import('@mariozechner/pi-coding-agent');
}

async function importPiAi() {
  return import('@mariozechner/pi-ai');
}
