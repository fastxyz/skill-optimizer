import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadActionSnapshotFile } from '../src/actions/snapshot.js';

await test('loadActionSnapshotFile accepts prompt surface', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-snapshot-prompt-'));
  try {
    const p = join(dir, 'snapshot.json');
    writeFileSync(p, JSON.stringify({
      version: 1,
      catalog: {
        surface: 'prompt',
        actions: [],
      },
    }));
    // Must not throw — previously threw "catalog.surface must be one of sdk|cli|mcp"
    const result = loadActionSnapshotFile(p);
    assert.equal(result.catalog.surface, 'prompt');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
