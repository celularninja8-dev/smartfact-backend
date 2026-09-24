const pool = require('../config/db');

exports.processInvoice = async (req, res) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        // Lógica de inserción de factura y actualización de inventario
        await connection.commit();
        res.status(200).json({ success: true, message: "Factura procesada" });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};