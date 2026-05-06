import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA, ENUM_COLUMNS, FREETEXT_COLUMNS, buildPrompt } from '../lib/categorization-schema.mjs';

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
