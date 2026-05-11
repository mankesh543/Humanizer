const { app } = require("../src/server");
const { connectDb } = require("../src/db");

module.exports = async (req, res) => {
  try {
    await connectDb();
  } catch (error) {
    console.error("[vercel] MongoDB connect failed:", error.message);
  }
  return app(req, res);
};
