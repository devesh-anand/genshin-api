import express from "express";
import {
   characters,
   element,
   elements,
   imgList,
   imgOfCharsOfElement,
   name,
   nations,
   weapon,
} from "./controllers.js";

const router = express.Router();

router.get("/", characters);

router.get("/elements", elements);
router.get("/nations", nations);

// kept for backwards compatibility
router.get("/imglist", imgList);
router.get("/imglist/:element", imgOfCharsOfElement);
router.get("/element/:element", element);
router.get("/weapon/:weapon", weapon);

// must be last — catches any slug
router.get("/:name", name);

export default router;
