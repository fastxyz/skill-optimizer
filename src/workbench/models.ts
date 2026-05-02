export function ensureOpenRouterModelRef(modelRef: string): string {
  const trimmed = modelRef.trim();
  if (!trimmed.startsWith('openrouter/')) {
    throw new Error(`Workbench only supports OpenRouter model refs, got: ${modelRef}`);
  }
  return trimmed;
}

export function parseModelList(raw: string): string[] {
  const parts = raw.split(',').map((part) => part.trim());
  if (parts.length === 0 || parts.every((part) => part === '')) {
    throw new Error('Expected at least one model');
  }

  return parts.map((part, index) => {
    if (part === '') {
      throw new Error(`Model list item at index ${index} must be non-empty`);
    }
    return ensureOpenRouterModelRef(part);
  });
}

export function slugModelRef(modelRef: string): string {
  return modelRef
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
