import express from "express";
import { weapons } from "./controllers.js";

const router = express.Router();

router.get("/", weapons);

export default router;
