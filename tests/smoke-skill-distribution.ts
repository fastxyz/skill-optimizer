import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const root = process.cwd();
const pluginDescription = 'Benchmark, evaluate, and optimize skills to ensure reliable performance across all LLMs';

function readJson(relativePath: string): any {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf-8'));
}

function readText(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf-8');
}

test('canonical skill follows the portable agent skills contract', () => {
  const skillPath = 'skills/skill-optimizer/SKILL.md';
  assert.equal(existsSync(join(root, skillPath)), true);

  const body = readText(skillPath);
  assert.match(body, /^---\n[\s\S]*?\n---\n/);
  assert.match(body, /^name: skill-optimizer$/m);
  assert.match(body, /^description: .+/m);
  assert.doesNotMatch(body, /^description: .{1025,}$/m);
});

test('canonical skill documents current workbench command and live CLI patterns', () => {
  const skill = readText('skills/skill-optimizer/SKILL.md');
  const reference = readText('skills/skill-optimizer/references/workbench.md');

  for (const text of [skill, reference]) {
    assert.doesNotMatch(text, /verify-suite/);
    assert.doesNotMatch(text, /runWorkbenchReferenceSolutions/);
  }

  assert.match(reference, /Live CLI\/API Skills/);
  assert.match(reference, /Use dedicated test credentials/);
  assert.match(reference, /Grade command names, flags, output files, and trace behavior/);
  assert.match(reference, /Include a no-tool-needed control case/);
  assert.match(reference, /Include a prompt-injection or unsafe-instruction case/);
});

test('workbench reference documents bin directory visibility accurately', () => {
  const reference = readText('skills/skill-optimizer/references/workbench.md');

  assert.match(
    reference,
    /`bin\/` \| yes, copied into `\/work\/bin` and mounted as `\/case\/bin` during setup and grading/,
  );
});

test('packaged MCP example omits unsupported mcpService ports', () => {
  const suite = readText('examples/workbench/mcp/suite.yml');

  assert.doesNotMatch(suite, /^\s+port:/m);
});

test('package metadata exposes plugin and skill distribution files', () => {
  const pkg = readJson('package.json');

  assert.equal(pkg.name, 'skill-optimizer');
  assert.equal(pkg.description, pluginDescription);
  assert.equal(pkg.main, './dist/index.js');
  assert.equal(pkg.exports['.'].import, './dist/index.js');
  assert.equal(pkg.exports['./server'].import, './.opencode/plugins/skill-optimizer.js');
  assert.ok(pkg.files.includes('skills/'));
  assert.ok(pkg.files.includes('.agents/plugins/marketplace.json'));
  assert.ok(pkg.files.includes('.claude-plugin/'));
  assert.ok(pkg.files.includes('.codex-plugin/'));
  assert.ok(pkg.files.includes('.cursor-plugin/'));
  assert.ok(pkg.files.includes('.opencode/plugins/skill-optimizer.js'));
  assert.ok(pkg.files.includes('.opencode/INSTALL.md'));
  assert.ok(pkg.files.includes('.codex/INSTALL.md'));
  assert.ok(pkg.files.includes('.cursor/INSTALL.md'));
  assert.ok(pkg.files.includes('AGENTS.md'));
  assert.ok(pkg.files.includes('CLAUDE.md'));
  assert.ok(pkg.files.includes('CONTRIBUTING.md'));
  assert.ok(pkg.files.includes('docs/README.codex.md'));
  assert.ok(pkg.files.includes('docs/README.opencode.md'));
  assert.ok(pkg.files.includes('gemini-extension.json'));
  assert.ok(pkg.files.includes('GEMINI.md'));
});

test('package metadata does not include broad example result directories', () => {
  const pkg = readJson('package.json');

  assert.equal(pkg.files.includes('examples/'), false);
  assert.ok(pkg.files.includes('examples/workbench/README.md'));
  assert.ok(pkg.files.includes('examples/workbench/pdf/README.md'));
  assert.ok(pkg.files.includes('examples/workbench/pdf/suite.yml'));
  assert.ok(pkg.files.includes('examples/workbench/pdf/checks/'));
  assert.ok(pkg.files.includes('examples/workbench/pdf/references/'));
  assert.equal(
    pkg.files.some((entry: string) => entry.startsWith('examples/workbench/firecrawl-search')),
    false,
  );
});

test('Claude plugin and marketplace metadata point at the canonical skill', () => {
  const pkg = readJson('package.json');
  const plugin = readJson('.claude-plugin/plugin.json');
  const marketplace = readJson('.claude-plugin/marketplace.json');

  assert.equal(plugin.name, 'skill-optimizer');
  assert.equal(plugin.description, pluginDescription);
  assert.equal(plugin.version, pkg.version);
  assert.equal(plugin.skills, './skills/');

  assert.equal(marketplace.name, 'skill-optimizer');
  assert.equal(marketplace.description, pluginDescription);
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, 'skill-optimizer');
  assert.equal(marketplace.plugins[0].description, pluginDescription);
  assert.equal(marketplace.plugins[0].source, './');
  assert.deepEqual(marketplace.plugins[0].skills, ['./skills/skill-optimizer']);
});

test('Codex and Cursor plugin metadata point at the canonical skill', () => {
  const pkg = readJson('package.json');
  const codex = readJson('.codex-plugin/plugin.json');
  const cursor = readJson('.cursor-plugin/plugin.json');

  for (const manifest of [codex, cursor]) {
    assert.equal(manifest.name, 'skill-optimizer');
    assert.equal(manifest.description, pluginDescription);
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.skills, './skills/');
    assert.equal(manifest.interface.displayName, 'Skill Optimizer');
    assert.equal(manifest.interface.shortDescription, pluginDescription);
    assert.equal(manifest.interface.longDescription, pluginDescription);
    assert.ok(manifest.interface.defaultPrompt.length > 0);
  }
});

test('Codex marketplace metadata exposes the root plugin with install policy', () => {
  const marketplace = readJson('.agents/plugins/marketplace.json');

  assert.equal(marketplace.name, 'skill-optimizer');
  assert.equal(marketplace.interface.displayName, 'Skill Optimizer');
  assert.equal(marketplace.interface.shortDescription, pluginDescription);
  assert.equal(marketplace.interface.longDescription, pluginDescription);
  assert.equal(marketplace.plugins.length, 1);

  const plugin = marketplace.plugins[0];
  assert.equal(plugin.name, 'skill-optimizer');
  assert.deepEqual(plugin.source, { source: 'local', path: './' });
  assert.deepEqual(plugin.policy, {
    installation: 'AVAILABLE',
    authentication: 'ON_INSTALL',
  });
  assert.equal(plugin.category, 'Coding');
});

test('OpenCode plugin registers the canonical skills directory', async () => {
  const pluginUrl = pathToFileURL(join(root, '.opencode', 'plugins', 'skill-optimizer.js')).href;
  const mod = await import(`${pluginUrl}?cacheBust=${Date.now()}`);
  const server = mod.default?.server ?? mod.SkillOptimizerPlugin;
  assert.equal(typeof server, 'function');

  const hooks = await server({});
  const config: any = {};
  await hooks.config(config);

  assert.deepEqual(config.skills.paths, [join(root, 'skills')]);
});

test('Gemini extension metadata points at the canonical context file', () => {
  const pkg = readJson('package.json');
  const extension = readJson('gemini-extension.json');
  const geminiInstructions = readText('GEMINI.md');

  assert.equal(extension.name, 'skill-optimizer');
  assert.equal(extension.description, pluginDescription);
  assert.equal(extension.version, pkg.version);
  assert.equal(extension.contextFileName, 'GEMINI.md');
  assert.match(geminiInstructions, /^@\.\/AGENTS\.md$/m);
  assert.match(geminiInstructions, /^@\.\/README\.md$/m);
  assert.match(geminiInstructions, /^@\.\/CONTRIBUTING\.md$/m);
  assert.match(geminiInstructions, /^@\.\/skills\/skill-optimizer\/SKILL\.md$/m);
});
