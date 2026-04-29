import express from "express";
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const app = express();
app.use(express.json({ limit: '50mb' }));

const getPool = () => {
  const dbUrl = process.env.DATABASE_URL;
  return new Pool({
    connectionString: dbUrl,
    ssl: dbUrl?.includes('localhost') ? false : {
      rejectUnauthorized: false
    }
  });
};

const pool = getPool();

// 0. Connection Status Check
app.get("/api/db-status", async (req, res) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(200).json({ 
      status: "missing_env", 
      message: "Thiếu biến DATABASE_URL. Hãy thêm vào Settings -> Env Vars." 
    });
  }
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    res.json({ status: "connected", time: result.rows[0].now });
  } catch (err: any) {
    res.status(200).json({ status: "error", message: err.message });
  }
});

// 1. Get all transactions
app.get("/api/transactions", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM transactions ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// 2. Bulk Transactions
app.post("/api/transactions/bulk", async (req, res) => {
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
app.delete("/api/transactions/:id", async (req, res) => {
  try {
    await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

// 4. Delete Invoice
app.delete("/api/invoices/:number", async (req, res) => {
  try {
    await pool.query('DELETE FROM transactions WHERE invoice_number = $1', [req.params.number]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

// 5. Get OB
app.get("/api/opening-balances", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM opening_balances');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch OB" });
  }
});

// 6. Save OB
app.post("/api/opening-balances", async (req, res) => {
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
app.post("/api/reset", async (req, res) => {
  try {
    await pool.query('TRUNCATE transactions, opening_balances');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset" });
  }
});

export default app;
