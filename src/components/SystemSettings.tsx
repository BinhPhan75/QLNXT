import React, { useState } from 'react';
import { useInventory } from '../InventoryContext';
import { Calculator, RotateCcw, ShieldCheck, CheckSquare, Lock as LockIcon, Unlock, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../lib/utils';

export default function SystemSettings() {
  const { calculateMonthlyCOGS, resetData, products, transactions, setManualOpeningBalance, manualOpeningBalances, lockMonth, unlockMonth, closedMonths } = useInventory();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showOBModal, setShowOBModal] = useState(false);

  // Manual OB Form State
  const [obItemCode, setObItemCode] = useState('');
  const [obQty, setObQty] = useState(0);
  const [obValue, setObValue] = useState(0);

  const months = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const isCurrentMonthClosed = closedMonths.includes(`${selectedMonth + 1}-${selectedYear}`);

  const handleCalculate = () => {
    // We allow calculation even if month is not closed, but warn or recommend closing first if preferred.
    // However, the user says "after closing month, COGS calculation error".
    // Let's make it more flexible.
    const result = calculateMonthlyCOGS(selectedMonth, selectedYear);
    alert(result.message);
  };

  const handleAddOB = (e: React.FormEvent) => {
    e.preventDefault();
    if (!obItemCode) return;
    setManualOpeningBalance({
      itemCode: obItemCode,
      month: selectedMonth,
      year: selectedYear,
      quantity: obQty,
      totalValue: obValue
    });
    setObItemCode('');
    setObQty(0);
    setObValue(0);
  };

  const currentMonthManualOBs = manualOpeningBalances.filter(b => b.month === selectedMonth && b.year === selectedYear);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Module Hệ Thống</h1>
        <p className="text-slate-500">Quản lý tính toán giá vốn và tham số hệ thống</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Controls */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 space-y-6"
        >
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Calculator size={24} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Tính giá vốn tháng {selectedMonth + 1}/{selectedYear}</h2>
                <p className="text-sm text-slate-500">Phương pháp bình quân gia quyền cuối kỳ</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Kỳ kế toán (Tháng)</label>
                <select 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Năm tài chính</label>
                <select 
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div className={`p-4 rounded-xl border flex items-center gap-4 ${isCurrentMonthClosed ? 'bg-green-50 border-green-100 text-green-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
                {isCurrentMonthClosed ? <CheckSquare size={24} /> : <LockIcon size={24} />}
                <div className="flex-1">
                  <p className="font-bold text-sm">{isCurrentMonthClosed ? 'Tháng này đã chốt số liệu' : 'Trạng thái: Đang mở'}</p>
                  <p className="text-xs opacity-80">{isCurrentMonthClosed ? 'Mọi thay đổi hóa đơn trong tháng này đã bị khóa' : 'Vui lòng kiểm tra kỹ số liệu nhập xuất trước khi chốt.'}</p>
                </div>
                {isCurrentMonthClosed ? (
                  <button 
                    onClick={() => {
                      if (confirm(`Bạn có chắc chắn muốn MỞ LẠI sổ tháng ${selectedMonth+1}/${selectedYear}?`)) {
                        unlockMonth(selectedMonth, selectedYear);
                      }
                    }}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors flex items-center gap-2"
                  >
                    <Unlock size={14} />
                    Mở lại sổ
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      if (confirm(`Bạn có chắc chắn muốn CHỐT sổ tháng ${selectedMonth+1}/${selectedYear}? Sau khi chốt sẽ không thể chỉnh sửa hóa đơn.`)) {
                        lockMonth(selectedMonth, selectedYear);
                      }
                    }}
                    className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors flex items-center gap-2"
                  >
                    <LockIcon size={14} />
                    Chốt sổ ngay
                  </button>
                )}
              </div>

              <button 
                onClick={handleCalculate}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
              >
                <Calculator size={20} />
                Tính & Gán giá vốn toàn hệ thống
              </button>
            </div>
          </div>

          {/* Manual Opening Balance Management */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Số dư đầu kỳ thủ công</h2>
                <p className="text-sm text-slate-500">Chỉ dùng khi bắt đầu sử dụng phần mềm</p>
              </div>
              <button 
                onClick={() => setShowOBModal(true)}
                disabled={isCurrentMonthClosed}
                className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                <Plus size={18} /> Thêm số dư
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-400 text-xs font-bold uppercase">
                  <tr>
                    <th className="px-4 py-3">Mã hàng</th>
                    <th className="px-4 py-3">Số lượng</th>
                    <th className="px-4 py-3">Giá trị tồn</th>
                    <th className="px-4 py-3">Đơn giá đầu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {currentMonthManualOBs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">Chưa có số dư thủ công cho tháng này</td>
                    </tr>
                  ) : (
                    currentMonthManualOBs.map(ob => (
                      <tr key={ob.itemCode}>
                        <td className="px-4 py-3 font-semibold">{ob.itemCode}</td>
                        <td className="px-4 py-3">{ob.quantity}</td>
                        <td className="px-4 py-3">{formatCurrency(ob.totalValue)}</td>
                        <td className="px-4 py-3 text-slate-500">{formatCurrency(ob.totalValue / ob.quantity)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {/* Sidebar Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-xl">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <ShieldCheck size={18} className="text-blue-400" /> Nguyên tắc kế toán
            </h3>
            <ul className="space-y-4 text-sm text-slate-300">
              <li className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">1</div>
                <p>Giá vốn chỉ được tính sau khi đã nhập đủ tất cả hóa đơn trong tháng.</p>
              </li>
              <li className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">2</div>
                <p>Số dư đầu kỳ được tự động kết chuyển từ tồn cuối tháng trước.</p>
              </li>
              <li className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">3</div>
                <p>Đơn giá sẽ được áp đồng nhất cho tất cả các giao dịch bán trong kỳ.</p>
              </li>
            </ul>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <RotateCcw size={20} />
              <h3 className="font-bold">Khu vực nguy hiểm</h3>
            </div>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Xóa dữ liệu sẽ dọn sạch Local Storage trên trình duyệt của bạn. Hãy cân nhắc kỹ.
            </p>
            <button 
              onClick={() => {
                if (confirm('Bạn có thực sự muốn XÓA TOÀN BỘ dữ liệu bao gồm cả các tháng đã chốt?')) {
                  resetData();
                }
              }}
              className="w-full py-3 border border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={18} />
              Reset toàn bộ data
            </button>
          </div>
        </div>
      </div>

      {/* Manual OB Modal */}
      <AnimatePresence>
        {showOBModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl"
            >
              <h2 className="text-xl font-bold mb-4">Nhập số dư đầu kỳ tháng {selectedMonth+1}</h2>
              <form onSubmit={handleAddOB} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mã hàng hóa</label>
                  <select 
                    value={obItemCode}
                    onChange={(e) => setObItemCode(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Chọn mặt hàng...</option>
                    {products.map(p => <option key={p.code} value={p.code}>{p.code} - {p.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Số lượng tồn</label>
                    <input 
                      type="number" 
                      value={obQty}
                      onChange={(e) => setObQty(parseFloat(e.target.value))}
                      required
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Giá trị tồn (VNĐ)</label>
                    <input 
                      type="number" 
                      value={obValue}
                      onChange={(e) => setObValue(parseFloat(e.target.value))}
                      required
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowOBModal(false)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-lg"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-lg shadow-lg shadow-blue-500/20"
                  >
                    Lưu số dư
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
