import {
  SessionManager,
  createAgentSession,
  createCodingTools,
} from '@mariozechner/pi-coding-agent';

import { parseModelRef } from '../../project/types.js';
import { resolvePiModel } from './models.js';
import type { PiAuthMode } from './auth.js';

export async function createCodingOrchestratorSession(params: {
  cwd: string;
  modelRef: string;
  authMode?: PiAuthMode;
  apiKeyEnv?: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}) {
  const { provider, model } = parseModelRef(params.modelRef);
  const resolved = await resolvePiModel(provider, model, {
    authMode: params.authMode,
    apiKeyEnv: params.apiKeyEnv,
  });

  return createAgentSession({
    cwd: params.cwd,
    model: resolved.model,
    thinkingLevel: params.thinkingLevel ?? 'medium',
    authStorage: resolved.authStorage,
    modelRegistry: resolved.modelRegistry,
    tools: createCodingTools(params.cwd),
    sessionManager: SessionManager.inMemory(),
  });
}
