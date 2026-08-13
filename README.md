# Classic AI — Assistant de recherche IA pour e-commerce
![Docker Build](https://github.com/arthur-baudel/maorediscount-chatbot/actions/workflows/docker-build.yml/badge.svg)

> Transforme la barre de recherche d'une boutique en ligne en une recherche conversationnelle. Un client peut chercher en langage naturel — même avec des fautes de frappe, des synonymes ou une description floue — et obtenir les bons produits, pas une page vide.

[![Démo live](https://img.shields.io/badge/D%C3%A9mo%20live-tester%20maintenant-blue)](https://maorediscount-api.vercel.app)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-brightgreen)](https://nodejs.org)

---

## 🎯 Le problème que ça résout

Sur la plupart des boutiques PrestaShop/WooCommerce, une recherche qui ne tape pas le mot exact du produit renvoie une page vide — une vente perdue instantanément.

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

**Recherche hybride plutôt que mots-clés purs.** Une première version reposait sur un mapping mots-clés → catégorie, avec filtrage manuel par attribut. Problème : chaque nouvelle formulation ("chaise de jardin" vs "chaise jardin") ou faux positif de sous-chaîne ("LG" matché dans "P608FLG") demandait un correctif au cas par cas. La recherche vectorielle en chemin par défaut, avec les mots-clés en filtre plutôt qu'en aiguillage binaire, élimine toute une classe de ces bugs d'un coup.

**Zéro fallback silencieux.** Quand un filtre ne trouve rien, la règle est stricte : 0 résultat honnête plutôt qu'un retour à une liste non filtrée. Un chatbot de vente qui dit "je n'ai pas ça" est plus fiable qu'un chatbot qui montre un produit approximatif en prétendant que c'est le bon.

**Rate limiting sur store partagé, pas en mémoire.** Sur une architecture serverless, chaque invocation peut tourner sur une instance différente — un compteur en mémoire locale ne protège pas réellement contre les abus. D'où le choix d'Upstash Redis (compteur partagé) plutôt qu'une simple `Map` JavaScript, qui aurait donné une fausse impression de protection.

---

## 🔒 Sécurité

- **CORS strict** — seul le domaine du client peut appeler l'API
- **Rate limiting sur store partagé** (Upstash Redis) — fiable en environnement serverless multi-instances
- **Authentification par token** entre le widget et l'API
- **Validation stricte des inputs** — taille des messages, format de l'historique, paramètres de recherche
- **Aucune donnée personnelle collectée ou stockée**
- **Erreurs génériques en production** — jamais de détail d'erreur interne exposé au client

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
