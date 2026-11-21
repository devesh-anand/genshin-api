import { countCharacters } from '../characters/service.js';
import { countWeapons } from '../weapons/service.js';
import { countArtifacts } from '../artifacts/service.js';
import { countMaterials } from '../materials/service.js';
import { countEnemies } from '../enemies/service.js';
import { getShowcaseCacheStats } from '../showcase/service.js';

const startTime = Date.now();

export async function getHealth() {
   const [characters, weapons, artifacts, materials, enemies] = await Promise.all([
      countCharacters(),
      countWeapons(),
      countArtifacts(),
      countMaterials(),
      countEnemies(),
   ]);
   return {
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      counts: { characters, weapons, artifacts, materials, enemies },
      showcase_cache: getShowcaseCacheStats(),
   };
}
