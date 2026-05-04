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
    const d = new Date(invoiceDate || txDate);
    const key = `${d.getMonth() + 1}-${d.getFullYear()}`;
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

  const calculateMonthlyCOGS = async (targetMonth: number, targetYear: number) => {
    let warnNoPurchases = false;

    const prevMonth = targetMonth === 0 ? 11 : targetMonth - 1;
    const prevYear = targetMonth === 0 ? targetYear - 1 : targetYear;

    const getFinalStateAt = (code: string, month: number, year: number) => {
      const cutoffDate = new Date(year, month, 1);
      const priorTxs = transactions.filter(t => {
        const d = new Date(t.invoiceDate || t.date);
        return t.itemCode === code && d < cutoffDate;
      });
      
      let qty = 0;
      let totalValue = 0;
      let avgCost = 0;

      const manualOB = manualOpeningBalances.find(b => b.itemCode === code && b.month === month && b.year === year);
      
      if (manualOB) {
        qty = manualOB.quantity;
        totalValue = manualOB.totalValue;
        avgCost = qty > 0 ? totalValue / qty : 0;
      } else {
        priorTxs.sort((a,b) => {
          const dateA = new Date(a.invoiceDate || a.date).getTime();
          const dateB = new Date(b.invoiceDate || b.date).getTime();
          return dateA - dateB;
        }).forEach(t => {
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

    const targetMonthTxs = transactions.filter(tx => {
      const d = new Date(tx.invoiceDate || tx.date);
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
        avgCost = os.avgCost;
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

    const itemsToUpdate: Transaction[] = [];
    const newTransactions = transactions.map(tx => {
      const d = new Date(tx.invoiceDate || tx.date);
      if (tx.type === 'OUT' && d.getMonth() === targetMonth && d.getFullYear() === targetYear) {
        const cost = calculationMap[tx.itemCode]?.avgCost || 0;
        const updatedTx = { ...tx, cogs: cost * tx.quantity };
        itemsToUpdate.push(updatedTx);
        return updatedTx;
      }
      return tx;
    });

    try {
      // Save updated COGS to server
      if (itemsToUpdate.length > 0) {
        await fetch('/api/transactions/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsToUpdate })
        });
      }
      
      setTransactions(newTransactions);
      let message = `Đã tính toán xong giá vốn tháng ${targetMonth + 1}/${targetYear}.`;
      if (warnNoPurchases) {
        message += " Lưu ý: Một số mặt hàng không có giao dịch Nhập trong tháng, hệ thống đã áp dụng đơn giá tồn đầu kỳ.";
      }
      return { success: true, message };
    } catch (err) {
      console.error(err);
      return { success: false, message: "Lỗi khi lưu giá vốn lên server." };
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
