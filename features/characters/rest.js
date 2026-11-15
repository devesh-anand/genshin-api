import express from 'express';
import { handle, sendList, sendOr404 } from '../../lib/http.js';
import {
   listCharacters,
   getCharacter,
   listElements,
   listNations,
   toSummary,
} from './service.js';

const router = express.Router();

router.get('/', handle(async (req, res) => {
   const { element, weapon, nation, rarity, details, sort, order } = req.query;
   sendList(res, 'characters', await listCharacters({ element, weapon, nation, rarity, sort, order }), details, toSummary);
}));

router.get('/elements', handle(async (req, res) => res.send({ elements: await listElements() })));
router.get('/nations', handle(async (req, res) => res.send({ nations: await listNations() })));

// Legacy endpoints, kept for backwards compatibility
router.get('/imglist', handle(async (req, res) => {
   res.send({ characters: (await listCharacters()).map(toSummary) });
}));
router.get('/imglist/:element', handle(async (req, res) => {
   res.send({ characters: (await listCharacters({ element: req.params.element })).map(toSummary) });
}));
router.get('/element/:element', handle(async (req, res) => {
   sendList(res, 'characters', await listCharacters({ element: req.params.element }));
}));
router.get('/weapon/:weapon', handle(async (req, res) => {
   sendList(res, 'characters', await listCharacters({ weapon: req.params.weapon }));
}));

// must be last — catches any slug
router.get('/:name', handle(async (req, res) => {
   sendOr404(res, await getCharacter(req.params.name), 'Character not found.');
}));

export default router;
