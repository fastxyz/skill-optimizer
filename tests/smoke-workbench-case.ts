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

test('YAML case loads MCP server definitions', () => {
  const root = makeTempCaseDir('skill-workbench-mcp-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.yml', [
      'name: mcp-docs',
      'references: ./references',
      'task: Use the configured MCP docs server.',
      'graders:',
      '  - name: output',
      '    command: test -f answer.json',
      'env:',
      '  - CONTEXT7_API_KEY',
      'mcpServers:',
      '  context7:',
      '    baseUrl: https://mcp.context7.com/mcp',
      '    headers:',
      '      Authorization: "Bearer ${CONTEXT7_API_KEY}"',
      '  local-tools:',
      '    command: node',
      '    args:',
      '      - mcp/local-server.mjs',
      '    env:',
      '      FIXTURE_TOKEN: "${FIXTURE_TOKEN}"',
    ].join('\n'));

    const loaded = loadWorkbenchCase(casePath);

    assert.deepEqual(loaded.mcpServers, {
      context7: {
        baseUrl: 'https://mcp.context7.com/mcp',
        headers: {
          Authorization: 'Bearer ${CONTEXT7_API_KEY}',
        },
      },
      'local-tools': {
        command: 'node',
        args: ['mcp/local-server.mjs'],
        env: {
          FIXTURE_TOKEN: '${FIXTURE_TOKEN}',
        },
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid MCP server without transport throws', () => {
  const root = makeTempCaseDir('skill-workbench-invalid-mcp-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.yml', [
      'name: mcp-docs',
      'references: ./references',
      'task: Use MCP.',
      'graders:',
      '  - name: output',
      '    command: test -f answer.json',
      'mcpServers:',
      '  missing-transport:',
      '    description: Missing URL or command',
    ].join('\n'));

    assert.throws(
      () => loadWorkbenchCase(casePath),
      /field "mcpServers" server "missing-transport" must define a non-empty url, baseUrl, serverUrl, or command/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('MCP service without matching MCP server throws', () => {
  const root = makeTempCaseDir('skill-workbench-invalid-mcp-service-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.yml', [
      'name: mcp-docs',
      'references: ./references',
      'task: Use MCP.',
      'graders:',
      '  - name: output',
      '    command: test -f answer.json',
      'mcpServices:',
      '  calculator:',
      '    command: node',
      '    args:',
      '      - calculator-server.mjs',
    ].join('\n'));

    assert.throws(
      () => loadWorkbenchCase(casePath),
      /field "mcpServices" service "calculator" requires a matching "mcpServers" entry/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid MCP service command reports mcpServices field', () => {
  const root = makeTempCaseDir('skill-workbench-invalid-mcp-service-command-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.yml', [
      'name: mcp-docs',
      'references: ./references',
      'task: Use MCP.',
      'graders:',
      '  - name: output',
      '    command: test -f answer.json',
      'mcpServers:',
      '  calculator:',
      '    baseUrl: http://calculator:3000/mcp',
      'mcpServices:',
      '  calculator:',
      '    command: ""',
    ].join('\n'));

    assert.throws(
      () => loadWorkbenchCase(casePath),
      /field "mcpServices" service "calculator" command must be a non-empty string/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('MCP service port is rejected because mcpServers URL owns the port', () => {
  const root = makeTempCaseDir('skill-workbench-invalid-mcp-service-port-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.yml', [
      'name: mcp-docs',
      'references: ./references',
      'task: Use MCP.',
      'graders:',
      '  - name: output',
      '    command: test -f answer.json',
      'mcpServers:',
      '  calculator:',
      '    baseUrl: http://calculator:3000/mcp',
      'mcpServices:',
      '  calculator:',
      '    command: node',
      '    args:',
      '      - calculator-server.mjs',
      '    port: 3000',
    ].join('\n'));

    assert.throws(
      () => loadWorkbenchCase(casePath),
      /field "mcpServices" service "calculator" port is not supported; set the port in the matching mcpServers URL/,
    );
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

test('invalid case model ref is rejected while loading', () => {
  const root = makeTempCaseDir('skill-workbench-invalid-model-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.yml', [
      'name: merge-pdfs',
      'references: ./references',
      'task: Merge files',
      'model: anthropic/claude-3-5-haiku-latest',
      'graders:',
      '  - name: merged-output',
      '    command: node $CASE/checks/merge-pdfs.js',
    ].join('\n'));

    assert.throws(
      () => loadWorkbenchCase(casePath),
      /Workbench only supports OpenRouter model refs, got: anthropic\/claude-3-5-haiku-latest/,
    );
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

test('invalid env variable names are rejected', () => {
  const root = makeTempCaseDir('skill-workbench-invalid-env-name-');
  try {
    mkdirSync(join(root, 'references'));

    for (const envName of ['OPENROUTER_API_KEY;touch /tmp/pwned', 'BAD-NAME', '1BAD']) {
      const casePath = writeCaseFile(root, `case-${envName.length}.json`, JSON.stringify({
        name: 'merge-pdfs',
        references: './references',
        task: 'Merge files',
        graders: [
          { name: 'merged-output', command: 'node $CASE/checks/merge-pdfs.js' },
        ],
        env: [envName],
      }, null, 2));

      assert.throws(
        () => loadWorkbenchCase(casePath),
        /field "env" item at index 0 must match \^\[A-Za-z_\]\[A-Za-z0-9_\]\*\$/,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('valid env variable names still load', () => {
  const root = makeTempCaseDir('skill-workbench-valid-env-name-');
  try {
    mkdirSync(join(root, 'references'));
    const casePath = writeCaseFile(root, 'case.json', JSON.stringify({
      name: 'merge-pdfs',
      references: './references',
      task: 'Merge files',
      graders: [
        { name: 'merged-output', command: 'node $CASE/checks/merge-pdfs.js' },
      ],
      env: ['OPENROUTER_API_KEY', '_TOKEN1'],
    }, null, 2));

    const loaded = loadWorkbenchCase(casePath);
    assert.deepEqual(loaded.env, ['OPENROUTER_API_KEY', '_TOKEN1']);
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
