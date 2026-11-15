import path from 'path';
import { createDataStore } from '../../lib/dataStore.js';

export const weaponStore = createDataStore(path.join(path.resolve(), 'data/weapons'));

export function queryWeapons({ type, rarity } = {}) {
   return weaponStore.query((w) => {
      if (type   && w.type?.toLowerCase() !== type.toLowerCase()) return false;
      if (rarity && w.rarity !== Number(rarity))                  return false;
      return true;
   });
}
