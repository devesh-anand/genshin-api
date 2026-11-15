import express from 'express';
import { handle } from '../../lib/http.js';
import { getHealth } from './service.js';

const router = express.Router();

router.get('/', handle(async (req, res) => {
   const health = await getHealth();
   res.set('Cache-Control', 'no-store');
   res.send(health);
}));

export default router;
