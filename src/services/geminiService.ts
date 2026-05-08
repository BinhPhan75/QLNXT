import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, TransactionType } from "../types";

const ai = new GoogleGenAI({ apiKey: (process as any).env.GEMINI_API_KEY });

export interface ExtractedInvoice {
  customer: string;
  customerCard?: string;
  address?: string;
  invoiceNumber: string;
  invoiceDate: string;
  items: {
    itemCode: string;
    itemName: string;
    quantity: number;
    unit: string;
    price: number;
    total: number;
  }[];
}

export const extractInvoiceFromPdf = async (base64Data: string): Promise<ExtractedInvoice> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: "application/pdf",
            },
          },
          {
            text: `Bạn là một chuyên gia kế toán. Hãy trích xuất thông tin từ hóa đơn PDF này sang định dạng JSON.
            Thông tin cần lấy:
            - Tên khách hàng/đơn vị mua hàng (customer)
            - Số thẻ khách hàng hoặc CCCD nếu có (customerCard)
            - Địa chỉ khách hàng nếu có (address)
            - Số hóa đơn (invoiceNumber)
            - Ngày hóa đơn (invoiceDate) định dạng YYYY-MM-DD
            - Danh sách các mặt hàng (items): tên hàng, mã hàng (nếu có, nếu không thì để trống), số lượng, đơn vị tính, đơn giá, thành tiền.

            Lưu ý: 
            - Nếu không có mã hàng riêng biệt, hãy cố gắng tìm mã trong tên hàng (ví dụ: GD0000Y000219.440).
            - Trả về JSON chính xác theo schema.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          customer: { type: Type.STRING },
          customerCard: { type: Type.STRING },
          address: { type: Type.STRING },
          invoiceNumber: { type: Type.STRING },
          invoiceDate: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                itemCode: { type: Type.STRING },
                itemName: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                unit: { type: Type.STRING },
                price: { type: Type.NUMBER },
                total: { type: Type.NUMBER },
              },
              required: ["itemName", "quantity", "price", "total"],
            },
          },
        },
        required: ["customer", "invoiceNumber", "invoiceDate", "items"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Không thể trích xuất dữ liệu từ PDF");
  
  return JSON.parse(text) as ExtractedInvoice;
};

export const convertExtractedToTransactions = (extracted: ExtractedInvoice, type: TransactionType): Transaction[] => {
  return extracted.items.map(item => ({
    id: '', // Will be set by Firebase or parent
    date: new Date().toISOString(),
    invoiceDate: extracted.invoiceDate,
    invoiceNumber: extracted.invoiceNumber,
    type: type,
    itemCode: item.itemCode || 'KHONG-MA',
    itemName: item.itemName,
    quantity: item.quantity,
    unit: item.unit || 'Món',
    price: item.price,
    discount: 0,
    total: item.total,
    customer: extracted.customer,
    customerCard: extracted.customerCard || '',
    address: extracted.address || '',
  }));
};

export interface ClassifiedBankStatement {
  classification: 'PURCHASE' | 'SALE' | 'CASH_WITHDRAWAL' | 'CASH_DEPOSIT' | 'INTEREST' | 'FEE' | 'OTHER';
  customerName?: string;
  customerCard?: string;
  itemInfo?: string;
  note?: string;
}

export const classifyBankStatements = async (contents: string[]): Promise<ClassifiedBankStatement[]> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: `Bạn là một chuyên gia kế toán ngân hàng. Hãy phân loại các nội dung giao dịch ngân hàng sau đây.
            Nội dung có thể chứa thông tin người mua, người bán, tên mặt hàng và số lượng.
            
            Các loại phân loại: 
            - PURCHASE: Mua hàng (chuyển tiền đi cho người bán)
            - SALE: Bán hàng (nhận tiền từ người mua)
            - CASH_WITHDRAWAL: Rút tiền mặt (thường có từ "RUT SEC", "RUT TIEN")
            - CASH_DEPOSIT: Nộp tiền mặt vào TK (thường có từ "NOP TIEN")
            - INTEREST: Tiền lãi (thường có từ "INTEREST PAYMENT", "TRA LAI")
            - FEE: Phí ngân hàng
            - OTHER: Khác
            
            Hãy trích xuất tên khách hàng (customerName), số CCCD hoặc thẻ khách hàng (customerCard) nếu có, và thông tin mặt hàng (itemInfo) nếu có trong nội dung.
            
            Danh sách nội dung:
            ${contents.map((c, i) => `${i + 1}. ${c}`).join('\n')}
            
            Trả về một mảng JSON các đối tượng theo thứ tự.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            classification: { 
              type: Type.STRING, 
              enum: ['PURCHASE', 'SALE', 'CASH_WITHDRAWAL', 'CASH_DEPOSIT', 'INTEREST', 'FEE', 'OTHER'] 
            },
            customerName: { type: Type.STRING },
            customerCard: { type: Type.STRING },
            itemInfo: { type: Type.STRING },
            note: { type: Type.STRING },
          },
          required: ["classification"],
        },
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Không thể phân loại nội dung ngân hàng");
  
  return JSON.parse(text) as ClassifiedBankStatement[];
};
