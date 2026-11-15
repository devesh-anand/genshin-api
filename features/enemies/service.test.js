// Runs against the real data/ directory — invariants only, no exact counts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as svc from './service.js';

describe('enemies service', () => {
   it('listEnemies returns entries and filters case-insensitively', async () => {
      const all = await svc.listEnemies();
      assert.ok(all.length > 0);
      const value = all.find((e) => e.data.type != null)?.data.type;
      if (value != null) {
         const filtered = await svc.listEnemies({ type: String(value).toUpperCase() });
         assert.ok(filtered.length > 0);
         assert.ok(filtered.every((e) => String(e.data.type).toLowerCase() === String(value).toLowerCase()));
      }
   });

   it('listEnemies sorts by name', async () => {
      const names = (await svc.listEnemies({ sort: 'name' })).map((e) => e.data.name).filter(Boolean);
      assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
   });

   it('getEnemy returns the full record, or null', async () => {
      assert.equal((await svc.getEnemy('abyss-herald-frost-fall'))?.constructor, Object);
      assert.equal(await svc.getEnemy('definitely-not-real'), null);
   });

   it('findEnemy resolves its own display name', async () => {
      const entry = await svc.getEnemy('abyss-herald-frost-fall');
      const { slug } = await svc.findEnemy(entry.name);
      assert.ok(slug, 'expected a confident match');
      assert.equal((await svc.getEnemy(slug)).name, entry.name);
   });

   it('toSummary has a stable shape', async () => {
      const [entry] = await svc.listEnemies();
      assert.deepEqual(Object.keys(svc.toSummary(entry)), ['key', 'name', 'type', 'img']);
   });
});

describe('enemies service: model-facing helpers', () => {
   it('resolveEnemy finds entries by display name, or throws NotFoundError', async () => {
      const [first] = await svc.listEnemies();
      const resolved = await svc.resolveEnemy(first.data.name).catch((e) => e);
      // Display names can be shared (→ ambiguous), so accept a match or a suggestion that includes it.
      assert.ok(resolved.slug === first.slug || resolved.suggestions?.includes(first.slug), JSON.stringify(resolved));
      await assert.rejects(svc.resolveEnemy('zzzzzzzzzz'), (e) => e.status === 404);
   });

   it('describeEnemy includes the key', async () => {
      const [first] = await svc.listEnemies();
      assert.equal(svc.describeEnemy(first).key, first.slug);
   });
});
