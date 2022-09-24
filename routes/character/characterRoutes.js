import express from "express";
import fs from "fs/promises";
import path from "path";
import { getCharactersOfType } from "./scripts.js";

const dirname = path.resolve();
const router = express.Router();

router.get("/", async (req, res, next) => {
   try {
      let names = [];
      let allChars = await fs.readdir(dirname + `/data/characters/`);
      let data = allChars.forEach((fileName) => {
         names.push(fileName.split(".")[0]);
      });
      data = {
         characters: names,
      };

      res.send(data);
   } catch (e) {
      console.log(e);
      next(e);
   }
});

router.get("/:name", async (req, res) => {
   try {
      let name = req.params.name;
      let data = await fs.readFile(
         dirname + `/data/characters/${name}.json`,
         "utf-8"
      );
      data = JSON.parse(data);

      res.send(data);
   } catch (e) {
      res.send({ error: "Character not found." });
   }
});

router.get("/type/:weapon", async (req, res, next) => {
   try {
      let type = req.params.weapon;
      let characters = await getCharactersOfType(type);

      res.send({ characters: characters });
   } catch (e) {
      next(e);
   }
});

export default router;
