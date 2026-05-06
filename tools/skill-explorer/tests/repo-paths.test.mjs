import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSkillMdPath } from '../lib/repo-paths.mjs';

const sampleTree = {
  tree: [
    { path: 'README.md', type: 'blob' },
    { path: 'skills', type: 'tree' },
    { path: 'skills/find-skills', type: 'tree' },
    { path: 'skills/find-skills/SKILL.md', type: 'blob' },
    { path: 'skills/find-skills/references/notes.md', type: 'blob' },
    { path: 'skills/pdf', type: 'tree' },
    { path: 'skills/pdf/SKILL.md', type: 'blob' },
    { path: '.claude-plugin/plugin.json', type: 'blob' },
  ],
};

test('finds SKILL.md whose parent dir name matches skillId', () => {
  assert.equal(findSkillMdPath(sampleTree, 'find-skills'), 'skills/find-skills/SKILL.md');
  assert.equal(findSkillMdPath(sampleTree, 'pdf'), 'skills/pdf/SKILL.md');
});

test('returns null when no matching SKILL.md exists', () => {
  assert.equal(findSkillMdPath(sampleTree, 'nonexistent'), null);
});

test('handles single-skill repo (SKILL.md at root)', () => {
  const tree = { tree: [
    { path: 'SKILL.md', type: 'blob' },
    { path: 'README.md', type: 'blob' },
  ]};
  // For root-level SKILL.md, repo name acts as skillId fallback (caller decides).
  // Function returns the root path when skillId matches the parent (= empty/repo).
  assert.equal(findSkillMdPath(tree, '_root'), 'SKILL.md');
});

test('returns null when path is a directory not a blob', () => {
  const tree = { tree: [
    { path: 'skills/foo/SKILL.md', type: 'tree' }, // wrong type
  ]};
  assert.equal(findSkillMdPath(tree, 'foo'), null);
});

test('case-sensitive match on skillId', () => {
  const tree = { tree: [
    { path: 'skills/PDF/SKILL.md', type: 'blob' },
  ]};
  assert.equal(findSkillMdPath(tree, 'pdf'), null);
  assert.equal(findSkillMdPath(tree, 'PDF'), 'skills/PDF/SKILL.md');
});

test('handles deeply-nested layouts', () => {
  const tree = { tree: [
    { path: 'agents/azure/skills/azure-ai/SKILL.md', type: 'blob' },
  ]};
  assert.equal(findSkillMdPath(tree, 'azure-ai'), 'agents/azure/skills/azure-ai/SKILL.md');
});
