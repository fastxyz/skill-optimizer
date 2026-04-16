export type ActionSurface = 'sdk' | 'cli' | 'mcp' | 'prompt';

export interface ActionArgSchema {
  name: string;
  required: boolean;
  type?: string;
  description?: string;
  schema?: Record<string, unknown>;
}

export interface ActionDefinition {
  key: string;
  name: string;
  description?: string;
  args: ActionArgSchema[];
  source?: string;
}

export interface ActionCatalog {
  surface: ActionSurface;
  actions: ActionDefinition[];
}

export interface ActionAttempt {
  method: string;
  key?: string;
  args: Record<string, unknown>;
  line: number;
  raw: string;
}
