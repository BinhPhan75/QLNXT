import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, TransactionType } from "../types";

const ai = new GoogleGenAI({ apiKey: (process as any).env.GEMINI_API_KEY });

export interface ExtractedInvoice {
  customer: string;
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
    total: item.total,
    customer: extracted.customer,
  }));
};
