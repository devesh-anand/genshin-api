import { NotFoundError } from './errors.js';

/**
 * Turns loose user / model input ("Raiden", "hu tao", "Mistsplitter") into a
 * known slug, or returns suggestions when there's no confident match.
 *
 * Used by services' find*() functions. REST /:name routes still use exact
 * slugs (to keep the public API stable); MCP tools use the resolver.
 */

/** "Hu Tao's  Bow!" → "hu-taos-bow" */
export function slugify(input) {
   return String(input ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
}

const compact = (s) => s.replace(/-/g, '');

/**
 * Edit distance where insert, delete, substitute and swapping two adjacent letters
 * each cost 1 (optimal string alignment), so "zhonlgi" is 1 away from "zhongli".
 * Stops early and returns Infinity once the distance must exceed `cap`.
 */
function distance(a, b, cap = Infinity) {
   if (Math.abs(a.length - b.length) > cap) return Infinity;
   let prev2 = new Uint16Array(b.length + 1);
   let prev = Uint16Array.from({ length: b.length + 1 }, (_, j) => j);
   let cur = new Uint16Array(b.length + 1);
   for (let i = 1; i <= a.length; i++) {
      cur[0] = i;
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
         let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
         if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
         cur[j] = v;
         if (v < rowMin) rowMin = v;
      }
      if (rowMin > cap) return Infinity;
      [prev2, prev, cur] = [prev, cur, prev2];
   }
   return prev[b.length];
}

/**
 * Normalised match keys per entry, cached on the (long-lived, in-memory) data object
 * so each lookup doesn't re-slugify hundreds of names.
 */
const keyCache = new WeakMap();
function candidateFor({ slug, data }) {
   let cached = data && typeof data === 'object' ? keyCache.get(data) : undefined;
   if (!cached || cached.slug !== slug) {
      const keys = [...new Set([slug, slugify(data?.name)].filter(Boolean))];
      cached = { slug, keys, compactKeys: keys.map(compact) };
      if (data && typeof data === 'object') keyCache.set(data, cached);
   }
   return cached;
}

/**
 * Edits tolerated when auto-correcting a typo, by query length (letters only):
 * short names are too easy to confuse ("navia" vs "nahida"), so they get none.
 */
function typoAllowance(length) {
   if (length >= 12) return 2;
   if (length >= 6) return 1;
   return 0;
}

/**
 * @param {Array<{slug: string, data: {name?: string}}>} entries - e.g. store.getAll()
 * @param {string} input
 * @param {{ maxSuggestions?: number }} [opts]
 * @returns {{ slug: string|null, suggestions: string[] }}
 *   slug is set only for a confident match (incl. a clear single-typo match);
 *   otherwise suggestions holds the closest slugs.
 */
export function resolveName(entries, input, { maxSuggestions = 5 } = {}) {
   const q = slugify(input);
   if (!q) return { slug: null, suggestions: [] };

   const candidates = entries.map(candidateFor);

   const qc = compact(q);
   const unique = (list) => (list.length === 1 ? { slug: list[0].slug, suggestions: [] } : null);
   // Ambiguous exact-ish matches are all equally valid, so list more of them than typo suggestions.
   const ambiguous = (list) => ({ slug: null, suggestions: list.slice(0, Math.max(maxSuggestions, 10)).map((c) => c.slug) });

   // 1. exact slug always wins
   const bySlug = candidates.find((c) => c.slug === q);
   if (bySlug) return { slug: bySlug.slug, suggestions: [] };

   // 2-5. exact name, then ignoring hyphens ("hutao" → "hu-tao"), then leading words
   //      ("raiden" → "raiden-shogun"), then whole words anywhere ("kazuha" →
   //      "kaedehara-kazuha"). A tier with several hits is ambiguous
   //      (e.g. "Aether" → aether-pyro, aether-hydro…): never guess, suggest instead.
   const tiers = [
      (k) => k === q,
      (k, i, c) => c.compactKeys[i] === qc,
      (k) => k.startsWith(`${q}-`),
      (k) => `-${k}-`.includes(`-${q}-`),
   ];
   for (const test of tiers) {
      const hits = candidates.filter((c) => c.keys.some((k, i) => test(k, i, c)));
      if (hits.length) return unique(hits) ?? ambiguous(hits);
   }

   // Distances above maxUseful never matter (not a typo match, not a suggestion), and
   // length difference is a lower bound on distance — so skip those candidates cheaply.
   const maxUseful = Math.max(2, Math.floor(qc.length / 3));
   const withDistance = candidates.map((c) => ({
      ...c,
      d: Math.min(...c.compactKeys.map((kc) => distance(qc, kc, maxUseful))),
   }));

   // 6. typo auto-correct ("emblem of severd fate" → emblem-of-severed-fate), only when
   //    exactly one name is close AND nothing else is nearly as close. Otherwise suggest.
   const allowed = typoAllowance(qc.length);
   const ranked = [...withDistance].sort((a, b) => a.d - b.d);
   const [best, runnerUp] = ranked;
   if (best && best.d <= allowed && (!runnerUp || runnerUp.d > best.d + 1)) {
      return { slug: best.slug, suggestions: [] };
   }

   // 7. no confident match — rank suggestions
   const scored = withDistance
      .map((c) => {
         const contains = c.keys.some((k, i) => k.includes(q) || (qc.length >= 3 && c.compactKeys[i].includes(qc)));
         return { slug: c.slug, score: contains ? -1 : c.d };
      })
      .filter((s) => s.score < 0 || s.score <= maxUseful)
      .sort((a, b) => a.score - b.score || a.slug.localeCompare(b.slug));

   return { slug: null, suggestions: scored.slice(0, maxSuggestions).map((s) => s.slug) };
}

/** Predicate for store.query(): case-insensitive substring match on data.name. */
export const nameIncludes = (term) => {
   const t = String(term).trim().toLowerCase();
   return (data) => Boolean(data.name?.toLowerCase().includes(t));
};

/**
 * Like resolveName(), but returns the matching entry or throws a NotFoundError whose
 * message lists suggestions — written so a model (or human) can retry with a valid slug.
 *
 * @param {Array<{slug, data}>} entries
 * @param {string} input
 * @param {string} label - singular noun for messages, e.g. "character"
 * @returns {{slug: string, data: object}}
 * @throws {NotFoundError} with `.suggestions`
 */
export function resolveOrThrow(entries, input, label) {
   const { slug, suggestions } = resolveName(entries, input);
   if (slug) return entries.find((e) => e.slug === slug);
   const hint = suggestions.length
      ? ` Did you mean: ${suggestions.join(', ')}?`
      : ` Try the search tool to find the right name.`;
   throw new NotFoundError(`No ${label} matches "${input}".${hint}`, { suggestions });
}

