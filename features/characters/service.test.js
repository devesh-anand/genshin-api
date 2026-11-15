// Runs against the real data/ directory, so assertions are invariants
// (not exact counts) that survive the weekly data sync.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as svc from './service.js';

describe('characters service', () => {
   it('listCharacters filters case-insensitively', async () => {
      const pyro = await svc.listCharacters({ element: 'PYRO' });
      assert.ok(pyro.length > 0);
      assert.ok(pyro.every((c) => c.data.vision === 'Pyro'));
   });

   it('listCharacters combines filters', async () => {
      const r = await svc.listCharacters({ element: 'hydro', weapon: 'catalyst', rarity: '5' });
      assert.ok(r.every((c) => c.data.vision === 'Hydro' && c.data.weapon_type?.toLowerCase() === 'catalyst' && c.data.rarity === 5));
   });

   it('listCharacters sorts by public sort keys', async () => {
      const r = await svc.listCharacters({ sort: 'rarity', order: 'desc' });
      const rarities = r.map((c) => c.data.rarity).filter((x) => x != null);
      assert.deepEqual(rarities, [...rarities].sort((a, b) => b - a));
   });

   it('getCharacter returns the full record, or null', async () => {
      assert.equal((await svc.getCharacter('nahida')).name, 'Nahida');
      assert.equal(await svc.getCharacter('not-a-character'), null);
   });

   it('findCharacter resolves loose names', async () => {
      assert.equal((await svc.findCharacter('Nahida')).slug, 'nahida');
      assert.equal((await svc.findCharacter('hutao')).slug, 'hu-tao');
   });

   it('toSummary / toSearchResult have stable shapes', async () => {
      const [entry] = await svc.listCharacters({ element: 'dendro' });
      assert.deepEqual(Object.keys(svc.toSummary(entry)), ['key', 'name', 'title', 'vision', 'weapon', 'nation', 'rarity', 'img']);
      assert.deepEqual(Object.keys(svc.toSearchResult(entry)), ['key', 'name', 'vision', 'weapon', 'rarity', 'img']);
   });

   it('lists distinct elements and nations', async () => {
      assert.ok((await svc.listElements()).includes('Dendro'));
      assert.ok((await svc.listNations()).includes('Sumeru'));
   });
});

describe('characters service: model-facing helpers', () => {
   it('resolveCharacter returns the entry or throws NotFoundError with suggestions', async () => {
      assert.equal((await svc.resolveCharacter('Hu Tao')).slug, 'hu-tao');
      await assert.rejects(svc.resolveCharacter('nahidaa'), (e) => e.status === 404 && e.suggestions.includes('nahida'));
   });

   it('describeCharacter returns only the requested sections', async () => {
      const entry = await svc.resolveCharacter('nahida');
      assert.deepEqual(Object.keys(svc.describeCharacter(entry)).sort(),
         ['affiliation', 'birthday', 'constellation', 'description', 'key', 'name', 'nation', 'rarity', 'title', 'vision', 'weapon']);
      const costs = svc.describeCharacter(entry, ['talent_costs']);
      assert.deepEqual(Object.keys(costs), ['key', 'talent_costs']);
   });

   it('every section works on every character', async () => {
      const sections = Object.keys(svc.CHARACTER_SECTIONS);
      for (const entry of await svc.listCharacters()) {
         const d = svc.describeCharacter(entry, sections);
         assert.equal(d.key, entry.slug);
         assert.ok(!JSON.stringify(d.skillTalents ?? []).includes('"img"'), entry.slug);
      }
   });

   it('toBrief has a stable shape', async () => {
      const [entry] = await svc.listCharacters();
      assert.deepEqual(Object.keys(svc.toBrief(entry)), ['key', 'name', 'element', 'weapon', 'nation', 'rarity']);
   });
});
