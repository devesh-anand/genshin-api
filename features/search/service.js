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

const SEARCHERS = {
   characters: searchCharacters,
   weapons: searchWeapons,
   artifacts: searchArtifacts,
   materials: searchMaterials,
   enemies: searchEnemies,
};

/** Entity types search can cover, in response order. */
export const SEARCH_TYPES = Object.keys(SEARCHERS);

/**
 * @param {string} q - raw query
 * @param {{ types?: string[], limit?: number }} [opts]
 *   types - limit to some entity types (default: all)
 *   limit - max results per type (default: unlimited); when set, `totals` reports full counts
 * @returns {Promise<{ query: string, results: Record<string, object[]>, totals?: Record<string, number> }>}
 * @throws {ValidationError} when the query is missing/too short or a type is unknown
 */
export async function searchAll(q, { types = SEARCH_TYPES, limit } = {}) {
   const query = typeof q === 'string' ? q.trim() : '';
   if (query.length < MIN_QUERY_LENGTH) {
      throw new ValidationError(`Query must be at least ${MIN_QUERY_LENGTH} characters.`);
   }
   const unknown = types.filter((t) => !SEARCHERS[t]);
   if (unknown.length) {
      throw new ValidationError(`Unknown search type(s): ${unknown.join(', ')}. Valid: ${SEARCH_TYPES.join(', ')}.`);
   }
   const selected = SEARCH_TYPES.filter((t) => types.includes(t));
   const found = await Promise.all(selected.map((t) => SEARCHERS[t](query)));
   const results = Object.fromEntries(selected.map((t, i) => [t, limit ? found[i].slice(0, limit) : found[i]]));
   if (!limit) return { query, results };
   return { query, results, totals: Object.fromEntries(selected.map((t, i) => [t, found[i].length])) };
}
