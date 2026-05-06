import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRows, applyTopNFilter, rankByYield, computeRepoSiblings, applyDiversificationCaps } from '../_merge-v3.mjs';

const v2Rows = [
  { source: 'anthropics/skills', name: 'pdf', is_official: 'true', is_popular_top1212: 'true', installs_raw: '93700', org_total_installs: '1446330' },
  { source: 'anthropics/skills', name: 'docx', is_official: 'true', is_popular_top1212: 'true', installs_raw: '76400', org_total_installs: '1446330' },
  { source: 'someguy/random', name: 'fluff', is_official: 'false', is_popular_top1212: 'false', installs_raw: '12', org_total_installs: '' },
];
const classifications = new Map([
  ['anthropics__skills__pdf', {
    source: 'anthropics/skills', name: 'pdf', type: 'document', gradability: 'easy',
    improvement_potential: 'medium', author_effort: 'low', land_probability: 'high',
    summary: 'PDF skill', notable_issues: ['missing OCR example'], eval_sketch: 'check answer.json shape',
  }],
  ['anthropics__skills__docx', {
    source: 'anthropics/skills', name: 'docx', type: 'document', gradability: 'easy',
    improvement_potential: 'low', author_effort: 'low', land_probability: 'high',
    summary: 'docx skill', notable_issues: [], eval_sketch: 'docx round-trip',
  }],
]);

test('mergeRows attaches classification fields when present', () => {
  const merged = mergeRows(v2Rows, classifications);
  const pdf = merged.find((r) => r.source === 'anthropics/skills' && r.name === 'pdf');
  assert.equal(pdf.type, 'document');
  assert.equal(pdf.gradability, 'easy');
  assert.equal(pdf.summary, 'PDF skill');
});

test('mergeRows leaves classification fields empty when no match', () => {
  const merged = mergeRows(v2Rows, classifications);
  const fluff = merged.find((r) => r.name === 'fluff');
  assert.equal(fluff.type, '');
  assert.equal(fluff.summary, '');
});

test('mergeRows pipe-joins notable_issues for CSV-friendliness', () => {
  const merged = mergeRows(v2Rows, classifications);
  const pdf = merged.find((r) => r.name === 'pdf');
  assert.equal(pdf.notable_issues_pipe_joined, 'missing OCR example');
});

test('applyTopNFilter passes only gold cohort with permitted enum values', () => {
  const merged = mergeRows(v2Rows, classifications);
  const filtered = applyTopNFilter(merged);
  // Both pdf and docx are official+popular+document+easy+low-effort+high-land,
  // BUT pdf has improvement_potential=medium (passes), docx has low (rejected).
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, 'pdf');
});

test('rankByYield sorts by installs_raw descending', () => {
  const rows = [
    { installs_raw: '100', org_total_installs: '1000' },
    { installs_raw: '500', org_total_installs: '2000' },
    { installs_raw: '50',  org_total_installs: '5000' },
  ];
  const ranked = rankByYield(rows);
  assert.deepEqual(ranked.map((r) => r.installs_raw), ['500', '100', '50']);
});

test('computeRepoSiblings groups names by source, only counting cohort rows', () => {
  const rows = [
    { source: 'microsoft/azure-skills', name: 'azure-vm', is_official: 'true', is_popular_top1212: 'true' },
    { source: 'microsoft/azure-skills', name: 'azure-storage', is_official: 'true', is_popular_top1212: 'true' },
    // Below cohort — should be excluded.
    { source: 'microsoft/azure-skills', name: 'azure-obscure', is_official: 'true', is_popular_top1212: 'false' },
    { source: 'anthropics/skills', name: 'pdf', is_official: 'true', is_popular_top1212: 'true' },
    // Different repo, no siblings.
    { source: 'someone/random', name: 'fluff', is_official: 'false', is_popular_top1212: 'false' },
  ];
  const map = computeRepoSiblings(rows);
  assert.deepEqual(map.get('microsoft/azure-skills'), ['azure-vm', 'azure-storage']);
  assert.deepEqual(map.get('anthropics/skills'), ['pdf']);
  // someone/random did not pass cohort, so it should not appear in the map
  // (or appear with empty array — both are acceptable; assert via .get).
  assert.equal(map.get('someone/random') ?? undefined, undefined);
});

test('computeRepoSiblings returns empty map for empty input', () => {
  assert.equal(computeRepoSiblings([]).size, 0);
});

test('applyDiversificationCaps enforces max-per-repo (org cap is permissive)', () => {
  const ranked = [
    { source: 'microsoft/azure-skills', name: 'a' },
    { source: 'microsoft/azure-skills', name: 'b' },
    { source: 'microsoft/azure-skills', name: 'c' },
    { source: 'microsoft/azure-skills', name: 'd' },
  ];
  const out = applyDiversificationCaps(ranked, { maxPerRepo: 2, maxPerOrg: 100 });
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((r) => r.name), ['a', 'b']);
});

test('applyDiversificationCaps enforces max-per-org across multiple repos', () => {
  const ranked = [
    { source: 'microsoft/azure-skills', name: 'a' },
    { source: 'microsoft/azure-skills', name: 'b' },
    { source: 'microsoft/m365-skills', name: 'c' },
    { source: 'microsoft/m365-skills', name: 'd' },
    { source: 'microsoft/dynamics', name: 'e' },
    { source: 'anthropics/skills', name: 'f' },
  ];
  const out = applyDiversificationCaps(ranked, { maxPerRepo: 2, maxPerOrg: 3 });
  // microsoft hits org cap of 3 after a, b, c (a, b are azure-skills; c is m365 1st).
  // d is rejected by repo cap=2 on m365 (would be 2nd m365 but org is also at cap by then).
  // Wait — let's trace more carefully:
  //   a: azure-skills 0->1, microsoft 0->1, kept.
  //   b: azure-skills 1->2, microsoft 1->2, kept.
  //   c: m365-skills 0->1, microsoft 2->3, kept.
  //   d: m365-skills count=1 < 2 ok, microsoft count=3 >= 3 cap, REJECT.
  //   e: dynamics count=0 < 2 ok, microsoft count=3 >= 3 cap, REJECT.
  //   f: anthropics 0->1, kept.
  assert.deepEqual(out.map((r) => r.name), ['a', 'b', 'c', 'f']);
});

test('applyDiversificationCaps preserves rank order within remaining set', () => {
  const ranked = [
    { source: 'a/x', name: 'a1' },
    { source: 'b/x', name: 'b1' },
    { source: 'a/x', name: 'a2' },
    { source: 'a/x', name: 'a3' },
    { source: 'b/x', name: 'b2' },
  ];
  const out = applyDiversificationCaps(ranked, { maxPerRepo: 2, maxPerOrg: 100 });
  assert.deepEqual(out.map((r) => r.name), ['a1', 'b1', 'a2', 'b2']);
});

test('applyDiversificationCaps returns a new array, does not mutate input', () => {
  const ranked = [
    { source: 'a/x', name: 'a1' },
    { source: 'a/x', name: 'a2' },
    { source: 'a/x', name: 'a3' },
  ];
  const before = ranked.slice();
  applyDiversificationCaps(ranked, { maxPerRepo: 1, maxPerOrg: 100 });
  assert.deepEqual(ranked, before);
});
