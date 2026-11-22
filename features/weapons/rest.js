import express from 'express';
import { handle, sendList, sendOr404 } from '../../lib/http.js';
import { listWeapons, getWeaponDetail, listWeaponTypes, toSummary } from './service.js';

const router = express.Router();

router.get('/', handle(async (req, res) => {
   const { type, rarity, details, sort, order } = req.query;
   sendList(res, 'weapons', await listWeapons({ type, rarity, sort, order }), details, toSummary);
}));

router.get('/types', handle(async (req, res) => res.send({ types: await listWeaponTypes() })));

router.get('/:name', handle(async (req, res) => {
   sendOr404(res, await getWeaponDetail(req.params.name), 'Weapon not found.');
}));

export default router;
