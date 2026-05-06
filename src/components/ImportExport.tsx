import React, { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useInventory } from '../InventoryContext';
import { Upload, FileDown, AlertCircle, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Transaction, TransactionSource } from '../types';
import { extractInvoiceFromPdf, convertExtractedToTransactions } from '../services/geminiService';

interface ImportExportProps {
  mode: 'REVENUE' | 'INVENTORY';
}

const parseVnNumber = (val: string | number | undefined, isQuantity: boolean = false): number => {
  if (val === undefined || val === null) return 0;
  let str = val.toString().trim();
  if (!str) return 0;
  
  // Clean characters
  str = str.replace(/[₫\s]/g, '');

  // Case 1: Both . and , are present
  if (str.includes('.') && str.includes(',')) {
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    if (lastComma > lastDot) {
      // VN Style: 1.234.567,89 -> 1234567.89
      return parseFloat(str.replace(/\./g, '').replace(/,/g, '.')) || 0;
    } else {
      // US Style: 1,234,567.89 -> 1234567.89
      return parseFloat(str.replace(/,/g, '')) || 0;
    }
  }

  // Case 2: Only comma ,
  if (str.includes(',')) {
    const commas = (str.match(/,/g) || []).length;
    if (commas > 1) {
      // Multiple commas: 1,234,567 -> 1234567
      return parseFloat(str.replace(/,/g, '')) || 0;
    }
    // Single comma: 1,234
    // If it's a quantity (weight) or a small value, it's likely decimal 1.234
    if (isQuantity || parseFloat(str.replace(',', '.')) < 500) {
       return parseFloat(str.replace(',', '.')) || 0;
    }
    // Otherwise it's likely 1234 (thousands)
    return parseFloat(str.replace(/,/g, '')) || 0;
  }

  // Case 3: Only dot .
  if (str.includes('.')) {
    const dots = (str.match(/\./g) || []).length;
    if (dots > 1) {
      // Multiple dots: 1.234.567
      const parts = str.split('.');
      const last = parts.pop()!;
      
      if (isQuantity) {
        // For quantity (gold weight), the last part is almost always the decimal part
        // Example: 1.234.567 -> 1234.567 (1 lượng 2 chỉ 3 phân 4 ly...)
        return parseFloat(parts.join('') + '.' + last) || 0;
      }
      
      if (last.length === 3 && parts[parts.length-1].length === 3) {
         // Money/Large numbers: 1.234.000 -> 1234000
         return parseFloat(parts.join('') + last) || 0;
      }
      return parseFloat(parts.join('') + '.' + last) || 0;
    }
    
    // One dot: 1.234
    // Ambiguous case. 
    if (isQuantity) {
      // For gold weight, 1.234 is almost certainly 1 point 234.
      // Even if it's 1,234 items, "one point something" items is impossible, 
      // but in this gold app, quantity is mostly weight.
      return parseFloat(str);
    }
    
    const parts = str.split('.');
    if (parts[1].length === 3) {
       // Price 5.000 -> 5000
       const val = parseFloat(str.replace('.', ''));
       if (val >= 1000) return val;
    }
    return parseFloat(str);
  }

  return parseFloat(str) || 0;
};

export default function ImportExport({ mode }: ImportExportProps) {
  const { importTransactions, transactions, isMonthClosed } = useInventory();
  const [importType, setImportType] = useState<'IN' | 'OUT'>(mode === 'REVENUE' ? 'OUT' : 'IN');
  const [logs, setLogs] = useState<{ msg: string; type: 'success' | 'error' | 'info' | 'loading' }[]>([]);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      if (mode === 'REVENUE') {
        setLogs([{ msg: 'Chức năng nhập PDF chỉ hỗ trợ cho hóa đơn Tồn kho.', type: 'error' }]);
        return;
      }
      handlePdfUpload(file);
      return;
    }

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (isExcel && mode === 'INVENTORY') {
       setLogs([{ msg: 'Dữ liệu tồn kho hiện tại chỉ hỗ trợ file CSV hoặc PDF AI.', type: 'error' }]);
       return;
    }

    setLogs([{ msg: `Đang xử lý file ${isExcel ? 'Excel' : 'CSV'}: ${file.name}...`, type: 'info' }]);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        processImportData(rows.map(row => row.map(cell => cell === undefined || cell === null ? '' : cell.toString())), file.name);
      };
      reader.readAsBinaryString(file);
    } else {
      Papa.parse(file, {
        complete: (results) => {
          processImportData(results.data as string[][], file.name);
        },
        error: (err) => {
          setLogs(prev => [...prev, { msg: `Lỗi đọc file: ${err.message}`, type: 'error' }]);
        }
      });
    }

    e.target.value = '';
  };

  const processImportData = (data: string[][], fileName: string) => {
    if (data.length < 5) {
      setLogs(prev => [...prev, { msg: 'File không đúng định dạng mẫu (thiếu dữ liệu).', type: 'error' }]);
      return;
    }

    let isDetailedReport = false;
    let headerRowIdx = -1;

    for (let i = 0; i < Math.min(15, data.length); i++) {
       const row = data[i];
       if (row.some(c => c?.toString().includes('Số hóa đơn')) && row.some(c => c?.toString().includes('Mã hàng hóa'))) {
         isDetailedReport = true;
         headerRowIdx = i;
         break;
       }
    }

    if (isDetailedReport) {
      if (mode === 'INVENTORY') {
         setLogs(prev => [...prev, { msg: 'File này là Báo cáo chi tiết (Doanh thu). Vui lòng chuyển sang menu Doanh thu để nhập.', type: 'error' }]);
         return;
      }
      processDetailedImport(data, headerRowIdx);
    } else {
      if (mode === 'REVENUE') {
        setLogs(prev => [...prev, { msg: 'File này không phải Báo cáo chi tiết. Vui lòng kiểm tra lại.', type: 'error' }]);
        return;
      }
      processPnjImport(data);
    }
  };

  const processDetailedImport = (data: string[][], headerIdx: number) => {
    const rows = data.slice(headerIdx + 1);
    const items: Omit<Transaction, 'id'>[] = [];
    let successCount = 0;
    const importDate = new Date().toISOString().split('T')[0];

    rows.forEach(row => {
      if (!row[3] || !row[14]) return; 
      
      const invoiceNum = row[3]?.toString().trim();
      let rawDate = row[4]?.toString().trim() || '';
      let invoiceDate = rawDate;
      if (rawDate.includes('/')) {
        const datePart = rawDate.split(' ')[0];
        const [d, m, y] = datePart.split('/');
        invoiceDate = `${y}-${m}-${d}`;
      }

      const customer = row[7]?.toString().trim() || 'Khách lẻ';
      const customerCard = row[11]?.toString().trim() || '';
      const address = row[13]?.toString().trim() || '';
      const itemCode = row[14]?.toString().trim() || 'KHONG-MA';
      const itemName = row[15]?.toString().trim() || 'Hàng hóa';
      const unit = row[17]?.toString().trim() || 'Chỉ';
      
      const quantity = parseVnNumber(row[18], true);
      const price = parseVnNumber(row[19], false);
      const total = parseVnNumber(row[20], false);

      items.push({
        type: importType,
        source: 'REVENUE',
        date: importDate,
        invoiceDate,
        invoiceNumber: invoiceNum,
        customer,
        customerCard,
        address,
        itemCode,
        itemName,
        unit,
        quantity,
        price,
        total,
        discount: 0
      });
      successCount++;
    });

    if (items.length > 0) {
      importTransactions(items);
      setLogs(prev => [...prev, { msg: `Đã nhập thành công ${successCount} dòng từ báo cáo chi tiết (Doanh thu).`, type: 'success' }]);
    } else {
      setLogs(prev => [...prev, { msg: 'Không tìm thấy dữ liệu hợp lệ trong báo cáo chi tiết.', type: 'error' }]);
    }
  };

  const processPnjImport = (data: string[][]) => {
    const titleRow = data[0][0] || '';
    const secondColHeader = data[0][1] || '';
    
    let invoiceNum = '';
    if (importType === 'OUT') {
      const match = titleRow.match(/(?:Số|No|HD|HĐ)[:\s]*([A-Z0-9\-/]+)/i);
      invoiceNum = match ? match[1] : (secondColHeader || 'UNK-' + Date.now()).toString().trim();
    } else {
      const match = secondColHeader.match(/(?:Số|No|HD|HĐ)[:\s]*([A-Z0-9\-/]+)/i);
      invoiceNum = match ? match[1] : (secondColHeader || 'UNK-' + Date.now()).toString().trim();
    }
    
    let invoiceDateStr = (data[2][1] || '').toString().trim();
    if (!invoiceDateStr || !invoiceDateStr.includes('/')) {
      const searchRange = data.slice(0, 5);
      searchRange.forEach(row => {
        row.forEach(cell => {
          const dateMatch = cell.match(/Ngày:\s*(\d{2}\/\d{2}\/\d{4})/);
          if (dateMatch) invoiceDateStr = dateMatch[1];
        });
      });
    }

    const importDate = new Date().toISOString().split('T')[0];
    let formattedInvoiceDate = invoiceDateStr;
    if (invoiceDateStr.includes('/')) {
      const [d, m, y] = invoiceDateStr.split('/');
      formattedInvoiceDate = `${y}-${m}-${d}`;
    }
    
    let sellerName = '';
    let buyerName = '';
    let address = '';
    let customerCard = '';
    
    data.slice(0, 12).forEach(row => {
      const content = row.join(' ').toLowerCase();
      if (content.includes('đơn vị bán hàng') || content.includes('người bán')) {
        sellerName = row.find((cell, idx) => idx > 0 && cell && cell.trim())?.trim() || '';
      }
      if (content.includes('họ tên người mua') || content.includes('người mua') || content.includes('đơn vị mua')) {
        buyerName = row.find((cell, idx) => idx > 0 && cell && cell.trim())?.trim() || '';
      }
      if (content.includes('địa chỉ')) {
        address = row.find((cell, idx) => idx > 0 && cell && cell.trim())?.trim() || '';
      }
      if (content.includes('cccd') || content.includes('số thẻ') || content.includes('passport')) {
        customerCard = row.find((cell, idx) => idx > 0 && cell && cell.trim())?.trim() || '';
      }
    });

    if (!sellerName) sellerName = (data[1][1] || '').trim();
    if (!buyerName) buyerName = (data[4][1] || '').trim();
    
    const customerName = importType === 'IN' ? sellerName : buyerName;

    const isDuplicate = transactions.some(t => 
      t.invoiceNumber === invoiceNum && 
      (t.invoiceDate === formattedInvoiceDate || t.date === formattedInvoiceDate) && 
      t.customer === customerName &&
      t.type === importType &&
      t.source === 'INVENTORY'
    );

    if (isDuplicate) {
      setLogs(prev => [...prev, { msg: `CẢNH BÁO: Hóa đơn tồn kho số ${invoiceNum} từ ${customerName} đã tồn tại.`, type: 'error' }]);
      return;
    }

    if (isMonthClosed(importDate, formattedInvoiceDate)) {
      setLogs(prev => [...prev, { msg: `CẢNH BÁO: Hóa đơn thuộc vào tháng đã chốt sổ (${invoiceDateStr}).`, type: 'error' }]);
      return;
    }

    let dataStartIndex = 0;
    let colIdx = { code: -1, name: -1, unit: -1, qty: -1, price: -1, total: -1 };
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (row.some(cell => cell?.toString().toLowerCase().includes('tên hàng'))) {
        dataStartIndex = i + 1;
        const header = row.map(c => c?.toString().toLowerCase() || '');
        colIdx = {
          code: header.findIndex(c => c.includes('mã hàng') || c === 'mã'),
          name: header.findIndex(c => c.includes('tên hàng') || c.includes('tên hàng hóa')),
          unit: header.findIndex(c => c.includes('đvt') || c.includes('đơn vị tính')),
          qty: header.findIndex(c => c.includes('số lượng') || c === 'sl'),
          price: header.findIndex(c => c.includes('đơn giá')),
          total: header.findIndex(c => c.includes('thành tiền') || c.includes('tổng cộng tiền'))
        };
        break;
      }
    }

    if (dataStartIndex === 0 || colIdx.name === -1) {
      setLogs(prev => [...prev, { msg: 'Không tìm thấy dòng tiêu đề (Tên hàng) hợp lệ.', type: 'error' }]);
      return;
    }

    const items: Omit<Transaction, 'id'>[] = [];
    let successCount = 0;

    for (let i = dataStartIndex; i < data.length; i++) {
      const row = data[i];
      const rawName = row[colIdx.name]?.toString().trim() || '';
      if (!rawName || rawName.includes('CỘNG TIỀN')) break;
      if (row.every(cell => !cell)) continue;

      let itemCode = '';
      let itemName = '';
      const rawCode = colIdx.code !== -1 ? row[colIdx.code]?.toString().trim() : '';
      const codeRegex = /^[A-Z0-9.]{5,}$/;
      if (codeRegex.test(rawCode)) {
        itemCode = rawCode.toUpperCase();
        itemName = rawName;
      } else {
        itemCode = rawCode || 'KHONG-MA';
        itemName = rawName;
      }

      const quantity = parseVnNumber(row[colIdx.qty], true);
      let price = parseVnNumber(row[colIdx.price], false);
      const total = parseVnNumber(row[colIdx.total], false);

      if (total > 0 && quantity > 0 && Math.abs(price * quantity - total) > 1) {
         price = total / quantity;
      }

      items.push({
        type: importType,
        source: 'INVENTORY',
        date: importDate,
        invoiceDate: formattedInvoiceDate,
        itemCode,
        itemName,
        unit: row[colIdx.unit] || 'Món',
        quantity,
        price,
        discount: 0,
        total,
        customer: customerName,
        customerCard,
        address,
        invoiceNumber: invoiceNum
      });
      successCount++;
    }

    if (items.length > 0) {
      importTransactions(items);
      setLogs(prev => [...prev, { msg: `Đã nhập thành công ${successCount} dòng từ hóa đơn tồn kho ${invoiceNum}.`, type: 'success' }]);
    } else {
      setLogs(prev => [...prev, { msg: 'Không tìm thấy dữ liệu hợp lệ để nhập.', type: 'error' }]);
    }
  };

  const handlePdfUpload = async (file: File) => {
    setIsProcessingPdf(true);
    setLogs([{ msg: `Đang phân tích hóa đơn PDF bằng AI: ${file.name}...`, type: 'loading' }]);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
      });

      const extracted = await extractInvoiceFromPdf(base64);
      const newTransactions = convertExtractedToTransactions(extracted, importType).map(t => ({
          ...t,
          source: 'INVENTORY' as TransactionSource
      }));

      const isDuplicate = transactions.some(t => 
        t.invoiceNumber === extracted.invoiceNumber && 
        t.invoiceDate === extracted.invoiceDate && 
        t.customer === extracted.customer &&
        t.type === importType &&
        t.source === 'INVENTORY'
      );

      if (isDuplicate) {
        setLogs(prev => [...prev.filter(l => l.type !== 'loading'), { msg: `CẢNH BÁO: Hóa đơn PDF số ${extracted.invoiceNumber} từ ${extracted.customer} đã tồn tại.`, type: 'error' }]);
        return;
      }

      importTransactions(newTransactions);
      setLogs(prev => [...prev.filter(l => l.type !== 'loading'), { 
        msg: `Đã nhập thành công ${newTransactions.length} hàng từ hóa đơn AI ${extracted.invoiceNumber}.`, 
        type: 'success' 
      }]);
    } catch (err: any) {
      console.error(err);
      setLogs(prev => [...prev.filter(l => l.type !== 'loading'), { msg: `Lỗi xử lý AI: ${err.message}`, type: 'error' }]);
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const isRevenue = mode === 'REVENUE';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isRevenue ? 'Quản lý Doanh thu & Tiền công' : 'Quản lý hàng hóa'}</h1>
          <p className="text-slate-500">
            {isRevenue 
               ? 'Import dữ liệu từ Báo cáo bán hàng chi tiết (.xlsx)' 
               : 'Quản lý hàng hóa (Vàng 970, 9999, 610, Bạc...)'}
          </p>
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

            <label className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl transition-all ${isProcessingPdf ? 'bg-slate-50 border-blue-300 cursor-not-allowed' : 'border-slate-300 cursor-pointer hover:bg-slate-50 hover:border-blue-400'}`}>
              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                {isProcessingPdf ? (
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
                ) : (
                  <Upload className="w-10 h-10 text-slate-400 mb-3" />
                )}
                <p className="text-sm text-slate-600">Click để chọn hoặc kéo thả file</p>
                <p className="text-xs text-slate-400 mt-1">
                   Dạng file: {isRevenue ? 'XLSX (Báo cáo chi tiết)' : 'CSV, PDF (Tồn kho)'}
                </p>
                <div className="flex gap-2 mt-2">
                   {!isRevenue && <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-bold rounded">CSV</span>}
                   <span className="px-2 py-0.5 bg-green-100 text-green-600 text-[10px] font-bold rounded">XLSX</span>
                   {!isRevenue && <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded">PDF AI</span>}
                </div>
              </div>
              <input type="file" className="hidden" accept={isRevenue ? ".xlsx,.xls" : ".csv,.xlsx,.xls,.pdf"} onChange={handleFileUpload} disabled={isProcessingPdf} />
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
                  log.type === 'loading' ? 'bg-blue-50 text-blue-700 border border-blue-100 animate-pulse' :
                  'bg-blue-50 text-blue-700 border border-blue-100'
                }`}
              >
                {log.type === 'success' ? <CheckCircle2 size={16} className="shrink-0" /> : 
                 log.type === 'loading' ? <Loader2 size={16} className="shrink-0 animate-spin" /> :
                 <AlertCircle size={16} className="shrink-0" />}
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
