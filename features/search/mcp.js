/** MCP tool for cross-entity search — thin wrapper over ./service.js. */
import { z } from '../../mcp/schema.js';
import { omitKeys } from '../../lib/objects.js';
import { searchAll, SEARCH_TYPES, MIN_QUERY_LENGTH } from './service.js';

export async function tools() {
   return [
      {
         name: 'search',
         title: 'Search everything',
         description:
            'Search characters, weapons, artifact sets, materials and enemies by (partial) name. Use this when you are not ' +
            'sure of an exact name or what kind of thing it is; then call the matching get_* tool with a returned key.',
         inputSchema: {
            query: z.string().min(MIN_QUERY_LENGTH).describe('Part of a name, e.g. "lotus", "skyward", "raiden".'),
            types: z.array(z.enum(SEARCH_TYPES)).min(1).optional().describe('Limit to these entity types (default: all).'),
            limit: z.number().int().min(1).max(100).optional().describe('Max results per type (default 10). `totals` gives full counts.'),
         },
         // Image URLs are dropped: they cost tokens and models rarely need them in search results.
         handler: async ({ query, types, limit = 10 }) => omitKeys(await searchAll(query, { types, limit }), ['img']),
      },
   ];
}
