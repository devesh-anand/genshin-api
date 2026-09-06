import express from 'express';
import { characterStore } from '../character/characterStore.js';
import { weaponStore } from '../weapons/weaponStore.js';
import { artifactStore } from '../artifacts/artifactStore.js';

const router = express.Router();
const startTime = Date.now();

router.get('/', async (req, res, next) => {
   try {
      const [chars, weapons, artifacts] = await Promise.all([
         characterStore.getAll(),
         weaponStore.getAll(),
         artifactStore.getAll(),
      ]);
      res.send({
         status: 'ok',
         uptime: Math.floor((Date.now() - startTime) / 1000),
         counts: {
            characters: chars.length,
            weapons: weapons.length,
            artifacts: artifacts.length,
         },
      });
   } catch (e) {
      next(e);
   }
});

export default router;
