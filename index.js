import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import errorHandle from "./middlewares/errorHandle.js";
import characterRoutes from "./routes/character/characterRoutes.js";

const app = express();
app.get("/", (req, res) => {
   res.send("Welcome to genshin-api");
});

app.use("/character", characterRoutes);

app.get("/character", async (req, res) => {
   res.send({ character: "genshin-characters" });
});

app.use(errorHandle);

app.listen(process.env.PORT, () => {
   console.log(`app on port 5k`);
});