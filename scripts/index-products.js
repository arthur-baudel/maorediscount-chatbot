// Script d'indexation de tous les produits PrestaShop dans Qdrant
// Usage : node scripts/index-products.js
// Durée estimée : 10-30 minutes pour 45 000 produits

const QDRANT_URL = "https://e64816af-a69c-40ad-b1a3-ebdf7d871c06.europe-west3-0.gcp.cloud.qdrant.io:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const PRESTASHOP_URL = "https://www.maorediscount.yt"; // <-- corrigé (.com redirigeait en 301 vers .yt, même site mais on évite le hop inutile)
const PRESTASHOP_API_KEY = process.env.PRESTASHOP_API_KEY;
const COLLECTION_NAME = "products";

const BATCH_SIZE = 500;   // Produits récupérés par page PrestaShop
const UPSERT_BATCH = 100; // Produits envoyés à Qdrant par batch

// Fonction simple de vectorisation par hachage (pas besoin de modèle ML)
function textToVector(text, size = 384) {
  const vector = new Array(size).fill(0);
  const normalized = text.toLowerCase().trim();
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    vector[i % size] += code / 1000;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return magnitude > 0 ? vector.map((v) => v / magnitude) : vector;
}

async function upsertToQdrant(points) {
  const response = await fetch(
    `${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=true`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "api-key": QDRANT_API_KEY,
      },
      body: JSON.stringify({ points }),
    }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Qdrant upsert error: ${err}`);
  }
}

async function getTotalProductCount() {
  // Demande le nombre total de produits annoncé par PrestaShop pour pouvoir comparer à la fin
  const url = `${PRESTASHOP_URL}/api/products?ws_key=${PRESTASHOP_API_KEY}&output_format=JSON`;
  const response = await fetch(url, { method: "HEAD" }).catch(() => null);
  // Certaines configs PrestaShop renvoient le total dans le header PSDATA-Products-Count même en HEAD
  if (response && response.headers.get("psdata-products-count")) {
    return parseInt(response.headers.get("psdata-products-count"));
  }
  return null; // pas grave si indisponible, c'est juste informatif
}

async function indexProducts() {
  console.log("🚀 Démarrage de l'indexation...");

  const announcedTotal = await getTotalProductCount();
  if (announcedTotal) {
    console.log(`ℹ️  PrestaShop annonce ${announcedTotal} produits au total.`);
  }

  let offset = 0;
  let totalIndexed = 0;
  let hasMore = true;

  while (hasMore) {
    console.log(`📦 Récupération des produits offset=${offset}...`);
    const url = `${PRESTASHOP_URL}/api/products?ws_key=${PRESTASHOP_API_KEY}&output_format=JSON&display=[id,name,description_short,price,link_rewrite]&limit=${BATCH_SIZE}&offset=${offset}&language=1`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PrestaShop error: ${response.status}`);
    const data = await response.json();
    const products = data.products || [];

    // FIX : on ne s'arrête que si la page est VRAIMENT vide.
    // L'ancienne condition (products.length < BATCH_SIZE) arrêtait la boucle
    // dès qu'une page intermédiaire renvoyait un peu moins de 500 produits,
    // ce qui coupait l'indexation en plein milieu du catalogue (cause probable
    // des 11 000 produits indexés au lieu de 45 000).
    if (products.length === 0) {
      hasMore = false;
      break;
    }

    const points = products.map((p) => {
      const name = p.name || "";
      const description = (p.description_short || "").replace(/<[^>]+>/g, "").trim();
      const text = `${name} ${description}`.trim();
      return {
        id: parseInt(p.id),
        vector: textToVector(text, 512), // dimension alignée sur la collection Qdrant existante (512), pas 384
        payload: {
          nom: name,
          description: description.slice(0, 300),
          prix: parseFloat(p.price || 0).toFixed(2) + " €",
          url: `${PRESTASHOP_URL}/${p.link_rewrite || ""}`,
        },
      };
    });

    for (let i = 0; i < points.length; i += UPSERT_BATCH) {
      const batch = points.slice(i, i + UPSERT_BATCH);
      await upsertToQdrant(batch);
      totalIndexed += batch.length;
      console.log(`✅ ${totalIndexed} produits indexés...`);
    }

    offset += BATCH_SIZE;

    // Sécurité supplémentaire : si PrestaShop a renvoyé moins que BATCH_SIZE
    // ET qu'on a dépassé le total annoncé (si connu), on peut s'arrêter.
    // Sinon on continue tant que des produits reviennent.
  }

  console.log(`🎉 Indexation terminée ! ${totalIndexed} produits indexés.`);
  if (announcedTotal) {
    const diff = announcedTotal - totalIndexed;
    if (diff > 0) {
      console.log(`⚠️  Attention : ${diff} produits manquants par rapport au total annoncé (${announcedTotal}).`);
    } else {
      console.log(`✅ Total cohérent avec l'annonce PrestaShop.`);
    }
  }
}

indexProducts().catch(console.error);
