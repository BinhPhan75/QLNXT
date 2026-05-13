import React, { useState, useMemo } from 'react';
import { useInventory } from '../InventoryContext';
import { formatCurrency, formatDate, getYearMonth, formatQuantity } from '../lib/utils';
import { Search, Filter, Download, Calendar, Trash2, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ReportsProps {
  mode: 'REVENUE' | 'INVENTORY';
}

export default function Reports({ mode }: ReportsProps) {
  const { transactions, deleteInvoice, deleteMultipleInvoices, user, products } = useInventory();
  
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  
  // Filter transactions based on source
  const sourceFilteredTransactions = useMemo(() => {
    return transactions.filter(t => t.source === mode);
  }, [transactions, mode]);

  const [reportType, setReportType] = useState<'BUY' | 'SELL' | 'STOCK'>(mode === 'REVENUE' ? 'SELL' : 'STOCK');
  const [viewMode, setViewMode] = useState<'TRANSACTION' | 'INVOICE'>('TRANSACTION');
  const [searchTerm, setSearchTerm] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>('ALL');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  const parseItemDate = (dateStr: string) => {
    if (!dateStr) return 0;
    
    // Normalize string: remove time if present, replace common separators
    const cleanDate = dateStr.toString().split(' ')[0].split('T')[0];
    const parts = cleanDate.split(/[-/.]/);

    if (parts.length === 3) {
      if (parts[0].length === 4) { // YYYY-MM-DD
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getTime();
      } else if (parts[2].length === 4 || parts[2].length === 2) { // DD/MM/YYYY or DD/MM/YY
        let year = parseInt(parts[2]);
        if (parts[2].length === 2) year = (year > 50 ? 1900 : 2000) + year;
        return new Date(year, parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
      }
    }
    
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };
  
  const [expandedRevenueKey, setExpandedRevenueKey] = useState<string | null>(null);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const filteredData = useMemo(() => {
    return sourceFilteredTransactions.filter(tx => {
      const isType = reportType === 'BUY' ? tx.type === 'IN' : tx.type === 'OUT';
      if (reportType !== 'STOCK' && !isType) return false;

      // Date filtering
      if (startDate || endDate) {
        const itemTime = parseItemDate(tx.invoiceDate || tx.date);
        if (startDate) {
          const start = new Date(startDate).setHours(0,0,0,0);
          if (itemTime < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate).setHours(23,59,59,999);
          if (itemTime > end) return false;
        }
      } else {
        const { month, year } = getYearMonth(tx.invoiceDate || tx.date);
        if (year !== selectedYear) return false;
        if (selectedMonth !== 'ALL' && month !== selectedMonth) return false;
      }

      const matchesSearch = (tx.itemName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (tx.itemCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (tx.invoiceNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (tx.customer || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCustomer = !customerFilter || tx.customer === customerFilter;

      return matchesSearch && matchesCustomer;
    });
  }, [sourceFilteredTransactions, reportType, searchTerm, customerFilter, selectedMonth, selectedYear, startDate, endDate]);

  // Specialized Revenue Grouping
  const revenueRows = useMemo(() => {
    if (mode !== 'REVENUE' || reportType !== 'SELL') return [];

    const invoiceGroups = new Map<string, any[]>();

    filteredData.forEach(tx => {
      const key = `${tx.invoiceNumber}_${tx.invoiceDate}_${tx.customer}`;
      const existing = invoiceGroups.get(key) || [];
      existing.push(tx);
      invoiceGroups.set(key, existing);
    });

    const rows: any[] = [];

    invoiceGroups.forEach((items, key) => {
      let laborTotal = 0;
      let discountTotal = 0;
      const mainItems: any[] = [];

      items.forEach(item => {
        const nameLower = (item.itemName || '').toLowerCase();
        const isLabor = nameLower.includes('công') || nameLower.includes('gia công');
        const isDiscount = nameLower.includes('chiết khấu') || nameLower.includes('giảm giá');

        if (isLabor) {
          laborTotal += item.total;
        } else if (isDiscount) {
          discountTotal += Math.abs(item.total);
        } else {
          mainItems.push(item);
        }
      });

      // If no main items, create a placeholder for labor/discount only invoices
      if (mainItems.length === 0 && (laborTotal > 0 || discountTotal > 0)) {
        const first = items[0];
        rows.push({
          key: `${key}_fees`,
          invoiceNumber: first.invoiceNumber,
          invoiceDate: first.invoiceDate || first.date,
          customer: first.customer,
          customerCard: first.customerCard || (first as any).cccd,
          address: first.address,
          displayName: 'Dịch vụ / Phí khác',
          quantity: 0,
          avgPrice: 0,
          itemTotal: 0,
          laborTotal,
          discountTotal,
          finalTotal: laborTotal - discountTotal,
          details: items
        });
      } else {
        // Create a row for each main product item
        mainItems.forEach((item, index) => {
          const isFirstItem = index === 0;
          const rowLabor = isFirstItem ? laborTotal : 0;
          const rowDiscount = isFirstItem ? discountTotal : 0;
          
          rows.push({
            key: `${key}_${item.id}`,
            invoiceNumber: item.invoiceNumber,
            invoiceDate: item.invoiceDate || item.date,
            customer: item.customer,
            customerCard: item.customerCard || (item as any).cccd,
            address: item.address,
            displayName: item.itemName,
            quantity: item.quantity,
            avgPrice: item.price,
            itemTotal: item.total,
            laborTotal: rowLabor,
            discountTotal: rowDiscount,
            finalTotal: item.total + rowLabor - rowDiscount,
            details: isFirstItem ? items : [item] // Show full invoice details on first row if expanded
          });
        });
      }
    });

    return rows;
  }, [filteredData, mode, reportType]);

  const filteredDataDisplay = useMemo(() => {
    if (mode === 'REVENUE' && reportType === 'SELL' && viewMode === 'TRANSACTION') {
      return revenueRows;
    }
    return filteredData;
  }, [filteredData, revenueRows, mode, reportType, viewMode]);

  const filteredProducts = useMemo(() => {
    // For STOCK report, calculate stock as of the end of selected period
    if (reportType === 'STOCK') {
      const cutOffMonth = selectedMonth === 'ALL' ? 11 : selectedMonth;
      const cutOffYear = selectedYear;

      const productMap = new Map<string, any>();
      
      transactions.forEach(tx => {
        const { month, year } = getYearMonth(tx.invoiceDate || tx.date);
        
        // Filter: everything before this year OR same year but before/in target month
        const isBeforeOrIn = year < cutOffYear || (year === cutOffYear && (selectedMonth === 'ALL' || month <= selectedMonth));
        if (!isBeforeOrIn) return;

        const code = (tx.itemCode || 'KHONG-MA').trim().toUpperCase();
        const name = (tx.itemName || 'Hàng hóa').trim();
        
        // Skip brand names or non-products
        if (name.toUpperCase() === 'NGHIATINGOLD' || code === 'NGHIATINGOLD') return;
        
        const key = (code && code !== 'KHONG-MA') ? code : `NAME_${name.toLowerCase()}`;
        
        const existing = productMap.get(key);
        if (existing) {
          if (tx.type === 'IN') existing.currentStock += tx.quantity;
          else existing.currentStock -= tx.quantity;
          // Weighted average cost (simplistic)
          if (tx.type === 'IN' && tx.price > 0) {
            existing.averageCost = (existing.averageCost + tx.price) / 2;
          }
        } else {
          productMap.set(key, {
            code: (code && code !== 'KHONG-MA') ? code : 'KHONG-MA',
            name,
            unit: tx.unit,
            currentStock: tx.type === 'IN' ? tx.quantity : -tx.quantity,
            averageCost: tx.price || 0
          });
        }
      });

      return Array.from(productMap.values()).filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return products.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, transactions, reportType, selectedMonth, selectedYear, searchTerm]);

  const invoices = useMemo(() => {
    const invMap = new Map<string, { id: string, date: string, customer: string, total: number, items: number, number: string, details: any[] }>();
    
    filteredData.forEach(tx => {
      const key = tx.invoiceNumber || (tx as any).invoice_number || 'NO-NUM';
      const existing = invMap.get(key);
      if (existing) {
        existing.total += tx.total;
        existing.items += 1;
        existing.details.push(tx);
      } else {
        invMap.set(key, {
          id: tx.id,
          number: key,
          date: tx.invoiceDate || tx.date,
          customer: tx.customer,
          total: tx.total,
          items: 1,
          details: [tx]
        });
      }
    });
    return Array.from(invMap.values());
  }, [filteredData]);

  // Pagination Logic
  const dataToPaginate = reportType === 'STOCK' 
    ? filteredProducts 
    : (viewMode === 'TRANSACTION' ? filteredDataDisplay : invoices);

  const totalPages = Math.ceil(dataToPaginate.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;

  const paginatedData = filteredDataDisplay.slice(startIndex, startIndex + pageSize);
  const paginatedInvoices = invoices.slice(startIndex, startIndex + pageSize);
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + pageSize);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleExport = () => {
    let exportData: any[] = [];
    let dateRangeStr = selectedMonth !== 'ALL' ? (selectedMonth + 1).toString() : 'Ca_nam';
    if (startDate || endDate) {
      dateRangeStr = `${startDate || 'Start'}_to_${endDate || 'End'}`;
    }
    let filename = `Bao_Cao_${mode}_${reportType}_${dateRangeStr}_${selectedYear}.xlsx`;

    if (mode === 'REVENUE' && reportType === 'SELL' && viewMode === 'TRANSACTION') {
      // Export revenue-grouped data
      exportData = revenueRows.map(row => ({
        'Ngày HĐ': formatDate(row.invoiceDate),
        'Số HĐ': row.invoiceNumber,
        'Khách hàng': row.customer,
        'CCCD': row.customerCard || '',
        'Địa chỉ': row.address || '',
        'Mặt hàng': row.displayName,
        'Số lượng': row.quantity,
        'Đơn giá TB': row.avgPrice,
        'Thành tiền hàng': row.itemTotal,
        'Tiền công': row.laborTotal,
        'Chiết khấu': row.discountTotal,
        'Tổng cộng sau CK': row.finalTotal
      }));
    } else if (reportType === 'STOCK') {
      exportData = filteredProducts.map(p => ({
        'Mã hàng': p.code,
        'Tên hàng': p.name,
        'ĐVT': p.unit,
        'Tồn kho': p.currentStock,
        'Giá vốn BQ': p.averageCost,
        'Tổng giá trị tồn': p.currentStock * p.averageCost
      }));
    } else {
      // Standard transaction export
      exportData = filteredData.map(tx => ({
        'Ngày HĐ': tx.invoiceDate ? formatDate(tx.invoiceDate) : '',
        'Ngày Import': formatDate(tx.date),
        'Số HĐ': tx.invoiceNumber || '',
        'Mã hàng': tx.itemCode,
        'Tên hàng': tx.itemName,
        'Loại': tx.type === 'IN' ? 'NHẬP' : 'XUẤT',
        'Khách hàng': tx.customer,
        'Số lượng': tx.quantity,
        'Đơn giá': tx.price,
        'Thành tiền': tx.total,
        'Giá vốn': tx.cogs || 0,
        'Lợi nhuận': tx.cogs ? (tx.total - tx.cogs) : 0
      }));
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, filename);
  };

  const customers = useMemo(() => {
    const set = new Set<string>();
    sourceFilteredTransactions.forEach(tx => {
      if ((reportType === 'BUY' && tx.type === 'IN') || (reportType === 'SELL' && tx.type === 'OUT')) {
        set.add(tx.customer);
      }
    });
    return Array.from(set);
  }, [sourceFilteredTransactions, reportType]);

  const totals = useMemo(() => {
    if (reportType === 'STOCK') {
      return filteredProducts.reduce((acc, curr) => ({
        qty: acc.qty + curr.currentStock,
        total: acc.total + (curr.currentStock * curr.averageCost),
        cogs: 0
      }), { qty: 0, total: 0, cogs: 0 });
    }
    
    // For Revenue reports, sum the final totals (including fees/discounts) from the grouped view
    if (mode === 'REVENUE' && reportType === 'SELL' && viewMode === 'TRANSACTION') {
      return revenueRows.reduce((acc, curr) => ({
        qty: acc.qty + (curr.quantity || 0),
        total: acc.total + (curr.finalTotal || 0),
        cogs: acc.cogs + (curr.cogs || 0)
      }), { qty: 0, total: 0, cogs: 0 });
    }

    return filteredData.reduce((acc, curr) => ({
      qty: acc.qty + curr.quantity,
      total: acc.total + curr.total,
      cogs: acc.cogs + (curr.cogs || 0)
    }), { qty: 0, total: 0, cogs: 0 });
  }, [filteredData, filteredProducts, reportType, mode, viewMode, revenueRows]);

  const debugStats = useMemo(() => {
    const totalCount = transactions.length;
    const invCount = transactions.filter(t => t.source === 'INVENTORY').length;
    const revCount = transactions.filter(t => t.source === 'REVENUE').length;
    const inCount = sourceFilteredTransactions.filter(t => t.type === 'IN').length;
    const outCount = sourceFilteredTransactions.filter(t => t.type === 'OUT').length;
    
    // Check for future/past months
    const dateCounts = new Map<string, number>();
    sourceFilteredTransactions.forEach(t => {
      const { month, year } = getYearMonth(t.invoiceDate || t.date);
      const key = `${month + 1}/${year}`;
      dateCounts.set(key, (dateCounts.get(key) || 0) + 1);
    });

    return { totalCount, invCount, revCount, inCount, outCount, dateCounts };
  }, [transactions, sourceFilteredTransactions]);

  const handleDeleteInvoice = (invNum: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa toàn bộ hóa đơn số ${invNum}? Hành động này sẽ xóa tất cả các dòng hàng đi kèm.`)) {
      deleteInvoice(invNum);
    }
  };

  const handleBulkDelete = () => {
    if (selectedInvoices.length === 0) return;
    deleteMultipleInvoices(selectedInvoices).then(() => {
      setSelectedInvoices([]);
    });
  };

  const toggleSelectInvoice = (invNum: string) => {
    setSelectedInvoices(prev => 
      prev.includes(invNum) 
        ? prev.filter(n => n !== invNum) 
        : [...prev, invNum]
    );
  };

  const toggleSelectAll = (visibleInvoices: string[]) => {
    if (selectedInvoices.length === visibleInvoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(visibleInvoices);
    }
  };

  const currentVisibleInvoiceNumbers = useMemo(() => {
    return Array.from(new Set(filteredData.map(tx => tx.invoiceNumber || (tx as any).invoice_number))).filter(n => !!n);
  }, [filteredData]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-luxury-black font-serif tracking-tight">
            {reportType === 'BUY' ? 'Báo cáo Mua hàng' : reportType === 'SELL' ? (mode === 'REVENUE' ? 'Doanh thu & Tiền công' : 'Báo cáo Bán hàng') : (reportType === 'STOCK' ? 'Tồn kho thực tế' : 'Quản lý hàng hóa')}
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            {mode === 'REVENUE' ? 'Phân tích hiệu quả kinh doanh & dịch vụ chế tác' : 'Kiểm soát dòng hàng 24k, 18k, Trang sức & Kim loại quý'}
          </p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex p-1 bg-zinc-100 rounded-xl">
            {mode === 'INVENTORY' && (
              <button 
                onClick={() => setReportType('BUY')}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${reportType === 'BUY' ? 'bg-white text-gold-600 shadow-sm' : 'text-zinc-500'}`}
              >
                Mua vào
              </button>
            )}
            <button 
              onClick={() => setReportType('SELL')}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${reportType === 'SELL' ? 'bg-white text-gold-600 shadow-sm' : 'text-zinc-500'}`}
            >
              {mode === 'REVENUE' ? 'Doanh thu' : 'Bán ra'}
            </button>
            {mode === 'INVENTORY' && (
              <button 
                onClick={() => setReportType('STOCK')}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${reportType === 'STOCK' ? 'bg-white text-gold-600 shadow-sm' : 'text-zinc-500'}`}
              >
                Tồn kho
              </button>
            )}
          </div>
          {reportType !== 'STOCK' && (
            <div className="flex p-1 bg-zinc-100/50 rounded-lg">
              <button 
                onClick={() => setViewMode('TRANSACTION')}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${viewMode === 'TRANSACTION' ? 'bg-white text-luxury-black shadow-sm' : 'text-zinc-400'}`}
              >
                Giao dịch
              </button>
              <button 
                onClick={() => setViewMode('INVOICE')}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${viewMode === 'INVOICE' ? 'bg-white text-luxury-black shadow-sm' : 'text-zinc-400'}`}
              >
                Hóa đơn
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <p className="text-zinc-400 text-[10px] font-bold mb-2 uppercase tracking-[0.2em]">Tổng số lượng {reportType === 'STOCK' ? 'tồn' : ''}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-luxury-black font-serif">{formatQuantity(totals.qty || 0)}</p>
            <p className="text-xs text-zinc-400 font-medium">Sản phẩm</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm ring-1 ring-gold-500/10">
          <p className="text-zinc-400 text-[10px] font-bold mb-2 uppercase tracking-[0.2em]">
            {reportType === 'SELL' ? 'Tổng doanh thu' : reportType === 'BUY' ? 'Tổng giá trị mua' : 'Tổng giá trị kho'}
          </p>
          <p className="text-3xl font-bold text-gold-600 font-serif">{formatCurrency(totals.total)}</p>
        </div>
        {reportType === 'SELL' && (
          <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
            <p className="text-zinc-400 text-[10px] font-bold mb-2 uppercase tracking-[0.2em]">Tổng giá vốn</p>
            <p className="text-3xl font-bold text-rose-500 font-serif">{formatCurrency(totals.cogs)}</p>
          </div>
        )}
        {reportType === 'STOCK' && (
          <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
            <p className="text-zinc-400 text-[10px] font-bold mb-2 uppercase tracking-[0.2em]">Danh mục hàng</p>
            <p className="text-3xl font-bold text-luxury-black font-serif">{filteredProducts.length}</p>
          </div>
        )}
      </div>

      <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex flex-col lg:flex-row gap-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-2">
              <Calendar size={16} className="text-gold-600" />
              <select 
                className="bg-transparent border-none outline-none text-sm font-bold text-zinc-700 cursor-pointer"
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value));
                  setStartDate('');
                  setEndDate('');
                }}
              >
                <option value="ALL">Tất cả tháng</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>Tháng {i + 1}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-2">
              <select 
                className="bg-transparent border-none outline-none text-sm font-bold text-zinc-700 cursor-pointer"
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(parseInt(e.target.value));
                  setStartDate('');
                  setEndDate('');
                }}
              >
                {[2024, 2025, 2026].map(y => (
                  <option key={y} value={y}>Năm {y}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 text-sm text-zinc-600 border border-zinc-200 rounded-2xl px-5 py-2 bg-zinc-50/50">
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase font-black text-zinc-400 tracking-wider">Từ</span>
                <input 
                  type="date"
                  className="focus:outline-none bg-transparent font-bold text-xs"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setSelectedMonth('ALL');
                  }}
                />
              </div>
              <div className="w-px h-4 bg-zinc-200" />
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase font-black text-zinc-400 tracking-wider">Đến</span>
                <input 
                  type="date"
                  className="focus:outline-none bg-transparent font-bold text-xs"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setSelectedMonth('ALL');
                  }}
                />
              </div>
            </div>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input 
              type="text" 
              placeholder={reportType === 'STOCK' ? "Tìm kiếm sản phẩm..." : "Tìm mã, tên, khách hàng hoặc số HĐ..."}
              className="w-full pl-12 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl outline-none focus:ring-2 focus:ring-gold-500/10 placeholder:text-zinc-400 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            {selectedInvoices.length > 0 && (
              <button 
                onClick={handleBulkDelete}
                className="flex items-center gap-2 px-6 py-3 bg-rose-600 text-white rounded-2xl hover:bg-rose-700 transition-all text-xs font-bold shadow-lg shadow-rose-600/20 active:scale-95"
              >
                <Trash2 size={16} /> Xóa {selectedInvoices.length} HĐ
              </button>
            )}
            {reportType !== 'STOCK' && (
              <select 
                className="px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl outline-none focus:ring-2 focus:ring-gold-500/10 text-sm font-medium cursor-pointer"
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
              >
                <option value="">Tất cả khách hàng</option>
                {customers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <button 
              onClick={handleExport}
              className="flex items-center gap-2 px-6 py-3 bg-luxury-black text-gold-500 rounded-2xl hover:bg-luxury-dark transition-all text-xs font-bold shadow-lg active:scale-95 border border-gold-500/20"
            >
              <Download size={16} /> EXPORT
            </button>
          </div>
        </div>

        <div className="bg-slate-50 border-b border-slate-100 p-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Hiển thị: <span className="text-slate-900">{startIndex + 1} - {Math.min(startIndex + pageSize, dataToPaginate.length)}</span> của <span className="text-blue-600">{dataToPaginate.length}</span> {viewMode === 'TRANSACTION' ? 'giao dịch' : 'hóa đơn'}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Số dòng:</span>
              <select 
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/10"
              >
                <option value={50}>50 bản ghi</option>
                <option value={100}>100 bản ghi</option>
                <option value={200}>200 bản ghi</option>
                <option value={300}>300 bản ghi</option>
                <option value={500}>500 bản ghi</option>
              </select>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-[10px] font-bold text-slate-500 disabled:opacity-30 hover:bg-white rounded border border-slate-200 transition-all cursor-pointer"
              >
                Trước
              </button>
              <div className="flex items-center gap-1">
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPage - 2 + i;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-black transition-all cursor-pointer ${
                        currentPage === pageNum 
                          ? 'bg-slate-900 text-white shadow-sm' 
                          : 'text-slate-500 hover:bg-white border border-transparent hover:border-slate-200'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-[10px] font-bold text-slate-500 disabled:opacity-30 hover:bg-white rounded border border-slate-200 transition-all cursor-pointer"
              >
                Tiếp
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className={`w-full text-left border-collapse ${mode === 'REVENUE' && reportType === 'SELL' ? 'min-w-[1100px]' : 'min-w-[950px]'}`}>
            {reportType === 'STOCK' ? (
              <>
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                    <th className="px-6 py-4">Mã hàng</th>
                    <th className="px-6 py-4">Tên hàng hóa</th>
                    <th className="px-6 py-4">ĐVT</th>
                    <th className="px-6 py-4">Tồn kho</th>
                    <th className="px-6 py-4">Giá vốn bình quân</th>
                    <th className="px-6 py-4 text-right">Tổng giá trị tồn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                        Không có hàng hóa nào trong kho
                      </td>
                    </tr>
                  ) : (
                    paginatedProducts.map((p) => (
                      <React.Fragment key={p.key}>
                        <tr 
                          onClick={() => setExpandedProduct(expandedProduct === p.key ? null : p.key)}
                          className={`hover:bg-slate-50 transition-colors cursor-pointer ${expandedProduct === p.key ? 'bg-blue-50/30' : ''}`}
                        >
                          <td className="px-6 py-4 text-sm font-mono font-bold text-slate-900">{p.code}</td>
                          <td className="px-6 py-4 text-sm text-slate-700">{p.name}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{p.unit}</td>
                          <td className={`px-6 py-4 text-sm font-bold ${p.currentStock > 0 ? 'text-slate-900' : 'text-red-500'}`}>
                            {formatQuantity(p.currentStock)}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 font-medium">{formatCurrency(p.averageCost)}</td>
                          <td className="px-6 py-4 text-sm text-right font-bold text-blue-600">
                            {formatCurrency(p.currentStock * p.averageCost)}
                          </td>
                        </tr>
                        {expandedProduct === p.key && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={6} className="px-6 py-4">
                              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-inner">
                                <p className="px-4 py-2 bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
                                  Lịch sử giao dịch: {p.code}
                                </p>
                                <table className="w-full text-[11px]">
                                  <thead className="bg-slate-50/50">
                                    <tr className="text-slate-500 border-b border-slate-100">
                                      <th className="px-4 py-2 text-left">Ngày Import</th>
                                      <th className="px-4 py-2 text-left">Ngày HĐ</th>
                                      <th className="px-4 py-2 text-left">Loại</th>
                                      <th className="px-4 py-2 text-left">Hóa đơn</th>
                                      <th className="px-4 py-2 text-left">Đối tác</th>
                                      <th className="px-4 py-2 text-center">SL</th>
                                      <th className="px-4 py-2 text-left">Mã hàng</th>
                                      <th className="px-4 py-2 text-left">Tên hàng</th>
                                      <th className="px-4 py-2 text-right">Đơn giá</th>
                                      <th className="px-4 py-2 text-right">Thành tiền</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {transactions
                                      .filter(t => {
                                        // Robust normalization match
                                        const c = (t.itemCode || '').toString().trim().toUpperCase();
                                        const n = (t.itemName || '').toString().trim().toUpperCase();
                                        const target = (p.code || '').toString().trim().toUpperCase();
                                        return c === target || n === target;
                                      })
                                      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                      .map((tx, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50 border-b border-slate-50 last:border-0">
                                        <td className="px-4 py-2 text-slate-600 text-xs whitespace-nowrap">{formatDate(tx.date)}</td>
                                        <td className="px-4 py-2 text-slate-400 text-[10px] italic whitespace-nowrap">{tx.invoiceDate ? formatDate(tx.invoiceDate) : '-'}</td>
                                        <td className="px-4 py-2 font-bold">
                                          <span className={tx.type === 'IN' ? 'text-green-600' : 'text-red-500'}>
                                            {tx.type === 'IN' ? 'NHẬP' : 'XUẤT'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-500 font-medium">{tx.invoiceNumber || (tx as any).invoice_number}</td>
                                        <td className="px-4 py-2 text-slate-600 truncate max-w-[150px]" title={tx.customer}>{tx.customer}</td>
                                        <td className="px-4 py-2 text-center font-bold text-slate-900">{formatQuantity(tx.quantity)}</td>
                                        <td className="px-4 py-2 text-left text-slate-500 font-mono text-[10px]">{tx.itemCode}</td>
                                        <td className="px-4 py-2 text-left text-slate-600 text-[10px] italic">{tx.itemName}</td>
                                        <td className="px-4 py-2 text-right text-slate-500">{formatCurrency(tx.price)}</td>
                                        <td className="px-4 py-2 text-right font-bold text-slate-700">{formatCurrency(tx.total)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
                {filteredProducts.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200">
                    <tr className="bg-slate-50 font-bold text-xs text-slate-900 border-t border-slate-300">
                      <td colSpan={3} className="px-6 py-4 text-right uppercase text-slate-500">Tổng cộng (Trang {currentPage}):</td>
                      <td className="px-6 py-4">
                        {formatQuantity(paginatedProducts.reduce((sum, p) => sum + p.currentStock, 0))}
                      </td>
                      <td className="px-6 py-4"></td>
                      <td className="px-6 py-4 text-right text-blue-600">
                        {formatCurrency(paginatedProducts.reduce((sum, p) => sum + (p.currentStock * p.averageCost), 0))}
                      </td>
                    </tr>
                    <tr className="bg-blue-50/50 font-black text-sm text-blue-900 border-t-2 border-blue-100">
                      <td colSpan={3} className="px-6 py-4 text-right uppercase text-blue-600/70">Tổng kết tất cả ({filteredProducts.length} mặt hàng):</td>
                      <td className="px-6 py-4">{formatQuantity(totals.qty)}</td>
                      <td className="px-6 py-4"></td>
                      <td className="px-6 py-4 text-right text-blue-900">{formatCurrency(totals.total)}</td>
                    </tr>
                  </tfoot>
                )}
              </>
            ) : viewMode === 'TRANSACTION' ? (
              <>
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] font-semibold uppercase tracking-wider">
                    <th className="px-2 py-3 w-10 text-center">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedInvoices.length > 0 && selectedInvoices.length === currentVisibleInvoiceNumbers.length}
                        onChange={() => toggleSelectAll(currentVisibleInvoiceNumbers)}
                      />
                    </th>
                    {reportType !== 'STOCK' && (
                      <>
                        <th className="px-2 py-3 whitespace-nowrap">Ngày HĐ</th>
                        <th className="px-2 py-3 whitespace-nowrap">Số HĐ</th>
                        <th className="px-3 py-3 min-w-[110px]">Khách hàng</th>
                        <th className="px-2 py-3">CCCD</th>
                        <th className="px-2 py-3 min-w-[120px]">Địa chỉ</th>
                      </>
                    )}
                    <th className="px-3 py-3 min-w-[140px]">Mặt hàng</th>
                    {mode === 'REVENUE' ? (
                      <>
                        <th className="px-2 py-3 text-center whitespace-nowrap">SL</th>
                        <th className="px-2 py-3 text-right whitespace-nowrap">Đơn giá</th>
                        <th className="px-2 py-3 text-right whitespace-nowrap">Thành tiền</th>
                        <th className="px-2 py-3 text-right whitespace-nowrap">Tiền công</th>
                        <th className="px-2 py-3 text-right text-red-500 whitespace-nowrap">Chiết khấu</th>
                        <th className="px-2 py-3 text-right font-bold text-blue-600 whitespace-nowrap">Thành tiền sau CK</th>
                      </>
                    ) : (
                      <>
                        <th className="px-2 py-3 text-center whitespace-nowrap">Số lượng</th>
                        <th className="px-2 py-3 text-right whitespace-nowrap">Đơn giá</th>
                        <th className="px-2 py-3 text-right whitespace-nowrap">Thành tiền</th>
                        {reportType === 'SELL' && (
                          <>
                            <th className="px-2 py-3 text-right text-red-500 whitespace-nowrap">Giá vốn</th>
                            <th className="px-2 py-3 text-right text-green-600 whitespace-nowrap">Lợi nhuận</th>
                          </>
                        )}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={mode === 'REVENUE' ? 13 : 10} className="px-6 py-12 text-center">
                        <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl text-center">
                          <p className="text-amber-800 font-medium italic">Hệ thống chưa có bất kỳ dữ liệu nào. Vui lòng nhập dữ liệu từ menu Import.</p>
                          <div className="mt-4 text-xs text-amber-600 font-mono text-left max-w-sm mx-auto">
                            <p>Debug:</p>
                            <p>- Tổng transactions: {debugStats.totalCount}</p>
                            <p>- Chế độ hiện tại: {mode}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : filteredDataDisplay.length === 0 ? (
                    <tr>
                      <td colSpan={mode === 'REVENUE' ? 13 : 10} className="px-6 py-12 text-center">
                        <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl text-center">
                          <p className="text-slate-500 italic">Không tìm thấy dữ liệu phù hợp với bộ lọc hiện tại.</p>
                          <div className="mt-4 text-[10px] text-slate-400 font-mono text-left max-w-sm mx-auto space-y-1">
                            <p className="font-bold">Thông tin chẩn đoán:</p>
                            <p>- Chế độ xem: {mode}</p>
                            <p>- Loại báo cáo: {reportType}</p>
                            <p>- Tổng số giao dịch trong HT: {debugStats.totalCount}</p>
                            <p>- Giao dịch thuộc {mode}: {mode === 'REVENUE' ? debugStats.revCount : debugStats.invCount}</p>
                            <p>- Tháng đang chọn: {selectedMonth === 'ALL' ? 'Tất cả' : selectedMonth + 1}/{selectedYear}</p>
                            <p>- Dữ liệu phân bố theo tháng: {JSON.stringify(Object.fromEntries(debugStats.dateCounts))}</p>
                            {debugStats.revCount > 0 && mode === 'REVENUE' && (
                               <div className="mt-2 p-2 bg-blue-50 text-blue-600 rounded">
                                 <p>Lưu ý: Có {debugStats.revCount} giao dịch doanh thu nhưng không hiển thị. </p>
                                 <p>Có thể do loại (IN/OUT) hoặc ngày tháng không khớp với bộ lọc.</p>
                               </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : paginatedData.map((row: any) => {
                      if (mode === 'REVENUE' && reportType === 'SELL') {
                        const isExpanded = expandedRevenueKey === row.key;
                        return (
                          <React.Fragment key={row.key}>
                            <tr 
                              onClick={() => setExpandedRevenueKey(isExpanded ? null : row.key)}
                              className={`hover:bg-blue-50/30 transition-colors cursor-pointer text-[11px] ${isExpanded ? 'bg-blue-50/50' : ''}`}
                            >
                              <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="checkbox"
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  checked={selectedInvoices.includes(row.invoiceNumber)}
                                  onChange={() => toggleSelectInvoice(row.invoiceNumber)}
                                />
                              </td>
                              <td className="px-2 py-3 whitespace-nowrap text-slate-500">{formatDate(row.invoiceDate)}</td>
                              <td className="px-2 py-3 font-bold text-blue-600">{row.invoiceNumber}</td>
                              <td className="px-3 py-3 text-slate-900 leading-tight max-w-[120px] truncate" title={row.customer}>{row.customer}</td>
                              <td className="px-2 py-3 text-slate-500 text-[10px]">{row.customerCard || '-'}</td>
                              <td className="px-2 py-3 text-slate-400 text-[10px] truncate max-w-[120px]" title={row.address}>{row.address || '-'}</td>
                              <td className="px-3 py-3 text-slate-700 font-bold leading-tight">{row.displayName}</td>
                              <td className="px-2 py-3 text-center text-slate-900 whitespace-nowrap">{formatQuantity(row.quantity)}</td>
                              <td className="px-2 py-3 text-right text-slate-600 whitespace-nowrap">{formatCurrency(row.avgPrice)}</td>
                              <td className="px-2 py-3 text-right text-slate-900 whitespace-nowrap">{formatCurrency(row.itemTotal)}</td>
                              <td className="px-2 py-3 text-right text-green-600 font-bold whitespace-nowrap">{row.laborTotal > 0 ? formatCurrency(row.laborTotal) : '-'}</td>
                              <td className="px-2 py-3 text-right text-red-500 font-bold whitespace-nowrap">{row.discountTotal > 0 ? formatCurrency(row.discountTotal) : '-'}</td>
                              <td className="px-2 py-3 text-right font-bold text-blue-700 text-sm whitespace-nowrap">{formatCurrency(row.finalTotal)}</td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={13} className="px-6 py-4 bg-slate-50/80">
                                  <div className="rounded-lg border border-slate-200 overflow-hidden bg-white shadow-inner">
                                    <table className="w-full text-xs">
                                      <thead className="bg-slate-100 text-slate-500 font-bold">
                                        <tr>
                                          <th className="px-4 py-2 text-left">Mã hàng</th>
                                          <th className="px-4 py-2 text-left">Tên hàng</th>
                                          <th className="px-4 py-2 text-center">SL</th>
                                          <th className="px-4 py-2 text-right">Đơn giá</th>
                                          <th className="px-4 py-2 text-right">Thành tiền</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {row.details.map((item: any, idx: number) => (
                                          <tr key={idx} className="hover:bg-slate-50/50">
                                            <td className="px-4 py-2 font-mono text-slate-400">{item.itemCode || '-'}</td>
                                            <td className="px-4 py-2 font-medium text-slate-700">{item.itemName}</td>
                                            <td className="px-4 py-2 text-center text-slate-600">{formatQuantity(item.quantity)} {item.unit}</td>
                                            <td className="px-4 py-2 text-right text-slate-500">{formatCurrency(item.price)}</td>
                                            <td className="px-4 py-2 text-right font-bold text-slate-900">{formatCurrency(item.total)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      }

                      if (reportType === 'STOCK') {
                        const p = row;
                        const rowTotal = (p.currentStock || 0) * (p.averageCost || 0);
                        return (
                          <tr key={p.key} className="hover:bg-slate-50/50 transition-colors text-[12px]">
                            <td className="px-2 py-3 text-center">-</td>
                            <td className="px-3 py-3">
                              <div className="font-bold text-slate-900 leading-tight">{p.name}</div>
                              <div className="text-[9px] text-slate-400 font-mono">CODE: {p.code}</div>
                            </td>
                            <td className="px-2 py-3 text-center text-slate-900 font-bold whitespace-nowrap">
                              {formatQuantity(p.currentStock)} {p.unit}
                            </td>
                            <td className="px-2 py-3 text-right text-slate-600 whitespace-nowrap">{formatCurrency(p.averageCost)}</td>
                            <td className="px-2 py-3 text-right font-bold text-blue-700 whitespace-nowrap">{formatCurrency(rowTotal)}</td>
                          </tr>
                        );
                      }

                      // Original Row Rendering for NGHIATINGOLD
                      const tx = row;
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors text-[11px]">
                          <td className="px-2 py-3 text-center">
                            <input 
                              type="checkbox"
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              checked={selectedInvoices.includes(tx.invoiceNumber)}
                              onChange={() => toggleSelectInvoice(tx.invoiceNumber)}
                            />
                          </td>
                          <td className="px-2 py-3 text-slate-600">
                            {formatDate(tx.invoiceDate || tx.date)}
                          </td>
                          <td className="px-2 py-3 font-bold text-slate-900">{tx.invoiceNumber}</td>
                          <td className="px-3 py-3 text-slate-900 max-w-[110px] truncate" title={tx.customer}>{tx.customer}</td>
                          <td className="px-2 py-3 text-slate-400 text-[10px]">{tx.customerCard || '-'}</td>
                          <td className="px-2 py-3 text-slate-400 text-[10px] truncate max-w-[120px]" title={tx.address}>{tx.address || '-'}</td>
                          <td className="px-3 py-3">
                            <div className="font-bold text-slate-900 leading-tight">{tx.itemName}</div>
                            <div className="text-[9px] text-slate-400 font-mono">CODE: {tx.itemCode}</div>
                          </td>
                          <td className="px-2 py-3 text-center text-slate-900 font-bold whitespace-nowrap">{formatQuantity(tx.quantity)} {tx.unit}</td>
                          <td className="px-2 py-3 text-right text-slate-600 whitespace-nowrap">{formatCurrency(tx.price)}</td>
                          <td className="px-2 py-3 text-right font-bold text-slate-900 whitespace-nowrap">{formatCurrency(tx.total)}</td>
                          {reportType === 'SELL' && (
                            <>
                              <td className="px-2 py-3 text-right text-red-500 font-bold whitespace-nowrap">
                                {tx.cogs ? formatCurrency(tx.cogs) : <span className="text-slate-300 italic text-[9px]">--</span>}
                              </td>
                              <td className="px-2 py-3 text-right font-bold whitespace-nowrap">
                                {tx.cogs ? (
                                  <span className={tx.total - tx.cogs > 0 ? 'text-green-600' : 'text-red-500'}>
                                    {formatCurrency(tx.total - tx.cogs)}
                                  </span>
                                ) : '--'}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
                {paginatedData.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200">
                    {mode === 'REVENUE' ? (
                      <tr className="bg-slate-50 font-bold text-[11px] text-slate-900 border-t border-slate-300">
                        <td colSpan={7} className="px-2 py-4 text-right uppercase text-slate-500">Tổng cộng (Trang {currentPage}):</td>
                        <td className="px-2 py-4 text-center">
                          {formatQuantity(paginatedData.reduce((sum: number, r: any) => sum + (Number(r.quantity) || 0), 0))}
                        </td>
                        <td className="px-2 py-4"></td>
                        <td className="px-2 py-4 text-right">{formatCurrency(paginatedData.reduce((sum: number, r: any) => sum + (Number(r.itemTotal || r.total) || 0), 0))}</td>
                        <td className="px-2 py-4 text-right text-green-600">{formatCurrency(paginatedData.reduce((sum: number, r: any) => sum + (Number(r.laborTotal) || 0), 0))}</td>
                        <td className="px-2 py-4 text-right text-red-500">{formatCurrency(paginatedData.reduce((sum: number, r: any) => sum + (Number(r.discountTotal) || 0), 0))}</td>
                        <td className="px-2 py-4 text-right text-blue-700">{formatCurrency(paginatedData.reduce((sum: number, r: any) => sum + (Number(r.finalTotal || r.total) || 0), 0))}</td>
                      </tr>
                    ) : (
                      <tr className="bg-slate-50 font-bold text-xs text-slate-900 border-t border-slate-300">
                        <td colSpan={reportType === 'STOCK' ? 2 : 7} className="px-2 py-4 text-right uppercase text-slate-500">Tổng cộng (Trang {currentPage}):</td>
                        <td className="px-2 py-4 text-center">
                          {formatQuantity(paginatedData.reduce((sum: number, r: any) => 
                            sum + (reportType === 'STOCK' ? (Number(r.currentStock) || 0) : (Number(r.quantity) || 0)), 0
                          ))}
                        </td>
                        <td className="px-2 py-4"></td>
                        <td className="px-2 py-4 text-right">
                          {formatCurrency(paginatedData.reduce((sum: number, r: any) => 
                            sum + (reportType === 'STOCK' ? (Number(r.currentStock) * Number(r.averageCost) || 0) : (Number(r.total) || 0)), 0
                          ))}
                        </td>
                        {reportType === 'SELL' && (
                          <>
                            <td className="px-2 py-4 text-right text-red-500">{formatCurrency(paginatedData.reduce((sum: number, r: any) => sum + (Number(r.cogs) || 0), 0))}</td>
                            <td className="px-2 py-4 text-right text-green-600">{formatCurrency(paginatedData.reduce((sum: number, r: any) => sum + ((Number(r.total) || 0) - (Number(r.cogs) || 0)), 0))}</td>
                          </>
                        )}
                      </tr>
                    )}
                    {/* Grand Total Row */}
                    <tr className="bg-blue-50/50 font-black text-[12px] text-blue-900 border-t-2 border-blue-100">
                      <td colSpan={reportType === 'STOCK' ? 2 : 7} className="px-2 py-4 text-right uppercase text-blue-600/70">Tổng kết tất cả:</td>
                      <td className="px-2 py-4 text-center">
                        {formatQuantity(totals.qty)}
                      </td>
                      <td className="px-2 py-4"></td>
                      {mode === 'REVENUE' ? (
                        <>
                          <td className="px-2 py-4 text-right" colSpan={4}>{formatCurrency(totals.total)}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-4 text-right font-bold">
                            {formatCurrency(totals.total)}
                          </td>
                          {reportType === 'SELL' && (
                            <>
                              <td className="px-2 py-4 text-right text-red-600">{formatCurrency(totals.cogs)}</td>
                              <td className="px-2 py-4 text-right text-green-700">{formatCurrency(totals.total - totals.cogs)}</td>
                            </>
                          )}
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </>
            ) : (
              <>
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                    <th className="px-6 py-4 w-10 text-center">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedInvoices.length > 0 && selectedInvoices.length === currentVisibleInvoiceNumbers.length}
                        onChange={() => toggleSelectAll(currentVisibleInvoiceNumbers)}
                      />
                    </th>
                    <th className="px-6 py-4">Ngày</th>
                    <th className="px-6 py-4">Số Hóa Đơn</th>
                    <th className="px-6 py-4">Đối tác</th>
                    <th className="px-6 py-4">Số dòng</th>
                    <th className="px-6 py-4">Tổng giá trị</th>
                    <th className="px-6 py-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                        Không tìm thấy hóa đơn nào
                      </td>
                    </tr>
                  ) : (
                    paginatedInvoices.map((inv) => (
                      <React.Fragment key={inv.number}>
                        <tr 
                          onClick={() => setExpandedInvoice(expandedInvoice === inv.number ? null : inv.number)}
                          className={`hover:bg-slate-50 transition-colors cursor-pointer ${expandedInvoice === inv.number ? 'bg-blue-50/30' : ''}`}
                        >
                          <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox"
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              checked={selectedInvoices.includes(inv.number)}
                              onChange={() => toggleSelectInvoice(inv.number)}
                            />
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{formatDate(inv.date)}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <FileText size={16} className="text-blue-500" />
                              <span className="font-bold text-slate-900">{inv.number}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            <div>{inv.customer}</div>
                            {inv.details[0]?.customerCard && <div className="text-[10px] text-slate-400">CCCD: {inv.details[0].customerCard}</div>}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{inv.items} mặt hàng</td>
                          <td className="px-6 py-4 text-sm font-bold text-blue-600">{formatCurrency(inv.total)}</td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteInvoice(inv.number);
                              }}
                              className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                              title="Xóa hóa đơn"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                        {expandedInvoice === inv.number && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-inner">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-slate-100/50 text-slate-500 border-b border-slate-100">
                                      <th className="px-4 py-2 text-left">Mã hàng</th>
                                      <th className="px-4 py-2 text-left">Tên hàng</th>
                                      <th className="px-4 py-2 text-center">SL</th>
                                      <th className="px-4 py-2 text-right border-l border-slate-100">Đơn giá</th>
                                      <th className="px-4 py-2 text-right">Thành tiền</th>
                                      {reportType === 'SELL' && (
                                        <>
                                          <th className="px-4 py-2 text-right text-red-500 border-l border-slate-100">Giá vốn</th>
                                          <th className="px-4 py-2 text-right text-green-600">Lợi nhuận</th>
                                        </>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {inv.details.map((item, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50/30">
                                        <td className="px-4 py-2 font-mono font-medium text-[10px]">{item.itemCode}</td>
                                        <td className="px-4 py-2 text-slate-700 max-w-[200px] truncate">{item.itemName}</td>
                                        <td className="px-4 py-2 text-center font-medium">{item.quantity} {item.unit}</td>
                                        <td className="px-4 py-2 text-right border-l border-slate-50 text-slate-500">{formatCurrency(item.price)}</td>
                                        <td className="px-4 py-2 text-right font-bold text-slate-900">{formatCurrency(item.total)}</td>
                                        {reportType === 'SELL' && (
                                          <>
                                            <td className="px-4 py-2 text-right text-red-500 border-l border-slate-50 font-medium">
                                              {item.cogs ? formatCurrency(item.cogs) : '--'}
                                            </td>
                                            <td className="px-4 py-2 text-right font-bold">
                                              {item.cogs ? (
                                                <span className={item.total - item.cogs > 0 ? 'text-green-600' : 'text-red-500'}>
                                                  {formatCurrency(item.total - item.cogs)}
                                                </span>
                                              ) : '--'}
                                            </td>
                                          </>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
                {paginatedInvoices.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200">
                    <tr className="bg-slate-50 font-bold text-xs text-slate-900 border-t border-slate-300">
                      <td colSpan={4} className="px-6 py-4 text-right uppercase text-slate-500">Tổng cộng (Trang {currentPage}):</td>
                      <td className="px-6 py-4">{paginatedInvoices.reduce((sum, inv) => sum + inv.items, 0)} mặt hàng</td>
                      <td className="px-6 py-4 text-blue-600">{formatCurrency(paginatedInvoices.reduce((sum, inv) => sum + inv.total, 0))}</td>
                      <td className="px-6 py-4"></td>
                    </tr>
                    <tr className="bg-blue-50/50 font-black text-sm text-blue-900 border-t-2 border-blue-100">
                      <td colSpan={4} className="px-6 py-4 text-right uppercase text-blue-600/70">Tổng kết tất cả ({invoices.length}):</td>
                      <td className="px-6 py-4">{invoices.reduce((sum, inv) => sum + inv.items, 0)} mặt hàng</td>
                      <td className="px-6 py-4 text-blue-900">{formatCurrency(invoices.reduce((sum, inv) => sum + inv.total, 0))}</td>
                      <td className="px-6 py-4"></td>
                    </tr>
                  </tfoot>
                )}
              </>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
