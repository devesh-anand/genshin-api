/**
 * Deep-copies a value with the given keys removed at every level (e.g. strip "img"
 * from nested talent objects to keep model-facing responses small).
 */
export function omitKeys(value, keys) {
   if (Array.isArray(value)) return value.map((v) => omitKeys(v, keys));
   if (value && typeof value === 'object') {
      return Object.fromEntries(
         Object.entries(value).filter(([k]) => !keys.includes(k)).map(([k, v]) => [k, omitKeys(v, keys)])
      );
   }
   return value;
}

/** Returns a new object with only the listed keys that are present on `obj`. */
export function pick(obj, keys) {
   return Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
}
