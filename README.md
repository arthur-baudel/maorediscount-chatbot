# Classic AI — Assistant de recherche IA pour e-commerce
[![Docker Build & Test](https://github.com/arthur-baudel/maorediscount-chatbot/actions/workflows/docker-build.yml/badge.svg)](https://github.com/arthur-baudel/maorediscount-chatbot/actions/workflows/docker-build.yml)

> Vos clients expriment simplement ce qu'ils cherchent avec leurs propres mots, et l'IA leur recommande immédiatement les bons articles.

[![Démo live](https://img.shields.io/badge/D%C3%A9mo%20live-tester%20maintenant-blue)](https://maorediscount-api.vercel.app)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat&logo=open-source-initiative&logoColor=white)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-brightgreen)](https://nodejs.org)

---

## 🎯 Le problème que ça résout

Sur la plupart des boutiques PrestaShop, une recherche qui ne tape pas le mot exact du produit renvoie une page vide — une vente perdue instantanément.

| Requête client | Recherche classique | Ce projet |
|---|---|---|
| "frigo pas cher" | Cherche "frigo" + "pas" + "cher" littéralement | Réfrigérateurs triés par prix croissant |
| "quelque chose pour laver mon linge" | Aucun résultat | Lave-linges disponibles |
| "tv 55 pouces 4k moins de 600€" | Résultats approximatifs ou vides | Filtre exact : 55", 4K, < 600€ |
| "televison samsung" (faute de frappe) | Aucun résultat | Corrige et trouve les TV Samsung |

---

## 🚀 Démo live

Une démo fonctionnelle tourne sur un catalogue e-commerce réel de plusieurs milliers de produits actifs, branchée en direct sur une vraie base vectorielle et un vrai modèle de langage — pas un jeu de données factice.

👉 **[Tester la démo](https://maorediscount-api.vercel.app)**

Exemples à essayer :
- `lave linge 9kg pas cher`
- `tv 55 pouces 4k`
- `pc portable i5 512go`
- `canapé d'angle convertible`

---

## 🏗️ Comment ça marche

```
1. Client tape sa recherche en langage naturel
2. Détection de catégorie + marque + attributs (prix, capacité, dimensions...)
3. Recherche hybride : vecteurs sémantiques (Voyage AI + Qdrant) 
   + filtres stricts sur les attributs détectés
4. Claude (Anthropic) orchestre la recherche via tool-calling 
   et formule une réponse naturelle avec les vrais produits trouvés
5. Widget JS intégrable en une ligne de script sur le site
```

---

## 🔒 Sécurité

- **CORS strict** — Seul le domaine du client est autorisé à interroger l'API.
- **Rate limiting sur store partagé (Upstash Redis)** — Comptage centralisé du nombre de requêtes par utilisateur pour bloquer le spam et les robots, adapté au serverless multi-instances.
- **Authentification par token** Sécurisation des échanges directs entre le widget et l'API backend.
- **Validation stricte des inputs** — Contrôle rigoureux de la taille des messages, du format de l'historique et des paramètres de recherche pour prévenir les abus.
- **Respect total de la vie privée (RGPD)** — Aucune donnée personnelle ni aucun historique de conversation n'est collecté ou stocké.
- **Erreurs génériques en production** — jamais de détail d'erreur interne exposé au client.

---

### Stack technique

| Composant | Technologie | Pourquoi |
|---|---|---|
| Recherche vectorielle | Qdrant Cloud | Comprend l'intention, pas juste les mots-clés |
| Embeddings | Voyage AI (voyage-3-lite) | Rapide et peu coûteux pour un usage e-commerce |
| Modèle conversationnel | Claude (Anthropic) | Tool-calling fiable, respect strict des règles métier |
| API | Node.js — Vercel Serverless | Déploiement simple, scalable automatiquement |
| Rate limiting | Upstash Redis | Fiable même avec plusieurs instances serverless en parallèle |
| Plateforme e-commerce actuelle | PrestaShop | Catalogue synchronisé vers Qdrant |

---

## 🧠 Décisions d'architecture qui comptent

Quelques choix qui ne sont pas évidents au premier coup d'œil, mais qui ont un vrai impact sur la fiabilité :

**Recherche hybride.** Un croisement entre deux approches complémentaires :
- Par le sens (intelligente) : elle comprend l'intention globale, même avec des synonymes ou des fautes de frappe (ex: "chaise pour le jardin").
- Par mots-clés (exacte) : elle filtre sur des critères stricts et indiscutables (ex: marque, couleur, référence exacte).
Allier les deux permet de trouver le bon produit sans être bloqué par la formulation.

**Zéro fallback silencieux.** Quand un filtre ne trouve rien, la règle est stricte : 0 résultat honnête plutôt qu'un retour à une liste non filtrée. Un chatbot de vente qui dit "je n'ai pas ça" est plus fiable qu'un chatbot qui montre un produit approximatif en prétendant que c'est le bon.

**Rate limiting sur store partagé, pas en mémoire.** Sur une architecture serverless, chaque invocation peut tourner sur une instance différente — un compteur en mémoire locale ne protège pas réellement contre les abus. D'où le choix d'Upstash Redis (compteur partagé) plutôt qu'une simple `Map` JavaScript, qui aurait donné une fausse impression de protection.

---

## ⚡ Démarrage rapide

### Prérequis
- Node.js 20+
- Compte [Qdrant Cloud](https://cloud.qdrant.io) (gratuit)
- Compte [Voyage AI](https://www.voyageai.com) (gratuit)
- Compte [Anthropic](https://www.anthropic.com)
- Compte [Vercel](https://vercel.com) (gratuit)

### Installation

```bash
git clone https://github.com/VOTRE-COMPTE/classic-ai.git
cd classic-ai
npm install
cp .env.example .env
# remplir .env avec vos clés
```

### Intégration du widget sur un site

```html
<script src="https://votre-api.vercel.app/widget.js"></script>
```

Une seule ligne, aucune configuration côté site.

---

## 📄 Licence

MIT — libre d'utilisation, y compris commerciale.

---

## 👤 Auteur

**Arthur** — développeur, projet réalisé en conditions réelles pour une boutique e-commerce.

Contact : arthur.baudel@yahoo.fr
