const express = require('express');
const router = express.Router();
const { getInventoryStock } = require('../controllers/inventoryController');

// Ruta GET para obtener el inventario: /api/inventory
router.get('/', getInventoryStock);

module.exports = router;