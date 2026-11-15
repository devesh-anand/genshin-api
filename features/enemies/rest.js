import express from 'express';
import { handle, sendList, sendOr404 } from '../../lib/http.js';
import { listEnemies, getEnemy, listEnemyTypes, toSummary } from './service.js';

const router = express.Router();

router.get('/', handle(async (req, res) => {
   const { type, details, sort, order } = req.query;
   sendList(res, 'enemies', await listEnemies({ type, sort, order }), details, toSummary);
}));

router.get('/types', handle(async (req, res) => res.send({ types: await listEnemyTypes() })));

router.get('/:name', handle(async (req, res) => {
   sendOr404(res, await getEnemy(req.params.name), 'Enemy not found.');
}));

export default router;
