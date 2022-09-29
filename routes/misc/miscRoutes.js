import express from "express";
import fs from "fs";
import multer from "multer";
import S3 from "aws-sdk/clients/s3.js";
import * as dotenv from "dotenv";
dotenv.config();

const s3 = new S3({
   endpoint: `https://${process.env.R2_ID}.r2.cloudflarestorage.com/`,
   accessKeyId: process.env.AWS_ID,
   secretAccessKey: process.env.AWS_KEY,
   signatureVersion: "v4",
});

const router = express.Router();
const storeWithOriginalName = multer.diskStorage({
   destination: function (req, file, callback) {
      callback(null, "./");
   },
   filename: function (req, file, callback) {
      callback(null, file.originalname);
   },
});

const upload = multer({
   storage: storeWithOriginalName,
}).array("files");

router.post("/image", async (req, res) => {
   upload(req, res, async function (err) {
      if (err) {
         console.log(err);
         return res.send({ error: "err" });
      } else {
         try {
            let { character } = req.body;
            console.log(req.files);

            let publicUrls = [];
            //upload all images individually
            for (let i = 0; i < req.files.length; i++) {
               let fileName = req.files[i].originalname;
               let key = `${character}/${fileName}`;
               let blob = fs.readFileSync(req.files[i].path);
               let fileType = req.files[i].mimetype;
               const uploadedimg = await s3
                  .putObject({
                     Bucket: "genshin-images",
                     Key: key,
                     ContentType: fileType,
                     Body: blob,
                  })
                  .promise();
               publicUrls.push(
                  `https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev/${character}/${fileName}`
               );
               //delete file after upload
               fs.unlinkSync(req.files[i].path);
               console.log(uploadedimg);
            }

            res.send({
               public_url: publicUrls,
            });
         } catch (err) {
            console.log(err.stack);
            res.send({ error: "aws upload error" });
         }
      }
   });
});

export default router;
