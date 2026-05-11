const express = require("express");
const rateLimit = require("express-rate-limit");

const User = require("../models/User");
const requireAuth = require("../middleware/requireAuth");
const {
  hashPassword,
  verifyPassword,
  issueToken,
  isValidEmail,
  isValidPassword,
  sanitizeName,
} = require("../services/auth");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a minute." },
});

router.post("/signup", authLimiter, async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!isValidPassword(password)) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters." });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return res.status(409).json({
        error: "An account with this email already exists. Try signing in.",
      });
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: sanitizeName(name),
    });

    const token = issueToken(user);
    return res.status(201).json({ token, user: user.toPublicJson() });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        error: "An account with this email already exists.",
      });
    }
    console.error("[auth/signup] error:", error.message);
    return res.status(500).json({ error: "Could not create account." });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  if (!isValidEmail(email) || typeof password !== "string" || !password) {
    return res.status(400).json({ error: "Invalid email or password." });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = issueToken(user);
    return res.json({ token, user: user.toPublicJson() });
  } catch (error) {
    console.error("[auth/login] error:", error.message);
    return res.status(500).json({ error: "Could not sign in." });
  }
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user.toPublicJson() });
});

module.exports = router;
