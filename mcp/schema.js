/**
 * Zod helpers for tool input schemas. Enum values come from the data at server
 * start-up (see CLAUDE.md: "Input enums are derived from data, not hard-coded").
 */
import { z } from 'zod';

/** Lower-cased enum of data values; falls back to a free string if the data is empty. */
export function enumOf(values, description) {
   const vals = [...new Set(values.map((v) => String(v).toLowerCase()))];
   const schema = vals.length ? z.enum(vals) : z.string();
   return description ? schema.describe(description) : schema;
}

/** Integer limited to the rarities present in the data. */
export function rarityOf(values) {
   const nums = values.map(Number).filter(Number.isInteger);
   return z
      .number()
      .int()
      .min(Math.min(...nums))
      .max(Math.max(...nums))
      .describe(`Star rarity. Present in data: ${nums.join(', ')}.`);
}

/** Optional `sections` array over a service's SECTIONS map. */
export function sectionsOf(sectionsMap, description) {
   return z.array(z.enum(Object.keys(sectionsMap))).min(1).optional().describe(description);
}

export const sortOrder = z.enum(['asc', 'desc']).optional().describe('Sort direction (default asc).');

export const nameArg = (noun) =>
   z.string().min(1).describe(`${noun} name or slug. Loose input is fine ("hutao", "Raiden Shogun").`);

/** limit/offset params for list tools (see lib/paginate.js). */
export const pageArgs = {
   limit: z.number().int().min(1).max(500).optional().describe('Max entries to return (default 100).'),
   offset: z.number().int().min(0).optional().describe('Skip this many entries — pass next_offset from a previous call.'),
};

export { z };
