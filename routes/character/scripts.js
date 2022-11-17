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

export async function charsWithImages(element = "all") {
   let allChars = await fs.readdir(dirname + `/data/characters/`);

   let data = await Promise.all(
      allChars.map(async (name) => {
         let charData = await fs.readFile(
            dirname + `/data/characters/${name}`,
            "utf-8"
         );
         charData = JSON.parse(charData);
         if (element == "all") {
            let info = {
               name: charData.name,
               key: name.split(".")[0],
               element: charData.vision,
               img: charData.img,
            };

            return info;
         } else if (charData.vision.toUpperCase() == element.toUpperCase()) {
            let info = {
               name: charData.name,
               key: name.split(".")[0],
               element: charData.vision,
               img: charData.img,
            };

            return info;
         } else return "";
      })
   );
   data = data.filter((name) => name != "");

   return data;
}
