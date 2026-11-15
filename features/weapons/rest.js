import express from 'express';
import { weapons, weaponByName, weaponTypes } from './controllers.js';

const router = express.Router();

router.get('/', weapons);
router.get('/types', weaponTypes);
router.get('/:name', weaponByName);

export default router;
