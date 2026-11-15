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
