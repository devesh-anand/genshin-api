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

/** Levenshtein distance, small inputs only. */
function distance(a, b) {
   const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
   for (let i = 1; i <= a.length; i++) {
      let diag = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
         const tmp = prev[j];
         prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
         diag = tmp;
      }
   }
   return prev[b.length];
}

/**
 * @param {Array<{slug: string, data: {name?: string}}>} entries - e.g. store.getAll()
 * @param {string} input
 * @param {{ maxSuggestions?: number }} [opts]
 * @returns {{ slug: string|null, suggestions: string[] }}
 *   slug is set only for a confident match; otherwise suggestions holds the closest slugs.
 */
export function resolveName(entries, input, { maxSuggestions = 5 } = {}) {
   const q = slugify(input);
   if (!q) return { slug: null, suggestions: [] };

   const candidates = entries.map(({ slug, data }) => ({
      slug,
      keys: [...new Set([slug, slugify(data?.name)].filter(Boolean))],
   }));

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
      (k) => compact(k) === qc,
      (k) => k.startsWith(`${q}-`),
      (k) => `-${k}-`.includes(`-${q}-`),
   ];
   for (const test of tiers) {
      const hits = candidates.filter((c) => c.keys.some(test));
      if (hits.length) return unique(hits) ?? ambiguous(hits);
   }

   // 6. no confident match — rank suggestions
   const scored = candidates
      .map((c) => {
         const contains = c.keys.some((k) => k.includes(q) || (qc.length >= 3 && compact(k).includes(qc)));
         const d = Math.min(...c.keys.map((k) => distance(qc, compact(k))));
         return { slug: c.slug, score: contains ? -1 : d };
      })
      .filter((s) => s.score < 0 || s.score <= Math.max(2, Math.floor(qc.length / 3)))
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

