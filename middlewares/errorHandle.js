export default function errorHandle(err, req, res, next) {
   try {
      console.log("error: ", err.message);
      res.send({ error: err.message });
   } catch (err) {
      next(err);
   }
}
