/**
 * Offset pagination for model-facing lists, so one call can't flood a model's context.
 * @template T
 * @param {T[]} items
 * @param {{ limit?: number, offset?: number }} [opts]
 * @returns {{ total: number, offset: number, items: T[], next_offset: number|null }}
 */
export function paginate(items, { limit = 100, offset = 0 } = {}) {
   const page = items.slice(offset, offset + limit);
   const next = offset + page.length;
   return { total: items.length, offset, items: page, next_offset: next < items.length ? next : null };
}
