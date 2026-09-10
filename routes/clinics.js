const express = require("express");
const { query } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const values = [];
    const where = req.query.cityId ? "WHERE c.city_id = $1 AND c.is_active = true" : "WHERE c.is_active = true";
    if (req.query.cityId) values.push(req.query.cityId);
    const result = await query(
      `SELECT c.id, c.name, c.address, c.phone, ci.id AS city_id, ci.name AS city
       FROM clinics c JOIN cities ci ON ci.id = c.city_id ${where} ORDER BY c.name`,
      values
    );
    return res.json({ clinics: result.rows });
  } catch (error) { return next(error); }
});

router.get("/cities", async (req, res, next) => {
  try {
    const result = await query("SELECT id, name, state FROM cities WHERE is_active = true ORDER BY name");
    return res.json({ cities: result.rows });
  } catch (error) { return next(error); }
});

router.post("/appointments", requireAuth, requireRole("customer"), async (req, res, next) => {
  try {
    const { clinicId, appointmentDate, notes } = req.body || {};
    const date = new Date(appointmentDate);
    if (!clinicId || !appointmentDate || Number.isNaN(date.getTime()) || date < new Date()) {
      return res.status(400).json({ error: "A future clinic and appointment date are required" });
    }
    const result = await query(
      "INSERT INTO appointments (customer_id, clinic_id, appointment_date, notes) VALUES ($1, $2, $3, $4) RETURNING id, clinic_id, appointment_date, status, notes",
      [req.user.id, clinicId, date, notes || null]
    );
    return res.status(201).json({ appointment: result.rows[0] });
  } catch (error) { return next(error); }
});

router.get("/appointments", requireAuth, async (req, res, next) => {
  try {
    const params = [];
    let filter = "";
    if (req.user.role === "customer") {
      params.push(req.user.id);
      filter = "WHERE a.customer_id = $1";
    }
    const result = await query(
      `SELECT a.id, a.appointment_date, a.status, a.notes, c.name AS clinic, ci.name AS city
       FROM appointments a JOIN clinics c ON c.id = a.clinic_id JOIN cities ci ON ci.id = c.city_id
       ${filter} ORDER BY a.appointment_date DESC`,
      params
    );
    return res.json({ appointments: result.rows });
  } catch (error) { return next(error); }
});

module.exports = router;
