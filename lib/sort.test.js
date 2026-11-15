import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sortResults } from './sort.js';

const rows = [
   { slug: 'b', data: { name: 'Bee', rarity: 4 } },
   { slug: 'a', data: { name: 'Ant', rarity: 5 } },
   { slug: 'c', data: { name: 'Cat', rarity: null } },
];
const slugs = (r) => r.map((x) => x.slug);

describe('sortResults', () => {
   it('is a no-op without a field', () => assert.deepEqual(slugs(sortResults(rows, null)), ['b', 'a', 'c']));
   it('sorts strings ascending by default', () => assert.deepEqual(slugs(sortResults(rows, 'name')), ['a', 'b', 'c']));
   it('sorts numbers descending, nulls last', () => assert.deepEqual(slugs(sortResults(rows, 'rarity', 'desc')), ['a', 'b', 'c']));
   it('keeps nulls last when ascending', () => assert.deepEqual(slugs(sortResults(rows, 'rarity', 'asc')), ['b', 'a', 'c']));
   it('does not mutate its input', () => { sortResults(rows, 'name'); assert.equal(rows[0].slug, 'b'); });
});
