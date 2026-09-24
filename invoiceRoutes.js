const express = require('express');
const router = express.Router();
const { processIncomingInvoice } = require('../controllers/invoiceController');

// Ruta POST para procesar facturas: /api/invoices/process
router.post('/process', processIncomingInvoice);

module.exports = router;