/** MCP tools for artifact sets — thin wrappers over ./service.js (no logic here). */
import { z, rarityOf, nameArg, pageArgs } from '../../mcp/schema.js';
import { paginate } from '../../lib/paginate.js';
import { listArtifacts, resolveArtifact, describeArtifact, toBrief, listArtifactRarities } from './service.js';

export async function tools() {
   const rarities = await listArtifactRarities();

   return [
      {
         name: 'list_artifacts',
         title: 'List artifact sets',
         description:
            'List artifact sets with their set bonuses (2-piece / 4-piece effects), optionally by rarity. ' +
            'Use this to find sets by effect (e.g. "Cryo DMG", "Elemental Mastery"). Paged (default 100): pass next_offset back as offset to get more.',
         inputSchema: { rarity: rarityOf(rarities).optional(), ...pageArgs },
         handler: async ({ limit, offset, ...filters }) => {
            const results = await listArtifacts({ ...filters, sort: 'name' });
            const { items, ...page } = paginate(results, { limit, offset });
            return { ...page, artifacts: items.map(toBrief) };
         },
      },
      {
         name: 'get_artifact',
         title: 'Get artifact set',
         description: 'Get one artifact set by name: set bonuses and each piece (flower, plume, sands, goblet, circlet) with lore.',
         inputSchema: {
            name: nameArg('Artifact set'),
            images: z.boolean().optional().describe('Include piece image URLs (default false).'),
         },
         handler: async ({ name, images }) => describeArtifact(await resolveArtifact(name), { images }),
      },
   ];
}
