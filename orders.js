const express = require("express");
const { query, withTransaction } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/cart", requireAuth, requireRole("customer"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT ci.product_id, ci.quantity, p.name, p.price, p.image_url AS image,
              (ci.quantity * p.price)::numeric AS line_total
       FROM carts c JOIN cart_items ci ON ci.cart_id = c.id
       JOIN products p ON p.id = ci.product_id WHERE c.user_id = $1 AND p.is_active = true
       ORDER BY ci.created_at`,
      [req.user.id]
    );
    return res.json({ items: result.rows, total: result.rows.reduce((sum, item) => sum + Number(item.line_total), 0) });
  } catch (error) {
    return next(error);
  }
});

router.post("/cart/items", requireAuth, requireRole("customer"), async (req, res, next) => {
  try {
    const quantity = Number(req.body && req.body.quantity);
    if (!req.body || !req.body.productId || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: "A product and a positive quantity are required" });
    }
    await withTransaction(async client => {
      const product = await client.query("SELECT id, stock FROM products WHERE id = $1 AND is_active = true", [req.body.productId]);
      if (!product.rowCount) throw Object.assign(new Error("Product not found"), { status: 404 });
      const cart = await client.query("INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING id", [req.user.id]);
      await client.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
        [cart.rows[0].id, req.body.productId, quantity]
      );
    });
    return res.status(201).json({ message: "Product added to cart" });
  } catch (error) {
    return next(error);
  }
});

router.delete("/cart/items/:productId", requireAuth, requireRole("customer"), async (req, res, next) => {
  try {
    await query("DELETE FROM cart_items ci USING carts c WHERE ci.cart_id = c.id AND c.user_id = $1 AND ci.product_id = $2", [req.user.id, req.params.productId]);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireAuth, requireRole("customer"), async (req, res, next) => {
  try {
    const { shippingAddress } = req.body || {};
    if (!shippingAddress || String(shippingAddress).trim().length < 5) return res.status(400).json({ error: "A shipping address is required" });
    const order = await withTransaction(async client => {
      const cart = await client.query(
        `SELECT c.id, ci.product_id, ci.quantity, p.price, p.stock
         FROM carts c JOIN cart_items ci ON ci.cart_id = c.id JOIN products p ON p.id = ci.product_id
         WHERE c.user_id = $1 AND p.is_active = true FOR UPDATE`,
        [req.user.id]
      );
      if (!cart.rowCount) throw Object.assign(new Error("Your cart is empty"), { status: 400 });
      if (cart.rows.some(item => item.quantity > item.stock)) throw Object.assign(new Error("One or more products no longer have enough stock"), { status: 409 });
      const total = cart.rows.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
      const created = await client.query("INSERT INTO orders (customer_id, total_amount, shipping_address) VALUES ($1, $2, $3) RETURNING id, status, total_amount, created_at", [req.user.id, total, String(shippingAddress).trim()]);
      for (const item of cart.rows) {
        await client.query("INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)", [created.rows[0].id, item.product_id, item.quantity, item.price]);
        await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [item.quantity, item.product_id]);
      }
      await client.query("DELETE FROM cart_items WHERE cart_id = $1", [cart.rows[0].id]);
      return created.rows[0];
    });
    return res.status(201).json({ order });
  } catch (error) {
    return next(error);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const params = [];
    let filter = "";
    if (req.user.role === "customer") {
      params.push(req.user.id);
      filter = "WHERE o.customer_id = $1";
    }
    const result = await query(
      `SELECT o.id, o.status, o.total_amount, o.shipping_address, o.delivery_partner_id, o.created_at,
              u.name AS customer_name
       FROM orders o JOIN users u ON u.id = o.customer_id ${filter} ORDER BY o.created_at DESC LIMIT 100`,
      params
    );
    return res.json({ orders: result.rows });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
