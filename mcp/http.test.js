// Streamable HTTP endpoint (/mcp): a real SDK client over HTTP, plus transport-level
// behaviour (methods, limits, errors, logging) and the REST app staying intact.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp, trustProxySetting } from '../app.js';

async function listen(opts) {
   const server = createApp({ rateLimit: false, ...opts }).listen(0);
   await new Promise((r) => server.once('listening', r));
   return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function connectClient(base) {
   const client = new Client({ name: 'http-test', version: '0' });
   await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
   return client;
}

const rpc = (base, body, headers = {}) =>
   fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
   });

const INIT = {
   jsonrpc: '2.0', id: 1, method: 'initialize',
   params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '0' } },
};

describe('/mcp over HTTP', () => {
   let app, client;
   const calls = [];
   before(async () => {
      app = await listen({ mcp: { onToolCall: (e) => calls.push(e), rateLimit: false } });
      client = await connectClient(app.base);
   });
   after(async () => { await client.close(); app.server.close(); });

   it('serves the same tools as stdio', async () => {
      const names = (await client.listTools()).tools.map((t) => t.name);
      for (const n of ['search', 'get_character', 'list_materials', 'get_game_info']) assert.ok(names.includes(n), n);
   });

   it('runs tool calls (stateless: each request is independent)', async () => {
      const r = await client.callTool({ name: 'get_artifact', arguments: { name: 'emblem of severd fate' } });
      assert.equal(JSON.parse(r.content[0].text).key, 'emblem-of-severed-fate');
      const again = await client.callTool({ name: 'get_character', arguments: { name: 'hutao' } });
      assert.equal(JSON.parse(again.content[0].text).key, 'hu-tao');
   });

   it('logs each tool call without arguments', async () => {
      calls.length = 0;
      await client.callTool({ name: 'get_character', arguments: { name: 'nahida' } });
      await client.callTool({ name: 'get_character', arguments: { name: 'zzzzzzzzzz' } });
      assert.deepEqual(calls.map(({ tool, ok, error }) => ({ tool, ok, error })), [
         { tool: 'get_character', ok: true, error: undefined },
         { tool: 'get_character', ok: false, error: 'NotFoundError' },
      ]);
      assert.ok(calls.every((c) => Number.isInteger(c.ms)));
      assert.ok(!JSON.stringify(calls).includes('zzzz'), 'arguments must not be logged');
   });

   it('returns plain JSON, uncached, with no session id', async () => {
      const res = await rpc(app.base, INIT);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /application\/json/);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(res.headers.get('mcp-session-id'), null);
      assert.equal((await res.json()).result.serverInfo.name, 'genshin-api');
   });

   it('rejects GET/DELETE with 405 and a JSON-RPC error', async () => {
      for (const method of ['GET', 'DELETE']) {
         const res = await fetch(`${app.base}/mcp`, { method });
         assert.equal(res.status, 405, method);
         assert.equal(res.headers.get('allow'), 'POST');
         assert.equal((await res.json()).jsonrpc, '2.0');
      }
   });

   it('maps bad bodies to JSON-RPC errors', async () => {
      const bad = await rpc(app.base, '{not json');
      assert.equal(bad.status, 400);
      assert.equal((await bad.json()).error.code, -32700);

      const huge = await rpc(app.base, { ...INIT, padding: 'x'.repeat(70 * 1024) });
      assert.equal(huge.status, 413);
      assert.equal((await huge.json()).error.code, -32600);
   });

   it('allows browser-based clients (CORS)', async () => {
      const res = await fetch(`${app.base}/mcp`, {
         method: 'OPTIONS',
         headers: { origin: 'https://example.com', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
      });
      assert.ok([200, 204].includes(res.status));
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
   });

   it('leaves the REST API untouched', async () => {
      const res = await fetch(`${app.base}/characters/nahida`);
      assert.equal(res.status, 200);
      assert.equal((await res.json()).name, 'Nahida');
   });
});

describe('/mcp rate limiting', () => {
   it('limits per client IP with a JSON-RPC 429, separately from REST', async () => {
      const { server, base } = await listen({ rateLimit: true, mcp: { onToolCall: null, rateLimit: { limit: 2 } } });
      try {
         assert.equal((await rpc(base, INIT)).status, 200);
         assert.equal((await rpc(base, INIT)).status, 200);
         const limited = await rpc(base, INIT);
         assert.equal(limited.status, 429);
         assert.ok(limited.headers.get('retry-after'));
         assert.equal((await limited.json()).error.code, -32000);

         // another client IP (via the trusted proxy header) has its own bucket
         assert.equal((await rpc(base, INIT, { 'x-forwarded-for': '203.0.113.7' })).status, 200);
         // REST has its own limiter and isn't consumed by MCP traffic
         assert.equal((await fetch(`${base}/health`)).status, 200);
      } finally {
         server.close();
      }
   });
});

describe('trust proxy setting', () => {
   it('defaults to one hop (Railway) and accepts overrides', () => {
      assert.equal(trustProxySetting(undefined), 1);
      assert.equal(trustProxySetting(''), 1);
      assert.equal(trustProxySetting('2'), 2);
      assert.equal(trustProxySetting('false'), false);
      assert.equal(trustProxySetting('true'), true);
      assert.equal(trustProxySetting('loopback'), 'loopback');
   });
});
