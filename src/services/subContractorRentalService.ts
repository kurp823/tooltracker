import { SubContractorRental, SubDivision } from '../types';

const STORAGE_KEY = 'emdad_subcontractor_rentals';

export const INITIAL_SUB_RENTALS: SubContractorRental[] = [
  {
    rentalId: 'SRA-2026-001',
    jobId: 'JOB-026-01798',
    supplierName: 'Motormax Drilling Technologies',
    rentalAgreementNo: 'MMX-UAE-2026-081',
    toolDesc: '8-1/2" Positive Displacement Mud Motor (7/8 5.0 Stage)',
    serialNo: 'MM-85-1102',
    rentalType: 'Daily',
    rateAmount: 2500,
    standbyRate: 1000,
    startDate: '2026-09-02',
    endDate: '2026-09-18',
    operatingDays: 14,
    standbyDays: 2,
    totalAccrued: 37000, // 14*2500 + 2*1000
    poReference: 'PO-MMX-2026-044',
    invoiceRef: 'INV-MMX-9921',
    invoiceDate: '2026-10-14',
    invoiceAmount: 39500,
    variance: 2500, // Invoiced higher by 2500
    division: 'RENTALS',
    clientCode: 'ADNOC Onshore',
    rig: 'AD-33',
    well: 'GH-0412',
    contractRef: '4700023861',
    accrualMonth: '2026-09',
    invoiceMonth: '2026-10',
    isPriorPeriodTrueUp: true,
    status: 'INVOICE_RECEIVED',
    notes: 'Prior period true-up: Sep accrual AED 37,000, supplier invoiced in Oct for AED 39,500 (+2,500 variance posted to Oct true-up).',
    createdAt: '2026-09-02T08:00:00Z',
    updatedAt: '2026-10-15T10:30:00Z',
  },
  {
    rentalId: 'SRA-2026-002',
    jobId: 'JOB-026-01720',
    supplierName: 'EPIS Oilfield Services',
    rentalAgreementNo: 'EPIS-AGR-4412',
    toolDesc: 'Heavy Duty Fishing Hydraulic Bumper Sub 6-1/4"',
    serialNo: 'EP-HBS-625-99',
    rentalType: 'Daily',
    rateAmount: 1800,
    standbyRate: 900,
    startDate: '2026-09-10',
    endDate: '2026-09-25',
    operatingDays: 12,
    standbyDays: 3,
    totalAccrued: 24300, // 12*1800 + 3*900
    poReference: 'PO-EPIS-2026-19',
    invoiceRef: 'INV-EPIS-8831',
    invoiceDate: '2026-09-29',
    invoiceAmount: 24300,
    variance: 0,
    division: 'FISHING',
    clientCode: 'ADNOC Drilling',
    rig: 'ND-19',
    well: 'BUH-0081',
    contractRef: '4700024608',
    accrualMonth: '2026-09',
    invoiceMonth: '2026-09',
    isPriorPeriodTrueUp: false,
    status: 'PAID',
    notes: 'Invoice matched exact accrual. Settled on 05-Oct-2026.',
    createdAt: '2026-09-10T09:00:00Z',
    updatedAt: '2026-10-05T14:00:00Z',
  },
  {
    rentalId: 'SRA-2026-003',
    jobId: 'JOB-026-01650',
    supplierName: 'Coretrax Well Integrity',
    rentalAgreementNo: 'CTX-WHIP-009',
    toolDesc: '7" Casing Whipstock Mechanical Starter & Anchor Assembly',
    serialNo: 'CTX-WH-700-14',
    rentalType: 'Lumpsum',
    rateAmount: 48000,
    standbyRate: 0,
    startDate: '2026-09-15',
    endDate: '2026-09-28',
    operatingDays: 13,
    standbyDays: 0,
    totalAccrued: 48000,
    poReference: 'PO-CTX-2026-011',
    invoiceRef: undefined,
    invoiceDate: undefined,
    invoiceAmount: undefined,
    variance: 0,
    division: 'WHIPSTOCK',
    clientCode: 'ADNOC Offshore',
    rig: 'RIG-8',
    well: 'US-0199',
    contractRef: '4700018368',
    accrualMonth: '2026-09',
    isPriorPeriodTrueUp: false,
    status: 'ACCRUED',
    notes: 'Pending supplier invoice from Coretrax UK/UAE.',
    createdAt: '2026-09-15T11:00:00Z',
    updatedAt: '2026-09-28T16:00:00Z',
  },
  {
    rentalId: 'SRA-2026-004',
    jobId: 'JOB-026-01850',
    supplierName: 'Weatherford Middle East',
    rentalAgreementNo: 'WFT-REN-2026-309',
    toolDesc: '9-1/2" Fishing Magnet & Junk Basket High Flow',
    serialNo: 'WFT-MAG-950-02',
    rentalType: 'Daily',
    rateAmount: 1400,
    standbyRate: 700,
    startDate: '2026-10-02',
    endDate: '2026-10-16',
    operatingDays: 11,
    standbyDays: 3,
    totalAccrued: 17500, // 11*1400 + 3*700
    poReference: 'PO-WFT-2026-091',
    division: 'FISHING',
    clientCode: 'ADNOC Onshore',
    rig: 'AD-21',
    well: 'AS-0055',
    contractRef: '444558',
    accrualMonth: '2026-10',
    status: 'ACCRUED',
    notes: 'Currently on rig, pending off-hire ticket verification.',
    createdAt: '2026-10-02T10:00:00Z',
    updatedAt: '2026-10-16T12:00:00Z',
  },
  {
    rentalId: 'SRA-2026-005',
    jobId: 'JOB-026-01901',
    supplierName: 'Motormax Drilling Technologies',
    rentalAgreementNo: 'MMX-UAE-2026-105',
    toolDesc: '6-3/4" High Torque Downhole Drilling Jar',
    serialNo: 'MM-675-JAR-45',
    rentalType: 'Daily',
    rateAmount: 2200,
    standbyRate: 1100,
    startDate: '2026-10-05',
    endDate: undefined,
    operatingDays: 12,
    standbyDays: 1,
    totalAccrued: 27500,
    poReference: 'PO-MMX-2026-059',
    division: 'RENTALS',
    clientCode: 'ADNOC Onshore',
    rig: 'AD-33',
    well: 'GH-0413',
    contractRef: '4700023861',
    accrualMonth: '2026-10',
    status: 'ACCRUED',
    notes: 'Active job, open rental agreement.',
    createdAt: '2026-10-05T08:30:00Z',
    updatedAt: '2026-10-18T09:00:00Z',
  },
];

export function getSubContractorRentals(): SubContractorRental[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error loading sub-contractor rentals:', e);
  }
  return INITIAL_SUB_RENTALS;
}

export function saveSubContractorRentals(rentals: SubContractorRental[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rentals));
    window.dispatchEvent(new Event('subcontractor_rentals_updated'));
  } catch (e) {
    console.error('Error saving sub-contractor rentals:', e);
  }
}

export function upsertSubContractorRental(rental: SubContractorRental): void {
  const current = getSubContractorRentals();
  const idx = current.findIndex((r) => r.rentalId === rental.rentalId);
  
  // Recalculate variance if invoice amount present
  const updatedRental = { ...rental };
  if (updatedRental.invoiceAmount !== undefined && updatedRental.invoiceAmount !== null) {
    updatedRental.variance = Number((updatedRental.invoiceAmount - updatedRental.totalAccrued).toFixed(2));
    
    // Check prior period true-up (if invoice month > accrual month)
    if (updatedRental.invoiceDate) {
      const invMonth = updatedRental.invoiceDate.substring(0, 7);
      updatedRental.invoiceMonth = invMonth;
      if (invMonth > updatedRental.accrualMonth) {
        updatedRental.isPriorPeriodTrueUp = true;
      }
    }
  }

  if (idx >= 0) {
    current[idx] = { ...updatedRental, updatedAt: new Date().toISOString() };
  } else {
    current.unshift({
      ...updatedRental,
      createdAt: updatedRental.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  saveSubContractorRentals(current);
}

export function deleteSubContractorRental(rentalId: string): void {
  const current = getSubContractorRentals().filter((r) => r.rentalId !== rentalId);
  saveSubContractorRentals(current);
}

export function calculateSubContractorTotals(month?: string) {
  const list = getSubContractorRentals();
  const filtered = month ? list.filter((r) => r.accrualMonth === month) : list;
  
  const totalAccrued = filtered.reduce((sum, r) => sum + (r.totalAccrued || 0), 0);
  const totalInvoiced = filtered.reduce((sum, r) => sum + (r.invoiceAmount || 0), 0);
  const totalVariance = filtered.reduce((sum, r) => sum + (r.variance || 0), 0);
  const pendingInvoicesCount = filtered.filter((r) => r.status === 'ACCRUED').length;
  const activeCount = filtered.filter((r) => !r.endDate || r.endDate === '').length;

  const divisionSplit: Record<SubDivision, number> = {
    FISHING: 0,
    WHIPSTOCK: 0,
    RENTALS: 0,
  };

  filtered.forEach((r) => {
    if (r.division && divisionSplit[r.division] !== undefined) {
      divisionSplit[r.division] += r.totalAccrued || 0;
    } else {
      divisionSplit.RENTALS += r.totalAccrued || 0;
    }
  });

  return {
    totalAccrued,
    totalInvoiced,
    totalVariance,
    pendingInvoicesCount,
    activeCount,
    divisionSplit,
  };
}
