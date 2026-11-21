/** Artifact sets — all logic lives here. No HTTP (req/res) and no MCP types. */
import { artifactStore, queryArtifacts } from './store.js';
import { sortResults } from '../../lib/sort.js';
import { resolveName, resolveOrThrow, matchesSearchTerm } from '../../lib/nameResolver.js';
import { ARTIFACT_ALIASES } from './aliases.js';

export { ARTIFACT_ALIASES };
import { omitKeys } from '../../lib/objects.js';
import { lazyIndex } from '../../lib/lazyIndex.js';

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

const bySetId = lazyIndex(artifactStore, (a) => (a.id ? Number(a.id) : null));

/** Artifact set by the game's set ID (as in Enka showcases, e.g. 15002), or null. */
export const findArtifactBySetId = (id) => bySetId(Number(id));

export async function findArtifact(name) {
   return resolveName(await artifactStore.getAll(), name, { aliases: ARTIFACT_ALIASES });
}

export async function searchArtifacts(term) {
   return (await artifactStore.query(matchesSearchTerm(term, ARTIFACT_ALIASES))).map(toSearchResult);
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
   return resolveOrThrow(await artifactStore.getAll(), name, 'artifact set', { aliases: ARTIFACT_ALIASES });
}

/** Full set (records are small), with piece images only when asked. */
export function describeArtifact({ slug, data }, { images = false } = {}) {
   return {
      key: slug,
      ...(ARTIFACT_ALIASES[slug] && { aliases: ARTIFACT_ALIASES[slug] }),
      ...(images ? data : omitKeys(data, ['img'])),
   };
}
