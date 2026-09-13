const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { query } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error("Payment service is not configured yet"), { status: 503 });
  }
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

router.post("/create-order", requireAuth, requireRole("customer"), async (req, res, next) => {
  try {
    const { orderId } = req.body || {};
    const result = await query("SELECT id, total_amount FROM orders WHERE id = $1 AND customer_id = $2", [orderId, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Order not found" });
    const paymentOrder = await razorpayClient().orders.create({ amount: Math.round(Number(result.rows[0].total_amount) * 100), currency: "INR", receipt: `eshara-${result.rows[0].id}` });
    await query("INSERT INTO payments (order_id, provider, provider_order_id, amount, status) VALUES ($1, 'razorpay', $2, $3, 'created') ON CONFLICT (provider_order_id) DO NOTHING", [orderId, paymentOrder.id, result.rows[0].total_amount]);
    return res.status(201).json({ keyId: process.env.RAZORPAY_KEY_ID, paymentOrder });
  } catch (error) { return next(error); }
});

router.post("/verify", requireAuth, requireRole("customer"), async (req, res, next) => {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ error: "Payment verification details are required" });
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (expected !== razorpay_signature) return res.status(400).json({ error: "Payment verification failed" });
    const updated = await query("UPDATE payments p SET provider_payment_id = $1, status = 'paid', paid_at = now() FROM orders o WHERE p.order_id = o.id AND p.provider_order_id = $2 AND p.order_id = $3 AND o.customer_id = $4 RETURNING p.order_id", [razorpay_payment_id, razorpay_order_id, orderId, req.user.id]);
    if (!updated.rowCount) return res.status(404).json({ error: "Payment order not found" });
    return res.json({ paid: true, orderId });
  } catch (error) { return next(error); }
});

module.exports = router;
