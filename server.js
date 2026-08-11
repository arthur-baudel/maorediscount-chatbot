const express = require('express');
const searchProductsHandler = require('./api/search-products');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/search-products', (req, res) => {
  searchProductsHandler(req, res);
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

module.exports = app;
