// Runs against the real data/ directory — invariants only, no exact counts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as svc from './service.js';

describe('weapons service', () => {
   it('listWeapons returns entries and filters case-insensitively', async () => {
      const all = await svc.listWeapons();
      assert.ok(all.length > 0);
      const value = all.find((e) => e.data.type != null)?.data.type;
      if (value != null) {
         const filtered = await svc.listWeapons({ type: String(value).toUpperCase() });
         assert.ok(filtered.length > 0);
         assert.ok(filtered.every((e) => String(e.data.type).toLowerCase() === String(value).toLowerCase()));
      }
   });

   it('listWeapons sorts by name', async () => {
      const names = (await svc.listWeapons({ sort: 'name' })).map((e) => e.data.name).filter(Boolean);
      assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
   });

   it('getWeapon returns the full record, or null', async () => {
      assert.equal((await svc.getWeapon('a-teaspoon-of-transcendence'))?.constructor, Object);
      assert.equal(await svc.getWeapon('definitely-not-real'), null);
   });

   it('findWeapon resolves its own display name', async () => {
      const entry = await svc.getWeapon('a-teaspoon-of-transcendence');
      const { slug } = await svc.findWeapon(entry.name);
      assert.ok(slug, 'expected a confident match');
      assert.equal((await svc.getWeapon(slug)).name, entry.name);
   });

   it('toSummary has a stable shape', async () => {
      const [entry] = await svc.listWeapons();
      assert.deepEqual(Object.keys(svc.toSummary(entry)), ['key', 'name', 'rarity', 'type', 'sub_stat', 'passive_name', 'img']);
   });
});

describe('weapons service: model-facing helpers', () => {
   it('resolveWeapon accepts loose names', async () => {
      assert.equal((await svc.resolveWeapon('mistsplitter')).slug, 'mistsplitter-reforged');
      await assert.rejects(svc.resolveWeapon('zzzzzzzz'), (e) => e.status === 404);
   });

   it('every section works on every weapon', async () => {
      const sections = Object.keys(svc.WEAPON_SECTIONS);
      for (const entry of await svc.listWeapons()) assert.equal(svc.describeWeapon(entry, sections).key, entry.slug);
   });

   it('default description is the overview only', async () => {
      const d = svc.describeWeapon(await svc.resolveWeapon('mistsplitter'));
      assert.ok(d.passive_desc);
      assert.equal(d.ascension_costs, undefined);
   });
});
