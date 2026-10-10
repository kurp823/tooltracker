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
 * Checks if a date value is invalid, empty, or a SQL placeholder (e.g. 1900-01-01 or 1970-01-01)
 */
export function isInvalidOrPlaceholderDate(value?: string | Date | null): boolean {
  if (!value) return true;
  if (value instanceof Date) {
    if (isNaN(value.getTime()) || value.getFullYear() <= 1900) return true;
    return false;
  }
  const str = String(value).trim();
  if (
    !str ||
    str === '—' ||
    str === '-' ||
    str === 'null' ||
    str === 'undefined' ||
    str === 'NIL' ||
    str === 'NULL' ||
    str.startsWith('1900') ||
    str.startsWith('01-Jan-1900') ||
    str.startsWith('01-jan-1900') ||
    str.startsWith('01/01/1900') ||
    str.startsWith('1970-01-01') ||
    str.includes('1900-01-01')
  ) {
    return true;
  }
  return false;
}

/**
 * Formats any date string or Date object into standard dd/mm/yyyy format (e.g., 01/09/2026)
 * Returns empty string for invalid, missing, or 1900 placeholder dates.
 */
export function formatDateDDMMYYYY(value?: string | Date | null): string {
  if (isInvalidOrPlaceholderDate(value)) return '';
  
  if (value instanceof Date) {
    if (isNaN(value.getTime()) || value.getFullYear() <= 1900) return '';
    const d = String(value.getDate()).padStart(2, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const yyyy = String(value.getFullYear());
    return `${d}/${m}/${yyyy}`;
  }

  const str = String(value).trim();

  // If already formatted like DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const parts = str.split('/');
    if (parseInt(parts[2], 10) <= 1900) return '';
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
  }

  // Handle YYYY-MM-DD or ISO strings like 2026-09-01T... or 2024-02-01T00:00:00.000Z
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    if (parseInt(y, 10) <= 1900) return '';
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${d}/${m}/${y}`;
  }

  // Fallback try standard Date parsing
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    if (parsed.getFullYear() <= 1900) return '';
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = String(parsed.getFullYear());
    return `${d}/${m}/${yyyy}`;
  }

  return '';
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
