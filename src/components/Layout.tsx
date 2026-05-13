import React, { useState, useEffect, useMemo } from 'react';
import { useInventory } from '../InventoryContext';
import { LayoutDashboard, FileUp, BarChart3, Settings, LogOut, Menu, X, DollarSign, ChevronDown, ChevronUp, FileSearch } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Subcomponents
import ImportExport from './ImportExport';
import Reports from './Reports';
import SalesReports from './SalesReports';
import NXTReport from './NXTReport';
import SystemSettings from './SystemSettings';
import BankStatements from './BankStatements';
import { formatCurrency, formatQuantity } from '../lib/utils';

export default function Layout() {
  const { user, logout, products, bankStatements } = useInventory();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sales_purchase' | 'rev_import' | 'rev_report' | 'inv_import' | 'inv_report' | 'inv_nxt' | 'inv_other' | 'bank' | 'system'>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSalesMenuOpen, setSalesMenuOpen] = useState(true);
  const [isRevenueMenuOpen, setRevenueMenuOpen] = useState(true);
  const [isInventoryMenuOpen, setInventoryMenuOpen] = useState(true);
  const [isBankMenuOpen, setBankMenuOpen] = useState(false);

  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error' | 'missing'>('checking');
  const [dbError, setDbError] = useState<string>('');

  useEffect(() => {
    const checkDb = async () => {
      try {
        const res = await fetch('/api/db-status');
        if (!res.ok) {
          setDbStatus('error');
          setDbError(`Server trả về lỗi ${res.status}`);
          return;
        }
        const data = await res.json();
        if (data.status === 'connected') {
          setDbStatus('connected');
          setDbError('');
        } else if (data.status === 'missing_env') {
          setDbStatus('missing');
          setDbError(data.message);
        } else {
          setDbStatus('error');
          setDbError(data.message);
        }
      } catch (err) {
        setDbStatus('error');
        setDbError('Không thể gọi API (Server có thể chưa chạy)');
      }
    };
    checkDb();
    const interval = setInterval(checkDb, 30000); 
    return () => clearInterval(interval);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView setActiveTab={setActiveTab} />;
      case 'sales_purchase':
        return <SalesReports />;
      case 'rev_import':
        return <ImportExport mode="REVENUE" />;
      case 'rev_report':
        return <Reports mode="REVENUE" />;
      case 'inv_import':
        return <ImportExport mode="INVENTORY" />;
      case 'inv_report':
        return <Reports mode="INVENTORY" />;
      case 'inv_nxt':
        return <NXTReport />;
      case 'inv_other':
        return (
          <div className="flex flex-col items-center justify-center h-96 text-slate-400">
            <Settings size={48} className="mb-4 opacity-20" />
            <p className="text-xl font-medium">Tính năng Vàng Khác đang được phát triển</p>
          </div>
        );
      case 'bank':
        return <BankStatements />;
      case 'system':
        return <SystemSettings />;
      default:
        return <DashboardView setActiveTab={setActiveTab} />;
    }
  };

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans relative">
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 280 : (window.innerWidth >= 1024 ? 280 : 0),
          x: isSidebarOpen ? 0 : (window.innerWidth >= 1024 ? 0 : -280),
          opacity: isSidebarOpen ? 1 : (window.innerWidth >= 1024 ? 1 : 0)
        }}
        className="bg-luxury-black fixed lg:sticky top-0 z-40 h-screen overflow-hidden shadow-2xl lg:shadow-none"
      >
        <div className="p-6 h-full flex flex-col min-w-[280px] border-r border-gold-500/10">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-gold-500 rounded-lg shadow-lg shadow-gold-500/20">
                <img 
                  src="https://raw.githubusercontent.com/BinhPhan75/nghiatingold/refs/heads/main/icon.png?token=GHSAT0AAAAAAD25RX774URG63UENSNTJPKS2QD3BGQ" 
                  alt="NGHIATINGOLD Logo" 
                  className="w-8 h-8 object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <h1 className="font-bold text-lg text-white tracking-widest leading-tight uppercase font-serif">
                  NGHIA<span className="text-gold-500 font-sans">TINGOLD</span>
                </h1>
                  <div 
                    title={dbError || (dbStatus === 'error' ? 'Vui lòng kiểm tra DATABASE_URL trong phần Settings' : undefined)}
                    className="flex flex-col mt-0.5 cursor-help"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        dbStatus === 'connected' ? 'bg-gold-500 animate-pulse' : 
                        dbStatus === 'checking' ? 'bg-amber-400' : 
                        dbStatus === 'missing' ? 'bg-amber-500' : 'bg-rose-500'
                      }`} />
                      <span className={`text-[9px] font-semibold uppercase tracking-[0.2em] ${
                        dbStatus === 'connected' ? 'text-gold-500/80' : 
                        dbStatus === 'missing' ? 'text-amber-600' : 
                        dbStatus === 'error' ? 'text-rose-600' : 'text-zinc-500'
                      }`}>
                        {dbStatus === 'connected' ? 'Systems Online' : 
                         dbStatus === 'checking' ? 'Connecting...' : 
                         dbStatus === 'missing' ? 'Config Needed' : 'Offline'}
                      </span>
                    </div>
                  </div>
              </div>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 hover:bg-white/5 rounded-lg text-zinc-400"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto no-scrollbar scroll-smooth">
            <button
              onClick={() => handleTabChange('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 group ${
                activeTab === 'dashboard' 
                ? 'bg-gold-500/10 text-gold-500 font-bold shadow-[0_0_20px_rgba(212,175,55,0.05)] border border-gold-500/10' 
                : 'text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <LayoutDashboard size={22} className={activeTab === 'dashboard' ? 'text-gold-500' : 'group-hover:text-gold-400'} />
              <span className="tracking-wide text-sm">Tổng quan</span>
              {activeTab === 'dashboard' && <motion.div layoutId="active-pill" className="ml-auto w-1 h-3 rounded-full bg-gold-500" />}
            </button>

            {/* SECTION LABEL */}
            <div className="px-4 pt-8 pb-3 text-[10px] font-black text-zinc-700 uppercase tracking-[0.3em] flex items-center gap-2">
              <div className="h-px bg-zinc-800 flex-1" />
              Giao dịch
              <div className="h-px bg-zinc-800 flex-1" />
            </div>

            {/* BÁN HÀNG (SALES) */}
            <div className="space-y-1">
              <button
                onClick={() => setSalesMenuOpen(!isSalesMenuOpen)}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all group ${
                  (activeTab === 'sales_purchase') 
                  ? 'bg-gold-500/5 text-gold-500 font-bold' 
                  : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <DollarSign size={22} className={activeTab === 'sales_purchase' ? 'text-gold-500' : 'text-zinc-500 group-hover:text-gold-400'} />
                  <span className="tracking-wide text-sm">Mua - Bán</span>
                </div>
                {isSalesMenuOpen ? <ChevronUp size={16} className="text-zinc-600" /> : <ChevronDown size={16} className="text-zinc-600" />}
              </button>

              <AnimatePresence>
                {isSalesMenuOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden pl-11 pr-2 space-y-1"
                  >
                    <button
                      onClick={() => handleTabChange('sales_purchase')}
                      className={`w-full flex items-center gap-2.5 py-2.5 rounded-lg transition-all text-xs group ${
                        activeTab === 'sales_purchase' 
                        ? 'text-gold-500 font-semibold' 
                        : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <div className={`w-1 h-1 rounded-full ${activeTab === 'sales_purchase' ? 'bg-gold-500 shadow-[0_0_5px_#d4af37]' : 'bg-zinc-800'}`} />
                      Báo cáo mua vào
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* REVENUE MENU */}
            <div className="space-y-1">
              <button
                onClick={() => setRevenueMenuOpen(!isRevenueMenuOpen)}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all group ${
                  (activeTab === 'rev_import' || activeTab === 'rev_report')
                  ? 'bg-gold-500/5 text-gold-500 font-bold' 
                  : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <BarChart3 size={22} className={(activeTab === 'rev_import' || activeTab === 'rev_report') ? 'text-gold-500' : 'text-zinc-500 group-hover:text-gold-400'} />
                  <span className="tracking-wide text-sm">Doanh thu</span>
                </div>
                {isRevenueMenuOpen ? <ChevronUp size={16} className="text-zinc-600" /> : <ChevronDown size={16} className="text-zinc-600" />}
              </button>

              <AnimatePresence>
                {isRevenueMenuOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden pl-11 pr-2 space-y-1"
                  >
                    <button
                      onClick={() => handleTabChange('rev_import')}
                      className={`w-full flex items-center gap-2.5 py-2.5 rounded-lg transition-all text-xs group ${
                        activeTab === 'rev_import' 
                        ? 'text-gold-500 font-semibold' 
                        : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <div className={`w-1 h-1 rounded-full ${activeTab === 'rev_import' ? 'bg-gold-500 shadow-[0_0_5px_#d4af37]' : 'bg-zinc-800'}`} />
                      Import dữ liệu
                    </button>
                    <button
                      onClick={() => handleTabChange('rev_report')}
                      className={`w-full flex items-center gap-2.5 py-2.5 rounded-lg transition-all text-xs group ${
                        activeTab === 'rev_report' 
                        ? 'text-gold-500 font-semibold' 
                        : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <div className={`w-1 h-1 rounded-full ${activeTab === 'rev_report' ? 'bg-gold-500 shadow-[0_0_5px_#d4af37]' : 'bg-zinc-800'}`} />
                      Báo cáo doanh thu
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="px-4 pt-8 pb-3 text-[10px] font-black text-zinc-700 uppercase tracking-[0.3em] flex items-center gap-2">
              <div className="h-px bg-zinc-800 flex-1" />
              Kho & Tài chính
              <div className="h-px bg-zinc-800 flex-1" />
            </div>

            {/* INVENTORY MENU */}
            <div className="space-y-1">
              <button
                onClick={() => setInventoryMenuOpen(!isInventoryMenuOpen)}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all group ${
                  (activeTab === 'inv_import' || activeTab === 'inv_report' || activeTab === 'inv_nxt' || activeTab === 'inv_other')
                  ? 'bg-gold-500/5 text-gold-500 font-bold' 
                  : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <FileUp size={22} className={(activeTab === 'inv_import' || activeTab === 'inv_report' || activeTab === 'inv_nxt' || activeTab === 'inv_other') ? 'text-gold-500' : 'text-zinc-500 group-hover:text-gold-400'} />
                  <span className="tracking-wide text-sm">Hàng hóa</span>
                </div>
                {isInventoryMenuOpen ? <ChevronUp size={16} className="text-zinc-600" /> : <ChevronDown size={16} className="text-zinc-600" />}
              </button>

              <AnimatePresence>
                {isInventoryMenuOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden pl-11 pr-2 space-y-1"
                  >
                    <button
                      onClick={() => handleTabChange('inv_import')}
                      className={`w-full flex items-center gap-2.5 py-2.5 rounded-lg transition-all text-xs group ${
                        activeTab === 'inv_import' 
                        ? 'text-gold-500 font-semibold' 
                        : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <div className={`w-1 h-1 rounded-full ${activeTab === 'inv_import' ? 'bg-gold-500 shadow-[0_0_5px_#d4af37]' : 'bg-zinc-800'}`} />
                      Import dữ liệu
                    </button>
                    <button
                      onClick={() => handleTabChange('inv_report')}
                      className={`w-full flex items-center gap-2.5 py-2.5 rounded-lg transition-all text-xs group ${
                        activeTab === 'inv_report' 
                        ? 'text-gold-500 font-semibold' 
                        : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <div className={`w-1 h-1 rounded-full ${activeTab === 'inv_report' ? 'bg-gold-500 shadow-[0_0_5px_#d4af37]' : 'bg-zinc-800'}`} />
                      Báo cáo tồn kho
                    </button>
                    <button
                      onClick={() => handleTabChange('inv_nxt')}
                      className={`w-full flex items-center gap-2.5 py-2.5 rounded-lg transition-all text-xs group ${
                        activeTab === 'inv_nxt' 
                        ? 'text-gold-500 font-semibold' 
                        : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <div className={`w-1 h-1 rounded-full ${activeTab === 'inv_nxt' ? 'bg-gold-500 shadow-[0_0_5px_#d4af37]' : 'bg-zinc-800'}`} />
                      Báo cáo NXT
                    </button>
                    <button
                      onClick={() => handleTabChange('inv_other')}
                      className={`w-full flex items-center gap-2.5 py-2.5 rounded-lg transition-all text-xs group ${
                        activeTab === 'inv_other' 
                        ? 'text-gold-500 font-semibold' 
                        : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <div className={`w-1 h-1 rounded-full ${activeTab === 'inv_other' ? 'bg-gold-500 shadow-[0_0_5px_#d4af37]' : 'bg-zinc-800'}`} />
                      Vàng khác
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* BANK MENU */}
            <div className="space-y-1">
              <button
                onClick={() => setBankMenuOpen(!isBankMenuOpen)}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all group ${
                  activeTab === 'bank'
                  ? 'bg-gold-500/5 text-gold-500 font-bold' 
                  : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <DollarSign size={22} className={activeTab === 'bank' ? 'text-gold-500' : 'text-zinc-500 group-hover:text-gold-400'} />
                  <span className="tracking-wide text-sm">Ngân hàng</span>
                </div>
                {isBankMenuOpen ? <ChevronUp size={16} className="text-zinc-600" /> : <ChevronDown size={16} className="text-zinc-600" />}
              </button>

              <AnimatePresence>
                {isBankMenuOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden pl-11 pr-2 space-y-1"
                  >
                    <button
                      onClick={() => handleTabChange('bank')}
                      className={`w-full flex items-center gap-2.5 py-2.5 rounded-lg transition-all text-xs group ${
                        activeTab === 'bank' 
                        ? 'text-gold-500 font-semibold' 
                        : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <div className={`w-1 h-1 rounded-full ${activeTab === 'bank' ? 'bg-gold-500 shadow-[0_0_5px_#d4af37]' : 'bg-zinc-800'}`} />
                      Sao kê NH
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={() => handleTabChange('system')}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all group ${
                activeTab === 'system' 
                ? 'bg-gold-500/10 text-gold-500 font-bold' 
                : 'text-zinc-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Settings size={22} className={activeTab === 'system' ? 'text-gold-500' : 'text-zinc-500 group-hover:text-gold-400'} />
              <span className="tracking-wide text-sm">Hệ thống</span>
            </button>
          </nav>

          <button 
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 text-zinc-500 hover:text-gold-400 transition-colors mt-auto border-t border-white/5 pt-6"
          >
            <LogOut size={20} />
            Đăng xuất
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          <header className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-200/50">
            <button 
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="p-2 bg-white rounded-lg border border-zinc-200 text-zinc-500 hover:text-zinc-700 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-4 ml-auto">
              <div className="text-right">
                <p className="text-sm font-bold text-zinc-900 tracking-tight">{user?.username}</p>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest bg-zinc-100 px-2 py-0.5 rounded-full inline-block mt-0.5">Admin</p>
              </div>
              <div className="w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center font-bold text-luxury-black shadow-lg shadow-gold-500/20 ring-2 ring-white">
                {user?.username?.substring(0, 2).toUpperCase() || 'AD'}
              </div>
            </div>
          </header>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function DashboardView({ setActiveTab }: { setActiveTab: (tab: any) => void }) {
  const { products, transactions, bankStatements } = useInventory();

  const bankSummary = useMemo(() => {
    return {
      in: bankStatements.reduce((sum, item) => sum + item.credit, 0),
      out: bankStatements.reduce((sum, item) => sum + item.debit, 0)
    };
  }, [bankStatements]);

  const stats = [
    { label: 'Tổng mặt hàng', value: products.length, sub: 'Loại sản phẩm', color: 'blue' },
    { label: 'Biến động Thu NH', value: new Intl.NumberFormat('vi-VN').format(bankSummary.in), sub: 'VND', color: 'green' },
    { label: 'Biến động Chi NH', value: new Intl.NumberFormat('vi-VN').format(bankSummary.out), sub: 'VND', color: 'red' },
    { label: 'Tồn kho', value: formatQuantity(products.reduce((acc, p) => acc + p.currentStock, 0)), sub: 'Số lượng chỉ', color: 'amber' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm hover:shadow-xl hover:shadow-gold-500/5 transition-all duration-300 group">
            <p className="text-zinc-400 text-[10px] font-bold mb-2 uppercase tracking-[0.2em] group-hover:text-gold-500 transition-colors">{s.label}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-luxury-black font-serif tracking-tight">{s.value}</p>
              <p className="text-[10px] text-zinc-400 font-semibold">{s.sub}</p>
            </div>
            <div className="mt-4 h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
               <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '40%' }}
                className="h-full bg-gold-500/30"
               />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h2 className="font-bold text-luxury-black tracking-tight font-serif text-lg">Hàng hóa trong kho</h2>
              <button 
                onClick={() => setActiveTab('inv_import')}
                className="text-xs font-bold text-gold-600 hover:text-gold-700 uppercase tracking-widest px-4 py-2 bg-gold-50 rounded-full transition-colors"
              >
                + Nhập hàng mới
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-zinc-50 text-zinc-400 text-[10px] font-bold uppercase tracking-[0.15em]">
                  <tr>
                    <th className="px-6 py-4">Tên hàng / Mã hàng</th>
                    <th className="px-6 py-4 text-center">ĐVT</th>
                    <th className="px-6 py-4 text-right">SL Tồn</th>
                    <th className="px-6 py-4 text-right">Giá vốn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 text-sm">
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-zinc-400 italic font-serif">Chưa có dữ liệu hàng hóa</td>
                    </tr>
                  ) : (
                    products.slice(0, 10).map((p) => (
                      <tr key={p.key} className="hover:bg-gold-50/30 transition-colors group">
                        <td className="px-6 py-4">
                          <p className="font-bold text-luxury-black group-hover:text-gold-700 transition-colors">{p.name}</p>
                          <p className="text-[10px] text-zinc-400 font-mono tracking-wider">{p.code}</p>
                        </td>
                        <td className="px-6 py-4 text-zinc-600 text-center uppercase text-xs font-semibold">{p.unit}</td>
                        <td className="px-6 py-4 text-luxury-black font-bold text-right font-mono">{formatQuantity(p.currentStock)}</td>
                        <td className="px-6 py-4 text-gold-600 font-bold text-right font-mono">{formatCurrency(p.averageCost)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-luxury-black rounded-3xl p-8 text-white shadow-2xl flex flex-col justify-between border border-gold-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/10 blur-3xl -mr-16 -mt-16 rounded-full group-hover:bg-gold-500/20 transition-all duration-500" />
          <div className="relative z-10">
            <div className="w-12 h-12 bg-gold-500/10 rounded-2xl flex items-center justify-center mb-6 border border-gold-500/30">
               <Settings className="text-gold-500" size={24} />
            </div>
            <h2 className="text-2xl font-bold mb-4 font-serif tracking-tight">Hệ thống <span className="text-gold-500">Gold Logic</span></h2>
            <p className="text-zinc-400 text-sm mb-8 leading-relaxed font-light">
              Quy trình tính toán giá vốn bình quân gia quyền tự động, giúp tối ưu hóa lợi nhuận và kiểm soát thất thoát chính xác đến từng phân ly.
            </p>
          </div>
          <div className="space-y-4 relative z-10">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-[9px] text-zinc-500 mb-1 uppercase tracking-widest font-bold">Trạng thái vận hành</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gold-500 animate-pulse" />
                <p className="font-semibold text-gold-500 text-sm">Sẵn sàng tính toán</p>
              </div>
            </div>
            <button 
              onClick={() => setActiveTab('system')}
              className="w-full py-4 bg-gold-500 text-luxury-black font-bold rounded-2xl hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/20 active:scale-[0.98] uppercase text-xs tracking-widest"
            >
              Cấu hình hệ thống
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
