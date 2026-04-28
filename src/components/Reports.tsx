import React, { useState, useMemo } from 'react';
import { useInventory } from '../InventoryContext';
import { formatCurrency, formatDate } from '../lib/utils';
import { Search, Filter, Download, Calendar } from 'lucide-react';

export default function Reports() {
  const { transactions } = useInventory();
  const [reportType, setReportType] = useState<'BUY' | 'SELL'>('BUY');
  const [searchTerm, setSearchTerm] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  
  const filteredData = useMemo(() => {
    return transactions.filter(tx => {
      const isType = reportType === 'BUY' ? tx.type === 'IN' : tx.type === 'OUT';
      if (!isType) return false;

      const matchesSearch = tx.itemName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           tx.itemCode.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCustomer = !customerFilter || tx.customer === customerFilter;

      return matchesSearch && matchesCustomer;
    });
  }, [transactions, reportType, searchTerm, customerFilter]);

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
    return filteredData.reduce((acc, curr) => ({
      qty: acc.qty + curr.quantity,
      total: acc.total + curr.total,
      cogs: acc.cogs + (curr.cogs || 0)
    }), { qty: 0, total: 0, cogs: 0 });
  }, [filteredData]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Báo Cáo {reportType === 'BUY' ? 'Mua Hàng' : 'Bán Hàng'}</h1>
          <p className="text-slate-500">Tổng hợp dữ liệu giao dịch theo thời gian</p>
        </div>
        <div className="flex p-1 bg-slate-100 rounded-lg self-start">
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
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm mb-1">Tổng số lượng</p>
          <p className="text-2xl font-bold text-slate-900">{totals.qty} <span className="text-sm font-normal text-slate-400">sản phẩm</span></p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm mb-1">Tổng giá trị {reportType === 'SELL' ? 'Doanh thu' : ''}</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(totals.total)}</p>
        </div>
        {reportType === 'SELL' && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-sm mb-1">Tổng giá vốn</p>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(totals.cogs)}</p>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Tìm theo mã hoặc tên hàng..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <select 
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
            >
              <option value="">Tất cả khách/nhà CC</option>
              {customers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm">
              <Download size={16} /> Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <th className="px-6 py-4">Ngày</th>
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
                    <td className="px-6 py-4 text-sm text-slate-600">{formatDate(tx.date)}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">{tx.itemName}</div>
                      <div className="text-xs text-slate-500">{tx.itemCode}</div>
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
          </table>
        </div>
      </div>
    </div>
  );
}
