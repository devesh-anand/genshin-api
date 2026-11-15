import path from 'path';
import { createDataStore } from '../../lib/dataStore.js';

export const enemyStore = createDataStore(path.join(path.resolve(), 'data/enemies'));

export function queryEnemies({ type } = {}) {
   return enemyStore.query((e) => {
      if (type && e.type?.toLowerCase() !== type.toLowerCase()) return false;
      return true;
   });
}
