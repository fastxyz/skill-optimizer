import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { loadWorkbenchCase } from '../src/workbench/case-loader.js';
import type { WorkbenchCaseConfig } from '../src/workbench/types.js';

function makeTempCaseDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeCaseFile(root: string, filename: string, body: string): string {
  const casePath = join(root, filename);
  writeFileSync(casePath, body, 'utf-8');
  return casePath;
}

test('type supports minimal fields', () => {
  const minimal: WorkbenchCaseConfig = {
    name: 'merge-pdfs',
    references: './references',
    task: 'Merge files',
    graders: [
      { name: 'merged-output', command: 'node $CASE/check.js' },
    ],
  };

  assert.equal(minimal.name, 'merge-pdfs');
});

test('YAML case loads and resolves relative references', () => {
  const root = makeTempCaseDir('skill-workbench-yaml-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.yaml', [
      'name: merge-pdfs',
      'references: ./references',
      'task: Merge the PDFs in inputs/ into outputs/book.pdf.',
      'graders:',
      '  - name: merged-output',
      '    command: node $CASE/checks/merge-pdfs.js',
    ].join('\n'));

    const loaded = loadWorkbenchCase(casePath);
    assert.equal(loaded.name, 'merge-pdfs');
    assert.equal(loaded.referencesDir, resolve(root, 'references'));
    assert.equal(loaded.configPath, resolve(casePath));
    assert.deepEqual(loaded.graders, [
      { name: 'merged-output', command: 'node $CASE/checks/merge-pdfs.js' },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('JSON case loads', () => {
  const root = makeTempCaseDir('skill-workbench-json-');
  try {
    mkdirSync(join(root, 'refs'));
    const casePath = writeCaseFile(root, 'case.json', JSON.stringify({
      name: 'merge-pdfs-json',
      references: './refs',
      task: 'Merge the PDFs.',
      graders: [
        { name: 'merged-output', command: 'node $CASE/checks/merge-pdfs.js' },
      ],
      env: ['OPENROUTER_API_KEY'],
    }, null, 2));

    const loaded = loadWorkbenchCase(casePath);
    assert.equal(loaded.name, 'merge-pdfs-json');
    assert.deepEqual(loaded.env, ['OPENROUTER_API_KEY']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('defaults are applied', () => {
  const root = makeTempCaseDir('skill-workbench-defaults-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.yml', [
      'name: merge-pdfs',
      'references: ./references',
      'task: Merge files',
      'graders:',
      '  - name: merged-output',
      '    command: node $CASE/checks/merge-pdfs.js',
    ].join('\n'));

    const loaded = loadWorkbenchCase(casePath);
    assert.equal(loaded.model, 'openrouter/google/gemini-2.5-flash');
    assert.equal(loaded.timeoutSeconds, 600);
    assert.deepEqual(loaded.env, []);
    assert.deepEqual(loaded.setup, []);
    assert.deepEqual(loaded.cleanup, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid missing references throws', () => {
  const root = makeTempCaseDir('skill-workbench-missing-refs-');
  try {
    const casePath = writeCaseFile(root, 'case.yaml', [
      'name: merge-pdfs',
      'task: Merge files',
      'graders:',
      '  - name: merged-output',
      '    command: node $CASE/checks/merge-pdfs.js',
    ].join('\n'));

    assert.throws(
      () => loadWorkbenchCase(casePath),
      /field "references" must be a non-empty string/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid non-array env throws', () => {
  const root = makeTempCaseDir('skill-workbench-invalid-env-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.json', JSON.stringify({
      name: 'merge-pdfs',
      references: './references',
      task: 'Merge files',
      graders: [
        { name: 'merged-output', command: 'node $CASE/checks/merge-pdfs.js' },
      ],
      env: 'OPENROUTER_API_KEY',
    }, null, 2));

    assert.throws(
      () => loadWorkbenchCase(casePath),
      /field "env" must be an array of non-empty strings/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid missing graders throws', () => {
  const root = makeTempCaseDir('skill-workbench-missing-graders-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.yml', [
      'name: merge-pdfs',
      'references: ./references',
      'task: Merge files',
    ].join('\n'));

    assert.throws(
      () => loadWorkbenchCase(casePath),
      /field "graders" must be a non-empty array/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unsupported check field is rejected when graders are present', () => {
  const root = makeTempCaseDir('skill-workbench-unsupported-check-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.yml', [
      'name: merge-pdfs',
      'references: ./references',
      'task: Merge files',
      'check: node $CASE/checks/old-check.js',
      'graders:',
      '  - name: merged-output',
      '    command: node $CASE/checks/merge-pdfs.js',
    ].join('\n'));

    assert.throws(
      () => loadWorkbenchCase(casePath),
      /field "check" is invalid; define graders as a non-empty array of \{ name, command \} objects/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unsupported artifacts field is rejected', () => {
  const root = makeTempCaseDir('skill-workbench-unsupported-artifacts-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.yml', [
      'name: merge-pdfs',
      'references: ./references',
      'task: Merge files',
      'artifacts:',
      '  - output.pdf',
      'graders:',
      '  - name: merged-output',
      '    command: node $CASE/checks/merge-pdfs.js',
    ].join('\n'));

    assert.throws(
      () => loadWorkbenchCase(casePath),
      /field "artifacts" is invalid; inspect outputs in the workspace or use --keep-workspace/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid grader command throws', () => {
  const root = makeTempCaseDir('skill-workbench-invalid-grader-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.yml', [
      'name: merge-pdfs',
      'references: ./references',
      'task: Merge files',
      'graders:',
      '  - name: merged-output',
      '    command: ""',
    ].join('\n'));

    assert.throws(
      () => loadWorkbenchCase(casePath),
      /field "graders" item at index 0 command must be a non-empty string/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
