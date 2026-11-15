import fs from 'fs/promises';
import path from 'path';

/**
 * Creates an in-memory store backed by a directory of JSON files.
 * Files are loaded once at first access and cached for the process lifetime.
 *
 * @param {string} dataDir - Absolute path to the directory of JSON files.
 * @returns {{ getAll, getOne, query }}
 */
export function createDataStore(dataDir) {
   let cache = null; // Map<slug, parsed object>

   let loading = null; // in-flight load promise, so concurrent first calls load once

   async function load() {
      const files = (await fs.readdir(dataDir)).filter((f) => f.endsWith('.json')).sort();
      const entries = await Promise.all(
         files.map(async (file) => [
            file.slice(0, -'.json'.length),
            JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf-8')),
         ])
      );
      // Insert in sorted filename order so every listing is deterministic
      // (previously insertion order depended on which file read finished first).
      cache = new Map(entries);
   }

   async function ensureLoaded() {
      if (cache) return;
      loading ??= load().finally(() => { loading = null; });
      await loading;
   }

   return {
      /** Returns all entries as an array of { slug, data } objects. */
      async getAll() {
         await ensureLoaded();
         return [...cache.entries()].map(([slug, data]) => ({ slug, data }));
      },

      /** Returns the parsed object for a given slug, or null if not found. */
      async getOne(slug) {
         await ensureLoaded();
         return cache.get(slug) ?? null;
      },

      /**
       * Filters entries by a predicate function.
       * @param {(data: object, slug: string) => boolean} predicateFn
       * @returns {Promise<Array<{ slug, data }>>}
       */
      async query(predicateFn) {
         await ensureLoaded();
         const results = [];
         for (const [slug, data] of cache) {
            if (predicateFn(data, slug)) results.push({ slug, data });
         }
         return results;
      },

      /**
       * Returns a sorted array of unique non-null values for a given field.
       * @param {string} field - Top-level key on each data object.
       * @returns {Promise<Array<string|number>>}
       */
      async getDistinct(field) {
         await ensureLoaded();
         const seen = new Set();
         for (const data of cache.values()) {
            const val = data[field];
            if (val != null) seen.add(val);
         }
         return [...seen].sort();
      },
   };
}
