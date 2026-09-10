const express = require("express");
const { query } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const categories = new Set(["Mitti", "Bamboo", "Silk", "Waste"]);

router.get("/", async (req, res, next) => {
  try {
    const values = [];
    let where = "p.is_active = true";
    if (req.query.category && req.query.category !== "All") {
      values.push(req.query.category);
      where += ` AND p.category = $${values.length}`;
    }
    const result = await query(
      `SELECT p.id, p.name, p.description, p.price, p.category, p.image_url AS image, p.stock,
              u.name AS maker
       FROM products p JOIN users u ON u.id = p.seller_id
       WHERE ${where} ORDER BY p.created_at DESC`,
      values
    );
    return res.json({ products: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireAuth, requireRole("seller", "admin"), async (req, res, next) => {
  try {
    const { name, description, price, category, image, stock = 0 } = req.body || {};
    const numericPrice = Number(price);
    const numericStock = Number(stock);
    if (!name || !categories.has(category) || !Number.isFinite(numericPrice) || numericPrice < 0 || !Number.isInteger(numericStock) || numericStock < 0) {
      return res.status(400).json({ error: "Name, valid category, non-negative price and stock are required" });
    }
    const sellerId = req.user.role === "admin" && req.body.sellerId ? req.body.sellerId : req.user.id;
    const result = await query(
      `INSERT INTO products (seller_id, name, description, price, category, image_url, stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, price, category, image_url AS image, stock`,
      [sellerId, String(name).trim(), description || null, numericPrice, category, image || null, numericStock]
    );
    return res.status(201).json({ product: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", requireAuth, requireRole("seller", "admin"), async (req, res, next) => {
  try {
    const fields = ["name", "description", "price", "category", "image_url", "stock"];
    const updates = [];
    const values = [];
    for (const field of fields) {
      const key = field === "image_url" ? "image" : field;
      if (req.body && req.body[key] !== undefined) {
        if (field === "category" && !categories.has(req.body[key])) return res.status(400).json({ error: "Invalid handmade category" });
        if (field === "price" && (!Number.isFinite(Number(req.body[key])) || Number(req.body[key]) < 0)) return res.status(400).json({ error: "Price must be a non-negative number" });
        if (field === "stock" && (!Number.isInteger(Number(req.body[key])) || Number(req.body[key]) < 0)) return res.status(400).json({ error: "Stock must be a non-negative integer" });
        values.push(field === "price" || field === "stock" ? Number(req.body[key]) : req.body[key]);
        updates.push(`${field} = $${values.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: "No product changes supplied" });
    values.push(req.params.id);
    const ownerClause = req.user.role === "admin" ? "" : ` AND seller_id = $${values.length + 1}`;
    if (req.user.role !== "admin") values.push(req.user.id);
    const result = await query(
      `UPDATE products SET ${updates.join(", ")}, updated_at = now()
       WHERE id = $${values.length - (req.user.role === "admin" ? 0 : 1)}${ownerClause}
       RETURNING id, name, description, price, category, image_url AS image, stock`,
      values
    );
    if (!result.rowCount) return res.status(404).json({ error: "Product not found" });
    return res.json({ product: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireAuth, requireRole("seller", "admin"), async (req, res, next) => {
  try {
    const values = [req.params.id];
    let ownerClause = "";
    if (req.user.role !== "admin") {
      values.push(req.user.id);
      ownerClause = " AND seller_id = $2";
    }
    const result = await query(`UPDATE products SET is_active = false, updated_at = now() WHERE id = $1${ownerClause}`, values);
    if (!result.rowCount) return res.status(404).json({ error: "Product not found" });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
