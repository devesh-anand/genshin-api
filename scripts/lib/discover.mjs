/**
 * Shared discovery utilities for the sync framework.
 *
 * Core problem: yatta.moe's list endpoint sometimes lags behind its own
 * detail endpoints — new characters appear at /avatar/{id} days before they
 * show up in /avatar. This module probes the gap so sync.mjs never misses
 * a newly released character.
 */

export const YATTA = 'https://gi.yatta.moe/api/v2/en';
export const TRAVELER_IDS = new Set([10000005, 10000007]);

// ── Shared fetch ──────────────────────────────────────────────────────────────

export async function fetchJSON(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'genshin-api-sync/1.0 (github.com/devesh-anand/genshin-api)' },
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

// Characters excluded from auto-sync (test/placeholder entries on yatta)
export const SKIP_CHAR_SLUGS = new Set(['manekin', 'manekina']);

// ── Character discovery ───────────────────────────────────────────────────────

/**
 * Returns all character IDs that exist on yatta but are NOT yet in localSlugs.
 *
 * Strategy:
 *   1. Fetch yatta list → extract listed IDs and find the max listed ID.
 *   2. Build the set of IDs we want to probe: every integer in
 *      [min_gap, max_listed + PROBE_AHEAD] that isn't already listed.
 *   3. Hit /avatar/{id} for each candidate; keep those that return valid data.
 *
 * This catches two cases:
 *   - Gap characters: IDs inside the listed range that yatta hasn't listed yet
 *     (e.g. Vesna 10000143 when max listed is 10000150).
 *   - Future characters: IDs above the current max (post-patch additions).
 */
export async function discoverNewCharacters(localSlugs) {
  const listRes = await fetchJSON(`${YATTA}/avatar`);
  if (!listRes) throw new Error('Failed to fetch yatta character list');

  const listed = Object.values(listRes.data?.items ?? {})
    .filter(c => !TRAVELER_IDS.has(c.id))
    .filter(c => !SKIP_CHAR_SLUGS.has(charSlug(c.name)));

  const listedIds = new Set(listed.map(c => c.id));

  // Find the range to probe: from the first ID that exists on yatta through max + PROBE_AHEAD
  const minId = Math.min(...listedIds);
  const maxId = Math.max(...listedIds);
  const PROBE_AHEAD = 20; // probe this many IDs beyond current max

  // Candidates: integers in [minId, maxId + PROBE_AHEAD] NOT already in the list
  const candidates = [];
  for (let id = minId; id <= maxId + PROBE_AHEAD; id++) {
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
  };
}

// ── Simple list-based discovery for weapons / materials / enemies ─────────────

export async function discoverNew(entity, localSlugs, slugFn = slugify) {
  const res = await fetchJSON(`${YATTA}/${entity}`);
  if (!res) throw new Error(`Failed to fetch yatta ${entity} list`);
  const items = Object.values(res.data?.items ?? {});
  return items
    .map(i => ({ ...i, slug: slugFn(i.name) }))
    .filter(i => !localSlugs.has(i.slug));
}
