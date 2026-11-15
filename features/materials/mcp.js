/** MCP tools for materials — thin wrappers over ./service.js (no logic here). */
import { rarityOf, enumOf, nameArg, pageArgs } from '../../mcp/schema.js';
import { paginate } from '../../lib/paginate.js';
import {
   listMaterials,
   resolveMaterial,
   describeMaterial,
   toBrief,
   listMaterialCategories,
   listMaterialRarities,
} from './service.js';

export async function tools() {
   const [categories, rarities] = await Promise.all([listMaterialCategories(), listMaterialRarities()]);

   return [
      {
         name: 'list_materials',
         title: 'List materials',
         description:
            'List upgrade materials, optionally by category and rarity. Returns brief entries (key, name, category, rarity). ' +
            'Prefer filtering by category — there are hundreds of materials. Paged (default 100): pass next_offset back as offset to get more.',
         inputSchema: {
            category: enumOf(categories, 'Material category.').optional(),
            rarity: rarityOf(rarities).optional(),
            ...pageArgs,
         },
         handler: async ({ limit, offset, ...filters }) => {
            const results = await listMaterials({ ...filters, sort: 'name' });
            const { items, ...page } = paginate(results, { limit, offset });
            return { ...page, materials: items.map(toBrief) };
         },
      },
      {
         name: 'get_material',
         title: 'Get material',
         description:
            'Get one material by name: description, which enemies drop it (dropped_by), which characters and weapons use it ' +
            '(used_by), and where to obtain it (source) when known.',
         inputSchema: { name: nameArg('Material') },
         handler: async ({ name }) => describeMaterial(await resolveMaterial(name)),
      },
   ];
}
