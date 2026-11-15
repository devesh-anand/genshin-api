// Runs against the real data/ directory — invariants only, no exact counts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as svc from './service.js';

describe('artifacts service', () => {
   it('listArtifacts returns entries and filters case-insensitively', async () => {
      const all = await svc.listArtifacts();
      assert.ok(all.length > 0);
      const value = all.find((e) => e.data.rarity != null)?.data.rarity;
      if (value != null) {
         const filtered = await svc.listArtifacts({ rarity: String(value).toUpperCase() });
         assert.ok(filtered.length > 0);
         assert.ok(filtered.every((e) => String(e.data.rarity).toLowerCase() === String(value).toLowerCase()));
      }
   });

   it('listArtifacts sorts by name', async () => {
      const names = (await svc.listArtifacts({ sort: 'name' })).map((e) => e.data.name).filter(Boolean);
      assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
   });

   it('getArtifact returns the full record, or null', async () => {
      assert.equal((await svc.getArtifact('a-day-carved-from-rising-winds'))?.constructor, Object);
      assert.equal(await svc.getArtifact('definitely-not-real'), null);
   });

   it('findArtifact resolves its own display name', async () => {
      const entry = await svc.getArtifact('a-day-carved-from-rising-winds');
      const { slug } = await svc.findArtifact(entry.name);
      assert.ok(slug, 'expected a confident match');
      assert.equal((await svc.getArtifact(slug)).name, entry.name);
   });

   it('toSummary has a stable shape', async () => {
      const [entry] = await svc.listArtifacts();
      assert.deepEqual(Object.keys(svc.toSummary(entry)), ['key', 'name', 'rarity', 'bonus', 'img']);
   });
});
