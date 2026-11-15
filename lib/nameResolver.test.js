import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveName, resolveOrThrow, slugify, nameIncludes, nameOrAliasIncludes } from './nameResolver.js';
import { NotFoundError } from './errors.js';

const entries = [
   { slug: 'raiden-shogun', data: { name: 'Raiden Shogun' } },
   { slug: 'hu-tao', data: { name: 'Hu Tao' } },
   { slug: 'aether-pyro', data: { name: 'Aether' } },
   { slug: 'aether-hydro', data: { name: 'Aether' } },
   { slug: 'kaedehara-kazuha', data: { name: 'Kaedehara Kazuha' } },
   { slug: 'nahida', data: { name: 'Nahida' } },
   { slug: 'navia', data: { name: 'Navia' } },
   { slug: 'zhongli', data: { name: 'Zhongli' } },
   { slug: 'emblem-of-severed-fate', data: { name: 'Emblem of Severed Fate' } },
   { slug: 'lumine-pyro', data: { name: 'Lumine' } },
   { slug: 'lumine-geo', data: { name: 'Lumine' } },
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

   it('auto-corrects a single clear typo', () => {
      ok('nahidaa', 'nahida');                                   // extra letter
      ok('emblem of severd fate', 'emblem-of-severed-fate');     // missing letter
      ok('zhonlgi', 'zhongli');                                  // swapped letters
      ok('Emblem of Severed Fat', 'emblem-of-severed-fate');
   });

   it('does not auto-correct when another name is nearly as close', () => {
      const twins = [
         { slug: 'crimson-stone', data: { name: 'Crimson Stone' } },
         { slug: 'crimson-stoke', data: { name: 'Crimson Stoke' } },
      ];
      const r = resolveName(twins, 'crimson stoie'); // 1 edit from both
      assert.equal(r.slug, null);
      assert.deepEqual(r.suggestions.sort(), ['crimson-stoke', 'crimson-stone']);
      ok('lumine pyr', 'lumine-pyro'); // the other Lumine is 3 edits away → safe
   });

   it('does not auto-correct short names (too easy to confuse)', () => {
      const r = resolveName(entries, 'navai'); // navia, 5 letters
      assert.equal(r.slug, null);
      assert.deepEqual(r.suggestions, ['navia']);
   });

   it('suggests instead of correcting when a runner-up is close or the typo is too big', () => {
      const close = resolveName(entries, 'nahdia'); // 1 from nahida, but only 2 from navia
      assert.equal(close.slug, null);
      assert.equal(close.suggestions[0], 'nahida');
      const far = resolveName(entries, 'nahiidaa'); // 2 edits on a short name
      assert.equal(far.slug, null);
      assert.equal(far.suggestions[0], 'nahida');
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

describe('resolveOrThrow', () => {
   it('returns the matching entry', () => {
      assert.equal(resolveOrThrow(entries, 'Hu Tao').slug, 'hu-tao');
   });

   it('throws NotFoundError listing suggestions', () => {
      assert.throws(() => resolveOrThrow(entries, 'aether', 'character'), (e) =>
         e instanceof NotFoundError && /Did you mean: aether-pyro, aether-hydro/.test(e.message) && e.suggestions.length === 2);
   });

   it('points to search when nothing is close', () => {
      assert.throws(() => resolveOrThrow(entries, 'zzzzzzzz', 'weapon'), /No weapon matches "zzzzzzzz". Try the search tool/);
   });
});

describe('aliases', () => {
   const aliases = { 'raiden-shogun': ['Ei', 'Baal'], 'hu-tao': ['Walnut'], 'lumine-pyro': ['Traveler'], 'lumine-geo': ['Traveler'] };
   const r = (q) => resolveName(entries, q, { aliases });

   it('resolve nicknames, case- and punctuation-insensitively', () => {
      assert.equal(r('Ei').slug, 'raiden-shogun');
      assert.equal(r('  baal!').slug, 'raiden-shogun');
      assert.equal(r('walnut').slug, 'hu-tao');
   });

   it('tolerate typos like names do', () => assert.equal(r('Walnuut').slug, 'hu-tao'));

   it('shared aliases are ambiguous, never a guess', () => {
      const t = r('traveler');
      assert.equal(t.slug, null);
      assert.deepEqual(t.suggestions.sort(), ['lumine-geo', 'lumine-pyro']);
   });

   it('names and slugs still win, and aliases are opt-in', () => {
      assert.equal(r('Hu Tao').slug, 'hu-tao');
      assert.equal(resolveName(entries, 'Ei').slug, null);
   });

   it('resolveOrThrow passes aliases through', () => {
      assert.equal(resolveOrThrow(entries, 'Ei', 'character', { aliases }).slug, 'raiden-shogun');
   });

   it('nameOrAliasIncludes matches names or nicknames', () => {
      const p = nameOrAliasIncludes('wal', aliases);
      assert.equal(p({ name: 'Hu Tao' }, 'hu-tao'), true);
      assert.equal(p({ name: 'Nahida' }, 'nahida'), false);
      assert.equal(nameOrAliasIncludes('nah', aliases)({ name: 'Nahida' }, 'nahida'), true);
   });
});
