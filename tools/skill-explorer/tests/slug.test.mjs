import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceSlug, parseSlug } from '../lib/slug.mjs';

test('sourceSlug joins source + skillId with __ separators', () => {
  assert.equal(
    sourceSlug({ source: 'vercel-labs/skills', skillId: 'find-skills' }),
    'vercel-labs__skills__find-skills',
  );
});

test('sourceSlug encodes colons in skillId', () => {
  assert.equal(
    sourceSlug({ source: 'google-labs-code/stitch-skills', skillId: 'react:components' }),
    'google-labs-code__stitch-skills__react%3Acomponents',
  );
});

test('sourceSlug round-trips via parseSlug', () => {
  const slug = sourceSlug({ source: 'anthropics/skills', skillId: 'pdf' });
  assert.deepEqual(parseSlug(slug), { source: 'anthropics/skills', skillId: 'pdf' });
});

test('parseSlug round-trips encoded skillId', () => {
  const slug = sourceSlug({ source: 'google-labs-code/stitch-skills', skillId: 'react:components' });
  assert.deepEqual(
    parseSlug(slug),
    { source: 'google-labs-code/stitch-skills', skillId: 'react:components' },
  );
});

test('parseSlug returns null for malformed slug', () => {
  assert.equal(parseSlug('only-two__parts'), null);
});
