import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveName, slugify, nameIncludes } from './nameResolver.js';

const entries = [
   { slug: 'raiden-shogun', data: { name: 'Raiden Shogun' } },
   { slug: 'hu-tao', data: { name: 'Hu Tao' } },
   { slug: 'aether-pyro', data: { name: 'Aether' } },
   { slug: 'aether-hydro', data: { name: 'Aether' } },
   { slug: 'kaedehara-kazuha', data: { name: 'Kaedehara Kazuha' } },
   { slug: 'nahida', data: { name: 'Nahida' } },
];

describe('slugify', () => {
   it('lowercases, strips punctuation and accents', () => {
      assert.equal(slugify("  Hu Tao's  Bow! "), 'hu-taos-bow');
      assert.equal(slugify('Lyney'), 'lyney');
      assert.equal(slugify('Mualani – Élan'), 'mualani-elan');
   });
   it('handles empty / non-string input', () => {
      assert.equal(slugify(undefined), '');
      assert.equal(slugify(42), '42');
   });
});

describe('resolveName', () => {
   const ok = (input, slug) => assert.deepEqual(resolveName(entries, input), { slug, suggestions: [] });

   it('matches exact slugs', () => ok('raiden-shogun', 'raiden-shogun'));
   it('matches display names', () => ok('Raiden Shogun', 'raiden-shogun'));
   it('ignores spacing/hyphens', () => ok('hutao', 'hu-tao'));
   it('matches a unique leading word', () => ok('raiden', 'raiden-shogun'));
   it('matches a unique leading word of a multi-word slug', () => ok('kaedehara', 'kaedehara-kazuha'));

   it('does not guess between ambiguous matches', () => {
      const r = resolveName(entries, 'aether');
      assert.equal(r.slug, null);
      assert.deepEqual(r.suggestions.sort(), ['aether-hydro', 'aether-pyro']);
   });

   it('suggests close spellings for typos', () => {
      const r = resolveName(entries, 'nahidaa');
      assert.equal(r.slug, null);
      assert.equal(r.suggestions[0], 'nahida');
   });

   it('returns nothing for unrelated input', () => {
      assert.deepEqual(resolveName(entries, 'zzzzzzzz'), { slug: null, suggestions: [] });
      assert.deepEqual(resolveName(entries, ''), { slug: null, suggestions: [] });
   });
});

describe('nameIncludes', () => {
   it('is a case-insensitive substring predicate on data.name', () => {
      const p = nameIncludes('  SHO ');
      assert.equal(p({ name: 'Raiden Shogun' }), true);
      assert.equal(p({ name: 'Nahida' }), false);
      assert.equal(p({}), false);
   });
});
