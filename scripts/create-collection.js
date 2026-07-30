/**
 * @file scripts/init-qdrant.js
 * @description Script d'initialisation Qdrant : crée la collection `products` avec une dimension
 *              vectorielle de 512 et une métrique de distance Cosine (optimisée pour Voyage AI / voyage-3-lite).
 */
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = "products";

async function createCollection() {
  console.log("Création de la collection Qdrant...");

  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "api-key": QDRANT_API_KEY,
    },
    body: JSON.stringify({
      vectors: {
        size: 512,
        distance: "Cosine",
      },
    }),
  });

  const data = await response.json();
  if (response.ok) {
    console.log("✅ Collection créée avec succès !");
  } else {
    console.error("❌ Erreur :", data);
  }
}

createCollection();
