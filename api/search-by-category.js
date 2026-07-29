const CATEGORY_MAP = {
  // INFORMATIQUE
  "ordinateurs portables": 312, "pc portable": 312, "laptop": 312,
  "ordinateurs de bureau": 311, "pc bureau": 311, "desktop": 311,
  "tablettes": 313, "tablette tactile": 313, "ipad": 313,
  "ecrans": 314, "moniteurs": 314,
  "imprimantes": 320, "imprimante jet d'encre": 321, "imprimante laser": 322,
  "consommables": 323, "cartouches": 323, "toners": 324,
  "disques durs externes": 341, "cles usb": 342,
  "claviers": 343, "souris": 343,
  "enceintes": 344, "webcams": 345,
  "cables": 347, "connectiques": 347,
  "composants": 330, "processeurs": 331, "cartes graphiques": 335,
  "sacoches": 316, "housses pc": 316,

  // TELEPHONIE TV MULTIMEDIA
  "smartphones": 611, "telephones": 611, "mobiles": 611,
  "montres connectees": 613, "smartwatch": 613,
  "televiseurs": 621, "tv": 621, "televisions": 621,
  "videoprojecteurs": 622,
  "home cinema": 623, "hifi": 623,
  "casques": 624, "ecouteurs": 624, "airpods": 624,
  "cameras": 625, "appareils photos": 625,
  "talkies walkies": 617,

  // ELECTROMENAGER
  "electromenager": 800,
  "refrigerateurs": 811, "frigos": 811,
  "congelateurs": 812,
  "lave linge": 813, "machines a laver": 813,
  "lave vaisselle": 814,
  "fours": 815,
  "micro ondes": 816, "micro-ondes": 816,
  "cuisinieres": 817, "tables de cuisson": 817,
  "seche linge": 819,
  "robots menagers": 821, "robots cuisine": 821,
  "mixeurs": 823, "batteurs": 823,
  "cafetieres": 826, "machines a cafe": 826,
  "bouilloires": 827, "grille pain": 827,
  "aspirateurs": 831,
  "ventilateurs": 834, "climatiseurs": 834, "clim": 834,
  "friteuses": 848,
  "autocuiseurs": 845, "cocottes": 845,
  "poeles": 846, "casseroles": 846,

  // MEUBLES DECO MAISON
  "canapes": 711, "fauteuils": 711, "poufs": 711,
  "bibliotheques": 712, "etageres": 712,
  "lits": 713, "chambres": 713,
  "matelas": 714,
  "meubles tv": 715,
  "tables": 716,
  "chaises": 717, "tabourets": 717,
  "armoires": 718, "dressings": 718,
  "miroirs": 719, "coiffeuses": 719,
  "luminaires": 743, "lampes": 743,
  "rideaux": 742, "tapis": 742,
  "bureaux": 732,
  "chaises de bureau": 735,

  // JOUETS
  "jouets": 100, "jeux": 100,
  "poupees": 110, "peluches": 110,
  "lego": 121,
  "playmobil": 122,
  "drones": 132, "helicopteres": 132,
  "trottinettes": 136, "velos": 136,
  "piscine": 134,

  // PUERICULTURE
  "puericulture": 400, "bebe": 400,
  "poussettes": 411,
  "sieges auto": 412,
  "lits bebe": 421,
  "couches": 432,
  "biberons": 442,

  // SOIN HYGIENE BEAUTE
  "soin": 500, "hygiene": 500, "beaute": 500,
  "maquillage": 520, "cosmetiques": 520,
  "parfums": 527,
  "bijoux": 531,
  "montres": 532,

  // PAPETERIE
  "papeterie": 200,
  "cahiers": 211,
  "stylos": 221,
  "calculatrices": 216,
  "classeurs": 232,

  // BRICO JARDIN
  "bricolage": 920, "brico": 920, "materiel brico": 920, "outils brico": 920,
  "jardinage": 936, "jardin": 936, "outil de jardin": 936, "outils de jardin": 936, "outillage jardin": 936,
  "outillage": 926, "outils": 926, "outil": 926, "boite a outils": 926,
  "electricite": 940, "cable electrique": 940,
};

function findCategoryId(query) {
  const q = query.toLowerCase()
    .replace(/[éèêë]/g, "e")
    .replace(/[àâ]/g, "a")
    .replace(/[ùû]/g, "u")
    .replace(/[ôö]/g, "o")
    .replace(/[îï]/g, "i")
    .replace(/[ç]/g, "c")
    .trim();

  for (const [key, id] of Object.entries(CATEGORY_MAP)) {
    if (q.includes(key) || key.includes(q)) return id;
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // --- SÉCURITÉ AUTHENTIFICATION FIXÉE ---
  const authHeader = req.headers["authorization"] || req.query["Authorization"];
  if (!authHeader || authHeader !== `Bearer ${process.env.CHATLAB_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // --- LE RESTE S'EXÉCUTE CORRECTEMENT MAINTENANT ---
  const { category, sort_by, limit, max_price, min_price } = req.query;
  if (!category) return res.status(400).json({ error: "Paramètre 'category' manquant" });

  const categoryId = findCategoryId(category);
  if (!categoryId) return res.status(404).json({ error: `Catégorie '${category}' non trouvée` });

  try {
    const SHOP_URL = process.env.PRESTASHOP_URL;
    const API_KEY = process.env.PRESTASHOP_API_KEY;
    const lim = parseInt(limit) || 50;

    // Récupère les produits de la catégorie
    const url = `${SHOP_URL}/api/products?ws_key=${API_KEY}&output_format=JSON&display=[id,name,description_short,price,link_rewrite,id_default_image,active,quantity,id_category_default]&filter[id_category_default]=[${categoryId}]&limit=${lim}&language=1&sort=[id_DESC]`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PrestaShop error: ${response.status}`);
    const data = await response.json();

    let products = (data.products || []).filter(p => p.active == 1);

    // Filtre par prix
    if (max_price) products = products.filter(p => parseFloat(p.price) <= parseFloat(max_price));
    if (min_price) products = products.filter(p => parseFloat(p.price) >= parseFloat(min_price));

    // Tri
    if (sort_by === "price_asc") {
      products = products.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    } else if (sort_by === "price_desc") {
      products = products.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    }

    const resultLimit = (sort_by === "price_asc" || sort_by === "price_desc") ? 1 : 3;
    const results = products.slice(0, resultLimit).map(p => ({
      id: p.id,
      nom: p.name,
      description: (p.description_short || "").replace(/<[^>]+>/g, "").trim().slice(0, 200),
      prix: parseFloat(p.price).toFixed(2) + " €",
      image_url: p.id_default_image ? `${SHOP_URL}/${p.id_default_image}-large_default/${p.link_rewrite}.jpg` : "",
      url: `${SHOP_URL}/index.php?id_product=${p.id}&controller=product`,
    }));

    return res.status(200).json({
      category,
      category_id: categoryId,
      total: results.length,
      products: results,
    });
  } catch (error) {
    console.error("Erreur:", error.message);
    return res.status(500).json({ error: "Erreur serveur", details: error.message });
  }
}
