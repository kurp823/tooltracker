import {
  PurchaseOrder,
  POLineItem,
  GoodsReceiptNote,
  GRNLineItem,
  SubDivision,
  ProcurementClassification,
  ToolItem,
} from '../types';
import { resolveContractSubDivision } from './customContracts';
import { recordConsumableReceipt } from './consumablesService';
import { saveCustomTool } from './customTools';

const POS_STORAGE_KEY = 'emdad_purchase_orders';
const GRNS_STORAGE_KEY = 'emdad_goods_receipts';

/**
 * Loads all purchase orders from localStorage.
 */
export function loadPurchaseOrders(): PurchaseOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[POManagementService] Failed to load POs:', e);
  }
  return [];
}

/**
 * Saves all purchase orders to localStorage and dispatches event.
 */
export function saveAllPurchaseOrders(pos: PurchaseOrder[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(pos));
    window.dispatchEvent(new Event('po_updated'));
  } catch (e) {
    console.warn('[POManagementService] Failed to save POs:', e);
  }
}

/**
 * Loads all Goods Receipt Notes (GRNs) from localStorage.
 */
export function loadGoodsReceiptNotes(): GoodsReceiptNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GRNS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[POManagementService] Failed to load GRNs:', e);
  }
  return [];
}

/**
 * Saves all Goods Receipt Notes to localStorage.
 */
export function saveAllGoodsReceiptNotes(grns: GoodsReceiptNote[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GRNS_STORAGE_KEY, JSON.stringify(grns));
    window.dispatchEvent(new Event('grn_updated'));
  } catch (e) {
    console.warn('[POManagementService] Failed to save GRNs:', e);
  }
}

/**
 * Creates a new purchase order with auto-calculated totals and balances.
 */
export function createPurchaseOrder(
  poData: Omit<PurchaseOrder, 'poId' | 'inwardedAmount' | 'balanceAmount' | 'createdAt'>
): PurchaseOrder {
  const currentPOs = loadPurchaseOrders();
  const poId = `PO-${Date.now()}`;
  const totalAmount = poData.lines.reduce((sum, line) => sum + (line.totalPrice || line.orderedQty * line.unitPrice), 0);

  // Derive Sub-Division from Contract if provided
  const resolvedDivision = resolveContractSubDivision(poData.contractRef) || poData.subDivision || 'RENTALS';

  const preparedLines: POLineItem[] = poData.lines.map((l, idx) => ({
    ...l,
    lineId: l.lineId || `POL-${Date.now()}-${idx}`,
    itemNo: idx + 1,
    subDivision: resolveContractSubDivision(l.contractRef || poData.contractRef) || resolvedDivision,
    contractRef: l.contractRef || poData.contractRef || '',
    receivedQty: 0,
    balanceQty: l.orderedQty,
    totalPrice: l.orderedQty * l.unitPrice,
  }));

  const newPO: PurchaseOrder = {
    ...poData,
    poId,
    subDivision: resolvedDivision,
    totalAmount,
    inwardedAmount: 0,
    balanceAmount: totalAmount,
    status: poData.status || 'OPEN',
    createdAt: new Date().toISOString(),
    lines: preparedLines,
  };

  const updated = [newPO, ...currentPOs];
  saveAllPurchaseOrders(updated);
  return newPO;
}

/**
 * Updates an existing Purchase Order.
 */
export function updatePurchaseOrder(poId: string, updates: Partial<PurchaseOrder>): PurchaseOrder[] {
  const currentPOs = loadPurchaseOrders();
  const updated = currentPOs.map((po) => {
    if (po.poId !== poId) return po;
    const merged = { ...po, ...updates };
    if (updates.lines) {
      merged.totalAmount = updates.lines.reduce((s, l) => s + (l.orderedQty * l.unitPrice), 0);
      merged.inwardedAmount = updates.lines.reduce((s, l) => s + (l.receivedQty * l.unitPrice), 0);
      merged.balanceAmount = Math.max(0, merged.totalAmount - merged.inwardedAmount);
      
      const allDone = updates.lines.every((l) => l.balanceQty <= 0);
      const someDone = updates.lines.some((l) => l.receivedQty > 0);
      if (allDone) merged.status = 'FULFILLED';
      else if (someDone) merged.status = 'PARTIALLY_RECEIVED';
      else merged.status = 'OPEN';
    }
    return merged;
  });
  saveAllPurchaseOrders(updated);
  return updated;
}

/**
 * Deletes a Purchase Order.
 */
export function deletePurchaseOrder(poId: string): PurchaseOrder[] {
  const currentPOs = loadPurchaseOrders();
  const updated = currentPOs.filter((po) => po.poId !== poId);
  saveAllPurchaseOrders(updated);
  return updated;
}

/**
 * Posts a Goods Receipt Note (GRN):
 * 1. Creates GRN record in tbl_GoodsReceiptNotes
 * 2. Deducts pending balance from target PO line items
 * 3. Updates stock in Consumables Store for CONSUMABLE lines
 * 4. Pushes tools into Fleet Catalog (customTools) for INVENTORY / ASSET lines
 * 5. Tags QC Inspection Bay if reqInsp is checked
 */
export function postGoodsReceiptNote(grnInput: Omit<GoodsReceiptNote, 'grnId' | 'createdAt'>): {
  success: boolean;
  grn?: GoodsReceiptNote;
  message: string;
} {
  if (!grnInput.lines || grnInput.lines.length === 0) {
    return { success: false, message: 'GRN must contain at least one line item.' };
  }

  const grnId = `GRN-${Date.now()}`;
  const totalItemsReceived = grnInput.lines.reduce((sum, l) => sum + (l.qtyReceived || 0), 0);
  const totalInwardValue = grnInput.lines.reduce((sum, l) => sum + ((l.qtyReceived || 0) * (l.unitPrice || 0)), 0);

  const newGRN: GoodsReceiptNote = {
    ...grnInput,
    grnId,
    totalItemsReceived,
    totalInwardValue,
    createdAt: new Date().toISOString(),
  };

  // 1. Update target PO line items and balances
  const allPOs = loadPurchaseOrders();
  const targetPO = allPOs.find((p) => p.poNumber === grnInput.poNumber);

  if (targetPO) {
    grnInput.lines.forEach((grnLine) => {
      const poLine = targetPO.lines.find(
        (pl) => pl.lineId === grnLine.poLineId || pl.partNo === grnLine.partNo
      );
      if (poLine) {
        poLine.receivedQty = (poLine.receivedQty || 0) + grnLine.qtyReceived;
        poLine.balanceQty = Math.max(0, poLine.orderedQty - poLine.receivedQty);
      }
    });

    targetPO.inwardedAmount = targetPO.lines.reduce((s, l) => s + (l.receivedQty * l.unitPrice), 0);
    targetPO.balanceAmount = Math.max(0, targetPO.totalAmount - targetPO.inwardedAmount);

    const isFullyReceived = targetPO.lines.every((l) => l.balanceQty <= 0);
    targetPO.status = isFullyReceived ? 'FULFILLED' : 'PARTIALLY_RECEIVED';

    saveAllPurchaseOrders(allPOs);
  }

  // 2. Process line items by 3-Way Classification
  grnInput.lines.forEach((line) => {
    if (line.qtyReceived <= 0) return;

    if (line.classification === 'CONSUMABLE') {
      // Auto-replenish consumables store
      recordConsumableReceipt({
        poNumber: grnInput.poNumber,
        partNo: line.partNo,
        description: line.description,
        qtyReceived: line.qtyReceived,
        unitCostAED: grnInput.currency === 'USD' ? line.unitPrice * 3.6725 : line.unitPrice,
        totalCostAED: (grnInput.currency === 'USD' ? line.unitPrice * 3.6725 : line.unitPrice) * line.qtyReceived,
        supplier: grnInput.supplier,
        receivedDate: grnInput.dateRecd,
        receivedBy: grnInput.mfgReceivedBy,
        notes: `Received via Ticket #${grnInput.ticketNo} / PO #${grnInput.poNumber}. ${line.comments || ''}`,
      });
    } else if (line.classification === 'INVENTORY' || line.classification === 'ASSET') {
      // Add tool to physical fleet or capital asset ledger
      const isAsset = line.classification === 'ASSET';
      const serial = line.toolsno || `EMD-${Date.now().toString().slice(-4)}`;
      
      const newTool: ToolItem = {
        id: serial,
        serial: serial,
        assetNo: line.partNo || serial,
        size: line.size || 'Standard',
        shortDesc: line.category || (isAsset ? 'CAPITAL ASSET' : 'DOWNHOLE TOOL'),
        desc: line.description,
        qty: line.qtyReceived,
        location: line.reqInsp ? 'Inspection Bay' : 'Emdad Base',
        status: line.reqInsp ? 'Inspection' : 'Good',
        ownership: line.belongsTo || 'EMDAD',
        isEmdad: (line.belongsTo || '').toUpperCase() === 'EMDAD',
        supplier: grnInput.supplier,
        addedDate: grnInput.dateRecd,
        contract: line.contractRef || '',
      };

      saveCustomTool(newTool);
    }
  });

  // 3. Save GRN to history
  const allGRNs = loadGoodsReceiptNotes();
  const updatedGRNs = [newGRN, ...allGRNs];
  saveAllGoodsReceiptNotes(updatedGRNs);

  return {
    success: true,
    grn: newGRN,
    message: `GRN Ticket #${newGRN.ticketNo} posted successfully with ${totalItemsReceived} items.`,
  };
}

/**
 * Calculates supplier-wise balance & outstanding summary.
 */
export interface SupplierBalanceSummary {
  supplier: string;
  totalPOs: number;
  totalOrderedValue: number;
  totalInwardValue: number;
  totalBalanceValue: number;
  fulfillmentRate: number;
  currency: 'AED' | 'USD';
  openPOList: PurchaseOrder[];
}

export function getSupplierBalanceReport(): SupplierBalanceSummary[] {
  const pos = loadPurchaseOrders();
  const grouped: Record<string, SupplierBalanceSummary> = {};

  pos.forEach((po) => {
    const sName = po.supplier || 'Unknown Supplier';
    if (!grouped[sName]) {
      grouped[sName] = {
        supplier: sName,
        totalPOs: 0,
        totalOrderedValue: 0,
        totalInwardValue: 0,
        totalBalanceValue: 0,
        fulfillmentRate: 0,
        currency: po.currency || 'AED',
        openPOList: [],
      };
    }

    grouped[sName].totalPOs += 1;
    grouped[sName].totalOrderedValue += po.totalAmount || 0;
    grouped[sName].totalInwardValue += po.inwardedAmount || 0;
    grouped[sName].totalBalanceValue += po.balanceAmount || 0;
    if (po.status !== 'FULFILLED') {
      grouped[sName].openPOList.push(po);
    }
  });

  return Object.values(grouped).map((s) => ({
    ...s,
    fulfillmentRate: s.totalOrderedValue > 0 ? Number(((s.totalInwardValue / s.totalOrderedValue) * 100).toFixed(1)) : 100,
  }));
}

/**
 * Helper to parse Bulk PO CSV / Text lines.
 */
export function parseBulkPOCSV(csvContent: string): {
  success: boolean;
  lines: Partial<POLineItem>[];
  errors: string[];
} {
  const rawRows = csvContent.split(/\r?\n/).filter((r) => r.trim().length > 0);
  if (rawRows.length < 2) {
    return { success: false, lines: [], errors: ['CSV file is empty or missing data rows.'] };
  }

  const header = rawRows[0].split(',').map((h) => h.trim().toLowerCase());
  const partNoIdx = header.findIndex((h) => h.includes('part') || h.includes('sku') || h.includes('item'));
  const descIdx = header.findIndex((h) => h.includes('desc'));
  const catIdx = header.findIndex((h) => h.includes('cat'));
  const sizeIdx = header.findIndex((h) => h.includes('size'));
  const qtyIdx = header.findIndex((h) => h.includes('qty') || h.includes('quantity'));
  const priceIdx = header.findIndex((h) => h.includes('price') || h.includes('cost') || h.includes('rate'));
  const contractIdx = header.findIndex((h) => h.includes('contract'));
  const classIdx = header.findIndex((h) => h.includes('class') || h.includes('type') || h.includes('asset'));

  if (descIdx === -1 || qtyIdx === -1 || priceIdx === -1) {
    return {
      success: false,
      lines: [],
      errors: ['Required columns missing. Expected at least: Description, Quantity, UnitPrice.'],
    };
  }

  const parsedLines: Partial<POLineItem>[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const cols = rawRows[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;

    const desc = cols[descIdx] || '';
    const qty = parseFloat(cols[qtyIdx]) || 0;
    const price = parseFloat(cols[priceIdx]) || 0;
    const partNo = partNoIdx >= 0 ? cols[partNoIdx] : `SKU-${Date.now()}-${i}`;
    const category = catIdx >= 0 ? cols[catIdx] : 'General';
    const size = sizeIdx >= 0 ? cols[sizeIdx] : '';
    const contract = contractIdx >= 0 ? cols[contractIdx] : '';
    const rawClass = classIdx >= 0 ? cols[classIdx].toUpperCase() : 'CONSUMABLE';

    let classification: ProcurementClassification = 'CONSUMABLE';
    if (rawClass.includes('ASSET')) classification = 'ASSET';
    else if (rawClass.includes('INVENT')) classification = 'INVENTORY';

    if (qty <= 0) {
      errors.push(`Row ${i + 1}: Invalid Quantity "${cols[qtyIdx]}".`);
      continue;
    }

    const subDiv = resolveContractSubDivision(contract) || 'RENTALS';

    parsedLines.push({
      itemNo: i,
      partNo: partNo || `ITEM-${i}`,
      description: desc,
      category: category || 'Spares',
      size: size || '',
      contractRef: contract,
      subDivision: subDiv,
      orderedQty: qty,
      receivedQty: 0,
      balanceQty: qty,
      unitPrice: price,
      totalPrice: qty * price,
      classification,
      belongsTo: 'EMDAD',
    });
  }

  return {
    success: parsedLines.length > 0,
    lines: parsedLines,
    errors,
  };
}
