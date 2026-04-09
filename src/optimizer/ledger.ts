import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function createJsonLedger(path: string) {
  return {
    async record(event: Record<string, unknown>): Promise<void> {
      mkdirSync(dirname(path), { recursive: true });
      const corruptPath = `${path}.corrupt`;
      let current = { version: 1, events: [] as Record<string, unknown>[] };

      if (existsSync(path)) {
        try {
          current = JSON.parse(readFileSync(path, 'utf-8')) as { version: number; events: Record<string, unknown>[] };
        } catch {
          if (existsSync(corruptPath)) {
            rmSync(corruptPath, { force: true });
          }
          renameSync(path, corruptPath);
        }
      }

      current.events.push(event);
      const tempPath = `${path}.tmp`;
      writeFileSync(tempPath, JSON.stringify(current, null, 2) + '\n', 'utf-8');
      renameSync(tempPath, path);
    },
  };
}
