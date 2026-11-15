import { createDataStore } from '../../lib/dataStore.js';
import { dataDir } from '../../lib/paths.js';

/** Data access only. Other features must go through ./service.js, not this file. */
export const enemyStore = createDataStore(dataDir('enemies'));

export function queryEnemies({ type } = {}) {
   return enemyStore.query((e) => {
      if (type && e.type?.toLowerCase() !== type.toLowerCase()) return false;
      return true;
   });
}
