/** MCP tools for enemies — thin wrappers over ./service.js (no logic here). */
import { enumOf, nameArg, pageArgs } from '../../mcp/schema.js';
import { paginate } from '../../lib/paginate.js';
import { listEnemies, resolveEnemy, describeEnemy, toBrief, listEnemyTypes } from './service.js';

export async function tools() {
   const types = await listEnemyTypes();

   return [
      {
         name: 'list_enemies',
         title: 'List enemies',
         description: 'List enemies, optionally by type. Returns brief entries (key, name, type). Paged (default 100): pass next_offset back as offset to get more.',
         inputSchema: { type: enumOf(types, 'Enemy type.').optional(), ...pageArgs },
         handler: async ({ limit, offset, ...filters }) => {
            const results = await listEnemies({ ...filters, sort: 'name' });
            const { items, ...page } = paginate(results, { limit, offset });
            return { ...page, enemies: items.map(toBrief) };
         },
      },
      {
         name: 'get_enemy',
         title: 'Get enemy',
         description: 'Get one enemy by name: description, type, and the materials it drops (as material keys for get_material).',
         inputSchema: { name: nameArg('Enemy') },
         handler: async ({ name }) => describeEnemy(await resolveEnemy(name)),
      },
   ];
}
