import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getHealth } from './service.js';

describe('health service', () => {
   it('reports ok with non-zero counts for every dataset', async () => {
      const h = await getHealth();
      assert.equal(h.status, 'ok');
      assert.ok(Number.isInteger(h.uptime));
      for (const [k, n] of Object.entries(h.counts)) assert.ok(n > 0, `${k} count`);
   });
});
