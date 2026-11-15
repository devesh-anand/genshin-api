import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { omitKeys, pick } from './objects.js';

describe('omitKeys', () => {
   it('removes keys at every depth without mutating input', () => {
      const input = { a: 1, img: 'x', list: [{ img: 'y', b: 2 }], nested: { img: 'z', c: { img: 1, d: 3 } } };
      assert.deepEqual(omitKeys(input, ['img']), { a: 1, list: [{ b: 2 }], nested: { c: { d: 3 } } });
      assert.equal(input.img, 'x');
   });
});

describe('pick', () => {
   it('keeps only present keys, in the given order', () => {
      assert.deepEqual(pick({ a: 1, b: 2, c: undefined }, ['c', 'b', 'z']), { b: 2 });
      assert.deepEqual(pick(null, ['a']), {});
   });
});
