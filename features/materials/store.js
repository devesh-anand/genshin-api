import { createDataStore } from '../../lib/dataStore.js';
import { dataDir } from '../../lib/paths.js';

/** Data access only. Other features must go through ./service.js, not this file. */
export const materialStore = createDataStore(dataDir('materials'));

export function queryMaterials({ category, rarity } = {}) {
   return materialStore.query((m) => {
      if (category && m.category?.toLowerCase() !== category.toLowerCase()) return false;
      if (rarity  && m.rarity !== Number(rarity))                          return false;
      return true;
   });
}
