import { createDataStore } from '../../lib/dataStore.js';
import { dataDir } from '../../lib/paths.js';

/** Data access only. Other features must go through ./service.js, not this file. */
export const characterStore = createDataStore(dataDir('characters'));

/**
 * Query characters with optional filters. All filters are case-insensitive.
 * Omit a field (or pass undefined) to skip that filter.
 *
 * @param {{ element?: string, weapon?: string, nation?: string, rarity?: string|number }} filters
 * @returns {Promise<Array<{ slug: string, data: object }>>}
 */
export function queryCharacters({ element, weapon, nation, rarity } = {}) {
   return characterStore.query((char) => {
      if (element && char.vision?.toLowerCase() !== element.toLowerCase()) return false;
      if (weapon && char.weapon_type?.toLowerCase() !== weapon.toLowerCase()) return false;
      if (nation && char.nation?.toLowerCase() !== nation.toLowerCase()) return false;
      if (rarity && char.rarity !== Number(rarity)) return false;
      return true;
   });
}
