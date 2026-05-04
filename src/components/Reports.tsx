import React, { useState, useMemo } from 'react';
import { useInventory } from '../InventoryContext';
import { formatCurrency, formatDate } from '../lib/utils';
import { Search, Filter, Download, Calendar, Trash2, FileText } from 'lucide-react';

export default function Reports() {
  const { transactions, deleteInvoice, user, products } = useInventory();
  const [reportType, setReportType] = useState<'BUY' | 'SELL' | 'STOCK'>('BUY');
  const [viewMode, setViewMode] = useState<'TRANSACTION' | 'INVOICE'>('TRANSACTION');
  const [searchTerm, setSearchTerm] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const filteredData = useMemo(() => {
    return transactions.filter(tx => {
      const isType = reportType === 'BUY' ? tx.type === 'IN' : tx.type === 'OUT';
      if (reportType !== 'STOCK' && !isType) return false;

      // Date filtering based on Invoice Date as accounting anchor
      if (selectedMonth !== 'ALL') {
        const d = new Date(tx.invoiceDate || tx.date);
        if (d.getMonth() !== selectedMonth || d.getFullYear() !== selectedYear) return false;
      }

      const matchesSearch = tx.itemName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           tx.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           tx.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCustomer = !customerFilter || tx.customer === customerFilter;

      return matchesSearch && matchesCustomer;
    });
  }, [transactions, reportType, searchTerm, customerFilter, selectedMonth, selectedYear]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

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

  const customers = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(tx => {
      if ((reportType === 'BUY' && tx.type === 'IN') || (reportType === 'SELL' && tx.type === 'OUT')) {
        set.add(tx.customer);
      }
    });
    return Array.from(set);
  }, [transactions, reportType]);

  const totals = useMemo(() => {
    if (reportType === 'STOCK') {
      return filteredProducts.reduce((acc, curr) => ({
        qty: acc.qty + curr.currentStock,
        total: acc.total + (curr.currentStock * curr.averageCost),
        cogs: 0
      }), { qty: 0, total: 0, cogs: 0 });
    }
    return filteredData.reduce((acc, curr) => ({
      qty: acc.qty + curr.quantity,
      total: acc.total + curr.total,
      cogs: acc.cogs + (curr.cogs || 0)
    }), { qty: 0, total: 0, cogs: 0 });
  }, [filteredData, filteredProducts, reportType]);

  const handleDeleteInvoice = (invNum: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa toàn bộ hóa đơn số ${invNum}? Hành động này sẽ xóa tất cả các dòng hàng đi kèm.`)) {
      deleteInvoice(invNum);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {reportType === 'BUY' ? 'Báo Cáo Mua Hàng' : reportType === 'SELL' ? 'Báo Cáo Bán Hàng' : 'Báo Cáo Tồn Kho'}
          </h1>
          <p className="text-slate-500">Tổng hợp dữ liệu giao dịch theo thời gian</p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex p-1 bg-slate-100 rounded-lg">
            <button 
              onClick={() => setReportType('BUY')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${reportType === 'BUY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
              Báo cáo Mua
            </button>
            <button 
              onClick={() => setReportType('SELL')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${reportType === 'SELL' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
              Báo cáo Bán
            </button>
            <button 
              onClick={() => setReportType('STOCK')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${reportType === 'STOCK' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
            >
              Báo cáo Tồn
            </button>
          </div>
          {reportType !== 'STOCK' && (
            <div className="flex p-1 bg-slate-100 rounded-lg">
              <button 
                onClick={() => setViewMode('TRANSACTION')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'TRANSACTION' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Chi tiết hàng
              </button>
              <button 
                onClick={() => setViewMode('INVOICE')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'INVOICE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Theo hóa đơn
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm mb-1">Tổng số lượng {reportType === 'STOCK' ? 'tồn' : ''}</p>
          <p className="text-2xl font-bold text-slate-900">{totals.qty} <span className="text-sm font-normal text-slate-400">sản phẩm</span></p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm mb-1">
            {reportType === 'SELL' ? 'Tổng doanh thu' : reportType === 'BUY' ? 'Tổng giá trị mua' : 'Tổng giá trị kho'}
          </p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(totals.total)}</p>
        </div>
        {reportType === 'SELL' && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-sm mb-1">Tổng giá vốn</p>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(totals.cogs)}</p>
          </div>
        )}
        {reportType === 'STOCK' && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-sm mb-1">Mặt hàng trong kho</p>
            <p className="text-2xl font-bold text-slate-900">{filteredProducts.length}</p>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4">
          <div className="flex gap-2 min-w-fit">
            <select 
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value))}
            >
              <option value="ALL">Tất cả tháng</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>Tháng {i + 1}</option>
              ))}
            </select>
            <select 
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              {[2024, 2025, 2026].map(y => (
                <option key={y} value={y}>Năm {y}</option>
              ))}
            </select>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder={reportType === 'STOCK' ? "Tìm theo mã hoặc tên hàng..." : "Tìm theo mã, tên hoặc số HĐ..."}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {reportType !== 'STOCK' && (
              <select 
                className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
              >
                <option value="">Tất cả khách/nhà CC</option>
                {customers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm">
              <Download size={16} /> Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
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
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                        Không có hàng hóa nào trong kho
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => (
                      <React.Fragment key={p.code}>
                        <tr 
                          onClick={() => setExpandedProduct(expandedProduct === p.code ? null : p.code)}
                          className={`hover:bg-slate-50 transition-colors cursor-pointer ${expandedProduct === p.code ? 'bg-blue-50/30' : ''}`}
                        >
                          <td className="px-6 py-4 text-sm font-mono font-bold text-slate-900">{p.code}</td>
                          <td className="px-6 py-4 text-sm text-slate-700">{p.name}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{p.unit}</td>
                          <td className={`px-6 py-4 text-sm font-bold ${p.currentStock > 0 ? 'text-slate-900' : 'text-red-500'}`}>
                            {p.currentStock}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 font-medium">{formatCurrency(p.averageCost)}</td>
                          <td className="px-6 py-4 text-sm text-right font-bold text-blue-600">
                            {formatCurrency(p.currentStock * p.averageCost)}
                          </td>
                        </tr>
                        {expandedProduct === p.code && (
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
                                        <td className="px-4 py-2 text-center font-bold text-slate-900">{tx.quantity}</td>
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
              </>
            ) : viewMode === 'TRANSACTION' ? (
              <>
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                    <th className="px-6 py-4">Ngày Import</th>
                    <th className="px-6 py-4">Ngày HĐ</th>
                    <th className="px-6 py-4">Mặt hàng</th>
                    <th className="px-6 py-4">Đối tác</th>
                    <th className="px-6 py-4">Số lượng</th>
                    <th className="px-6 py-4">Đơn giá</th>
                    <th className="px-6 py-4">Thành tiền</th>
                    {reportType === 'SELL' && <th className="px-6 py-4">Giá vốn</th>}
                    {reportType === 'SELL' && <th className="px-6 py-4">Lợi nhuận</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={reportType === 'SELL' ? 8 : 6} className="px-6 py-12 text-center text-slate-400 italic">
                        Không tìm thấy dữ liệu phù hợp
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <div className="flex flex-col">
                            <span>{formatDate(tx.date)}</span>
                            <span className="text-[10px] text-slate-400 italic">HĐ: {tx.invoiceDate ? formatDate(tx.invoiceDate) : '--'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-slate-900">{tx.itemName}</div>
                          <div className="text-xs text-slate-500 font-mono">CODE: {tx.itemCode}</div>
                          <div className="text-[10px] bg-slate-100 text-slate-500 px-1 inline-block rounded">Số HD: {tx.invoiceNumber || (tx as any).invoice_number}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{tx.customer}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">{tx.quantity} {tx.unit}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{formatCurrency(tx.price)}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-900">{formatCurrency(tx.total)}</td>
                        {reportType === 'SELL' && (
                          <td className="px-6 py-4 text-sm text-red-500">
                            {tx.cogs ? formatCurrency(tx.cogs) : <span className="text-slate-300 italic">Chưa tính</span>}
                          </td>
                        )}
                        {reportType === 'SELL' && (
                          <td className="px-6 py-4 text-sm font-medium">
                            {tx.cogs ? (
                              <span className={tx.total - tx.cogs > 0 ? 'text-green-600' : 'text-red-600'}>
                                {formatCurrency(tx.total - tx.cogs)}
                              </span>
                            ) : '--'}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
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
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                        Không tìm thấy hóa đơn nào
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => (
                      <React.Fragment key={inv.number}>
                        <tr 
                          onClick={() => setExpandedInvoice(expandedInvoice === inv.number ? null : inv.number)}
                          className={`hover:bg-slate-50 transition-colors cursor-pointer ${expandedInvoice === inv.number ? 'bg-blue-50/30' : ''}`}
                        >
                          <td className="px-6 py-4 text-sm text-slate-600">{formatDate(inv.date)}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <FileText size={16} className="text-blue-500" />
                              <span className="font-bold text-slate-900">{inv.number}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{inv.customer}</td>
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
                            <td colSpan={6} className="px-6 py-4">
                              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-inner">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-slate-100/50 text-slate-500 border-b border-slate-100">
                                      <th className="px-4 py-2 text-left">Mã hàng</th>
                                      <th className="px-4 py-2 text-left">Tên hàng</th>
                                      <th className="px-4 py-2 text-center">SL</th>
                                      <th className="px-4 py-2 text-right">Đơn giá</th>
                                      <th className="px-4 py-2 text-right">Thành tiền</th>
                                      {reportType === 'SELL' && <th className="px-4 py-2 text-right">Giá vốn</th>}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {inv.details.map((item, idx) => (
                                      <tr key={idx}>
                                        <td className="px-4 py-2 font-mono font-medium">{item.itemCode}</td>
                                        <td className="px-4 py-2 text-slate-700">{item.itemName}</td>
                                        <td className="px-4 py-2 text-center">{item.quantity} {item.unit}</td>
                                        <td className="px-4 py-2 text-right">{formatCurrency(item.price)}</td>
                                        <td className="px-4 py-2 text-right font-bold">{formatCurrency(item.total)}</td>
                                        {reportType === 'SELL' && (
                                          <td className="px-4 py-2 text-right text-red-500">
                                            {item.cogs ? formatCurrency(item.cogs) : '--'}
                                          </td>
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
                    )
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
