import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import errorHandle from "./middlewares/errorHandle.js";
import characterRoutes from "./routes/character/characterRoutes.js";
import miscRoutes from "./routes/misc/miscRoutes.js";

const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
   res.send("Welcome to genshin-api");
});

app.use(["/character", "/characters"], characterRoutes);

app.use("/others", miscRoutes);

app.use(errorHandle);

app.post("/image", async (req, res) => {});

app.listen(process.env.PORT, () => {
   console.log(`app on port 5k`);
});
