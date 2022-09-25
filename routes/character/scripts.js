import fs from "fs/promises";
import path from "path";

const dirname = path.resolve();

export async function getCharactersOfType(type) {
   let allChars = await fs.readdir(dirname + `/data/characters/`);

   let characters = await Promise.all(
      allChars.map(async (name) => {
         let charData = await fs.readFile(dirname + `/data/characters/${name}`);
         charData = JSON.parse(charData);
         if (charData.weapon_type.toUpperCase() == type.toUpperCase()) {
            return name.split(".")[0];
         } else return "";
      })
   );
   characters = characters.filter((name) => name != "");

   return characters;
}

export async function getCharactersOfElement(element) {
   let allChars = await fs.readdir(dirname + `/data/characters/`);

   let characters = await Promise.all(
      allChars.map(async (name) => {
         let charData = await fs.readFile(
            dirname + `/data/characters/${name}`,
            "utf-8"
         );
         charData = JSON.parse(charData);
         if (charData.vision.toUpperCase() == element.toUpperCase()) {
            return name.split(".")[0];
         } else return "";
      })
   );
   characters = characters.filter((name) => name != "");

   return characters;
}
