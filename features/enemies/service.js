/** Enemies — all logic lives here. No HTTP (req/res) and no MCP types. */
import { enemyStore, queryEnemies } from './store.js';
import { sortResults } from '../../lib/sort.js';
import { resolveName, resolveOrThrow, matchesSearchTerm } from '../../lib/nameResolver.js';

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
   return (await enemyStore.query(matchesSearchTerm(term))).map(toSearchResult);
}

export async function countEnemies() {
   return (await enemyStore.getAll()).length;
}

/** Brief shape for model-facing lists. */
export function toBrief({ slug, data }) {
   return { key: slug, name: data.name, type: data.type };
}

/** @throws {NotFoundError} with suggestions */
export async function resolveEnemy(name) {
   return resolveOrThrow(await enemyStore.getAll(), name, 'enemy');
}

/** Full record (small): description, type, drops. */
export function describeEnemy({ slug, data }) {
   return { key: slug, ...data };
}
