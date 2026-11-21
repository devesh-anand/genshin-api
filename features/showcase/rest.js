import express from 'express';
import { handle } from '../../lib/http.js';
import { getShowcase, cacheSeconds } from './service.js';

const router = express.Router();

// A player's in-game Character Showcase (via Enka.Network). Errors: 400 bad UID,
// 404 no such player, 503 (+ Retry-After) when Enka is down or busy.
router.get('/:uid', handle(async (req, res) => {
   res.set('Cache-Control', 'no-store'); // errors (404/503) must not be cached for the 1-hour default
   const showcase = await getShowcase(req.params.uid);
   res.set('Cache-Control', `public, max-age=${cacheSeconds(showcase)}`);
   res.send(showcase);
}));

export default router;
