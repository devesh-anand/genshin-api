import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchAll } from './service.js';
import { ValidationError } from '../../lib/errors.js';

describe('search service', () => {
   it('rejects missing or too-short queries', async () => {
      for (const q of [undefined, '', ' a ', ['ab']]) {
         await assert.rejects(searchAll(q), ValidationError);
      }
   });

   it('trims the query and searches every entity type', async () => {
      const r = await searchAll('  nahida ');
      assert.equal(r.query, 'nahida');
      assert.deepEqual(Object.keys(r.results), ['characters', 'weapons', 'artifacts', 'materials', 'enemies']);
      assert.ok(r.results.characters.some((c) => c.key === 'nahida'));
   });
});

describe('search service: options', () => {
   it('limits per type and reports totals', async () => {
      const r = await searchAll('ra', { limit: 2 });
      for (const [t, items] of Object.entries(r.results)) {
         assert.ok(items.length <= 2, t);
         assert.ok(r.totals[t] >= items.length, t);
      }
   });

   it('restricts to the requested types and rejects unknown ones', async () => {
      assert.deepEqual(Object.keys((await searchAll('ra', { types: ['weapons'] })).results), ['weapons']);
      await assert.rejects(searchAll('ra', { types: ['spells'] }), ValidationError);
   });

   it('without options keeps the REST response shape (no totals)', async () => {
      assert.equal((await searchAll('nahida')).totals, undefined);
   });
});
