import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/store.mjs';

function freshStore() {
  const dir = mkdtempSync(join(tmpdir(), 'store-test-'));
  return { store: new Store(dir), dir };
}

test('default registry status is pending', () => {
  const { store } = freshStore();
  assert.deepEqual(store.registryStatus('skills-sh'), { status: 'pending' });
});

test('setRegistryStatus persists across reads', () => {
  const { store, dir } = freshStore();
  store.setRegistryStatus('skills-sh', 'in_flight');
  const reopened = new Store(dir);
  assert.equal(reopened.registryStatus('skills-sh').status, 'in_flight');
  rmSync(dir, { recursive: true, force: true });
});

test('enqueueRequest writes a JSON file and pendingRequests returns it', () => {
  const { store } = freshStore();
  const id = store.enqueueRequest({
    action: 'list-skills',
    registry: { id: 'r1', name: 'r1', url: 'https://example.com' },
    cache: { dom_path: '/tmp/x', text_path: '/tmp/y', screenshot_path: '/tmp/z' },
  });
  assert.match(id, /^req-\d+-[A-Z0-9]+$/);
  const pending = store.pendingRequests();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, id);
  assert.equal(pending[0].action, 'list-skills');
});

test('ingestResponse removes the request from pending', () => {
  const { store } = freshStore();
  const id = store.enqueueRequest({ action: 'list-skills', registry: { id: 'r1', name: 'r1', url: 'u' }, cache: {} });
  store.ingestResponse(id, { id, status: 'ok', skills: [], registry_id: 'r1' });
  assert.equal(store.pendingRequests().length, 0);
});

test('ingestResponse with skills merges and dedups by lowercased name+author', () => {
  const { store } = freshStore();
  store.enqueueRequest({ action: 'list-skills', registry: { id: 'r1', name: 'r1', url: 'u' }, cache: {} });
  store.ingestResponse('any-id-1', {
    id: 'any-id-1',
    status: 'ok',
    registry_id: 'r1',
    skills: [
      { name: 'PDF', author: 'Anthropics/Skills', description: 'd', popularity: '1k' },
      { name: 'docx', author: 'anthropics/skills', description: 'e' },
    ],
  });
  store.ingestResponse('any-id-2', {
    id: 'any-id-2',
    status: 'ok',
    registry_id: 'r2',
    skills: [
      { name: 'pdf', author: 'anthropics/skills', description: 'd2' }, // dup of first
      { name: 'find-skills', author: 'vercel/skills' },
    ],
  });
  const all = store.allSkills();
  assert.equal(all.length, 3, 'pdf should dedup');
  const pdf = all.find((s) => s.name.toLowerCase() === 'pdf');
  assert.deepEqual([...pdf.sources].sort(), ['r1', 'r2']);
});

test('setSkillNote updates the note in place', () => {
  const { store } = freshStore();
  store.ingestResponse('id-1', {
    id: 'id-1',
    status: 'ok',
    registry_id: 'r1',
    skills: [{ name: 'pdf', author: 'anthropics/skills' }],
  });
  store.setSkillNote('pdf::anthropics/skills', 'worth a PR');
  assert.equal(store.allSkills()[0].notes, 'worth a PR');
});

test('error response sets error status without merging skills', () => {
  const { store } = freshStore();
  store.ingestResponse('id-err', { id: 'id-err', status: 'error', error: 'timeout', registry_id: 'r1' });
  assert.equal(store.allSkills().length, 0);
});
