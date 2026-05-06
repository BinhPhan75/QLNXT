import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useInventory } from '../InventoryContext';
import { Upload, AlertCircle, CheckCircle2, Loader2, Search, Filter, BrainCircuit } from 'lucide-react';
import { motion } from 'motion/react';
import { BankStatement, BankClassification } from '../types';
import { classifyBankStatements } from '../services/geminiService';

export default function BankStatements() {
  const { bankStatements, importBankStatements } = useInventory();
  const [logs, setLogs] = useState<{ msg: string; type: 'success' | 'error' | 'info' | 'loading' }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterType, setFilterType] = useState<BankClassification | 'ALL'>('ALL');
  const [searchTerm, setSearchSearchTerm] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogs([{ msg: `Đang đọc file sao kê: ${file.name}...`, type: 'info' }]);
    setIsProcessing(true);

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];
        try {
          await processBankData(data);
        } catch (err: any) {
          setLogs(prev => [...prev, { msg: `Lỗi xử lý: ${err.message}`, type: 'error' }]);
          setIsProcessing(false);
        }
      };
      reader.onerror = (err) => {
        setLogs(prev => [...prev, { msg: `Lỗi đọc file: ${err}`, type: 'error' }]);
        setIsProcessing(false);
      };
      reader.readAsBinaryString(file);
    } else {
      Papa.parse(file, {
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const data = results.data as string[][];
            await processBankData(data);
          } catch (err: any) {
            setLogs(prev => [...prev, { msg: `Lỗi xử lý: ${err.message}`, type: 'error' }]);
            setIsProcessing(false);
          }
        },
        error: (err) => {
          setLogs(prev => [...prev, { msg: `Lỗi đọc file: ${err.message}`, type: 'error' }]);
          setIsProcessing(false);
        }
      });
    }

    e.target.value = '';
  };

  const processBankData = async (data: string[][]) => {
    // Look for the header row starting with "STT"
    const headerRowIdx = data.findIndex(row => row.some(cell => cell?.toString().toLowerCase().includes('stt')));
    if (headerRowIdx === -1) {
      throw new Error("Không tìm thấy dòng tiêu đề 'STT' trong file.");
    }

    const rows = data.slice(headerRowIdx + 1);
    const rawItems: any[] = [];

    const parseAmount = (val: string): number => {
      if (!val) return 0;
      return parseFloat(val.replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
    };

    rows.forEach((row, idx) => {
      // Row must have at least some data
      if (row.length < 5) return;
      
      const stt = row[0]?.trim();
      if (!stt || isNaN(parseInt(stt))) return; // Skip non-data rows

      const dateColB = row[1]?.trim() || '';
      const dateColC = row[2]?.trim() || '';
      
      // Extract date and doc number from Col B if possible
      const datePartB = dateColB.split(' / ')[0].trim();
      const docNo = dateColB.split(' / ')[1]?.trim() || '';
      
      // Primary date is Col C (Index 2) as per user request
      const mainDate = dateColC || datePartB;

      if (!mainDate || !row[6]) return; // Need date and content
      
      rawItems.push({
        id: `bank-${Date.now()}-${idx}`,
        transactionDate: mainDate,
        effectiveDate: dateColC || mainDate,
        debit: parseAmount(row[3]),
        credit: parseAmount(row[4]),
        balance: parseAmount(row[5]),
        content: row[6]?.trim() || '',
        classification: 'OTHER', // Default
        note: docNo
      });
    });

    if (rawItems.length === 0) {
      throw new Error("Không tìm thấy dữ liệu giao dịch hợp lệ.");
    }

    setLogs(prev => [...prev, { msg: `Đã tìm thấy ${rawItems.length} giao dịch. Đang phân loại bằng AI...`, type: 'loading' }]);

    // Batch classification (process in chunks of 50 to avoid prompt limits)
    const chunkSize = 50;
    const classifiedItems: BankStatement[] = [];
    
    for (let i = 0; i < rawItems.length; i += chunkSize) {
      const chunk = rawItems.slice(i, i + chunkSize);
      const contents = chunk.map(item => item.content);
      
      try {
        const classifications = await classifyBankStatements(contents);
        chunk.forEach((item, idx) => {
          classifiedItems.push({
            ...item,
            classification: classifications[idx].classification,
            customerName: classifications[idx].customerName,
            itemInfo: classifications[idx].itemInfo,
            note: classifications[idx].note || item.note
          });
        });
        setLogs(prev => [...prev.filter(l => l.type !== 'loading'), { 
          msg: `Đang phân loại... (${Math.min(i + chunkSize, rawItems.length)}/${rawItems.length})`, 
          type: 'loading' 
        }]);
      } catch (err) {
        console.error("AI Classification chunk error:", err);
        // Fallback to heuristic for this chunk
        chunk.forEach(item => {
          classifiedItems.push({
            ...item,
            classification: guessClassification(item)
          });
        });
      }
    }

    importBankStatements(classifiedItems);
    setLogs(prev => [...prev.filter(l => l.type !== 'loading'), { 
      msg: `Đã nhập thành công ${classifiedItems.length} giao dịch sao kê.`, 
      type: 'success' 
    }]);
    setIsProcessing(false);
  };

  const guessClassification = (item: any): BankClassification => {
    const c = item.content.toLowerCase();
    if (c.includes('rut sec') || c.includes('rut tien')) return 'CASH_WITHDRAWAL';
    if (c.includes('nop tien')) return 'CASH_DEPOSIT';
    if (c.includes('interest payment') || c.includes('tra lai')) return 'INTEREST';
    if (c.includes('phi chuyen') || c.includes('phi duy tri')) return 'FEE';
    if (item.debit > 0) return 'PURCHASE';
    if (item.credit > 0) return 'SALE';
    return 'OTHER';
  };

  const filteredData = useMemo(() => {
    return bankStatements.filter(item => {
      const matchesFilter = filterType === 'ALL' || item.classification === filterType;
      const matchesSearch = item.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.itemInfo?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [bankStatements, filterType, searchTerm]);

  const summary = useMemo(() => {
    const deb = filteredData.reduce((sum, item) => sum + item.debit, 0);
    const cre = filteredData.reduce((sum, item) => sum + item.credit, 0);
    return { debit: deb, credit: cre, balance: cre - deb };
  }, [filteredData]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  const getClassificationLabel = (type: string) => {
    switch (type) {
      case 'PURCHASE': return { text: 'Mua hàng', color: 'bg-red-100 text-red-700' };
      case 'SALE': return { text: 'Bán hàng', color: 'bg-green-100 text-green-700' };
      case 'CASH_WITHDRAWAL': return { text: 'Rút tiền mặt', color: 'bg-orange-100 text-orange-700' };
      case 'CASH_DEPOSIT': return { text: 'Nộp tiền mặt', color: 'bg-blue-100 text-blue-700' };
      case 'INTEREST': return { text: 'Lãi tiền gửi', color: 'bg-emerald-100 text-emerald-700' };
      case 'FEE': return { text: 'Phí ngân hàng', color: 'bg-slate-100 text-slate-700' };
      default: return { text: 'Khác', color: 'bg-slate-100 text-slate-400' };
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sao kê ngân hàng</h1>
          <p className="text-slate-500">Quản lý và phân loại giao dịch ngân hàng theo nghiệp vụ</p>
        </div>
        <div className="flex gap-3">
          <label className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Upload size={18} />
            <span>Nhập sao kê Excel/CSV</span>
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} disabled={isProcessing} />
          </label>
        </div>
      </header>

      {logs.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm max-h-40 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i} className={`flex items-center gap-2 text-sm mb-1 ${
              log.type === 'success' ? 'text-green-600' : 
              log.type === 'error' ? 'text-red-600' : 
              log.type === 'loading' ? 'text-blue-600 animate-pulse' : 'text-slate-600'
            }`}>
              {log.type === 'loading' ? <Loader2 size={14} className="animate-spin" /> : 
               log.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {log.msg}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm mb-1">Tổng tiền nhận (Credit)</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.credit)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm mb-1">Tổng tiền chi (Debit)</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(summary.debit)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm mb-1">Số dư biến động</p>
          <p className={`text-2xl font-bold ${summary.balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
            {formatCurrency(summary.balance)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-4 items-center justify-between bg-slate-50/50">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Tìm nội dung, khách hàng..."
                className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                value={searchTerm}
                onChange={(e) => setSearchSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 bg-white">
              <Filter size={16} />
              <select 
                className="focus:outline-none bg-transparent"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
              >
                <option value="ALL">Tất cả nghiệp vụ</option>
                <option value="PURCHASE">Mua hàng</option>
                <option value="SALE">Bán hàng</option>
                <option value="CASH_WITHDRAWAL">Rút tiền mặt</option>
                <option value="CASH_DEPOSIT">Nộp tiền mặt</option>
                <option value="INTEREST">Lãi tiền gửi</option>
                <option value="FEE">Phí NH</option>
                <option value="OTHER">Khác</option>
              </select>
            </div>
          </div>
          
          <div className="text-sm text-slate-500">
            Hiển thị <span className="font-bold text-slate-900">{filteredData.length}</span> giao dịch
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200">
                <th className="px-4 py-3">Ngày</th>
                <th className="px-4 py-3">Nghiệp vụ</th>
                <th className="px-4 py-3">Khách hàng / Thông tin</th>
                <th className="px-4 py-3">Nội dung chi tiết</th>
                <th className="px-4 py-3 text-right text-red-500">Chi ra (Debit)</th>
                <th className="px-4 py-3 text-right text-green-600">Thu vào (Credit)</th>
                <th className="px-4 py-3 text-right">Số dư</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400 italic">
                    Không có dữ liệu phù hợp
                  </td>
                </tr>
              ) : (
                filteredData.map((item) => {
                  const cls = getClassificationLabel(item.classification);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors text-[11px]">
                      <td className="px-4 py-3 border-r border-slate-50">
                        <div className="font-medium text-slate-900">{item.transactionDate}</div>
                        <div className="text-[9px] text-slate-400">HL: {item.effectiveDate}</div>
                      </td>
                      <td className="px-4 py-3 border-r border-slate-50">
                        <span className={`px-2 py-1 rounded-full text-[9px] font-bold ${cls.color}`}>
                          {item.classification === 'OTHER' ? <AlertCircle size={10} className="inline mr-1" /> : <BrainCircuit size={10} className="inline mr-1" />}
                          {cls.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-r border-slate-50 max-w-[200px]">
                        <div className="font-bold text-slate-700 truncate" title={item.customerName}>{item.customerName || '-'}</div>
                        <div className="text-[10px] text-blue-600 line-clamp-1">{item.itemInfo || '-'}</div>
                      </td>
                      <td className="px-4 py-3 border-r border-slate-50 max-w-[300px]">
                        <p className="text-slate-500 line-clamp-2 leading-tight" title={item.content}>{item.content}</p>
                        {item.note && <div className="text-[9px] text-slate-300 font-mono">CT: {item.note}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-red-600 border-r border-slate-50">
                        {item.debit > 0 ? formatCurrency(item.debit) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-600 border-r border-slate-50">
                        {item.credit > 0 ? formatCurrency(item.credit) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-700 bg-slate-50/30">
                        {formatCurrency(item.balance)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredData.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr className="font-bold text-[11px] text-slate-900">
                  <td colSpan={4} className="px-4 py-4 text-right uppercase text-slate-500">Tổng cộng lọc:</td>
                  <td className="px-4 py-4 text-right text-red-600">{formatCurrency(summary.debit)}</td>
                  <td className="px-4 py-4 text-right text-green-600">{formatCurrency(summary.credit)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
