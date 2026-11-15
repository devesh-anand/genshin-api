import { createDataStore } from '../../lib/dataStore.js';
import { dataDir } from '../../lib/paths.js';

/** Data access only. Other features must go through ./service.js, not this file. */
export const artifactStore = createDataStore(dataDir('artifacts'));

export function queryArtifacts({ rarity } = {}) {
   return artifactStore.query((a) => {
      if (rarity && a.rarity !== Number(rarity)) return false;
      return true;
   });
}
