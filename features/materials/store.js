import path from 'path';
import { createDataStore } from '../../lib/dataStore.js';

export const materialStore = createDataStore(path.join(path.resolve(), 'data/materials'));

export function queryMaterials({ category, rarity } = {}) {
   return materialStore.query((m) => {
      if (category && m.category?.toLowerCase() !== category.toLowerCase()) return false;
      if (rarity  && m.rarity !== Number(rarity))                          return false;
      return true;
   });
}
