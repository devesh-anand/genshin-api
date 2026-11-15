import path from 'path';
import { createDataStore } from '../../lib/dataStore.js';

const store = createDataStore(path.join(path.resolve(), 'data/characters'));

/**
 * Query characters with optional filters. All filters are case-insensitive.
 * Omit a field (or pass undefined) to skip that filter.
 *
 * @param {{ element?: string, weapon?: string, nation?: string, rarity?: string|number }} filters
 * @returns {Promise<Array<{ slug: string, data: object }>>}
 */
export function queryCharacters({ element, weapon, nation, rarity } = {}) {
   return store.query((char) => {
      if (element && char.vision?.toLowerCase() !== element.toLowerCase()) return false;
      if (weapon && char.weapon_type?.toLowerCase() !== weapon.toLowerCase()) return false;
      if (nation && char.nation?.toLowerCase() !== nation.toLowerCase()) return false;
      if (rarity && char.rarity !== Number(rarity)) return false;
      return true;
   });
}

export { store as characterStore };
