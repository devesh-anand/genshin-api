import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import errorHandle from './middlewares/errorHandle.js';
import rateLimiter, { showcaseRateLimiter } from './middlewares/rateLimiter.js';
import { cacheControl } from './middlewares/cache.js';
import { createMcpRouter } from './mcp/http.js';

import characters from './features/characters/rest.js';
import weapons from './features/weapons/rest.js';
import artifacts from './features/artifacts/rest.js';
import materials from './features/materials/rest.js';
import enemies from './features/enemies/rest.js';
import search from './features/search/rest.js';
import health from './features/health/rest.js';
import planner from './features/planner/rest.js';
import showcase from './features/showcase/rest.js';

/**
 * REST route registry — every feature's router is mounted here, explicitly.
 * Adding a feature with REST endpoints? Add one line. (Checked by app.test.js.)
 */
export const ROUTES = [
   [['/character', '/characters'], characters],
   [['/weapon', '/weapons'], weapons],
   [['/artifact', '/artifacts'], artifacts],
   [['/material', '/materials'], materials],
   [['/enemy', '/enemies'], enemies],
   
   ['/search', search],
   ['/health', health],
   ['/planner', planner],
   ['/showcase', showcase],
];

/**
 * How many proxy hops to trust for the client IP (X-Forwarded-For). Railway puts one
 * proxy in front of the app; without this, every user shares the proxy's IP and
 * therefore one rate-limit bucket. Override with TRUST_PROXY (a hop count, "false",
 * or an Express trust-proxy string such as "loopback").
 */
export function trustProxySetting(value = process.env.TRUST_PROXY) {
   if (value === undefined || value === '') return 1;
   if (value === 'false') return false;
   if (value === 'true') return true;
   return /^\d+$/.test(value) ? Number(value) : value;
}

/**
 * Builds the Express app without listening — tests mount it on an ephemeral port.
 * @param {{ rateLimit?: boolean, mcp?: object }} [opts]
 *   rateLimit - REST rate limiting (off in tests)
 *   mcp       - options for createMcpRouter() (mcp/http.js)
 */
export function createApp({ rateLimit = true, mcp = {} } = {}) {
   const app = express();
   app.set('trust proxy', trustProxySetting());

   app.use(cors());

   // MCP first: own body limit, rate limit and JSON-RPC error format.
   app.use('/mcp', createMcpRouter(mcp));

   app.use(bodyParser.urlencoded({ extended: false }));
   app.use(bodyParser.json());
   if (rateLimit) app.use(rateLimiter);
   if (rateLimit) app.use('/showcase', showcaseRateLimiter); // each lookup can cost an Enka request
   app.use(cacheControl(3600)); // 1-hour default; /health overrides to no-store, /search to 5 min

   app.get('/', (req, res) => {
      res.send('Welcome to genshin-api');
   });

   for (const [paths, router] of ROUTES) app.use(paths, router);

   app.use(errorHandle);
   return app;
}
