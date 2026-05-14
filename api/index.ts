import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
app.use(express.json({ limit: '50mb' }));

// Gemini AI configuration
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

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

// Global Sync Function to handle Deletions and Updates
async function performSupabaseSync() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  try {
    const supabase = getSupabaseClient();
    console.log("[Sync] Starting synchronization with Supabase...");

    // 1. Handle Deletions: Compare IDs
    const { data: sbIds, error: idsErr } = await supabase.from('transactions').select('id');
    if (!idsErr && sbIds) {
      const remoteIds = sbIds.map(r => r.id);
      if (remoteIds.length > 0) {
        const delRes = await pool.query(
          'DELETE FROM sales_app_transactions WHERE id NOT IN (SELECT unnest($1::uuid[]))',
          [remoteIds]
        );
        if (delRes.rowCount && delRes.rowCount > 0) {
          console.log(`[Sync] Deleted ${delRes.rowCount} orphaned records from local database.`);
        }
      } else {
        // If Supabase is empty, Neon should be empty for sales_app (if desired)
        const countRes = await pool.query('SELECT count(*) FROM sales_app_transactions');
        if (parseInt(countRes.rows[0].count) > 0) {
          await pool.query('DELETE FROM sales_app_transactions');
          console.log("[Sync] Supabase is empty, cleared local sales_app_transactions.");
        }
      }
    }

    // 2. Handle Updates/New: Fetch recent window (last 2000 records)
    // Fetching by created_at DESC to get new and recently updated (if created_at is anchor)
    const { data: recentData, error: dataErr } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);

    if (dataErr) {
      console.error("[Sync] Supabase data fetch error:", dataErr);
      return;
    }

    if (recentData && recentData.length > 0) {
      const syncClient = await pool.connect();
      try {
        await syncClient.query('BEGIN');
        for (const row of recentData) {
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
              product_id = EXCLUDED.product_id,
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
        console.log(`[Sync] Upserted ${recentData.length} records to local database.`);
      } catch (e) {
        await syncClient.query('ROLLBACK');
        console.error("[Sync] Bulk upsert failed:", e);
      } finally {
        syncClient.release();
      }
    }
  } catch (err) {
    console.error("[Sync] Fatal sync error:", err);
  }
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

    // Tier 1: Raw bank statements (Original document)
    await client.query(`
      CREATE TABLE IF NOT EXISTS raw_bank_statements (
        id TEXT PRIMARY KEY,
        transaction_date TEXT,
        effective_date TEXT,
        debit FLOAT,
        credit FLOAT,
        balance FLOAT,
        content TEXT,
        note TEXT,
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Tier 2: Rules for keyword matching (Bank Mapping Rules)
    await client.query(`
      CREATE TABLE IF NOT EXISTS bank_mapping_rules (
        id SERIAL PRIMARY KEY,
        keyword TEXT NOT NULL,
        category TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Tier 3: Mapping processed data (Middle tier / Editable Draft)
    await client.query(`
      CREATE TABLE IF NOT EXISTS mapping_processed_data (
        id TEXT PRIMARY KEY,
        classification TEXT, -- Editable by user
        match_method TEXT, -- 'MAPPING', 'MANUAL'
        processed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Migration for mapping_processed_data (Add missing columns if table existed previously)
    const mCols = [
      ['transaction_date', 'TEXT'],
      ['effective_date', 'TEXT'],
      ['debit', 'FLOAT'],
      ['credit', 'FLOAT'],
      ['balance', 'FLOAT'],
      ['content', 'TEXT'],
      ['note', 'TEXT']
    ];
    for (const [col, type] of mCols) {
      try {
        await client.query(`ALTER TABLE mapping_processed_data ADD COLUMN IF NOT EXISTS ${col} ${type}`);
      } catch (e) {}
    }

    // Tier 4: Final bank ledger (Final clean version)
    await client.query(`
      CREATE TABLE IF NOT EXISTS final_bank_ledger (
        id TEXT PRIMARY KEY,
        transaction_date TEXT,
        effective_date TEXT,
        debit FLOAT,
        credit FLOAT,
        balance FLOAT,
        content TEXT,
        classification TEXT,
        customer_name TEXT,
        item_info TEXT,
        note TEXT,
        method TEXT, -- 'MAPPING' or 'AI' or 'MANUAL'
        finalized_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Migration for final_bank_ledger
    const fCols = [
      ['transaction_date', 'TEXT'],
      ['effective_date', 'TEXT'],
      ['debit', 'FLOAT'],
      ['credit', 'FLOAT'],
      ['balance', 'FLOAT'],
      ['content', 'TEXT'],
      ['note', 'TEXT'],
      ['customer_name', 'TEXT'],
      ['item_info', 'TEXT']
    ];
    for (const [col, type] of fCols) {
      try {
        await client.query(`ALTER TABLE final_bank_ledger ADD COLUMN IF NOT EXISTS ${col} ${type}`);
      } catch (e) {}
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
    // Perform background sync (awaiting it here to ensure data is fresh for the subsequent query)
    await performSupabaseSync();

    // 2. Fetch from all sources
    const pnj = await pool.query('SELECT * FROM nghiatingold_transactions ORDER BY date DESC');
    const rev = await pool.query('SELECT * FROM revenue_transactions ORDER BY date DESC');
    const sales = await pool.query('SELECT * FROM sales_app_transactions ORDER BY created_at DESC');
    
    const combined = [
      ...pnj.rows.map(r => ({ ...r, source: 'INVENTORY' })),
      ...rev.rows.map(r => ({ ...r, source: 'REVENUE' })),
      ...sales.rows.map(r => ({ ...r, source: 'REVENUE' }))
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
    
    // 1. AUTO-SYNC LOGIC: Fetch NEW/UPDATED and handle DELETIONS
    await performSupabaseSync();

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
    await pool.query('TRUNCATE nghiatingold_transactions, revenue_transactions, opening_balances, raw_bank_statements, mapping_processed_data, final_bank_ledger CASCADE');
    res.json({ success: true });
  } catch (err: any) {
    console.error("[API] Reset Error:", err.message);
    res.status(500).json({ error: "Failed to reset" });
  }
});

// New 3-Tier Workflow Endpoints

// Tier 1: Import Raw Statements -> Automatically populates T2 Editable Draft
router.post("/api/raw-statements/bulk", async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) return res.status(400).json({ error: "Invalid data" });
  
  const client = await pool.connect();
  try {
    const rulesRes = await client.query('SELECT keyword, category FROM bank_mapping_rules WHERE is_active = true');
    const rules = rulesRes.rows;

    // We use unnest for Tier 1 to be fast
    const ids = items.map(i => i.id);
    const txDates = items.map(i => i.transactionDate);
    const effDates = items.map(i => i.effectiveDate);
    const debits = items.map(i => parseFloat(i.debit || 0));
    const credits = items.map(i => parseFloat(i.credit || 0));
    const balances = items.map(i => parseFloat(i.balance || 0));
    const contents = items.map(i => i.content || '');
    const notes = items.map(i => i.note || '');

    await client.query('BEGIN');

    // Fast Batch Insert for T1
    await client.query(`
      INSERT INTO raw_bank_statements (id, transaction_date, effective_date, debit, credit, balance, content, note)
      SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[], $6::float8[], $7::text[], $8::text[])
      ON CONFLICT (id) DO NOTHING
    `, [ids, txDates, effDates, debits, credits, balances, contents, notes]);

    // For T2 processing, we still need to calculate classifications
    // To keep it simple but faster than individually inserting, we build arrays for T2 as well
    const tier2Classifications = items.map((item, idx) => {
      let classification = null;
      const content = (item.content || "").toLowerCase();
      const isCredit = credits[idx] > 0;

      // 1. Ưu tiên các quy tắc từ khóa trước (để loại trừ "Nộp tiền mặt", "Khác", v.v.)
      for (const rule of rules) {
        // Regex cho phép linh hoạt về khoảng trắng (ví dụ: "RUT  SEC" khớp "RUT SEC")
        const sanitizedKeyword = rule.keyword.toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexPattern = sanitizedKeyword.split(/\s+/).filter(Boolean).join('\\s+');
        if (new RegExp(regexPattern, 'i').test(content)) {
          classification = rule.category;
          break;
        }
      }

      // 2. Nếu không khớp quy tắc nào và là giao dịch THU TIỀN -> Mặc định là Bán hàng (SALE)
      // Bao gồm cả logic CCCD đã yêu cầu trước đó (vì CCCD cũng là thu tiền)
      if (!classification && isCredit) {
        classification = 'SALE';
      }
      
      return classification;
    });

    const tier2Methods = tier2Classifications.map(c => c ? 'MAPPING' : null);

    // Fast Batch Insert for T2
    await client.query(`
      INSERT INTO mapping_processed_data (id, transaction_date, effective_date, debit, credit, balance, content, note, classification, match_method)
      SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[], $6::float8[], $7::text[], $8::text[], $9::text[], $10::text[])
      ON CONFLICT (id) DO UPDATE SET 
        classification = COALESCE(mapping_processed_data.classification, EXCLUDED.classification),
        match_method = COALESCE(mapping_processed_data.match_method, EXCLUDED.match_method)
    `, [ids, txDates, effDates, debits, credits, balances, contents, notes, tier2Classifications, tier2Methods]);

    await client.query('COMMIT');
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    if (client) await client.query('ROLLBACK');
    console.error("[API] Bulk Import Error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// View Draft (Tier 2)
router.get("/api/mapping-processed-data", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM mapping_processed_data ORDER BY transaction_date DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manual Edit Draft (Tier 2)
router.patch("/api/mapping-processed-data/:id", async (req, res) => {
  const { classification } = req.body;
  try {
    await pool.query(
      'UPDATE mapping_processed_data SET classification = $1, match_method = $2 WHERE id = $3',
      [classification, 'MANUAL', req.params.id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// View Raw (Original) Statements
router.get("/api/raw-bank-statements", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM raw_bank_statements ORDER BY transaction_date DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/bank-mapping-rules", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bank_mapping_rules WHERE is_active = true ORDER BY keyword ASC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/bank-mapping-rules", async (req, res) => {
  const { keyword, category } = req.body;
  try {
    const resRule = await pool.query(
      'INSERT INTO bank_mapping_rules (keyword, category, is_active) VALUES ($1, $2, true) RETURNING id',
      [keyword, category]
    );
    res.json({ success: true, id: resRule.rows[0].id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/bank-mapping-rules/:id", async (req, res) => {
  try {
    await pool.query('DELETE FROM bank_mapping_rules WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Re-apply Mapping to T2 (For data already imported)
router.post("/api/bank-statements/re-map-draft", async (req, res) => {
  const client = await pool.connect();
  try {
    const rulesRes = await client.query('SELECT keyword, category FROM bank_mapping_rules WHERE is_active = true');
    const rules = rulesRes.rows;
    
    const draftRes = await client.query("SELECT * FROM mapping_processed_data WHERE match_method IS NULL OR match_method != 'MANUAL'");
    const items = draftRes.rows;

    await client.query('BEGIN');
    for (const item of items) {
      let classification = null;
      let method = null;

      const content = (item.content || "").toLowerCase();
      const isCredit = (parseFloat(item.credit) || 0) > 0;

      // 1. Check keyword rules first
      for (const rule of rules) {
        const sanitizedKeyword = rule.keyword.toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexPattern = sanitizedKeyword.split(/\s+/).filter(Boolean).join('\\s+');
        if (new RegExp(regexPattern, 'i').test(content)) {
          classification = rule.category;
          method = 'MAPPING';
          break;
        }
      }

      // 2. Default Credit to SALE if no rule matched
      if (!classification && isCredit) {
        classification = 'SALE';
        method = 'MAPPING';
      }

      if (classification) {
        await client.query(
          'UPDATE mapping_processed_data SET classification = $1, match_method = $2 WHERE id = $3',
          [classification, method, item.id]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Finalize: T2 -> T3 (AI for NULLs)
router.post("/api/bank-statements/finalize-ledger", async (req, res) => {
  const client = await pool.connect();
  try {
    const draftRes = await client.query('SELECT * FROM mapping_processed_data');
    const drafts = draftRes.rows;
    if (drafts.length === 0) return res.json({ count: 0, message: "Không có dữ liệu trong nháp" });

    const finalRecords: any[] = [];
    const aiPending: any[] = [];

    for (const d of drafts) {
      if (d.classification) {
        finalRecords.push({ ...d, method: d.match_method });
      } else {
        aiPending.push(d);
      }
    }

    if (aiPending.length > 0) {
      const batchSize = 30;
      for (let i = 0; i < aiPending.length; i += batchSize) {
        const chunk = aiPending.slice(i, i + batchSize);
        const prompt = `Phân loại ${chunk.length} giao dịch ngân hàng sau đây.
Nghiệp vụ: SALE, PURCHASE, CHI PHI VAN HANH, LUONG, THUE, CASH_WITHDRAWAL, CASH_DEPOSIT, KHAC.
JSON array: [{"id": "...", "classification": "...", "customerName": "...", "itemInfo": "..."}]
Dữ liệu:
${chunk.map(c => `ID: ${c.id} | Nội dung: ${c.content}`).join('\n')}`;

        try {
          const result = await ai.models.generateContent({
            model: "gemini-1.5-flash-latest",
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
          });
          const aiResults = JSON.parse(result.text.replace(/```json|```/g, '').trim());
          const resultMap = new Map(aiResults.map((r: any) => [r.id, r]));

          for (const item of chunk) {
            const aiData: any = resultMap.get(item.id) || {};
            finalRecords.push({
              ...item,
              classification: aiData.classification || 'KHAC',
              customer_name: aiData.customerName,
              item_info: aiData.itemInfo,
              method: 'AI'
            });
          }
        } catch (err) {
          console.error("AI Error:", err);
          for (const item of chunk) finalRecords.push({ ...item, classification: 'KHAC', method: 'AI-FAILED' });
        }
      }
    }

    await client.query('BEGIN');
    for (const item of finalRecords) {
      await client.query(
        `INSERT INTO final_bank_ledger (id, transaction_date, effective_date, debit, credit, balance, content, classification, customer_name, item_info, method, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET classification = EXCLUDED.classification, method = EXCLUDED.method`,
        [item.id, item.transaction_date, item.effective_date, item.debit, item.credit, item.balance, item.content, item.classification, item.customer_name, item.item_info, item.method, item.note]
      );
      await client.query('UPDATE raw_bank_statements SET processed = true WHERE id = $1', [item.id]);
    }
    await client.query('COMMIT');
    res.json({ success: true, count: finalRecords.length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/api/final-bank-ledger", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM final_bank_ledger ORDER BY transaction_date DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mounting the router at BOTH /api and / to handle different environment routing
app.use("/api", router);
app.use("/", router);

export default app;


