/**
 * Service for Azure SQL integration, Data API Builder, Azure Functions backend,
 * and standalone deployment exports
 */

import { MASTER_JOBS } from '../data/masterJobs';

export const normalizeJobKey = (str?: string): string => {
  if (!str) return '';
  return str
    .trim()
    .toUpperCase()
    .replace(/^JOB[-_]?/i, '');
};

const MASTER_JOBS_MAP = new Map<string, any>();
MASTER_JOBS.forEach((j) => {
  if (j.id) {
    const raw = String(j.id).trim().toUpperCase();
    MASTER_JOBS_MAP.set(raw, j);
    MASTER_JOBS_MAP.set(normalizeJobKey(j.id), j);
  }
  if ((j as any).jobNumber) {
    const raw = String((j as any).jobNumber).trim().toUpperCase();
    MASTER_JOBS_MAP.set(raw, j);
    MASTER_JOBS_MAP.set(normalizeJobKey((j as any).jobNumber), j);
  }
});

export interface DbConnectionStatus {
  isConnected: boolean;
  source: 'azure-sql' | 'data-api' | 'azure-function' | 'local-cache';
  lastChecked: string;
  message: string;
  counts: {
    inventory: number;
    jobs: number;
    dtBatches: number;
    rtBatches: number;
  };
}

export const DEFAULT_AZURE_FUNCTION_URL =
  'https://tooltracker-api-dyath8gehaavcdah.westeurope-01.azurewebsites.net/api/ToolTracker';

export function getApiEndpoint(): string {
  const custom = localStorage.getItem('azure_api_endpoint');
  if (custom && custom.trim()) {
    const trimmed = custom.trim();
    // Only in local dev container on Cloud Run, use the server proxy to avoid cross-domain issues
    if (typeof window !== 'undefined' && window.location.hostname.includes('run.app')) {
      if (trimmed.includes('tooltracker-api-dyath8gehaavcdah')) {
        return '/api/ToolTracker';
      }
    }
    return trimmed;
  }
  // On Azure Static Web Apps, connect directly to the live Azure Function (CORS is allowed)
  if (typeof window !== 'undefined' && window.location.hostname.includes('azurestaticapps.net')) {
    return DEFAULT_AZURE_FUNCTION_URL;
  }
  // In Cloud Run container dev environment, route through local proxy
  if (typeof window !== 'undefined' && window.location.hostname.includes('run.app')) {
    return '/api/ToolTracker';
  }
  return DEFAULT_AZURE_FUNCTION_URL;
}

export function getApiKey(): string {
  const custom = localStorage.getItem('azure_api_key');
  if (custom && custom.trim()) return custom.trim();
  return 'XCOETTV_A-BHeNPUSFSpChSOv9DAJcZOzrz1NvOlROofAzFu2tbo_Q==';
}

/**
 * Normalizes SQL column names (PascalCase or standard) to front-end camelCase
 */
function normalizeInventoryItem(row: any): any {
  const sysId =
    row.SystemID ||
    row.systemId ||
    row.SystemId ||
    row.Serial ||
    row.serial ||
    row.SerialNumber ||
    row.serialNumber ||
    row.AssetNo ||
    row.assetNo ||
    row.id ||
    `TOOL-${Math.random().toString(36).substring(7)}`;

  return {
    id: String(sysId).trim(),
    serial: String(row.Serial || row.serial || row.SystemID || row.systemId || sysId).trim(),
    assetNo: String(row.AssetNo || row.assetNo || row.PartNo || row.partNo || '').trim(),
    size: String(row.Size || row.size || row.ToolSize || row.toolSize || '').trim(),
    shortDesc: String(row.ShortDesc || row.shortDesc || row.Category || row.category || row.ToolType || row.toolType || 'Downhole Tool').trim(),
    desc: String(row.Description || row.desc || row.ToolDescription || row.toolDescription || '').trim(),
    qty: Number(row.Qty ?? row.qty ?? row.Quantity ?? row.quantity ?? 1),
    location: String(row.Location || row.location || 'Emdad Base').trim(),
    status: (row.Status || row.status || 'Good') as any,
    ownership: String(row.Ownership || row.ownership || (row.IsEmdad ? 'EMDAD' : 'Sub-Contractor')).trim(),
    isEmdad: Boolean(row.IsEmdad ?? row.isEmdad ?? (row.Ownership ? String(row.Ownership).toUpperCase().includes('EMDAD') : true)),
    oemSerial: String(row.OEMSerial || row.oemSerial || row.ManufacturerSerial || '').trim(),
    supplier: String(row.Supplier || row.supplier || row.Vendor || '').trim(),
    addedDate: String(row.AddedDate || row.addedDate || row.CreatedDate || '').trim(),
    rig: row.Rig || row.rig || undefined,
    well: row.Well || row.well || undefined,
    contract: row.Contract || row.contract || undefined,
    currentJobId: row.CurrentJobId || row.currentJobId || row.JobID || row.jobId || undefined,
  };
}

function normalizeJob(row: any): any {
  const jId = row.JobID || row.jobId || row.jobNumber || '';
  const key = String(jId).trim().toUpperCase();
  const master = MASTER_JOBS_MAP.get(key) || MASTER_JOBS_MAP.get(normalizeJobKey(jId));

  // 1. Resolve Legal Invoice Number:
  // Legal numbers MUST start with 'FSH', 'FR', or 'WHP' (e.g. FSH-02620, FR-23-881, WHP-00513)
  const legalCandidates = [
    String(row.LegalNumber || row.legalNumber || '').trim(),
    String(row.LegalInvoiceNo || row.legalInvoiceNo || '').trim(),
    String(row.ClientRef || row.clientRef || '').trim(),
    String(master?.legalInvoiceNumber || '').trim(),
    String(row.LegalInvoiceNumber || row.legalInvoiceNumber || '').trim(),
    String(row.LegalInvoice || row.legalInvoice || '').trim(),
  ];

  const foundLegal = legalCandidates.find((c) => {
    if (!c || c === '—' || c === '-' || c.toUpperCase() === 'PENDING') return false;
    const u = c.toUpperCase();
    return u.startsWith('FSH') || u.startsWith('FR') || u.startsWith('WHP');
  }) || '';

  const legalInvoiceNumber = foundLegal;

  // 2. Resolve ERP / Draft / Emdad Invoice Number:
  // Numbers without FSH, FR, or WHP initials (e.g. 218662, 218661, 208801) are ERP / Draft invoices under approval
  const erpCandidates = [
    String(row.DraftInvoiceNumber || row.draftInvoiceNumber || '').trim(),
    String(row.DraftInvoiceNo || row.draftInvoiceNo || '').trim(),
    String(row.EmdadInvoiceNo || row.emdadInvoiceNo || '').trim(),
    String(master?.draftInvoiceNumber || '').trim(),
    String(row.LegalInvoiceNumber || row.legalInvoiceNumber || '').trim(),
    String(row.LegalInvoiceNo || row.legalInvoiceNo || '').trim(),
    String(row.ClientRef || row.clientRef || '').trim(),
    String(row.ERPInvoiceNo || row.erpInvoiceNo || row.ERPRef || row.erpRef || '').trim(),
  ];

  const foundErp = erpCandidates.find((c) => {
    if (!c || c === '—' || c === '-' || c.toUpperCase() === 'PENDING' || c === legalInvoiceNumber) return false;
    const u = c.toUpperCase();
    return !u.startsWith('FSH') && !u.startsWith('FR') && !u.startsWith('WHP');
  }) || '';

  const draftInvoiceNumber = foundErp;

  // 3. Resolve Invoiced Amount
  const invoiceAmount =
    row.InvoiceAmount !== undefined && row.InvoiceAmount !== null && row.InvoiceAmount !== '' ? Number(row.InvoiceAmount) :
    row.invoiceAmount !== undefined && row.invoiceAmount !== null && row.invoiceAmount !== '' ? Number(row.invoiceAmount) :
    master?.invoiceAmount !== undefined && master.invoiceAmount !== null ? Number(master.invoiceAmount) :
    Number(row.InvoicedAmountUSD || 0);

  const hasLegal = Boolean(legalInvoiceNumber);
  const hasErp = Boolean(draftInvoiceNumber);
  const rawStatus = row.Status || row.status || master?.status || 'Open';
  
  // Rule: Only jobs with verified FSH/FR/WHP legal invoice are Final Invoiced / Completed.
  // Jobs with ERP invoices (e.g. 218662) without these initials are Under Approval / SES Submitted.
  let status = rawStatus;
  if (hasLegal) {
    status = 'Final invoiced';
  } else if (hasErp || String(rawStatus).toLowerCase().includes('ses') || String(rawStatus).toLowerCase().includes('approval')) {
    status = 'SES submitted';
  }

  return {
    id: jId,
    jobNumber: jId,
    calloutId: row.CalloutID || row.calloutId || master?.calloutId || '',
    rig: row.Rig || row.rig || master?.rig || '',
    well: row.Well || row.well || master?.well || '',
    client: row.Client || row.client || master?.client || '',
    contract: String(
      row.ContractNo ||
      row.contractNo ||
      row.ContractNumber ||
      row.contractNumber ||
      row.ContractRef ||
      row.contractRef ||
      row.ContractID ||
      row.contractId ||
      row.Contract ||
      row.contract ||
      master?.contract ||
      ''
    ).trim(),
    poNumber: row.PONumber || row.poNumber || master?.poNumber || '',
    clientRef: String(row.ClientRef || row.clientRef || master?.clientRef || '').trim(),
    erpRef: row.ERPRef || row.erpRef || '',
    holeSection: row.HoleSection || row.holeSection || '',
    serviceType: row.ServiceType || row.serviceType || master?.serviceType || 'Downhole Rental',
    invoicingType: row.InvoicingType || row.invoicingType || 'PerJob',
    currency: row.Currency || row.currency || 'USD',
    mobDate: row.MobDate || row.mobDate || master?.mobDate || row.FirstDtDate || (row.CreatedDate && !String(row.CreatedDate).startsWith('2026-09') ? String(row.CreatedDate).split('T')[0] : '') || '',
    demobDate: row.DemobDate || row.demobDate || master?.demobDate || row.LastRtDate || '',
    status: status,
    tools: [],
    operatingDays: 0,
    standbyDays: 0,
    isLocked: Boolean(hasLegal || row.LegalInvoiceNo || row.legalInvoiceNo),
    invoiceNumber: legalInvoiceNumber || draftInvoiceNumber || row.LegalInvoiceNo || row.EmdadInvoiceNo || '',
    legalInvoiceNumber,
    draftInvoiceNumber,
    invoiceAmount,
    sesNumber: row.SesNumber || row.sesNumber || '',
    invoiceDate: row.InvoiceDate || row.LegalInvoiceDate || (hasLegal ? (row.MobDate || '2024-01-01') : ''),
    invoicedAmountUSD: invoiceAmount,
    cost: row.Cost || row.cost || master?.cost || '',
    createdDate: row.CreatedDate || row.createdDate || master?.createdDate || '',
    createdBy: row.CreatedBy || row.createdBy || master?.createdBy || 'Operations',
    firstDtDate: row.FirstDtDate || row.firstDtDate || '',
    lastRtDate: row.LastRtDate || row.lastRtDate || '',
    docsSignedDate: row.DocsSignedDate || row.docsSignedDate || '',
    submittedToBillingDate: row.SubmittedToBillingDate || row.submittedToBillingDate || null,
    draftInvoicedDate: row.DraftInvoicedDate || row.draftInvoicedDate || null,
    sesSubmittedDate: row.SesSubmittedDate || row.sesSubmittedDate || null,
    finalInvoicedDate: row.FinalInvoicedDate || row.finalInvoicedDate || (hasLegal ? (row.InvoiceDate || row.MobDate || '2024-01-01') : null),
  };
}

/**
 * Utility to extract tool diameter/size from toolDescription when size is not a dedicated column.
 * e.g., '8-1/8" OVERSHOT' -> '8-1/8"', 'CARGO BASKET 8FT X 4FT' -> '8FT X 4FT'
 */
export function extractSizeFromDescription(desc?: string): string {
  if (!desc) return '';
  const str = String(desc).trim();

  // Pattern 1: inch sizes like 8-1/8", 8 1/8", 6-1/2", 4", 13-5/8", 2-7/8", 8-1/2", 12.1/4"
  const fracMatch = str.match(/\b(\d+(?:[-. ]\d+\/\d+|\/\d+)?["'”]|(?:\d+\.?\d*["'”]))/);
  if (fracMatch) return fracMatch[0].replace(/\s+/, '-');

  // Pattern 2: basket or container dimensions like 8FT X 4FT, 8' x 4'
  const ftMatch = str.match(/\b(\d+\s*(?:FT|ft|')\s*[xX]\s*\d+\s*(?:FT|ft|'))/);
  if (ftMatch) return ftMatch[0].toUpperCase();

  // Pattern 3: OD format like 8-1/8 OD or 6-1/2 OD
  const odMatch = str.match(/\b(\d+(?:[-. ]\d+\/\d+|\/\d+)?)\s*(?:OD|od)/);
  if (odMatch) return `${odMatch[1]}"`;

  return '';
}

/**
 * Utility to extract clean, concise oilfield Tool Type from long descriptions
 * e.g., '11-3/4" FS OVERSHOT W/ 6-5/8" REG BOX' -> 'FS OVERSHOT'
 * e.g., '33 feet cargo basket (L x 10.26 W x 1.19 H x 1.22)...' -> 'CARGO BASKET'
 */
export function extractToolType(desc?: string, shortDesc?: string, invShortDesc?: string): string {
  // If invShortDesc is a clean, concise category (< 35 chars, no long connection specs)
  if (invShortDesc && invShortDesc !== 'Downhole Tool') {
    const s = invShortDesc.trim();
    if (s.length > 0 && s.length <= 35 && !s.includes(' W/') && !s.includes('PIN X') && !s.includes(' C/W ') && !s.includes(' C/ W ') && !s.includes('REG Box') && !s.includes('REG PIN')) {
      return s;
    }
  }

  // If shortDesc is clean and concise
  if (shortDesc && shortDesc !== 'Downhole Tool') {
    const s = shortDesc.trim();
    if (s.length > 0 && s.length <= 35 && !s.includes(' W/') && !s.includes('PIN X') && !s.includes(' C/W ') && !s.includes(' C/ W ') && !s.includes('REG Box') && !s.includes('REG PIN')) {
      return s;
    }
  }

  const text = `${shortDesc || ''} ${desc || ''}`.toUpperCase();
  if (!text.trim()) return 'Downhole Tool';

  if (text.includes('CARGO BASKET') || text.includes('TOOL BASKET') || (text.includes('BASKET') && !text.includes('JUNK BASKET'))) {
    return 'CARGO BASKET';
  }
  if (text.includes('CONTAINER')) return 'CONTAINER';

  if (text.includes('FS OVERSHOT EXTENSION') || text.includes('OVERSHOT EXTENSION')) return 'OVERSHOT EXTENSION';
  if (text.includes('FS OVERSHOT')) return 'FS OVERSHOT';
  if (text.includes('OVERSHOT')) return 'OVERSHOT';

  if (text.includes('NEAR BIT STABILIZER') || text.includes('NEAR BIT STAB')) return 'NEAR BIT STABILIZER';
  if (text.includes('STRING STABILIZER') || text.includes('STRING STAB')) return 'STRING STABILIZER';
  if (text.includes('STABILIZER') || text.includes('STAB')) return 'STABILIZER';

  if (text.includes('HYD-MECH') || text.includes('HYDRO-MECH')) return 'HYD-MECH DRILLING JAR';
  if (text.includes('DRILLING JAR')) return 'DRILLING JAR';
  if (text.includes('FISHING JAR') || text.includes(' JAR')) return 'DRILLING JAR';

  if (text.includes('SHOCK TOOL') || text.includes('SHOCK SUB')) return 'SHOCK TOOL';

  if (text.includes('SAVER SUB')) return 'SAVER SUB';
  if (text.includes('CROSS OVER SUB') || text.includes('CROSSOVER SUB') || text.includes('X-OVER') || text.includes('CROSS-OVER')) return 'CROSS OVER SUB';
  if (text.includes('BIT SUB')) return 'BIT SUB';
  if (text.includes('FLOAT SUB')) return 'FLOAT SUB';
  if (text.includes('LIFT SUB') || text.includes('LIFTING SUB') || text.includes('LIFT NIPPLE')) return 'LIFT SUB';
  if (text.includes('CIRCULATING SUB') || text.includes('CIRCULATION SUB')) return 'CIRCULATING SUB';
  if (text.includes('TOP DRIVE SUB')) return 'TOP DRIVE SUB';
  if (text.includes('PUP JOINT')) return 'PUP JOINT';
  if (text.includes('SUB') && !text.includes('SUB-CONTRACTOR')) return 'SUB';

  if (text.includes('DIVERTER')) return 'DIVERTER';
  if (text.includes('SAFETY VALVE') || text.includes('FOSV') || text.includes('TIW') || text.includes('IBOP')) return 'SAFETY VALVE';
  if (text.includes('BOP') || text.includes('BLOWOUT PREVENTER')) return 'BLOWOUT PREVENTER';

  if (text.includes('SPIRAL DRILL COLLAR')) return 'SPIRAL DRILL COLLAR';
  if (text.includes('PONY DRILL COLLAR') || text.includes('PONY COLLAR')) return 'PONY DRILL COLLAR';
  if (text.includes('NON-MAG') || text.includes('NMDC')) return 'NON-MAG DRILL COLLAR';
  if (text.includes('DRILL COLLAR') || text.includes('COLLAR')) return 'DRILL COLLAR';

  if (text.includes('HEVI-WATE') || text.includes('HWDP')) return 'HEVI-WATE DRILL PIPE';
  if (text.includes('DRILL PIPE')) return 'DRILL PIPE';
  if (text.includes('TUBING')) return 'TUBING';

  if (text.includes('ROLLER REAMER') || text.includes('UNDERREAMER') || text.includes('REAMER')) return 'ROLLER REAMER';
  if (text.includes('HOLE OPENER')) return 'HOLE OPENER';
  if (text.includes('CASING SCRAPER') || text.includes('SCRAPER')) return 'CASING SCRAPER';

  if (text.includes('JUNK MILL') || text.includes('TAPER MILL') || text.includes('PILOT MILL') || text.includes('MILL')) return 'MILL';
  if (text.includes('FISHING MAGNET') || text.includes('MAGNET')) return 'FISHING MAGNET';
  if (text.includes('JUNK BASKET')) return 'JUNK BASKET';
  if (text.includes('IMPRESSION BLOCK')) return 'IMPRESSION BLOCK';
  if (text.includes('SPEAR')) return 'CASING SPEAR';
  if (text.includes('MOTOR') || text.includes('MUD MOTOR')) return 'MUD MOTOR';

  // Fallback: strip leading size / dimensions if present, take first phrase before W/, C/W, etc.
  const cleaned = (desc || shortDesc || 'Downhole Tool')
    .replace(/^[\d\s\-/."'’]+(?:OD|ID)?\s*/i, '')
    .split(/\s+(?:W\/|C\/W|WITH|C\/\s*W|\/W|\()\s*/i)[0]
    .trim();

  if (cleaned && cleaned.length > 0 && cleaned.length <= 35) {
    return cleaned.toUpperCase();
  }

  return 'Downhole Tool';
}

/**
 * Universal date cleaner handling Date objects, ISO strings, timestamps, and Excel serial numbers
 */
export function cleanDateStr(d: any): string {
  if (d === null || d === undefined || d === '') return '';
  if (typeof d === 'number' || (typeof d === 'string' && /^\d+$/.test(d.trim()))) {
    const num = typeof d === 'number' ? d : parseInt(d.trim(), 10);
    // Excel serial date integer e.g. 25000 to 65000
    if (num >= 25000 && num <= 65000) {
      try {
        const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
        if (!isNaN(dateObj.getTime())) {
          return dateObj.toISOString().split('T')[0];
        }
      } catch {}
    }
  }
  const s = String(d).trim();
  if (!s || s === '—' || s === '-' || s === 'null' || s === 'undefined') return '';
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ')) return s.split(' ')[0];
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return s;
}

/**
 * Normalizes a single row from tbl_DeliveryTicketLines / tbl_DTLines into DTLine
 */
export function normalizeDTLine(row: any): any {
  if (!row) return null;
  const serial = String(
    row.serial ||
    row.Serial ||
    row.serialNo ||
    row.SerialNo ||
    row.SerialNumber ||
    row.serialNumber ||
    row.Serial_Number ||
    row.serial_number ||
    row.PartNo ||
    row.partNo ||
    row.Part_No ||
    row.part_no ||
    row.AssetNo ||
    row.assetNo ||
    row.Asset_No ||
    row.asset_no ||
    row.ToolSerial ||
    row.toolSerial ||
    row.Tool_Serial ||
    row.tool_serial ||
    row.ToolID ||
    row.toolId ||
    row.Tool_ID ||
    row.tool_id ||
    row.ToolCode ||
    row.toolCode ||
    ''
  ).trim();

  const shortDesc = String(
    row.shortDesc ||
    row.ShortDesc ||
    row.toolType ||
    row.ToolType ||
    row.category ||
    row.Category ||
    ''
  ).trim();

  const rawDesc = String(
    row.desc ||
    row.Description ||
    row.description ||
    row.ItemDescription ||
    row.Item_Description ||
    row.ToolDescription ||
    row.Tool_Description ||
    row.toolDescription ||
    row.ToolDesc ||
    row.toolDesc ||
    row.ToolName ||
    row.toolName ||
    row.Tool_Name ||
    row.ItemName ||
    row.Item_Name ||
    row.PartDescription ||
    row.Part_Description ||
    row.Item ||
    row.item ||
    shortDesc ||
    ''
  ).trim();

  let size = String(row.size || row.Size || row.ToolSize || row.toolSize || '').trim();
  if (!size && rawDesc) {
    size = extractSizeFromDescription(rawDesc);
  }

  const finalDesc = rawDesc || shortDesc || 'Downhole Tool';
  const finalShortDesc = extractToolType(finalDesc, shortDesc);
  const rawStatus = String(row.status || row.Status || '').trim().toLowerCase();
  const status = (rawStatus === 'returned' || rawStatus === 'backloaded') ? 'Returned' : 'OnRig';
  const ownership = String(row.ownership || row.Ownership || 'EMDAD').trim();
  const isEmdad = Boolean(row.isEmdad ?? row.IsEmdad ?? (ownership.toUpperCase().includes('EMDAD')));

  const rawReturnedRt = String(
    row.returnedRtNumber ||
    row.ReturnedRtNumber ||
    row.returnedRTNumber ||
    row.rtBatchId ||
    row.RTBatchID ||
    row.rtNumber ||
    row.RTNumber ||
    row.RGT_No ||
    row.rgtNo ||
    row.RGTNo ||
    row.rgt_no ||
    ''
  ).trim();

  const rawReturnDate = cleanDateStr(
    row.returnDate ||
    row.ReturnDate ||
    row.dateIn ||
    row.Date_In ||
    row.DateIn ||
    row.date_in ||
    row.rtDate ||
    row.RTDate ||
    row.DateIn_Date ||
    row.dateInDate ||
    row.ReceivedDate ||
    row.receivedDate ||
    row.BackloadDate ||
    row.backloadDate ||
    row.LoadingNoteDate ||
    row.loadingNoteDate ||
    ''
  );

  return {
    id: row.id || row.ID || row.LineID || row.lineId || row.itemNo || undefined,
    itemNo: Number(row.itemNo ?? row.ItemNo ?? row.Item_No ?? row.item_no ?? row.seq ?? row.Seq ?? row.LineNo ?? row.lineNo ?? 1),
    serial,
    assetNo: String(row.assetNo || row.AssetNo || serial).trim(),
    size,
    shortDesc: finalShortDesc,
    desc: finalDesc,
    toolDescription: finalDesc,
    qty: Number(row.qty ?? row.Qty ?? row.DTQTY ?? row.dtQty ?? row.Quantity ?? row.quantity ?? 1),
    remarks: String(row.remarks || row.Remarks || row.Comments || row.comments || '').trim(),
    status: (rawReturnedRt && rawReturnedRt !== '—') ? 'Returned' : status,
    ownership,
    isEmdad,
    used: row.used != null
      ? Boolean(row.used)
      : row.usedStatus === 'used'
        ? true
        : row.usedStatus === 'not used'
          ? false
          : null,
    rtBatchId: rawReturnedRt || null,
    returnedRtNumber: rawReturnedRt,
    returnDate: rawReturnDate,
    dateIn: rawReturnDate,
    Date_In: rawReturnDate,
  };
}

export function normalizeDTBatch(row: any): any {
  const rawLines = Array.isArray(row.toolLines)
    ? row.toolLines
    : Array.isArray(row.tools)
    ? row.tools
    : Array.isArray(row.lines)
    ? row.lines
    : Array.isArray(row.items)
    ? row.items
    : Array.isArray(row.DTLines)
    ? row.DTLines
    : Array.isArray(row.dtLines)
    ? row.dtLines
    : Array.isArray(row.DeliveryTicketLines)
    ? row.DeliveryTicketLines
    : Array.isArray(row.deliveryTicketLines)
    ? row.deliveryTicketLines
    : Array.isArray(row.tbl_DTLines)
    ? row.tbl_DTLines
    : Array.isArray(row.tbl_DeliveryTicketLines)
    ? row.tbl_DeliveryTicketLines
    : [];

  const lines = rawLines.map(normalizeDTLine).filter(Boolean);

  const cleanDateStr = (d: any) => {
    if (!d) return '';
    const s = String(d).trim();
    return s.includes('T') ? s.split('T')[0] : s;
  };

  const rawDate = cleanDateStr(
    row.DTDate ||
    row.dtDate ||
    row.TicketDate ||
    row.ticketDate ||
    row.RMDate ||
    row.rmDate ||
    row.DispatchDate ||
    row.dispatchDate ||
    row.DeliveryDate ||
    row.deliveryDate ||
    row.Date ||
    row.date ||
    row.CreatedDate ||
    row.createdDate ||
    row.createdAt ||
    row.CreatedAt
  );

  return {
    id: String(row.DTBatchID || row.dtBatchId || row.id || row.ID || row.dtNumber || row.DTNumber || ''),
    dtNumber: String(row.DTNumber || row.dtNumber || row.TicketNumber || row.ticketNumber || row.id || ''),
    jobId: String(row.JobID || row.jobId || row.JobNumber || row.jobNumber || row.JobNo || row.jobNo || row.Job || row.job || ''),
    rmDate: rawDate,
    rmRef: String(row.RMRef || row.rmRef || row.RefNo || row.refNo || row.ManifestRef || row.manifestRef || row.ManifestNo || row.manifestNo || row.Reference || row.reference || ''),
    dispatchDate: rawDate,
    rig: String(row.Rig || row.rig || ''),
    well: String(row.Well || row.well || ''),
    contract: String(
      row.ContractNo ||
      row.contractNo ||
      row.ContractNumber ||
      row.contractNumber ||
      row.ContractRef ||
      row.contractRef ||
      row.Contract_No ||
      row.contract_no ||
      row.Contract_Ref ||
      row.contract_ref ||
      row.ContractID ||
      row.contractId ||
      row.Contract ||
      row.contract ||
      row.ContractName ||
      row.contractName ||
      row.Client ||
      row.client ||
      row.ClientRef ||
      row.clientRef ||
      row.Customer ||
      row.customer ||
      ''
    ).trim(),
    dispatchedBy: String(row.DispatchedBy || row.dispatchedBy || row.PreparedBy || row.preparedBy || row.CreatedBy || row.createdBy || 'Operations'),
    recipient: String(row.Recipient || row.recipient || row.ReceivedBy || row.receivedBy || row.Consignee || row.consignee || ''),
    notes: String(row.Notes || row.notes || row.Remarks || row.remarks || row.Description || row.description || ''),
    isLocked: row.isLocked !== false && row.IsLocked !== false,
    lockedBy: row.lockedBy || row.LockedBy || null,
    lockedDate: cleanDateStr(row.lockedDate || row.LockedDate || null),
    isSigned: Boolean(row.isSigned || row.IsSigned || row.signedDocUrl || row.SignedDocUrl),
    signedDocUrl: row.signedDocUrl || row.SignedDocUrl || '',
    signedDocName: row.signedDocName || row.SignedDocName || '',
    signedDate: cleanDateStr(row.signedDate || row.SignedDate || ''),
    toolLines: lines,
    tools: lines,
  };
}

/**
 * Normalizes a single row from tbl_ReceivingTicketLines (or nested tool line) into RTLine
 */
export function normalizeRTLine(row: any): any {
  if (!row) return null;
  const serial = String(
    row.serial ||
    row.Serial ||
    row.serialNo ||
    row.SerialNo ||
    row.Serial_No ||
    row.serial_no ||
    row.SerialNumber ||
    row.serialNumber ||
    row.Serial_Number ||
    row.serial_number ||
    row.PartNo ||
    row.partNo ||
    row.Part_No ||
    row.part_no ||
    row.AssetNo ||
    row.assetNo ||
    row.Asset_No ||
    row.asset_no ||
    row.ToolSerial ||
    row.toolSerial ||
    row.Tool_Serial ||
    row.tool_serial ||
    row.ToolID ||
    row.toolId ||
    row.Tool_ID ||
    row.tool_id ||
    row.ToolCode ||
    row.toolCode ||
    ''
  ).trim();

  const shortDesc = String(
    row.shortDesc ||
    row.ShortDesc ||
    row.toolType ||
    row.ToolType ||
    row.category ||
    row.Category ||
    ''
  ).trim();

  const rawDesc = String(
    row.desc ||
    row.Description ||
    row.description ||
    row.ItemDescription ||
    row.Item_Description ||
    row.ToolDescription ||
    row.Tool_Description ||
    row.toolDescription ||
    row.ToolDesc ||
    row.toolDesc ||
    row.ToolName ||
    row.toolName ||
    row.Tool_Name ||
    row.ItemName ||
    row.Item_Name ||
    row.PartDescription ||
    row.Part_Description ||
    row.Item ||
    row.item ||
    shortDesc ||
    ''
  ).trim();

  let size = String(row.size || row.Size || row.ToolSize || row.toolSize || '').trim();
  if (!size && rawDesc) {
    size = extractSizeFromDescription(rawDesc);
  }

  const finalDesc = rawDesc || shortDesc || 'Downhole Tool';
  const finalShortDesc = extractToolType(finalDesc, shortDesc);

  const lineDate = cleanDateStr(
    row.dateIn ||
    row.Date_In ||
    row.DateIn ||
    row.date_in ||
    row.returnDate ||
    row.ReturnDate ||
    row.rtDate ||
    row.RTDate ||
    row.Date ||
    row.date ||
    row.ReceivedDate ||
    row.receivedDate ||
    row.BackloadDate ||
    row.backloadDate ||
    row.LoadingNoteDate ||
    row.loadingNoteDate ||
    row.LNoteDate ||
    row.lNoteDate ||
    row.DateIn_Date ||
    row.dateInDate
  );

  return {
    id: row.id || row.ID || row.LineID || row.lineId || row.itemNo || undefined,
    itemNo: Number(row.itemNo ?? row.ItemNo ?? row.Item_No ?? row.item_no ?? row.seq ?? row.Seq ?? row.LineNo ?? row.lineNo ?? 1),
    serial,
    assetNo: String(row.assetNo || row.AssetNo || row.Asset_No || row.asset_no || serial).trim(),
    shortDesc: finalShortDesc,
    desc: finalDesc,
    toolDescription: finalDesc,
    size,
    dateIn: lineDate,
    Date_In: lineDate,
    DateIn: lineDate,
    rtDate: lineDate,
    returnDate: lineDate,
    rtNumber: String(row.rtNumber || row.RTNumber || row.RT_Number || row.rt_number || row.TicketNumber || row.ticketNumber || row.RGT_No || row.rgtNo || row.RGTNo || row.rgt_no || row.RTNo || row.rtNo || row.RT_No || row.rt_no || ''),
    used: row.used != null
      ? Boolean(row.used)
      : row.Used != null
        ? Boolean(row.Used)
        : row.usedStatus === 'used'
          ? true
          : row.usedStatus === 'not used'
            ? false
            : false,
    routedTo: String(row.routedTo || row.RoutedTo || (row.used || row.Used || row.usedStatus === 'used' ? 'Inspection Bay' : 'Available Inventory')),
    condition: String(row.condition || row.Condition || (row.used ? 'USED' : 'NOT USED') || 'Good condition'),
    ownership: String(row.ownership || row.Ownership || 'EMDAD'),
    remarks: String(row.remarks || row.Remarks || row.Comments || row.comments || ''),
    qty: Number(row.qty ?? row.Qty ?? 1),
    dtBatchId: row.dtBatchId || row.DTBatchID || null,
  };
}

export function normalizeRTBatch(row: any): any {
  const rawLines = Array.isArray(row.toolLines)
    ? row.toolLines
    : Array.isArray(row.tools)
    ? row.tools
    : Array.isArray(row.lines)
    ? row.lines
    : Array.isArray(row.items)
    ? row.items
    : Array.isArray(row.RTLines)
    ? row.RTLines
    : Array.isArray(row.rtLines)
    ? row.rtLines
    : Array.isArray(row.ReceivingTicketLines)
    ? row.ReceivingTicketLines
    : Array.isArray(row.receivingTicketLines)
    ? row.receivingTicketLines
    : Array.isArray(row.tbl_RTLines)
    ? row.tbl_RTLines
    : Array.isArray(row.tbl_ReceivingTicketLines)
    ? row.tbl_ReceivingTicketLines
    : [];

  const rawDate = cleanDateStr(
    row.RTDate ||
    row.rtDate ||
    row.Date ||
    row.date ||
    row.TicketDate ||
    row.ticketDate ||
    row.ReceivedDate ||
    row.receivedDate ||
    row.CreatedDate ||
    row.createdDate ||
    row.Date_In ||
    row.DateIn ||
    row.dateIn ||
    row.date_in ||
    row.RMDate ||
    row.rmDate ||
    row.BackloadDate ||
    row.backloadDate ||
    row.ReturnDate ||
    row.returnDate ||
    row.LoadingNoteDate ||
    row.loadingNoteDate ||
    row.LNoteDate ||
    row.lNoteDate ||
    row.L_Note_Date ||
    row.l_note_date ||
    row.LN_Date ||
    row.lnDate ||
    row.LNDate ||
    row.DeliveryNoteDate ||
    row.deliveryNoteDate ||
    row.WaybillDate ||
    row.waybillDate ||
    row.DateIn_Date ||
    row.dateInDate
  );

  const backloadDate = cleanDateStr(
    row.BackloadRMDate ||
    row.backloadRmDate ||
    row.BackloadDate ||
    row.backloadDate ||
    row.RMDate ||
    row.rmDate ||
    row.ReturnDate ||
    row.returnDate ||
    rawDate
  );

  const loadingNoteNo = String(
    row.LoadingNoteNo ||
    row.loadingNoteNo ||
    row.LNoteNo ||
    row.lNoteNo ||
    row.L_Note_No ||
    row.l_note_no ||
    row.LoadingNote ||
    row.loadingNote ||
    row.LNote ||
    row.lNote ||
    row.LN_No ||
    row.lnNo ||
    row.LNNo ||
    row.DeliveryNoteNo ||
    row.deliveryNoteNo ||
    row.WaybillNo ||
    row.waybillNo ||
    row.ManifestNo ||
    row.manifestNo ||
    ''
  ).trim();

  const loadingNoteDate = cleanDateStr(
    row.LoadingNoteDate ||
    row.loadingNoteDate ||
    row.LNoteDate ||
    row.lNoteDate ||
    row.L_Note_Date ||
    row.l_note_date ||
    row.LN_Date ||
    row.lnDate ||
    row.LNDate ||
    row.DeliveryNoteDate ||
    row.deliveryNoteDate ||
    row.WaybillDate ||
    row.waybillDate ||
    rawDate ||
    backloadDate
  );

  const effectiveRtDate = rawDate || loadingNoteDate || backloadDate;
  const effectiveBackloadDate = backloadDate || effectiveRtDate;

  const lines = rawLines.map((l: any) => {
    const norm = normalizeRTLine(l);
    if ((!norm.dateIn || norm.dateIn === '—') && effectiveRtDate) {
      norm.dateIn = effectiveRtDate;
      norm.Date_In = effectiveRtDate;
      norm.DateIn = effectiveRtDate;
      norm.rtDate = effectiveRtDate;
      norm.returnDate = effectiveRtDate;
    }
    return norm;
  }).filter(Boolean);

  const carrier = String(
    row.Carrier ||
    row.carrier ||
    row.ShippedVia ||
    row.shippedVia ||
    row.TransportCompany ||
    row.transportCompany ||
    row.Transporter ||
    row.transporter ||
    'EMDAD Logistics'
  ).trim();

  const driverName = String(row.DriverName || row.driverName || row.Driver || row.driver || '').trim();
  const truckNo = String(row.TruckNo || row.truckNo || row.VehicleNo || row.vehicleNo || '').trim();

  const rtNum = String(
    row.RTNumber ||
    row.rtNumber ||
    row.TicketNumber ||
    row.ticketNumber ||
    row.id ||
    row.ID ||
    row.RTBatchID ||
    row.rtBatchId ||
    ''
  ).trim();

  return {
    id: String(row.RTBatchID || row.rtBatchId || row.id || row.ID || rtNum),
    rtNumber: rtNum,
    jobId: String(row.JobID || row.jobId || row.JobNumber || row.jobNumber || row.JobNo || row.jobNo || ''),
    rtDate: effectiveRtDate,
    backloadRmDate: effectiveBackloadDate,
    loadingNoteNo: loadingNoteNo || (rtNum ? `LN-${rtNum.replace(/^RT-?/i, '')}` : ''),
    lNoteNo: loadingNoteNo || (rtNum ? `LN-${rtNum.replace(/^RT-?/i, '')}` : ''),
    loadingNoteDate: loadingNoteDate || effectiveRtDate,
    lNoteDate: loadingNoteDate || effectiveRtDate,
    carrier,
    shippedVia: carrier,
    driverName,
    truckNo,
    contract: String(row.Contract || row.contract || row.ContractRef || row.contractRef || row.ContractNo || row.contractNo || ''),
    rig: String(row.Rig || row.rig || row.RigName || row.rigName || ''),
    well: String(row.Well || row.well || row.WellName || row.wellName || ''),
    receivedBy: String(row.ReceivedBy || row.receivedBy || row.Inspector || row.inspector || row.QCInspector || row.qcInspector || row.DispatchedBy || 'QC Inspector'),
    condition: String(row.Condition || row.condition || row.Notes || row.notes || ''),
    notes: String(row.Notes || row.notes || ''),
    isSigned: Boolean(row.isSigned || row.IsSigned || row.signedDocUrl || row.SignedDocUrl),
    signedDocUrl: row.signedDocUrl || row.SignedDocUrl || '',
    signedDocName: row.signedDocName || row.SignedDocName || '',
    signedDate: cleanDateStr(row.signedDate || row.SignedDate || ''),
    toolLines: lines,
    tools: lines,
  };
}

/** tbl_Callouts + tbl_CalloutItems -> Callout (via getcallouts) */
function normalizeCalloutItem(row: any): any {
  return {
    itemId: row.ItemID,
    seq: Number(row.seq ?? row.Seq ?? 0),
    size: row.size || row.Size || '',
    shortDesc: row.shortDesc || row.ShortDesc || '',
    qty: Number(row.qty ?? row.Qty ?? 0),
    assigned: Number(row.assigned ?? row.Assigned ?? 0),
    serialNos: Array.isArray(row.serialNos) ? row.serialNos : [],
    status: row.status || row.Status || 'Pending',
  };
}

function normalizeCallout(row: any): any {
  const items = Array.isArray(row.items) ? row.items.map(normalizeCalloutItem) : [];
  const id = row.id || row.CalloutID || '';
  return {
    id,
    CalloutID: id,
    rig: row.rig || row.Rig || '',
    well: row.well || row.Well || '',
    client: row.client || row.Client || '',
    contract: row.contract || row.Contract || '',
    poRef: row.poRef || row.PORef || '',
    status: row.status || row.Status || 'Pending',
    createdDate: row.createdDate || row.CreatedDate || '',
    createdBy: row.createdBy || row.CreatedBy || '',
    items,
    jobId: row.jobId || null,
  };
}

/** tbl_GatePass + tbl_GatePassLines -> GatePass (via getgatepasses) */
function normalizeGatePassLine(row: any): any {
  return {
    lineId: row.LineID,
    serial: row.serial || row.Serial || '',
    assetNo: row.assetNo || row.AssetNo || '',
    shortDesc: row.shortDesc || row.ShortDesc || '',
    size: row.size || row.Size || '',
    qty: Number(row.qty ?? row.Qty ?? 1),
    condition: row.condition || row.Condition || '',
  };
}

function normalizeGatePass(row: any): any {
  const toolLines = Array.isArray(row.toolLines) ? row.toolLines.map(normalizeGatePassLine) : [];
  return {
    id: row.id || row.GatePassID || '',
    gpNumber: row.gpNumber || row.GPNumber || '',
    supplier: row.supplier || row.Supplier || '',
    gpDate: row.gpDate || row.GPDate || '',
    preparedBy: row.preparedBy || row.PreparedBy || '',
    authorizedBy: row.authorizedBy || row.AuthorizedBy || '',
    notes: row.notes || row.Notes || '',
    toolLines,
  };
}

/** tbl_Contracts -> ContractRecord (via getcontracts) */
function normalizeContract(row: any): any {
  const cleanDate = (d: any) => {
    if (!d) return null;
    const str = String(d).trim();
    if (str.includes('T')) return str.split('T')[0];
    return str;
  };

  const id = String(row.id || row.ContractID || '');
  const contractRef = String(
    row.contractNo ||
    row.ContractNo ||
    row.contractNumber ||
    row.ContractNumber ||
    row.contractRef ||
    row.ContractRef ||
    ''
  ).trim();
  const client = row.client || row.Client || '';
  const poNumber = row.poNumber || row.PONumber || '';
  const currency = row.currency || row.Currency || 'USD';
  const status = row.status || row.Status || 'Active';
  const notes = row.notes || row.Notes || '';

  // Clean and determine short description
  let shortDesc = row.shortDesc || row.ShortDesc || '';
  if (!shortDesc) {
    if (notes.startsWith('ADNOC OFFSHORE')) shortDesc = 'ADNOC OFFSHORE';
    else if (notes.startsWith('BUNDUQ')) shortDesc = 'BUNDUQ';
    else if (notes.startsWith('TURNWELL - MSA')) shortDesc = 'TURNWELL - MSA';
    else if (notes.startsWith('TURNWELL')) shortDesc = 'TURNWELL';
    else if (notes.includes(' - ')) shortDesc = notes.split('.')[0].trim();
    else if (notes) shortDesc = notes.split('.')[0].trim();
    else shortDesc = `${client} - ${contractRef}`;
  }

  const name = row.name || row.Name || shortDesc || `Contract ${contractRef}`;
  const isOpenEnded = notes.toUpperCase().includes('OPEN ENDED');
  const rawPbgExpiry = cleanDate(row.pbgExpiryDate || row.PBGExpiryDate);
  const pbgExpiryDate = rawPbgExpiry || (isOpenEnded ? 'OPEN ENDED' : null);

  return {
    id,
    contractNo: contractRef,
    contractRef,
    name,
    shortDesc,
    client,
    poNumber,
    currency,
    status,
    contractValue: (row.contractValue ?? row.ContractValue) != null ? Number(row.contractValue ?? row.ContractValue) : null,
    startDate: cleanDate(row.startDate || row.StartDate),
    endDate: cleanDate(row.endDate || row.EndDate),
    standbyDiscountPct: Number(row.standbyDiscountPct ?? 50),
    description: notes,
    pbgNumber: row.pbgNumber || row.PBGNumber || '',
    pbgValue: (row.pbgValue ?? row.PBGValue) != null ? Number(row.pbgValue ?? row.PBGValue) : null,
    pbgIssueDate: cleanDate(row.pbgIssueDate || row.PBGIssueDate),
    pbgExpiryDate,
    invoicedToDate: (row.invoicedToDate ?? row.InvoicedToDate) != null ? Number(row.invoicedToDate ?? row.InvoicedToDate) : null,
    notes,
  };
}

/** tbl_Inspection -> InspectionRecord */
function normalizeInspection(row: any): any {
  return {
    id: row.InspectionID || row.id || '',
    woNumber: row.WONumber || '',
    serial: row.Serial || '',
    assetNo: row.AssetNo || '',
    shortDesc: row.ShortDesc || '',
    size: row.Size || '',
    fromRtId: row.FromRTBatchID || null,
    rtNumber: row.RTNumber || '',
    receivedDate: row.ReceivedDate || '',
    inspector: row.Inspector || '',
    inspectionDate: row.InspectionDate || null,
    status: row.Status || 'Pending',
    reportNumber: row.ReportNumber || '',
    disposition: row.Disposition || null,
    notes: row.Notes || '',
  };
}

/** tbl_Maintenance -> MaintenanceRecord */
function normalizeMaintenance(row: any): any {
  return {
    id: row.MaintenanceID || row.id || '',
    woNumber: row.WONumber || '',
    serial: row.Serial || '',
    assetNo: row.AssetNo || '',
    shortDesc: row.ShortDesc || '',
    size: row.Size || '',
    fromInspectionId: row.FromInspectionID || null,
    issue: row.Issue || '',
    type: row.Type || 'InHouse',
    vendor: row.Vendor || '',
    assignedTo: row.AssignedTo || '',
    startDate: row.StartDate || '',
    estCompleteDate: row.EstCompleteDate || null,
    completedDate: row.CompletedDate || null,
    status: row.Status || 'In Progress',
    cost: row.Cost != null ? Number(row.Cost) : null,
    notes: row.Notes || '',
  };
}

/**
 * Reconciles Jobs, Delivery Tickets (DTs), Receiving Tickets (RTs), and Inventory:
 * 1) Auto-generates closure dummy RT for completed jobs with legal invoices having unreturned/missing RT tools (User Request 3)
 * 2) Synchronizes live tool status and location with active DT dispatch ledger so tools at rigs show 'On Rig' in Inventory & Dashboard (User Request 4)
 */
export function reconcileJobsDTRTAndInventory(
  jobs: any[],
  dtBatches: any[],
  rtBatches: any[],
  inventory?: any[]
): {
  jobs: any[];
  dtBatches: any[];
  rtBatches: any[];
  inventory?: any[];
} {
  const jobsById = new Map<string, any>();
  jobs.forEach((j: any) => {
    if (j.id) jobsById.set(String(j.id).trim().toUpperCase(), j);
    if (j.jobNumber) jobsById.set(String(j.jobNumber).trim().toUpperCase(), j);
  });

  // Attach contract references to DTs if missing
  dtBatches.forEach((b: any) => {
    if (!b.contract || b.contract === '—') {
      const j = b.jobId ? jobsById.get(String(b.jobId).trim().toUpperCase()) : null;
      if (j) {
        b.contract = j.contract || j.client || (j.poNumber ? `PO-${j.poNumber}` : '');
      }
    }
  });

  // 0. Cross-index and synthesize RT Batches from DT lines that have returnedRtNumber or rtBatchId
  const rtsByRtNumber = new Map<string, any>();
  rtBatches.forEach((rt) => {
    const num = String(rt.rtNumber || rt.id || '').trim().toUpperCase();
    if (num) rtsByRtNumber.set(num, rt);
  });

  dtBatches.forEach((dt) => {
    (dt.toolLines || []).forEach((tl: any) => {
      const rtNum = String(tl.returnedRtNumber || tl.rtBatchId || '').trim();
      if (rtNum && rtNum !== '—' && rtNum !== '-' && !rtNum.toUpperCase().startsWith('RT-AUTO') && !rtNum.toUpperCase().startsWith('RT-CLS')) {
        const rtKey = rtNum.toUpperCase();
        let targetRT = rtsByRtNumber.get(rtKey);
        const lineDate = cleanDateStr(
          tl.returnDate ||
          tl.dateIn ||
          tl.Date_In ||
          (tl as any).DateIn ||
          targetRT?.rtDate ||
          targetRT?.backloadRmDate ||
          targetRT?.loadingNoteDate ||
          targetRT?.lNoteDate ||
          dt.dispatchDate ||
          ''
        );
        
        if (!targetRT) {
          targetRT = {
            id: `RTB-${rtNum.replace(/[^a-zA-Z0-9]/g, '')}`,
            rtNumber: rtNum,
            jobId: dt.jobId || '',
            rig: dt.rig || '',
            well: dt.well || '',
            contract: dt.contract || '',
            rtDate: lineDate,
            backloadRmDate: lineDate,
            loadingNoteNo: `LN-${rtNum.replace(/^RT-?/i, '')}`,
            loadingNoteDate: lineDate,
            lNoteNo: `LN-${rtNum.replace(/^RT-?/i, '')}`,
            lNoteDate: lineDate,
            carrier: 'EMDAD Logistics',
            shippedVia: 'EMDAD Logistics',
            receivedBy: 'QC Inspector',
            condition: 'Good condition',
            toolLines: [],
            isSigned: true,
            isLocked: true,
          };
          rtBatches.push(targetRT);
          rtsByRtNumber.set(rtKey, targetRT);
        } else {
          // If the existing targetRT from SQL has an empty date, fill it
          if ((!targetRT.rtDate || targetRT.rtDate === '—') && lineDate) {
            targetRT.rtDate = lineDate;
            targetRT.backloadRmDate = lineDate;
          }
          if ((!targetRT.loadingNoteDate || targetRT.loadingNoteDate === '—') && lineDate) {
            targetRT.loadingNoteDate = lineDate;
            targetRT.lNoteDate = lineDate;
          }
          if (!targetRT.jobId && dt.jobId) {
            targetRT.jobId = dt.jobId;
          }
          if (!targetRT.rig && dt.rig) {
            targetRT.rig = dt.rig;
          }
          if (!targetRT.well && dt.well) {
            targetRT.well = dt.well;
          }
        }

        const existingTool = (targetRT.toolLines || []).find(
          (rtl: any) => rtl.serial && tl.serial && String(rtl.serial).trim().toUpperCase() === String(tl.serial).trim().toUpperCase()
        );
        if (existingTool) {
          const effDate = cleanDateStr(
            existingTool.dateIn ||
            existingTool.Date_In ||
            existingTool.DateIn ||
            existingTool.returnDate ||
            existingTool.rtDate ||
            lineDate ||
            targetRT.rtDate ||
            targetRT.loadingNoteDate
          );
          if (effDate) {
            existingTool.dateIn = effDate;
            existingTool.Date_In = effDate;
            existingTool.DateIn = effDate;
            existingTool.rtDate = effDate;
            existingTool.returnDate = effDate;
          }
          if (!existingTool.rtNumber) existingTool.rtNumber = rtNum;
        } else {
          if (!targetRT.toolLines) targetRT.toolLines = [];
          const effDate = lineDate || targetRT.rtDate || targetRT.loadingNoteDate;
          targetRT.toolLines.push({
            id: tl.id || `RTL-${Date.now()}-${targetRT.toolLines.length}`,
            itemNo: targetRT.toolLines.length + 1,
            serial: tl.serial,
            assetNo: tl.assetNo || tl.serial,
            shortDesc: tl.shortDesc,
            desc: tl.desc,
            toolDescription: tl.toolDescription || tl.desc || tl.shortDesc,
            size: tl.size,
            dateIn: effDate,
            Date_In: effDate,
            DateIn: effDate,
            rtDate: effDate,
            returnDate: effDate,
            rtNumber: rtNum,
            used: tl.used != null ? tl.used : (tl.usedStatus === 'used'),
            routedTo: tl.used ? 'Inspection Bay' : 'Available Inventory',
            condition: tl.condition || (tl.used ? 'USED' : 'NOT USED'),
            ownership: tl.ownership || 'EMDAD',
            remarks: tl.remarks || '',
            qty: tl.qty || 1,
            dtBatchId: dt.id || dt.dtNumber,
          });
        }
      }
    });
  });

  // Index DTs and RTs by Job ID
  const dtsByJobId = new Map<string, any[]>();
  dtBatches.forEach((dt) => {
    const k = String(dt.jobId || '').trim().toUpperCase();
    const norm = normalizeJobKey(dt.jobId);
    if (k) {
      if (!dtsByJobId.has(k)) dtsByJobId.set(k, []);
      dtsByJobId.get(k)!.push(dt);
    }
    if (norm && norm !== k) {
      if (!dtsByJobId.has(norm)) dtsByJobId.set(norm, []);
      dtsByJobId.get(norm)!.push(dt);
    }
  });

  const rtsByJobId = new Map<string, any[]>();
  rtBatches.forEach((rt) => {
    const k = String(rt.jobId || '').trim().toUpperCase();
    const norm = normalizeJobKey(rt.jobId);
    if (k) {
      if (!rtsByJobId.has(k)) rtsByJobId.set(k, []);
      rtsByJobId.get(k)!.push(rt);
    }
    if (norm && norm !== k) {
      if (!rtsByJobId.has(norm)) rtsByJobId.set(norm, []);
      rtsByJobId.get(norm)!.push(rt);
    }
  });

  // 1. Auto-create dummy tickets and reconcile completed jobs with legal invoices (FSH, FR, WHP)
  jobs.forEach((job) => {
    // Legal invoice numbers strictly start with FSH, FR, or WHP
    const hasLegalInvoice = Boolean(
      (job.legalInvoiceNumber && (
        job.legalInvoiceNumber.toUpperCase().startsWith('FSH') ||
        job.legalInvoiceNumber.toUpperCase().startsWith('FR') ||
        job.legalInvoiceNumber.toUpperCase().startsWith('WHP')
      )) ||
      (job.invoiceNumber && (
        job.invoiceNumber.toUpperCase().startsWith('FSH') ||
        job.invoiceNumber.toUpperCase().startsWith('FR') ||
        job.invoiceNumber.toUpperCase().startsWith('WHP')
      ))
    );

    const isCompleted = hasLegalInvoice;

    if (isCompleted) {
      const jobKey = String(job.id || '').trim().toUpperCase();
      const jobDTs = dtsByJobId.get(jobKey) || [];
      const jobRTs = rtsByJobId.get(jobKey) || [];

      // Ensure all existing DTs for this completed job are locked, signed, and tool lines returned
      jobDTs.forEach((dt) => {
        dt.isSigned = true;
        dt.isLocked = true;
        (dt.toolLines || []).forEach((tl: any) => {
          tl.status = 'Returned';
        });
      });

      // Ensure all existing RTs for this completed job are locked and signed
      jobRTs.forEach((rt) => {
        rt.isSigned = true;
        rt.isLocked = true;
        (rt.toolLines || []).forEach((tl: any) => {
          tl.status = 'Returned';
        });
      });

      // Collect all tool serials dispatched in DTs
      const dispatchedLines: any[] = [];
      jobDTs.forEach((dt) => {
        (dt.toolLines || []).forEach((tl: any) => {
          dispatchedLines.push(tl);
        });
      });

      // Collect all tool serials returned in RTs
      const returnedLines: any[] = [];
      const returnedSerials = new Set<string>();
      jobRTs.forEach((rt) => {
        (rt.toolLines || []).forEach((tl: any) => {
          returnedLines.push(tl);
          if (tl.serial) returnedSerials.add(String(tl.serial).trim().toUpperCase());
        });
      });

      // Case A: Tools were dispatched on DT, but unreturned on RT -> create dummy RT
      const unreturned = dispatchedLines.filter(
        (tl) => tl.serial && !returnedSerials.has(String(tl.serial).trim().toUpperCase())
      );

      if (dispatchedLines.length > 0 && unreturned.length > 0) {
        const dummyRTId = `RT-AUTO-${String(job.id).replace(/[^a-zA-Z0-9]/g, '')}`;
        const dummyRTNum = `RT-CLS-${String(job.id).replace(/^Job[-_]?/i, '')}`;
        const existingAuto = rtBatches.find(
          (r) => r.id === dummyRTId || r.rtNumber === dummyRTNum
        );

        if (!existingAuto) {
          const autoDate = job.demobDate || job.lastRtDate || job.finalInvoicedDate || job.mobDate || '2023-12-31';
          const lnNo = `LN-${String(job.id).replace(/^Job[-_]?/i, '')}`;
          const autoRT = {
            id: dummyRTId,
            rtNumber: dummyRTNum,
            jobId: job.id,
            rig: job.rig || 'Rig Unassigned',
            well: job.well || '—',
            contract: job.contract || '',
            rtDate: autoDate,
            backloadRmDate: autoDate,
            loadingNoteNo: lnNo,
            loadingNoteDate: autoDate,
            lNoteNo: lnNo,
            lNoteDate: autoDate,
            carrier: 'EMDAD Logistics',
            shippedVia: 'EMDAD Logistics',
            receivedBy: 'Operations Base (Closed)',
            recipient: 'Emdad Base QC',
            notes: `Auto-closure receiving clearance for completed job ${job.id} (Legal Inv #${job.legalInvoiceNumber || job.invoiceNumber})`,
            toolLines: unreturned.map((tl: any) => ({
              ...tl,
              dateIn: autoDate,
              Date_In: autoDate,
              rtDate: autoDate,
              rtNumber: dummyRTNum,
              status: 'Returned',
              used: Boolean(tl.used),
              rtBatchId: dummyRTId,
              routedTo: tl.routedTo || 'Emdad Base',
            })),
            isSigned: true,
            isLocked: true,
          };
          rtBatches.push(autoRT);
          if (!rtsByJobId.has(jobKey)) rtsByJobId.set(jobKey, []);
          rtsByJobId.get(jobKey)!.push(autoRT);

          // Update DT tool lines to link to this auto RT
          jobDTs.forEach((dt) => {
            (dt.toolLines || []).forEach((tl: any) => {
              if (unreturned.some((u) => u.serial && String(u.serial).trim().toUpperCase() === String(tl.serial).trim().toUpperCase())) {
                tl.status = 'Returned';
                tl.rtBatchId = dummyRTId;
              }
            });
          });

          if (!job.lastRtDate) {
            job.lastRtDate = autoRT.rtDate;
          }
        }
      }

      // Case B: RT tools exist (e.g. RT tools = 1) but DT tools = 0 -> create dummy DT to balance
      if (returnedLines.length > 0 && dispatchedLines.length === 0) {
        const dummyDTId = `DT-AUTO-${String(job.id).replace(/[^a-zA-Z0-9]/g, '')}`;
        const dummyDTNum = `DT-CLS-${String(job.id).replace(/^Job[-_]?/i, '')}`;
        const existingAutoDT = dtBatches.find(
          (d) => d.id === dummyDTId || d.dtNumber === dummyDTNum
        );

        if (!existingAutoDT) {
          const autoDT = {
            id: dummyDTId,
            dtNumber: dummyDTNum,
            jobId: job.id,
            rig: job.rig || 'Rig Unassigned',
            well: job.well || '—',
            contract: job.contract || '',
            rmDate: job.mobDate || '2023-01-01',
            dispatchDate: job.mobDate || '2023-01-01',
            dispatchedBy: 'Operations Base (Closed)',
            recipient: job.client || 'Client Representative',
            notes: `Auto-closure dispatch record for completed job ${job.id} (Legal Inv #${job.legalInvoiceNumber || job.invoiceNumber})`,
            toolLines: returnedLines.map((tl: any) => ({
              ...tl,
              status: 'Returned',
              rtBatchId: tl.rtBatchId || (jobRTs[0] ? jobRTs[0].id : undefined),
            })),
            isSigned: true,
            isLocked: true,
          };
          dtBatches.push(autoDT);
          if (!dtsByJobId.has(jobKey)) dtsByJobId.set(jobKey, []);
          dtsByJobId.get(jobKey)!.push(autoDT);
        }
      }

      job.signedDtAttached = true;
      job.signedRtAttached = true;
      job.signedUtilizationAttached = true;
      if (!job.status || job.status.toLowerCase() !== 'completed') {
        job.status = 'Completed';
      }
    }
  });

  // 2. Link Inventory with DT and RT ledger (Request 4)
  if (inventory && Array.isArray(inventory) && inventory.length > 0) {
    const toolLatestDT = new Map<string, { dt: any; date: string; rig: string; jobId: string }>();
    const toolLatestRT = new Map<string, { rt: any; date: string; routedTo: string }>();

    dtBatches.forEach((dt) => {
      const dtDate = String(dt.dispatchDate || dt.rmDate || '2023-01-01');
      (dt.toolLines || []).forEach((tl: any) => {
        const serialKey = String(tl.serial || '').trim().toUpperCase();
        const assetKey = String(tl.assetNo || '').trim().toUpperCase();
        const entry = { dt, date: dtDate, rig: dt.rig || 'Rig', jobId: dt.jobId };

        if (serialKey) {
          const prev = toolLatestDT.get(serialKey);
          if (!prev || dtDate >= prev.date) toolLatestDT.set(serialKey, entry);
        }
        if (assetKey && assetKey !== serialKey) {
          const prev = toolLatestDT.get(assetKey);
          if (!prev || dtDate >= prev.date) toolLatestDT.set(assetKey, entry);
        }
      });
    });

    rtBatches.forEach((rt) => {
      const rtDate = String(rt.rtDate || rt.backloadRmDate || '2023-01-01');
      (rt.toolLines || []).forEach((tl: any) => {
        const serialKey = String(tl.serial || '').trim().toUpperCase();
        const assetKey = String(tl.assetNo || '').trim().toUpperCase();
        const entry = { rt, date: rtDate, routedTo: tl.routedTo || 'Emdad Base' };

        if (serialKey) {
          const prev = toolLatestRT.get(serialKey);
          if (!prev || rtDate >= prev.date) toolLatestRT.set(serialKey, entry);
        }
        if (assetKey && assetKey !== serialKey) {
          const prev = toolLatestRT.get(assetKey);
          if (!prev || rtDate >= prev.date) toolLatestRT.set(assetKey, entry);
        }
      });
    });

    inventory.forEach((tool: any) => {
      const sKey = String(tool.serial || '').trim().toUpperCase();
      const aKey = String(tool.assetNo || '').trim().toUpperCase();
      const idKey = String(tool.id || '').trim().toUpperCase();

      const latestDT = toolLatestDT.get(sKey) || (aKey ? toolLatestDT.get(aKey) : undefined) || (idKey ? toolLatestDT.get(idKey) : undefined);
      const latestRT = toolLatestRT.get(sKey) || (aKey ? toolLatestRT.get(aKey) : undefined) || (idKey ? toolLatestRT.get(idKey) : undefined);

      if (latestDT) {
        const isReturned = latestRT && latestRT.date >= latestDT.date;
        if (!isReturned) {
          tool.status = 'On Rig';
          const rigName = latestDT.rig.trim();
          tool.location = rigName ? (rigName.toLowerCase().startsWith('rig') ? rigName : `Rig ${rigName}`) : 'On Rig';
          tool.rig = rigName;
          tool.currentJobId = latestDT.jobId;
          tool.currentRig = rigName;
        } else {
          if (tool.status === 'On Rig') {
            const dest = (latestRT.routedTo || '').toLowerCase();
            if (dest.includes('inspection')) {
              tool.status = 'Inspection';
              tool.location = 'Inspection Bay';
            } else if (dest.includes('workshop') || dest.includes('repair')) {
              tool.status = 'Repair';
              tool.location = 'Workshop';
            } else {
              tool.status = 'Good';
              tool.location = 'Emdad Base';
            }
            tool.currentJobId = null;
            tool.currentRig = null;
          }
        }
      }
    });
  }

  return { jobs, dtBatches, rtBatches, inventory };
}

// Helper function for Data API Builder with fallback table names, pagination, and top parameter tuning
async function fetchAllTablePages(
  baseEndpoint: string,
  tableVariants: string[],
  maxPages = 30
): Promise<any[]> {
  for (const tbl of tableVariants) {
    try {
      let allRows: any[] = [];
      let nextUrl: string | null = `${baseEndpoint}/${tbl}?$top=5000`;
      let pages = 0;

      while (nextUrl && pages < maxPages) {
        pages++;
        let r = await fetch(nextUrl);
        if (!r.ok && r.status === 400 && pages === 1) {
          nextUrl = `${baseEndpoint}/${tbl}?$top=1000`;
          r = await fetch(nextUrl);
          if (!r.ok && r.status === 400) {
            nextUrl = `${baseEndpoint}/${tbl}?$top=500`;
            r = await fetch(nextUrl);
          }
        }
        if (!r.ok) break;
        const json = await r.json();
        const rows = json.value || json;
        if (Array.isArray(rows) && rows.length > 0) {
          allRows = allRows.concat(rows);
          nextUrl = json['@nextLink'] || json['nextLink'] || null;
          if (nextUrl && !nextUrl.startsWith('http')) {
            nextUrl = `${baseEndpoint}/${nextUrl.replace(/^\//, '')}`;
          }
        } else {
          break;
        }
      }

      if (allRows.length > 0) {
        return allRows;
      }
    } catch {
      // Try next table variant
    }
  }
  return [];
}

/**
 * Attempts to fetch live data from Azure Static Web Apps Data API or Azure Functions
 */
export async function fetchLiveDatabaseData(): Promise<{
  success: boolean;
  data?: {
    inventory?: any[];
    jobs?: any[];
    dtBatches?: any[];
    rtBatches?: any[];
    contracts?: any[];
  };
  source: 'data-api' | 'azure-function' | 'failed';
  message: string;
}> {
  const endpoint = getApiEndpoint();

  function buildMultiKeyLineIndex(lines: any[], type: 'DT' | 'RT'): Map<string, any[]> {
    const map = new Map<string, any[]>();

    lines.forEach((line) => {
      const keys = new Set<string>();

      const rawRefs = type === 'DT'
        ? [
            line.dtNumber, line.DTNumber, line.DT_Number, line.dt_number,
            line.TicketNumber, line.ticketNumber, line.Ticket_Number, line.ticket_number,
            line.DTNo, line.dtNo, line.DT_No, line.dt_no,
            line.DTBatchID, line.dtBatchId, line.DT_Batch_ID, line.dt_batch_id,
            line.BatchID, line.batchId,
            line.DeliveryTicketNo, line.deliveryTicketNo, line.DeliveryTicketNumber, line.deliveryTicketNumber,
            line.DeliveryTicketID, line.deliveryTicketId, line.DT_ID, line.dt_id,
            line.HeaderID, line.headerId, line.DTHeaderID, line.dtHeaderId,
            line.TicketID, line.ticketId, line.ID, line.id,
          ]
        : [
            line.rtNumber, line.RTNumber, line.RT_Number, line.rt_number,
            line.TicketNumber, line.ticketNumber, line.Ticket_Number, line.ticket_number,
            line.RTNo, line.rtNo, line.RT_No, line.rt_no,
            line.RGT_No, line.rgtNo, line.RGTNo, line.rgt_no,
            line.RTBatchID, line.rtBatchId, line.RT_Batch_ID, line.rt_batch_id,
            line.BatchID, line.batchId,
            line.ReceivingTicketNo, line.receivingTicketNo, line.ReceivingTicketNumber, line.receivingTicketNumber,
            line.ReceivingTicketID, line.receivingTicketId, line.RT_ID, line.rt_id,
            line.HeaderID, line.headerId, line.RTHeaderID, line.rtHeaderId,
            line.TicketID, line.ticketId, line.ID, line.id,
          ];

      rawRefs.forEach((r) => {
        if (r != null && r !== '') {
          const s = String(r).trim();
          if (s) {
            keys.add(s);
            keys.add(s.toUpperCase());
            const norm = s.toUpperCase().replace(/^(DT|RT|RGT)[-_]?/i, '');
            if (norm) {
              keys.add(norm);
              keys.add(`${type}-${norm}`);
              keys.add(`${type}${norm}`);
              const withoutZeros = norm.replace(/^0+/, '');
              if (withoutZeros) {
                keys.add(withoutZeros);
                keys.add(`${type}-${withoutZeros}`);
              }
            }
          }
        }
      });

      const jId = String(line.jobId || line.JobID || line.jobNumber || line.JobNumber || line.JobNo || line.jobNo || line.Job || line.job || '').trim();
      if (jId) {
        const normJ = normalizeJobKey(jId);
        if (normJ) {
          keys.add(`JOB_${normJ}`);
        }
        keys.add(`JOB_${jId.toUpperCase()}`);
      }

      keys.forEach((k) => {
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(line);
      });
    });

    return map;
  }

  function attachLinesToBatches(tickets: any[], lines: any[], type: 'DT' | 'RT'): any[] {
    if (!lines || lines.length === 0) return tickets;
    const lineIndex = buildMultiKeyLineIndex(lines, type);

    return tickets.map((ticket) => {
      if (Array.isArray(ticket.toolLines) && ticket.toolLines.length > 0) {
        return ticket;
      }
      if (Array.isArray(ticket.tools) && ticket.tools.length > 0) {
        ticket.toolLines = ticket.tools;
        return ticket;
      }
      if (Array.isArray(ticket.lines) && ticket.lines.length > 0) {
        ticket.toolLines = ticket.lines;
        return ticket;
      }

      const candidateKeys = type === 'DT'
        ? [
            ticket.dtNumber, ticket.DTNumber, ticket.DT_Number, ticket.dt_number,
            ticket.TicketNumber, ticket.ticketNumber, ticket.Ticket_Number, ticket.ticket_number,
            ticket.DTNo, ticket.dtNo, ticket.DT_No, ticket.dt_no,
            ticket.DTBatchID, ticket.dtBatchId, ticket.DT_Batch_ID, ticket.dt_batch_id,
            ticket.BatchID, ticket.batchId,
            ticket.id, ticket.ID,
            ticket.DeliveryTicketNo, ticket.deliveryTicketNo, ticket.DeliveryTicketNumber, ticket.deliveryTicketNumber,
            ticket.DeliveryTicketID, ticket.deliveryTicketId, ticket.DT_ID, ticket.dt_id,
            ticket.HeaderID, ticket.headerId, ticket.DTHeaderID, ticket.dtHeaderId,
          ]
        : [
            ticket.rtNumber, ticket.RTNumber, ticket.RT_Number, ticket.rt_number,
            ticket.TicketNumber, ticket.ticketNumber, ticket.Ticket_Number, ticket.ticket_number,
            ticket.RTNo, ticket.rtNo, ticket.RT_No, ticket.rt_no,
            ticket.RGT_No, ticket.rgtNo, ticket.RGTNo, ticket.rgt_no,
            ticket.RTBatchID, ticket.rtBatchId, ticket.RT_Batch_ID, ticket.rt_batch_id,
            ticket.BatchID, ticket.batchId,
            ticket.id, ticket.ID,
            ticket.ReceivingTicketNo, ticket.receivingTicketNo, ticket.ReceivingTicketNumber, ticket.receivingTicketNumber,
            ticket.ReceivingTicketID, ticket.receivingTicketId, ticket.RT_ID, ticket.rt_id,
            ticket.HeaderID, ticket.headerId, ticket.RTHeaderID, ticket.rtHeaderId,
          ];

      let foundLines: any[] | null = null;
      for (const raw of candidateKeys) {
        if (raw != null && raw !== '') {
          const s = String(raw).trim();
          if (lineIndex.has(s)) { foundLines = lineIndex.get(s)!; break; }
          if (lineIndex.has(s.toUpperCase())) { foundLines = lineIndex.get(s.toUpperCase())!; break; }
          const norm = s.toUpperCase().replace(/^(DT|RT|RGT)[-_]?/i, '');
          if (norm && lineIndex.has(norm)) { foundLines = lineIndex.get(norm)!; break; }
          if (norm && lineIndex.has(`${type}-${norm}`)) { foundLines = lineIndex.get(`${type}-${norm}`)!; break; }
          const withoutZeros = norm.replace(/^0+/, '');
          if (withoutZeros && lineIndex.has(withoutZeros)) { foundLines = lineIndex.get(withoutZeros)!; break; }
          if (withoutZeros && lineIndex.has(`${type}-${withoutZeros}`)) { foundLines = lineIndex.get(`${type}-${withoutZeros}`)!; break; }
        }
      }

      if (!foundLines) {
        const jId = String(ticket.jobId || ticket.JobID || ticket.jobNumber || ticket.JobNumber || ticket.JobNo || ticket.jobNo || '').trim();
        if (jId) {
          const normJ = normalizeJobKey(jId);
          if (normJ && lineIndex.has(`JOB_${normJ}`)) {
            foundLines = lineIndex.get(`JOB_${normJ}`)!;
          }
        }
      }

      if (foundLines && foundLines.length > 0) {
        ticket.toolLines = foundLines;
      }

      return ticket;
    });
  }

  // Strategy 1: If endpoint is /data-api/rest (Azure Static Web Apps Linked Database)
  if (endpoint.includes('/data-api/rest') || endpoint.endsWith('/rest')) {
    try {
      const [invRows, jobRows, dtRows, dtLineRows, rtRows, rtLineRows] = await Promise.all([
        fetchAllTablePages(endpoint, ['tbl_Inventory', 'Inventory', 'tblInventory', 'ToolInventory', 'tools', 'tbl_Tools', 'Tools']),
        fetchAllTablePages(endpoint, ['tbl_Jobs', 'Jobs', 'tblJobs', 'DrillingJobs', 'tbl_DrillingJobs', 'tbl_JobHeader', 'JobHeader', 'tbl_JobRegister', 'JobRegister']),
        fetchAllTablePages(endpoint, ['tbl_DeliveryTickets', 'DeliveryTickets', 'tbl_DTBatches', 'DTBatches', 'tbl_DT', 'DT', 'tbl_DeliveryTicket', 'DeliveryTicket', 'tbl_DT_Header', 'DTHeader']),
        fetchAllTablePages(endpoint, ['tbl_DTLines', 'DTLines', 'tbl_DeliveryTicketLines', 'DeliveryTicketLines', 'tbl_DTBatchLines', 'DTBatchLines', 'tbl_DT_Lines', 'tblDTLines', 'tbl_DeliveryTickets_Lines', 'DeliveryTickets_Lines']),
        fetchAllTablePages(endpoint, ['tbl_ReceivingTickets', 'ReceivingTickets', 'tbl_RTBatches', 'RTBatches', 'tbl_RT', 'RT', 'tbl_ReceivingTicket', 'ReceivingTicket', 'tbl_RT_Header', 'RTHeader']),
        fetchAllTablePages(endpoint, ['tbl_RTLines', 'RTLines', 'tbl_ReceivingTicketLines', 'ReceivingTicketLines', 'tbl_RTBatchLines', 'RTBatchLines', 'tbl_RT_Lines', 'tblRTLines', 'tbl_ReceivingTickets_Lines', 'ReceivingTickets_Lines']),
      ]);

      let hasAnySuccess = false;
      let inventory: any[] | undefined = undefined;
      let jobs: any[] | undefined = undefined;
      let dtBatches: any[] | undefined = undefined;
      let rtBatches: any[] | undefined = undefined;

      if (invRows.length > 0) {
        inventory = invRows.map(normalizeInventoryItem);
        hasAnySuccess = true;
      }

      if (jobRows.length > 0) {
        jobs = jobRows.map(normalizeJob);
        hasAnySuccess = true;
      }

      if (dtRows.length > 0) {
        const withLines = attachLinesToBatches(dtRows, dtLineRows, 'DT');
        dtBatches = withLines.map(normalizeDTBatch);
        hasAnySuccess = true;
      }

      if (rtRows.length > 0) {
        const withLines = attachLinesToBatches(rtRows, rtLineRows, 'RT');
        rtBatches = withLines.map(normalizeRTBatch);
        hasAnySuccess = true;
      }

      if (hasAnySuccess) {
        if (jobs && jobs.length > 0) {
          const existingKeys = new Set(jobs.map((j: any) => String(j.id).trim().toUpperCase()));
          MASTER_JOBS.forEach((mj) => {
            const k = String(mj.id || '').trim().toUpperCase();
            if (k && !existingKeys.has(k)) {
              jobs!.push({ ...mj });
              existingKeys.add(k);
            }
          });
        }
        if (jobs && jobs.length > 0 && dtBatches && dtBatches.length > 0) {
          const jobsById = new Map<string, any>();
          jobs.forEach((j: any) => {
            if (j.id) jobsById.set(String(j.id).trim().toUpperCase(), j);
            if (j.jobNumber) jobsById.set(String(j.jobNumber).trim().toUpperCase(), j);
          });
          dtBatches.forEach((b: any) => {
            if (!b.contract || b.contract === '—') {
              const j = b.jobId ? jobsById.get(String(b.jobId).trim().toUpperCase()) : null;
              if (j) {
                b.contract = j.contract || j.client || (j.poNumber ? `PO-${j.poNumber}` : '');
              }
            }
          });
        }
        const reconciled = reconcileJobsDTRTAndInventory(jobs || [], dtBatches || [], rtBatches || [], inventory);
        return {
          success: true,
          source: 'data-api',
          data: {
            inventory: reconciled.inventory,
            jobs: reconciled.jobs,
            dtBatches: reconciled.dtBatches,
            rtBatches: reconciled.rtBatches,
          },
          message: `Loaded live from Azure Data API (${reconciled.inventory?.length ?? 0} tools, ${reconciled.jobs.length} jobs, ${reconciled.dtBatches.length} DTs, ${reconciled.rtBatches.length} RTs)`,
        };
      }
    } catch (err: any) {
      console.warn('Azure Data API fetch warning:', err);
    }
  }

  // Strategy 2: Azure Function / Custom REST API
  try {
    const apiKey = getApiKey();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['x-functions-key'] = apiKey;
    }

    // Prepare URL with query parameters
    function buildUrl(base: string, actionName: string): string {
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        const fullBase = base.startsWith('http') ? base : `${origin}${base.startsWith('/') ? '' : '/'}${base}`;
        const u = new URL(fullBase);
        if (actionName) {
          u.searchParams.set('action', actionName);
        }
        u.searchParams.set('env', 'live');
        if (apiKey && !u.searchParams.has('code')) {
          u.searchParams.set('code', apiKey);
        }
        return base.startsWith('http') ? u.toString() : `${u.pathname}${u.search}`;
      } catch {
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}action=${actionName}&env=live${apiKey ? `&code=${encodeURIComponent(apiKey)}` : ''}`;
      }
    }

    // Determine function base endpoint
    const fnEndpoint =
      endpoint.includes('/data-api/rest') || endpoint.endsWith('/rest')
        ? DEFAULT_AZURE_FUNCTION_URL
        : endpoint;

    // The Azure Function responds to 'GET_ALL_DATA'
    const attempts = [
      { method: 'GET', url: buildUrl(fnEndpoint, 'GET_ALL_DATA'), body: undefined },
      { method: 'POST', url: buildUrl(fnEndpoint, 'GET_ALL_DATA'), body: JSON.stringify({ action: 'GET_ALL_DATA', env: 'live' }) },
      { method: 'GET', url: buildUrl(fnEndpoint, 'getInventory'), body: undefined },
      { method: 'POST', url: buildUrl(fnEndpoint, 'SYNC_ALL_DATA'), body: JSON.stringify({ action: 'SYNC_ALL_DATA', env: 'live' }) },
      { method: 'GET', url: buildUrl(fnEndpoint, 'SYNC_ALL_DATA'), body: undefined },
      { method: 'GET', url: buildUrl(DEFAULT_AZURE_FUNCTION_URL, 'GET_ALL_DATA'), body: undefined },
    ];

    let lastError = '';
    for (const attempt of attempts) {
      try {
        const res = await fetch(attempt.url, {
          method: attempt.method,
          headers,
          body: attempt.body,
        });

        if (!res.ok) {
          lastError = `HTTP ${res.status}: ${res.statusText}`;
          continue;
        }

        const json = await res.json();
        let payload = json.data !== undefined ? json.data : json;
        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload);
          } catch {
            // ignore
          }
        }

        let rawInventory: any[] | undefined = undefined;
        let rawJobs: any[] = [];
        let rawDt: any[] = [];
        let rawRt: any[] = [];

        if (Array.isArray(payload)) {
          rawInventory = payload;
        } else if (payload && typeof payload === 'object') {
          rawInventory =
            payload.inventory ||
            payload.tools ||
            payload.tbl_Inventory ||
            payload.Inventory ||
            payload.tblInventory ||
            payload.ToolInventory ||
            payload.value ||
            payload.items ||
            payload.rows ||
            payload.records;

          rawJobs = payload.jobs || payload.tbl_Jobs || payload.Jobs || [];

          rawDt =
            payload.dtBatches ||
            payload.dt ||
            payload.tbl_DTBatches ||
            payload.tbl_DeliveryTickets ||
            payload.DeliveryTickets ||
            payload.deliveryTickets ||
            [];
          const rawDtLines =
            payload.tbl_DTLines ||
            payload.DTLines ||
            payload.tbl_DTBatchLines ||
            payload.DTBatchLines ||
            payload.deliveryTicketLines ||
            payload.tbl_DeliveryTicketLines ||
            payload.DeliveryTicketLines ||
            payload.dtLines ||
            [];

          rawRt =
            payload.rtBatches ||
            payload.rt ||
            payload.tbl_RTBatches ||
            payload.tbl_ReceivingTickets ||
            payload.ReceivingTickets ||
            payload.receivingTickets ||
            payload.returnTickets ||
            [];
          const rawRtLines =
            payload.tbl_RTLines ||
            payload.RTLines ||
            payload.tbl_RTBatchLines ||
            payload.RTBatchLines ||
            payload.receivingTicketLines ||
            payload.tbl_ReceivingTicketLines ||
            payload.ReceivingTicketLines ||
            payload.rtLines ||
            [];

          if (Array.isArray(rawDt) && Array.isArray(rawDtLines) && rawDtLines.length > 0) {
            rawDt = attachLinesToBatches(rawDt, rawDtLines, 'DT');
          }

          if (Array.isArray(rawRt) && Array.isArray(rawRtLines) && rawRtLines.length > 0) {
            rawRt = attachLinesToBatches(rawRt, rawRtLines, 'RT');
          }
        }

        if (Array.isArray(rawInventory) || (Array.isArray(rawJobs) && rawJobs.length > 0) || Array.isArray(rawDt)) {
          const invList = Array.isArray(rawInventory) ? rawInventory.map(normalizeInventoryItem) : undefined;
          let parsedJobs = Array.isArray(rawJobs) && rawJobs.length > 0 ? rawJobs.map(normalizeJob) : [];
          const parsedDTs = Array.isArray(rawDt) ? rawDt.map(normalizeDTBatch) : [];
          const parsedRTs = Array.isArray(rawRt) ? rawRt.map(normalizeRTBatch) : [];

          // Merge any master jobs from user's list that might not be in Azure SQL
          if (parsedJobs.length > 0) {
            const existingKeys = new Set(parsedJobs.map((j: any) => String(j.id).trim().toUpperCase()));
            MASTER_JOBS.forEach((mj) => {
              const k = String(mj.id || '').trim().toUpperCase();
              if (k && !existingKeys.has(k)) {
                parsedJobs.push({ ...mj });
                existingKeys.add(k);
              }
            });
          }

          // If Azure returns empty jobs array, use the aligned master jobs catalog and merge with live DTs/RTs
          if (parsedJobs.length === 0) {
            const jobsById = new Map<string, any>();
            // 1. Pre-load all master jobs
            MASTER_JOBS.forEach((j) => {
              const k = String(j.id || '').trim().toUpperCase();
              if (k) jobsById.set(k, { ...j });
            });

            // 2. Discover any additional jobs referenced in live DTs
            parsedDTs.forEach((dt: any) => {
              const jId = String(dt.jobId || dt.jobNumber || '').trim();
              if (!jId) return;
              const k = jId.toUpperCase();
              if (!jobsById.has(k)) {
                jobsById.set(k, {
                  id: jId,
                  rig: dt.rig || 'RIG-EMDAD',
                  well: dt.well || '—',
                  client: dt.customer || dt.contract || dt.clientCode || 'ADNOC DRILLING',
                  contract: dt.contract || dt.clientCode || '',
                  poNumber: dt.poNumber || '',
                  serviceType: dt.calloutRef ? `Callout: ${dt.calloutRef}` : 'Downhole Tool Dispatch',
                  status: 'Completed',
                  mobDate: dt.deliveryDate ? dt.deliveryDate.split('T')[0] : (dt.dispatchDate ? dt.dispatchDate.split('T')[0] : ''),
                  demobDate: '',
                  legalInvoiceNumber: '',
                  draftInvoiceNumber: '',
                  invoiceAmount: 0,
                  invoicingType: 'PerJob',
                  currency: 'USD',
                  createdBy: 'Operations',
                  createdDate: dt.deliveryDate ? dt.deliveryDate.split('T')[0] : '2023-01-01',
                });
              }
            });

            parsedJobs = Array.from(jobsById.values());
          }

          if (parsedJobs.length > 0 && parsedDTs.length > 0) {
            const jobsById = new Map<string, any>();
            parsedJobs.forEach((j: any) => {
              if (j.id) jobsById.set(String(j.id).trim().toUpperCase(), j);
              if (j.jobNumber) jobsById.set(String(j.jobNumber).trim().toUpperCase(), j);
            });
            parsedDTs.forEach((b: any) => {
              if (!b.contract || b.contract === '—') {
                const j = b.jobId ? jobsById.get(String(b.jobId).trim().toUpperCase()) : null;
                if (j) {
                  b.contract = j.contract || j.client || (j.poNumber ? `PO-${j.poNumber}` : '');
                }
              }
            });
          }
          const reconciled = reconcileJobsDTRTAndInventory(parsedJobs, parsedDTs, parsedRTs, invList);
          return {
            success: true,
            source: 'azure-function',
            data: {
              inventory: reconciled.inventory,
              jobs: reconciled.jobs,
              dtBatches: reconciled.dtBatches,
              rtBatches: reconciled.rtBatches,
            },
            message: `Connected to Azure SQL via API (${reconciled.inventory?.length || 0} tools, ${reconciled.jobs.length} jobs, ${reconciled.dtBatches.length} DTs, ${reconciled.rtBatches.length} RTs)`,
          };
        } else {
          lastError = `Returned 200 OK but keys were [${Object.keys(payload || {}).join(', ')}]`;
        }
      } catch (e: any) {
        lastError = e?.message || 'Network error';
      }
    }

    return {
      success: false,
      source: 'azure-function',
      message: `Azure API reached but data empty: ${lastError}`,
    };
  } catch (err: any) {
    return {
      success: false,
      source: 'azure-function',
      message: `Azure Function connection error: ${err?.message || 'Network failure'}`,
    };
  }

  return {
    success: false,
    source: 'failed',
    message: 'Unable to reach Azure SQL or Data API endpoint. Using local cache.',
  };
}

/**
 * General API caller
 */
export async function fetchFromApi<T = any>(
  action: string,
  body: Record<string, any> = {}
): Promise<T | null> {
  const endpoint = getApiEndpoint();
  const apiKey = getApiKey();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['x-functions-key'] = apiKey;
  }

  let url = endpoint;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const fullBase = url.startsWith('http') ? url : `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
    const urlObj = new URL(fullBase);
    urlObj.searchParams.set('action', action);
    urlObj.searchParams.set('env', 'live');
    if (apiKey && !urlObj.searchParams.has('code')) {
      urlObj.searchParams.set('code', apiKey);
    }
    url = endpoint.startsWith('http') ? urlObj.toString() : `${urlObj.pathname}${urlObj.search}`;
  } catch {
    url = `${endpoint}?action=${action}&env=live${apiKey ? `&code=${encodeURIComponent(apiKey)}` : ''}`;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, env: 'live', ...body }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    if (json && json.success === false) {
      throw new Error(json.error || 'API error');
    }
    return json.data !== undefined ? json.data : json;
  } catch (e: any) {
    console.warn(`API call [${action}] notice:`, e?.message || e);
    return null;
  }
}

/**
 * Authenticates against tbl_Users via the Azure Function's `login` action.
 */
export async function loginWithApi(
  username: string,
  password: string
): Promise<{ success: boolean; user?: any; message: string }> {
  const endpoint = getApiEndpoint();
  try {
    const res = await fetch(`${endpoint}?action=login&env=live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', env: 'live', username, password }),
    });
    const json = await res.json().catch(() => null);
    const user = json?.data ?? json?.user;
    if (res.ok && json?.success !== false && user?.id) {
      return {
        success: true,
        message: 'Login successful.',
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          email: user.email,
          mustChangePassword: Boolean(user.mustChangePassword),
        },
      };
    }
    return {
      success: false,
      message: json?.error || json?.message || 'Invalid username or password.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Unable to reach the login service. Check your connection.',
    };
  }
}

/**
 * Forces a password change via the Function's real `change_password`
 * action, used when `loginWithApi` returns `mustChangePassword: true`.
 */
export async function changePasswordWithApi(
  userId: number,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  const endpoint = getApiEndpoint();
  try {
    const res = await fetch(`${endpoint}?action=change_password&env=live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'change_password', env: 'live', userId, newPassword }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success !== false) {
      return { success: true, message: 'Password updated.' };
    }
    return { success: false, message: json?.error || json?.message || 'Failed to update password.' };
  } catch (err: any) {
    return { success: false, message: 'Unable to reach the login service. Check your connection.' };
  }
}

/**
 * Tests live connection to the configured endpoint
 */
export async function testAzureConnection(): Promise<{
  ok: boolean;
  latencyMs: number;
  message: string;
  endpoint: string;
}> {
  const start = performance.now();
  const endpoint = getApiEndpoint();
  const apiKey = getApiKey();

  try {
    const headers: Record<string, string> = { 'Cache-Control': 'no-cache' };
    if (apiKey) {
      headers['x-functions-key'] = apiKey;
    }

    let testUrl = endpoint;
    if (apiKey && testUrl.startsWith('http') && !testUrl.includes('code=')) {
      testUrl += `${testUrl.includes('?') ? '&' : '?'}code=${encodeURIComponent(apiKey)}`;
    }

    let res = await fetch(testUrl, {
      method: 'GET',
      headers,
    }).catch(() => null);

    // If GET gave 404 or failed, try POST with action SYNC_ALL_DATA which Azure Functions often require
    if (!res || res.status === 404) {
      try {
        const postUrl = testUrl.includes('action=')
          ? testUrl
          : `${testUrl}${testUrl.includes('?') ? '&' : '?'}action=SYNC_ALL_DATA`;
        res = await fetch(postUrl, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'SYNC_ALL_DATA', env: 'live' }),
        });
      } catch {
        // keep original res
      }
    }

    const latencyMs = Math.round(performance.now() - start);

    if (!res) {
      return {
        ok: false,
        latencyMs,
        endpoint,
        message: 'Unable to connect to endpoint (network error or CORS).',
      };
    }

    if (res.status === 404 && endpoint.includes('/data-api/rest')) {
      return {
        ok: false,
        latencyMs,
        endpoint,
        message:
          'Data API returned 404. Ensure "Database connection" is linked in Azure Static Web Apps Settings.',
      };
    }

    if (res.ok || res.status === 401 || res.status === 403 || res.status === 405) {
      return {
        ok: true,
        latencyMs,
        endpoint,
        message: `Endpoint reachable (${res.status} ${res.statusText || 'OK'}) in ${latencyMs}ms.`,
      };
    }

    return {
      ok: false,
      latencyMs,
      endpoint,
      message: `Endpoint responded with HTTP ${res.status}: ${res.statusText || 'Not Found'} - Check Function Name or Route.`,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      ok: false,
      latencyMs,
      endpoint,
      message: err?.message || 'Connection failed or blocked by CORS / Network.',
    };
  }
}

/**
 * Synchronizes application state with Azure SQL backend tables
 */
export async function syncWithAzureSql(data: Record<string, any>): Promise<boolean> {
  try {
    const res = await fetchFromApi('SYNC_ALL_DATA', { payload: data });
    return res !== null;
  } catch (e) {
    console.warn('Azure SQL sync notice:', e);
    return false;
  }
}

/**
 * Secondary modules loader: callouts, gatePasses, contracts, inspections, maintenance
 */
export async function fetchSecondaryModules(): Promise<{
  callouts?: any[];
  gatePasses?: any[];
  contracts?: any[];
  inspections?: any[];
  maintenance?: any[];
}> {
  const endpoint = getApiEndpoint();

  // Strategy 1: If endpoint is Azure Data API Builder
  if (endpoint.includes('/data-api/rest') || endpoint.endsWith('/rest')) {
    try {
      const [
        calloutsRaw,
        calloutItemsRaw,
        gatePassesRaw,
        gatePassLinesRaw,
        contractsRaw,
        contractRatesRaw,
        inspectionsRaw,
        maintenanceRaw,
      ] = await Promise.all([
        fetchAllTablePages(endpoint, ['tbl_Callouts', 'Callouts', 'tblCallouts']),
        fetchAllTablePages(endpoint, ['tbl_CalloutItems', 'CalloutItems', 'tbl_CalloutLines', 'CalloutLines']),
        fetchAllTablePages(endpoint, ['tbl_GatePasses', 'GatePasses', 'tbl_GatePass', 'GatePass']),
        fetchAllTablePages(endpoint, ['tbl_GatePassLines', 'GatePassLines', 'tbl_GatePass_Lines']),
        fetchAllTablePages(endpoint, ['tbl_Contracts', 'Contracts', 'tblContracts']),
        fetchAllTablePages(endpoint, ['tbl_ContractRates', 'ContractRates', 'tblContractRates', 'rates']),
        fetchAllTablePages(endpoint, ['tbl_Inspections', 'Inspections', 'tbl_Inspection', 'Inspection']),
        fetchAllTablePages(endpoint, ['tbl_MaintenanceOrders', 'MaintenanceOrders', 'tbl_Maintenance', 'Maintenance']),
      ]);

      let callouts: any[] | undefined = undefined;
      let gatePasses: any[] | undefined = undefined;
      let contracts: any[] | undefined = undefined;
      let inspections: any[] | undefined = undefined;
      let maintenance: any[] | undefined = undefined;

      if (calloutsRaw.length > 0) {
        const itemsByCallout = new Map<string, any[]>();
        calloutItemsRaw.forEach((ci: any) => {
          const cId = String(ci.CalloutID || ci.calloutId || ci.calloutID || ci.id || '').trim().toUpperCase();
          if (cId) {
            if (!itemsByCallout.has(cId)) itemsByCallout.set(cId, []);
            itemsByCallout.get(cId)!.push(ci);
          }
        });
        callouts = calloutsRaw.map((c: any) => {
          const cId = String(c.CalloutID || c.id || '').trim().toUpperCase();
          if ((!c.items || c.items.length === 0) && itemsByCallout.has(cId)) {
            c.items = itemsByCallout.get(cId);
          }
          return normalizeCallout(c);
        });
      }

      if (gatePassesRaw.length > 0) {
        const linesByGP = new Map<string, any[]>();
        gatePassLinesRaw.forEach((gpl: any) => {
          const gpNum = String(gpl.gpNumber || gpl.GPNumber || gpl.GatePassID || gpl.gatePassId || '').trim().toUpperCase();
          if (gpNum) {
            if (!linesByGP.has(gpNum)) linesByGP.set(gpNum, []);
            linesByGP.get(gpNum)!.push(gpl);
          }
        });
        gatePasses = gatePassesRaw.map((gp: any) => {
          const gpNum = String(gp.gpNumber || gp.GPNumber || gp.id || '').trim().toUpperCase();
          if ((!gp.toolLines || gp.toolLines.length === 0) && linesByGP.has(gpNum)) {
            gp.toolLines = linesByGP.get(gpNum);
          }
          return normalizeGatePass(gp);
        });
      }

      if (contractsRaw.length > 0) {
        const ratesByContract = new Map<string, any[]>();
        contractRatesRaw.forEach((r: any) => {
          const code = String(r.ContractCode || r.contractCode || r.Contract_Code || r.Contract || r.contract || '').trim().toUpperCase();
          if (code) {
            if (!ratesByContract.has(code)) ratesByContract.set(code, []);
            ratesByContract.get(code)!.push(r);
          }
        });
        contracts = contractsRaw
          .filter((r: any) => r && r.status !== 'Archived' && r.Status !== 'Archived')
          .map((c: any) => {
            const norm = normalizeContract(c);
            const cCode = String(c.ContractCode || c.contractNo || c.contractRef || c.id || '').trim().toUpperCase();
            if (ratesByContract.has(cCode)) {
              norm.rates = ratesByContract.get(cCode)!.map((r: any) => ({
                no: r.RateID || r.RateId || r.id || r.No || '',
                contractRef: r.Notes || r.contractRef || r.ContractRef || '',
                category: r.Category || r.category || '',
                shortDesc: r.EMDADShortDesc || r.shortDesc || r.ShortDesc || r.Description || '',
                size: r.Size || r.size || '',
                holeSection: r.HoleSection || r.holeSection || '',
                opsRate: Number(r.OpsRate || r.opsRate || r.OperatingRate) || 0,
                standbyRate: Number(r.StandbyRate || r.standbyRate) || 0,
                runCharges: r.RunCharges ?? r.runCharges ?? null,
                monthlyCharges: r.MonthlyCharges ?? r.monthlyCharges ?? null,
                redress: r.Redress ?? r.redress ?? null,
                currency: r.Currency || r.currency || norm.currency || 'USD',
              }));
            }
            return norm;
          });
      }

      if (inspectionsRaw.length > 0) {
        inspections = inspectionsRaw.map(normalizeInspection);
      }

      if (maintenanceRaw.length > 0) {
        maintenance = maintenanceRaw.map(normalizeMaintenance);
      }

      if (callouts || gatePasses || contracts || inspections || maintenance) {
        return { callouts, gatePasses, contracts, inspections, maintenance };
      }
    } catch (err) {
      console.warn('Data API secondary modules notice:', err);
    }
  }

  // Strategy 2: Azure Function fallback
  try {
    const [calloutsRaw, gatePassesRaw, contractsRaw, inspectionsRaw, maintenanceRaw] = await Promise.all([
      fetchFromApi<any[]>('getcallouts'),
      fetchFromApi<any[]>('getgatepasses'),
      fetchFromApi<any[]>('getcontracts'),
      fetchFromApi<any[]>('getinspections'),
      fetchFromApi<any[]>('getmaintenance'),
    ]);

    return {
      callouts: Array.isArray(calloutsRaw) ? calloutsRaw.map(normalizeCallout) : undefined,
      gatePasses: Array.isArray(gatePassesRaw) ? gatePassesRaw.map(normalizeGatePass) : undefined,
      contracts: Array.isArray(contractsRaw)
        ? contractsRaw
            .filter((r: any) => r && r.status !== 'Archived' && r.Status !== 'Archived')
            .map(normalizeContract)
        : undefined,
      inspections: Array.isArray(inspectionsRaw) ? inspectionsRaw.map(normalizeInspection) : undefined,
      maintenance: Array.isArray(maintenanceRaw) ? maintenanceRaw.map(normalizeMaintenance) : undefined,
    };
  } catch (e) {
    console.warn('Secondary modules fetch notice:', e);
    return {};
  }
}

export async function saveCalloutApi(callout: any): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetchFromApi('savecallout', { callout });
    return { success: res !== null, message: res ? 'Callout saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
}

export async function saveGatePassApi(gatePass: any): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetchFromApi('savegatepass', { gatepass: gatePass, gatePass });
    return { success: res !== null, message: res ? 'Gate pass saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
}

/**
 * Maps a job's client/contract fields to the ContractCode used in tbl_ContractRates.
 */
export function jobToContractCode(job: { client?: string; contract?: string }): string {
  const client = (job.client || '').toUpperCase();
  const contract = (job.contract || '').toUpperCase();
  if (client.includes('OFFSHORE') || contract === '444558') return 'AOF';
  if (client.includes('ONSHORE') || client.includes('ADCO')) return 'AON';
  if (client.includes('DRILLING')) return 'ADD';
  if (contract.startsWith('TW-') || client.includes('TURNWELL')) return 'TWL';
  return 'AON'; // safe default
}

/**
 * Fetches contract rates from tbl_ContractRates for the given ContractCode
 * (AOF / AON / ADD / TWL / ADF-UZ / ADF-UDR).
 */
export async function fetchContractRates(contractCode: string): Promise<import('../types').ContractRateItem[]> {
  const endpoint = getApiEndpoint();

  // Strategy 1: Data API
  if (endpoint.includes('/data-api/rest') || endpoint.endsWith('/rest')) {
    try {
      const rows = await fetchAllTablePages(endpoint, ['tbl_ContractRates', 'ContractRates', 'tblContractRates', 'rates', 'Contract_Rates']);
      if (rows.length > 0) {
        const filtered = rows.filter((r: any) => {
          const cCode = String(r.ContractCode || r.contractCode || r.Contract_Code || r.Contract || r.contract || '').trim().toUpperCase();
          return !contractCode || cCode === contractCode.toUpperCase() || cCode.includes(contractCode.toUpperCase());
        });
        if (filtered.length > 0) {
          return filtered.map((r: any) => ({
            no: r.RateID || r.RateId || r.id || r.No || '',
            contractRef: r.Notes || r.contractRef || r.ContractRef || '',
            category: r.Category || r.category || '',
            shortDesc: r.EMDADShortDesc || r.shortDesc || r.ShortDesc || r.Description || '',
            size: r.Size || r.size || '',
            holeSection: r.HoleSection || r.holeSection || '',
            opsRate: Number(r.OpsRate || r.opsRate || r.OperatingRate) || 0,
            standbyRate: Number(r.StandbyRate || r.standbyRate) || 0,
            runCharges: r.RunCharges ?? r.runCharges ?? null,
            monthlyCharges: r.MonthlyCharges ?? r.monthlyCharges ?? null,
            redress: r.Redress ?? r.redress ?? null,
            currency: r.Currency || r.currency || 'USD',
          }));
        }
      }
    } catch {
      // fallback
    }
  }

  // Strategy 2: Azure Function action
  const res = await fetchFromApi<any[]>('getcontractrates', { code: contractCode });
  if (!res || !Array.isArray(res)) return [];
  return res.map((r: any) => ({
    no: r.RateID || '',
    contractRef: r.Notes || '',
    category: r.Category || '',
    shortDesc: r.EMDADShortDesc || '',
    size: r.Size || '',
    holeSection: r.HoleSection || '',
    opsRate: Number(r.OpsRate) || 0,
    standbyRate: Number(r.StandbyRate) || 0,
    runCharges: r.RunCharges ?? null,
    monthlyCharges: null,
    redress: r.Redress ?? null,
    currency: r.Currency || 'USD',
  }));
}

export async function saveContractApi(contract: any): Promise<{ success: boolean; message: string }> {
  try {
    // Sanitize dates for SQL: pbgExpiryDate if "OPEN ENDED" must be sent as null to avoid SQL date parse error
    const sanitized = { ...contract };
    if (sanitized.pbgExpiryDate && String(sanitized.pbgExpiryDate).toUpperCase().includes('OPEN')) {
      sanitized.pbgExpiryDate = null;
      if (!sanitized.notes || !sanitized.notes.includes('OPEN ENDED')) {
        sanitized.notes = (sanitized.notes ? sanitized.notes + ' ' : '') + '(PBG Expiry: OPEN ENDED)';
      }
    }
    const res = await fetchFromApi('savecontract', { contract: sanitized });
    return { success: res !== null, message: res ? 'Contract saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
}

export async function saveInspectionApi(inspection: any): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetchFromApi('saveinspection', { inspection });
    return { success: res !== null, message: res ? 'Inspection saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
}

export async function saveMaintenanceApi(maintenance: any): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetchFromApi('savemaintenance', { maintenance });
    return { success: res !== null, message: res ? 'Maintenance saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
}

export async function saveInventoryApi(tool: any): Promise<{ success: boolean; message: string }> {
  try {
    // The Azure Function supports 'updatetool' for existing tools and 'addtool' for new entries
    let res = await fetchFromApi('updatetool', { tool });
    if (!res) {
      res = await fetchFromApi('addtool', { tool });
    }
    return { success: res !== null, message: res ? 'Tool saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
}

export async function saveJobApi(job: any): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetchFromApi('savejob', { job });
    return { success: res !== null, message: res ? 'Job saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
}

export async function saveDeliveryTicketApi(dtBatch: any): Promise<{ success: boolean; message: string }> {
  try {
    // Azure Function requires 'batch' payload key (checking batch.dtNumber)
    const res = await fetchFromApi('savedeliveryticket', { batch: dtBatch, dtBatch });
    return { success: res !== null, message: res ? 'Delivery Ticket saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
}

export async function saveReceivingTicketApi(rtBatch: any): Promise<{ success: boolean; message: string }> {
  try {
    // Azure Function requires 'batch' payload key (checking batch.rtNumber)
    const res = await fetchFromApi('savereceivingticket', { batch: rtBatch, rtBatch });
    return { success: res !== null, message: res ? 'Receiving Ticket saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
}

export async function saveDailyFieldLogsApi(logs: Array<{
  jobId: string;
  dtNumber?: string;
  toolSerial: string;
  date: string;
  status: '1' | 'S' | string;
  rate?: number;
}>): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetchFromApi('savedailyfieldlogs', { logs });
    return { success: res !== null, message: res ? 'Daily logs saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
}

export async function fetchDailyFieldLogsApi(jobId?: string): Promise<any[]> {
  const endpoint = getApiEndpoint();
  if (endpoint.includes('/data-api/rest') || endpoint.endsWith('/rest')) {
    try {
      const rows = await fetchAllTablePages(endpoint, ['tbl_DailyFieldLogs', 'DailyFieldLogs', 'tbl_Utilization', 'tbl_JobFieldLogs']);
      if (jobId) {
        return rows.filter((r: any) => String(r.JobID || r.jobId || '').trim().toUpperCase() === jobId.trim().toUpperCase());
      }
      return rows;
    } catch {
      // fallback
    }
  }
  const res = await fetchFromApi<any[]>('getdailyfieldlogs', { jobId });
  return Array.isArray(res) ? res : [];
}

/**
 * Generates and downloads a clean, self-contained standalone index.html
 */
export function downloadStandaloneHtml(data?: Record<string, any>) {
  const serializedData = data ? JSON.stringify(data).replace(/<\/script>/g, '<\\/script>') : '{}';

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>EMDAD Oilfield Operations Platform</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  body{font-family:'Plus Jakarta Sans',-apple-system,sans-serif;background:#c8d8e8;color:#1e293b;font-size:13px;}
  .font-mono{font-family:'IBM Plex Mono',monospace;}
  ::-webkit-scrollbar{width:6px;height:6px;}
  ::-webkit-scrollbar-track{background:#f1f5f9;}
  ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px;}
  ::-webkit-scrollbar-thumb:hover{background:#94a3b8;}
  @media print{.no-print{display:none!important;}body{background:white!important;}}
</style>
</head>
<body class="min-h-screen flex flex-col antialiased">
<div id="root"></div>
<script>
  window.__EMDAD_EMBEDDED_DATA__ = ${serializedData};
</script>
<script type="module" src="./src/main.tsx"></script>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Index-googlestudio._v2.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

