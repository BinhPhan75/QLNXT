import React, { useState, useMemo } from 'react';
import { useInventory } from '../InventoryContext';
import { formatCurrency, formatQuantity } from '../lib/utils';
import { Printer, FileSearch, Calendar, Package } from 'lucide-react';

export default function NXTReport() {
  const { products, getNXTReportData } = useInventory();
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.ceil((new Date().getMonth() + 1) / 3));

  const reportData = useMemo(() => {
    if (!selectedProduct) return [];
    return getNXTReportData(selectedProduct, selectedYear, selectedQuarter);
  }, [selectedProduct, selectedYear, selectedQuarter, getNXTReportData]);

  const totals = useMemo(() => {
    if (reportData.length === 0) return null;
    return {
      openingQty: reportData[0].opening.qty,
      openingValue: reportData[0].opening.value,
      inQty: reportData.reduce((sum, r) => sum + r.in.qty, 0),
      inValue: reportData.reduce((sum, r) => sum + r.in.value, 0),
      outQty: reportData.reduce((sum, r) => sum + r.out.qty, 0),
      outValue: reportData.reduce((sum, r) => sum + r.out.value, 0),
      closingQty: reportData[reportData.length - 1].closing.qty,
      closingValue: reportData[reportData.length - 1].closing.value,
    };
  }, [reportData]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2">
              <Package className="text-blue-600" />
              Báo cáo Nhập Xuất Tồn
            </h1>
            <p className="text-slate-500 text-sm">Theo dõi biến động hàng hóa và giá vốn bình quân gia quyền theo quý</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center min-w-[200px]">
              <div className="relative w-full">
                <Package size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="pl-10 w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 transition-all"
                >
                  <option value="">-- Chọn mặt hàng --</option>
                  {products.map(p => (
                    <option key={p.key} value={p.key}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-slate-400" />
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 w-24"
              >
                {[...Array(5)].map((_, i) => {
                  const y = new Date().getFullYear() - 2 + i;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(Number(e.target.value))}
                className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 w-24"
              >
                <option value={1}>Quý 1</option>
                <option value={2}>Quý 2</option>
                <option value={3}>Quý 3</option>
                <option value={4}>Quý 4</option>
              </select>
            </div>

            <button
              onClick={handlePrint}
              disabled={!selectedProduct || reportData.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer size={18} />
              In báo cáo
            </button>
          </div>
        </div>
      </div>

      {/* Report Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:border-none print:shadow-none">
        <div className="p-8 text-center hidden print:block">
           <h2 className="text-xl font-bold uppercase mb-1">CTY TNHH MTV VÀNG BẠC NGHĨA TÍN</h2>
           <p className="text-sm italic mb-4">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
           <h1 className="text-2xl font-black mb-1">BẢNG KÊ NHẬP XUẤT TỒN HÀNG HÓA</h1>
           <p className="text-lg font-bold">QUÝ {selectedQuarter} NĂM {selectedYear}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-widest border-b border-slate-200">
              <tr>
                <th rowSpan={2} className="px-4 py-3 border-r border-slate-200 bg-slate-100/50">Tháng</th>
                <th rowSpan={2} className="px-4 py-3 border-r border-slate-200 bg-slate-100/50">Tên hàng hóa</th>
                <th colSpan={3} className="px-4 py-2 border-r border-slate-200 text-center bg-blue-50/30">Tồn đầu kỳ</th>
                <th colSpan={3} className="px-4 py-2 border-r border-slate-200 text-center bg-emerald-50/30">Nhập trong kỳ</th>
                <th colSpan={3} className="px-4 py-2 border-r border-slate-200 text-center bg-rose-50/30">Xuất trong kỳ</th>
                <th colSpan={3} className="px-4 py-2 text-center bg-amber-50/30">Tồn cuối kỳ</th>
              </tr>
              <tr className="border-b border-slate-200">
                <th className="px-2 py-2 border-r border-slate-200 text-center min-w-[70px]">SL (chỉ)</th>
                <th className="px-2 py-2 border-r border-slate-200 text-center min-w-[100px]">Đơn giá</th>
                <th className="px-2 py-2 border-r border-slate-200 text-center min-w-[120px]">Giá trị</th>
                <th className="px-2 py-2 border-r border-slate-200 text-center min-w-[70px]">SL (chỉ)</th>
                <th className="px-2 py-2 border-r border-slate-200 text-center min-w-[100px]">Đơn giá</th>
                <th className="px-2 py-2 border-r border-slate-200 text-center min-w-[120px]">Giá trị</th>
                <th className="px-2 py-2 border-r border-slate-200 text-center min-w-[70px]">SL (chỉ)</th>
                <th className="px-2 py-2 border-r border-slate-200 text-center min-w-[100px]">Đơn giá</th>
                <th className="px-2 py-2 border-r border-slate-200 text-center min-w-[120px]">Giá trị</th>
                <th className="px-2 py-2 border-r border-slate-200 text-center min-w-[70px]">SL (chỉ)</th>
                <th className="px-2 py-2 border-r border-slate-200 text-center min-w-[100px]">Đơn giá</th>
                <th className="px-2 py-2 text-center min-w-[120px]">Giá trị</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px]">
              {reportData.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-6 py-20 text-center text-slate-400 italic bg-white">
                    {selectedProduct 
                      ? "Không có dữ liệu giao dịch cho mặt hàng này trong quý đã chọn." 
                      : "Vui lòng chọn mặt hàng để xem báo cáo."}
                  </td>
                </tr>
              ) : (
                <>
                  {reportData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 border-r border-slate-100 font-medium whitespace-nowrap">{row.monthLabel}</td>
                      <td className="px-4 py-3 border-r border-slate-100 font-medium">{row.itemName}</td>
                      
                      {/* Opening */}
                      <td className="px-2 py-3 border-r border-slate-100 text-right">{formatQuantity(row.opening.qty)}</td>
                      <td className="px-2 py-3 border-r border-slate-100 text-right text-slate-500">{formatCurrency(row.opening.price)}</td>
                      <td className="px-2 py-3 border-r border-slate-100 text-right font-medium">{formatCurrency(row.opening.value)}</td>
                      
                      {/* In */}
                      <td className="px-2 py-3 border-r border-slate-100 text-right text-emerald-700">{formatQuantity(row.in.qty)}</td>
                      <td className="px-2 py-3 border-r border-slate-100 text-right text-slate-500">{formatCurrency(row.in.price)}</td>
                      <td className="px-2 py-3 border-r border-slate-100 text-right font-medium text-emerald-700">{formatCurrency(row.in.value)}</td>
                      
                      {/* Out */}
                      <td className="px-2 py-3 border-r border-slate-100 text-right text-rose-700">{formatQuantity(row.out.qty)}</td>
                      <td className="px-2 py-3 border-r border-slate-100 text-right text-slate-500">{formatCurrency(row.out.price)}</td>
                      <td className="px-2 py-3 border-r border-slate-100 text-right font-medium text-rose-700">{formatCurrency(row.out.value)}</td>
                      
                      {/* Closing */}
                      <td className="px-2 py-3 border-r border-slate-100 text-right text-blue-700">{formatQuantity(row.closing.qty)}</td>
                      <td className="px-2 py-3 border-r border-slate-100 text-right text-slate-500">{formatCurrency(row.closing.price)}</td>
                      <td className="px-2 py-3 text-right font-bold text-blue-700">{formatCurrency(row.closing.value)}</td>
                    </tr>
                  ))}
                  
                  {/* Totals Row */}
                  {totals && (
                    <tr className="bg-slate-900 text-white font-bold">
                      <td colSpan={2} className="px-4 py-4 text-center uppercase tracking-wider">Tổng cộng</td>
                      
                      {/* Summary for Qtr Opening Balance */}
                      <td className="px-2 py-4 text-right bg-slate-800">{formatQuantity(totals.openingQty)}</td>
                      <td className="px-2 py-4 text-right bg-slate-800 opacity-50">-</td>
                      <td className="px-2 py-4 text-right bg-slate-800">{formatCurrency(totals.openingValue)}</td>
                      
                      {/* Summary for Total In */}
                      <td className="px-2 py-4 text-right bg-emerald-950/30 text-emerald-400">{formatQuantity(totals.inQty)}</td>
                      <td className="px-2 py-4 text-right bg-emerald-950/30 text-emerald-400 opacity-50">-</td>
                      <td className="px-2 py-4 text-right bg-emerald-950/30 text-emerald-400">{formatCurrency(totals.inValue)}</td>
                      
                      {/* Summary for Total Out */}
                      <td className="px-2 py-4 text-right bg-rose-950/30 text-rose-400">{formatQuantity(totals.outQty)}</td>
                      <td className="px-2 py-4 text-right bg-rose-950/30 text-rose-400 opacity-50">-</td>
                      <td className="px-2 py-4 text-right bg-rose-950/30 text-rose-400">{formatCurrency(totals.outValue)}</td>
                      
                      {/* Summary for Qtr Closing Balance */}
                      <td className="px-2 py-4 text-right bg-blue-950/30 text-blue-400">{formatQuantity(totals.closingQty)}</td>
                      <td className="px-2 py-4 text-right bg-blue-950/30 text-blue-400 opacity-50">-</td>
                      <td className="px-2 py-4 text-right bg-blue-950/30 text-blue-400">{formatCurrency(totals.closingValue)}</td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Summary Box & Signatures */}
        <div className="p-8">
          <div className="flex flex-col md:flex-row justify-between gap-12">
            <div className="flex-1 max-w-sm ml-auto print:ml-auto">
              {totals && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-slate-600">Dthu (Cộng giá bán):</span>
                    <span className="font-bold text-slate-900">{formatCurrency(reportData.reduce((sum, r) => sum + r.out.value * 1.1, 0))}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-2">
                    <span className="font-bold text-slate-600">GTGT:</span>
                    <span className="font-bold text-slate-900">{formatCurrency(reportData.reduce((sum, r) => sum + r.out.value, 0))}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-2">
                    <span className="font-bold text-slate-600">Thuế GTGT (10%):</span>
                    <span className="font-bold text-slate-900">{formatCurrency(reportData.reduce((sum, r) => sum + r.out.value * 0.1, 0))}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 text-center gap-8 px-4 print:px-0">
             <div className="space-y-16">
                <p className="font-bold uppercase">NGƯỜI LẬP BIỂU</p>
                <div className="pt-4">
                  <p className="text-slate-400 italic text-xs print:text-black">(Ký và ghi rõ họ tên)</p>
                </div>
             </div>
             <div></div>
             <div className="space-y-4">
                <p className="italic text-sm">Tam Kỳ, ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}</p>
                <p className="font-bold uppercase">GIÁM ĐỐC</p>
                <div className="pt-16">
                  <p className="text-slate-400 italic text-xs print:text-black">(Ký tên và đóng dấu)</p>
                </div>
             </div>
          </div>
        </div>
      </div>
      
      {/* Help Note */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-start gap-4 print:hidden">
        <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
          <FileSearch size={20} />
        </div>
        <div>
          <h4 className="font-bold text-blue-800 text-sm">Ghi chú quan trọng</h4>
          <p className="text-blue-700 text-xs mt-1 leading-relaxed">
            Dữ liệu được tính toán tự động dựa trên giao dịch nhập vào và xuất ra của từng mặt hàng. 
            Hệ thống sử dụng phương pháp <strong>Bình quân gia quyền cuối kỳ</strong> (theo từng tháng) để tính giá trị xuất kho. 
            Nếu có chênh lệch, vui lòng kiểm tra lại Số dư đầu kỳ trong phần Cấu hình hệ thống.
          </p>
        </div>
      </div>
    </div>
  );
}
