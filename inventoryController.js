const pool = require('../config/db');

const getInventoryStock = async (req, res) => {
  try {
    // Vamos a probar si al menos la conexión responde
    const [rows] = await pool.query('SELECT 1'); 
    console.log("¡Conexión a base de datos funcionando!");
    
    // Ahora intentamos la consulta real
    const [products] = await pool.query('SELECT * FROM Products');
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.error('DETALLE DEL ERROR:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getInventoryStock };