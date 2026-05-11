const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const config = require("../config");

const BCRYPT_COST = 10;

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function issueToken(user) {
  if (!config.jwtSecret) {
    throw new Error("JWT_SECRET is not set in backend/.env");
  }
  return jwt.sign(
    { sub: user._id.toString(), email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry, algorithm: "HS256" }
  );
}

function verifyToken(token) {
  if (!config.jwtSecret) {
    throw new Error("JWT_SECRET is not set in backend/.env");
  }
  return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value) {
  return typeof value === "string" && EMAIL_REGEX.test(value.trim());
}

function isValidPassword(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 200;
}

function sanitizeName(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 60);
}

module.exports = {
  hashPassword,
  verifyPassword,
  issueToken,
  verifyToken,
  isValidEmail,
  isValidPassword,
  sanitizeName,
};
