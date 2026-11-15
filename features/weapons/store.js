import { createDataStore } from '../../lib/dataStore.js';
import { dataDir } from '../../lib/paths.js';

/** Data access only. Other features must go through ./service.js, not this file. */
export const weaponStore = createDataStore(dataDir('weapons'));

export function queryWeapons({ type, rarity } = {}) {
   return weaponStore.query((w) => {
      if (type   && w.type?.toLowerCase() !== type.toLowerCase()) return false;
      if (rarity && w.rarity !== Number(rarity))                  return false;
      return true;
   });
}
