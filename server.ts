import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function startServer() {
  const app = express();
  const PORT = 3000;

  if (!process.env.DATABASE_URL) {
    console.error("CRITICAL ERROR: DATABASE_URL is not defined in environment variables.");
    console.log("Please add DATABASE_URL in Settings -> Environment Variables.");
  }

  // Database Pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  // Test connection
  pool.connect((err, client, release) => {
    if (err) {
      console.error('Error acquiring client', err.stack);
    } else {
      console.log('Successfully connected to Neon Database');
      release();
    }
  });

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  
  // 0. Connection Status Check
  app.get("/api/db-status", async (req, res) => {
    try {
      const result = await pool.query('SELECT NOW()');
      res.json({ status: "connected", time: result.rows[0].now });
    } catch (err) {
      res.status(500).json({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  });

  // 1. Get all transactions
  app.get("/api/transactions", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM transactions ORDER BY date DESC');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // 2. Save multiple transactions (Bulk)
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
             type = EXCLUDED.type,
             date = EXCLUDED.date,
             item_code = EXCLUDED.item_code,
             item_name = EXCLUDED.item_name,
             unit = EXCLUDED.unit,
             quantity = EXCLUDED.quantity,
             price = EXCLUDED.price,
             discount = EXCLUDED.discount,
             total = EXCLUDED.total,
             invoice_number = EXCLUDED.invoice_number,
             customer = EXCLUDED.customer,
             note = EXCLUDED.note,
             cogs = EXCLUDED.cogs`,
          [item.id, item.type, item.date, item.itemCode, item.itemName, item.unit, item.quantity, item.price, item.discount, item.total, item.invoiceNumber, item.customer, item.note, item.cogs || 0]
        );
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: "Failed to save transactions" });
    } finally {
      client.release();
    }
  });

  // 3. Delete single transaction
  app.delete("/api/transactions/:id", async (req, res) => {
    try {
      await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete transaction" });
    }
  });

  // 4. Delete invoice (all transactions with same number)
  app.delete("/api/invoices/:number", async (req, res) => {
    try {
      await pool.query('DELETE FROM transactions WHERE invoice_number = $1', [req.params.number]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete invoice" });
    }
  });

  // 5. Get opening balances
  app.get("/api/opening-balances", async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM opening_balances');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch opening balances" });
    }
  });

  // 6. Save opening balance
  app.post("/api/opening-balances", async (req, res) => {
    const { item_code, month, year, quantity, value } = req.body;
    try {
      await pool.query(
        `INSERT INTO opening_balances (item_code, month, year, quantity, value)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (item_code, month, year) DO UPDATE SET
           quantity = EXCLUDED.quantity,
           value = EXCLUDED.value`,
        [item_code, month, year, quantity, value]
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to save opening balance" });
    }
  });

  // 7. Reset all data (Danger!)
  app.post("/api/reset", async (req, res) => {
    try {
      await pool.query('TRUNCATE transactions, opening_balances');
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to reset data" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
