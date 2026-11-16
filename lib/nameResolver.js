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

/** Short words players usually skip or keep in abbreviations ("Emblem of Severed Fate" → EoSF or ESF). */
const SMALL_WORDS = new Set(['of', 'the', 'a', 'an', 'to', 'in', 'and', 'for', 'from', 'on', 'at']);
const MIN_INITIALS = 2;
const MAX_INITIALS = 8;

/**
 * Initials players use as abbreviations, generated from a multi-word name:
 * "Harbinger of Dawn" → ["hod", "hd"], "Primordial Jade Winged-Spear" → ["pjws"].
 * Single-word names have none. Matched exactly only — never typo-corrected towards.
 */
export function initialismsOf(name) {
   const words = slugify(name).split('-').filter(Boolean);
   if (words.length < 2) return [];
   const all = words.map((w) => w[0]).join('');
   const big = words.filter((w) => !SMALL_WORDS.has(w)).map((w) => w[0]).join('');
   return [...new Set([all, big])].filter((x) => x.length >= MIN_INITIALS && x.length <= MAX_INITIALS);
}

/** A query that could be initials: one token, 2–8 letters/digits. */
const looksLikeInitials = (q) => !q.includes('-') && q.length >= MIN_INITIALS && q.length <= MAX_INITIALS;

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
function candidateFor({ slug, data }, aliases) {
   let cached = data && typeof data === 'object' ? keyCache.get(data) : undefined;
   if (!cached || cached.slug !== slug || cached.aliases !== aliases) {
      const names = [slug, slugify(data?.name), ...(aliases?.[slug] ?? []).map(slugify)];
      const keys = [...new Set(names.filter(Boolean))];
      cached = { slug, aliases, keys, compactKeys: keys.map(compact), initials: new Set(initialismsOf(data?.name)) };
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
 * @param {{ maxSuggestions?: number, aliases?: Record<string, string[]> }} [opts]
 *   aliases - slug → nicknames ("tartaglia" → ["Childe"]); matched like names, typos included.
 *             An alias shared by several slugs is ambiguous by design ("traveler").
 *             Curated aliases always beat generated initials (see initialismsOf).
 *
 * Matching order — the first tier with hits decides (one hit = match, several = suggestions):
 *   exact slug → exact name/alias → same ignoring hyphens → leading word → whole word →
 *   generated initials → clear single typo → suggestions.
 * This is the single entry point for name → entity; a model-based resolver can be added
 * later as a fallback here (e.g. before giving up) without changing callers.
 * @returns {{ slug: string|null, suggestions: string[] }}
 *   slug is set only for a confident match (incl. a clear single-typo match);
 *   otherwise suggestions holds the closest slugs.
 */
export function resolveName(entries, input, { maxSuggestions = 5, aliases } = {}) {
   const q = slugify(input);
   if (!q) return { slug: null, suggestions: [] };

   const candidates = entries.map((e) => candidateFor(e, aliases));

   const qc = compact(q);
   const unique = (list) => (list.length === 1 ? { slug: list[0].slug, suggestions: [] } : null);
   // Ambiguous exact-ish matches are all equally valid, so list more of them than typo suggestions.
   const ambiguous = (list) => ({ slug: null, suggestions: list.slice(0, Math.max(maxSuggestions, 20)).map((c) => c.slug) });

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

   // 6. generated initials ("hod" → Harbinger of Dawn), exact only. Shared initials suggest.
   if (looksLikeInitials(q)) {
      const hits = candidates.filter((c) => c.initials.has(q));
      if (hits.length) return unique(hits) ?? ambiguous(hits);
   }

   // Distances above maxUseful never matter (not a typo match, not a suggestion), and
   // length difference is a lower bound on distance — so skip those candidates cheaply.
   const maxUseful = Math.max(2, Math.floor(qc.length / 3));
   const withDistance = candidates.map((c) => ({
      ...c,
      d: Math.min(...c.compactKeys.map((kc) => distance(qc, kc, maxUseful))),
   }));

   // 7. typo auto-correct ("emblem of severd fate" → emblem-of-severed-fate), only when
   //    exactly one name is close AND nothing else is nearly as close. Otherwise suggest.
   const allowed = typoAllowance(qc.length);
   const ranked = [...withDistance].sort((a, b) => a.d - b.d);
   const [best, runnerUp] = ranked;
   if (best && best.d <= allowed && (!runnerUp || runnerUp.d > best.d + 1)) {
      return { slug: best.slug, suggestions: [] };
   }

   // 8. no confident match — rank suggestions
   const scored = withDistance
      .map((c) => {
         const contains = c.keys.some((k, i) => k.includes(q) || (qc.length >= 3 && c.compactKeys[i].includes(qc)));
         return { slug: c.slug, score: contains ? -1 : c.d };
      })
      .filter((s) => s.score < 0 || s.score <= maxUseful)
      .sort((a, b) => a.score - b.score || a.slug.localeCompare(b.slug));

   return { slug: null, suggestions: scored.slice(0, maxSuggestions).map((s) => s.slug) };
}

/**
 * Search predicate for store.query(): the name contains the term, a nickname contains it
 * ("childe" → Tartaglia), or the term is the entry's initials ("hod" → Harbinger of Dawn).
 * @param {string} term
 * @param {Record<string, string[]>} [aliases] - slug → nicknames
 */
export const matchesSearchTerm = (term, aliases = {}) => {
   const byName = nameIncludes(term);
   const t = slugify(term);
   const initials = looksLikeInitials(t);
   return (data, slug) =>
      byName(data) ||
      (t.length >= 2 && (aliases[slug] ?? []).some((a) => slugify(a).includes(t))) ||
      (initials && initialismsOf(data?.name).includes(t));
};

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
 * @param {{ aliases?: Record<string, string[]> }} [opts] - see resolveName
 * @returns {{slug: string, data: object}}
 * @throws {NotFoundError} with `.suggestions`
 */
export function resolveOrThrow(entries, input, label, { aliases } = {}) {
   const { slug, suggestions } = resolveName(entries, input, { aliases });
   if (slug) return entries.find((e) => e.slug === slug);
   const hint = suggestions.length
      ? ` Did you mean: ${suggestions.join(', ')}?`
      : ` Try the search tool to find the right name.`;
   throw new NotFoundError(`No ${label} matches "${input}".${hint}`, { suggestions, query: input, entity: label });
}

