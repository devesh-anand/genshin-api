import express from "express";
import fs from "fs/promises";
import path from "path";

const dirname = path.resolve();
const router = express.Router();

router.get("/:name", async (req, res, next) => {
   try {
      let name = req.params.name;
      let data = await fs.readFile(
         dirname + `/data/characters/${name}.json`,
         "utf-8"
      );
      data = JSON.parse(data);

      res.send(data);
   } catch (e) {
      next(e);
   }
});

export default router;
