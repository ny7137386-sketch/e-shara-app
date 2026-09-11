require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const adminRoutes = require("./routes/admin");
const clinicRoutes = require("./routes/clinics");
const paymentRoutes = require("./routes/payments");

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  console.warn("DATABASE_URL and JWT_SECRET should be set before starting the server.");
}

const app = express();
const configuredOrigins = (process.env.CLIENT_ORIGIN || "").split(",").map(value => value.trim()).filter(Boolean);
const allowedOrigins = configuredOrigins.length ? configuredOrigins : ["http://localhost:3000"];
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "https://checkout.razorpay.com"],
      "frame-src": ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
      "img-src": ["'self'", "data:", "https:"]
    }
  }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  }
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/api/health", (req, res) => res.json({ ok: true, service: "e-shara-app" }));
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", clinicRoutes);
app.use("/api/payments", paymentRoutes);
app.use(express.static(path.join(__dirname)));
app.use("/api", (req, res) => res.status(404).json({ error: "API route not found" }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  const status = error.status || (error.type === "entity.parse.failed" ? 400 : ["22P02", "23503", "23514"].includes(error.code) ? 400 : 500);
  return res.status(status).json({ error: status === 500 ? "Internal server error" : (error.message || "Invalid request") });
});

const port = Number(process.env.PORT) || 3000;
if (require.main === module) app.listen(port, () => console.log(`e shara app listening on port ${port}`));
module.exports = app;
