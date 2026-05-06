import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  if (value === undefined || value === null || isNaN(value)) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

export function formatQuantity(value: number, decimals: number = 3) {
  if (value === undefined || value === null || isNaN(value)) return "0";
  
  // Use vi-VN to get basic formatting
  const formatted = new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);

  // If the browser/env doesn't support vi-VN properly and uses dot for decimals (US style),
  // we perform a manual fix to ensure dot for thousands and comma for decimals as per user's request.
  // We check if "1.1" formatted as vi-VN still contains a dot.
  const testFormat = new Intl.NumberFormat("vi-VN").format(1.1);
  if (testFormat.includes('.')) {
    // US Style detected (1.1). We need to swap dots and commas.
    // Example: 1,234.567 -> 1.234,567
    let result = formatted.replace(/,/g, 'THOUSANDS').replace(/\./g, 'DECIMAL');
    return result.replace(/THOUSANDS/g, '.').replace(/DECIMAL/g, ',');
  }
  
  return formatted;
}

export function formatDate(date: string | Date) {
  if (!date) return "";
  const dateStr = date.toString();
  const parts = dateStr.split('T')[0].split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) { // YYYY-MM-DD
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }
  return new Date(dateStr).toLocaleDateString("vi-VN");
}

export function getYearMonth(dateStr: string | Date) {
  if (!dateStr) return { month: -1, year: -1 };
  if (dateStr instanceof Date) return { month: dateStr.getMonth(), year: dateStr.getFullYear() };
  
  // Normalize string: remove time if present, replace common separators
  const cleanDate = dateStr.toString().split(' ')[0].split('T')[0];
  const parts = cleanDate.split(/[-/.]/);

  if (parts.length === 3) {
    if (parts[0].length === 4) { // YYYY-MM-DD
      return { month: parseInt(parts[1]) - 1, year: parseInt(parts[0]) };
    } else if (parts[2].length === 4) { // DD/MM/YYYY
      return { month: parseInt(parts[1]) - 1, year: parseInt(parts[2]) };
    }
  }
  
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { month: -1, year: -1 };
  return { month: d.getMonth(), year: d.getFullYear() };
}
