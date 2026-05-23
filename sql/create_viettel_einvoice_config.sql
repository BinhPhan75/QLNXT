-- Migration: Tạo table cấu hình kết nối Hóa đơn điện tử Viettel vInvoice
-- Chạy script này trong Neon SQL Editor

CREATE TABLE IF NOT EXISTS viettel_einvoice_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL DEFAULT '',       -- Tên đăng nhập (thường là mã số thuế)
  password      TEXT NOT NULL DEFAULT '',       -- Mật khẩu hóa đơn điện tử
  tax_code      TEXT NOT NULL DEFAULT '',       -- Mã số thuế doanh nghiệp
  api_url       TEXT NOT NULL DEFAULT 'https://api-vinvoice.viettel.vn',  -- URL API Viettel vInvoice
  template_code TEXT NOT NULL DEFAULT '',       -- Mẫu số hóa đơn (vd: 01GTKT0/001)
  invoice_series TEXT NOT NULL DEFAULT '',      -- Ký hiệu hóa đơn (vd: C25TAA)
  is_sandbox    BOOLEAN NOT NULL DEFAULT TRUE,  -- TRUE = môi trường thử nghiệm
  company_name  TEXT NOT NULL DEFAULT '',       -- Tên doanh nghiệp (hiển thị trên hóa đơn)
  company_address TEXT NOT NULL DEFAULT '',     -- Địa chỉ doanh nghiệp
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chỉ cho phép 1 bản ghi cấu hình (upsert theo id cố định)
-- Row đầu tiên dùng id = '00000000-0000-0000-0000-000000000001'

-- Index để query nhanh
CREATE INDEX IF NOT EXISTS idx_viettel_einvoice_config_updated 
  ON viettel_einvoice_config(updated_at DESC);

-- Comment mô tả
COMMENT ON TABLE viettel_einvoice_config IS 'Cấu hình kết nối Hóa đơn điện tử Viettel vInvoice';
COMMENT ON COLUMN viettel_einvoice_config.username IS 'Tên đăng nhập Viettel (thường = mã số thuế)';
COMMENT ON COLUMN viettel_einvoice_config.password IS 'Mật khẩu đăng nhập portal hóa đơn Viettel';
COMMENT ON COLUMN viettel_einvoice_config.tax_code IS 'Mã số thuế 10 hoặc 13 số';
COMMENT ON COLUMN viettel_einvoice_config.api_url IS 'Base URL API: https://api-vinvoice.viettel.vn (production) hoặc https://sandbox-einvoice.viettel.vn (test)';
COMMENT ON COLUMN viettel_einvoice_config.template_code IS 'Mẫu số: vd 01GTKT0/001';
COMMENT ON COLUMN viettel_einvoice_config.invoice_series IS 'Ký hiệu: vd C25TAA';
COMMENT ON COLUMN viettel_einvoice_config.is_sandbox IS 'true = dùng môi trường thử nghiệm, false = production';
