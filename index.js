import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import errorHandle from "./middlewares/errorHandle.js";
import characterRoutes from "./routes/character/characterRoutes.js";
import miscRoutes from "./routes/misc/miscRoutes.js";
import weaponRoutes from "./routes/weapons/weaponRoutes.js";

const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
   res.send("Welcome to genshin-api");
});

app.use(["/character", "/characters"], characterRoutes);

app.use(["/weapon", "/weapons"], weaponRoutes);

app.use("/others", miscRoutes);

app.use(errorHandle);

app.listen(process.env.PORT, () => {
   console.log(`app running`);
});
