import React, { useState, useEffect } from 'react';
import { FileText, Settings, CheckCircle, XCircle, AlertCircle, Save, RefreshCw, Send, Eye, EyeOff, Loader2, Building2, FileCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ViettelConfig {
  id?: string;
  username: string;
  password: string;
  tax_code: string;
  api_url: string;
  template_code: string;
  invoice_series: string;
  is_sandbox: boolean;
  company_name: string;
  company_address: string;
  _hasPassword?: boolean;
  updated_at?: string;
}

const DEFAULT_CONFIG: ViettelConfig = {
  username: '',
  password: '',
  tax_code: '',
  api_url: 'https://api-vinvoice.viettel.vn',
  template_code: '',
  invoice_series: '',
  is_sandbox: true,
  company_name: '',
  company_address: '',
};

type Tab = 'config' | 'invoice';

export default function EInvoice() {
  const [activeTab, setActiveTab] = useState<Tab>('config');
  const [config, setConfig] = useState<ViettelConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  // Invoice form
  const [invoiceForm, setInvoiceForm] = useState({
    buyerName: '',
    buyerIdNo: '',
    buyerAddress: '',
    itemName: '',
    itemCode: '',
    unit: 'Cái',
    quantity: 1,
    unitPrice: 0,
    note: '',
  });
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<any>(null);

  useEffect(() => { loadConfig(); }, []);

  // Chặn nhập tiếng Việt (IME) - chỉ cho phép ASCII
  const noVietnamese = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
    // Xóa dấu tiếng Việt và ký tự không phải ASCII cơ bản
    const val = e.target.value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')  // xóa dấu
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')  // đ → d
      .replace(/[^ -~]/g, '');   // chỉ ASCII printable
    setter(val);
    // Cập nhật lại value trong DOM
    e.target.value = val;
  };

  // Chỉ cho nhập số và dấu phẩy/chấm
  const onlyNumbers = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: number) => void) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setter(raw === '' ? 0 : parseInt(raw, 10));
  };

  // Dùng ref để track giá trị hiển thị mà không gây re-render/mất cursor
  const unitPriceRef = React.useRef<HTMLInputElement>(null);
  const quantityRef = React.useRef<HTMLInputElement>(null);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/viettel-config');
      const data = await res.json();
      if (data.config) {
        // Luôn set password = '' sau khi load để tránh gửi mask lên server
        setConfig({ ...DEFAULT_CONFIG, ...data.config, password: '' });
      }
    } catch (e) {
      console.warn('Không thể tải cấu hình Viettel:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.username || !config.tax_code) {
      setSaveResult({ success: false, message: 'Vui lòng điền Tài khoản và Mã số thuế' });
      return;
    }
    if (!config.password && !config._hasPassword) {
      setSaveResult({ success: false, message: 'Vui lòng điền Mật khẩu' });
      return;
    }
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/viettel-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaveResult({ success: true, message: 'Đã lưu cấu hình thành công!' });
        await loadConfig(); // reload để hiển thị mask password
      } else {
        setSaveResult({ success: false, message: data.error || 'Lưu thất bại' });
      }
    } catch (e: any) {
      setSaveResult({ success: false, message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setSaveResult(null); // clear save result để tránh bị che
    try {
      const res = await fetch('/api/viettel-test', { method: 'POST' });
      const data = await res.json();
      const result = { success: Boolean(data.success), message: data.message || data.error || 'Không có phản hồi' };
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ success: false, message: `Lỗi kết nối API: ${e.message}` });
    } finally {
      setTesting(false);
    }
  };

  const handleCreateInvoice = async () => {
    const total = invoiceForm.quantity * invoiceForm.unitPrice;
    if (!invoiceForm.buyerName || !invoiceForm.itemName || total <= 0) {
      setInvoiceResult({ error: 'Vui lòng điền đầy đủ: Tên khách hàng, Tên hàng hóa và Đơn giá' });
      return;
    }

    setCreatingInvoice(true);
    setInvoiceResult(null);
    try {
      const payload = {
        generalInvoiceInfo: { invoiceIssuedDate: Date.now() },
        buyerInfo: {
          buyerName: invoiceForm.buyerName,
          buyerIdNo: invoiceForm.buyerIdNo,
          buyerAddressLine: invoiceForm.buyerAddress,
          buyerNotGetInvoice: invoiceForm.buyerIdNo ? 0 : 1,
        },
        itemInfo: [{
          itemCode: invoiceForm.itemCode || 'HH001',
          itemName: invoiceForm.itemName,
          unitName: invoiceForm.unit,
          unitPrice: invoiceForm.unitPrice,
          quantity: invoiceForm.quantity,
          itemTotalAmountWithoutTax: total,
          taxPercentage: 0,
          taxAmount: 0,
          itemTotalAmountWithTax: total,
        }],
        summarizeInfo: {
          totalAmountWithoutTax: total,
          totalTaxAmount: 0,
          totalAmountWithTax: total,
        },
      };

      const res = await fetch('/api/viettel-create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });
      const data = await res.json();
      setInvoiceResult(data);
    } catch (e: any) {
      setInvoiceResult({ error: e.message });
    } finally {
      setCreatingInvoice(false);
    }
  };

  const Field = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-500">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );

  const inputCls = "w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-gold-400/40 focus:border-gold-400 transition-all";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-zinc-400">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">Đang tải cấu hình...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-luxury-black font-serif tracking-tight flex items-center gap-3">
            <div className="p-2 bg-gold-500/10 rounded-xl">
              <FileText size={22} className="text-gold-600" />
            </div>
            Hóa đơn điện tử
          </h1>
          <p className="text-sm text-zinc-400 mt-1 ml-12">Kết nối & phát hành hóa đơn qua Viettel vInvoice</p>
        </div>
        {/* Trạng thái kết nối */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border ${
          config._hasPassword && config.username
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${config._hasPassword && config.username ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`} />
          {config._hasPassword && config.username ? 'Đã cấu hình' : 'Chưa cấu hình'}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-2xl w-fit">
        {([['config', Settings, 'Cấu hình kết nối'], ['invoice', FileCheck, 'Tạo hóa đơn']] as [Tab, any, string][]).map(([tab, Icon, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab
                ? 'bg-white text-gold-600 shadow-sm border border-gold-200/50'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* TAB: CẤU HÌNH */}
        {activeTab === 'config' && (
          <motion.div key="config" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
              {/* Môi trường */}
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-zinc-800">Cài đặt kết nối Viettel vInvoice</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Thông tin sẽ được lưu vào database Neon</p>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <span className={`text-xs font-bold ${config.is_sandbox ? 'text-amber-600' : 'text-zinc-400'}`}>Sandbox</span>
                  <div
                    onClick={() => setConfig(p => ({ ...p, is_sandbox: !p.is_sandbox }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${config.is_sandbox ? 'bg-amber-400' : 'bg-green-500'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.is_sandbox ? 'left-1' : 'left-7'}`} />
                  </div>
                  <span className={`text-xs font-bold ${!config.is_sandbox ? 'text-green-600' : 'text-zinc-400'}`}>Production</span>
                </label>
              </div>

              <div className="p-6 space-y-5">
                {/* Thông tin đăng nhập */}
                <div className="p-4 bg-zinc-50 rounded-2xl space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Thông tin đăng nhập</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Tài khoản đăng nhập" required>
                      <input className={inputCls} placeholder="Nhập tài khoản (thường là MST)"
                        value={config.username} onChange={e => setConfig(p => ({ ...p, username: e.target.value }))} />
                    </Field>
                    <Field label="Mật khẩu" required>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className={inputCls + ' pr-10'}
                          placeholder={config._hasPassword ? '••••••••  (đã lưu)' : 'Nhập mật khẩu'}
                          value={config.password}
                          onChange={e => setConfig(p => ({ ...p, password: e.target.value }))}
                        />
                        <button type="button" onClick={() => setShowPassword(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Mã số thuế" required>
                      <input className={inputCls} placeholder="VD: 4000926165"
                        value={config.tax_code} onChange={e => setConfig(p => ({ ...p, tax_code: e.target.value }))} />
                    </Field>
                    <Field label="URL API Viettel">
                      <input className={inputCls} placeholder="https://api-vinvoice.viettel.vn"
                        value={config.api_url} onChange={e => setConfig(p => ({ ...p, api_url: e.target.value }))} />
                    </Field>
                  </div>
                </div>

                {/* Thông tin hóa đơn */}
                <div className="p-4 bg-zinc-50 rounded-2xl space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Thông tin mẫu hóa đơn</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Mẫu số hóa đơn">
                      <input className={inputCls} placeholder="VD: 01GTKT0/001"
                        value={config.template_code} onChange={e => setConfig(p => ({ ...p, template_code: e.target.value }))} />
                    </Field>
                    <Field label="Ký hiệu hóa đơn">
                      <input className={inputCls} placeholder="VD: C25TAA"
                        value={config.invoice_series} onChange={e => setConfig(p => ({ ...p, invoice_series: e.target.value }))} />
                    </Field>
                  </div>
                </div>

                {/* Thông tin doanh nghiệp */}
                <div className="p-4 bg-zinc-50 rounded-2xl space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-2">
                    <Building2 size={12} />Thông tin doanh nghiệp (hiển thị trên hóa đơn)
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Tên doanh nghiệp">
                      <input className={inputCls} placeholder="VD: CÔNG TY TNHH NGHIA TIN GOLD"
                        value={config.company_name} onChange={e => setConfig(p => ({ ...p, company_name: e.target.value }))} />
                    </Field>
                    <Field label="Địa chỉ">
                      <input className={inputCls} placeholder="Địa chỉ doanh nghiệp"
                        value={config.company_address} onChange={e => setConfig(p => ({ ...p, company_address: e.target.value }))} />
                    </Field>
                  </div>
                </div>

                {/* Kết quả lưu */}
                <AnimatePresence>
                  {saveResult && (
                    <motion.div key="save-result" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className={`flex items-start gap-3 p-4 rounded-xl text-sm border ${
                        saveResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                      {saveResult.success
                        ? <CheckCircle size={18} className="shrink-0 mt-0.5 text-green-600" />
                        : <XCircle size={18} className="shrink-0 mt-0.5 text-red-500" />}
                      <span className="font-medium">{saveResult.message}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Kết quả kiểm tra kết nối */}
                <AnimatePresence>
                  {testResult && (
                    <motion.div key="test-result" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className={`flex items-start gap-3 p-4 rounded-xl text-sm border ${
                        testResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                      {testResult.success
                        ? <CheckCircle size={18} className="shrink-0 mt-0.5 text-green-600" />
                        : <XCircle size={18} className="shrink-0 mt-0.5 text-red-500" />}
                      <div>
                        <p className="font-bold">{testResult.success ? 'Kết nối thành công!' : 'Kết nối thất bại'}</p>
                        <p className="mt-0.5 text-xs opacity-80">{testResult.message}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 bg-gold-500 text-luxury-black font-bold rounded-xl hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/20 disabled:opacity-60">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
                  </button>
                  <button onClick={handleTest} disabled={testing}
                    className="flex items-center gap-2 px-6 py-3 bg-white border border-zinc-200 text-zinc-700 font-bold rounded-xl hover:bg-zinc-50 hover:border-zinc-300 transition-all disabled:opacity-60">
                    {testing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    {testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
                  </button>
                </div>

                {/* Hướng dẫn */}
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5"><AlertCircle size={12} /> Hướng dẫn cấu hình:</p>
                  <ul className="space-y-1 ml-4 list-disc text-blue-700">
                    <li>Tài khoản: thường là Mã số thuế của doanh nghiệp</li>
                    <li>Mật khẩu: mật khẩu đăng nhập portal Viettel eInvoice (không phải VNeID)</li>
                    <li>URL API: dùng <code className="bg-blue-100 px-1 rounded">https://api-vinvoice.viettel.vn</code> cho production</li>
                    <li>Sandbox: bật khi test, tắt khi phát hành hóa đơn thật</li>
                    <li>Mẫu số và ký hiệu: lấy từ thông báo phát hành hóa đơn của Viettel</li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB: TẠO HÓA ĐƠN */}
        {activeTab === 'invoice' && (
          <motion.div key="invoice" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {!config._hasPassword || !config.username ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-4">
                <AlertCircle size={24} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-800">Chưa có cấu hình kết nối</p>
                  <p className="text-sm text-amber-700 mt-1">Vui lòng vào tab <strong>Cấu hình kết nối</strong>, điền đầy đủ thông tin và nhấn <strong>Lưu cấu hình</strong> trước khi tạo hóa đơn.</p>
                  <button onClick={() => setActiveTab('config')}
                    className="mt-3 px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-colors">
                    Đi đến Cấu hình →
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-zinc-100">
                  <h2 className="font-bold text-zinc-800">Tạo hóa đơn nháp</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Điền thông tin và gửi lên hệ thống Viettel vInvoice</p>
                </div>
                <div className="p-6 space-y-5">
                  {/* Người mua */}
                  <div className="p-4 bg-zinc-50 rounded-2xl space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Thông tin người mua</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Tên người mua" required>
                        <input className={inputCls} placeholder="Tên cá nhân hoặc tổ chức"
                          value={invoiceForm.buyerName}
                          onChange={e => setInvoiceForm(p => ({ ...p, buyerName: e.target.value }))} />
                      </Field>
                      <Field label="CCCD / MST người mua">
                        <input className={inputCls} placeholder="De trong neu khong co"
                          inputMode="numeric" pattern="[0-9]*"
                          value={invoiceForm.buyerIdNo}
                          onChange={e => {
                            const v = e.target.value.replace(/[^0-9]/g, '');
                            setInvoiceForm(p => ({ ...p, buyerIdNo: v }));
                          }} />
                      </Field>
                    </div>
                    <Field label="Địa chỉ">
                      <input className={inputCls} placeholder="Địa chỉ người mua"
                        value={invoiceForm.buyerAddress}
                        onChange={e => setInvoiceForm(p => ({ ...p, buyerAddress: e.target.value }))} />
                    </Field>
                  </div>

                  {/* Hàng hóa */}
                  <div className="p-4 bg-zinc-50 rounded-2xl space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Hàng hóa / Dịch vụ</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Tên hàng hóa" required>
                        <input className={inputCls} placeholder="Tên hàng hóa hoặc dịch vụ"
                          value={invoiceForm.itemName}
                          onChange={e => setInvoiceForm(p => ({ ...p, itemName: e.target.value }))} />
                      </Field>
                      <Field label="Mã hàng">
                        <input className={inputCls} placeholder="VD: VANG-SJC-1C"
                          value={invoiceForm.itemCode}
                          onChange={e => {
                            const v = e.target.value.toUpperCase().replace(/[^A-Z0-9\-_]/g, '');
                            setInvoiceForm(p => ({ ...p, itemCode: v }));
                          }} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <Field label="Số lượng" required>
                        <input ref={quantityRef} className={inputCls}
                          inputMode="numeric" pattern="[0-9]*"
                          defaultValue="1"
                          onChange={e => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            e.target.value = raw;
                            setInvoiceForm(p => ({ ...p, quantity: raw === '' ? 1 : parseInt(raw, 10) }));
                          }}
                          onBlur={e => {
                            if (!e.target.value || e.target.value === '0') e.target.value = '1';
                            setInvoiceForm(p => ({ ...p, quantity: parseInt(e.target.value||'1', 10) }));
                          }} />
                      </Field>
                      <Field label="Đơn vị tính">
                        <input className={inputCls} placeholder="Cái, Chỉ, Lượng..."
                          value={invoiceForm.unit}
                          onChange={e => setInvoiceForm(p => ({ ...p, unit: e.target.value }))} />
                      </Field>
                      <Field label="Đơn giá (VND)" required>
                        <input ref={unitPriceRef} className={inputCls}
                          inputMode="numeric"
                          placeholder="0"
                          defaultValue=""
                          onChange={e => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            const num = raw === '' ? 0 : parseInt(raw, 10);
                            // Không thay value khi đang gõ — chỉ update state
                            e.target.value = raw;
                            setInvoiceForm(p => ({ ...p, unitPrice: num }));
                          }}
                          onBlur={e => {
                            // Format đẹp khi blur
                            const num = parseInt(e.target.value.replace(/[^0-9]/g,'') || '0', 10);
                            e.target.value = num > 0 ? num.toLocaleString('vi-VN') : '';
                            setInvoiceForm(p => ({ ...p, unitPrice: num }));
                          }}
                          onFocus={e => {
                            // Bỏ dấu phẩy khi focus để dễ sửa
                            const num = invoiceForm.unitPrice;
                            e.target.value = num > 0 ? String(num) : '';
                          }} />
                      </Field>
                    </div>

                    {/* Tổng tiền preview */}
                    <div className="flex items-center justify-between p-3 bg-white border border-gold-200 rounded-xl">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Tổng tiền thanh toán</span>
                      <span className="text-lg font-bold text-gold-600 font-serif">
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(invoiceForm.quantity * invoiceForm.unitPrice)}
                      </span>
                    </div>
                  </div>

                  {/* Kết quả tạo hóa đơn */}
                  <AnimatePresence>
                    {invoiceResult && (
                      <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        {invoiceResult.error || invoiceResult.errorCode ? (
                          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
                            <XCircle size={18} className="shrink-0 mt-0.5 text-red-500" />
                            <div>
                              <p className="font-bold">Tạo hóa đơn thất bại</p>
                              <p className="mt-1 text-red-700">{invoiceResult.description || invoiceResult.error}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
                            <CheckCircle size={18} className="shrink-0 mt-0.5 text-green-600" />
                            <div>
                              <p className="font-bold">Tạo hóa đơn thành công!</p>
                              {invoiceResult.result?.invoiceNo && (
                                <p className="mt-1">Số hóa đơn: <strong>{invoiceResult.result.invoiceNo}</strong></p>
                              )}
                              {invoiceResult.transactionUuid && (
                                <p className="mt-0.5 text-xs text-green-600 font-mono">UUID: {invoiceResult.transactionUuid}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button onClick={handleCreateInvoice} disabled={creatingInvoice}
                    className="flex items-center gap-2 px-8 py-3 bg-gold-500 text-luxury-black font-bold rounded-xl hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/20 disabled:opacity-60">
                    {creatingInvoice ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {creatingInvoice ? 'Đang gửi lên Viettel...' : 'Tạo hóa đơn nháp'}
                  </button>

                  <p className="text-xs text-zinc-400">
                    * Hóa đơn được tạo ở trạng thái <strong>nháp</strong>. Cần đăng nhập portal Viettel để ký số và phát hành.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
