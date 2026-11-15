import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from './paginate.js';

const xs = Array.from({ length: 25 }, (_, i) => i);

describe('paginate', () => {
   it('returns the first page with a next_offset', () => {
      assert.deepEqual(paginate(xs, { limit: 10 }), { total: 25, offset: 0, items: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], next_offset: 10 });
   });
   it('returns null next_offset on the last page', () => {
      const p = paginate(xs, { limit: 10, offset: 20 });
      assert.deepEqual(p.items, [20, 21, 22, 23, 24]);
      assert.equal(p.next_offset, null);
   });
   it('handles offsets past the end', () => {
      assert.deepEqual(paginate(xs, { offset: 99 }), { total: 25, offset: 99, items: [], next_offset: null });
   });
});
