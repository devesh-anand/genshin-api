import express from "express";
import {
   characters,
   element,
   imgList,
   imgOfCharsOfElement,
   name,
   weapon,
} from "./controllers.js";

const router = express.Router();

router.get("/", characters);

//gets a list of all characters of an element along with icon
router.get("/imglist", imgList);

router.get("/imglist/:element", imgOfCharsOfElement);

router.get("/:name", name);

router.get("/element/:element", element);

router.get("/weapon/:weapon", weapon);

export default router;
