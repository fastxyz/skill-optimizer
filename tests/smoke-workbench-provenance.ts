import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { validateSuiteProvenance } from '../src/workbench/provenance.js';

test('validateSuiteProvenance accepts matching source metadata and included paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-provenance-'));
  try {
    mkdirSync(join(root, 'references', 'source', 'skills'), { recursive: true });
    writeFileSync(join(root, 'provenance.json'), JSON.stringify({
      type: 'git',
      url: 'https://github.com/firecrawl/cli',
      ref: 'abc123',
      includedPaths: ['skills/'],
      fetchedAt: '2026-04-28T00:00:00.000Z',
    }), 'utf-8');

    assert.doesNotThrow(() => validateSuiteProvenance(root, {
      type: 'git',
      url: 'https://github.com/firecrawl/cli',
      ref: 'abc123',
      includedPaths: ['skills/'],
    }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validateSuiteProvenance rejects mismatched source metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-provenance-bad-'));
  try {
    mkdirSync(join(root, 'references', 'source', 'skills'), { recursive: true });
    writeFileSync(join(root, 'provenance.json'), JSON.stringify({
      type: 'git',
      url: 'https://github.com/firecrawl/cli',
      ref: 'abc123',
      includedPaths: ['skills/'],
      fetchedAt: '2026-04-28T00:00:00.000Z',
    }), 'utf-8');

    assert.throws(() => validateSuiteProvenance(root, {
      type: 'git',
      url: 'https://github.com/firecrawl/cli',
      ref: 'def456',
      includedPaths: ['skills/'],
    }), /provenance ref mismatch/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validateSuiteProvenance rejects included paths outside references source', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-provenance-escape-'));
  try {
    mkdirSync(join(root, 'references', 'source'), { recursive: true });
    writeFileSync(join(root, 'references', 'README.md'), 'outside source', 'utf-8');
    writeFileSync(join(root, 'provenance.json'), JSON.stringify({
      type: 'git',
      url: 'https://github.com/firecrawl/cli',
      ref: 'abc123',
      includedPaths: ['../README.md'],
      fetchedAt: '2026-04-28T00:00:00.000Z',
    }), 'utf-8');

    assert.throws(() => validateSuiteProvenance(root, {
      type: 'git',
      url: 'https://github.com/firecrawl/cli',
      ref: 'abc123',
      includedPaths: ['../README.md'],
    }), /references\/source/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
