const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../db");

const router = express.Router();
const roles = new Set(["customer", "seller"]);

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone };
}

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, phone, role = "customer" } = req.body || {};
    if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string" || !name.trim() || !email.trim() || password.length < 8 || !roles.has(role)) {
      return res.status(400).json({ error: "Name, email, role and a password of at least 8 characters are required" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      "INSERT INTO users (name, email, phone, password_hash, role) VALUES ($1, lower($2), $3, $4, $5) RETURNING id, name, email, phone, role",
      [String(name).trim(), String(email).trim(), phone || null, passwordHash, role]
    );
    return res.status(201).json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "An account with that email already exists" });
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password, role } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) return res.status(400).json({ error: "Email and password are required" });
    const result = await query("SELECT * FROM users WHERE lower(email) = lower($1) AND ($2::user_role IS NULL OR role = $2::user_role)", [email, role || null]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email, password or role" });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.json({ token, user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission for this action" });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
