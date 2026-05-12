import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
import { createClient } from "@supabase/supabase-js";

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

// Supabase Client (Lazy initialized)
let supabaseClient: any = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase environment variables are not configured.");
    }
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

// Initialize database tables
async function initDb() {
  if (!dbUrl) {
    console.warn("[Database] No DATABASE_URL found. Skipping initialization.");
    return;
  }
  const client = await pool.connect();
  try {
    console.log("[Database] Initializing tables and checking columns...");
    
    // Create source-specific tables
    const tables = ['nghiatingold_transactions', 'revenue_transactions'];
    
    // Check for "transactions" table (from Sales App on Supabase)
    const checkSalesAppTable = await client.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transactions')
    `);

    if (checkSalesAppTable.rows[0].exists) {
      console.log("[Database] Detected Sales App 'transactions' table on Supabase.");
    }

    // Create Local Sales Sync Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_app_transactions (
        id UUID PRIMARY KEY,
        type TEXT,
        customer_name TEXT,
        customer_cccd TEXT,
        dia_chi TEXT,
        product_id UUID,
        product_name TEXT,
        quantity NUMERIC,
        unit TEXT,
        price_per_unit NUMERIC,
        total_amount NUMERIC,
        tien_mat NUMERIC,
        chuyen_khoan NUMERIC,
        chiet_khau NUMERIC,
        other_deduction NUMERIC,
        cong_them NUMERIC,
        giam_tru NUMERIC,
        created_by UUID,
        created_at TIMESTAMPTZ,
        synced_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Ensure columns exist for existing tables (migration)
    const salesTableCols = ['chiet_khau', 'other_deduction', 'cong_them', 'giam_tru'];
    for (const col of salesTableCols) {
      try {
        await client.query(`ALTER TABLE sales_app_transactions ADD COLUMN IF NOT EXISTS ${col} NUMERIC DEFAULT 0`);
      } catch (err) {
        // Ignore
      }
    }

    // Check for legacy general 'transactions' table
    const checkGenLegacy = await client.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transactions')
    `);

    if (checkGenLegacy.rows[0].exists) {
      console.log("[Database] Legacy general 'transactions' table found. Migrating...");
      try {
        const legacyData = await client.query('SELECT * FROM transactions');
        for (const row of legacyData.rows) {
          const source = row.source || (row.id?.startsWith('rev') ? 'REVENUE' : 'INVENTORY');
          const targetTable = (source === 'REVENUE') ? 'revenue_transactions' : 'nghiatingold_transactions';
          
          await client.query(`
            INSERT INTO ${targetTable} (id, type, date, item_code, item_name, unit, quantity, price, discount, total, invoice_number, invoice_date, customer, customer_card, address, note, cogs, source)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            ON CONFLICT (id) DO NOTHING`,
            [row.id, row.type, row.date, row.item_code, row.item_name, row.unit, row.quantity, row.price, row.discount, row.total, row.invoice_number, row.invoice_date, row.customer, row.customer_card, row.address, row.note, row.cogs, source]
          );
        }
        console.log(`[Database] Migrated ${legacyData.rowCount} rows from generic transactions table.`);
      } catch (e) {
        console.error("Migration error from transactions table:", e);
      }
    }

    for (const table of tables) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id TEXT PRIMARY KEY,
          type TEXT,
          date TEXT
        );
      `);

      // List of all expected columns for consistent schema
      // We align with Sales App: customer_name instead of customer, customer_cccd instead of customer_card
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
        ['customer_name', 'TEXT'],
        ['customer_card', 'TEXT'],
        ['customer_cccd', 'TEXT'],
        ['address', 'TEXT'],
        ['dia_chi', 'TEXT'],
        ['note', 'TEXT'],
        ['cogs', 'FLOAT'],
        ['source', 'TEXT'],
        ['category', 'TEXT']
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
        item_name TEXT,
        month INTEGER,
        year INTEGER,
        quantity FLOAT,
        value FLOAT
      );
    `);

    // Ensure 'item_name' and 'value' columns exist (for older table versions)
    try {
      const colCheck = await client.query(`
        SELECT column_name, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'opening_balances'
      `);
      const cols = colCheck.rows;
      const existingCols = cols.map(r => r.column_name);
      
      if (!existingCols.includes('value')) {
        console.log("[Database] Adding missing 'value' column to opening_balances...");
        await client.query(`ALTER TABLE opening_balances ADD COLUMN value FLOAT DEFAULT 0`);
      }
      if (!existingCols.includes('item_name')) {
        console.log("[Database] Adding missing 'item_name' column to opening_balances...");
        await client.query(`ALTER TABLE opening_balances ADD COLUMN item_name TEXT`);
      }

      // Fix legacy 'balance' column if it exists and is NOT NULL
      if (existingCols.includes('balance')) {
        const balanceCol = cols.find(c => c.column_name === 'balance');
        if (balanceCol && balanceCol.is_nullable === 'NO') {
          console.log("[Database] Fixing legacy 'balance' column in opening_balances...");
          await client.query(`ALTER TABLE opening_balances ALTER COLUMN balance DROP NOT NULL`);
        }
      }
    } catch (err) {
      console.error("[Database] Failed to update opening_balances columns:", err);
    }

    // Ensure Primary Key and clean up duplicates if necessary
    try {
      console.log("[Database] Checking opening_balances constraints...");
      
      // 1. Ensure columns are NOT NULL (required for PK)
      // First fill any NULLs with defaults
      await client.query(`UPDATE opening_balances SET item_code = 'KHONG-MA' WHERE item_code IS NULL`);
      await client.query(`UPDATE opening_balances SET month = 0 WHERE month IS NULL`);
      await client.query(`UPDATE opening_balances SET year = 0 WHERE year IS NULL`);
      
      // Then set NOT NULL
      await client.query(`ALTER TABLE opening_balances ALTER COLUMN item_code SET NOT NULL`);
      await client.query(`ALTER TABLE opening_balances ALTER COLUMN month SET NOT NULL`);
      await client.query(`ALTER TABLE opening_balances ALTER COLUMN year SET NOT NULL`);

      // 2. Force drop existing PK to recreate it correctly
      await client.query(`
        DO $$ 
        BEGIN 
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'opening_balances' AND constraint_type = 'PRIMARY KEY'
          ) THEN
            -- Find the actual constraint name
            EXECUTE (
              SELECT 'ALTER TABLE opening_balances DROP CONSTRAINT ' || constraint_name
              FROM information_schema.table_constraints
              WHERE table_name = 'opening_balances' AND constraint_type = 'PRIMARY KEY'
              LIMIT 1
            );
          END IF;
        END $$;
      `);

      // 3. Remove duplicates keeping the most recent data
      await client.query(`
        DELETE FROM opening_balances a USING (
          SELECT MIN(ctid) as keep_id, item_code, month, year
          FROM opening_balances
          GROUP BY item_code, month, year
          HAVING COUNT(*) > 1
        ) b
        WHERE a.item_code = b.item_code 
          AND a.month = b.month 
          AND a.year = b.year 
          AND a.ctid > b.keep_id;
      `);

      // 4. Add the PK
      await client.query(`ALTER TABLE opening_balances ADD PRIMARY KEY (item_code, month, year)`);
      console.log("[Database] opening_balances Primary Key assigned successfully.");

    } catch (err: any) {
      console.error("[Database] Failed to ensure opening_balances PK:", err.message);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS bank_statements (
        id TEXT PRIMARY KEY,
        transaction_date TEXT,
        effective_date TEXT,
        debit FLOAT,
        credit FLOAT,
        balance FLOAT,
        content TEXT,
        classification TEXT,
        customer_name TEXT,
        customer_card TEXT,
        item_info TEXT,
        note TEXT
      );
    `);

    // Migration: ensure customer_card exists
    try {
      await client.query(`ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS customer_card TEXT`);
    } catch (e) {
      console.log("[Database] Migration: customer_card column might already exist.");
    }

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
  return 'nghiatingold_transactions';
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
    
    const tableInfo = await Promise.all(['nghiatingold_transactions', 'revenue_transactions', 'opening_balances', 'bank_statements'].map(async (table) => {
      const cols = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = '${table}'
      `);
      return { table, columns: cols.rows };
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

// 1. Get all transactions from both tables
router.get("/transactions", async (req, res) => {
  try {
    const pnj = await pool.query('SELECT * FROM nghiatingold_transactions ORDER BY date DESC');
    const rev = await pool.query('SELECT * FROM revenue_transactions ORDER BY date DESC');
    
    const combined = [
      ...pnj.rows.map(r => ({ ...r, source: 'INVENTORY' })),
      ...rev.rows.map(r => ({ ...r, source: 'REVENUE' }))
    ];
    
    res.json(combined);
  } catch (err: any) {
    console.error("[API] Get Transactions Error:", err.message);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

router.get("/sales/transactions", async (req, res) => {
  const { startDate, endDate, clientCccd, itemType } = req.query;
  
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(404).json({ 
        error: "Chưa cấu hình biến môi trường VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong Settings của AI Studio.", 
        code: "CONFIG_MISSING" 
      });
    }

    const supabase = getSupabaseClient();
    
    // 1. AUTO-SYNC LOGIC: Fetch NEW data from Supabase and save to local Neon DB
    try {
      // Find the last record synced locally
      const lastRecord = await pool.query('SELECT MAX(created_at) as last_date FROM sales_app_transactions');
      const lastDate = lastRecord.rows[0].last_date;
      
      let syncQuery = supabase.from('transactions').select('*');
      if (lastDate) {
        syncQuery = syncQuery.gt('created_at', lastDate.toISOString());
      }
      
      const { data: newData, error: syncError } = await syncQuery.limit(500);
      
      if (!syncError && newData && newData.length > 0) {
        console.log(`[Sync] Found ${newData.length} new records from Supabase. Saving to local DB...`);
        const syncClient = await pool.connect();
        try {
          await syncClient.query('BEGIN');
          for (const row of newData) {
            await syncClient.query(`
              INSERT INTO sales_app_transactions (
                id, type, customer_name, customer_cccd, dia_chi, 
                product_id, product_name, quantity, unit, 
                price_per_unit, total_amount, tien_mat, chuyen_khoan, 
                chiet_khau, other_deduction, cong_them, giam_tru,
                created_by, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
              ON CONFLICT (id) DO UPDATE SET
                type = EXCLUDED.type, customer_name = EXCLUDED.customer_name,
                customer_cccd = EXCLUDED.customer_cccd, dia_chi = EXCLUDED.dia_chi,
                product_name = EXCLUDED.product_name, quantity = EXCLUDED.quantity,
                unit = EXCLUDED.unit, price_per_unit = EXCLUDED.price_per_unit,
                total_amount = EXCLUDED.total_amount, tien_mat = EXCLUDED.tien_mat,
                chuyen_khoan = EXCLUDED.chuyen_khoan, 
                chiet_khau = EXCLUDED.chiet_khau,
                other_deduction = EXCLUDED.other_deduction,
                cong_them = EXCLUDED.cong_them,
                giam_tru = EXCLUDED.giam_tru,
                created_at = EXCLUDED.created_at,
                synced_at = NOW()
            `, [
              row.id, row.type, row.customer_name, row.customer_cccd, row.dia_chi,
              row.product_id, row.product_name, row.quantity, row.unit,
              row.price_per_unit, row.total_amount, row.tien_mat, row.chuyen_khoan,
              row.chiet_khau || 0, row.other_deduction || 0, row.cong_them || 0, row.giam_tru || 0,
              row.created_by, row.created_at
            ]);
          }
          await syncClient.query('COMMIT');
        } catch (e) {
          await syncClient.query('ROLLBACK');
          console.error("[Sync] Local Save Error:", e);
        } finally {
          syncClient.release();
        }
      }
    } catch (syncErr) {
      console.error("[Sync] Background Sync Error (skipping):", syncErr);
      // We continue to fetch from local even if sync fails
    }

    // 2. QUERY FROM LOCAL DB (Neon) - Fast and searchable
    let localQuery = `SELECT * FROM sales_app_transactions WHERE 1=1`;
    const params: any[] = [];

    if (itemType && itemType !== 'ALL') {
      params.push(itemType);
      localQuery += ` AND type = $${params.length}`;
    }

    if (startDate) {
      params.push(`${startDate}T00:00:00`);
      localQuery += ` AND created_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(`${endDate}T23:59:59`);
      localQuery += ` AND created_at <= $${params.length}`;
    }

    if (clientCccd) {
      params.push(`%${clientCccd}%`);
      localQuery += ` AND customer_cccd ILIKE $${params.length}`;
    }

    localQuery += ` ORDER BY created_at DESC LIMIT 10000`;
    
    const result = await pool.query(localQuery, params);
    res.json(result.rows);

  } catch (err: any) {
    console.error("[API] Sales Report Process Error:", err.message);
    res.status(500).json({ error: "Lỗi xử lý báo cáo: " + err.message, code: "PROCESS_ERROR" });
  }
});

// 2. Bulk Transactions
router.post("/transactions/bulk", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ success: true, count: 0 });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      const tableName = getTableName(item.source);
      
      // Sanitize inputs
      const safeId = item.id || Math.random().toString(36).substr(2, 9);
      const safeType = (item.type || 'OUT').toUpperCase();
      const safeDate = item.date || new Date().toISOString().split('T')[0];
      const safeItemCode = (item.itemCode || item.item_code || 'KHONG-MA').toString().trim();
      const safeItemName = (item.itemName || item.item_name || 'Hàng hóa').toString().trim();
      const safeUnit = (item.unit || 'Chỉ').toString().trim();
      const safeQty = parseFloat(item.quantity || 0) || 0;
      const safePrice = parseFloat(item.price || 0) || 0;
      const safeDiscount = parseFloat(item.discount || 0) || 0;
      const safeTotal = parseFloat(item.total || 0) || 0;
      const safeInvNum = (item.invoiceNumber || item.invoice_number || '').toString().trim();
      const safeInvDate = (item.invoiceDate || item.invoice_date || safeDate).toString().trim();
      const safeCustomer = (item.customer || 'Khách lẻ').toString().trim();
      const safeCustomerCard = (item.customerCard || item.customer_card || '').toString().trim();
      const safeAddress = (item.address || '').toString().trim();
      const safeNote = (item.note || '').toString().trim();
      const safeCogs = parseFloat(item.cogs || 0) || 0;
      const safeSource = item.source || 'INVENTORY';
      const safeCategory = (item.category || '').toString().trim();

      try {
        await client.query(
          `INSERT INTO ${tableName} (id, type, date, item_code, item_name, unit, quantity, price, discount, total, invoice_number, invoice_date, customer, customer_card, address, note, cogs, source, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
           ON CONFLICT (id) DO UPDATE SET
             type = EXCLUDED.type, date = EXCLUDED.date, item_code = EXCLUDED.item_code, item_name = EXCLUDED.item_name,
             unit = EXCLUDED.unit, quantity = EXCLUDED.quantity, price = EXCLUDED.price, discount = EXCLUDED.discount,
             total = EXCLUDED.total, invoice_number = EXCLUDED.invoice_number, invoice_date = EXCLUDED.invoice_date,
             customer = EXCLUDED.customer, customer_card = EXCLUDED.customer_card, address = EXCLUDED.address,
             note = EXCLUDED.note, cogs = EXCLUDED.cogs, source = EXCLUDED.source, category = EXCLUDED.category`,
          [
            safeId, safeType, safeDate, safeItemCode, safeItemName, safeUnit, safeQty, safePrice,
            safeDiscount, safeTotal, safeInvNum, safeInvDate, safeCustomer, safeCustomerCard,
            safeAddress, safeNote, safeCogs, safeSource, safeCategory
          ]
        );
      } catch (rowErr: any) {
        console.error(`[API] Error inserting row ${safeId}:`, rowErr.message);
        throw new Error(`Row ${safeId} failed: ${rowErr.message}`);
      }
    }
    await client.query('COMMIT');
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    if (client) await client.query('ROLLBACK');
    console.error("[API] Bulk write master error:", err.message);
    res.status(500).json({ error: "Lỗi lưu dữ liệu: " + err.message, details: err.message });
  } finally {
    client.release();
  }
});

// 3. Delete Single
router.delete("/transactions/:id", async (req, res) => {
  const { source } = req.query;
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
router.delete("/invoices/bulk", async (req, res) => {
  const { source, invoiceNumbers } = req.body;
  if (!Array.isArray(invoiceNumbers) || invoiceNumbers.length === 0) {
    return res.json({ success: true, count: 0 });
  }
  const tableName = getTableName(source as string);
  try {
    await pool.query(`DELETE FROM ${tableName} WHERE invoice_number = ANY($1)`, [invoiceNumbers]);
    res.json({ success: true, count: invoiceNumbers.length });
  } catch (err: any) {
    console.error("[API] Bulk Delete Invoice Error:", err.message);
    res.status(500).json({ error: "Failed to bulk delete invoices" });
  }
});

router.delete("/invoices/:number", async (req, res) => {
  const { source } = req.query;
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
  const { item_code, item_name, month, year, quantity, value } = req.body;
  
  if (!item_code || month === undefined || year === undefined) {
    return res.status(400).json({ error: "Thiếu thông tin bắt buộc (mã hàng, tháng, năm)" });
  }

  try {
    await pool.query(
      `INSERT INTO opening_balances (item_code, item_name, month, year, quantity, value)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (item_code, month, year) DO UPDATE SET 
         item_name = EXCLUDED.item_name,
         quantity = EXCLUDED.quantity, 
         value = EXCLUDED.value`,
      [item_code, item_name, month, year, parseFloat(quantity || 0), parseFloat(value || 0)]
    );
    res.json({ success: true });
  } catch (err: any) {
    console.error("[API] Save OB Error:", err.message);
    res.status(500).json({ error: `Lỗi Database: ${err.message}` });
  }
});

// 7. Reset
router.post("/reset", async (req, res) => {
  try {
    await pool.query('TRUNCATE nghiatingold_transactions, revenue_transactions, opening_balances, bank_statements');
    res.json({ success: true });
  } catch (err: any) {
    console.error("[API] Reset Error:", err.message);
    res.status(500).json({ error: "Failed to reset" });
  }
});

// 9. Bank Statements
router.get("/bank-statements", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bank_statements ORDER BY transaction_date DESC');
    res.json(result.rows);
  } catch (err: any) {
    console.error("[API] Get Bank Statements Error:", err.message);
    res.status(500).json({ error: "Failed to fetch bank statements" });
  }
});

router.post("/bank-statements/bulk", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ success: true, count: 0 });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      await client.query(
        `INSERT INTO bank_statements (id, transaction_date, effective_date, debit, credit, balance, content, classification, customer_name, customer_card, item_info, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           transaction_date = EXCLUDED.transaction_date, 
           effective_date = EXCLUDED.effective_date,
           debit = EXCLUDED.debit,
           credit = EXCLUDED.credit,
           balance = EXCLUDED.balance,
           content = EXCLUDED.content,
           classification = EXCLUDED.classification,
           customer_name = EXCLUDED.customer_name,
           customer_card = EXCLUDED.customer_card,
           item_info = EXCLUDED.item_info,
           note = EXCLUDED.note`,
        [
          item.id,
          item.transaction_date || item.transactionDate,
          item.effective_date || item.effectiveDate,
          item.debit || 0,
          item.credit || 0,
          item.balance || 0,
          item.content,
          item.classification,
          item.customer_name || item.customerName,
          item.customer_card || item.customerCard,
          item.item_info || item.itemInfo,
          item.note
        ]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error("[API] Bank Bulk Error:", err.message);
    res.status(500).json({ error: "Failed to save bank statements" });
  } finally {
    client.release();
  }
});

// 8. Fix Metadata (Migration to new tables)
router.post("/migrate-source", async (req, res) => {
  const { from, to } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Check if legacy 'transactions' table exists
    const checkLegacy = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'transactions'
      );
    `);

    if (checkLegacy.rows[0].exists) {
      // Migrate from legacy table to specific tables
      const legacyData = await client.query('SELECT * FROM transactions');
      for (const row of legacyData.rows) {
        const source = row.source || (row.id.startsWith('rev') ? 'REVENUE' : 'INVENTORY');
        const targetTable = getTableName(source);
        
        await client.query(
          `INSERT INTO ${targetTable} (id, type, date, item_code, item_name, unit, quantity, price, discount, total, invoice_number, invoice_date, customer, customer_card, address, note, cogs, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
           ON CONFLICT (id) DO NOTHING`,
          [row.id, row.type, row.date, row.item_code, row.item_name, row.unit, row.quantity, row.price, row.discount, row.total, row.invoice_number, row.invoice_date, row.customer, row.customer_card, row.address, row.note, row.cogs, source]
        );
      }
      // Optional: DROP TABLE transactions;
    }

    // Also support intra-table move if needed (though now we have separate tables)
    // For now just migrate from INVENTORY table to REVENUE table if 'from' and 'to' are specified
    if (from === 'INVENTORY' && to === 'REVENUE') {
      const data = await client.query('SELECT * FROM nghiatingold_transactions');
      for (const row of data.rows) {
        await client.query(
          `INSERT INTO revenue_transactions (id, type, date, item_code, item_name, unit, quantity, price, discount, total, invoice_number, invoice_date, customer, customer_card, address, note, cogs, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
           ON CONFLICT (id) DO NOTHING`,
          [row.id, row.type, row.date, row.item_code, row.item_name, row.unit, row.quantity, row.price, row.discount, row.total, row.invoice_number, row.invoice_date, row.customer, row.customer_card, row.address, row.note, row.cogs, 'REVENUE']
        );
        await client.query('DELETE FROM nghiatingold_transactions WHERE id = $1', [row.id]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error("[API] Migration Error:", err.message);
    res.status(500).json({ error: "Failed to migrate" });
  } finally {
    client.release();
  }
});

// Mounting the router at BOTH /api and / to handle different environment routing
app.use("/api", router);
app.use("/", router);

export default app;


