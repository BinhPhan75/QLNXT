export interface OpeningBalance {
  itemCode: string;
  month: number; // 0-11
  year: number;
  quantity: number;
  totalValue: number;
}

export interface Product {
  code: string;
  name: string;
  unit: string;
  currentStock: number;
  averageCost: number;
}

export type TransactionType = 'IN' | 'OUT';
export type TransactionSource = 'PNJ' | 'REVENUE' | 'OTHER';

export interface Transaction {
  id: string;
  type: TransactionType;
  source?: TransactionSource;
  date: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  price: number;
  discount: number;
  total: number;
  customer: string; 
  customerCard?: string;
  address?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  cogs?: number; 
}

export interface User {
  username: string;
}
