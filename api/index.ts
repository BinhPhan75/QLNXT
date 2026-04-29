import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const router = express.Router();

// Database configuration
const dbUrl = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: (dbUrl?.includes('localhost') || dbUrl?.includes('127.0.0.1')) ? false : {
    rejectUnauthorized: false
  }
});

// 0. Connection Status Check
router.get("/db-status", async (req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({ 
      status: "missing_env", 
      message: "Chưa cấu hình DATABASE_URL trong AI Studio Settings." 
    });
  }
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    res.json({ status: "connected", time: result.rows[0].now });
  } catch (err: any) {
    console.error("DB Status Check Error:", err.message);
    res.status(200).json({ 
      status: "error", 
      message: err.message || "Không thể kết nối đến Database" 
    });
  }
});

// 1. Get all transactions
router.get("/transactions", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM transactions ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// 2. Bulk Transactions
router.post("/transactions/bulk", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: "Invalid data" });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      await client.query(
        `INSERT INTO transactions (id, type, date, item_code, item_name, unit, quantity, price, discount, total, invoice_number, customer, note, cogs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET
           type = EXCLUDED.type, date = EXCLUDED.date, item_code = EXCLUDED.item_code, item_name = EXCLUDED.item_name,
           unit = EXCLUDED.unit, quantity = EXCLUDED.quantity, price = EXCLUDED.price, discount = EXCLUDED.discount,
           total = EXCLUDED.total, invoice_number = EXCLUDED.invoice_number, customer = EXCLUDED.customer, note = EXCLUDED.note, cogs = EXCLUDED.cogs`,
        [item.id, item.type, item.date, item.itemCode, item.itemName, item.unit, item.quantity, item.price, item.discount, item.total, item.invoiceNumber, item.customer, item.note, item.cogs || 0]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Failed to save transactions" });
  } finally {
    client.release();
  }
});

// 3. Delete Single
router.delete("/transactions/:id", async (req, res) => {
  try {
    await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

// 4. Delete Invoice
router.delete("/invoices/:number", async (req, res) => {
  try {
    await pool.query('DELETE FROM transactions WHERE invoice_number = $1', [req.params.number]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

// 5. Get OB
router.get("/opening-balances", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM opening_balances');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch OB" });
  }
});

// 6. Save OB
router.post("/opening-balances", async (req, res) => {
  const { item_code, month, year, quantity, value } = req.body;
  try {
    await pool.query(
      `INSERT INTO opening_balances (item_code, month, year, quantity, value)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (item_code, month, year) DO UPDATE SET quantity = EXCLUDED.quantity, value = EXCLUDED.value`,
      [item_code, month, year, quantity, value]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save OB" });
  }
});

// 7. Reset
router.post("/reset", async (req, res) => {
  try {
    await pool.query('TRUNCATE transactions, opening_balances');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset" });
  }
});

export default router;
