/**
 * Cross-entity name search. Aggregates each feature's search*() — it never
 * touches another feature's store directly.
 */
import { ValidationError } from '../../lib/errors.js';
import { searchCharacters } from '../characters/service.js';
import { searchWeapons } from '../weapons/service.js';
import { searchArtifacts } from '../artifacts/service.js';
import { searchMaterials } from '../materials/service.js';
import { searchEnemies } from '../enemies/service.js';

export const MIN_QUERY_LENGTH = 2;

/**
 * @param {string} q - raw query
 * @returns {Promise<{ query: string, results: { characters, weapons, artifacts, materials, enemies } }>}
 * @throws {ValidationError} when the query is missing or shorter than MIN_QUERY_LENGTH
 */
export async function searchAll(q) {
   const query = typeof q === 'string' ? q.trim() : '';
   if (query.length < MIN_QUERY_LENGTH) {
      throw new ValidationError(`Query must be at least ${MIN_QUERY_LENGTH} characters.`);
   }
   const [characters, weapons, artifacts, materials, enemies] = await Promise.all([
      searchCharacters(query),
      searchWeapons(query),
      searchArtifacts(query),
      searchMaterials(query),
      searchEnemies(query),
   ]);
   return { query, results: { characters, weapons, artifacts, materials, enemies } };
}
