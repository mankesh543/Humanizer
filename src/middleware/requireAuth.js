const { verifyToken } = require("../services/auth");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  const header = req.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const token = match[1].trim();
  let payload;
  try {
    payload = verifyToken(token);
  } catch (_) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "User no longer exists" });
    }
    req.user = user;
    return next();
  } catch (error) {
    console.error("[requireAuth] lookup error:", error.message);
    return res.status(500).json({ error: "Auth check failed" });
  }
}

module.exports = requireAuth;
