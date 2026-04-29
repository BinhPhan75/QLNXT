import React, { useState } from 'react';
import { useInventory } from '../InventoryContext';
import { LayoutDashboard, FileUp, BarChart3, Settings, LogOut, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Subcomponents
import ImportExport from './ImportExport';
import Reports from './Reports';
import SystemSettings from './SystemSettings';
import { formatCurrency } from '../lib/utils';

export default function Layout() {
  const { user, logout, products } = useInventory();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'import' | 'reports' | 'system'>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'import', label: 'Nhập/Xuất kho', icon: FileUp },
    { id: 'reports', label: 'Báo cáo', icon: BarChart3 },
    { id: 'system', label: 'Hệ thống', icon: Settings },
  ] as const;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView setActiveTab={setActiveTab} />;
      case 'import':
        return <ImportExport />;
      case 'reports':
        return <Reports />;
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
    <div className="flex min-h-screen bg-slate-50 font-sans relative">
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 lg:hidden"
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
        className="bg-white border-r border-slate-200 fixed lg:sticky top-0 z-40 h-screen overflow-hidden shadow-xl lg:shadow-none"
      >
        <div className="p-6 h-full flex flex-col min-w-[280px]">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">P</div>
              <h1 className="font-bold text-xl text-slate-900 tracking-tight">PNJ Inventory</h1>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-500"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    activeTab === item.id 
                    ? 'bg-blue-50 text-blue-600 font-semibold' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  <Icon size={20} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <button 
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-red-500 transition-colors mt-auto"
          >
            <LogOut size={20} />
            Đăng xuất
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          <header className="flex items-center justify-between mb-8">
            <button 
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="p-2 bg-white rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-4 ml-auto">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">{user?.username}</p>
                <p className="text-xs text-slate-500">Quản trị viên</p>
              </div>
              <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-500">AD</div>
            </div>
          </header>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
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
  const { products, transactions } = useInventory();

  const stats = [
    { label: 'Tổng mặt hàng', value: products.length, sub: 'Loại sản phẩm', color: 'blue' },
    { label: 'Nhập kho', value: transactions.filter(t => t.type === 'IN').length, sub: 'Phiếu nhập', color: 'green' },
    { label: 'Xuất kho', value: transactions.filter(t => t.type === 'OUT').length, sub: 'Phiếu xuất', color: 'red' },
    { label: 'Tồn kho', value: products.reduce((acc, p) => acc + p.currentStock, 0), sub: 'Số lượng món', color: 'amber' },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 text-sm font-medium mb-1 uppercase tracking-wider">{s.label}</p>
            <div className="flex items-end gap-2">
              <p className={`text-3xl font-bold text-slate-900`}>{s.value}</p>
              <p className="text-xs text-slate-400 mb-1">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Mặt hàng tồn kho</h2>
              <button 
                onClick={() => setActiveTab('import')}
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                + Nhập hàng mới
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Tên hàng / Mã hàng</th>
                    <th className="px-6 py-4">ĐVT</th>
                    <th className="px-6 py-4">SL Tồn</th>
                    <th className="px-6 py-4">Giá vốn (Bình quân)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-slate-400 italic">Chưa có dữ liệu</td>
                    </tr>
                  ) : (
                    products.slice(0, 10).map((p) => (
                      <tr key={p.code} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-slate-900">{p.name}</p>
                          <p className="text-xs text-slate-500">{p.code}</p>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{p.unit}</td>
                        <td className="px-6 py-4 text-slate-900 font-medium">{p.currentStock}</td>
                        <td className="px-6 py-4 text-blue-600 font-semibold">{formatCurrency(p.averageCost)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-bold mb-2">Hệ thống Tính Giá Vốn</h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              Phương pháp bình quân gia quyền giúp bạn xác định giá vốn chính xác cho mỗi lần bán hàng. 
              Hãy chạy tính toán sau mỗi đợt nhập hàng lớn.
            </p>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
              <p className="text-xs text-white/50 mb-1 uppercase">Lần cuối cập nhật</p>
              <p className="font-medium">Chưa có thông tin</p>
            </div>
            <button 
              onClick={() => setActiveTab('system')}
              className="w-full py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-100 transition-colors"
            >
              Cấu hình hệ thống
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
