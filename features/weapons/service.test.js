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

describe('weapons service: stats by level', () => {
   it('every weapon has stats: one row per level plus a second row at each ascension', async () => {
      for (const { slug, data } of await svc.listWeapons()) {
         const s = svc.weaponStats(data);
         assert.ok(s, `${slug}: no stats`);
         assert.ok([70, 90].includes(s.max_level), `${slug}: max_level ${s.max_level}`);
         const ascensions = [20, 40, 50, 60, 70, 80].filter((l) => l < s.max_level).length;
         assert.equal(s.levels.length, s.max_level + ascensions, slug);
         assert.equal(s.levels.at(-1).ascension, ascensions, slug);
         // level 1 is the stored base ATK, rounded as the game shows it
         assert.ok(Math.abs(s.levels[0].atk - data.base_atk) < 1, `${slug}: L1 ${s.levels[0].atk} vs base_atk ${data.base_atk}`);
         // 1★/2★ weapons have no substat; everything else does
         assert.equal(s.sub_stat === null, data.rarity <= 2, `${slug}: sub_stat presence`);
      }
   });

   it('stats never go down as a weapon levels and ascends', async () => {
      for (const { slug, data } of await svc.listWeapons()) {
         const rows = svc.weaponStats(data).levels;
         for (let i = 1; i < rows.length; i++) {
            assert.ok(rows[i].atk >= rows[i - 1].atk, `${slug}: ATK drops at ${rows[i].level}`);
            if (rows[i].sub_stat !== null) assert.ok(rows[i].sub_stat >= rows[i - 1].sub_stat, `${slug}: substat drops at ${rows[i].level}`);
         }
      }
   });

   it('matches in-game values', async () => {
      const at = async (slug, level, ascension) =>
         svc.weaponStats(await svc.getWeapon(slug)).levels.find((r) => r.level === level && r.ascension === ascension);
      assert.deepEqual(await at('aqua-simulacra', 90, 6), { level: 90, ascension: 6, atk: 542, sub_stat: 88.2 });
      assert.equal((await at('aqua-simulacra', 20, 0)).atk, 110);
      assert.equal((await at('aqua-simulacra', 20, 1)).atk, 141); // ascending adds flat ATK, not substat
      assert.deepEqual(await at('primordial-jade-winged-spear', 90, 6), { level: 90, ascension: 6, atk: 674, sub_stat: 22.1 });
      assert.deepEqual(await at('dull-blade', 70, 4), { level: 70, ascension: 4, atk: 185, sub_stat: null });
      const em = svc.weaponStats(await svc.getWeapon('a-thousand-floating-dreams'));
      assert.deepEqual(em.sub_stat, { key: 'elemental_mastery', name: 'Elemental Mastery', percent: false });
      assert.equal(em.levels.at(-1).sub_stat, 265);
   });

   it('milestones keep level 1, both sides of each ascension, and max', async () => {
      const m = svc.weaponStatMilestones(await svc.getWeapon('aqua-simulacra'));
      assert.deepEqual(m.levels.map((r) => `${r.level}/${r.ascension}`),
         ['1/0', '20/0', '20/1', '40/1', '40/2', '50/2', '50/3', '60/3', '60/4', '70/4', '70/5', '80/5', '80/6', '90/6']);
   });

   it('getWeaponDetail adds stats to the full record; unknown slugs are null', async () => {
      const d = await svc.getWeaponDetail('aqua-simulacra');
      assert.equal(d.name, 'Aqua Simulacra');
      assert.equal(d.stats.levels.length, 96);
      assert.equal(await svc.getWeaponDetail('definitely-not-real'), null);
   });
});
