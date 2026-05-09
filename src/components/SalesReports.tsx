import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, Terminal, AlertCircle, Calendar, CreditCard, User, Tag, DollarSign, Wallet, ArrowLeftRight } from 'lucide-react';
import { formatCurrency, formatQuantity, formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function SalesReports() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configMissing, setConfigMissing] = useState(false);
  const [data, setData] = useState<any[]>([]);
  
  // Filters
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [clientCccd, setClientCccd] = useState('');
  const [itemType, setItemType] = useState('BUY'); // Default to Mua vào

  const fetchSalesData = async () => {
    setLoading(true);
    setError(null);
    setConfigMissing(false);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        itemType,
        clientCccd
      });
      const response = await fetch(`/api/sales/transactions?${params.toString()}`);
      const result = await response.json();
      
      if (!response.ok) {
        if (result.code === 'CONFIG_MISSING') {
          setConfigMissing(true);
          throw new Error(result.error);
        }
        throw new Error(result.error || 'Lỗi khi tải dữ liệu');
      }
      
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesData();
  }, []);

  const totals = data.reduce((acc, current) => {
    const total = Number(current.total) || 0;
    const paymentMethod = current.payment_method || 'CASH';
    
    if (current.type === 'BUY') {
      acc.buy += total;
    } else {
      acc.sell += total;
    }
    
    if (paymentMethod === 'CASH') {
      acc.cash += total;
    } else {
      acc.transfer += total;
    }
    
    return acc;
  }, { buy: 0, sell: 0, cash: 0, transfer: 0 });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <DollarSign className="text-orange-500" /> BÁO CÁO 
          </h1>
          <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">TRUY XUẤT & ĐỐI SOÁT (TỪ SUPABASE)</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={fetchSalesData}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-bold shadow-lg shadow-slate-200"
          >
            <Search size={18} /> LỌC KẾT QUẢ
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Calendar size={12} /> Từ ngày
          </label>
          <input 
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm font-medium"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Calendar size={12} /> Đến ngày
          </label>
          <input 
            type="date" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm font-medium"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Tag size={12} /> Loại giao dịch
          </label>
          <select 
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm font-medium appearance-none"
          >
            <option value="ALL">Tất cả mặt hàng</option>
            <option value="BUY">Mua vào</option>
            <option value="SELL">Bán ra</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <CreditCard size={12} /> Số CCCD Khách hàng
          </label>
          <input 
            type="text" 
            placeholder="Tìm theo CCCD..."
            value={clientCccd}
            onChange={(e) => setClientCccd(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-orange-500/10 transition-all text-sm font-medium"
          />
        </div>
      </div>

      {configMissing ? (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-12 text-center space-y-4">
          <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-amber-600">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-amber-900">Chưa cấu hình Supabase</h2>
          <p className="text-amber-700 max-w-md mx-auto">
            Vui lòng cấu hình biến môi trường <code>SUPABASE_SALES_DB_URL</code> trong mục Settings để kết nối với phần mềm bán hàng.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border-l-[6px] border-rose-500 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1">
                <ArrowLeftRight size={12} /> Chi Mua Vào
              </p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(totals.buy)}</h3>
            </div>
            <div className="bg-white p-5 rounded-3xl border-l-[6px] border-emerald-500 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1">
                <ArrowLeftRight size={12} /> Thu Bán Ra
              </p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(totals.sell)}</h3>
            </div>
            <div className="bg-white p-5 rounded-3xl border-l-[6px] border-orange-500 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1">
                <Wallet size={12} /> Tổng Tiền Mặt
              </p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(totals.cash)}</h3>
            </div>
            <div className="bg-white p-5 rounded-3xl border-l-[6px] border-indigo-500 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1">
                <Wallet size={12} /> Tổng Chuyển Khoản
              </p>
              <h3 className="text-2xl font-black text-slate-900">{formatCurrency(totals.transfer)}</h3>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <h2 className="font-bold text-slate-700 uppercase tracking-wider text-xs">
                Dữ liệu chi tiết: {loading ? '...' : data.length} giao dịch
              </h2>
              <button className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors uppercase tracking-widest">
                <Download size={14} /> Xuất CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-900 text-white">
                  <tr className="text-[10px] font-bold uppercase tracking-widest">
                    <th className="px-6 py-4">Thời gian</th>
                    <th className="px-6 py-4">Loại GD</th>
                    <th className="px-6 py-4">Khách hàng & Địa chỉ</th>
                    <th className="px-6 py-4">Mặt hàng</th>
                    <th className="px-6 py-4">Người thực hiện</th>
                    <th className="px-6 py-4 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                          <p className="text-slate-400 italic text-sm">Đang truy xuất dữ liệu từ Supabase...</p>
                        </div>
                      </td>
                    </tr>
                  ) : data.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center text-slate-400 italic">
                        Không tìm thấy dữ liệu phù hợp.
                      </td>
                    </tr>
                  ) : data.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-slate-900">{formatDate(item.date)}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{new Date(item.created_at || Date.now()).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                          item.type === 'BUY' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                        }`}>
                          {item.type === 'BUY' ? 'Mua vào' : 'Bán ra'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Người bán (Khách)</div>
                        <div className="text-sm font-bold text-slate-900 uppercase">{item.customer_name || 'Khách lẻ'}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.customer_cccd || '-'}</div>
                        <div className="text-[10px] text-slate-400 italic mt-1 line-clamp-1 max-w-[200px]" title={item.dia_chi}>Đ/C: {item.dia_chi || '-'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-slate-900 italic">
                          {item.items?.[0]?.name || 'Vàng 9999'} 
                          <span className="text-[10px] text-slate-400 font-normal ml-1">x{item.items?.[0]?.quantity || 1}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-slate-700">{item.staff_name || 'Chủ doanh nghiệp'}</div>
                        <div className="text-[9px] text-slate-400 font-mono tracking-tighter">giamdoc@nghiatingold.com</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-[10px] text-slate-400 font-medium mb-1 line-through opacity-30">Đơn giá: {formatCurrency(item.unit_price || 0)}</div>
                        <div className="text-base font-black text-slate-900">{formatCurrency(item.total)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
