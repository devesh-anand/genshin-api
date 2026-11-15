import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFamily } from './inventory.js';

// A 3-tier family, crafted 3 → 1, 10/20 Mora per craft.
const fam = (needs, owned) =>
   needs.map((need, i) => ({
      key: `t${i + 1}`, tier: i + 1, need, owned: owned[i],
      craft: i ? { quantity: 3, mora: 10 * i } : undefined,
   }));
const pick = (rows, k) => rows.map((r) => r[k]);

describe('resolveFamily', () => {
   it('uses owned items first, without crafting', () => {
      const r = resolveFamily(fam([3, 5, 2], [3, 5, 2]));
      assert.deepEqual(pick(r, 'missing'), [0, 0, 0]);
      assert.deepEqual(pick(r, 'crafts'), [0, 0, 0]);
   });

   it('crafts surplus upward to cover shortfalls', () => {
      // 12 t1 (need 3) → 9 spare → 3 t2; t2 need 5, own 1 → 1 + 3 = 4 → 1 missing
      const r = resolveFamily(fam([3, 5, 0], [12, 1, 0]));
      assert.deepEqual(pick(r, 'crafted'), [0, 3, 0]);
      assert.deepEqual(pick(r, 'missing'), [0, 1, 0]);
      assert.deepEqual(pick(r, 'crafts'), [0, 3, 0]);
      assert.equal(r[1].craft_mora, 30);
   });

   it('chains crafts across tiers and charges only for crafts needed', () => {
      // 27 t1 → 9 t2 → 3 t3. Need only 1 t3: needs 1 t3 craft (3 t2) → 3 t2 crafts (9 t1)
      const r = resolveFamily(fam([0, 0, 1], [27, 0, 0]));
      assert.deepEqual(pick(r, 'missing'), [0, 0, 0]);
      assert.deepEqual(pick(r, 'crafts'), [0, 3, 1]);
      assert.equal(r[1].craft_mora + r[2].craft_mora, 3 * 10 + 1 * 20);
   });

   it('never crafts away items its own tier needs', () => {
      const r = resolveFamily(fam([10, 5, 0], [10, 0, 0]));
      assert.deepEqual(pick(r, 'missing'), [0, 5, 0]);
      assert.deepEqual(pick(r, 'crafts'), [0, 0, 0]);
   });

   it('reports everything missing with an empty inventory', () => {
      assert.deepEqual(pick(resolveFamily(fam([3, 21, 38], [0, 0, 0])), 'missing'), [3, 21, 38]);
   });
});
