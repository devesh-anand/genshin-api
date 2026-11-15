/** Artifact sets — all logic lives here. No HTTP (req/res) and no MCP types. */
import { artifactStore, queryArtifacts } from './store.js';
import { sortResults } from '../../lib/sort.js';
import { resolveName, resolveOrThrow, nameIncludes } from '../../lib/nameResolver.js';
import { omitKeys } from '../../lib/objects.js';

export const SORT_FIELDS = {
   name:   'name',
   rarity: 'rarity',
};

export function toSummary({ slug, data }) {
   return {
      key: slug,
      name: data.name,
      rarity: data.rarity,
      bonus: data.bonus,
      img: data.pieces?.flower?.img ?? null,
   };
}

export function toSearchResult({ slug, data }) {
   return {
      key: slug,
      name: data.name,
      rarity: data.rarity,
      img: data.pieces?.flower?.img ?? null,
   };
}

/** @param {{ rarity?, sort?: keyof SORT_FIELDS, order?: 'asc'|'desc' }} [opts] */
export async function listArtifacts({ rarity, sort, order } = {}) {
   return sortResults(await queryArtifacts({ rarity }), SORT_FIELDS[sort] ?? null, order);
}

export const getArtifact = (slug) => artifactStore.getOne(slug);

export async function findArtifact(name) {
   return resolveName(await artifactStore.getAll(), name);
}

export async function searchArtifacts(term) {
   return (await artifactStore.query(nameIncludes(term))).map(toSearchResult);
}

export async function countArtifacts() {
   return (await artifactStore.getAll()).length;
}

export const listArtifactRarities = () => artifactStore.getDistinct('rarity');

/** Brief shape for model-facing lists — includes set bonuses, since that's what people pick sets by. */
export function toBrief({ slug, data }) {
   return { key: slug, name: data.name, rarity: data.rarity, bonus: data.bonus };
}

/** @throws {NotFoundError} with suggestions */
export async function resolveArtifact(name) {
   return resolveOrThrow(await artifactStore.getAll(), name, 'artifact set');
}

/** Full set (records are small), with piece images only when asked. */
export function describeArtifact({ slug, data }, { images = false } = {}) {
   return { key: slug, ...(images ? data : omitKeys(data, ['img'])) };
}
