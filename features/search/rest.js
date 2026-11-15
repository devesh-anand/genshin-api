import express from 'express';
import { handle } from '../../lib/http.js';
import { searchAll } from './service.js';

const router = express.Router();

router.get('/', handle(async (req, res) => {
   const result = await searchAll(req.query.q);
   res.set('Cache-Control', 'public, max-age=300');
   res.send(result);
}));

export default router;
