/**
 * Public MCP endpoint over Streamable HTTP, mounted at /mcp by app.js.
 *
 * Stateless: every POST gets a fresh McpServer + transport (no session IDs, no
 * server-side state), which suits public read-only data and scales horizontally.
 * Responses are plain JSON (enableJsonResponse) rather than SSE streams.
 *
 * Mounted BEFORE the REST middleware so it has its own body limit, rate limit and
 * JSON-RPC-shaped errors (MCP clients can't read the REST `{ error }` shape).
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer, loadToolDefinitions } from './server.js';
import { rateLimitKey } from '../lib/clientIp.js';

export const MCP_BODY_LIMIT = '64kb';
export const MCP_RATE_LIMIT = { windowMs: 60 * 1000, limit: 300 }; // ~one busy conversation per IP

/** JSON-RPC error responses — what MCP clients expect for transport-level failures. */
export function sendRpcError(res, status, code, message, headers = {}) {
   res.status(status).set({ 'Cache-Control': 'no-store', ...headers }).json({
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
   });
}

/** One JSON line per tool call on stdout (Railway logs). Never includes arguments. */
export function logToolCall(entry) {
   console.log(JSON.stringify({ event: 'mcp_tool_call', ...entry }));
}

/**
 * @param {{ rateLimit?: false | { windowMs?: number, limit?: number }, onToolCall?: Function|null, toolsets?: Function[] }} [opts]
 */
export function createMcpRouter({ rateLimit: limits = MCP_RATE_LIMIT, onToolCall = logToolCall, toolsets } = {}) {
   const router = express.Router();
   // Tool definitions (incl. data-derived enums) are built once, not per request.
   let definitions;
   const getDefinitions = () => (definitions ??= loadToolDefinitions(toolsets).catch((e) => {
      definitions = undefined; // retry on next request instead of caching a failure
      throw e;
   }));

   if (limits) {
      router.use(
         rateLimit({
            ...MCP_RATE_LIMIT,
            ...limits,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: rateLimitKey, // real client IP, incl. behind Cloudflare (lib/clientIp.js)
            handler: (req, res) =>
               sendRpcError(res, 429, -32000, 'Too many requests. Please slow down and retry in a minute.', {
                  'Retry-After': String(Math.ceil((limits.windowMs ?? MCP_RATE_LIMIT.windowMs) / 1000)),
               }),
         })
      );
   }

   router.use(express.json({ limit: MCP_BODY_LIMIT }));

   router.post('/', async (req, res) => {
      res.set('Cache-Control', 'no-store');
      let server;
      let transport;
      try {
         server = await createMcpServer({ definitions: await getDefinitions(), onToolCall: onToolCall ?? undefined });
         transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
         res.on('close', () => {
            transport.close();
            server.close();
         });
         await server.connect(transport);
         await transport.handleRequest(req, res, req.body);
      } catch (err) {
         console.error('[mcp/http] request failed:', err);
         if (!res.headersSent) sendRpcError(res, 500, -32603, 'Internal server error.');
      }
   });

   // Stateless server: no server-initiated SSE stream (GET) and no sessions to end (DELETE).
   router.all('/', (req, res) =>
      sendRpcError(res, 405, -32000, 'Method not allowed. Send MCP JSON-RPC messages with POST.', { Allow: 'POST' })
   );

   // Body-parser failures (too large, invalid JSON) → JSON-RPC errors.
   // eslint-disable-next-line no-unused-vars
   router.use((err, req, res, next) => {
      if (err.type === 'entity.too.large') return sendRpcError(res, 413, -32600, `Request body too large (max ${MCP_BODY_LIMIT}).`);
      if (err.type === 'entity.parse.failed') return sendRpcError(res, 400, -32700, 'Parse error: invalid JSON.');
      console.error('[mcp/http] error:', err);
      sendRpcError(res, 500, -32603, 'Internal server error.');
   });

   return router;
}
