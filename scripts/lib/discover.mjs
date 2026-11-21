/**
 * Shared discovery utilities for the sync framework.
 *
 * yatta.moe's list endpoint sometimes lags behind its own detail endpoints, so characters are
 * also probed by ID — but only inside the range the list already covers, never past the newest
 * listed ID, and only characters whose release time has passed are returned (isReleased).
 * Unreleased content must never reach data/ (CLAUDE.md, "Content rules").
 */
import { USER_AGENT, isReleased } from './source.mjs';

export const YATTA = 'https://gi.yatta.moe/api/v2/en';
export const TRAVELER_IDS = new Set([10000005, 10000007]);

// Weapon IDs >= 100000 (310001, 350003, ...) are cosmetic Weapon Appearances
// (e.g. Stygian Onslaught rewards), not weapons: no stats, no levelling. Never sync them.
export const isWeaponSkin = id => Number(id) >= 100000;

// ── Shared fetch ──────────────────────────────────────────────────────────────

export async function fetchJSON(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === retries) return null;
      await sleep(500 * (attempt + 1));
    }
  }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Slug helpers ──────────────────────────────────────────────────────────────

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['''""()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const CHAR_SLUG_OVERRIDES = {
  'kamisato-ayaka': 'ayaka',
  'kamisato-ayato': 'ayato',
  'kujou-sara': 'sara',
  'yae-miko': 'yae',
  'kuki-shinobu': 'kuki',
  'arataki-itto': 'itto',
  'sangonomiya-kokomi': 'kokomi',
  'raiden-shogun': 'raiden',
  'kaedehara-kazuha': 'kazuha',
  'shikanoin-heizou': 'heizou',
};

export function charSlug(name) {
  const base = slugify(name);
  return CHAR_SLUG_OVERRIDES[base] ?? base;
}

// Characters excluded from auto-sync (none today — Manekin/Manekina are live and synced)
export const SKIP_CHAR_SLUGS = new Set();

// ── Character discovery ───────────────────────────────────────────────────────

/**
 * Released characters on yatta that are NOT yet in localSlugs.
 *
 *   1. The list: every entry whose release time has passed.
 *   2. Gaps: IDs between the lowest and highest listed ID that the list skips (it can lag behind
 *      the detail endpoint — e.g. Vesna 10000143 when the highest listed was 10000150). Each is
 *      fetched and kept only if it has a release time in the past.
 *
 * Never probes past the highest listed ID: anything there is upcoming content.
 * @returns {{ fromList: Array<{id, name, slug}>, fromProbe: Array<{id, name, slug}>, unreleased: Array<{id, name}> }}
 */
export async function discoverNewCharacters(localSlugs) {
  const listRes = await fetchJSON(`${YATTA}/avatar`);
  if (!listRes) throw new Error('Failed to fetch yatta character list');

  // Traveler variants appear as composite string IDs ("10000005-pyro") — match on the base ID
  const all = Object.values(listRes.data?.items ?? {})
    .filter(c => !TRAVELER_IDS.has(Number(String(c.id).split('-')[0])))
    .filter(c => !SKIP_CHAR_SLUGS.has(charSlug(c.name)));
  const unreleased = all.filter(c => !isReleased(c)).map(c => ({ id: c.id, name: c.name }));
  const listed = all.filter(c => isReleased(c));

  // Every listed ID (released or not), so gaps are only IDs the list really skips
  const listedIds = new Set(all.map(c => c.id).filter(Number.isInteger));

  // Gaps inside the listed range only — never past the highest listed ID
  const minId = Math.min(...listedIds);
  const maxId = Math.max(...listedIds);
  const candidates = [];
  for (let id = minId; id <= maxId; id++) {
    if (!listedIds.has(id) && !TRAVELER_IDS.has(id)) candidates.push(id);
  }

  // Also include listed characters that aren't local yet (no probing needed)
  const newFromList = listed.filter(c => !localSlugs.has(charSlug(c.name)));

  // Probe candidates: check detail endpoint
  const newFromProbe = [];
  for (const id of candidates) {
    const res = await fetchJSON(`${YATTA}/avatar/${id}`);
    if (res?.data?.name) {
      const name = res.data.name;
      if (!isReleased(res.data)) { unreleased.push({ id, name }); await sleep(200); continue; }
      const slug = charSlug(name);
      if (!SKIP_CHAR_SLUGS.has(slug) && !localSlugs.has(slug)) {
        newFromProbe.push({ id, name, slug });
      }
    }
    await sleep(200);
  }

  return {
    fromList: newFromList.map(c => ({ id: c.id, name: c.name, slug: charSlug(c.name) })),
    fromProbe: newFromProbe,
    unreleased,
  };
}

// ── Simple list-based discovery for weapons / materials / enemies ─────────────

export async function discoverNew(entity, localSlugs, slugFn = slugify) {
  const res = await fetchJSON(`${YATTA}/${entity}`);
  if (!res) throw new Error(`Failed to fetch yatta ${entity} list`);
  const items = Object.values(res.data?.items ?? {})
    .filter(i => !(entity === 'weapon' && isWeaponSkin(i.id)));
  return items
    .map(i => ({ ...i, slug: slugFn(i.name) }))
    .filter(i => !localSlugs.has(i.slug));
}
