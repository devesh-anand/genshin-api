import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getGameInfo } from './service.js';

describe('info service', () => {
   it('lists valid filter values and non-zero counts', async () => {
      const info = await getGameInfo();
      assert.ok(info.elements.includes('Pyro'));
      assert.ok(info.weapon_types.includes('Sword'));
      assert.ok(info.material_categories.length > 0);
      for (const [k, n] of Object.entries(info.counts)) assert.ok(n > 0, k);
   });

   it('reports data freshness and the disclaimer', async () => {
      const info = await getGameInfo();
      assert.ok(info.data_last_synced === null || !Number.isNaN(Date.parse(info.data_last_synced)));
      assert.match(info.disclaimer, /not affiliated with HoYoverse/);
   });
});
