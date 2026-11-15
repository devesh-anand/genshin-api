// MCP server tests: a real SDK client talks to the server over an in-memory transport,
// plus one stdio smoke test that spawns the actual entry point from another directory.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { createMcpServer, toErrorResult, SERVER_NAME } from './server.js';
import { TOOLSETS } from './registry.js';
import { ROOT_DIR } from '../lib/paths.js';
import { NotFoundError } from '../lib/errors.js';

async function connect(opts) {
   const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
   await (await createMcpServer(opts)).connect(serverSide);
   const client = new Client({ name: 'test', version: '0' });
   await client.connect(clientSide);
   return client;
}

let client;
before(async () => { client = await connect(); });
after(() => client.close());

const call = async (name, args = {}) => {
   const r = await client.callTool({ name, arguments: args });
   return { isError: Boolean(r.isError), text: r.content[0].text, json: r.isError ? null : JSON.parse(r.content[0].text) };
};

describe('MCP: tool catalogue', () => {
   it('identifies itself and sends usage instructions', () => {
      assert.equal(client.getServerVersion().name, SERVER_NAME);
      assert.match(client.getInstructions(), /search/);
   });

   it('every tool is well-formed for a model', async () => {
      const { tools } = await client.listTools();
      assert.ok(tools.length > 0 && tools.length <= 30, `tool count ${tools.length} (keep ≤ 30)`);
      assert.equal(new Set(tools.map((t) => t.name)).size, tools.length, 'duplicate tool names');
      for (const t of tools) {
         assert.match(t.name, /^[a-z][a-z0-9_]*$/, `${t.name}: use snake_case`);
         assert.ok(t.title, `${t.name}: missing title`);
         assert.ok(t.description?.length >= 40, `${t.name}: description too short for a model`);
         assert.equal(t.annotations?.readOnlyHint, true, `${t.name}: should be read-only`);
         assert.equal(t.inputSchema.type, 'object');
      }
   });

   it('public tool names are stable (never rename or remove — CLAUDE.md)', async () => {
      const names = (await client.listTools()).tools.map((t) => t.name);
      for (const n of [
         'search', 'list_characters', 'get_character', 'list_weapons', 'get_weapon', 'list_artifacts',
         'get_artifact', 'list_materials', 'get_material', 'list_enemies', 'get_enemy', 'get_game_info',
      ]) assert.ok(names.includes(n), `tool ${n} disappeared`);
   });

   it('filter enums are derived from data (lower-case)', async () => {
      const { tools } = await client.listTools();
      const list = tools.find((t) => t.name === 'list_characters');
      assert.ok(list.inputSchema.properties.element.enum.includes('dendro'));
      assert.ok(list.inputSchema.properties.weapon.enum.includes('sword'));
   });
});

describe('MCP: tool calls', () => {
   it('list_characters filters and pages', async () => {
      const r = await call('list_characters', { element: 'dendro', rarity: 5, limit: 2 });
      assert.equal(r.isError, false);
      assert.ok(r.json.total >= r.json.characters.length);
      assert.ok(r.json.characters.length <= 2);
      assert.ok(r.json.characters.every((c) => c.element === 'Dendro' && c.rarity === 5));
      if (r.json.total > 2) assert.equal(r.json.next_offset, 2);
   });

   it('paging walks the whole list without gaps', async () => {
      const all = (await call('list_weapons', { type: 'bow', limit: 500 })).json.weapons.map((w) => w.key);
      const seen = [];
      for (let offset = 0; offset !== null; ) {
         const r = (await call('list_weapons', { type: 'bow', limit: 7, offset })).json;
         seen.push(...r.weapons.map((w) => w.key));
         offset = r.next_offset;
      }
      assert.deepEqual(seen, all);
   });

   it('get_character resolves loose names and returns only requested sections', async () => {
      const overview = (await call('get_character', { name: 'Hu Tao' })).json;
      assert.equal(overview.key, 'hu-tao');
      assert.ok(overview.description);
      assert.equal(overview.talent_costs, undefined);

      const costs = (await call('get_character', { name: 'nahida', sections: ['talent_costs', 'ascension_costs'] })).json;
      assert.ok(costs.talent_costs.normal_attack.length > 0);
      assert.ok(costs.ascension_costs.length > 0);
      assert.equal(costs.description, undefined);
   });

   it('get_character talents/constellations drop image URLs', async () => {
      const r = (await call('get_character', { name: 'nahida', sections: ['talents', 'constellations'] })).text;
      assert.ok(!r.includes('"img"'));
   });

   it('typos are corrected; unknown or ambiguous names are tool errors with suggestions', async () => {
      const typo = await call('get_artifact', { name: 'emblem of severd fate' });
      assert.equal(typo.isError, false, 'a clear typo should be auto-corrected');
      assert.equal(typo.json.key, 'emblem-of-severed-fate');

      const unsure = await call('get_character', { name: 'nahiidaa' });
      assert.equal(unsure.isError, true);
      assert.match(unsure.text, /Did you mean: .*nahida/);

      const ambiguous = await call('get_character', { name: 'aether' });
      assert.equal(ambiguous.isError, true);
      assert.match(ambiguous.text, /aether-anemo/);
   });

   it('invalid arguments are rejected, not executed', async () => {
      const r = await client.callTool({ name: 'list_characters', arguments: { element: 'fire' } }).catch((e) => ({ thrown: e }));
      assert.ok(r.thrown || r.isError, 'expected a validation failure');
   });

   it('every get_* tool works on a name from its own list_* tool', async () => {
      for (const [list, key, get] of [
         ['list_weapons', 'weapons', 'get_weapon'],
         ['list_artifacts', 'artifacts', 'get_artifact'],
         ['list_materials', 'materials', 'get_material'],
         ['list_enemies', 'enemies', 'get_enemy'],
      ]) {
         const first = (await call(list, { limit: 1 })).json[key][0];
         const r = await call(get, { name: first.key });
         assert.equal(r.isError, false, `${get}(${first.key}): ${r.text}`);
         assert.equal(r.json.key, first.key);
      }
   });

   it('search limits per type, reports totals and omits images', async () => {
      const r = await call('search', { query: 'ra', limit: 3 });
      for (const [type, items] of Object.entries(r.json.results)) {
         assert.ok(items.length <= 3, type);
         assert.ok(r.json.totals[type] >= items.length, type);
      }
      assert.ok(!r.text.includes('"img"'));
      const only = await call('search', { query: 'nahida', types: ['characters'] });
      assert.deepEqual(Object.keys(only.json.results), ['characters']);
   });

   it('get_game_info includes the disclaimer', async () => {
      assert.match((await call('get_game_info')).json.disclaimer, /not affiliated with HoYoverse/);
   });
});

describe('MCP: errors and access', () => {
   it('expected errors become readable tool errors', () => {
      const r = toErrorResult(new NotFoundError('No character matches "x".'), 't');
      assert.deepEqual(r, { isError: true, content: [{ type: 'text', text: 'No character matches "x".' }] });
   });

   it('unexpected errors never leak internals', async () => {
      const boom = async () => [{
         name: 'boom', title: 'Boom', description: 'Always throws an unexpected error, for testing only.',
         inputSchema: {}, handler: async () => { throw new Error('secret stack detail'); },
      }];
      const original = console.error;
      console.error = () => {};
      try {
         const c = await connect({ toolsets: [boom] });
         const r = await c.callTool({ name: 'boom', arguments: {} });
         assert.equal(r.isError, true);
         assert.ok(!r.content[0].text.includes('secret'));
         await c.close();
      } finally {
         console.error = original;
      }
   });

   it("'auth' tools are hidden without a user and visible with one", async () => {
      const set = async () => [
         { name: 'pub', title: 'Pub', description: 'A public test tool that anyone may call freely.', inputSchema: {}, handler: async () => 1 },
         {
            name: 'mine', title: 'Mine', access: 'auth', description: 'A personal test tool that needs a signed-in user.',
            inputSchema: { n: z.number().optional() }, handler: async (args, { user }) => user.id,
         },
      ];
      const anon = await connect({ toolsets: [set] });
      assert.deepEqual((await anon.listTools()).tools.map((t) => t.name), ['pub']);
      const authed = await connect({ toolsets: [set], user: { id: 'u1' } });
      assert.deepEqual((await authed.listTools()).tools.map((t) => t.name), ['pub', 'mine']);
      assert.equal((await authed.callTool({ name: 'mine', arguments: {} })).content[0].text, '"u1"');
      await anon.close();
      await authed.close();
   });
});

describe('MCP: registry conventions', () => {
   it('every features/*/mcp.js is listed in mcp/registry.js', async () => {
      const dir = path.join(ROOT_DIR, 'features');
      for (const f of fs.readdirSync(dir)) {
         if (!fs.existsSync(path.join(dir, f, 'mcp.js'))) continue;
         const { tools } = await import(`../features/${f}/mcp.js`);
         assert.ok(TOOLSETS.includes(tools), `features/${f}/mcp.js is not in TOOLSETS (mcp/registry.js)`);
      }
   });
});

describe('MCP: stdio entry point', () => {
   it('starts from an unrelated working directory and answers over stdio', async () => {
      const transport = new StdioClientTransport({
         command: process.execPath,
         args: [path.join(ROOT_DIR, 'mcp', 'stdio.js')],
         cwd: '/',
         stderr: 'ignore',
      });
      const c = new Client({ name: 'stdio-test', version: '0' });
      await c.connect(transport);
      try {
         assert.ok((await c.listTools()).tools.some((t) => t.name === 'get_character'));
         const r = await c.callTool({ name: 'get_character', arguments: { name: 'nahida' } });
         assert.equal(JSON.parse(r.content[0].text).key, 'nahida');
      } finally {
         await c.close();
      }
   });
});
