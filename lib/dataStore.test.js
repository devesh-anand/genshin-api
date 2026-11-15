import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDataStore } from '../dataStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

// One store instance shared across all tests (mirrors production singleton pattern)
const store = createDataStore(FIXTURES);

describe('dataStore', () => {
   describe('getAll()', () => {
      it('returns all entries', async () => {
         const all = await store.getAll();
         assert.equal(all.length, 3);
      });

      it('each entry has slug and data', async () => {
         const all = await store.getAll();
         for (const entry of all) {
            assert.ok(typeof entry.slug === 'string');
            assert.ok(typeof entry.data === 'object');
         }
      });
   });

   describe('getOne()', () => {
      it('returns data for a known slug', async () => {
         const data = await store.getOne('nahida');
         assert.equal(data.name, 'Nahida');
         assert.equal(data.vision, 'Dendro');
      });

      it('returns null for an unknown slug', async () => {
         const data = await store.getOne('does-not-exist');
         assert.equal(data, null);
      });
   });

   describe('query()', () => {
      it('returns all entries when predicate always returns true', async () => {
         const results = await store.query(() => true);
         assert.equal(results.length, 3);
      });

      it('filters by a single field', async () => {
         const results = await store.query((d) => d.vision === 'Dendro');
         assert.equal(results.length, 2);
         assert.ok(results.every((r) => r.data.vision === 'Dendro'));
      });

      it('filters by multiple fields', async () => {
         const results = await store.query(
            (d) => d.vision === 'Dendro' && d.rarity === 5
         );
         assert.equal(results.length, 1);
         assert.equal(results[0].slug, 'nahida');
      });

      it('returns empty array when nothing matches', async () => {
         const results = await store.query((d) => d.nation === 'Mondstadt');
         assert.equal(results.length, 0);
      });

      it('each result has slug and data', async () => {
         const results = await store.query(() => true);
         for (const r of results) {
            assert.ok(typeof r.slug === 'string');
            assert.ok(typeof r.data === 'object');
         }
      });
   });

   describe('getDistinct()', () => {
      it('returns unique sorted values for a field', async () => {
         const visions = await store.getDistinct('vision');
         assert.deepEqual(visions, ['Dendro', 'Hydro']);
      });

      it('returns all unique values without duplicates', async () => {
         const nations = await store.getDistinct('nation');
         assert.deepEqual(nations, ['Fontaine', 'Sumeru']);
      });

      it('returns unique numeric values', async () => {
         const rarities = await store.getDistinct('rarity');
         assert.deepEqual(rarities, [4, 5]);
      });

      it('returns empty array for a field that does not exist', async () => {
         const result = await store.getDistinct('nonexistent');
         assert.deepEqual(result, []);
      });
   });
});
