import { ConsumableItem, ConsumableReceipt, ConsumableIssuance, SubDivision } from '../types';

const SKUS_KEY = 'emdad_consumable_skus';
const RECEIPTS_KEY = 'emdad_consumable_receipts';
const ISSUANCES_KEY = 'emdad_consumable_issuances';
const CATEGORIES_KEY = 'emdad_consumable_categories';

export const DEFAULT_CONSUMABLE_CATEGORIES: string[] = [
  'Redress Kit',
  'Paint & Coatings',
  'Spare Parts',
  'Lubricants & Oils',
  'HSE & Safety',
  'Seals & O-Rings',
];

export function getConsumableCategories(): string[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return DEFAULT_CONSUMABLE_CATEGORIES;
}

export function saveConsumableCategories(categories: string[]): void {
  try {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
    window.dispatchEvent(new Event('consumables_updated'));
  } catch (e) {}
}

export function addConsumableCategory(cat: string): string[] {
  const trimmed = cat.trim();
  if (!trimmed) return getConsumableCategories();
  const current = getConsumableCategories();
  if (!current.includes(trimmed)) {
    current.push(trimmed);
    saveConsumableCategories(current);
  }
  return current;
}

export const INITIAL_CONSUMABLES: ConsumableItem[] = [
  {
    id: 'SKU-001',
    partNo: 'RK-JAR-675',
    description: 'Redress Seal Kit for 6-3/4" Hydraulic Drilling Jar (High Temp Viton)',
    category: 'Redress Kit',
    unit: 'KIT',
    currentStock: 18,
    unitCostAED: 1850,
    reorderLevel: 5,
    binLocation: 'BAY-A-01',
    supplier: 'Downhole Seal Tech UAE',
    lastRestockedDate: '2026-09-12',
  },
  {
    id: 'SKU-002',
    partNo: 'RK-BUMPER-625',
    description: 'Complete Packing & O-Ring Redress Kit for 6-1/4" Bumper Sub',
    category: 'Redress Kit',
    unit: 'KIT',
    currentStock: 4,
    unitCostAED: 1200,
    reorderLevel: 5,
    binLocation: 'BAY-A-03',
    supplier: 'Downhole Seal Tech UAE',
    lastRestockedDate: '2026-08-20',
  },
  {
    id: 'SKU-003',
    partNo: 'PNT-EPOXY-BLUE',
    description: 'Industrial Heavy Duty Epoxy Marine Coating (Emdad Blue, 20L Drum)',
    category: 'Paint & Coatings',
    unit: 'CAN',
    currentStock: 25,
    unitCostAED: 450,
    reorderLevel: 8,
    binLocation: 'CHEM-STORE-02',
    supplier: 'Jotun Paints Abu Dhabi',
    lastRestockedDate: '2026-09-25',
  },
  {
    id: 'SKU-004',
    partNo: 'LUB-THRD-DOPE',
    description: 'API Spec High-Pressure Tool Joint Compound / Thread Dope (18kg Pail)',
    category: 'Lubricants & Oils',
    unit: 'CAN',
    currentStock: 32,
    unitCostAED: 620,
    reorderLevel: 10,
    binLocation: 'LUB-RACK-01',
    supplier: 'Bestolife UAE',
    lastRestockedDate: '2026-09-18',
  },
  {
    id: 'SKU-005',
    partNo: 'SP-WASHPIPE-800',
    description: 'Hardened Tungsten Carbide Coated Washpipe Assembly 8"',
    category: 'Spare Parts',
    unit: 'EA',
    currentStock: 6,
    unitCostAED: 4200,
    reorderLevel: 3,
    binLocation: 'MACH-PARTS-04',
    supplier: 'Rotary Precision UAE',
    lastRestockedDate: '2026-07-15',
  },
  {
    id: 'SKU-006',
    partNo: 'HSE-GLOVE-IMPACT',
    description: 'Heavy Duty Anti-Impact Rig & Workshop Gloves (Size XL, Pair)',
    category: 'HSE & Safety',
    unit: 'SET',
    currentStock: 85,
    unitCostAED: 65,
    reorderLevel: 25,
    binLocation: 'HSE-CAB-01',
    supplier: 'SafeTech Middle East',
    lastRestockedDate: '2026-10-01',
  },
];

export const INITIAL_ISSUANCES: ConsumableIssuance[] = [
  {
    issuanceId: 'SIV-2026-089',
    sivNumber: 'SIV-2026-089',
    issueDate: '2026-10-08',
    partNo: 'RK-JAR-675',
    description: 'Redress Seal Kit for 6-3/4" Hydraulic Drilling Jar (High Temp Viton)',
    qtyIssued: 2,
    unitCostAED: 1850,
    totalCostAED: 3700,
    destinationType: 'TOOL_REDRESS',
    toolSerialNo: 'JAR-675-014',
    jobId: 'JOB-026-01798',
    subDivision: 'RENTALS',
    requestedBy: 'Tariq Mansour (Lead Workshop Tech)',
    issuedBy: 'Hamdan Storekeeper',
    remarks: 'Post-job strip down redress before load test',
  },
  {
    issuanceId: 'SIV-2026-090',
    sivNumber: 'SIV-2026-090',
    issueDate: '2026-10-12',
    partNo: 'PNT-EPOXY-BLUE',
    description: 'Industrial Heavy Duty Epoxy Marine Coating (Emdad Blue, 20L Drum)',
    qtyIssued: 3,
    unitCostAED: 450,
    totalCostAED: 1350,
    destinationType: 'WORKSHOP_BASE',
    workshopArea: 'Main Base Blasting & Painting Yard',
    subDivision: 'FISHING',
    requestedBy: 'Mohamed Said (Yard Foreman)',
    issuedBy: 'Hamdan Storekeeper',
    remarks: 'Base equipment and basket maintenance repaint',
  },
];

export function getConsumablesList(): ConsumableItem[] {
  try {
    const raw = localStorage.getItem(SKUS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error loading consumables:', e);
  }
  return INITIAL_CONSUMABLES;
}

export function saveConsumablesList(items: ConsumableItem[]): void {
  try {
    localStorage.setItem(SKUS_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event('consumables_updated'));
  } catch (e) {
    console.error('Error saving consumables:', e);
  }
}

export function getConsumableIssuances(): ConsumableIssuance[] {
  try {
    const raw = localStorage.getItem(ISSUANCES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error loading consumable issuances:', e);
  }
  return INITIAL_ISSUANCES;
}

export function saveConsumableIssuances(issuances: ConsumableIssuance[]): void {
  try {
    localStorage.setItem(ISSUANCES_KEY, JSON.stringify(issuances));
    window.dispatchEvent(new Event('consumables_updated'));
  } catch (e) {
    console.error('Error saving consumable issuances:', e);
  }
}

export function recordConsumableReceipt(receipt: Omit<ConsumableReceipt, 'receiptId'>): void {
  const items = getConsumablesList();
  const existing = items.find((i) => i.partNo === receipt.partNo);
  
  if (existing) {
    // Update stock & average unit cost
    const currentTotalVal = existing.currentStock * existing.unitCostAED;
    const newTotalVal = currentTotalVal + receipt.totalCostAED;
    const newQty = existing.currentStock + receipt.qtyReceived;
    const newAvgCost = newQty > 0 ? Number((newTotalVal / newQty).toFixed(2)) : receipt.unitCostAED;

    existing.currentStock = newQty;
    existing.unitCostAED = newAvgCost;
    existing.lastRestockedDate = receipt.receivedDate;
    if (receipt.supplier) existing.supplier = receipt.supplier;
  } else {
    // Add new SKU
    items.push({
      id: `SKU-${Date.now()}`,
      partNo: receipt.partNo,
      description: receipt.description,
      category: 'Spare Parts',
      unit: 'EA',
      currentStock: receipt.qtyReceived,
      unitCostAED: receipt.unitCostAED,
      reorderLevel: 5,
      binLocation: 'RECEIVING-DOCK',
      supplier: receipt.supplier,
      lastRestockedDate: receipt.receivedDate,
    });
  }
  saveConsumablesList(items);

  // Save receipt history
  try {
    const currentReceipts: ConsumableReceipt[] = JSON.parse(localStorage.getItem(RECEIPTS_KEY) || '[]');
    currentReceipts.unshift({
      ...receipt,
      receiptId: `REC-${Date.now()}`,
    });
    localStorage.setItem(RECEIPTS_KEY, JSON.stringify(currentReceipts));
  } catch (e) {}
}

export function issueConsumableItem(issuanceData: Omit<ConsumableIssuance, 'issuanceId' | 'sivNumber' | 'totalCostAED'>): { success: boolean; message: string; sivNumber?: string } {
  const items = getConsumablesList();
  const item = items.find((i) => i.partNo === issuanceData.partNo);

  if (!item) {
    return { success: false, message: `Part No ${issuanceData.partNo} not found in consumables inventory.` };
  }

  if (item.currentStock < issuanceData.qtyIssued) {
    return {
      success: false,
      message: `Insufficient stock! Requested: ${issuanceData.qtyIssued} ${item.unit}, Current Available: ${item.currentStock} ${item.unit}. Negative inventory is not permitted.`,
    };
  }

  // Deduct stock
  item.currentStock -= issuanceData.qtyIssued;
  saveConsumablesList(items);

  const sivNumber = `SIV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  const totalCostAED = Number((issuanceData.qtyIssued * (issuanceData.unitCostAED || item.unitCostAED)).toFixed(2));

  const newIssuance: ConsumableIssuance = {
    ...issuanceData,
    issuanceId: `ISS-${Date.now()}`,
    sivNumber,
    unitCostAED: issuanceData.unitCostAED || item.unitCostAED,
    totalCostAED,
  };

  const issuances = getConsumableIssuances();
  issuances.unshift(newIssuance);
  saveConsumableIssuances(issuances);

  return {
    success: true,
    message: `Successfully issued ${issuanceData.qtyIssued} ${item.unit} under Voucher ${sivNumber}.`,
    sivNumber,
  };
}

export function generateSivPrintHtml(issuance: ConsumableIssuance): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>STORE ISSUANCE VOUCHER - ${issuance.sivNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 24px; color: #1e293b; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 16px; }
    .title { font-size: 20px; font-weight: 800; color: #1e3a8a; margin: 0; }
    .subtitle { font-size: 11px; color: #64748b; margin-top: 2px; }
    .voucher-pill { font-family: monospace; font-size: 15px; font-weight: 700; color: #b91c1c; border: 1px solid #fca5a5; background: #fef2f2; padding: 4px 10px; border-radius: 4px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px; margin-bottom: 18px; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 4px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .info-label { font-weight: 600; color: #475569; }
    .info-value { font-weight: 700; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
    th { background: #e0f2fe; color: #0369a1; text-align: left; padding: 8px 10px; border: 1px solid #bae6fd; font-weight: 700; }
    td { padding: 8px 10px; border: 1px solid #e2e8f0; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; font-size: 12px; }
    .sign-box { border-top: 1px solid #94a3b8; padding-top: 8px; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">EMDAD SERVICES LLC — STORE ISSUANCE VOUCHER (SIV)</h1>
      <div class="subtitle">Consumables & Material Requisition Slip | Internal Store Transfer</div>
    </div>
    <div class="voucher-pill">${issuance.sivNumber}</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <div class="info-row"><span class="info-label">Issue Date:</span><span class="info-value">${issuance.issueDate}</span></div>
      <div class="info-row"><span class="info-label">Sub-Division P&L:</span><span class="info-value" style="color:#0369a1;">${issuance.subDivision}</span></div>
      <div class="info-row"><span class="info-label">Destination Routing:</span><span class="info-value">${issuance.destinationType === 'TOOL_REDRESS' ? 'Direct Tool Redress / Assembly' : 'Workshop Base Overhead'}</span></div>
    </div>
    <div class="info-card">
      <div class="info-row"><span class="info-label">Target Tool Serial:</span><span class="info-value" style="font-family:monospace;">${issuance.toolSerialNo || '—'}</span></div>
      <div class="info-row"><span class="info-label">Job Number / Reference:</span><span class="info-value" style="font-family:monospace;">${issuance.jobId || 'Workshop General'}</span></div>
      <div class="info-row"><span class="info-label">Workshop Area:</span><span class="info-value">${issuance.workshopArea || 'Main Base'}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 15%;">Part No</th>
        <th style="width: 50%;">Description</th>
        <th style="width: 10%; text-align: right;">Qty</th>
        <th style="width: 12%; text-align: right;">Unit Cost (AED)</th>
        <th style="width: 13%; text-align: right;">Total Cost (AED)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="font-family: monospace; font-weight: 700;">${issuance.partNo}</td>
        <td>${issuance.description}</td>
        <td style="text-align: right; font-weight: 700;">${issuance.qtyIssued}</td>
        <td style="text-align: right; font-family: monospace;">${issuance.unitCostAED.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; font-family: monospace; font-weight: 700; color: #1e3a8a;">${issuance.totalCostAED.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
    </tbody>
  </table>

  <div style="font-size: 11px; color: #64748b; margin-bottom: 20px;">
    <strong>Remarks / Usage Notes:</strong> ${issuance.remarks || 'Standard redress / operational issue as authorized.'}
  </div>

  <div class="signatures">
    <div class="sign-box">
      <strong>Issued By (Storekeeper):</strong><br /><br />
      <div>${issuance.issuedBy}</div>
      <div style="color: #64748b; font-size: 10px; margin-top: 4px;">Signature &amp; Stamp</div>
    </div>
    <div class="sign-box">
      <strong>Requested &amp; Received By:</strong><br /><br />
      <div>${issuance.requestedBy}</div>
      <div style="color: #64748b; font-size: 10px; margin-top: 4px;">Signature &amp; Date</div>
    </div>
  </div>
</body>
</html>
  `;
}
