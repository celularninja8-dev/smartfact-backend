const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Pool de conexiones asíncrono
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'smartfact_db',
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ================= 1. AUTENTICACIÓN Y ROLES (RBAC) =================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { full_name, email, username, password, role } = req.body;
        const [existing] = await pool.query("SELECT * FROM users WHERE username = ? OR email = ?", [username, email]);
        if (existing.length > 0) return res.status(400).json({ success: false, error: "El usuario o correo ya existen." });

        const passwordHash = await bcrypt.hash(password, 10);
        const userRole = role === 'operator' ? 'operator' : 'admin';

        await pool.query(
            "INSERT INTO users (full_name, email, username, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'active')", 
            [full_name, email, username, passwordHash, userRole]
        );
        res.json({ success: true, message: "¡Cuenta corporativa creada con éxito!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
        if (rows.length === 0) return res.status(401).json({ success: false, error: "Usuario no encontrado." });

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ success: false, error: "Contraseña incorrecta." });

        res.json({ 
            success: true, 
            message: "¡Acceso concedido!", 
            user: { id: user.user_id, username: user.username, full_name: user.full_name, role: user.role } 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================= 2. CATEGORÍAS =================
app.get('/api/categories', async (req, res) => {
    try {
        const userId = req.query.user_id || req.headers['x-user-id'];
        const [rows] = await pool.query("SELECT * FROM categories WHERE user_id = ?", [userId]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/categories', async (req, res) => {
    try {
        let { user_id, category_name } = req.body;
        if (!user_id) user_id = req.headers['x-user-id'];
        await pool.query("INSERT INTO categories (user_id, category_name) VALUES (?, ?)", [user_id, category_name]);
        res.json({ success: true, message: "¡Categoría registrada!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================= 3. PRODUCTOS CON PAGINACIÓN EN SERVIDOR =================
app.get('/api/products', async (req, res) => {
    try {
        const userId = req.query.user_id || req.headers['x-user-id'];
        const search = req.query.search ? `%${req.query.search}%` : '%';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const [countRows] = await pool.query(
            `SELECT COUNT(*) as total FROM products WHERE user_id = ? AND status = 'active' AND product_name LIKE ?`,
            [userId, search]
        );
        const totalRecords = countRows[0].total;

        const [rows] = await pool.query(
            `SELECT p.*, c.category_name FROM products p LEFT JOIN categories c ON p.category_id = c.category_id 
             WHERE p.user_id = ? AND p.status = 'active' AND p.product_name LIKE ? 
             ORDER BY p.product_id DESC LIMIT ? OFFSET ?`,
            [userId, search, limit, offset]
        );

        res.json({ success: true, data: rows, pagination: { totalRecords, page, totalPages: Math.ceil(totalRecords / limit) } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        let { user_id, product_name, category_id, stock_current_level, stock_min_level, unit_price, supplier_name } = req.body;
        if (!user_id) user_id = req.headers['x-user-id'];

        await pool.query(
            `INSERT INTO products (user_id, product_name, category_id, stock_current_level, stock_min_level, unit_price, supplier_name, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
            [user_id, product_name, category_id || null, stock_current_level, stock_min_level, unit_price, supplier_name || 'General']
        );
        res.json({ success: true, message: "¡Producto registrado exitosamente!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { product_name, category_id, stock_current_level, stock_min_level, unit_price, supplier_name } = req.body;
        await pool.query(
            `UPDATE products SET product_name = ?, category_id = ?, stock_current_level = ?, stock_min_level = ?, unit_price = ?, supplier_name = ? WHERE product_id = ?`,
            [product_name, category_id || null, stock_current_level, stock_min_level, unit_price, supplier_name || 'General', id]
        );
        res.json({ success: true, message: "¡Producto actualizado!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/products/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("UPDATE products SET status = 'inactive' WHERE product_id = ?", [id]);
        res.json({ success: true, message: "¡Producto removido lógicamente!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================= 4. TRANSACCIÓN ATÓMICA CON BLOQUEO (FOR UPDATE) =================
app.post('/api/invoices', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        let { user_id, supplier_name, invoice_number, items } = req.body; 
        if (!user_id) user_id = req.headers['x-user-id'];

        if (!invoice_number) {
            const [countRows] = await connection.query("SELECT COUNT(*) as total FROM invoices_incoming WHERE user_id = ?", [user_id]);
            invoice_number = `FAC-2026-${String(countRows[0].total + 1).padStart(3, '0')}`;
        }

        let total_amount = items.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.unit_price)), 0);

        const [invoiceResult] = await connection.query(
            `INSERT INTO invoices_incoming (user_id, supplier_name, invoice_number, total_amount, status) VALUES (?, ?, ?, ?, 'active')`,
            [user_id, supplier_name, invoice_number, total_amount]
        );
        const invoiceId = invoiceResult.insertId;

        await connection.query(
            `INSERT INTO supplier_accounts (user_id, invoice_id, supplier_name, total_debt, payment_status) VALUES (?, ?, ?, ?, 'pending')`,
            [user_id, invoiceId, supplier_name, total_amount]
        );

        for (const item of items) {
            await connection.query("SELECT stock_current_level FROM products WHERE product_id = ? FOR UPDATE", [item.product_id]);

            await connection.query(
                `INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)`,
                [invoiceId, item.product_id, item.quantity, item.unit_price]
            );
            await connection.query(
                `UPDATE products SET stock_current_level = stock_current_level + ?, supplier_name = ? WHERE product_id = ? AND user_id = ?`,
                [item.quantity, supplier_name, item.product_id, user_id]
            );
        }

        await connection.commit();
        connection.release();
        res.json({ success: true, message: `¡Factura ${invoice_number} procesada con seguridad atómica y cuenta por pagar creada!` });
    } catch (error) {
        await connection.rollback();
        connection.release();
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================= 5. BUSINESS INTELLIGENCE DIRECTO Y BLINDADO =================
app.get('/api/reports/kpis', async (req, res) => {
    try {
        const userId = req.query.user_id || req.headers['x-user-id'];
        const [rows] = await pool.query(`
            SELECT 
                COUNT(product_id) AS total_products,
                COALESCE(SUM(stock_current_level), 0) AS total_units,
                COALESCE(SUM(stock_current_level * unit_price), 0) AS total_asset_value,
                SUM(CASE WHEN stock_current_level <= stock_min_level THEN 1 ELSE 0 END) AS critical_stock_count
            FROM products 
            WHERE user_id = ? AND status = 'active'
        `, [userId]);
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/reports/valuation', async (req, res) => {
    try {
        const userId = req.query.user_id || req.headers['x-user-id'];
        const [rows] = await pool.query(`
            SELECT 
                COALESCE(c.category_name, 'General') AS category_name,
                COUNT(p.product_id) AS total_products,
                SUM(p.stock_current_level) AS total_units,
                SUM(p.stock_current_level * p.unit_price) AS total_valuation
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE p.user_id = ? AND p.status = 'active'
            GROUP BY c.category_name
        `, [userId]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/reports/category-share', async (req, res) => {
    try {
        const userId = req.query.user_id || req.headers['x-user-id'];
        const [rows] = await pool.query(`
            SELECT 
                COALESCE(c.category_name, 'General') AS category_name,
                COALESCE(SUM(p.stock_current_level), 0) AS units_share
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE p.user_id = ? AND p.status = 'active'
            GROUP BY c.category_name
        `, [userId]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/reports/replenishment', async (req, res) => {
    try {
        const userId = req.query.user_id || req.headers['x-user-id'];
        const [rows] = await pool.query(`
            SELECT product_id, product_name, supplier_name, stock_current_level, stock_min_level, unit_price,
            (CASE WHEN stock_current_level < stock_min_level THEN (stock_min_level * 2) - stock_current_level ELSE 0 END) AS recommended_purchase_qty
            FROM products WHERE user_id = ? AND status = 'active' AND stock_current_level <= stock_min_level ORDER BY stock_current_level ASC
        `, [userId]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/reports/kardex', async (req, res) => {
    try {
        const userId = req.query.user_id || req.headers['x-user-id'];
        const [rows] = await pool.query(`
            SELECT ii.invoice_item_id AS movement_id, p.product_name, i.supplier_name, ii.quantity AS units_added, ii.unit_price, i.invoice_number, i.created_at AS movement_date
            FROM invoice_items ii JOIN invoices_incoming i ON ii.invoice_id = i.invoice_id JOIN products p ON ii.product_id = p.product_id
            WHERE i.user_id = ? ORDER BY i.created_at DESC
        `, [userId]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/reports/accounts-payable', async (req, res) => {
    try {
        const userId = req.query.user_id || req.headers['x-user-id'];
        const [rows] = await pool.query(`
            SELECT sa.*, i.invoice_number FROM supplier_accounts sa 
            JOIN invoices_incoming i ON sa.invoice_id = i.invoice_id 
            WHERE sa.user_id = ? ORDER BY sa.created_at DESC
        `, [userId]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/reports/accounts-payable/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("UPDATE supplier_accounts SET payment_status = 'paid' WHERE account_id = ?", [id]);
        res.json({ success: true, message: "¡Deuda saldada correctamente!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 SmartFact Enterprise Pro [BI Optimizado] en http://localhost:${PORT}`);
});SSSSSS