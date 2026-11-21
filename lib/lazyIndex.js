/**
 * Lookup by a derived key (e.g. the game's numeric ID) over a data store, built on first use.
 * Store data is loaded once per process, so the index never goes stale.
 *
 * @param {{ getAll: () => Promise<Array<{ slug, data }>> }} store
 * @param {(data: object) => string|number|null|undefined} keyOf - entries with no key are skipped
 * @returns {(key) => Promise<{ slug, data } | null>}
 */
export function lazyIndex(store, keyOf) {
   const groups = lazyGroups(store, keyOf);
   return async (key) => (await groups(key))[0] ?? null;
}

/**
 * Like lazyIndex, but returns every entry with that key (in store order), or [].
 * @returns {(key) => Promise<Array<{ slug, data }>>}
 */
export function lazyGroups(store, keyOf) {
   // One shared build: concurrent first lookups wait for the same complete index
   let index = null;
   const build = async () => {
      const map = new Map();
      for (const entry of await store.getAll()) {
         const k = keyOf(entry.data);
         if (k === null || k === undefined) continue;
         if (!map.has(k)) map.set(k, []);
         map.get(k).push(entry);
      }
      return map;
   };
   return async (key) => (await (index ??= build())).get(key) ?? [];
}
