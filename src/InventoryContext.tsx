import React, { createContext, useContext, useEffect, useState } from 'react';
import { Product, Transaction, User, OpeningBalance } from './types';

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
  calculateMonthlyCOGS: (month: number, year: number) => { success: boolean; message: string };
  setManualOpeningBalance: (balance: OpeningBalance) => void;
  lockMonth: (month: number, year: number) => void;
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

  // Load data from LocalStorage
  useEffect(() => {
    const savedProducts = localStorage.getItem('inv_products');
    const savedTransactions = localStorage.getItem('inv_transactions');
    const savedManualOB = localStorage.getItem('inv_manual_ob');
    const savedClosed = localStorage.getItem('inv_closed_months');
    const savedUser = localStorage.getItem('inv_user');

    if (savedProducts) setProducts(JSON.parse(savedProducts));
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));
    if (savedManualOB) setManualOpeningBalances(JSON.parse(savedManualOB));
    if (savedClosed) setClosedMonths(JSON.parse(savedClosed));
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('inv_products', JSON.stringify(products));
    localStorage.setItem('inv_transactions', JSON.stringify(transactions));
    localStorage.setItem('inv_manual_ob', JSON.stringify(manualOpeningBalances));
    localStorage.setItem('inv_closed_months', JSON.stringify(closedMonths));
    if (user) {
      localStorage.setItem('inv_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('inv_user');
    }
  }, [products, transactions, user, manualOpeningBalances, closedMonths]);

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

  const isMonthClosed = (date: string | Date) => {
    const d = new Date(date);
    const key = `${d.getMonth() + 1}-${d.getFullYear()}`;
    return closedMonths.includes(key);
  };

  const deleteInvoice = (invNum: string) => {
    const txToDelete = transactions.filter(t => t.invoiceNumber === invNum);
    if (txToDelete.length === 0) return;

    if (isMonthClosed(txToDelete[0].date)) {
      alert("Không thể xóa hóa đơn thuộc tháng đã chốt sổ.");
      return;
    }

    const remainingTxs = transactions.filter(t => t.invoiceNumber !== invNum);
    setTransactions(remainingTxs);

    // Recalculate stock
    const productMap = new Map<string, Product>();
    remainingTxs.forEach(item => {
      const existing = productMap.get(item.itemCode);
      if (existing) {
        if (item.type === 'IN') existing.currentStock += item.quantity;
        else existing.currentStock -= item.quantity;
      } else {
        productMap.set(item.itemCode, {
          code: item.itemCode,
          name: item.itemName,
          unit: item.unit,
          currentStock: item.type === 'IN' ? item.quantity : -item.quantity,
          averageCost: 0
        });
      }
    });
    setProducts(Array.from(productMap.values()));
    alert(`Đã xóa hóa đơn ${invNum} thành công.`);
  };

  const importTransactions = (newItems: Omit<Transaction, 'id'>[]) => {
    const keyedItems = newItems.map(item => ({ ...item, id: Math.random().toString(36).substr(2, 9) }));
    const updatedTransactions = [...transactions, ...keyedItems];
    setTransactions(updatedTransactions);

    // Update products list
    const productMap = new Map<string, Product>();
    updatedTransactions.forEach(item => {
      const existing = productMap.get(item.itemCode);
      if (existing) {
        if (item.type === 'IN') existing.currentStock += item.quantity;
        else existing.currentStock -= item.quantity;
      } else {
        productMap.set(item.itemCode, {
          code: item.itemCode,
          name: item.itemName,
          unit: item.unit,
          currentStock: item.type === 'IN' ? item.quantity : -item.quantity,
          averageCost: 0
        });
      }
    });

    setProducts(Array.from(productMap.values()));
  };

  const setManualOpeningBalance = (balance: OpeningBalance) => {
    setManualOpeningBalances(prev => {
      const filtered = prev.filter(b => !(b.itemCode === balance.itemCode && b.month === balance.month && b.year === balance.year));
      return [...filtered, balance];
    });
  };

  const lockMonth = (month: number, year: number) => {
    const key = `${month + 1}-${year}`;
    if (!closedMonths.includes(key)) {
      setClosedMonths([...closedMonths, key]);
    }
  };

  const calculateMonthlyCOGS = (targetMonth: number, targetYear: number) => {
    let warnNoPurchases = false;

    // 1. Calculate Opening Balance for the target month
    // We look for manual OB if month-1 is not calculated, or we just calculate from month 0 to month-1
    const prevMonth = targetMonth === 0 ? 11 : targetMonth - 1;
    const prevYear = targetMonth === 0 ? targetYear - 1 : targetYear;

    // Helper: Get cumulative status of an item up to a point
    const getFinalStateAt = (code: string, month: number, year: number) => {
      const cutoffDate = new Date(year, month, 1);
      const priorTxs = transactions.filter(t => t.itemCode === code && new Date(t.date) < cutoffDate);
      
      let qty = 0;
      let totalValue = 0;
      let avgCost = 0;

      // Check if there is a manual opening balance for the "cutoffDate's month"
      // Actually, we check if there's a manual OB for the target month (the one we are calculating)
      const manualOB = manualOpeningBalances.find(b => b.itemCode === code && b.month === month && b.year === year);
      
      if (manualOB) {
        qty = manualOB.quantity;
        totalValue = manualOB.totalValue;
        avgCost = qty > 0 ? totalValue / qty : 0;
      } else {
        // If no manual OB, calculate from very beginning up to cutoff
        priorTxs.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(t => {
          if (t.type === 'IN') {
            totalValue += (t.quantity * t.price);
            qty += t.quantity;
            if (qty > 0) avgCost = totalValue / qty;
          } else {
            const consumed = (t.cogs || (avgCost * t.quantity));
            qty -= t.quantity;
            totalValue -= consumed;
          }
        });
      }
      return { qty, totalValue, avgCost };
    };

    // Monthly Logic
    const targetMonthTxs = transactions.filter(tx => {
      const d = new Date(tx.date);
      return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
    });

    if (targetMonthTxs.length === 0) {
      return { success: false, message: `Tháng ${targetMonth + 1}/${targetYear} không có dữ liệu giao dịch.` };
    }

    const itemCodesInMonth = Array.from(new Set(targetMonthTxs.map(t => t.itemCode))) as string[];
    const calculationMap: Record<string, { openingQty: number; openingValue: number; inQty: number; inValue: number; avgCost: number }> = {};

    itemCodesInMonth.forEach((code: string) => {
      const os = getFinalStateAt(code, targetMonth, targetYear);
      const itemsInMonth = targetMonthTxs.filter(t => t.itemCode === code && t.type === 'IN');
      
      const inQty = itemsInMonth.reduce((acc, curr) => acc + curr.quantity, 0);
      const inValue = itemsInMonth.reduce((acc, curr) => acc + (curr.quantity * curr.price), 0);

      const totalQty = os.qty + inQty;
      const totalValue = os.totalValue + inValue;
      
      let avgCost = 0;
      if (totalQty > 0) {
        avgCost = totalValue / totalQty;
      } else if (os.qty > 0) {
        avgCost = os.avgCost; // Fallback to opening if no new qty
      }

      if (itemsInMonth.length === 0 && inQty === 0 && os.qty > 0) {
        warnNoPurchases = true;
      }

      calculationMap[code] = {
        openingQty: os.qty,
        openingValue: os.totalValue,
        inQty,
        inValue,
        avgCost
      };
    });

    // Update cogs field for SALES in target month
    const newTransactions = transactions.map(tx => {
      const d = new Date(tx.date);
      if (tx.type === 'OUT' && d.getMonth() === targetMonth && d.getFullYear() === targetYear) {
        const cost = calculationMap[tx.itemCode]?.avgCost || 0;
        return { ...tx, cogs: cost * tx.quantity };
      }
      return tx;
    });

    setTransactions(newTransactions);

    let message = `Đã tính toán xong giá vốn tháng ${targetMonth + 1}/${targetYear}.`;
    if (warnNoPurchases) {
      message += " Lưu ý: Một số mặt hàng không có giao dịch Nhập trong tháng, hệ thống đã áp dụng đơn giá tồn đầu kỳ.";
    }

    return { success: true, message };
  };

  const resetData = () => {
    setProducts([]);
    setTransactions([]);
    setManualOpeningBalances([]);
    setClosedMonths([]);
    localStorage.clear();
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
