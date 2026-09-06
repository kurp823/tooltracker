/**
 * Common formatting utilities for EMDAD Operations Platform
 */

/**
 * Formats any date string or Date object into strict dd/mm/yy format (e.g., 01/09/26)
 */
export function formatDateDDMMYY(value?: string | Date | null): string {
  if (!value) return '';
  
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    const d = String(value.getDate()).padStart(2, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const yy = String(value.getFullYear()).slice(-2);
    return `${d}/${m}/${yy}`;
  }

  const str = String(value).trim();
  if (!str) return '';

  // If already formatted like DD/MM/YY or DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(str)) {
    const parts = str.split('/');
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const yy = parts[2].slice(-2);
    return `${d}/${m}/${yy}`;
  }

  // Handle YYYY-MM-DD or ISO strings like 2026-09-01T...
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    const yy = y.slice(-2);
    return `${d}/${m}/${yy}`;
  }

  // Fallback try standard Date parsing
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const yy = String(parsed.getFullYear()).slice(-2);
    return `${d}/${m}/${yy}`;
  }

  return str;
}

/**
 * Format quantity as clean whole number or stripped decimals (e.g. 1 instead of 1.000000)
 */
export function formatQty(val?: number | string | null): string {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return String(val);
  return Number.isInteger(num) ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '');
}
