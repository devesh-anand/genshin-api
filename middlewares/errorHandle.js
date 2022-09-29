export default function errorHandle(err, req, res, next) {
   try {
      console.log("error: ", err.stack);
      res.send({ error: err.message });
   } catch (err) {
      next(err);
   }
}
