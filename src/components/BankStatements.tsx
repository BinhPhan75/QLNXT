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
  const { bankStatements, importBankStatements, processTieredBankStatements } = useInventory();
  const [logs, setLogs] = useState<{ msg: string; type: 'success' | 'error' | 'info' | 'loading' }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterType, setFilterType] = useState<BankClassification | 'ALL'>('ALL');
  const [searchTerm, setSearchSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState<'LEDGER' | 'RULES'>('LEDGER');
  
  // Mapping Rules State
  const [rules, setRules] = useState<MappingRule[]>([]);
  const [newRule, setNewRule] = useState({ keyword: '', category: 'SALE' });
  const [isAddingRule, setIsAddingRule] = useState(false);

  useEffect(() => {
    fetchRules();
  }, []);

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
    const dataToExport = filteredData.map(item => ({
      'Ngày GD': item.transactionDate,
      'Ngày HL': item.effectiveDate,
      'Nghiệp vụ': getClassificationLabel(item.classification).text,
      'Khách hàng': item.customerName || '',
      'Số CCCD': item.customerCard || '',
      'Thông tin mặt hàng': item.itemInfo || '',
      'Nội dung': item.content,
      'Số tiền ghi nợ (Debit)': item.debit,
      'Số tiền ghi có (Credit)': item.credit,
      'Phương thức': (item as any).method || 'AI',
      'Chứng từ': item.note || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sao kê');
    XLSX.writeFile(wb, `Sao_ke_ngan_hang_3tang_${Date.now()}.xlsx`);
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
    const headerRowIdx = data.findIndex(row => row.some(cell => cell?.toString().toLowerCase().includes('stt')));
    if (headerRowIdx === -1) throw new Error("Không tìm thấy dòng tiêu đề 'STT' trong file.");

    const rows = data.slice(headerRowIdx + 1);
    const rawItems: any[] = [];

    const parseAmount = (val: string): number => {
      if (!val) return 0;
      return parseFloat(val.toString().replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
    };

    rows.forEach((row, idx) => {
      if (row.length < 5) return;
      const stt = row[0]?.toString().trim();
      if (!stt || isNaN(parseInt(stt))) return;

      const dateColB = row[1]?.toString().trim() || '';
      const dateColC = row[2]?.toString().trim() || '';
      const datePartB = dateColB.includes(' / ') ? dateColB.split(' / ')[0].trim() : dateColB;
      const docNo = dateColB.includes(' / ') ? dateColB.split(' / ')[1]?.trim() : '';
      const mainDate = dateColC || datePartB;

      if (!mainDate || !row[6]) return;
      
      rawItems.push({
        id: `raw-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
        transactionDate: mainDate,
        effectiveDate: dateColC || mainDate,
        debit: parseAmount(row[3]?.toString() || ''),
        credit: parseAmount(row[4]?.toString() || ''),
        balance: parseAmount(row[5]?.toString() || ''),
        content: row[6]?.toString().trim() || '',
        classification: 'OTHER',
        note: docNo
      });
    });

    if (rawItems.length === 0) throw new Error("Không tìm thấy dữ liệu giao dịch hợp lệ.");

    setLogs(prev => [...prev, { msg: `Đã tìm thấy ${rawItems.length} giao dịch. Đang lưu vào hàng chờ xử lý...`, type: 'loading' }]);
    
    // Step 1: Upload to raw table
    await importBankStatements(rawItems);
    
    setLogs(prev => [...prev.filter(l => l.type !== 'loading'), { 
      msg: `Đã tải lên hàng chờ. Bắt đầu xử lý 3 tầng (Mapping Rules -> Gemini AI)...`, 
      type: 'loading' 
    }]);

    // Step 2 & 3: Trigger backend tiered processing
    const result = await processTieredBankStatements();
    
    if (result.success) {
      setLogs(prev => [...prev.filter(l => l.type !== 'loading'), { 
        msg: `Xử lý hoàn tất! Đã phân loại được ${result.count} giao dịch mới.`, 
        type: 'success' 
      }]);
    } else {
      setLogs(prev => [...prev.filter(l => l.type !== 'loading'), { 
        msg: `Lỗi xử lý: ${result.message}`, 
        type: 'error' 
      }]);
    }
    
    setIsProcessing(false);
  };

  const filteredData = useMemo(() => {
    const data = bankStatements.filter(item => {
      const matchesFilter = filterType === 'ALL' || item.classification === filterType;
      const matchesSearch = (item.content || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.itemInfo || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesDate = true;
      if (startDate || endDate) {
        const itemTime = parseDate(item.transactionDate);
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

    return data.sort((a, b) => parseDate(a.transactionDate) - parseDate(b.transactionDate));
  }, [bankStatements, filterType, searchTerm, startDate, endDate]);

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
      case 'DOANH THU':
      case 'SALE': return { text: 'Doanh thu/Bán', color: 'bg-green-100 text-green-700' };
      case 'CHI PHI MUA HANG':
      case 'PURCHASE': return { text: 'Mua hàng/Vàng', color: 'bg-red-100 text-red-700' };
      case 'CHI PHI VAN HANH': return { text: 'CP Vận hành', color: 'bg-orange-100 text-orange-700' };
      case 'LUONG': return { text: 'Lương NV', color: 'bg-purple-100 text-purple-700' };
      case 'THUE': return { text: 'Thuế/Phí', color: 'bg-slate-100 text-slate-700' };
      case 'CASH_WITHDRAWAL': return { text: 'Rút mặt', color: 'bg-orange-100 text-orange-700' };
      case 'CASH_DEPOSIT': return { text: 'Nộp mặt', color: 'bg-blue-100 text-blue-700' };
      default: return { text: type || 'Khác', color: 'bg-slate-100 text-slate-400' };
    }
  };

  const categories = [
    'SALE', 'PURCHASE', 'CHI PHI VAN HANH', 'LUONG', 'THUE', 'CASH_WITHDRAWAL', 'CASH_DEPOSIT', 'KHAC'
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sao kê & Sổ cái 3 tầng</h1>
          <p className="text-slate-500">Quy trình: Keyword Mapping → Batch Gemini AI → Final Ledger</p>
        </div>
        <div className="flex gap-3">
          <div className="flex p-1 bg-slate-100 rounded-lg mr-4">
            <button 
              onClick={() => setActiveTab('LEDGER')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'LEDGER' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <ListChecks size={16} className="inline mr-2" />
              Sổ cái
            </button>
            <button 
              onClick={() => setActiveTab('RULES')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'RULES' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <ShieldCheck size={16} className="inline mr-2" />
              Quy tắc (Mapping)
            </button>
          </div>

          <button 
            onClick={handleExport}
            disabled={filteredData.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            <span>Xuất Excel</span>
          </button>
          <label className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Upload size={18} />
            <span>Nhập File Sao Kê</span>
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} disabled={isProcessing} />
          </label>
        </div>
      </header>

      {logs.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
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

      {activeTab === 'RULES' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck size={18} className="text-blue-500" />
              Quản lý quy tắc Keyword Mapping (Ưu tiên số 1 - Miễn phí Token)
            </h3>
          </div>
          
          <div className="p-4 flex gap-4 items-end border-b border-slate-100">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Từ khóa (Regex / Keyword)</label>
              <input 
                type="text" 
                placeholder="Ví dụ: nop tien mặt, thanh toan..."
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={newRule.keyword}
                onChange={e => setNewRule({...newRule, keyword: e.target.value})}
              />
            </div>
            <div className="w-64 space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Nghiệp vụ gán</label>
              <select 
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm outline-none"
                value={newRule.category}
                onChange={e => setNewRule({...newRule, category: e.target.value})}
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button 
              onClick={handleAddRule}
              disabled={isAddingRule || !newRule.keyword}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Plus size={18} className="inline mr-1" />
              Thêm
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3 text-blue-600">Từ khóa đối soát</th>
                  <th className="px-6 py-3">Phân loại tương ứng</th>
                  <th className="px-6 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map(rule => (
                  <tr key={rule.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 text-slate-400 text-xs font-mono">{rule.id}</td>
                    <td className="px-6 py-3 font-medium text-slate-800">{rule.keyword}</td>
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
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">Chưa có quy tắc nào. Hãy thêm từ khóa để tiết kiệm chi phí AI.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-green-500">
              <p className="text-slate-500 text-sm mb-1 uppercase font-bold tracking-tight">Thu vào (Credit)</p>
              <p className="text-2xl font-black text-green-600">{formatCurrency(summary.credit)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-red-500">
              <p className="text-slate-500 text-sm mb-1 uppercase font-bold tracking-tight">Chi ra (Debit)</p>
              <p className="text-2xl font-black text-red-600">{formatCurrency(summary.debit)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
              <p className="text-slate-500 text-sm mb-1 uppercase font-bold tracking-tight">Số dư kỳ báo cáo</p>
              <p className={`text-2xl font-black ${summary.balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
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
                    placeholder="Tìm trong nội dung chi tiết..."
                    className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 w-72 outline-none shadow-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchSearchTerm(e.target.value)}
                  />
                </div>
                
                <div className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 bg-white shadow-sm">
                  <Filter size={16} />
                  <select 
                    className="focus:outline-none bg-transparent"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                  >
                    <option value="ALL">Tất cả nghiệp vụ</option>
                    {categories.map(c => <option key={c} value={c}>{getClassificationLabel(c).text}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 bg-white shadow-sm">
                  <span className="text-[10px] uppercase font-black text-slate-300">Từ</span>
                  <input type="date" className="bg-transparent outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  <span className="text-[10px] uppercase font-black text-slate-300">Đến</span>
                  <input type="date" className="bg-transparent outline-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
              
              <div className="text-sm font-medium text-slate-500">
                Hiển thị <span className="font-bold text-slate-900">{filteredData.length}</span> / {bankStatements.length} giao dịch
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1100px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="px-4 py-3">Ngày</th>
                    <th className="px-4 py-3">Nghiệp vụ</th>
                    <th className="px-4 py-3">Khách / CCCD / Phương pháp</th>
                    <th className="px-4 py-3">Nội dung chuyển khoản</th>
                    <th className="px-4 py-3 text-right text-red-500">Ghi nợ (-)</th>
                    <th className="px-4 py-3 text-right text-green-600">Ghi có (+)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-serif">
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-slate-400 italic font-sans flex flex-col items-center gap-2">
                        <Loader2 size={32} className="animate-spin text-slate-200" />
                        Dữ liệu trống hoặc đang trong hàng chờ 3 tầng...
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((item) => {
                      const cls = getClassificationLabel(item.classification);
                      const method = (item as any).method || 'AI';
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors text-xs">
                          <td className="px-4 py-3 border-r border-slate-50 w-24">
                            <div className="font-bold text-slate-900">{item.transactionDate}</div>
                            <div className="text-[9px] text-slate-400 font-sans">HL: {item.effectiveDate}</div>
                          </td>
                          <td className="px-4 py-3 border-r border-slate-50 w-36">
                            <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase ${cls.color} block text-center shadow-sm`}>
                              {cls.text}
                            </span>
                          </td>
                          <td className="px-4 py-3 border-r border-slate-50 max-w-[200px] font-sans">
                            <div className="font-bold text-slate-700 truncate">{item.customerName || '-'}</div>
                            <div className="text-[10px] text-blue-600 line-clamp-1">{item.customerCard || '-'}</div>
                            <div className="flex items-center gap-1 mt-1">
                              {method === 'MAPPING' ? (
                                <span className="flex items-center gap-0.5 text-[8px] font-black text-green-600 bg-green-50 px-1 rounded uppercase">
                                  <ShieldCheck size={8} /> Keyword Match
                                </span>
                              ) : (
                                <span className="flex items-center gap-0.5 text-[8px] font-black text-blue-600 bg-blue-50 px-1 rounded uppercase">
                                  <BrainCircuit size={8} /> Gemini Flash
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 border-r border-slate-50 font-sans">
                            <p className="text-slate-500 leading-snug line-clamp-2" title={item.content}>{item.content}</p>
                            {item.note && <div className="text-[9px] text-slate-300 italic">Số CT: {item.note}</div>}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-red-600 border-r border-slate-50 bg-red-50/10">
                            {item.debit > 0 ? formatCurrency(item.debit) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-green-600 bg-green-50/10">
                            {item.credit > 0 ? formatCurrency(item.credit) : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredData.length > 0 && (
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-sans">
                    <tr className="font-bold text-xs text-slate-900">
                      <td colSpan={4} className="px-4 py-4 text-right uppercase text-slate-400 tracking-wider">Tổng cộng trang hiện tại:</td>
                      <td className="px-4 py-4 text-right text-red-600">{formatCurrency(summary.debit)}</td>
                      <td className="px-4 py-4 text-right text-green-600">{formatCurrency(summary.credit)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
