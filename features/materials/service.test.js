// Runs against the real data/ directory — invariants only, no exact counts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as svc from './service.js';

describe('materials service', () => {
   it('listMaterials returns entries and filters case-insensitively', async () => {
      const all = await svc.listMaterials();
      assert.ok(all.length > 0);
      const value = all.find((e) => e.data.category != null)?.data.category;
      if (value != null) {
         const filtered = await svc.listMaterials({ category: String(value).toUpperCase() });
         assert.ok(filtered.length > 0);
         assert.ok(filtered.every((e) => String(e.data.category).toLowerCase() === String(value).toLowerCase()));
      }
   });

   it('listMaterials sorts by name', async () => {
      const names = (await svc.listMaterials({ sort: 'name' })).map((e) => e.data.name).filter(Boolean);
      assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
   });

   it('getMaterial returns the full record, or null', async () => {
      assert.equal((await svc.getMaterial('a-flower-yet-to-bloom'))?.constructor, Object);
      assert.equal(await svc.getMaterial('definitely-not-real'), null);
   });

   it('findMaterial resolves its own display name', async () => {
      const entry = await svc.getMaterial('a-flower-yet-to-bloom');
      const { slug } = await svc.findMaterial(entry.name);
      assert.ok(slug, 'expected a confident match');
      assert.equal((await svc.getMaterial(slug)).name, entry.name);
   });

   it('toSummary has a stable shape', async () => {
      const [entry] = await svc.listMaterials();
      assert.deepEqual(Object.keys(svc.toSummary(entry)), ['key', 'name', 'rarity', 'category', 'img']);
   });
});
