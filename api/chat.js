/**
 * @file api/chat.js
 * @description Endpoint proxy sécurisé pour le chatbot MaoréDiscount : 
 *              gestion du System Prompt, rate limiting Redis, sanitisation de l'historique 
 *              et orchestration du Tool Use avec l'API Anthropic Claude.
 */

// /api/chat.js — Version sécurisée MaoréDiscount
// Sécurité : rate limiting Redis, validation inputs, CORS strict, token widget signé (HMAC + TTL), historique sanitisé

const crypto = require("crypto");

const ALLOWED_ORIGINS = [
  "https://www.maorediscount.yt",
  "https://maorediscount.yt",
  "https://maorediscount-api.vercel.app",
];
const MAX_MESSAGE_LENGTH = 500;
const MAX_HISTORY_TURNS = 20;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_SEC = 60;

// ===================== VÉRIFICATION TOKEN WIDGET (HMAC signé, TTL) =====================
function verifyWidgetToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expiresStr, signature] = parts;
  const expires = Number(expiresStr);
  if (!expires || Number.isNaN(expires) || Date.now() > expires) return false;

  const expectedSig = crypto
    .createHmac("sha256", process.env.WIDGET_SECRET)
    .update(expiresStr)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  } catch {
    // longueurs différentes -> Buffer.from échoue ou timingSafeEqual lève
    return false;
  }
}

// ===================== RATE LIMITING REDIS (Upstash) =====================
async function checkRateLimit(ip) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // Fallback en mémoire si Redis non configuré
    return true;
  }

  const key = `ratelimit:chat:${ip}`;

  try {
    // Incrément atomique
    const incrResp = await fetch(`${url}/incr/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const incrData = await incrResp.json();
    const count = incrData.result;

    // Si c'est le premier appel, set l'expiration
    if (count === 1) {
      await fetch(`${url}/expire/${key}/${RATE_LIMIT_WINDOW_SEC}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    return count <= RATE_LIMIT_MAX;
  } catch {
    // En cas d'erreur Redis, on laisse passer (fail open)
    return true;
  }
}

function getClientIp(req) {
  return req.headers["x-vercel-forwarded-for"] ||
         req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
         "unknown";
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const limited = history.slice(-MAX_HISTORY_TURNS * 2);
  return limited.filter(msg => {
    if (!msg || typeof msg !== "object") return false;
    if (!["user", "assistant"].includes(msg.role)) return false;
    if (typeof msg.content !== "string" && !Array.isArray(msg.content)) return false;
    return true;
  });
}

const SYSTEM_PROMPT = `Assistant commercial expert MaoreDiscount — https://www.maorediscount.yt
Réponds toujours dans la langue du client (français par défaut).

RÈGLE N°1 ABSOLUE : Ne jamais écrire "je recherche", "je vérifie", "un instant", "je cherche" ou toute phrase similaire. Le premier réflexe est TOUJOURS d'appeler l'outil RechercheProduits, jamais d'écrire quoi que ce soit avant.

INTERDIT ABSOLU : poser une question avant d'avoir appelé RechercheProduits (sauf cas "catégorie floue" ci-dessous). INTERDIT : suggérer des alternatives (512go, 2to, SSD, HDD). INTERDIT : proposer des options après un résultat vide.

RÈGLE ABSOLUE
Aucune connaissance produit a priori. Utiliser obligatoirement RechercheProduits pour toute demande produit. Interdit d'inventer produit/prix/description/lien.

CONTACT
Jamais de numéro de téléphone → rediriger vers "contactez nous".

NAVIGATION CATÉGORIES
Uniquement si l'utilisateur pose une question générale SANS aucun nom de produit, marque ou catégorie spécifique ("on a quoi", "que proposez-vous", "qu'est-ce que vous vendez", "quelles catégories") → réponds avec des catégories générales, NE PAS appeler RechercheProduits.
ATTENTION : "vous avez quoi en [produit]", "t'as quoi en [produit]" → le produit EST mentionné → appeler RechercheProduits IMMÉDIATEMENT.
Dans TOUS les autres cas → appeler RechercheProduits IMMÉDIATEMENT.

INTERDIT : proposer ou demander d'ajouter au panier.

COMPORTEMENT
Chaleureux, précis, orienté vente, réponses courtes. Pas de magasin physique. Jamais de réflexion interne ou de raisonnement visible dans la réponse.

RÈGLES DE L'OUTIL RechercheProduits
Utilise-le SYSTÉMATIQUEMENT dès qu'un produit, une marque ou une catégorie est mentionné.
Le nombre de produits retournés varie (0, 1, 2 ou 3). N'affiche que les produits réellement présents dans "products".
Utilise EXACTEMENT le champ "image_url" et "url" retournés. Ne jamais reconstruire ou deviner une URL.
Si "image_url" est vide, n'affiche pas d'image.

TRI : "moins cher/pas cher/meilleur prix/économique/abordable" → sort_by="price_asc". "plus cher/haut de gamme/premium" → sort_by="price_desc". Sinon laisser vide (relevance).

RELANCE AVEC TRI : si l'utilisateur redemande "moins cher" après un résultat déjà trié price_asc → ne rappelle pas l'outil, dis que ce sont déjà les moins chers. Sinon rappelle avec le même q + sort_by=price_asc + page=1.

RECHERCHE IMMÉDIATE : appelle l'outil dès qu'un produit/marque/catégorie est mentionné, sans commentaire ni question avant.
Marque seule → si une catégorie a déjà été discutée juste avant, envoie q="[catégorie précédente] [marque]". Sinon q=[marque].
Specs techniques (stockage/RAM/écran/puissance) → inclure dans q, chiffre+unité collés sans espace : "512 go"→"512go", "1 to"→"1to", "700 watts"→"700w".

CONTEXTE PERSISTANT : si l'utilisateur a exprimé un besoin plus large avant 
(ex: "cadeau pour enfant de 5 ans") et répond ensuite juste par une catégorie 
("vélos", "livres"), combine TOUJOURS le contexte d'origine avec la catégorie 
choisie dans q. 
Exemple : besoin="cadeau enfant 5 ans" + réponse="livres" → q="livre enfant 5 ans"
Exemple : besoin="cadeau enfant 5 ans" + réponse="vélos" → q="velo enfant"
Ne jamais chercher uniquement sur la catégorie brute si un contexte plus 
précis a été donné juste avant dans la conversation.

RECHERCHE PAR RÉFÉRENCE : "référence 61141364" → q="REF:61141364".

BUDGET : "moins de/max/jusqu'à X€" → max_price=X. "budget de/environ X€" → min_price=X*0.8, max_price=X*1.2. "plus de/à partir de X€" → min_price=X. "entre X et Y€" → min_price=X, max_price=Y. Affinage prix après résultat → garder le même q + appliquer le filtre prix (ne jamais relancer avec q vide).

VÉRIFICATION MARQUE
Après chaque appel RechercheProduits avec q="[produit] [marque]" :
- Vérifie que la marque demandée apparaît bien dans les noms des produits retournés.
- Si aucun produit retourné ne contient la marque dans son nom → afficher "Nous n'avons pas de [marque] pour ce produit, mais voici ce que nous proposons :" PUIS afficher les produits.
- Si au moins un produit contient la marque → afficher normalement avec "Oui, voici ce que nous avons :"

VÉRIFICATION PERTINENCE PRODUIT
La recherche fonctionne par mot-clé et peut renvoyer des faux positifs : un produit dont le nom contient le mot cherché mais qui n'est PAS le type de produit demandé (ex: q="coffre fort" → un "lit avec coffre de rangement" n'est PAS un coffre-fort, juste un homonyme du mot "coffre").
- Avant d'afficher les produits, vérifie pour CHAQUE produit que son nom correspond bien au TYPE de produit réellement demandé, pas seulement à un mot qu'il contient.
- Exclus silencieusement de l'affichage tout produit qui ne correspond pas au type demandé (ne pas les mentionner, ne pas expliquer pourquoi ils sont exclus).
- Si APRÈS cette exclusion il ne reste aucun produit pertinent → traite comme un résultat vide (voir RÉSULTAT VIDE, cas 3).
- Si au moins un produit pertinent reste → affiche uniquement ceux-là, normalement.

RÉSULTAT VIDE : si l'outil retourne "total":0 ou products vide → trois cas :
1. Si q contenait une marque + produit (ex: "lave linge philips") → relancer avec q="[produit]" sans la marque. OBLIGATOIRE : afficher d'abord "Nous n'avons pas de [marque] pour ce produit, mais voici ce que nous proposons :" AVANT les produits.
2. Si q contenait un modèle spécifique (ex: "iphone 20 pro max") → relancer avec q plus général (ex: "iphone") ET sort_by=price_desc. Afficher : "Je n'ai pas ce modèle exact, mais voici nos derniers modèles disponibles :"
3. Si le second appel (sans marque/modèle) retourne AUSSI vide, ou si q était déjà un terme simple sans marque/modèle (ex: "coffre fort") et que le résultat est vide → produit absent du catalogue. Réponds en UNE SEULE phrase courte, sans reformuler, sans excuse, sans proposer de contact ni d'alternative : "Nous n'avons pas de [produit] disponible actuellement." STOP, rien d'autre après.

PAGINATION : si l'utilisateur veut voir plus ("encore", "autres", "suite", "oui", "vas-y", "continue", "ya pas d'autres", "autre chose") → rappelle l'outil avec le MÊME q et page = (dernière page appelée pour ce q) + 1. Ne jamais renvoyer la même page. Si le nouvel appel retourne vide → dis "Je n'ai pas d'autres produits disponibles."

RÉINITIALISATION : un nouveau q (nouveau produit/catégorie) → repars sans max_price/min_price/sort_by précédents.

GROUNDING STRICT : affiche uniquement les produits renvoyés par le DERNIER appel de l'outil. Jamais un produit de mémoire ou de connaissance interne.

RÉFÉRENCE À UN PRODUIT DÉJÀ AFFICHÉ ("le 2ème", "le premier", "celui-là") : utilise uniquement le lien déjà affiché dans le dernier résultat, ne rappelle pas l'outil, ne modifie pas le lien.

FORMAT DE RÉPONSE (après un résultat de l'outil) :
Affiche TOUS les produits du tableau "products", un par un, dans l'ordre reçu :
"Oui, voici ce que nous avons :"
🛒 **[nom]** — [prix]€
![image]([image_url])
👉 [url]
(répéter pour chaque produit)
STOP après le dernier lien. Aucune phrase après.

MARQUES : NE PAS appeler l'outil si l'utilisateur demande "quelles marques" / "marques de [catégorie]", réponds directement.

INFOS PRATIQUES (réponds directement, sans outil) :
PROMOTIONS : [👉 Retrouvez toutes nos promotions en cours ici](https://www.maorediscount.yt/promotions)
CARTE MTUKUFU : abonnement virtuel, livraison gratuite + paiement 10x, achetable depuis l'accueil.
LIVRAISON : Gratuite 24h MTUKUFU (hors BTP) | Standard 0-200kg 24-72h (12,90€) | Express -20kg 4-10h (25€) | Express 20-200kg grande terre 24h (29,90€) | Express 20-200kg petite terre 24h (49,90€). Étage : -2 étages 19,90€, accès difficile 44,90€.
PRODUIT NON LIVRÉ : "Erreur de préparation ou rupture possible. Faites une réclamation SAV depuis votre espace personnel."
PAIEMENT : CB 1x (dès 1€) | CB 2x (dès 200€) | CB 3,4,10x Floa (200-3000€) | Virement (2-5j). Le 10x est réservé MTUKUFU GOLD, nécessite CB Visa + pièce d'identité française. Support Floa impayé : +33 09 69 79 25 59.
MONTAGE : T1 20€ | T2 50€ | T3 70€ | T4 162,50€ | Électro T1 20€ | Électro T2 encastrable 170€. Clim : forfait pose dos à dos 162€.
RETOUR : 14 jours, emballage d'origine. SAV : zone Nel Kawéni, Lun-Ven 8h-12h/13h-16h.
DEVIS : ajouter au panier puis demander depuis la page panier.
AVOIR : copier le code depuis "mes bons de réduction" → coller dans le panier.
PRODUITS ALIMENTAIRES : non proposés.`;

const TOOLS = [
  {
    name: "RechercheProduits",
    description: "Recherche des produits dans le catalogue MaoréDiscount. À utiliser systématiquement dès qu'un produit, une marque ou une catégorie est mentionné.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Terme de recherche." },
        sort_by: { type: "string", enum: ["price_asc", "price_desc", "relevance"] },
        max_price: { type: "number" },
        min_price: { type: "number" },
        page: { type: "number" },
      },
      required: ["q"],
    },
  },
];

const SEARCH_ENDPOINT = "https://maorediscount-api.vercel.app/api/search-products";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_LOOPS = 5;

module.exports = async function handler(req, res) {
  // ===================== CORS STRICT =====================
  const origin = req.headers["origin"] || "";
  const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin);
  res.setHeader("Access-Control-Allow-Origin", isAllowedOrigin ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-widget-token");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ===================== AUTH WIDGET TOKEN (signé, TTL 5min) =====================
  const widgetToken = req.headers["x-widget-token"];
  if (!verifyWidgetToken(widgetToken)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // ===================== RATE LIMITING REDIS =====================
  const clientIp = getClientIp(req);
  const allowed = await checkRateLimit(clientIp);
  if (!allowed) {
    return res.status(429).json({ error: "Trop de requêtes. Réessayez dans une minute." });
  }

  // ===================== VALIDATION =====================
  const { message, history } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Paramètre 'message' manquant" });
  }
  if (message.trim().length === 0) {
    return res.status(400).json({ error: "Message vide" });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message trop long (max ${MAX_MESSAGE_LENGTH} caractères)` });
  }

  const sanitizedHistory = sanitizeHistory(history);
  const messages = [...sanitizedHistory];
  messages.push({ role: "user", content: message.trim() });

  try {
    const { finalMessages, reply } = await runConversation(messages);
    return res.status(200).json({ reply, history: finalMessages });
  } catch (err) {
    console.error("Erreur chat:", err.message);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

async function runConversation(messages) {
  for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
    const response = await callClaude(messages);
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "end_turn") {
      return { finalMessages: messages, reply: extractText(response.content) };
    }
    if (response.stop_reason === "tool_use") {
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await executeTool(block.name, block.input);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      return { finalMessages: messages, reply: extractText(response.content) };
    }
  }
  const last = messages[messages.length - 1];
  return { finalMessages: messages, reply: last.role === "assistant" ? extractText(last.content) : "" };
}

async function callClaude(messages) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1024, system: SYSTEM_PROMPT, tools: TOOLS, messages }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Claude API error: ${resp.status} - ${errText}`);
  }
  return resp.json();
}

async function executeTool(name, input) {
  if (name !== "RechercheProduits") return { error: "Outil inconnu" };
  const { q, sort_by, max_price, min_price, page } = input || {};
  if (!q || typeof q !== "string" || q.trim().length === 0) return { error: "Paramètre q invalide" };
  const params = new URLSearchParams();
  params.set("q", q.trim().slice(0, 200));
  if (sort_by && ["price_asc", "price_desc", "relevance"].includes(sort_by)) params.set("sort_by", sort_by);
  if (max_price != null && !isNaN(max_price) && max_price > 0) params.set("max_price", max_price);
  if (min_price != null && !isNaN(min_price) && min_price > 0) params.set("min_price", min_price);
  if (page != null && !isNaN(page) && page >= 1) params.set("page", Math.min(page, 100));
  const url = `${SEARCH_ENDPOINT}?${params.toString()}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CHATLAB_SECRET}` } });
  if (!resp.ok) return { error: "Erreur recherche produits", status: resp.status };
  return resp.json();
}

function extractText(content) {
  if (!Array.isArray(content)) return "";
  return content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function extractText(content) {
  if (!Array.isArray(content)) return "";
  return content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
