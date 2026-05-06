import React, { useState } from 'react';
import { useInventory } from '../InventoryContext';
import { Calculator, RotateCcw, ShieldCheck, Lock as LockIcon, Unlock, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, formatQuantity } from '../lib/utils';

export default function SystemSettings() {
  const { calculateMonthlyCOGS, resetData, products, setManualOpeningBalance, manualOpeningBalances, lockMonth, unlockMonth, closedMonths } = useInventory();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [calcCategory, setCalcCategory] = useState<'ALL' | 'INVENTORY' | 'REVENUE'>('INVENTORY');
  const [showOBModal, setShowOBModal] = useState(false);

  // Manual OB Form State
  const [obItemCode, setObItemCode] = useState('');
  const [obItemName, setObItemName] = useState('');
  const [obQty, setObQty] = useState(0);
  const [obValue, setObValue] = useState(0);
  const [isSavingOB, setIsSavingOB] = useState(false);
  const [useCustomCode, setUseCustomCode] = useState(false);

  const months = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
  const isCurrentMonthClosed = closedMonths.includes(`${selectedMonth + 1}-${selectedYear}`);

  const handleCalculate = async () => {
    const sourceFilter = calcCategory === 'ALL' ? undefined : calcCategory;
    const result = await calculateMonthlyCOGS(selectedMonth, selectedYear, sourceFilter);
    alert(result.message);
  };

  const handleAddOB = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obItemCode) return;
    setIsSavingOB(true);
    const result = await setManualOpeningBalance({
      itemCode: (obItemCode || 'KHONG-MA').trim().toUpperCase(),
      itemName: obItemName.trim(), month: selectedMonth, year: selectedYear, quantity: obQty, totalValue: obValue
    });
    if (result.success) { setShowOBModal(false); setObItemCode(''); setObQty(0); setObValue(0); }
    setIsSavingOB(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Module Hệ Thống</h1>
        <p className="text-slate-500">Quản lý tính toán giá vốn cho từng loại mặt hàng</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><Calculator size={24} /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Tính giá vốn tháng {selectedMonth + 1}/{selectedYear}</h2>
                <p className="text-sm text-slate-500">Hệ thống sẽ quét từng mã hàng riêng biệt để áp giá.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Loại mặt hàng</label>
                <select value={calcCategory} onChange={(e) => setCalcCategory(e.target.value as any)} className="w-full px-4 py-2 bg-slate-50 border rounded-lg font-bold">
                  <option value="INVENTORY">Quản lý hàng hóa (Vàng 970, 9999, ...)</option>
                  <option value="REVENUE">Dữ liệu Doanh thu & Tiền công</option>
                  <option value="ALL">Tất cả dữ liệu</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tháng</label>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="w-full px-4 py-2 border rounded-lg">
                  {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Năm</label>
                <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="w-full px-4 py-2 border rounded-lg">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div className={`p-4 rounded-xl border flex items-center gap-4 ${isCurrentMonthClosed ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                {isCurrentMonthClosed ? <CheckSquare size={24} /> : <LockIcon size={24} />}
                <div className="flex-1">
                  <p className="font-bold">{isCurrentMonthClosed ? 'Tháng này đã chốt' : 'Trạng thái: Đang mở'}</p>
                </div>
                {!isCurrentMonthClosed ? (
                  <button onClick={() => lockMonth(selectedMonth, selectedYear)} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold">Chốt sổ</button>
                ) : (
                  <button onClick={() => unlockMonth(selectedMonth, selectedYear)} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold">Mở sổ</button>
                )}
              </div>
              <button onClick={handleCalculate} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg">Tính & Gán giá vốn toàn hệ thống</button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Số dư đầu kỳ thủ công</h2>
              <button onClick={() => setShowOBModal(true)} className="flex items-center gap-2 text-blue-600 font-bold"><Plus size={18} /> Thêm số dư</button>
            </div>
            <table className="w-full">
              <thead className="bg-slate-50 text-xs font-bold">
                <tr><th className="p-3">Mã hàng</th><th className="p-3">Số lượng</th><th className="p-3">Giá trị</th></tr>
              </thead>
              <tbody>
                {manualOpeningBalances.filter(b => b.month === selectedMonth && b.year === selectedYear).map((ob, i) => (
                  <tr key={i} className="border-t text-sm"><td className="p-3">{ob.itemCode}</td><td className="p-3">{formatQuantity(ob.quantity)}</td><td className="p-3">{formatCurrency(ob.totalValue)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 p-6 rounded-2xl text-white">
            <h3 className="font-bold mb-4 flex items-center gap-2"><ShieldCheck size={18} /> Lưu ý</h3>
            <p className="text-sm text-slate-300">Hệ thống tính giá bình quân gia quyền cho từng mặt hàng dựa trên mã hàng hoặc tên hàng (nếu không có mã).</p>
          </div>
          <button onClick={resetData} className="w-full py-3 border border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-50 flex items-center justify-center gap-2">
            <Trash2 size={18} /> Reset toàn bộ data
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showOBModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl">
              <h2 className="text-xl font-bold mb-4">Nhập số dư đầu kỳ tháng {selectedMonth+1}</h2>
              <form onSubmit={handleAddOB} className="space-y-4">
                <input type="text" placeholder="Mã hàng" value={obItemCode} onChange={e => setObItemCode(e.target.value)} className="w-full p-2 border rounded" required />
                <input type="number" placeholder="Số lượng" value={obQty} onChange={e => setObQty(parseFloat(e.target.value))} className="w-full p-2 border rounded" required />
                <input type="number" placeholder="Tổng giá trị" value={obValue} onChange={e => setObValue(parseFloat(e.target.value))} className="w-full p-2 border rounded" required />
                <div className="flex gap-2"><button type="submit" className="flex-1 bg-blue-600 text-white p-2 rounded">Lưu</button><button onClick={() => setShowOBModal(false)} className="flex-1 bg-slate-100 p-2 rounded">Đóng</button></div>
              </form>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
