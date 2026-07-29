// Script de RÉPARATION : réinjecte category_id, active et image_url
// qui ont été écrasés par le précédent script de ré-indexation.
// Ne touche PAS aux vecteurs (déjà corrects en Voyage AI).
// Usage : node scripts/repair-payload.js

const QDRANT_URL = process.env.QDRANT_URL || "https://e64816af-a69c-40ad-b1a3-ebdf7d871c06.europe-west3-0.gcp.cloud.qdrant.io:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const PRESTASHOP_URL = process.env.PRESTASHOP_URL || "https://www.maorediscount.yt";
const PRESTASHOP_API_KEY = process.env.PRESTASHOP_API_KEY;
const COLLECTION_NAME = "products";

if (!QDRANT_API_KEY) { console.error("❌ QDRANT_API_KEY manquante"); process.exit(1); }
if (!PRESTASHOP_API_KEY) { console.error("❌ PRESTASHOP_API_KEY manquante"); process.exit(1); }

const CONCURRENCY = 20;
const UPSERT_BATCH = 100;
const PROGRESS_FILE = "./repair-progress.json";

const fs = require("fs");

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8")));
    }
  } catch (e) {}
  return new Set();
}

function saveProgress(doneIds) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...doneIds]));
}

async function fetchWithRetry(url, options = {}, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status} ${errText.slice(0, 150)}`);
      }
      return response;
    } catch (err) {
      if (attempt === maxRetries) return null;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function getAllPrestaShopIds() {
  console.log("📋 Récupération de la liste complète des IDs PrestaShop...");
  const url = `${PRESTASHOP_URL}/api/products?ws_key=${PRESTASHOP_API_KEY}&output_format=JSON`;
  const response = await fetchWithRetry(url);
  const data = await response.json();
  const ids = [...new Set((data.products || []).map((p) => parseInt(p.id)))];
  console.log(`✅ ${ids.length} IDs trouvés côté PrestaShop.\n`);
  return ids;
}

async function getProductDetail(id) {
  const url = `${PRESTASHOP_URL}/api/products/${id}?ws_key=${PRESTASHOP_API_KEY}&output_format=JSON`;
  const response = await fetchWithRetry(url);
  if (!response) return null;
  const data = await response.json();
  return data.product || null;
}

async function setPayload(points) {
  await Promise.all(
    points.map((p) =>
      fetchWithRetry(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/payload?wait=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": QDRANT_API_KEY },
        body: JSON.stringify({
          payload: p.payload,
          points: [p.id],
        }),
      })
    )
  );
}

async function processChunk(ids) {
  const details = await Promise.all(ids.map((id) => getProductDetail(id)));
  const validProducts = details.filter(Boolean);
  if (validProducts.length === 0) return [];

  const points = validProducts.map((p) => {
    const id = parseInt(p.id);
    const categoryId = p.id_category_default ? parseInt(p.id_category_default) : null;
    const active = p.active === "1" || p.active === 1 || p.active === true;
    const imageId = p.id_default_image;
    const linkRewrite = p.link_rewrite || "";
    const imageUrl = imageId
      ? `${PRESTASHOP_URL}/${imageId}-large_default/${linkRewrite}.jpg`
      : "";

    return {
      id,
      payload: {
        category_id: categoryId,
        active,
        image_url: imageUrl,
      },
    };
  });

  for (const batch of chunk(points, UPSERT_BATCH)) {
    await setPayload(batch);
  }

  return points.map((p) => p.id);
}

async function main() {
  const startTime = Date.now();
  console.log("🔧 Réparation des payloads (category_id, active, image_url)...\n");

  const allIds = await getAllPrestaShopIds();
  const alreadyDone = loadProgress();
  const remainingIds = allIds.filter((id) => !alreadyDone.has(id));

  if (alreadyDone.size > 0) {
    console.log(`🔄 Reprise : ${alreadyDone.size} déjà réparés, ${remainingIds.length} restants.\n`);
  }

  const chunks = chunk(remainingIds, CONCURRENCY);
  let totalDone = alreadyDone.size;

  for (const idsChunk of chunks) {
    const doneIds = await processChunk(idsChunk);
    doneIds.forEach((id) => alreadyDone.add(id));
    totalDone += doneIds.length;
    saveProgress(alreadyDone);

    const pct = ((totalDone / allIds.length) * 100).toFixed(1);
    const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
    process.stdout.write(`\r✅ ${totalDone}/${allIds.length} (${pct}%) — ${elapsedMin} min écoulées`);
  }

  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);

  const totalMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n\n🎉 Réparation terminée ! ${totalDone} produits en ${totalMin} minutes.`);
}

main().catch((err) => {
  console.error("\nErreur fatale:", err.message);
  process.exit(1);
});
