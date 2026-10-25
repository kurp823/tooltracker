import { MonthlyExpenseRecord, MonthlyExpenseRow, SubDivision } from '../types';
import { calculateSubContractorTotals } from './subContractorRentalService';

const STORAGE_KEY = 'emdad_monthly_expenses';

// Standard Cost Codes based on user's exact Financial Structure Master Sheet
export const STANDARD_COST_CODES: Omit<MonthlyExpenseRow, 'fishing' | 'whipstock' | 'rentals' | 'total'>[] = [
  {
    code: 'CC-01',
    name: 'Cost of Materials',
    category: 'DIRECT',
    sourceType: 'CONSUMABLES_AUTO',
  },
  {
    code: 'CC-02',
    name: 'Cost of Service',
    category: 'DIRECT',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-03',
    name: 'Direct - Salary and allowances',
    category: 'DIRECT',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-04',
    name: 'Direct - OverTime',
    category: 'DIRECT',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-05',
    name: 'Rig Bonus',
    category: 'DIRECT',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-06',
    name: 'Repair And Maintenance',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-07',
    name: 'R&M - Prior Period Accrual True-Up',
    category: 'OVERHEAD',
    sourceType: 'TRUE_UP',
  },
  {
    code: 'CC-08',
    name: 'Lease Rental-LPV',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-09',
    name: 'Lease Rental-HV',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-10',
    name: 'Lease Rental-Eqiupment',
    category: 'DIRECT',
    sourceType: 'SUB_RENTAL_AUTO',
  },
  {
    code: 'CC-11',
    name: 'HSE Expances',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-12',
    name: 'Freight & Courier Exp',
    category: 'DIRECT',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-13',
    name: 'Machining/Calibration',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-14',
    name: 'Inspection/Testing',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-15',
    name: 'Dep P&M',
    category: 'DEPRECIATION',
    sourceType: 'DEPRECIATION_AUTO',
    sector: 'P&M',
    usefulLifeMonths: 60,
  },
  {
    code: 'CC-16',
    name: 'Dep Vehicles',
    category: 'DEPRECIATION',
    sourceType: 'DEPRECIATION_AUTO',
    sector: 'Vehicles',
    usefulLifeMonths: 48,
  },
  {
    code: 'CC-17',
    name: 'Dep Comp & Printers',
    category: 'DEPRECIATION',
    sourceType: 'DEPRECIATION_AUTO',
    sector: 'Comp & Printers',
    usefulLifeMonths: 36,
  },
  {
    code: 'CC-18',
    name: 'Dep Intellectual Property Rights',
    category: 'DEPRECIATION',
    sourceType: 'DEPRECIATION_AUTO',
    sector: 'IP Rights',
    usefulLifeMonths: 60,
  },
  {
    code: 'CC-19',
    name: 'Office/Wareshouse/Accomodation Space Rental',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-20',
    name: 'Communication Expenses',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-21',
    name: 'Vehicle Petrol',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
  },
  {
    code: 'CC-22',
    name: 'Office Exp',
    category: 'OVERHEAD',
    sourceType: 'MANUAL_ADMIN',
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
  rows: STANDARD_COST_CODES.map((base) => {
    let fishing = 0;
    let whipstock = 0;
    let rentals = 0;

    if (base.code === 'CC-03') { // Direct - Salary and allowances
      fishing = 4399504;
      whipstock = 0;
      rentals = 180000;
    } else if (base.code === 'CC-04') { // Direct - OverTime
      fishing = 366625;
      whipstock = 0;
      rentals = 15000;
    } else if (base.code === 'CC-10') { // Lease Rental-Eqiupment
      fishing = 5651723;
      whipstock = 2285915;
      rentals = 7955172;
    } else if (base.code === 'CC-09') { // Lease Rental-HV
      fishing = 145000;
      whipstock = 25000;
      rentals = 85000;
    } else if (base.code === 'CC-08') { // Lease Rental-LPV
      fishing = 65000;
      whipstock = 12000;
      rentals = 42000;
    } else if (base.code === 'CC-06') { // Repair And Maintenance
      fishing = 342019;
      whipstock = 45000;
      rentals = 187592;
    } else if (base.code === 'CC-01') { // Cost of Materials
      fishing = 85000;
      whipstock = 14000;
      rentals = 62000;
    } else if (base.code === 'CC-14') { // Inspection/Testing
      fishing = 78000;
      whipstock = 0;
      rentals = 52000;
    } else if (base.code === 'CC-13') { // Machining/Calibration
      fishing = 52000;
      whipstock = 7445;
      rentals = 18000;
    } else if (base.code === 'CC-12') { // Freight & Courier Exp
      fishing = 15000;
      whipstock = 0;
      rentals = 8000;
    } else if (base.code === 'CC-15') { // Dep P&M
      fishing = 1784309;
      whipstock = 152555;
      rentals = 2571952;
    }

    const total = fishing + whipstock + rentals;
    return {
      ...base,
      fishing,
      whipstock,
      rentals,
      total,
      isLocked: true,
    };
  }),
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
    let fishing = 0;
    let whipstock = 0;
    let rentals = 0;

    if (base.code === 'CC-10') { // Lease Rental-Eqiupment
      const octTotals = calculateSubContractorTotals('2026-10');
      fishing = octTotals.divisionSplit.FISHING;
      whipstock = octTotals.divisionSplit.WHIPSTOCK;
      rentals = octTotals.divisionSplit.RENTALS;
    } else if (base.code === 'CC-07') { // Prior period true-up
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

export function safeNum(val: unknown): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const p = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(p) ? 0 : p;
}

export function saveMonthExpenseRecord(record: MonthlyExpenseRecord): void {
  if (record.isFrozen) {
    console.warn(`Period ${record.periodKey} is frozen and cannot be modified.`);
    return;
  }
  const records = getMonthlyExpenseRecords();
  
  // Auto-calculate row totals and grand totals safely
  let totalFishing = 0;
  let totalWhipstock = 0;
  let totalRentals = 0;

  const calculatedRows = record.rows.map((row) => {
    const f = safeNum(row.fishing);
    const w = safeNum(row.whipstock);
    const r = safeNum(row.rentals);
    const total = Number((f + w + r).toFixed(2));
    totalFishing += f;
    totalWhipstock += w;
    totalRentals += r;
    return {
      ...row,
      fishing: f,
      whipstock: w,
      rentals: r,
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
