const express = require('express');
const cors = require('cors');

const invoiceRoutes = require('./routes/invoiceRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Endpoints principales
app.use('/api/invoices', invoiceRoutes);
app.use('/api/inventory', inventoryRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Bienvenido al API Backend de SmartFact SaaS B2B' });
});

module.exports = app;