import React, { createContext, useContext, useEffect, useState } from 'react';
import { Product, Transaction, User, OpeningBalance, TransactionSource, BankStatement } from './types';
import { getYearMonth } from './lib/utils';

interface InventoryContextType {
  products: Product[];
  transactions: Transaction[];
  bankStatements: BankStatement[];
  rawBankStatements: any[];
  mappingDraft: any[];
  manualOpeningBalances: OpeningBalance[];
  closedMonths: string[]; // Format: MM-YYYY
  user: User | null;
  login: (username: string, pass: string) => boolean;
  logout: () => void;
  importTransactions: (newTransactions: Omit<Transaction, 'id'>[]) => void;
  importBankStatements: (newStatements: Omit<BankStatement, 'id'>[]) => Promise<void>;
  updateDraftClassification: (id: string, classification: string) => Promise<{ success: boolean }>;
  processTieredBankStatements: () => Promise<{ success: boolean; count: number; message?: string }>;
  deleteInvoice: (invoiceNumber: string) => void;
  calculateMonthlyCOGS: (month: number, year: number, sourceFilter?: TransactionSource, itemKeyFilter?: string) => Promise<{ success: boolean; message: string }>;
  getNXTReportData: (itemKey: string, year: number, quarter: number) => {
    month: number;
    monthLabel: string;
    itemName: string;
    opening: { qty: number; price: number; value: number };
    in: { qty: number; price: number; value: number };
    out: { qty: number; price: number; value: number };
    closing: { qty: number; price: number; value: number };
  }[];
  setManualOpeningBalance: (balance: OpeningBalance) => void;
  lockMonth: (month: number, year: number) => void;
  unlockMonth: (month: number, year: number) => void;
  isMonthClosed: (date: string | Date) => boolean;
  categorizeItem: (code: string, name: string) => string;
  resetData: () => void;
  deleteMultipleInvoices: (invoiceNumbers: string[]) => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bankStatements, setBankStatements] = useState<BankStatement[]>([]);
  const [rawBankStatements, setRawBankStatements] = useState<any[]>([]);
  const [mappingDraft, setMappingDraft] = useState<any[]>([]);
  const [manualOpeningBalances, setManualOpeningBalances] = useState<OpeningBalance[]>([]);
  const [closedMonths, setClosedMonths] = useState<string[]>([]);
  const [user, setUser] = useState<User | null>(null);

  const categorizeItem = (code: string, name: string): string => {
    const c = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const n = (name || '').toUpperCase();

    if (c.startsWith('V9999') || n.includes('9999')) return 'V9999';
    if (c.startsWith('V970') || n.includes('970')) return 'V970';
    if (c.startsWith('V610') || n.includes('610')) return 'V610';
    if (c.startsWith('VTS') || n.includes('TRANG SỨC')) return 'VTS';
    if (c.startsWith('TC') || n.includes('TIỀN CÔNG')) return 'TC';
    
    // Jewelry specific codes from common gold management software
    const vtsPrefixes = ['GB', 'GN', 'GL', 'GD', 'GV', 'GM', 'GA', 'GC', 'GX'];
    if (vtsPrefixes.some(p => c.startsWith(p))) return 'VTS';
    
    // Keywords for Jewelry
    const vtsKeywords = ['BÔNG', 'NHẪN', 'LẮC', 'DÂY', 'VÒNG', 'MẶT', 'ẢNH', 'CHÉO'];
    if (vtsKeywords.some(kw => n.includes(kw))) return 'VTS';
    
    return 'VK'; // Vàng khác
  };

  // Load data from Backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [txRes, obRes, bankRes, rawRes, draftRes] = await Promise.all([
          fetch('/api/transactions').then(r => r.json()),
          fetch('/api/opening-balances').then(r => r.json()),
          fetch('/api/final-bank-ledger').then(r => r.json()),
          fetch('/api/raw-bank-statements').then(r => r.json()),
          fetch('/api/mapping-processed-data').then(r => r.json())
        ]);
        
        if (!Array.isArray(txRes) || !Array.isArray(obRes)) {
          const errorMsg = (txRes && txRes.error) || (obRes && obRes.error) || "Phản hồi từ server không hợp lệ";
          console.error("API Error:", errorMsg);
          return;
        }

        const mappedTxs = txRes.map((t: any) => {
          let source = (t.source === 'REVENUE' ? 'REVENUE' : 'INVENTORY') as TransactionSource;
          
          const itemCode = (t.item_code || t.itemCode || t.product_id || 'KHONG-MA').toString().trim();
          const itemName = (t.item_name || t.itemName || t.product_name || itemCode).toString().trim();
          const category = t.category || categorizeItem(itemCode, itemName);
          
          // Enhanced date mapping: sales_app uses created_at, legacy uses date
          const rawDate = t.invoice_date || t.invoiceDate || t.date || t.created_at || '';
          const normalizedDate = rawDate.toString();

          return {
            ...t,
            id: t.id.toString(),
            type: (t.type || 'OUT').toUpperCase(),
            itemCode,
            itemName,
            category,
            invoiceNumber: (t.invoice_number || t.invoiceNumber || '').toString(),
            invoiceDate: normalizedDate,
            date: normalizedDate,
            customer: (t.customer || t.customer_name || 'Khách lẻ').toString(),
            customerCard: (t.customer_card || t.customer_cccd || t.customerCard || '').toString(),
            address: (t.address || t.dia_chi || '').toString(),
            note: (t.note || '').toString(),
            source,
            quantity: parseFloat(t.quantity || 0),
            price: parseFloat(t.price || t.price_per_unit || 0),
            discount: parseFloat(t.discount || t.chiet_khau || 0),
            total: parseFloat(t.total || t.total_amount || 0),
            cogs: parseFloat(t.cogs || 0)
          };
        });

        const mappedOBs = obRes.map((ob: any) => ({
          itemCode: (ob.item_code || ob.itemCode || '').toString(),
          itemName: (ob.item_name || ob.itemName || '').toString(),
          month: parseInt(ob.month || 0),
          year: parseInt(ob.year || 0),
          quantity: parseFloat(ob.quantity || 0),
          totalValue: parseFloat(ob.value || ob.totalValue || 0)
        }));

        const mappedBank = Array.isArray(bankRes) ? bankRes.map((b: any) => ({
          ...b,
          transactionDate: b.transaction_date || b.transactionDate,
          effectiveDate: b.effective_date || b.effectiveDate,
          customerName: b.customer_name || b.customerName,
          itemInfo: b.item_info || b.itemInfo,
          debit: parseFloat(b.debit || 0),
          credit: parseFloat(b.credit || 0),
          balance: parseFloat(b.balance || 0)
        })) : [];

        setTransactions(mappedTxs);
        setManualOpeningBalances(mappedOBs);
        setBankStatements(mappedBank);
        setRawBankStatements(Array.isArray(rawRes) ? rawRes : []);
        setMappingDraft(Array.isArray(draftRes) ? draftRes : []);
        
        // Calculate products list from transactions
        const productMap = new Map<string, Product>();
        mappedTxs.forEach((item: Transaction) => {
          const code = item.itemCode.trim().toUpperCase();
          const name = item.itemName.trim();
          
          // Skip brand name or placeholders that aren't actual products
          if (name.toUpperCase() === 'NGHIATINGOLD' || code === 'NGHIATINGOLD') return;

          // If code is missing, use name as the key
          const key = (code && code !== 'KHONG-MA') ? code : `NAME_${name.toLowerCase()}`;
          
          const existing = productMap.get(key);
          if (existing) {
            existing.category = item.category || categorizeItem(code, name);
            if (item.type === 'IN') existing.currentStock += item.quantity;
            else existing.currentStock -= item.quantity;
          } else {
            productMap.set(key, {
              key: key,
              code: (code && code !== 'KHONG-MA') ? code : 'KHONG-MA',
              name: name,
              unit: item.unit,
              category: item.category || categorizeItem(code, name),
              currentStock: item.type === 'IN' ? item.quantity : -item.quantity,
              averageCost: 0
            });
          }
        });
        setProducts(Array.from(productMap.values()));
      } catch (err) {
        console.error("Failed to fetch data:", err);
      }
    };

    fetchData();

    // Persistent User and Closed Months can stay in localStorage for now
    const savedClosed = localStorage.getItem('inv_closed_months');
    const savedUser = localStorage.getItem('inv_user');

    if (savedClosed) setClosedMonths(JSON.parse(savedClosed));
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  // Save meta to LocalStorage
  useEffect(() => {
    localStorage.setItem('inv_closed_months', JSON.stringify(closedMonths));
    if (user) {
      localStorage.setItem('inv_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('inv_user');
    }
  }, [user, closedMonths]);

  const login = (username: string, pass: string) => {
    if (username === 'admin' && pass === '220785') {
      setUser({ username });
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
  };

  const isMonthClosed = (txDate: string | Date, invoiceDate?: string) => {
    const { month, year } = getYearMonth(invoiceDate || txDate);
    if (month === -1) return false;
    const key = `${month + 1}-${year}`;
    return closedMonths.includes(key);
  };

  const deleteInvoice = async (invNum: string) => {
    await deleteMultipleInvoices([invNum]);
  };

  const deleteMultipleInvoices = async (invNums: string[]) => {
    if (invNums.length === 0) return;

    const txsToDelete = transactions.filter(t => invNums.includes(t.invoiceNumber || ''));
    if (txsToDelete.length === 0) return;

    // Check if any invoice is in a closed month
    const closedInvoices = txsToDelete.filter(t => isMonthClosed(t.date, t.invoiceDate));
    if (closedInvoices.length > 0) {
      alert(`Có ${closedInvoices.length} hóa đơn thuộc tháng đã chốt sổ. Vui lòng mở khóa trước khi xóa.`);
      return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa ${invNums.length} hóa đơn đã chọn?`)) return;

    // We assume all selected invoices come from the same source for simplicity in UI, 
    // but the context should handle them based on their actual source.
    // However, if they have mixed sources, we might need multiple calls or a smarter backend.
    // For now, let's group by source.
    const bySource: Record<string, string[]> = {};
    txsToDelete.forEach(t => {
      const src = t.source || 'INVENTORY';
      if (!bySource[src]) bySource[src] = [];
      if (!bySource[src].includes(t.invoiceNumber || '')) {
        bySource[src].push(t.invoiceNumber || '');
      }
    });

    try {
      for (const [source, numbers] of Object.entries(bySource)) {
        const res = await fetch('/api/invoices/bulk', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            source: source === 'REVENUE' ? 'REVENUE' : 'NGHIATINGOLD',
            invoiceNumbers: numbers
          })
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const remainingTxs = transactions.filter(t => !invNums.includes(t.invoiceNumber || ''));
      setTransactions(remainingTxs);

      // Recalculate products
      const productMap = new Map<string, Product>();
      remainingTxs.forEach(item => {
        const code = item.itemCode.trim().toUpperCase();
        const name = item.itemName.trim();
        const key = (code && code !== 'KHONG-MA') ? code : `NAME_${name.toLowerCase()}`;
        
        const existing = productMap.get(key);
        if (existing) {
          if (item.type === 'IN') existing.currentStock += item.quantity;
          else existing.currentStock -= item.quantity;
        } else {
          productMap.set(key, {
            key: key,
            code: (code && code !== 'KHONG-MA') ? code : 'KHONG-MA',
            name: name,
            unit: item.unit,
            category: item.category || categorizeItem(code, name),
            currentStock: item.type === 'IN' ? item.quantity : -item.quantity,
            averageCost: 0
          });
        }
      });
      setProducts(Array.from(productMap.values()));
      
      alert(`Đã xóa ${invNums.length} hóa đơn thành công.`);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi xóa hóa đơn.");
    }
  };

  const importTransactions = async (newItems: Omit<Transaction, 'id'>[]) => {
    const keyedItems = newItems.map(item => {
      let source = (item.source === 'REVENUE' ? 'REVENUE' : 'INVENTORY') as TransactionSource;
      
      return { 
        ...item, 
        source,
        itemCode: item.itemCode.trim().toUpperCase(),
        id: Math.random().toString(36).substr(2, 9) 
      };
    });
    
    try {
      const res = await fetch('/api/transactions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: keyedItems })
      });
      
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const updatedTransactions = [...transactions, ...keyedItems];
      setTransactions(updatedTransactions);

      // Update products list
      const productMap = new Map<string, Product>();
      updatedTransactions.forEach(item => {
        const code = item.itemCode.trim().toUpperCase();
        const name = item.itemName.trim();
        const key = (code && code !== 'KHONG-MA') ? code : `NAME_${name.toLowerCase()}`;
        
        const existing = productMap.get(key);
        if (existing) {
          if (item.type === 'IN') existing.currentStock += item.quantity;
          else existing.currentStock -= item.quantity;
        } else {
          productMap.set(key, {
            key: key,
            code: (code && code !== 'KHONG-MA') ? code : 'KHONG-MA',
            name: name,
            unit: item.unit,
            currentStock: item.type === 'IN' ? item.quantity : -item.quantity,
            averageCost: 0
          });
        }
      });
      setProducts(Array.from(productMap.values()));
    } catch (err) {
      console.error(err);
      alert("Lỗi khi lưu dữ liệu lên server. Vui lòng kiểm tra kết nối Database.");
    }
  };

  const importBankStatements = async (newItems: Omit<BankStatement, 'id'>[]) => {
    const keyedItems = newItems.map(item => ({ 
      ...item, 
      id: (item as any).id || `bank-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    }));
    
    try {
      const res = await fetch('/api/raw-statements/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: keyedItems })
      });
      
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      // Refresh raw statements and mapping draft
      const [rawRes, draftRes] = await Promise.all([
        fetch('/api/raw-bank-statements').then(r => r.json()),
        fetch('/api/mapping-processed-data').then(r => r.json())
      ]);
      setRawBankStatements(Array.isArray(rawRes) ? rawRes : []);
      setMappingDraft(Array.isArray(draftRes) ? draftRes : []);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi lưu sao kê ngân hàng (Bản nguyên gốc) lên server.");
    }
  };

  const updateDraftClassification = async (id: string, classification: string) => {
    try {
      const res = await fetch(`/api/mapping-processed-data/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classification })
      });
      if (!res.ok) throw new Error("Failed to update draft");
      
      setMappingDraft(prev => prev.map(d => d.id === id ? { ...d, classification, match_method: 'MANUAL' } : d));
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false };
    }
  };

  const processTieredBankStatements = async () => {
    try {
      const res = await fetch('/api/bank-statements/finalize-ledger', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi xử lý 3 tầng");
      
      // Refresh final ledger and other tables
      const [bankRes, draftRes, rawRes] = await Promise.all([
        fetch('/api/final-bank-ledger').then(r => r.json()),
        fetch('/api/mapping-processed-data').then(r => r.json()),
        fetch('/api/raw-bank-statements').then(r => r.json())
      ]);

      const mappedBank = Array.isArray(bankRes) ? bankRes.map((b: any) => ({
        ...b,
        transactionDate: b.transaction_date || b.transactionDate,
        effectiveDate: b.effective_date || b.effectiveDate,
        customerName: b.customer_name || b.customerName,
        itemInfo: b.item_info || b.itemInfo,
        debit: parseFloat(b.debit || 0),
        credit: parseFloat(b.credit || 0),
        balance: parseFloat(b.balance || 0)
      })) : [];
      setBankStatements(mappedBank);
      setMappingDraft(Array.isArray(draftRes) ? draftRes : []);
      setRawBankStatements(Array.isArray(rawRes) ? rawRes : []);
      
      return { success: true, count: data.count };
    } catch (err: any) {
      console.error(err);
      return { success: false, count: 0, message: err.message };
    }
  };

  const setManualOpeningBalance = async (balance: OpeningBalance): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch('/api/opening-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_code: balance.itemCode,
          month: balance.month,
          year: balance.year,
          quantity: balance.quantity,
          value: balance.totalValue
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP error! status: ${res.status}`);

      setManualOpeningBalances(prev => {
        const filtered = prev.filter(b => !(b.itemCode === balance.itemCode && b.month === balance.month && b.year === balance.year));
        return [...filtered, balance];
      });
      return { success: true };
    } catch (err: any) {
      console.error(err);
      return { success: false, message: err.message || "Lỗi khi lưu số dư đầu kỳ." };
    }
  };


  const lockMonth = (month: number, year: number) => {
    const key = `${month + 1}-${year}`;
    if (!closedMonths.includes(key)) {
      setClosedMonths([...closedMonths, key]);
    }
  };

  const unlockMonth = (month: number, year: number) => {
    const key = `${month + 1}-${year}`;
    setClosedMonths(closedMonths.filter(m => m !== key));
  };

  const calculateMonthlyCOGS = async (targetMonth: number, targetYear: number, sourceFilter?: TransactionSource, itemKeyFilter?: string, categoryFilter?: string) => {
    // 1. Build a name-to-code mapping to handle items missing codes in some transactions
    const nameToCodeMap: Record<string, string> = {};
    transactions.forEach(t => {
      if (t.itemName && t.itemCode && t.itemCode !== 'KHONG-MA') {
        const normalizedName = t.itemName.trim().toLowerCase();
        // Prefer the most frequent code if name has multiple? For now just take the first valid one
        if (!nameToCodeMap[normalizedName]) {
          nameToCodeMap[normalizedName] = t.itemCode;
        }
      }
    });

    const getItemKey = (t: any) => {
      const code = (t.itemCode || '').toString().trim().toUpperCase();
      const name = (t.itemName || '').toString().trim();
      
      // Strict exclusion: Only filter if it's ONLY the brand name and nothing else
      if (!name && (!code || code === 'KHONG-MA')) return 'UNKNOWN';
      if (name.toUpperCase() === 'NGHIATINGOLD' && (code === 'NGHIATINGOLD' || code === 'KHONG-MA' || !code)) return 'UNKNOWN';

      if (code && code !== 'KHONG-MA') return code;
      if (name) {
        const normalizedName = name.toLowerCase();
        return nameToCodeMap[normalizedName] || name;
      }
      return 'UNKNOWN';
    };

    try {
      const txsWithDates = transactions.map(tx => ({
        ...tx,
        dateInfo: getYearMonth(tx.invoiceDate || tx.date)
      }));

      // Define which source provides the purchase price info
      const priceHistorySource = 'INVENTORY';

      // Find transactions to process for the target month
      const targetMonthTxs = txsWithDates.filter(tx => 
        tx.dateInfo.month === targetMonth && 
        tx.dateInfo.year === targetYear &&
        (!sourceFilter || tx.source === sourceFilter) &&
        (!itemKeyFilter || getItemKey(tx) === itemKeyFilter) &&
        (!categoryFilter || tx.category === categoryFilter)
      );

      if (targetMonthTxs.length === 0) {
        const totalInMonthAnyCategory = txsWithDates.filter(tx => 
          tx.dateInfo.month === targetMonth && 
          tx.dateInfo.year === targetYear && 
          (!itemKeyFilter || getItemKey(tx) === itemKeyFilter) &&
          (!categoryFilter || tx.category === categoryFilter)
        ).length;
        let label = sourceFilter === 'REVENUE' ? 'Dữ liệu Doanh thu & Tiền công' : 'Dữ liệu Quản lý hàng hóa';
        if (itemKeyFilter) label += ` (mặt hàng ${itemKeyFilter})`;
        if (categoryFilter) label += ` (nhóm ${categoryFilter})`;
        
        let detail = `Tháng ${targetMonth + 1}/${targetYear} không có dữ liệu giao dịch ${label}.`;
        
        if (totalInMonthAnyCategory > 0) {
          detail += `\n(GHI CHÚ: Tìm thấy ${totalInMonthAnyCategory} giao dịch trong tháng này từ nguồn khác. Hãy kiểm tra lại "Loại nguồn dữ liệu" hoặc "Mặt hàng cụ thể" bạn chọn).`;
        } else {
          detail += `\n(Không tìm thấy bất kỳ giao dịch nào trong tháng ${targetMonth + 1}/${targetYear} trên toàn hệ thống cho mặt hàng đã chọn).`;
        }
        return { success: false, message: detail };
      }

      const itemKeysInMonth = Array.from(new Set(targetMonthTxs.map(t => getItemKey(t)))).filter(k => k !== 'UNKNOWN') as string[];
      const priceAssignmentMap: Record<string, number> = {};
      let warnNoPurchases = false;

      // For every item in the target month, trace history using ALL sources for prices
      itemKeysInMonth.forEach(key => {
        // We look for price history in ALL sources to find 'IN' (Purchases)
        const itemHistory = txsWithDates.filter(t => getItemKey(t) === key && (
          t.dateInfo.year < targetYear || (t.dateInfo.year === targetYear && t.dateInfo.month <= targetMonth)
        ));
        
        const itemOBs = manualOpeningBalances.filter(b => {
          const obKey = (b.itemCode && b.itemCode !== 'KHONG-MA') ? b.itemCode : (b.itemName ? (nameToCodeMap[b.itemName.trim().toLowerCase()] || b.itemName) : '');
          return obKey === key && (
            b.year < targetYear || (b.year === targetYear && b.month <= targetMonth)
          );
        });

        if (itemHistory.length === 0 && itemOBs.length === 0) {
          priceAssignmentMap[key] = 0;
          return;
        }

        // 2. Identify the range of months to process
        let startYear = targetYear;
        let startMonth = targetMonth;
        
        itemHistory.forEach(t => {
          if (t.dateInfo.year < startYear || (t.dateInfo.year === startYear && t.dateInfo.month < startMonth)) {
            startYear = t.dateInfo.year;
            startMonth = t.dateInfo.month;
          }
        });
        itemOBs.forEach(b => {
          if (b.year < startYear || (b.year === startYear && b.month < startMonth)) {
            startYear = b.year;
            startMonth = b.month;
          }
        });

        // 3. Generate sequential month list
        const periods: { month: number, year: number }[] = [];
        let currY = startYear;
        let currM = startMonth;
        while (currY < targetYear || (currY === targetYear && currM <= targetMonth)) {
          periods.push({ month: currM, year: currY });
          currM++;
          if (currM > 11) {
            currM = 0;
            currY++;
          }
        }

        // 4. Sequential computation
        let currentQty = 0;
        let currentValue = 0;
        let lastAvgPrice = 0;

        periods.forEach(p => {
          // Check for manual OB override for THIS specific period
          const manualOB = itemOBs.find(b => b.month === p.month && b.year === p.year);
          if (manualOB) {
            currentQty = manualOB.quantity;
            currentValue = manualOB.totalValue;
          }

          const inTxs = itemHistory.filter(t => t.dateInfo.month === p.month && t.dateInfo.year === p.year && t.type === 'IN');
          const outTxs = itemHistory.filter(t => t.dateInfo.month === p.month && t.dateInfo.year === p.year && t.type === 'OUT');
          
          const inTotalQty = inTxs.reduce((sum, t) => sum + t.quantity, 0);
          const inTotalValue = inTxs.reduce((sum, t) => sum + (t.quantity * t.price), 0);
          const outTotalQty = outTxs.reduce((sum, t) => sum + t.quantity, 0);

          if (currentQty + inTotalQty > 0) {
            lastAvgPrice = (currentValue + inTotalValue) / (currentQty + inTotalQty);
          } 
          
          if (p.year === targetYear && p.month === targetMonth) {
            priceAssignmentMap[key] = lastAvgPrice;
            if (inTotalQty === 0 && outTotalQty > 0 && currentQty > 0) {
              warnNoPurchases = true;
            }
          }

          // Update state for next period
          currentQty = Math.max(0, currentQty + inTotalQty - outTotalQty);
          currentValue = currentQty * lastAvgPrice;
        });
      });

      // 5. Apply results and Save
      const itemsToUpdate: Transaction[] = [];
      const newTransactions = transactions.map(tx => {
        const { month: m, year: y } = getYearMonth(tx.invoiceDate || tx.date);
        const matchesSource = !sourceFilter || tx.source === sourceFilter;
        if (tx.type === 'OUT' && m === targetMonth && y === targetYear && matchesSource) {
          const key = getItemKey(tx);
          const cost = priceAssignmentMap[key] || 0;
          const updatedTx = { ...tx, cogs: cost * tx.quantity };
          itemsToUpdate.push(updatedTx);
          return updatedTx;
        }
        return tx;
      });

      if (itemsToUpdate.length === 0) {
        return { success: true, message: `Tháng ${targetMonth + 1}/${targetYear} không có hóa đơn bán ra để gán giá vốn.` };
      }

      const res = await fetch('/api/transactions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToUpdate })
      });
      
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      setTransactions(newTransactions);
      let label = sourceFilter === 'REVENUE' ? 'Doanh thu & Tiền công' : 'Quản lý hàng hóa';
      let message = `Đã tính toán và gán giá vốn cho ${itemsToUpdate.length} dòng hàng trong tháng ${targetMonth + 1}/${targetYear}${sourceFilter ? ` (${label})` : ''}.`;
      if (warnNoPurchases) {
        message += " Lưu ý: Một số mặt hàng không có giao dịch Nhập trong tháng, hệ thống đã áp dụng đơn giá từ kỳ trước.";
      }
      return { success: true, message };

    } catch (err) {
      console.error("Calculation Error:", err);
      return { success: false, message: `Lỗi trong quá trình tính toán: ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  const resetData = async () => {
    if (!confirm("Bạn có chắc chắn muốn xóa TOÀN BỘ dữ liệu trên server?")) return;
    try {
      await fetch('/api/reset', { method: 'POST' });
      setProducts([]);
      setTransactions([]);
      setManualOpeningBalances([]);
      setClosedMonths([]);
      localStorage.removeItem('inv_closed_months');
    } catch (err) {
      console.error(err);
      alert("Lỗi khi reset dữ liệu.");
    }
  };

  const getNXTReportData = (itemKey: string, year: number, quarter: number) => {
    const months = [ (quarter - 1) * 3, (quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2 ];
    const report: any[] = [];
    
    const nameToCodeMap: Record<string, string> = {};
    transactions.forEach(t => {
      if (t.itemName && t.itemCode && t.itemCode !== 'KHONG-MA') {
        const normalizedName = t.itemName.trim().toLowerCase();
        if (!nameToCodeMap[normalizedName]) nameToCodeMap[normalizedName] = t.itemCode;
      }
    });

    const getItemKey = (t: any) => {
      let code = (t.itemCode || '').toString().trim().toUpperCase();
      const name = (t.itemName || '').toString().trim();
      
      // Standardize 9999 and 999.9
      if (code === 'V999.9' || code === '999.9') code = 'V9999';

      // If we have a code, try to find a matching product by code or by key
      if (code && code !== 'KHONG-MA') {
        const pByCode = products.find(p => p.code === code || p.key === code);
        if (pByCode) return pByCode.key;
        
        // Final fallback for standardized code
        if (code === 'V9999') {
           const p99 = products.find(p => p.code === 'V9999' || p.key === 'V9999' || p.name.includes('9999') || p.name.includes('999.9'));
           if (p99) return p99.key;
        }
        return code;
      }
      
      // If no code, try to match by name
      if (name) {
        // Unify name patterns for 9999
        if (name.includes('999.9') || name.includes('9999')) {
           const p99 = products.find(p => p.key === 'V9999' || p.code === 'V9999' || p.name.includes('9999') || p.name.includes('999.9'));
           if (p99) return p99.key;
        }

        const pByName = products.find(p => p.name.toLowerCase() === name.toLowerCase() || p.key.toLowerCase() === name.toLowerCase());
        if (pByName) return pByName.key;
        return nameToCodeMap[name.toLowerCase()] || name;
      }
      return 'UNKNOWN';
    };

    const targetProduct = products.find(p => p.key === itemKey);
    const itemName = targetProduct ? targetProduct.name : itemKey;

    const txsWithDates = transactions.map(tx => ({
      ...tx,
      dateInfo: getYearMonth(tx.invoiceDate || tx.date)
    }));

    // Find the very first period relevant to this item
    let firstY = year;
    let firstM = months[0];
    txsWithDates.forEach(t => {
      if (getItemKey(t) === itemKey) {
        if (t.dateInfo.year < firstY || (t.dateInfo.year === firstY && t.dateInfo.month < firstM)) {
          firstY = t.dateInfo.year;
          firstM = t.dateInfo.month;
        }
      }
    });
    manualOpeningBalances.forEach(b => {
      const bKey = (b.itemCode && b.itemCode !== 'KHONG-MA') ? b.itemCode : (b.itemName ? (nameToCodeMap[b.itemName.trim().toLowerCase()] || b.itemName) : '');
      if (bKey === itemKey) {
        if (b.year < firstY || (b.year === firstY && b.month < firstM)) {
          firstY = b.year;
          firstM = b.month;
        }
      }
    });

    // Run calculation from the beginning of time until the end of the quarter
    let currentQty = 0;
    let currentValue = 0;
    let lastAvgPrice = 0;

    let currY = firstY;
    let currM = firstM;
    const endMonth = months[2];
    const endYear = year;

    while (currY < endYear || (currY === endYear && currM <= endMonth)) {
      const manualOB = manualOpeningBalances.find(b => {
        const bKey = (b.itemCode && b.itemCode !== 'KHONG-MA') ? b.itemCode : (b.itemName ? (nameToCodeMap[b.itemName.trim().toLowerCase()] || b.itemName) : '');
        return bKey === itemKey && b.month === currM && b.year === currY;
      });

      if (manualOB) {
        currentQty = manualOB.quantity;
        currentValue = manualOB.totalValue;
        lastAvgPrice = currentQty > 0 ? currentValue / currentQty : lastAvgPrice;
      }

      const opQty = currentQty;
      const opVal = currentValue;
      const opPrice = lastAvgPrice;

      const inTxs = txsWithDates.filter(t => getItemKey(t) === itemKey && t.dateInfo.month === currM && t.dateInfo.year === currY && t.type === 'IN');
      const outTxs = txsWithDates.filter(t => getItemKey(t) === itemKey && t.dateInfo.month === currM && t.dateInfo.year === currY && t.type === 'OUT');

      const inQty = inTxs.reduce((sum, t) => sum + t.quantity, 0);
      const inVal = inTxs.reduce((sum, t) => sum + (t.quantity * t.price), 0);
      const outQty = outTxs.reduce((sum, t) => sum + t.quantity, 0);

      if (currentQty + inQty > 0) {
        lastAvgPrice = (currentValue + inVal) / (currentQty + inQty);
      }

      const outVal = outQty * lastAvgPrice;
      
      currentQty = Math.max(0, currentQty + inQty - outQty);
      currentValue = currentQty * lastAvgPrice;

      if (months.includes(currM) && currY === year) {
        report.push({
          month: currM,
          monthLabel: `Tháng ${currM + 1}`,
          itemName,
          opening: { qty: opQty, price: opPrice, value: opVal },
          in: { qty: inQty, price: inQty > 0 ? inVal / inQty : 0, value: inVal },
          out: { qty: outQty, price: lastAvgPrice, value: outVal },
          closing: { qty: currentQty, price: lastAvgPrice, value: currentValue }
        });
      }

      currM++;
      if (currM > 11) {
        currM = 0;
        currY++;
      }
    }

    return report;
  };

  return (
    <InventoryContext.Provider value={{ 
      products, 
      transactions, 
      bankStatements,
      rawBankStatements,
      mappingDraft,
      manualOpeningBalances, 
      closedMonths,
      user, 
      login, 
      logout, 
      importTransactions, 
      importBankStatements,
      updateDraftClassification,
      processTieredBankStatements,
      deleteInvoice,
      calculateMonthlyCOGS, 
      getNXTReportData,
      setManualOpeningBalance,
      lockMonth,
      unlockMonth,
      isMonthClosed,
      deleteMultipleInvoices,
      resetData 
    }}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) throw new Error('useInventory must be used within InventoryProvider');
  return context;
};
