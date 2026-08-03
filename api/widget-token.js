// /api/widget-token.js — Génère un token signé à courte durée de vie pour le widget
const crypto = require("crypto");

const ALLOWED_ORIGINS = [
  "https://www.maorediscount.yt",
  "https://maorediscount.yt",
  "https://maorediscount-api.vercel.app",
];
const TOKEN_TTL_SEC = 300; // 5 minutes

module.exports = async function handler(req, res) {
  const origin = req.headers["origin"] || req.headers["referer"] || "";
  const matchedOrigin = ALLOWED_ORIGINS.find((allowed) => origin.startsWith(allowed));
  const isAllowed = Boolean(matchedOrigin);

  res.setHeader("Access-Control-Allow-Origin", isAllowed ? matchedOrigin : "null");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!isAllowed) {
    console.warn("widget-token: origine refusée:", origin);
    return res.status(403).json({ error: "Origine non autorisée" });
  }

  const expires = Date.now() + TOKEN_TTL_SEC * 1000;
  const payload = `${expires}`;
  const signature = crypto
    .createHmac("sha256", process.env.WIDGET_SECRET)
    .update(payload)
    .digest("hex");

  const token = `${expires}.${signature}`;
  return res.status(200).json({ token, expiresIn: TOKEN_TTL_SEC });
};
