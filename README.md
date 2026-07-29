# Maorediscount API — ChatLab Integration

API proxy entre ChatLab et PrestaShop. Expose uniquement les produits, aucune donnée sensible.

## Structure

```
maorediscount-api/
├── api/
│   └── search-products.js   # Endpoint principal
├── vercel.json
└── README.md
```

## Variables d'environnement (à configurer sur Vercel)

| Variable | Description | Exemple |
|---|---|---|
| `PRESTASHOP_URL` | URL de la boutique sans slash final | `https://www.maorediscount.yt` |
| `PRESTASHOP_API_KEY` | Clé WebService PrestaShop | `ABCDEF1234567890...` |
| `CHATLAB_SECRET` | Token secret pour sécuriser l'API | `un-mot-de-passe-fort` |

## Déploiement

1. Pusher ce repo sur GitHub
2. Connecter le repo sur [vercel.com](https://vercel.com)
3. Ajouter les 3 variables d'environnement dans **Settings → Environment Variables**
4. Déployer

## Endpoint

```
GET https://ton-projet.vercel.app/api/search-products?q=chaussures
```

**Headers requis :**
```
Authorization: Bearer TON_CHATLAB_SECRET
```

**Réponse exemple :**
```json
{
  "query": "chaussures",
  "total": 3,
  "products": [
    {
      "id": 42,
      "nom": "Chaussures de randonnée",
      "description": "Imperméables, semelle Vibram...",
      "prix": "89.90 €",
      "url": "https://www.maorediscount.yt/chaussures-randonnee"
    }
  ]
}
```

## Configuration ChatLab

| Champ | Valeur |
|---|---|
| Operation label | Recherche Produits Maore |
| Operation name | RechercheProduits |
| Operation URI | `https://ton-projet.vercel.app/api/search-products` |
| HTTP method | GET |
| Query parameter | `q` |
| Header | `Authorization: Bearer TON_CHATLAB_SECRET` |
