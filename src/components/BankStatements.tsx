import React, { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useInventory } from '../InventoryContext';
import { Upload, Download, AlertCircle, CheckCircle2, Loader2, Search, Filter, BrainCircuit, ShieldCheck, Plus, Trash2, ListChecks } from 'lucide-react';
import { motion } from 'motion/react';
import { BankStatement, BankClassification } from '../types';

interface MappingRule {
  id: number;
  keyword: string;
  category: string;
  is_active: boolean;
}

export default function BankStatements() {
  const { 
    bankStatements, 
    rawBankStatements, 
    mappingDraft,
    importBankStatements, 
    reMapDraft,
    processTieredBankStatements,
    updateDraftClassification
  } = useInventory();
  const [logs, setLogs] = useState<{ msg: string; type: 'success' | 'error' | 'info' | 'loading' }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterType, setFilterType] = useState<BankClassification | 'ALL'>('ALL');
  const [searchTerm, setSearchSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState<'ORIGINAL' | 'DRAFT' | 'LEDGER' | 'RULES'>('DRAFT');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(200);
  
  // Mapping Rules State
  const [rules, setRules] = useState<MappingRule[]>([]);
  const [newRule, setNewRule] = useState({ keyword: '', category: 'SALE' });
  const [isAddingRule, setIsAddingRule] = useState(false);

  useEffect(() => {
    fetchRules();
  }, []);

  const handleProcessTiered = async () => {
    setIsProcessing(true);
    setLogs([{ msg: 'Bắt đầu quá trình phân loại 3 tầng (Keyword Mapping -> Gemini AI)...', type: 'loading' }]);
    
    try {
      const result = await processTieredBankStatements();
      if (result.success) {
        setLogs(prev => [...prev.filter(l => l.type !== 'loading'), { 
          msg: `Xử lý hoàn tất! Đã phân loại được ${result.count} giao dịch mới.`, 
          type: 'success' 
        }]);
        setActiveTab('LEDGER');
      } else {
        setLogs(prev => [...prev.filter(l => l.type !== 'loading'), { 
          msg: `Lỗi xử lý: ${result.message}`, 
          type: 'error' 
        }]);
      }
    } catch (err: any) {
      setLogs(prev => [...prev.filter(l => l.type !== 'loading'), { 
        msg: `Lỗi hệ thống: ${err.message}`, 
        type: 'error' 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/bank-mapping-rules');
      const data = await res.json();
      setRules(data);
    } catch (err) {
      console.error("Fetch rules error:", err);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.keyword || !newRule.category) return;
    setIsAddingRule(true);
    try {
      await fetch('/api/bank-mapping-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule)
      });
      setNewRule({ keyword: '', category: 'SALE' });
      fetchRules();
    } catch (err) {
      console.error(err);
    } finally {
      setIsAddingRule(false);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm("Xóa quy tắc này?")) return;
    try {
      await fetch(`/api/bank-mapping-rules/${id}`, { method: 'DELETE' });
      fetchRules();
    } catch (err) {
      console.error(err);
    }
  };

  const parseDate = (dateStr: string) => {
    if (!dateStr) return 0;
    const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
    if (parts.length < 3) return 0;
    const [d, m, y] = parts.map(Number);
    // Handle both DD/MM/YYYY and YYYY-MM-DD (simplified)
    if (y > 1000) return new Date(y, m - 1, d).getTime();
    if (d > 1000) return new Date(d, m - 1, y).getTime();
    return 0;
  };

  const handleExport = () => {
    const dataToExport = (activeTab === 'ORIGINAL' ? rawBankStatements : displayData).map(item => ({
      'Ngày GD': item.transactionDate || item.transaction_date,
      'Ngày HL': item.effectiveDate || item.effective_date,
      'Nghiệp vụ': activeTab === 'ORIGINAL' ? 'Chưa phân loại' : getClassificationLabel(item.classification).text,
      'Khách hàng': item.customerName || item.customer_name || '',
      'Thông tin mặt hàng': item.itemInfo || item.item_info || '',
      'Nội dung': item.content,
      'Số tiền ghi nợ (Debit)': item.debit,
      'Số tiền ghi có (Credit)': item.credit,
      'Phương thức': item.method || 'AI',
      'Chứng từ': item.note || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sao kê');
    XLSX.writeFile(wb, `Sao_ke_ngan_hang_${activeTab}_${Date.now()}.xlsx`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogs([{ msg: `Đang tải lên file: ${file.name}...`, type: 'info' }]);
    setIsProcessing(true);

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        let rawData: string[][] = [];
        if (isExcel) {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];
        } else {
          const csvText = evt.target?.result as string;
          const results = Papa.parse(csvText, { skipEmptyLines: true });
          rawData = results.data as string[][];
        }
        await processBankData(rawData);
      } catch (err: any) {
        setLogs(prev => [...prev, { msg: `Lỗi xử lý: ${err.message}`, type: 'error' }]);
        setIsProcessing(false);
      }
    };

    if (isExcel) reader.readAsBinaryString(file);
    else reader.readAsText(file);

    e.target.value = '';
  };

  const processBankData = async (data: string[][]) => {
    // Look for header row more flexibly
    const headerKeywords = ['stt', 'số tt', 'số thứ tự', 'ngay gd', 'ngày gd'];
    const headerRowIdx = data.findIndex(row => row.some(cell => 
      cell && headerKeywords.some(kw => cell.toString().toLowerCase().includes(kw))
    ));
    
    if (headerRowIdx === -1) throw new Error("Không tìm thấy dòng tiêu đề (STT, Ngày GD) trong file. Vui lòng kiểm tra lại định dạng file.");

    const rows = data.slice(headerRowIdx + 1);
    const rawItems: any[] = [];

    const parseAmount = (val: string): number => {
      if (val === undefined || val === null || val === '') return 0;
      // Handle numeric type from XLSX directly
      if (typeof val === 'number') return val;
      return parseFloat(val.toString().replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
    };

    rows.forEach((row, idx) => {
      if (row.length < 5) return;
      const stt = row[0]?.toString().trim();
      // Basic check to see if this row has transaction data (STT or Date should exist)
      if (!stt && !row[1]) return;
      if (stt && isNaN(parseInt(stt)) && !row[1]) return;

      const dateColB = row[1]?.toString().trim() || '';
      const dateColC = row[2]?.toString().trim() || '';
      // Support formats like "DD/MM/YYYY / DOC_NO"
      const datePartB = dateColB.includes(' / ') ? dateColB.split(' / ')[0].trim() : dateColB;
      const docNo = dateColB.includes(' / ') ? dateColB.split(' / ')[1]?.trim() : '';
      const mainDate = dateColC || datePartB;

      // Mandatory fields: Date and Content
      if (!mainDate || !row[6]) return;
      
      rawItems.push({
        transactionDate: mainDate,
        effectiveDate: dateColC || mainDate,
        debit: parseAmount(row[3]),
        credit: parseAmount(row[4]),
        balance: parseAmount(row[5]),
        content: row[6]?.toString().trim() || '',
        note: docNo || ''
      });
    });

    if (rawItems.length === 0) throw new Error("Không tìm thấy dữ liệu giao dịch hợp lệ sau dòng tiêu đề.");

    setLogs(prev => [...prev, { msg: `Đã tìm thấy ${rawItems.length} giao dịch. Đang lưu Bản Nguyên Gốc...`, type: 'loading' }]);
    
    try {
      await importBankStatements(rawItems);
      setLogs([{ msg: `Đã nhập liệu thành công ${rawItems.length} dòng vào Bản Nguyên Gốc. Dữ liệu đã được phân loại sơ bộ qua Mapping Rules.`, type: 'success' }]);
      setActiveTab('ORIGINAL');
    } catch (err: any) {
      setLogs(prev => [...prev, { msg: `Lỗi khi lưu dữ liệu: ${err.message}`, type: 'error' }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const displayData = useMemo(() => {
    let list: any[] = [];
    if (activeTab === 'ORIGINAL') list = rawBankStatements;
    else if (activeTab === 'DRAFT') list = mappingDraft;
    else list = bankStatements;
    
    const data = list.filter(item => {
      const classification = item.classification || 'KHAC';
      const matchesFilter = (activeTab === 'ORIGINAL' || activeTab === 'DRAFT') || filterType === 'ALL' || classification === filterType;
      const matchesSearch = (item.content || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.customerName || item.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.itemInfo || item.item_info || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesDate = true;
      if (startDate || endDate) {
        const dateStr = item.transactionDate || item.transaction_date;
        const itemTime = parseDate(dateStr);
        if (startDate) {
          const start = new Date(startDate).setHours(0,0,0,0);
          if (itemTime < start) matchesDate = false;
        }
        if (endDate) {
          const end = new Date(endDate).setHours(23,59,59,999);
          if (itemTime > end) matchesDate = false;
        }
      }

      return matchesFilter && matchesSearch && matchesDate;
    });

    return data.sort((a, b) => parseDate(a.transactionDate || a.transaction_date) - parseDate(b.transactionDate || b.transaction_date));
  }, [bankStatements, rawBankStatements, mappingDraft, activeTab, filterType, searchTerm, startDate, endDate]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return displayData.slice(startIndex, startIndex + rowsPerPage);
  }, [displayData, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(displayData.length / rowsPerPage);

  // Reset to first page when filters or tab change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filterType, searchTerm, startDate, endDate, rowsPerPage]);

  const summary = useMemo(() => {
    const deb = displayData.reduce((sum, item) => sum + (parseFloat(item.debit) || 0), 0);
    const cre = displayData.reduce((sum, item) => sum + (parseFloat(item.credit) || 0), 0);
    return { debit: deb, credit: cre, balance: cre - deb };
  }, [displayData]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  const getClassificationLabel = (type: string) => {
    switch (type) {
      case 'SALE':
      case 'DOANH THU': return { text: 'Bán hàng', color: 'bg-green-100 text-green-700' };
      case 'PURCHASE':
      case 'CHI PHI MUA HANG': return { text: 'Mua hàng', color: 'bg-red-100 text-red-700' };
      case 'CHI PHI VAN HANH': return { text: 'CP Vận hành', color: 'bg-orange-100 text-orange-700' };
      case 'LUONG': return { text: 'Lương NV', color: 'bg-purple-100 text-purple-700' };
      case 'THUE': return { text: 'Thuế/Phí', color: 'bg-slate-100 text-slate-700' };
      case 'CASH_WITHDRAWAL': return { text: 'Rút TM', color: 'bg-orange-100 text-orange-700' };
      case 'CASH_DEPOSIT': return { text: 'Nộp TM', color: 'bg-blue-100 text-blue-700' };
      default: return { text: type || 'Khác', color: 'bg-slate-100 text-slate-400' };
    }
  };

  const categories = [
    'SALE', 'PURCHASE', 'CHI PHI VAN HANH', 'LUONG', 'THUE', 'CASH_WITHDRAWAL', 'CASH_DEPOSIT', 'KHAC'
  ];

  return (
    <div className="w-full space-y-6 text-slate-900 overflow-x-hidden">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif">Sổ cái Ngân hàng (3 Tầng)</h1>
          <p className="text-slate-500 text-sm">Hệ thống phân loại: Keyword Mapping → Gemini AI → Final Ledger</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex p-1 bg-slate-100 rounded-lg shadow-inner">
            <button 
              onClick={() => setActiveTab('ORIGINAL')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'ORIGINAL' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              1. Bản Gốc (T1)
            </button>
            <button 
              onClick={() => setActiveTab('DRAFT')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'DRAFT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              2. Xử lý & Chỉnh sửa (T2)
            </button>
            <button 
              onClick={() => setActiveTab('LEDGER')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'LEDGER' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              3. Sổ cái Final (T3)
            </button>
            <button 
              onClick={() => setActiveTab('RULES')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'RULES' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Cấu hình Mapping
            </button>
          </div>

          <button 
            onClick={handleExport}
            disabled={displayData.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 text-sm font-bold"
          >
            <Download size={16} />
            <span>Xuất Excel</span>
          </button>
          
          <button 
            onClick={handleProcessTiered}
            disabled={isProcessing || mappingDraft.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 text-sm font-black shadow-lg shadow-orange-200 uppercase tracking-tighter"
          >
            <BrainCircuit size={18} className={isProcessing ? "animate-pulse" : ""} />
            <span>Phân loại tự động (AI)</span>
          </button>

          {activeTab === 'DRAFT' && (
            <button 
              onClick={async () => {
                setIsProcessing(true);
                await reMapDraft();
                setIsProcessing(false);
              }}
              disabled={isProcessing || mappingDraft.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50 text-sm font-black shadow-lg shadow-indigo-200 uppercase tracking-tighter"
              title="Áp dụng lại luật Mapping và Regex thông minh cho dữ liệu T2"
            >
              <ShieldCheck size={18} className={isProcessing ? "animate-pulse" : ""} />
              <span>Cập nhật Mapping</span>
            </button>
          )}

          <label className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 text-sm font-bold ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Upload size={18} />
            <span>Nhập Sao Kê (T1)</span>
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} disabled={isProcessing} />
          </label>
        </div>
      </header>

      {logs.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          {logs.map((log, i) => (
            <div key={i} className={`flex items-center gap-2 text-sm mb-1 ${
              log.type === 'success' ? 'text-green-600 font-bold' : 
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

      {activeTab === 'RULES' ? (
        <div className="w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 font-serif">
              <ShieldCheck size={18} className="text-blue-500" />
              Keyword Mapping Rules (Phân loại tầng 2)
            </h3>
          </div>
          
          <div className="p-4 flex flex-col md:flex-row gap-4 items-end border-b border-slate-100">
            <div className="flex-1 w-full space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Từ khóa khớp (Regex Case-Insensitive)</label>
              <input 
                type="text" 
                placeholder="Ví dụ: nop tien mặt, thanh toan, chuyen khoan tu..."
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-sans"
                value={newRule.keyword}
                onChange={e => setNewRule({...newRule, keyword: e.target.value})}
              />
            </div>
            <div className="w-full md:w-64 space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Nghiệp vụ gán</label>
              <select 
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm outline-none font-bold"
                value={newRule.category}
                onChange={e => setNewRule({...newRule, category: e.target.value})}
              >
                {categories.map(c => <option key={c} value={c}>{getClassificationLabel(c).text}</option>)}
              </select>
            </div>
            <button 
              onClick={handleAddRule}
              disabled={isAddingRule || !newRule.keyword}
              className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-bold"
            >
              <Plus size={18} className="inline mr-1" />
              Thêm Quy tắc
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3 text-blue-600">Từ khóa</th>
                  <th className="px-6 py-3">Nghiệp vụ</th>
                  <th className="px-6 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map(rule => (
                  <tr key={rule.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 text-slate-400 text-xs font-mono">{rule.id}</td>
                    <td className="px-6 py-3 font-bold text-slate-800 font-sans tracking-tight whitespace-pre-wrap">{rule.keyword}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${getClassificationLabel(rule.category).color}`}>
                        {getClassificationLabel(rule.category).text}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button 
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">Chưa có quy tắc lọc. Hãy thêm từ khóa để tiết kiệm AI.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-green-500">
              <p className="text-slate-400 text-xs mb-1 uppercase font-black tracking-widest">Tiền Thu (CREDIT +)</p>
              <p className="text-3xl font-black text-green-600 font-serif">{formatCurrency(summary.credit)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-red-500">
              <p className="text-slate-400 text-xs mb-1 uppercase font-black tracking-widest">Tiền Chi (DEBIT -)</p>
              <p className="text-3xl font-black text-red-600 font-serif">{formatCurrency(summary.debit)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-slate-900 bg-slate-900 group">
              <p className="text-slate-400 text-xs mb-1 uppercase font-black tracking-widest">Số dư thuần (Balance)</p>
              <p className={`text-3xl font-black font-serif ${summary.balance >= 0 ? 'text-gold' : 'text-red-400'}`}>
                {formatCurrency(summary.balance)}
              </p>
              <style dangerouslySetInnerHTML={{ __html: `.text-gold { color: #D4AF37; }` }} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex flex-wrap gap-4 items-center justify-between bg-slate-50/50">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="text"
                    placeholder="Tìm trong nội dung chi tiết..."
                    className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-64 outline-none shadow-sm font-sans"
                    value={searchTerm}
                    onChange={(e) => setSearchSearchTerm(e.target.value)}
                  />
                </div>
                
                {activeTab === 'LEDGER' && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 bg-white shadow-sm">
                    <Filter size={14} className="text-slate-400" />
                    <select 
                      className="focus:outline-none bg-transparent font-bold"
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value as any)}
                    >
                      <option value="ALL">Tất cả nghiệp vụ</option>
                      {categories.map(c => <option key={c} value={c}>{getClassificationLabel(c).text}</option>)}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 bg-white shadow-sm font-sans">
                  <span className="text-[9px] uppercase font-black text-slate-300">Từ</span>
                  <input type="date" className="bg-transparent outline-none scale-90" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  <span className="text-[9px] uppercase font-black text-slate-300">Đến</span>
                  <input type="date" className="bg-transparent outline-none scale-90" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
              
              <div className="flex items-center gap-6">
                {/* Pagination Controls Top */}
                {displayData.length > 0 && (
                  <div className="flex items-center gap-4 border-r border-slate-200 pr-6 mr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Hiển thị</span>
                      <select 
                        className="px-2 py-1 border border-slate-200 rounded text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500"
                        value={rowsPerPage}
                        onChange={(e) => setRowsPerPage(Number(e.target.value))}
                      >
                        <option value={100}>100 dòng</option>
                        <option value={200}>200 dòng</option>
                        <option value={300}>300 dòng</option>
                        <option value={500}>500 dòng</option>
                      </select>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="p-1 px-2 border border-slate-200 rounded text-[10px] font-black uppercase hover:bg-slate-50 disabled:opacity-30"
                      >
                        Trước
                      </button>
                      <span className="text-xs font-bold px-2">{currentPage} / {totalPages}</span>
                      <button 
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1 px-2 border border-slate-200 rounded text-[10px] font-black uppercase hover:bg-slate-50 disabled:opacity-30"
                      >
                        Sau
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="text-xs font-bold text-slate-400 uppercase tracking-tight">
                  {activeTab === 'ORIGINAL' ? 'Dữ liệu nguyên bản' : 'Dữ liệu đã phân loại'} : <span className="text-slate-900 font-black">{displayData.length}</span> Giao dịch
                </div>
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
              <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-200">
                    <th className="px-4 py-3">Ngày GD</th>
                    {activeTab !== 'ORIGINAL' && <th className="px-4 py-3">Nghiệp Vụ</th>}
                    <th className="px-4 py-3">Nội dung chi tiết</th>
                    <th className="px-4 py-3 text-right">Chi (-)</th>
                    <th className="px-4 py-3 text-right">Thu (+)</th>
                    {activeTab === 'ORIGINAL' && <th className="px-4 py-3 text-center">Trạng thái</th>}
                    {activeTab === 'DRAFT' && <th className="px-4 py-3 text-center">Mapping</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-20 text-center text-slate-300 italic font-sans">
                        {isProcessing ? (
                          <div className="flex flex-col items-center gap-3">
                            <Loader2 size={32} className="animate-spin text-blue-500" />
                            <p className="font-bold">Đang phân loại dữ liệu qua AI...</p>
                          </div>
                        ) : "Không có dữ liệu trong danh sách này."}
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((item) => {
                      const transactionDate = item.transactionDate || item.transaction_date;
                      const effectiveDate = item.effectiveDate || item.effective_date;
                      const cls = getClassificationLabel(item.classification);
                      const method = item.method || item.match_method;
                      const isProcessed = item.processed;

                      return (
                        <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors text-xs ${activeTab === 'ORIGINAL' && !isProcessed ? 'bg-orange-50/30' : ''}`}>
                          <td className="px-4 py-4 border-r border-slate-50 w-28">
                            <div className="font-black text-slate-900">{transactionDate}</div>
                            <div className="text-[9px] text-slate-400 font-sans uppercase">HL: {effectiveDate}</div>
                          </td>
                          
                          {activeTab !== 'ORIGINAL' && (
                            <td className="px-4 py-4 border-r border-slate-50 w-44">
                              {activeTab === 'DRAFT' ? (
                                <div className="space-y-1">
                                  {editingId === item.id ? (
                                    <select 
                                      className="w-full text-[10px] p-1 border border-blue-300 rounded font-bold"
                                      autoFocus
                                      onBlur={() => setEditingId(null)}
                                      value={item.classification || ''}
                                      onChange={async (e) => {
                                        await updateDraftClassification(item.id, e.target.value);
                                        setEditingId(null);
                                      }}
                                    >
                                      <option value="">-- Trống --</option>
                                      {categories.map(c => <option key={c} value={c}>{getClassificationLabel(c).text}</option>)}
                                    </select>
                                  ) : (
                                    <button 
                                      onClick={() => setEditingId(item.id)}
                                      className={`w-full px-2 py-1 rounded text-[10px] font-black uppercase ${cls.color} block text-center shadow-sm border border-transparent hover:border-blue-400 transition-all`}
                                    >
                                      {item.classification ? cls.text : 'Gán nghiệp vụ'}
                                    </button>
                                  )}
                                  <div className="flex items-center justify-center gap-1">
                                    {item.match_method === 'MAPPING' && <span className="text-[8px] font-bold text-green-600 flex items-center gap-0.5"><ShieldCheck size={8} /> Khớp Keyword</span>}
                                    {item.match_method === 'MANUAL' && <span className="text-[8px] font-bold text-orange-600 flex items-center gap-0.5"><ListChecks size={8} /> Sửa thủ công</span>}
                                    {!item.match_method && <span className="text-[8px] font-bold text-slate-400 flex items-center gap-0.5 italic">Chờ AI phân loại</span>}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${cls.color} block text-center shadow-sm mb-1`}>
                                    {cls.text}
                                  </span>
                                  <div className="flex items-center justify-center gap-1">
                                    {item.method === 'MAPPING' ? (
                                      <span className="text-[8px] font-bold text-green-600 flex items-center gap-0.5"><ShieldCheck size={8} /> Keyword Mapping</span>
                                    ) : item.method === 'MANUAL' ? (
                                      <span className="text-[8px] font-bold text-orange-600 flex items-center gap-0.5"><ListChecks size={8} /> Sửa thủ công</span>
                                    ) : (
                                      <span className="text-[8px] font-bold text-blue-600 flex items-center gap-0.5"><BrainCircuit size={8} /> Gemini Flash</span>
                                    )}
                                  </div>
                                </>
                              )}
                            </td>
                          )}

                          <td className="px-4 py-4 border-r border-slate-50">
                            <p className="text-slate-700 leading-relaxed font-medium mb-1 line-clamp-2 whitespace-pre-wrap" title={item.content}>{item.content}</p>
                            {(item.customerName || item.customer_name) && (
                              <div className="text-[10px] text-blue-800 font-bold flex items-center gap-1">
                                <Search size={10} /> {item.customerName || item.customer_name}
                              </div>
                            )}
                            {item.note && <div className="text-[9px] text-slate-400 italic">Số CT: {item.note}</div>}
                          </td>

                          <td className="px-4 py-4 text-right font-black text-red-600 border-r border-slate-50">
                            {parseFloat(item.debit) > 0 ? formatCurrency(parseFloat(item.debit)) : '-'}
                          </td>
                          <td className="px-4 py-4 text-right font-black text-green-600 border-r border-slate-50">
                            {parseFloat(item.credit) > 0 ? formatCurrency(parseFloat(item.credit)) : '-'}
                          </td>

                          {activeTab === 'ORIGINAL' && (
                            <td className="px-4 py-4 text-center">
                              {isProcessed ? (
                                <span className="text-[9px] text-green-600 font-black uppercase flex items-center justify-center gap-1">
                                  <CheckCircle2 size={12} /> Đã phân loại
                                </span>
                              ) : (
                                <span className="text-[9px] text-orange-400 font-black uppercase flex items-center justify-center gap-1">
                                  <AlertCircle size={12} /> Chờ xử lý
                                </span>
                              )}
                            </td>
                          )}

                          {activeTab === 'DRAFT' && (
                            <td className="px-4 py-4 text-center">
                              {!item.classification && (
                                <button 
                                  onClick={async () => {
                                    const keyword = confirm("Nhập từ khóa gợi ý để tạo Mapping tự động (Ví dụ: 'Nop tien mat')");
                                    if (keyword) {
                                      await fetch('/api/bank-mapping-rules', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ keyword, category: 'KHAC' })
                                      });
                                      fetchRules();
                                    }
                                  }}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-300 hover:text-blue-500 transition-all"
                                  title="Tạo quy tắc mapping mới"
                                >
                                  <Plus size={14} />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>


          </div>
        </>
      )}
    </div>
  );
}
