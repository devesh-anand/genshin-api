import path from 'path';
import { createDataStore } from '../../lib/dataStore.js';

export const artifactStore = createDataStore(path.join(path.resolve(), 'data/artifacts'));

export function queryArtifacts({ rarity } = {}) {
   return artifactStore.query((a) => {
      if (rarity && a.rarity !== Number(rarity)) return false;
      return true;
   });
}
