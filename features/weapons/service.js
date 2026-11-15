/** Weapons — all logic lives here. No HTTP (req/res) and no MCP types. */
import { weaponStore, queryWeapons } from './store.js';
import { sortResults } from '../../lib/sort.js';
import { resolveName, nameIncludes } from '../../lib/nameResolver.js';

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
