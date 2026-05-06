import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const app = express();
app.use(express.json({ limit: '50mb' }));

// Database configuration
const dbUrl = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: (dbUrl?.includes('localhost') || dbUrl?.includes('127.0.0.1')) ? false : {
    rejectUnauthorized: false
  }
});

// Initialize database tables
async function initDb() {
  if (!dbUrl) {
    console.warn("[Database] No DATABASE_URL found. Skipping initialization.");
    return;
  }
  const client = await pool.connect();
  try {
    console.log("[Database] Initializing tables and checking columns...");
    
    // Create tables if they don't exist
    const tables = ['pnj_transactions', 'revenue_transactions', 'transactions'];
    
    for (const table of tables) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id TEXT PRIMARY KEY,
          type TEXT,
          date TEXT
        );
      `);

      // Ensure all columns exist
      const columns = [
        ['item_code', 'TEXT'],
        ['item_name', 'TEXT'],
        ['unit', 'TEXT'],
        ['quantity', 'FLOAT'],
        ['price', 'FLOAT'],
        ['discount', 'FLOAT'],
        ['total', 'FLOAT'],
        ['invoice_number', 'TEXT'],
        ['invoice_date', 'TEXT'],
        ['customer', 'TEXT'],
        ['customer_card', 'TEXT'],
        ['address', 'TEXT'],
        ['note', 'TEXT'],
        ['cogs', 'FLOAT'],
        ['source', 'TEXT']
      ];

      for (const [col, type] of columns) {
        try {
          await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
        } catch (err) {
          // Ignore errors
        }
      }
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS opening_balances (
        item_code TEXT,
        month INTEGER,
        year INTEGER,
        quantity FLOAT,
        value FLOAT,
        PRIMARY KEY (item_code, month, year)
      );
    `);

    console.log("[Database] Table schema verified.");
  } catch (err: any) {
    console.error("[Database] Initialization error:", err.message);
  } finally {
    client.release();
  }
}

// Helper to get table name from source
const getTableName = (source: string | undefined): string => {
  if (source === 'REVENUE') return 'revenue_transactions';
  if (source === 'PNJ') return 'pnj_transactions';
  return 'transactions';
};

// Run init in background
initDb();

const router = express.Router();

// Logging middleware
router.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// 0. Connection Status Check
router.get("/db-status", async (req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({ 
      status: "missing_env", 
      message: "Chưa cấu hình DATABASE_URL. Hãy thêm vào Settings -> Environment Variables trong AI Studio." 
    });
  }
  const client = await pool.connect();
  try {
    const timeResult = await client.query('SELECT NOW()');
    
    // Debug: Check columns in both tables
    const tableInfo = await Promise.all(['pnj_transactions', 'revenue_transactions'].map(async (table) => {
      const cols = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${table}'
      `);
      return { table, columns: cols.rows.map(r => r.column_name) };
    }));

    client.release();
    res.json({ 
      status: "connected", 
      time: timeResult.rows[0].now,
      tables: tableInfo
    });
  } catch (err: any) {
    console.error("[API] DB Status Check Error:", err.message);
    if (client) client.release();
    res.status(200).json({ 
      status: "error", 
      message: err.message || "Không thể kết nối đến Database" 
    });
  }
});

// 1. Get all transactions
router.get("/transactions", async (req, res) => {
  try {
    const pnj = await pool.query('SELECT * FROM pnj_transactions');
    const rev = await pool.query('SELECT * FROM revenue_transactions');
    const legacy = await pool.query('SELECT * FROM transactions');
    
    // Combine and mark source if missing
    const combined = [
      ...pnj.rows.map(r => ({ ...r, source: 'PNJ' })),
      ...rev.rows.map(r => ({ ...r, source: 'REVENUE' })),
      ...legacy.rows
    ];
    
    res.json(combined);
  } catch (err: any) {
    console.error("[API] Get Transactions Error:", err.message);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// 2. Bulk Transactions
router.post("/transactions/bulk", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    console.warn("[API] Bulk update failed: items is not an array");
    return res.status(400).json({ error: "Invalid data: items must be an array" });
  }
  
  console.log(`[API] Bulk inserting/updating ${items.length} transactions...`);
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      const tableName = getTableName(item.source);
      await client.query(
        `INSERT INTO ${tableName} (id, type, date, item_code, item_name, unit, quantity, price, discount, total, invoice_number, invoice_date, customer, customer_card, address, note, cogs, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (id) DO UPDATE SET
           type = EXCLUDED.type, date = EXCLUDED.date, item_code = EXCLUDED.item_code, item_name = EXCLUDED.item_name,
           unit = EXCLUDED.unit, quantity = EXCLUDED.quantity, price = EXCLUDED.price, discount = EXCLUDED.discount,
           total = EXCLUDED.total, invoice_number = EXCLUDED.invoice_number, invoice_date = EXCLUDED.invoice_date,
           customer = EXCLUDED.customer, customer_card = EXCLUDED.customer_card, address = EXCLUDED.address,
           note = EXCLUDED.note, cogs = EXCLUDED.cogs, source = EXCLUDED.source`,
        [
          item.id, 
          item.type, 
          item.date, 
          item.itemCode || item.item_code, 
          item.itemName || item.item_name, 
          item.unit, 
          item.quantity, 
          item.price, 
          item.discount, 
          item.total, 
          item.invoiceNumber || item.invoice_number,
          item.invoiceDate || item.invoice_date,
          item.customer, 
          item.customerCard || item.customer_card,
          item.address,
          item.note, 
          item.cogs || 0,
          item.source
        ]
      );
    }
    await client.query('COMMIT');
    console.log("[API] Bulk write successful.");
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error("[API] Bulk write error:", err.message);
    res.status(500).json({ error: "Failed to save transactions", details: err.message });
  } finally {
    client.release();
  }
});

// 3. Delete Single
router.delete("/transactions/:id", async (req, res) => {
  const { source } = req.query; // Expect source as query param
  const tableName = getTableName(source as string);
  try {
    await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[API] Delete Transaction Error:", err.message);
    res.status(500).json({ error: "Failed to delete" });
  }
});

// 4. Delete Invoice
router.delete("/invoices/:number", async (req, res) => {
  const { source } = req.query; // Expect source as query param
  const tableName = getTableName(source as string);
  try {
    await pool.query(`DELETE FROM ${tableName} WHERE invoice_number = $1`, [req.params.number]);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[API] Delete Invoice Error:", err.message);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

// 5. Get OB
router.get("/opening-balances", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM opening_balances');
    res.json(result.rows);
  } catch (err: any) {
    console.error("[API] Get OB Error:", err.message);
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
  } catch (err: any) {
    console.error("[API] Save OB Error:", err.message);
    res.status(500).json({ error: "Failed to save OB" });
  }
});

// 7. Reset
router.post("/reset", async (req, res) => {
  try {
    await pool.query('TRUNCATE transactions, opening_balances');
    res.json({ success: true });
  } catch (err: any) {
    console.error("[API] Reset Error:", err.message);
    res.status(500).json({ error: "Failed to reset" });
  }
});

// Mounting the router at BOTH /api and / to handle different environment routing
app.use("/api", router);
app.use("/", router);

export default app;


