/** Materials — all logic lives here. No HTTP (req/res) and no MCP types. */
import { materialStore, queryMaterials } from './store.js';
import { sortResults } from '../../lib/sort.js';
import { resolveName, resolveOrThrow, nameIncludes } from '../../lib/nameResolver.js';

export const SORT_FIELDS = {
   name:     'name',
   rarity:   'rarity',
   category: 'category',
};

export function toSummary({ slug, data }) {
   return {
      key: slug,
      name: data.name,
      rarity: data.rarity,
      category: data.category,
      img: data.img,
   };
}

// Search results currently share the summary shape.
export const toSearchResult = toSummary;

/** @param {{ category?, rarity?, sort?: keyof SORT_FIELDS, order?: 'asc'|'desc' }} [opts] */
export async function listMaterials({ category, rarity, sort, order } = {}) {
   return sortResults(await queryMaterials({ category, rarity }), SORT_FIELDS[sort] ?? null, order);
}

export const getMaterial = (slug) => materialStore.getOne(slug);

export async function findMaterial(name) {
   return resolveName(await materialStore.getAll(), name);
}

export const listMaterialCategories = () => materialStore.getDistinct('category');

export async function searchMaterials(term) {
   return (await materialStore.query(nameIncludes(term))).map(toSearchResult);
}

export async function countMaterials() {
   return (await materialStore.getAll()).length;
}

export const listMaterialRarities = () => materialStore.getDistinct('rarity');

/** Brief shape for model-facing lists. */
export function toBrief({ slug, data }) {
   return { key: slug, name: data.name, category: data.category, rarity: data.rarity };
}

/** @throws {NotFoundError} with suggestions */
export async function resolveMaterial(name) {
   return resolveOrThrow(await materialStore.getAll(), name, 'material');
}

/** Full record (small): description, where it drops, what uses it, source. */
export function describeMaterial({ slug, data }) {
   return { key: slug, ...data };
}
