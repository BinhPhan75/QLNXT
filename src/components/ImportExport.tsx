import React from 'react';
import Papa from 'papaparse';
import { useInventory } from '../InventoryContext';
import { Upload, FileDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Transaction } from '../types';

export default function ImportExport() {
  const { importTransactions, transactions, isMonthClosed } = useInventory();
  const [importType, setImportType] = useState<'IN' | 'OUT'>('IN');
  const [logs, setLogs] = useState<{ msg: string; type: 'success' | 'error' | 'info' }[]>([]);

  function useState(arg0: string): [any, any] {
    return React.useState(arg0);
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogs([{ msg: `Đang xử lý file: ${file.name}...`, type: 'info' }]);

    Papa.parse(file, {
      complete: (results) => {
        const data = results.data as string[][];
        if (data.length < 6) {
          setLogs(prev => [...prev, { msg: 'File không đúng định dạng mẫu (thiếu dữ liệu).', type: 'error' }]);
          return;
        }

        // Header usually has seller/buyer info
        const titleRow = data[0][0] || '';
        const invoiceNum = titleRow.match(/Số: (\d+)/)?.[1] || 'UNK-' + Date.now();
        const dateMatch = titleRow.match(/Ngày (\d{2}\/\d{2}\/\d{4})/);
        const invoiceDateStr = dateMatch ? dateMatch[1] : new Date().toLocaleDateString('vi-VN');
        
        // Convert to ISO for comparison
        const [d, m, y] = invoiceDateStr.split('/');
        const isoInvoiceDate = `${y}-${m}-${d}`;

        // Header info (Sender/Receiver)
        const sellerRow = data[1][0] || '';
        const buyerRow = data[2][0] || '';
        
        let customerName = importType === 'IN' ? sellerRow : buyerRow;
        customerName = customerName.replace(/Người (bán|mua): /, '').split('|')[0].trim();

        // 1. DUPLICATE CHECK
        const isDuplicate = transactions.some(t => 
          t.invoiceNumber === invoiceNum && 
          t.date === isoInvoiceDate && 
          t.customer === customerName &&
          t.type === importType
        );

        if (isDuplicate) {
          setLogs(prev => [...prev, { msg: `CẢNH BÁO: Hóa đơn số ${invoiceNum} ngày ${invoiceDateStr} từ ${customerName} đã tồn tại trong hệ thống. Hệ thống từ chối nhập trùng.`, type: 'error' }]);
          return;
        }

        // 2. CLOSED MONTH CHECK
        if (isMonthClosed(isoInvoiceDate)) {
          setLogs(prev => [...prev, { msg: `CẢNH BÁO: Hóa đơn thuộc vào tháng đã chốt sổ (${invoiceDateStr}). Không thể nhập dữ liệu vào tháng đã khóa.`, type: 'error' }]);
          return;
        }

        // Data starts from index 5 (Row 6)
        const header = data[4];
        if (!header || !header.includes('Mã hàng')) {
          setLogs(prev => [...prev, { msg: 'Không tìm thấy cột "Mã hàng" ở hàng số 5.', type: 'error' }]);
          return;
        }

        const items: Omit<Transaction, 'id'>[] = [];
        let successCount = 0;

        for (let i = 5; i < data.length; i++) {
          const row = data[i];
          if (!row[3]) continue; 

          if (row[0] && row[0].toString().includes('TỔNG CỘNG')) break;
          if (row.every(cell => !cell)) continue; 

          const qtyStr = row[5]?.toString().replace(/,/g, '') || '0';
          const priceStr = row[6]?.toString().replace(/[",]/g, '') || '0';
          const totalStr = row[8]?.toString().replace(/[",]/g, '') || '0';

          const quantity = parseFloat(qtyStr);
          const price = parseFloat(priceStr);
          const total = parseFloat(totalStr);

          items.push({
            type: importType,
            date: isoInvoiceDate,
            itemCode: row[3],
            itemName: row[2],
            unit: row[4],
            quantity,
            price,
            discount: parseFloat(row[7]?.toString() || '0'),
            total,
            customer: customerName,
            invoiceNumber: invoiceNum
          });
          successCount++;
        }

        if (items.length > 0) {
          importTransactions(items);
          setLogs(prev => [...prev, { msg: `Đã nhập thành công ${successCount} dòng từ hóa đơn ${invoiceNum}.`, type: 'success' }]);
        } else {
          setLogs(prev => [...prev, { msg: 'Không tìm thấy dữ liệu hợp lệ để nhập.', type: 'error' }]);
        }
      },
      error: (err) => {
        setLogs(prev => [...prev, { msg: `Lỗi đọc file: ${err.message}`, type: 'error' }]);
      }
    });

    e.target.value = '';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nhập/Xuất Kho</h1>
          <p className="text-slate-500">Import dữ liệu từ file CSV mẫu (PNJ)</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${importType === 'IN' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
              <Upload size={20} />
            </div>
            <h2 className="text-lg font-semibold">Tải lên dữ liệu</h2>
          </div>

          <div className="space-y-4">
            <div className="flex p-1 bg-slate-100 rounded-lg">
              <button 
                onClick={() => setImportType('IN')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${importType === 'IN' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Nhập hàng
              </button>
              <button 
                onClick={() => setImportType('OUT')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${importType === 'OUT' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Xuất hàng
              </button>
            </div>

            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 hover:border-blue-400 transition-all">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-10 h-10 text-slate-400 mb-3" />
                <p className="text-sm text-slate-600">Click để chọn hoặc kéo thả file CSV</p>
                <p className="text-xs text-slate-400 mt-1">Dẫn mẫu: HOÁ ĐƠN {importType === 'IN' ? 'MUA' : 'BÁN'}</p>
              </div>
              <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
            </label>
          </div>
        </motion.div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full">
          <h2 className="text-lg font-semibold mb-4">Trạng thái xử lý</h2>
          <div className="flex-1 overflow-y-auto space-y-3 min-h-[200px]">
            {logs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 italic text-sm">
                <AlertCircle size={32} className="mb-2 opacity-20" />
                Chưa có hoạt động
              </div>
            )}
            {logs.map((log, i) => (
              <div 
                key={i} 
                className={`flex gap-3 text-sm p-3 rounded-lg ${
                  log.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' :
                  log.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' :
                  'bg-blue-50 text-blue-700 border border-blue-100'
                }`}
              >
                {log.type === 'success' ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
                {log.msg}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3 text-blue-800 text-sm">
        <AlertCircle size={20} className="shrink-0" />
        <div>
          <p className="font-bold mb-1">Hướng dẫn mẫu file:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Hàng 1: Tiêu đề hóa đơn (có ngày tháng)</li>
            <li>Hàng 5: Tiêu đề cột (STT, NGAY, Tên hàng hóa, Mã hàng, ĐVT, Số lượng, Đơn giá...)</li>
            <li>Dữ liệu bắt đầu từ hàng 6.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
