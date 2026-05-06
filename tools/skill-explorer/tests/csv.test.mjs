import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRegistriesCsv, emitSkillsCsv } from '../lib/csv.mjs';

test('parseRegistriesCsv reads source_name, url, operator, type, description', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csv-test-'));
  const path = join(dir, 'r.csv');
  writeFileSync(path, [
    'source_name,url,operator,type,description,skill_count_estimate,notes',
    'skills.sh,https://skills.sh/,Vercel,leaderboard,A leaderboard,~270,Notes here',
    'anthropics/skills,https://github.com/anthropics/skills,Anthropic,first-party repo,Official,~15,',
  ].join('\n'), 'utf-8');

  const rows = parseRegistriesCsv(path);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'skills-sh');
  assert.equal(rows[0].name, 'skills.sh');
  assert.equal(rows[0].operator, 'Vercel');
  assert.equal(rows[0].type, 'leaderboard');
  assert.equal(rows[0].url, 'https://skills.sh/');
  assert.equal(rows[1].id, 'anthropics-skills');
});

test('parseRegistriesCsv handles quoted fields with commas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csv-test-'));
  const path = join(dir, 'r.csv');
  writeFileSync(path, [
    'source_name,url,operator,type,description,skill_count_estimate,notes',
    '"skills, plus","https://skills.sh/",Vercel,"leaderboard, public","Has, commas, here",~270,Some notes',
  ].join('\n'), 'utf-8');

  const rows = parseRegistriesCsv(path);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'skills, plus');
  assert.equal(rows[0].description, 'Has, commas, here');
});

test('emitSkillsCsv produces a header row and one row per skill', () => {
  const skills = [
    { name: 'pdf', author: 'anthropics/skills', popularity: '93.7K', description: 'PDFs', sources: ['skills-sh'], notes: '' },
    { name: 'find-skills', author: 'vercel-labs/skills', popularity: '1.4M', description: 'Discovery', sources: ['skills-sh', 'awesome'], notes: 'great' },
  ];
  const csv = emitSkillsCsv(skills);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /name/);
  assert.match(lines[0], /author/);
  assert.match(lines[1], /pdf/);
  assert.match(lines[2], /find-skills/);
});
