/**
 * Characters — all logic lives here. No HTTP (req/res) and no MCP types.
 * Consumed by ./rest.js, the search feature, and (Phase 1) the MCP tools.
 */
import { characterStore, queryCharacters } from './store.js';
import { sortResults } from '../../lib/sort.js';
import { resolveName, resolveOrThrow, nameIncludes } from '../../lib/nameResolver.js';
import { omitKeys, pick } from '../../lib/objects.js';

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

/** Distinct weapon types characters wield (e.g. "Sword"). */
export const listCharacterWeaponTypes = () => characterStore.getDistinct('weapon');

/** Distinct rarities in the roster, ascending. */
export const listCharacterRarities = () => characterStore.getDistinct('rarity');

/** Brief shape for model-facing lists: identity fields only, no images. */
export function toBrief({ slug, data }) {
   return {
      key: slug,
      name: data.name,
      element: data.vision,
      weapon: data.weapon,
      nation: data.nation,
      rarity: data.rarity,
   };
}

/**
 * Sections of a character record that callers can ask for. A full record is ~20 KB,
 * so model-facing callers should request only what they need.
 */
export const CHARACTER_SECTIONS = {
   overview: (d) => ({
      ...pick(d, ['name', 'title', 'vision', 'weapon', 'nation', 'affiliation', 'rarity', 'constellation', 'birthday']),
      description: d.description,
   }),
   talents: (d) => ({
      skillTalents: omitKeys(d.skillTalents ?? [], ['img', 'upgrades']),
      passiveTalents: omitKeys(d.passiveTalents ?? [], ['img']),
   }),
   constellations: (d) => ({ constellations: omitKeys(d.constellations ?? [], ['img']) }),
   ascension_costs: (d) => ({ ascension_costs: d.ascension_costs ?? [] }),
   talent_costs: (d) => ({ talent_costs: d.talent_costs ?? {} }),
   images: (d) => ({ img: d.img ?? {} }),
};

/**
 * Loose name → entry. Throws NotFoundError (with suggestions) when there's no confident match.
 * @returns {Promise<{slug: string, data: object}>}
 */
export async function resolveCharacter(name) {
   return resolveOrThrow(await characterStore.getAll(), name, 'character');
}

/**
 * Builds a response containing only the requested sections.
 * @param {{slug, data}} entry
 * @param {Array<keyof CHARACTER_SECTIONS>} [sections] - defaults to ['overview']
 */
export function describeCharacter({ slug, data }, sections = ['overview']) {
   return Object.assign({ key: slug }, ...sections.map((s) => CHARACTER_SECTIONS[s](data)));
}
