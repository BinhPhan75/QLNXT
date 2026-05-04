import React, { useState } from 'react';
import Papa from 'papaparse';
import { useInventory } from '../InventoryContext';
import { Upload, FileDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Transaction } from '../types';

export default function ImportExport() {
  const { importTransactions, transactions, isMonthClosed } = useInventory();
  const [importType, setImportType] = useState<'IN' | 'OUT'>('IN');
  const [logs, setLogs] = useState<{ msg: string; type: 'success' | 'error' | 'info' }[]>([]);

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
        const secondColHeader = data[0][1] || '';
        
        // Extract Invoice Number 
        let invoiceNum = '';
        if (importType === 'OUT') {
          // Bán ra: Extract number from A1 (titleRow) e.g. "HÓA ĐƠN BÁN HÀNG - Số: 74"
          const match = titleRow.match(/(?:Số|No|HD|HĐ)[:\s]*([A-Z0-9\-/]+)/i);
          invoiceNum = match ? match[1] : (secondColHeader || 'UNK-' + Date.now()).toString().trim();
        } else {
          // Mua vào: Extract from B1 (secondColHeader)
          const match = secondColHeader.match(/(?:Số|No|HD|HĐ)[:\s]*([A-Z0-9\-/]+)/i);
          invoiceNum = match ? match[1] : (secondColHeader || 'UNK-' + Date.now()).toString().trim();
        }
        
        // Extract Invoice Date from cell B3 (data[2][1])
        let invoiceDateStr = (data[2][1] || '').toString().trim();
        
        // Fallback: search for "Ngày" label if B3 is empty or not a date
        if (!invoiceDateStr || !invoiceDateStr.includes('/')) {
          const searchRange = data.slice(0, 5);
          searchRange.forEach(row => {
            row.forEach(cell => {
              const dateMatch = cell.match(/Ngày:\s*(\d{2}\/\d{2}\/\d{4})/);
              if (dateMatch) invoiceDateStr = dateMatch[1];
            });
          });
        }

        // Import Date = Today (This will be the primary date for Reports)
        const importDate = new Date().toISOString().split('T')[0];
        
        // Format Invoice Date for display/storage (YYYY-MM-DD)
        let formattedInvoiceDate = invoiceDateStr;
        if (invoiceDateStr.includes('/')) {
          const [d, m, y] = invoiceDateStr.split('/');
          formattedInvoiceDate = `${y}-${m}-${d}`;
        }
        
        // Header info (Sender/Receiver) - Search for keywords
        let sellerName = '';
        let buyerName = '';
        
        data.slice(0, 10).forEach(row => {
          const content = row.join(' ').toLowerCase();
          if (content.includes('đơn vị bán hàng') || content.includes('người bán')) {
            sellerName = row.find((cell, idx) => idx > 0 && cell && cell.trim())?.trim() || '';
          }
          if (content.includes('họ tên người mua') || content.includes('người mua') || content.includes('đơn vị mua')) {
            buyerName = row.find((cell, idx) => idx > 0 && cell && cell.trim())?.trim() || '';
          }
        });

        if (!sellerName) sellerName = (data[1][1] || '').trim(); // Fallback to fixed rows
        if (!buyerName) buyerName = (data[4][1] || '').trim();
        
        const customerName = importType === 'IN' ? sellerName : buyerName;

        // 1. DUPLICATE CHECK
        const isDuplicate = transactions.some(t => 
          t.invoiceNumber === invoiceNum && 
          (t.invoiceDate === formattedInvoiceDate || t.date === formattedInvoiceDate) && 
          t.customer === customerName &&
          t.type === importType
        );

        if (isDuplicate) {
          setLogs(prev => [...prev, { msg: `CẢNH BÁO: Hóa đơn số ${invoiceNum} ngày ${invoiceDateStr} từ ${customerName} đã tồn tại. Hệ thống từ chối nhập trùng.`, type: 'error' }]);
          return;
        }

        // 2. CLOSED MONTH CHECK (Using formattedInvoiceDate as the accounting period)
        if (isMonthClosed(importDate, formattedInvoiceDate)) {
          setLogs(prev => [...prev, { msg: `CẢNH BÁO: Hóa đơn thuộc vào tháng đã chốt sổ (${invoiceDateStr}).`, type: 'error' }]);
          return;
        }

        // 3. DYNAMIC COLUMN DETECTION
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

        const extractCodeFromName = (text: string) => {
          // Look for typical jewelry code patterns: e.g., GD0000Y000219.460 or GNXMXMY...
          // Pattern: Starts with 2+ uppercase letters, followed by alphanumeric/dots, length at least 5
          const codeMatch = text.match(/[A-Z]{2,}[A-Z0-9.]{3,}/);
          if (codeMatch) {
            const code = codeMatch[0];
            const name = text.replace(code, '').replace(/[().,]/g, ' ').replace(/\s+/g, ' ').trim();
            return { code: code.toUpperCase(), name: name || text };
          }
          return { code: '', name: text };
        };

        const parseVnNumber = (val: string | number | undefined): number => {
          if (val === undefined || val === null) return 0;
          let str = val.toString().trim();
          if (!str) return 0;
          
          // Remove currency symbols and spaces
          str = str.replace(/[₫\s]/g, '');
          
          // Detect thousand separators and decimal points
          // Common patterns:
          // 10.423.431 -> dots are separators
          // 3.474 -> if it's a small number, could be weight decimal
          
          // Remove ALL dots and commas if there are multiple
          if ((str.match(/\./g) || []).length > 1) {
            str = str.replace(/\./g, '');
          }
          if ((str.match(/,/g) || []).length > 1) {
            str = str.replace(/,/g, '');
          }

          // Now handle mixed separators: 10.423,431 -> 10423.431
          if (str.includes('.') && str.includes(',')) {
            str = str.replace(/\./g, '').replace(/,/g, '.');
          } else if (str.includes(',')) {
            // Case 3,474 -> if no dots, comma is likely decimal
            str = str.replace(/,/g, '.');
          } else if (str.includes('.')) {
            // Case 10.423 -> if only one dot, it's ambiguous.
            // Heuristic: if it's a whole number in the spreadsheet but saved with dot,
            // or if it's jewelry weight.
            // For PNJ, total value is huge, weight is small.
            const valNum = parseFloat(str);
            if (valNum < 1000) {
              // 3.474 -> likely weight decimal
            } else {
              // 10.423 -> likely 10 thousand (separator)
              // But we can't be 100% sure without context.
              // Most PNJ CSV exports use commas for decimals.
            }
          }

          const res = parseFloat(str);
          return isNaN(res) ? 0 : res;
        };

        for (let i = dataStartIndex; i < data.length; i++) {
          const row = data[i];
          const rawName = row[colIdx.name]?.toString().trim() || '';
          if (!rawName || rawName.includes('CỘNG TIỀN')) break;
          if (row.every(cell => !cell)) continue;

          let itemCode = '';
          let itemName = '';

          const rawCode = colIdx.code !== -1 ? row[colIdx.code]?.toString().trim() : '';
          
          const codeRegex = /^[A-Z0-9.]{5,}$/;
          const codeLooksLikeCode = codeRegex.test(rawCode);
          const nameLooksLikeCode = codeRegex.test(rawName);

          if (codeLooksLikeCode && !nameLooksLikeCode) {
            itemCode = rawCode.toUpperCase();
            itemName = rawName;
          } else if (nameLooksLikeCode && !codeLooksLikeCode) {
            itemCode = rawName.toUpperCase();
            itemName = rawCode || 'Hàng hóa';
          } else if (rawCode) {
            itemCode = rawCode.toUpperCase();
            itemName = rawName;
          } else {
            const extracted = extractCodeFromName(rawName);
            itemCode = extracted.code || 'KHONG-MA';
            itemName = extracted.name;
          }

          const quantity = parseVnNumber(row[colIdx.qty]);
          let price = parseVnNumber(row[colIdx.price]);
          const total = parseVnNumber(row[colIdx.total]);

          // Math consistency: if Total is provided, it's the source of truth
          // In jewelry, Qty * Price often doesn't equal Total because of fees
          // But for simple display, we can adjust price
          if (total > 0 && quantity > 0 && Math.abs(price * quantity - total) > 1) {
             // If price is actually the weight (e.g. 3.474) and quantity is count (1)
             // Then price * quantity = 3.474, but total = 10.4M.
             // We adjust price to be 10.4M/1 = 10.4M so UI adds up.
             price = total / quantity;
          }

          items.push({
            type: importType,
            date: importDate,
            invoiceDate: formattedInvoiceDate,
            itemCode: itemCode,
            itemName: itemName,
            unit: row[colIdx.unit] || 'Món',
            quantity,
            price,
            discount: 0,
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
