const CATEGORY_KEYWORDS = require('./category-keywords');
const TOY_CATEGORIES = [111,112,115,116,121,122,123,124,125,126,127,128,129,131,132,133,134,135,136,137,141,143,144,145,146,147];
const PRINTER_CATEGORIES = [321, 322];
const SCROLL_CATEGORIES = Object.keys(CATEGORY_KEYWORDS).map(Number);

// ===================== SÉCURITÉ =====================
const ALLOWED_ORIGINS = [
  "https://www.maorediscount.yt",
  "https://maorediscount-api.vercel.app",
];
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_SEC = 60;

async function checkRateLimit(ip) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return true;
  const key = `ratelimit:search:${ip}`;
  try {
    const incrResp = await fetch(`${url}/incr/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const incrData = await incrResp.json();
    const count = incrData.result;
    if (count === 1) {
      await fetch(`${url}/expire/${key}/${RATE_LIMIT_WINDOW_SEC}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    return count <= RATE_LIMIT_MAX;
  } catch {
    return true;
  }
}

function getClientIp(req) {
  return req.headers["x-vercel-forwarded-for"] ||
         req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
         "unknown";
}

function validateSearchParams({ q, max_price, min_price, sort_by, page }) {
  if (!q || typeof q !== "string" || q.trim().length === 0) return { valid: false, error: "Paramètre 'q' manquant" };
  if (q.length > 200) return { valid: false, error: "Paramètre 'q' trop long" };
  if (max_price !== undefined && max_price !== null && max_price !== "null") {
    const val = parseFloat(max_price);
    if (isNaN(val) || val < 0 || val > 100000) return { valid: false, error: "max_price invalide" };
  }
  if (min_price !== undefined && min_price !== null && min_price !== "null" && min_price !== "0") {
    const val = parseFloat(min_price);
    if (isNaN(val) || val < 0 || val > 100000) return { valid: false, error: "min_price invalide" };
  }
  const validSortBy = ["price_asc", "price_desc", "relevance", "", undefined, null];
  if (!validSortBy.includes(sort_by)) return { valid: false, error: "sort_by invalide" };
  const pageNum = parseInt(page) || 1;
  if (pageNum < 1 || pageNum > 100) return { valid: false, error: "page invalide" };
  return { valid: true };
}

// ===================== CONFIG =====================
const MIN_PRICE_BY_CATEGORY = {
  312: 200, 811: 80, 812: 80, 813: 150, 814: 150,
  621: 80, 611: 80, 831: 30, 826: 20, 713: 50, 711: 50,
};

const KNOWN_BRANDS = [
  "samsung", "lg", "bosch", "siemens", "whirlpool", "haier", "hisense",
  "beko", "indesit", "candy", "electrolux", "miele", "aeg", "hotpoint",
  "philips", "braun", "tefal", "moulinex", "seb", "rowenta", "calor",
  "hp", "dell", "lenovo", "asus", "acer", "apple", "iphone", "microsoft", "toshiba",
  "sony", "panasonic", "sharp", "thomson", "oceanic",
  "derosso", "belford", "neolux", "fromatic", "ocean",
  "oral b", "gillette", "loreal", "garnier", "nivea", "dove",
  "brother", "canon", "epson", "xerox", "lexmark", "tnb", "aoc",
];

const GENERIC_CATEGORY_TERMS = [
  "smartphone", "telephone", "mobile", "iphone", "tv", "television", "pouces", "piscine", "gonflable", "pas", "cher", "moins", "plus", "abordable", "meilleur", "prix",
  "economique", "haut", "gamme", "premium", "euros", "euro", "eur", "proche", "environ", "autour", "budget", "autour", "vers", "core", "ryzen", "intel", "amd", "nvidia", "microsoft", "apple", "enfant", "bebe", "junior", "adulte", "cuisine",
];

function normalize(str) {
  if (!str) return "";
  return str.toLowerCase()
    .replace(/[éèêë]/g, "e").replace(/[àâ]/g, "a").replace(/[ùû]/g, "u")
    .replace(/[ôö]/g, "o").replace(/[îï]/g, "i").replace(/[ç]/g, "c")
    .replace(/-/g, " ").trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

let KNOWN_WORDS_CACHE = null;
function getKnownWords() {
  if (KNOWN_WORDS_CACHE) return KNOWN_WORDS_CACHE;
  const words = new Set();
  for (const keywords of Object.values(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      for (const w of normalize(kw).split(/\s+/)) {
        if (w.length >= 4) words.add(w);
      }
    }
  }
  KNOWN_WORDS_CACHE = [...words];
  return KNOWN_WORDS_CACHE;
}

function maxDistanceFor(wordLength) {
  if (wordLength <= 4) return 1;
  if (wordLength <= 8) return 2;
  return 3;
}

function correctTypos(query) {
  const knownWords = getKnownWords();
  const knownSet = new Set(knownWords);
  const words = query.split(/\s+/);
  const corrected = words.map((word) => {
    if (word.length < 4) return word;
    if (/\d/.test(word)) return word;
    if (knownSet.has(word)) return word;
    let bestWord = word;
    let bestDist = Infinity;
    const tolerance = maxDistanceFor(word.length);
    for (const known of knownWords) {
      if (Math.abs(known.length - word.length) > tolerance) continue;
      const dist = levenshtein(word, known);
      if (dist < bestDist) { bestDist = dist; bestWord = known; }
    }
    return bestDist <= tolerance ? bestWord : word;
  });
  return corrected.join(" ");
}

function findCategoryId(query) {
  const q = correctTypos(
    normalize(decodeURIComponent(query))
      .replace(/\b(de|du|des|pour|la|le|les|d')\b/g, " ").replace(/\s+/g, " ")
      .replace(/le moins cher/g, "").replace(/le plus cher/g, "")
      .replace(/moins cher/g, "").replace(/plus cher/g, "").replace(/pas cher/g, "")
      .replace(/\b\d+\s*litres?\b/g, "").replace(/\b\d+\s*l\b/g, "").trim()
  );
  if (/(tv|televiseur|television)/.test(q) && /incurve/.test(q)) return 621;
  const allKeywords = [];
  for (const [id, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) allKeywords.push({ id: parseInt(id), kw: normalize(kw) });
  }
  allKeywords.sort((a, b) => b.kw.length - a.kw.length);
  for (const { id, kw } of allKeywords) {
    if (q.includes(kw)) return id;
  }
  return null;
}

function detectBrand(query) {
  const q = normalize(decodeURIComponent(query));
  for (const brand of KNOWN_BRANDS) {
    if (q.includes(normalize(brand))) return brand;
  }
  return null;
}

function detectCapacity(query) {
  const q = normalize(decodeURIComponent(query));
  const match = q.match(/\b(\d+)\s*kg\b/);
  return match ? match[1] : null;
}

function buildMustConditions(categoryId, max_price, min_price) {
  const mustConditions = [{ key: "active", match: { value: true } }];
  if (categoryId === 100) {
    mustConditions.push({ key: "category_id", match: { any: TOY_CATEGORIES } });
  } else if (categoryId === 320) {
    mustConditions.push({ key: "category_id", match: { any: PRINTER_CATEGORIES } });
  } else if (categoryId === 960) {
    mustConditions.push({ key: "category_id", match: { any: [134, 954, 957] } });
  } else if (categoryId === 961) {
    mustConditions.push({ key: "category_id", match: { any: [134, 957] } });
  } else if (categoryId === 750) {
    mustConditions.push({ key: "category_id", match: { any: [713, 421] } });
  } else if (categoryId) {
    mustConditions.push({ key: "category_id", match: { value: categoryId } });
  }
  if (max_price && max_price !== "null") {
    mustConditions.push({ key: "prix_num", range: { lte: parseFloat(max_price) } });
  }
  if (min_price && min_price !== "null" && min_price !== "0") {
    mustConditions.push({ key: "prix_num", range: { gte: parseFloat(min_price) } });
  }
  return mustConditions;
}

async function scrollAll(qdrantUrl, qdrantApiKey, collection, mustConditions) {
  let allPoints = [];
  let nextOffset = null;
  do {
    const body = { filter: { must: mustConditions }, limit: 250, with_payload: true, with_vector: false };
    if (nextOffset) body.offset = nextOffset;
    const response = await fetch(`${qdrantUrl}/collections/${collection}/points/scroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": qdrantApiKey },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Qdrant scroll error: ${response.status}`);
    const data = await response.json();
    allPoints = allPoints.concat(data.result?.points || []);
    nextOffset = data.result?.next_page_offset || null;
  } while (nextOffset);
  return allPoints;
}

async function vectorSearch(qdrantUrl, qdrantApiKey, voyageApiKey, collection, queryText, mustConditions, limit) {
  const embResponse = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${voyageApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "voyage-3-lite", input: [queryText] }),
  });
  if (!embResponse.ok) throw new Error(`Voyage error: ${embResponse.status}`);
  const embData = await embResponse.json();
  const queryVector = embData.data[0].embedding;
  const searchResponse = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": qdrantApiKey },
    body: JSON.stringify({ vector: queryVector, limit, with_payload: true, filter: { must: mustConditions } }),
  });
  if (!searchResponse.ok) throw new Error(`Qdrant error: ${searchResponse.status}`);
  const searchData = await searchResponse.json();
  return searchData.result || [];
}

function applyAttributeFilters(points, { qNorm, qWords, categoryId, capacityKg }) {
  let filtered = points;
  const specsOnly = qWords.filter(w => /\d/.test(w) && /go|to|kg|pouces?|btu|mah|ghz|db|cm|mm|rpm|trs|kw|litres?|l\b|watts?|\bw\b/i.test(w));
  if (specsOnly.length > 0) {
    filtered = filtered.filter(p => specsOnly.every(w => normalize(p.payload.nom || "").includes(w)));
  }
  if (qNorm.includes("cache") && /climatiseur|clim/.test(qNorm)) {
    filtered = filtered.filter(p => normalize(p.payload.nom || "").includes("cache"));
  } else if (/climatiseur|climatisation|\bclim\b/.test(qNorm)) {
    filtered = filtered.filter(p => {
      const nom = normalize(p.payload.nom || "");
      return !nom.includes("ventilateur") && !nom.includes("forfait");
    });
  }
  if (/ventilateur/.test(qNorm)) {
    filtered = filtered.filter(p => !normalize(p.payload.nom || "").includes("climatiseur") && !normalize(p.payload.nom || "").includes("forfait"));
  }
  if (/americain/.test(qNorm)) {
    filtered = filtered.filter(p => !normalize(p.payload.nom || "").includes("vitrine"));
  }
  if (qNorm === "matelas") {
    filtered = filtered.filter(p =>
      normalize(p.payload.nom || "").includes("matelas") &&
      !normalize(p.payload.nom || "").includes("surmatelas")
    );
  }
  if (categoryId === 750) {
    filtered = filtered.filter(p =>
      normalize(p.payload.nom || "").includes("bebe") ||
      normalize(p.payload.nom || "").includes("enfant") ||
      normalize(p.payload.nom || "").includes("junior") ||
      normalize(p.payload.description || "").includes("bebe") ||
      normalize(p.payload.description || "").includes("enfant")
    );
  }
  if (capacityKg) {
    filtered = filtered.filter(p =>
      new RegExp(`\\b${capacityKg}\\s*kg\\b`, 'i').test(p.payload.nom || "") ||
      new RegExp(`\\b${capacityKg}\\s*kg\\b`, 'i').test(p.payload.description || "")
    );
  }
  const litresMatch = qNorm.match(/\b(\d+)\s*l(itres?)?\b/);
  if (litresMatch) {
    const litres = litresMatch[1];
    filtered = filtered.filter(p =>
      new RegExp(`\\b${litres}\\s*l\\b`, 'i').test(p.payload.nom || "") ||
      new RegExp(`${litres}l`, 'i').test(p.payload.nom || "")
    );
  }
  const poucesMatch = qNorm.match(/\b(\d+)\s*pouces?\b/);
  if (poucesMatch) {
    const pouces = poucesMatch[1];
    filtered = filtered.filter(p =>
      new RegExp(`${pouces}[,.]?\\d*[""\u201c\u201d]`, 'i').test(p.payload.nom || "") ||
      new RegExp(`${pouces}[,.]?\\d*\\s*pouces?`, 'i').test(p.payload.nom || "") ||
      new RegExp(`${pouces}[,.]?\\d*\\s*cm`, 'i').test(p.payload.nom || "")
    );
  }
  const qualityTerms = ["4k", "uhd", "fhd", "hd", "oled", "qled", "android", "wifi"];
  const qualityMatch = qualityTerms.filter(t => qNorm.includes(t));
  if (qualityMatch.length > 0) {
    filtered = filtered.filter(p => qualityMatch.every(t => normalize(p.payload.nom || "").includes(t)));
  }
  const cpuTerms = ["ryzen 3", "ryzen 5", "ryzen 7", "ryzen 9", "core i3", "core i5", "core i7", "core i9", "core 7", "core 5", "core 3", "i3", "i5", "i7", "i9"];
  const cpuMatch = cpuTerms.find(t => qNorm.includes(t));
  if (cpuMatch) {
    const cpuAliasMap = {
      "core 5": ["core 5", "c5"], "core i5": ["core i5", "i5"], "core i3": ["core i3", "i3"],
      "core i7": ["core i7", "i7"], "core i9": ["core i9", "i9"],
      "i5": ["core i5", "i5"], "i3": ["core i3", "i3"], "i7": ["core i7", "i7"], "i9": ["core i9", "i9"],
    };
    const aliases = cpuAliasMap[cpuMatch] || [cpuMatch];
    filtered = filtered.filter(p => {
      const nom = normalize(p.payload.nom || "");
      const desc = normalize(p.payload.description || "");
      return aliases.some(alias => new RegExp(`\\b${alias}\\b`).test(nom) || new RegExp(`\\b${alias}\\b`).test(desc));
    });
  }
  const simpleKeywordFlags = ["angle", "convertible", "panoramique", "gonflable", "relax", "jardin", "modulable", "grille", "trottinette", "roller"];
  for (const kw of simpleKeywordFlags) {
    if (qNorm.includes(kw)) {
      filtered = filtered.filter(p => normalize(p.payload.nom || "").includes(kw));
    }
  }
  if (qNorm.includes("clic clac") || qNorm.includes("clic-clac")) {
    filtered = filtered.filter(p =>
      normalize(p.payload.nom || "").includes("clic clac") ||
      normalize(p.payload.nom || "").includes("clic-clac")
    );
  }
  if (qNorm.includes("incurve") || qNorm.includes("courbe")) {
    filtered = filtered.filter(p =>
      normalize(p.payload.nom || "").includes("incurve") ||
      normalize(p.payload.description || "").includes("incurve")
    );
  }
  const placesMatch = qNorm.match(/\b(\d+)\s*places?\b/);
  if (placesMatch && qNorm.includes("place")) {
    const places = placesMatch[1];
    filtered = filtered.filter(p => new RegExp(`${places}\\s*places?`, 'i').test(p.payload.nom || ""));
  }
  const dimensionMatch = qNorm.match(/\b(\d+)\s*x\s*(\d+)\b/);
  if (dimensionMatch) {
    const d1 = dimensionMatch[1];
    const d2 = dimensionMatch[2];
    const dimRegex = new RegExp(`${d1}\\s*x\\s*${d2}`, 'i');
    filtered = filtered.filter(p =>
      dimRegex.test(normalize(p.payload.nom || "")) ||
      dimRegex.test(normalize(p.payload.description || ""))
    );
  }
  const minCatPrice = MIN_PRICE_BY_CATEGORY[categoryId] || 0;
  if (minCatPrice > 0) {
    filtered = filtered.filter(p => (p.payload.prix_num || 0) >= minCatPrice);
  }
  return filtered;
}

function toResult(r, prestashopUrl) {
  return {
    id: r.id,
    nom: r.payload.nom,
    description: "",
    prix: r.payload.prix,
    image_url: r.payload.image_url || "",
    url: `${prestashopUrl}/index.php?id_product=${r.id}&controller=product`,
    score: r.score?.toFixed ? r.score.toFixed(3) : undefined,
  };
}

module.exports = async function handler(req, res) {
  // ===================== CORS STRICT =====================
  const origin = req.headers["origin"] || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // ===================== AUTH =====================
  const authHeader = req.headers["authorization"] || req.query["Authorization"];
  if (!authHeader || (authHeader !== `Bearer ${process.env.CHATLAB_SECRET}` && authHeader !== `Bearer ${process.env.CHATLAB_SECRET_DEMO}`)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // ===================== RATE LIMITING REDIS =====================
  const clientIp = getClientIp(req);
  const allowed = await checkRateLimit(clientIp);
  if (!allowed) {
    return res.status(429).json({ error: "Trop de requêtes. Réessayez dans une minute." });
  }

  // ===================== VALIDATION =====================
  const validation = validateSearchParams(req.query);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const { q, max_price, min_price } = req.query;
  let { sort_by } = req.query;

  const refMatch = q.match(/^REF:(\d+)$/i);
  if (refMatch) {
    const ref = refMatch[1];
    const refPoints = await scrollAll(process.env.QDRANT_URL, process.env.QDRANT_API_KEY, "products", [
      { key: "reference", match: { value: ref } }
    ]);
    if (refPoints.length === 0) {
      return res.status(200).json({ query: q, total: 0, products: [], message: "Référence introuvable." });
    }
    const r = refPoints[0];
    return res.status(200).json({
      query: q, total: 1,
      products: [{ id: r.id, nom: r.payload.nom, prix: r.payload.prix, image_url: r.payload.image_url || "", url: r.payload.url }]
    });
  }

  const qNorm = normalize(decodeURIComponent(q));
  if (!sort_by || sort_by === "relevance") {
    if (/(moins cher|pas cher|meilleur prix|economique|abordable)/.test(qNorm)) sort_by = "price_asc";
    else if (/(plus cher|haut de gamme|premium)/.test(qNorm)) sort_by = "price_desc";
  }

  try {
    const QDRANT_URL = process.env.QDRANT_URL;
    const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
    const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
    const COLLECTION_NAME = "products";
    const PRESTASHOP_URL = process.env.PRESTASHOP_URL;

    const categoryId = findCategoryId(q);
    const brand = detectBrand(q);
    const capacityKg = detectCapacity(q);
    const isPriceSort = sort_by === "price_asc" || sort_by === "price_desc";
    const pageNum = parseInt(req.query.page) || 1;
    const pageSize = 3;

    const qWords = qNorm.split(/\s+/).filter(w => w.length >= 3 && !GENERIC_CATEGORY_TERMS.includes(w));
    const mustConditions = buildMustConditions(categoryId, max_price, min_price);
    const needsFullCategoryScroll = isPriceSort && categoryId;

    let points;

    if (needsFullCategoryScroll) {
      points = await scrollAll(QDRANT_URL, QDRANT_API_KEY, COLLECTION_NAME, mustConditions);
      points = applyAttributeFilters(points, { qNorm, qWords, categoryId, capacityKg });
      if (brand) {
        const brandRegex = new RegExp(`\\b${normalize(brand)}\\b`, 'i');
        const brandFiltered = points.filter(p => brandRegex.test(normalize(p.payload.nom || "")));
        if (brandFiltered.length === 0) {
          return res.status(200).json({ query: q, category_id: categoryId, total: 0, products: [], message: `Aucun produit ${brand} trouve dans cette categorie.` });
        }
        points = brandFiltered;
      }
      if (sort_by === "price_asc") points.sort((a, b) => (a.payload.prix_num || 0) - (b.payload.prix_num || 0));
      else points.sort((a, b) => (b.payload.prix_num || 0) - (a.payload.prix_num || 0));
    } else {
      let searchResults = await vectorSearch(QDRANT_URL, QDRANT_API_KEY, VOYAGE_API_KEY, COLLECTION_NAME, q, mustConditions, 300);
      if (searchResults.length > 0 && searchResults[0].score < 0.45 && !categoryId) {
        return res.status(200).json({ query: q, category_id: categoryId, total: 0, products: [] });
      }
      searchResults = applyAttributeFilters(searchResults, { qNorm, qWords, categoryId, capacityKg });
      if (brand) {
        const brandRegex = new RegExp(`\\b${normalize(brand)}\\b`, 'i');
        const brandFiltered = searchResults.filter(p => brandRegex.test(normalize(p.payload.nom || "")));
        if (brandFiltered.length === 0) {
          return res.status(200).json({ query: q, category_id: categoryId, total: 0, products: [], message: `Aucun produit ${brand} trouve dans cette categorie.` });
        }
        searchResults = brandFiltered;
      }
      if (isPriceSort) {
        if (sort_by === "price_asc") searchResults.sort((a, b) => (a.payload.prix_num || 0) - (b.payload.prix_num || 0));
        else searchResults.sort((a, b) => (b.payload.prix_num || 0) - (a.payload.prix_num || 0));
      }
      points = searchResults;
    }

    const offset = (pageNum - 1) * pageSize;
    const results = points.slice(offset, offset + pageSize).map(r => toResult(r, PRESTASHOP_URL));

    return res.status(200).json({
      query: q,
      category_id: categoryId,
      total: results.length,
      total_available: points.length,
      current_page: pageNum,
      total_pages: Math.ceil(points.length / pageSize),
      products: results,
    });
  } catch (error) {
    console.error("Erreur API:", error.message);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};
