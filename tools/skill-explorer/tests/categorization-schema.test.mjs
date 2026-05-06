import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA, ENUM_COLUMNS, FREETEXT_COLUMNS, buildPrompt, SETUP_COST_SCHEMA, buildSetupCostPrompt } from '../lib/categorization-schema.mjs';

test('SCHEMA is a valid JSON-serialisable object', () => {
  const json = JSON.stringify(SCHEMA);
  const round = JSON.parse(json);
  assert.equal(round.type, 'object');
});

test('SCHEMA has the 5 enum dimensions and 3 free-text fields', () => {
  const props = SCHEMA.properties;
  for (const key of ['type', 'gradability', 'improvement_potential', 'author_effort', 'land_probability']) {
    assert.ok(Array.isArray(props[key].enum), `expected enum on ${key}`);
  }
  for (const key of ['summary', 'notable_issues', 'eval_sketch']) {
    assert.ok(props[key], `expected ${key}`);
  }
  // source + name must be present and required
  assert.ok(props.source && props.name);
  assert.ok(SCHEMA.required.includes('source'));
  assert.ok(SCHEMA.required.includes('name'));
});

test('ENUM_COLUMNS matches the 5 enum fields, in canonical order', () => {
  assert.deepEqual(
    ENUM_COLUMNS,
    ['type', 'gradability', 'improvement_potential', 'author_effort', 'land_probability'],
  );
});

test('FREETEXT_COLUMNS matches the 3 free-text fields, in canonical order', () => {
  assert.deepEqual(FREETEXT_COLUMNS, ['summary', 'notable_issues', 'eval_sketch']);
});

test('buildPrompt embeds source, name, and SKILL.md content', () => {
  const prompt = buildPrompt(
    { source: 'anthropics/skills', name: 'pdf' },
    '# PDF skill\n\nSome content here.',
  );
  assert.match(prompt, /anthropics\/skills/);
  assert.match(prompt, /name: +pdf/);
  assert.match(prompt, /Some content here\./);
  assert.match(prompt, /JSON object/);
});

test('SETUP_COST_SCHEMA is JSON-serialisable and has the expected shape', () => {
  const round = JSON.parse(JSON.stringify(SETUP_COST_SCHEMA));
  assert.equal(round.type, 'object');
  assert.equal(round.additionalProperties, false);
  for (const k of ['source', 'name', 'setup_cost', 'setup_cost_reasoning']) {
    assert.ok(round.required.includes(k), `required missing ${k}`);
    assert.ok(round.properties[k], `property missing ${k}`);
  }
  assert.deepEqual(round.properties.setup_cost.enum, ['low', 'medium', 'high']);
  assert.equal(round.properties.setup_cost_reasoning.maxLength, 250);
});

test('buildSetupCostPrompt embeds source, name, SKILL.md content, and the enum definitions', () => {
  const prompt = buildSetupCostPrompt(
    { source: 'anthropics/skills', name: 'pdf' },
    '# PDF skill\n\nReads PDFs.',
  );
  assert.match(prompt, /anthropics\/skills/);
  assert.match(prompt, /name: +pdf/);
  assert.match(prompt, /Reads PDFs\./);
  // Enum definitions must appear verbatim so the model has the same vocabulary.
  assert.match(prompt, /low\s+—/);
  assert.match(prompt, /medium\s+—/);
  assert.match(prompt, /high\s+—/);
  // Single-question pass — must not ask about other dimensions.
  assert.doesNotMatch(prompt, /gradability/);
  assert.doesNotMatch(prompt, /improvement_potential/);
});
