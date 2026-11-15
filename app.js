import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import errorHandle from './middlewares/errorHandle.js';
import rateLimiter from './middlewares/rateLimiter.js';
import { cacheControl } from './middlewares/cache.js';

import characters from './features/characters/rest.js';
import weapons from './features/weapons/rest.js';
import artifacts from './features/artifacts/rest.js';
import materials from './features/materials/rest.js';
import enemies from './features/enemies/rest.js';
import search from './features/search/rest.js';
import health from './features/health/rest.js';

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
];

/** Builds the Express app without listening — tests mount it on an ephemeral port. */
export function createApp({ rateLimit = true } = {}) {
   const app = express();

   app.use(cors());
   app.use(bodyParser.urlencoded({ extended: false }));
   app.use(bodyParser.json());
   if (rateLimit) app.use(rateLimiter);
   app.use(cacheControl(3600)); // 1-hour default; /health overrides to no-store, /search to 5 min

   app.get('/', (req, res) => {
      res.send('Welcome to genshin-api');
   });

   for (const [paths, router] of ROUTES) app.use(paths, router);

   app.use(errorHandle);
   return app;
}
