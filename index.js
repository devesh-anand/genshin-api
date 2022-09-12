import * as dotenv from "dotenv";
dotenv.config();
import express from "express";

const app = express();
app.get("/", (req, res) => {
   // can show homepage here
   res.send("Welcome to genshin-api");
});

app.get("/characters/:name", async (req, res) => {
   res.send(req.params);
});

app.get("/character", async (req, res) => {
   res.send({ character: "genshin-characters" });
});

app.listen(process.env.PORT, () => {
   console.log(`app on port 5k`);
});
