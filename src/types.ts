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

export interface Transaction {
  id: string;
  type: 'IN' | 'OUT';
  date: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  price: number;
  discount: number;
  total: number;
  customer: string; 
  invoiceNumber?: string;
  invoiceDate?: string;
  cogs?: number; 
}

export interface User {
  username: string;
}
