/**
 * Characters — all logic lives here. No HTTP (req/res) and no MCP types.
 * Consumed by ./rest.js, the search feature, and (Phase 1) the MCP tools.
 */
import { characterStore, queryCharacters } from './store.js';
import { sortResults } from '../../lib/sort.js';
import { resolveName, nameIncludes } from '../../lib/nameResolver.js';

/** Public sort keys → data fields. */
export const SORT_FIELDS = {
   name:    'name',
   rarity:  'rarity',
   element: 'vision',
   nation:  'nation',
   weapon:  'weapon',
};

/** Summary shape (REST ?details=true). */
export function toSummary({ slug, data }) {
   return {
      key: slug,
      name: data.name,
      title: data.title,
      vision: data.vision,
      weapon: data.weapon,
      nation: data.nation,
      rarity: data.rarity,
      img: data.img,
   };
}

/** Compact shape used in cross-entity search results. */
export function toSearchResult({ slug, data }) {
   return {
      key: slug,
      name: data.name,
      vision: data.vision,
      weapon: data.weapon,
      rarity: data.rarity,
      img: data.img?.icon ?? null,
   };
}

/**
 * @param {{ element?, weapon?, nation?, rarity?, sort?: keyof SORT_FIELDS, order?: 'asc'|'desc' }} [opts]
 * @returns {Promise<Array<{slug, data}>>}
 */
export async function listCharacters({ element, weapon, nation, rarity, sort, order } = {}) {
   const results = await queryCharacters({ element, weapon, nation, rarity });
   return sortResults(results, SORT_FIELDS[sort] ?? null, order);
}

/** Full record by exact slug, or null. */
export const getCharacter = (slug) => characterStore.getOne(slug);

/** Loose name → { slug, suggestions } (see lib/nameResolver.js). */
export async function findCharacter(name) {
   return resolveName(await characterStore.getAll(), name);
}

export const listElements = () => characterStore.getDistinct('vision');
export const listNations = () => characterStore.getDistinct('nation');

export async function searchCharacters(term) {
   return (await characterStore.query(nameIncludes(term))).map(toSearchResult);
}

export async function countCharacters() {
   return (await characterStore.getAll()).length;
}
