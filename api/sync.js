export default async function handler(req, res) {
  // Sécurité : accepte uniquement les appels du cron Vercel ou avec le bon secret
  const authHeader = req.headers["authorization"];
  if (authHeader !== `Bearer ${process.env.CHATLAB_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const SHOP_URL = process.env.PRESTASHOP_URL;
    const API_KEY = process.env.PRESTASHOP_API_KEY;
    const QDRANT_URL = process.env.QDRANT_URL;
    const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
    const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
    const COLLECTION_NAME = "products";

    // Récupère les produits modifiés dans les 2 dernières heures
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

    const url = `${SHOP_URL}/api/products?ws_key=${API_KEY}&output_format=JSON&display=[id,name,description_short,price,link_rewrite,id_default_image,active,quantity,id_category_default]&filter[date_upd]=[${since},9999-12-31 23:59:59]&date=1&limit=100&language=1`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`PrestaShop error: ${response.status}`);
    const data = await response.json();
    const products = data.products || [];

    if (products.length === 0) {
      return res.status(200).json({ message: "Aucun produit modifié", synced: 0 });
    }

    // Embeddings via Voyage AI
    const texts = products.map(p => {
      const name = p.name || "";
      const desc = (p.description_short || "").replace(/<[^>]+>/g, "").trim();
      return `${name} ${desc}`.trim().slice(0, 500);
    });

    const embResponse = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "voyage-3-lite", input: texts }),
    });

    if (!embResponse.ok) throw new Error(`Voyage error: ${embResponse.status}`);
    const embData = await embResponse.json();
    const embeddings = embData.data.map(d => d.embedding);

    // Upsert dans Qdrant
    const points = products.map((p, idx) => ({
      id: parseInt(p.id),
      vector: embeddings[idx],
      payload: {
        nom: p.name || "",
        description: (p.description_short || "").replace(/<[^>]+>/g, "").trim().slice(0, 300),
        prix: parseFloat(p.price || 0).toFixed(2) + " €",
        prix_num: parseFloat(p.price || 0),
        quantity: parseInt(p.quantity || 0),
        active: p.active == 1,
        category_id: parseInt(p.id_category_default || 0),
        image_url: p.id_default_image ? `${SHOP_URL}/${p.id_default_image}-large_default/${p.link_rewrite || "product"}.jpg` : "",
        url: `${SHOP_URL}/index.php?id_product=${p.id}&controller=product`,
      },
    }));

    const upsertResponse = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=true`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", "api-key": QDRANT_API_KEY },
        body: JSON.stringify({ points }),
      }
    );

    if (!upsertResponse.ok) throw new Error(`Qdrant error: ${await upsertResponse.text()}`);

    return res.status(200).json({
      message: `${products.length} produits synchronisés`,
      synced: products.length,
      since,
    });
  } catch (error) {
    console.error("Sync error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
