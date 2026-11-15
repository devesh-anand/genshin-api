/** Weapons — all logic lives here. No HTTP (req/res) and no MCP types. */
import { weaponStore, queryWeapons } from './store.js';
import { sortResults } from '../../lib/sort.js';
import { resolveName, resolveOrThrow, nameIncludes } from '../../lib/nameResolver.js';
import { pick } from '../../lib/objects.js';

export const SORT_FIELDS = {
   name:   'name',
   rarity: 'rarity',
   type:   'type',
};

export function toSummary({ slug, data }) {
   return {
      key: slug,
      name: data.name,
      rarity: data.rarity,
      type: data.type,
      sub_stat: data.sub_stat,
      passive_name: data.passive_name,
      img: data.img,
   };
}

export function toSearchResult({ slug, data }) {
   return {
      key: slug,
      name: data.name,
      type: data.type,
      rarity: data.rarity,
      img: data.img?.icon ?? null,
   };
}

/** @param {{ type?, rarity?, sort?: keyof SORT_FIELDS, order?: 'asc'|'desc' }} [opts] */
export async function listWeapons({ type, rarity, sort, order } = {}) {
   return sortResults(await queryWeapons({ type, rarity }), SORT_FIELDS[sort] ?? null, order);
}

export const getWeapon = (slug) => weaponStore.getOne(slug);

export async function findWeapon(name) {
   return resolveName(await weaponStore.getAll(), name);
}

export const listWeaponTypes = () => weaponStore.getDistinct('type');

export async function searchWeapons(term) {
   return (await weaponStore.query(nameIncludes(term))).map(toSearchResult);
}

export async function countWeapons() {
   return (await weaponStore.getAll()).length;
}

export const listWeaponRarities = () => weaponStore.getDistinct('rarity');

/** Brief shape for model-facing lists. */
export function toBrief({ slug, data }) {
   return { key: slug, name: data.name, type: data.type, rarity: data.rarity, sub_stat: data.sub_stat };
}

/** Sections of a weapon record that callers can ask for. */
export const WEAPON_SECTIONS = {
   overview: (d) => pick(d, ['name', 'type', 'rarity', 'base_atk', 'sub_stat', 'passive_name', 'passive_desc', 'description']),
   refinements: (d) => ({ passive_upgrades: d.passive_upgrades ?? [] }),
   ascension_costs: (d) => ({ ascension_costs: d.ascension_costs ?? [] }),
   images: (d) => ({ img: d.img ?? {} }),
};

/** @throws {NotFoundError} with suggestions */
export async function resolveWeapon(name) {
   return resolveOrThrow(await weaponStore.getAll(), name, 'weapon');
}

/** @param {Array<keyof WEAPON_SECTIONS>} [sections] - defaults to ['overview'] */
export function describeWeapon({ slug, data }, sections = ['overview']) {
   return Object.assign({ key: slug }, ...sections.map((s) => WEAPON_SECTIONS[s](data)));
}
