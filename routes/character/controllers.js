import express from "express";
import fs from "fs/promises";
import path from "path";
import {
   getCharactersOfType,
   getCharactersOfElement,
   charsWithImages,
} from "./scripts.js";

const dirname = path.resolve();

export const characters = async (req, res, next) => {
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
};

export const imgList = async (req, res, next) => {
   try {
      let chars = await charsWithImages();

      res.send({ characters: chars });
   } catch (e) {
      next(e);
   }
};

export const imgOfCharsOfElement = async (req, res, next) => {
   try {
      let element = req.params.element;
      let chars = await charsWithImages(element);

      res.send({ characters: chars });
   } catch (e) {
      next(e);
   }
};

export const name = async (req, res) => {
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
};

export const element = async (req, res, next) => {
   try {
      let element = req.params.element;
      let characters = await getCharactersOfElement(element);

      res.send({ characters: characters });
   } catch (e) {
      console.log(e);
      next(e);
   }
};

export const weapon = async (req, res, next) => {
   try {
      let type = req.params.weapon;
      let characters = await getCharactersOfType(type);

      res.send({ characters: characters });
   } catch (e) {
      next(e);
   }
};
