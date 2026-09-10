const express = require("express");
const { query } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

router.get("/delivery-partners", async (req, res, next) => {
  try {
    const result = await query("SELECT id, name, phone, vehicle, is_active FROM delivery_partners ORDER BY name");
    return res.json({ deliveryPartners: result.rows });
  } catch (error) { return next(error); }
});

router.post("/delivery-partners", async (req, res, next) => {
  try {
    const { name, phone, vehicle } = req.body || {};
    if (!name || !phone) return res.status(400).json({ error: "Name and phone are required" });
    const result = await query("INSERT INTO delivery_partners (name, phone, vehicle) VALUES ($1, $2, $3) RETURNING id, name, phone, vehicle, is_active", [String(name).trim(), String(phone).trim(), vehicle || null]);
    return res.status(201).json({ deliveryPartner: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch("/delivery-partners/:id", async (req, res, next) => {
  try {
    const { name, phone, vehicle, isActive } = req.body || {};
    const result = await query(
      "UPDATE delivery_partners SET name = COALESCE($1, name), phone = COALESCE($2, phone), vehicle = COALESCE($3, vehicle), is_active = COALESCE($4, is_active), updated_at = now() WHERE id = $5 RETURNING id, name, phone, vehicle, is_active",
      [name || null, phone || null, vehicle || null, isActive === undefined ? null : Boolean(isActive), req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Delivery partner not found" });
    return res.json({ deliveryPartner: result.rows[0] });
  } catch (error) { return next(error); }
});

router.post("/orders/:id/assign", async (req, res, next) => {
  try {
    if (!req.body || !req.body.deliveryPartnerId) return res.status(400).json({ error: "Delivery partner is required" });
    const result = await query(
      `UPDATE orders SET delivery_partner_id = $1, status = 'assigned', updated_at = now()
       WHERE id = $2 AND EXISTS (SELECT 1 FROM delivery_partners WHERE id = $1 AND is_active = true)
       RETURNING id, status, delivery_partner_id`,
      [req.body.deliveryPartnerId, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Order or active delivery partner not found" });
    return res.json({ order: result.rows[0] });
  } catch (error) { return next(error); }
});

router.get("/cities", async (req, res, next) => {
  try {
    const result = await query("SELECT id, name, state, is_active FROM cities ORDER BY name");
    return res.json({ cities: result.rows });
  } catch (error) { return next(error); }
});

router.post("/cities", async (req, res, next) => {
  try {
    const { name, state } = req.body || {};
    if (!name) return res.status(400).json({ error: "City name is required" });
    const result = await query("INSERT INTO cities (name, state) VALUES ($1, $2) RETURNING id, name, state, is_active", [String(name).trim(), state || null]);
    return res.status(201).json({ city: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "City already exists" });
    return next(error);
  }
});

router.patch("/cities/:id", async (req, res, next) => {
  try {
    const { name, state, isActive } = req.body || {};
    const result = await query(
      "UPDATE cities SET name = COALESCE($1, name), state = COALESCE($2, state), is_active = COALESCE($3, is_active) WHERE id = $4 RETURNING id, name, state, is_active",
      [name || null, state || null, isActive === undefined ? null : Boolean(isActive), req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "City not found" });
    return res.json({ city: result.rows[0] });
  } catch (error) { return next(error); }
});

router.delete("/cities/:id", async (req, res, next) => {
  try {
    const result = await query("UPDATE cities SET is_active = false WHERE id = $1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "City not found" });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

router.post("/clinics", async (req, res, next) => {
  try {
    const { cityId, name, address, phone } = req.body || {};
    if (!cityId || !name || !address) return res.status(400).json({ error: "City, clinic name and address are required" });
    const result = await query("INSERT INTO clinics (city_id, name, address, phone) VALUES ($1, $2, $3, $4) RETURNING id, city_id, name, address, phone, is_active", [cityId, String(name).trim(), String(address).trim(), phone || null]);
    return res.status(201).json({ clinic: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch("/clinics/:id", async (req, res, next) => {
  try {
    const { name, address, phone, isActive } = req.body || {};
    const result = await query(
      "UPDATE clinics SET name = COALESCE($1, name), address = COALESCE($2, address), phone = COALESCE($3, phone), is_active = COALESCE($4, is_active) WHERE id = $5 RETURNING id, city_id, name, address, phone, is_active",
      [name || null, address || null, phone || null, isActive === undefined ? null : Boolean(isActive), req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Clinic not found" });
    return res.json({ clinic: result.rows[0] });
  } catch (error) { return next(error); }
});

router.delete("/clinics/:id", async (req, res, next) => {
  try {
    const result = await query("UPDATE clinics SET is_active = false WHERE id = $1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Clinic not found" });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

module.exports = router;
