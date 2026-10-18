import { SubContractorRental, SubDivision } from '../types';

const STORAGE_KEY = 'emdad_subcontractor_rentals';

export const INITIAL_SUB_RENTALS: SubContractorRental[] = [];

const MOCK_RENTAL_IDS = new Set(['SRA-2026-001', 'SRA-2026-002', 'SRA-2026-003', 'SRA-2026-004', 'SRA-2026-005']);

export function getSubContractorRentals(): SubContractorRental[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((r) => r && !MOCK_RENTAL_IDS.has(r.rentalId));
        return clean;
      }
    }
  } catch (e) {
    console.error('Error loading sub-contractor rentals:', e);
  }
  return [];
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
