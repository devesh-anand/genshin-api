/** Enemies — all logic lives here. No HTTP (req/res) and no MCP types. */
import { enemyStore, queryEnemies } from './store.js';
import { sortResults } from '../../lib/sort.js';
import { resolveName, nameIncludes } from '../../lib/nameResolver.js';

export const SORT_FIELDS = {
   name: 'name',
   type: 'type',
};

export function toSummary({ slug, data }) {
   return {
      key: slug,
      name: data.name,
      type: data.type,
      img: data.img,
   };
}

// Search results currently share the summary shape.
export const toSearchResult = toSummary;

/** @param {{ type?, sort?: keyof SORT_FIELDS, order?: 'asc'|'desc' }} [opts] */
export async function listEnemies({ type, sort, order } = {}) {
   return sortResults(await queryEnemies({ type }), SORT_FIELDS[sort] ?? null, order);
}

export const getEnemy = (slug) => enemyStore.getOne(slug);

export async function findEnemy(name) {
   return resolveName(await enemyStore.getAll(), name);
}

export const listEnemyTypes = () => enemyStore.getDistinct('type');

export async function searchEnemies(term) {
   return (await enemyStore.query(nameIncludes(term))).map(toSearchResult);
}

export async function countEnemies() {
   return (await enemyStore.getAll()).length;
}
