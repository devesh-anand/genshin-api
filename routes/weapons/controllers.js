export const weapons = async (req, res, next) => {
   try {
      res.send("testing weapons");
   } catch (e) {
      console.log(e);
      next(e);
   }
};
