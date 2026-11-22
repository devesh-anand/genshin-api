import fs from 'fs';
import path from 'path';
import { createDataStore } from '../../lib/dataStore.js';
import { DATA_DIR, dataDir } from '../../lib/paths.js';

/** Data access only. Other features must go through ./service.js, not this file. */
export const weaponStore = createDataStore(dataDir('weapons'));

let curves = null;

/**
 * data/weapon-curves.json — stat growth multipliers per level (index 0 = level 1), written by
 * scripts/add-weapon-stats.mjs. Read once, on first use.
 * @returns {Record<string, number[]>}
 */
export function weaponCurves() {
   curves ??= JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'weapon-curves.json'), 'utf-8')).curves;
   return curves;
}

export function queryWeapons({ type, rarity } = {}) {
   return weaponStore.query((w) => {
      if (type   && w.type?.toLowerCase() !== type.toLowerCase()) return false;
      if (rarity && w.rarity !== Number(rarity))                  return false;
      return true;
   });
}
