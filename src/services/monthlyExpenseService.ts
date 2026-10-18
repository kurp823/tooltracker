import { MonthlyExpenseRecord, MonthlyExpenseRow, SubDivision } from '../types';
import { calculateSubContractorTotals } from './subContractorRentalService';

const STORAGE_KEY = 'emdad_monthly_expenses';

// Standard Cost Codes based on user's Financial Structure
export const STANDARD_COST_CODES: Omit<MonthlyExpenseRow, 'fishing' | 'whipstock' | 'rentals' | 'total'>[] = [
  {
    code: 'CC-101',
    name: 'Direct Salary & Allowances',
    category: 'DIRECT',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-102',
    name: 'Leave & EOSB Provision',
    category: 'DIRECT',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-103',
    name: 'Lease Rental-Equipment',
    category: 'DIRECT',
    sourceType: 'SUB_RENTAL_AUTO',
  },
  {
    code: 'CC-104',
    name: 'Lease Rental-HV',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-105',
    name: 'Lease Rental-LPV',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-106',
    name: 'Repair And Maintenance',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-107',
    name: 'R&M - Prior Period Accrual True-Up',
    category: 'OVERHEAD',
    sourceType: 'TRUE_UP',
  },
  {
    code: 'CC-108',
    name: 'Consumables & Store Materials',
    category: 'DIRECT',
    sourceType: 'CONSUMABLES_AUTO',
  },
  {
    code: 'CC-109',
    name: 'Inspection & Testing Charges',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-110',
    name: 'Machining & Redress Charges',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-111',
    name: 'Freight & Transportation',
    category: 'DIRECT',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-112',
    name: 'Depreciation - Plant & Machinery (P&M)',
    category: 'DEPRECIATION',
    sourceType: 'DEPRECIATION_AUTO',
    sector: 'P&M',
    usefulLifeMonths: 60,
  },
  {
    code: 'CC-113',
    name: 'Depreciation - Operational Vehicles',
    category: 'DEPRECIATION',
    sourceType: 'DEPRECIATION_AUTO',
    sector: 'Vehicles',
    usefulLifeMonths: 48,
  },
  {
    code: 'CC-114',
    name: 'Depreciation - Computers & Printers',
    category: 'DEPRECIATION',
    sourceType: 'DEPRECIATION_AUTO',
    sector: 'Comp & Printers',
    usefulLifeMonths: 36,
  },
  {
    code: 'CC-115',
    name: 'Depreciation - IP Rights & Software',
    category: 'DEPRECIATION',
    sourceType: 'DEPRECIATION_AUTO',
    sector: 'IP Rights',
    usefulLifeMonths: 60,
  },
];

// Frozen September 2026 data matching the user's exact figures
export const FROZEN_SEP_2026: MonthlyExpenseRecord = {
  periodKey: '2026-09',
  monthName: 'September',
  year: 2026,
  isFrozen: true,
  status: 'LOCKED',
  lockedBy: 'Finance Controller',
  lockedAt: '2026-10-05T12:00:00Z',
  totalFishing: 12984180,
  totalWhipstock: 2541915,
  totalRentals: 11186716,
  grandTotal: 26712811,
  rows: [
    {
      code: 'CC-101',
      name: 'Direct Salary & Allowances',
      category: 'DIRECT',
      sourceType: 'MANUAL_ADMIN',
      fishing: 4399504,
      whipstock: 0,
      rentals: 180000,
      total: 4579504,
      isLocked: true,
    },
    {
      code: 'CC-102',
      name: 'Leave & EOSB Provision',
      category: 'DIRECT',
      sourceType: 'MANUAL_ADMIN',
      fishing: 366625,
      whipstock: 0,
      rentals: 15000,
      total: 381625,
      isLocked: true,
    },
    {
      code: 'CC-103',
      name: 'Lease Rental-Equipment',
      category: 'DIRECT',
      sourceType: 'SUB_RENTAL_AUTO',
      fishing: 5651723,
      whipstock: 2285915,
      rentals: 7955172,
      total: 15892810,
      isLocked: true,
    },
    {
      code: 'CC-104',
      name: 'Lease Rental-HV',
      category: 'OVERHEAD',
      sourceType: 'MANUAL_ADMIN',
      fishing: 145000,
      whipstock: 25000,
      rentals: 85000,
      total: 255000,
      isLocked: true,
    },
    {
      code: 'CC-105',
      name: 'Lease Rental-LPV',
      category: 'OVERHEAD',
      sourceType: 'MANUAL_ADMIN',
      fishing: 65000,
      whipstock: 12000,
      rentals: 42000,
      total: 119000,
      isLocked: true,
    },
    {
      code: 'CC-106',
      name: 'Repair And Maintenance',
      category: 'OVERHEAD',
      sourceType: 'MANUAL_ADMIN',
      fishing: 342019,
      whipstock: 45000,
      rentals: 187592,
      total: 574611,
      isLocked: true,
    },
    {
      code: 'CC-107',
      name: 'R&M - Prior Period Accrual True-Up',
      category: 'OVERHEAD',
      sourceType: 'TRUE_UP',
      fishing: 0,
      whipstock: 0,
      rentals: 0,
      total: 0,
      isLocked: true,
    },
    {
      code: 'CC-108',
      name: 'Consumables & Store Materials',
      category: 'DIRECT',
      sourceType: 'CONSUMABLES_AUTO',
      fishing: 85000,
      whipstock: 14000,
      rentals: 62000,
      total: 161000,
      isLocked: true,
    },
    {
      code: 'CC-109',
      name: 'Inspection & Testing Charges',
      category: 'OVERHEAD',
      sourceType: 'MANUAL_ADMIN',
      fishing: 78000,
      whipstock: 0,
      rentals: 52000,
      total: 130000,
      isLocked: true,
    },
    {
      code: 'CC-110',
      name: 'Machining & Redress Charges',
      category: 'OVERHEAD',
      sourceType: 'MANUAL_ADMIN',
      fishing: 52000,
      whipstock: 7445,
      rentals: 18000,
      total: 77445,
      isLocked: true,
    },
    {
      code: 'CC-111',
      name: 'Freight & Transportation',
      category: 'DIRECT',
      sourceType: 'MANUAL_ADMIN',
      fishing: 15000,
      whipstock: 0,
      rentals: 8000,
      total: 23000,
      isLocked: true,
    },
    {
      code: 'CC-112',
      name: 'Depreciation - Plant & Machinery (P&M)',
      category: 'DEPRECIATION',
      sourceType: 'DEPRECIATION_AUTO',
      sector: 'P&M',
      usefulLifeMonths: 60,
      fishing: 1784309,
      whipstock: 152555,
      rentals: 2571952,
      total: 4508816,
      isLocked: true,
    },
  ],
};

// Default October 2026 (Live Draft)
export const DEFAULT_OCT_2026: MonthlyExpenseRecord = {
  periodKey: '2026-10',
  monthName: 'October',
  year: 2026,
  isFrozen: false,
  status: 'DRAFT',
  totalFishing: 0,
  totalWhipstock: 0,
  totalRentals: 0,
  grandTotal: 0,
  rows: STANDARD_COST_CODES.map((base) => {
    // If it's Lease Rental Equipment, pull from October SubContractor Rentals automatically
    let fishing = 0;
    let whipstock = 0;
    let rentals = 0;

    if (base.code === 'CC-103') {
      const octTotals = calculateSubContractorTotals('2026-10');
      fishing = octTotals.divisionSplit.FISHING;
      whipstock = octTotals.divisionSplit.WHIPSTOCK;
      rentals = octTotals.divisionSplit.RENTALS;
    } else if (base.code === 'CC-107') {
      // Prior period true-up: check any variance from late invoices arriving in October
      rentals = 2500; // Motormax Sep job invoiced in Oct with +2,500 variance
    }

    const total = fishing + whipstock + rentals;
    return {
      ...base,
      fishing,
      whipstock,
      rentals,
      total,
      isLocked: false,
    };
  }),
};

export function getMonthlyExpenseRecords(): Record<string, MonthlyExpenseRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        // Guarantee Sep 2026 is always frozen from master
        parsed['2026-09'] = FROZEN_SEP_2026;
        if (!parsed['2026-10']) {
          parsed['2026-10'] = DEFAULT_OCT_2026;
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading monthly expenses:', e);
  }
  return {
    '2026-09': FROZEN_SEP_2026,
    '2026-10': DEFAULT_OCT_2026,
  };
}

export function saveMonthlyExpenseRecords(records: Record<string, MonthlyExpenseRecord>): void {
  try {
    // Keep 2026-09 strictly frozen
    records['2026-09'] = FROZEN_SEP_2026;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new Event('monthly_expenses_updated'));
  } catch (e) {
    console.error('Error saving monthly expenses:', e);
  }
}

export function saveMonthExpenseRecord(record: MonthlyExpenseRecord): void {
  if (record.isFrozen) {
    console.warn(`Period ${record.periodKey} is frozen and cannot be modified.`);
    return;
  }
  const records = getMonthlyExpenseRecords();
  
  // Auto-calculate row totals and grand totals
  let totalFishing = 0;
  let totalWhipstock = 0;
  let totalRentals = 0;

  const calculatedRows = record.rows.map((row) => {
    const total = Number(((row.fishing || 0) + (row.whipstock || 0) + (row.rentals || 0)).toFixed(2));
    totalFishing += row.fishing || 0;
    totalWhipstock += row.whipstock || 0;
    totalRentals += row.rentals || 0;
    return {
      ...row,
      total,
    };
  });

  const grandTotal = Number((totalFishing + totalWhipstock + totalRentals).toFixed(2));

  records[record.periodKey] = {
    ...record,
    rows: calculatedRows,
    totalFishing: Number(totalFishing.toFixed(2)),
    totalWhipstock: Number(totalWhipstock.toFixed(2)),
    totalRentals: Number(totalRentals.toFixed(2)),
    grandTotal,
  };

  saveMonthlyExpenseRecords(records);
}

export function cloneFromPreviousMonth(targetPeriodKey: string, sourcePeriodKey: string): MonthlyExpenseRecord {
  const records = getMonthlyExpenseRecords();
  const source = records[sourcePeriodKey] || FROZEN_SEP_2026;
  
  const [yearStr, monthStr] = targetPeriodKey.split('-');
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const mIndex = parseInt(monthStr, 10) - 1;

  const clonedRows: MonthlyExpenseRow[] = source.rows.map((r) => {
    // If it's prior period true-up, reset to 0 in new month
    if (r.sourceType === 'TRUE_UP') {
      return {
        ...r,
        fishing: 0,
        whipstock: 0,
        rentals: 0,
        total: 0,
        isLocked: false,
      };
    }
    return {
      ...r,
      isLocked: false,
    };
  });

  let totalFishing = 0;
  let totalWhipstock = 0;
  let totalRentals = 0;
  clonedRows.forEach((r) => {
    totalFishing += r.fishing || 0;
    totalWhipstock += r.whipstock || 0;
    totalRentals += r.rentals || 0;
  });

  const clonedRecord: MonthlyExpenseRecord = {
    periodKey: targetPeriodKey,
    monthName: monthNames[mIndex] || 'Month',
    year: parseInt(yearStr, 10) || 2026,
    isFrozen: false,
    status: 'DRAFT',
    rows: clonedRows,
    totalFishing,
    totalWhipstock,
    totalRentals,
    grandTotal: totalFishing + totalWhipstock + totalRentals,
  };

  saveMonthExpenseRecord(clonedRecord);
  return clonedRecord;
}
