import React, { createContext, useContext, useEffect, useState } from 'react';
import { Product, Transaction, User, OpeningBalance, TransactionSource } from './types';
import { getYearMonth } from './lib/utils';

interface InventoryContextType {
  products: Product[];
  transactions: Transaction[];
  manualOpeningBalances: OpeningBalance[];
  closedMonths: string[]; // Format: MM-YYYY
  user: User | null;
  login: (username: string, pass: string) => boolean;
  logout: () => void;
  importTransactions: (newTransactions: Omit<Transaction, 'id'>[]) => void;
  deleteInvoice: (invoiceNumber: string) => void;
  calculateMonthlyCOGS: (month: number, year: number, sourceFilter?: TransactionSource) => Promise<{ success: boolean; message: string }>;
  setManualOpeningBalance: (balance: OpeningBalance) => void;
  lockMonth: (month: number, year: number) => void;
  unlockMonth: (month: number, year: number) => void;
  isMonthClosed: (date: string | Date) => boolean;
  resetData: () => void;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [manualOpeningBalances, setManualOpeningBalances] = useState<OpeningBalance[]>([]);
  const [closedMonths, setClosedMonths] = useState<string[]>([]);
  const [user, setUser] = useState<User | null>(null);

  // Load data from Backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [txRes, obRes] = await Promise.all([
          fetch('/api/transactions').then(r => r.json()),
          fetch('/api/opening-balances').then(r => r.json())
        ]);
        
        if (!Array.isArray(txRes) || !Array.isArray(obRes)) {
          const errorMsg = txRes.error || obRes.error || "Phản hồi từ server không hợp lệ";
          console.error("API Error:", errorMsg);
          return;
        }

        const mappedTxs = txRes.map((t: any) => ({
          ...t,
          itemCode: (t.item_code || t.itemCode || '').toString(),
          itemName: (t.item_name || t.itemName || '').toString(),
          invoiceNumber: (t.invoice_number || t.invoiceNumber || '').toString(),
          invoiceDate: (t.invoice_date || t.invoiceDate || '').toString(),
          customer: (t.customer || '').toString(),
          quantity: parseFloat(t.quantity || 0),
          price: parseFloat(t.price || 0),
          discount: parseFloat(t.discount || 0),
          total: parseFloat(t.total || 0),
          cogs: parseFloat(t.cogs || 0)
        }));

        const mappedOBs = obRes.map((ob: any) => ({
          itemCode: (ob.item_code || ob.itemCode || '').toString(),
          month: parseInt(ob.month || 0),
          year: parseInt(ob.year || 0),
          quantity: parseFloat(ob.quantity || 0),
          totalValue: parseFloat(ob.value || ob.totalValue || 0)
        }));

        setTransactions(mappedTxs);
        setManualOpeningBalances(mappedOBs);
        
        // Calculate products list from transactions
        const productMap = new Map<string, Product>();
        mappedTxs.forEach((item: Transaction) => {
          const code = item.itemCode.trim().toUpperCase();
          const existing = productMap.get(code);
          if (existing) {
            if (item.type === 'IN') existing.currentStock += item.quantity;
            else existing.currentStock -= item.quantity;
          } else {
            productMap.set(code, {
              code: code,
              name: item.itemName,
              unit: item.unit,
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
    const txToDelete = transactions.filter(t => t.invoiceNumber === invNum);
    if (txToDelete.length === 0) return;

    if (isMonthClosed(txToDelete[0].date, txToDelete[0].invoiceDate)) {
      alert("Không thể xóa hóa đơn thuộc tháng đã chốt sổ.");
      return;
    }

    try {
      const res = await fetch(`/api/invoices/${invNum}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      
      const remainingTxs = transactions.filter(t => t.invoiceNumber !== invNum);
      setTransactions(remainingTxs);

      // Recalculate stock
      const productMap = new Map<string, Product>();
      remainingTxs.forEach(item => {
        const code = item.itemCode.trim().toUpperCase();
        const existing = productMap.get(code);
        if (existing) {
          if (item.type === 'IN') existing.currentStock += item.quantity;
          else existing.currentStock -= item.quantity;
        } else {
          productMap.set(code, {
            code: code,
            name: item.itemName,
            unit: item.unit,
            currentStock: item.type === 'IN' ? item.quantity : -item.quantity,
            averageCost: 0
          });
        }
      });
      setProducts(Array.from(productMap.values()));
      alert(`Đã xóa hóa đơn ${invNum} thành công.`);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi xóa hóa đơn.");
    }
  };

  const importTransactions = async (newItems: Omit<Transaction, 'id'>[]) => {
    const keyedItems = newItems.map(item => ({ 
      ...item, 
      itemCode: item.itemCode.trim().toUpperCase(),
      id: Math.random().toString(36).substr(2, 9) 
    }));
    
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
        const code = item.itemCode; 
        const existing = productMap.get(code);
        if (existing) {
          if (item.type === 'IN') existing.currentStock += item.quantity;
          else existing.currentStock -= item.quantity;
        } else {
          productMap.set(code, {
            code: code,
            name: item.itemName,
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

  const setManualOpeningBalance = async (balance: OpeningBalance) => {
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

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      setManualOpeningBalances(prev => {
        const filtered = prev.filter(b => !(b.itemCode === balance.itemCode && b.month === balance.month && b.year === balance.year));
        return [...filtered, balance];
      });
    } catch (err) {
      console.error(err);
      alert("Lỗi khi lưu số dư đầu kỳ.");
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

  const calculateMonthlyCOGS = async (targetMonth: number, targetYear: number, sourceFilter?: TransactionSource) => {
    try {
      const txsWithDates = transactions.map(tx => ({
        ...tx,
        dateInfo: getYearMonth(tx.invoiceDate || tx.date)
      }));

      const targetMonthTxs = txsWithDates.filter(tx => 
        tx.dateInfo.month === targetMonth && tx.dateInfo.year === targetYear &&
        (!sourceFilter || tx.source === sourceFilter)
      );

      if (targetMonthTxs.length === 0) {
        return { success: false, message: `Tháng ${targetMonth + 1}/${targetYear} không có dữ liệu giao dịch${sourceFilter ? ` loại ${sourceFilter}` : ''}.` };
      }

      const itemCodesInMonth = Array.from(new Set(targetMonthTxs.map(t => t.itemCode))).filter(Boolean) as string[];
      const priceAssignmentMap: Record<string, number> = {};
      let warnNoPurchases = false;

      // For every item in the target month, we need to trace history month-by-month
      itemCodesInMonth.forEach(code => {
        // 1. Collect all history for this item
        const itemHistory = txsWithDates.filter(t => t.itemCode === code && (
          t.dateInfo.year < targetYear || (t.dateInfo.year === targetYear && t.dateInfo.month <= targetMonth)
        ) && (!sourceFilter || t.source === sourceFilter));
        const itemOBs = manualOpeningBalances.filter(b => b.itemCode === code && (
          b.year < targetYear || (b.year === targetYear && b.month <= targetMonth)
        ));

        if (itemHistory.length === 0 && itemOBs.length === 0) {
          priceAssignmentMap[code] = 0;
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
            priceAssignmentMap[code] = lastAvgPrice;
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
          const cost = priceAssignmentMap[tx.itemCode] || 0;
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
      let message = `Đã tính toán và gán giá vốn cho ${itemsToUpdate.length} dòng hàng trong tháng ${targetMonth + 1}/${targetYear}${sourceFilter ? ` (loại ${sourceFilter})` : ''}.`;
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

  return (
    <InventoryContext.Provider value={{ 
      products, 
      transactions, 
      manualOpeningBalances, 
      closedMonths,
      user, 
      login, 
      logout, 
      importTransactions, 
      calculateMonthlyCOGS, 
      setManualOpeningBalance,
      lockMonth,
      unlockMonth,
      isMonthClosed,
      deleteInvoice,
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
