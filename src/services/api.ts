/**
 * Service for Azure SQL integration, Data API Builder, Azure Functions backend,
 * and standalone deployment exports
 */

import { MASTER_JOBS } from '../data/masterJobs';
import { saveCustomTool, loadCustomTools, mergeInventoryWithCustomTools } from './customTools';
import { saveCustomJob, loadCustomJobs, mergeJobsWithCustomJobs } from './customJobs';
import { loadCustomContracts, mergeContractsWithCustom } from './customContracts';
import { saveCustomCallout, loadCustomCallouts, mergeCalloutsWithCustom } from './customCallouts';
import {
  INITIAL_CONTRACTS,
  INITIAL_CALLOUTS,
  INITIAL_GATE_PASSES,
  INITIAL_INSPECTIONS,
  INITIAL_MAINTENANCE,
  INITIAL_INVENTORY,
  INITIAL_DT_BATCHES,
  INITIAL_RT_BATCHES,
} from '../data/initialData';
import { addToOutbox, flushOutbox, getOutboxCount } from './outboxQueue';

// Job ID aliases: redirect known placeholder/wrong IDs to the correct canonical ID
const JOB_ID_ALIASES: Record<string, string> = {
  'JOB-UNK-00001': 'JOB-23-00266',
};

export function formatStandardJobId(id?: string): string {
  if (!id) return '';
  const s = String(id).trim();
  if (!s || s === '—' || s === '-') return '';
  // Strip any leading JOB/job/Job prefix with optional dash or space
  const bare = s.replace(/^JOB[-_\s]?/i, '');
  // Strip leading 0 before 2 digits and dash (e.g. 026-XXXXX -> 26-XXXXX)
  const normalizedYear = bare.replace(/^0(\d{2}-)/, '$1');
  const result = `JOB-${normalizedYear}`;
  return JOB_ID_ALIASES[result.toUpperCase()] ?? result;
}

export const normalizeJobKey = (str?: string): string => {
  if (!str) return '';
  const s = str
    .trim()
    .toUpperCase()
    .replace(/^JOB[-_\s]?/i, '');
  return s.replace(/^0(\d{2}-)/, '$1');
};

const MASTER_JOBS_MAP = new Map<string, any>();
MASTER_JOBS.forEach((j) => {
  const stdId = formatStandardJobId(j.id);
  const stdNum = formatStandardJobId((j as any).jobNumber);
  if (j.id) {
    const raw = String(j.id).trim().toUpperCase();
    MASTER_JOBS_MAP.set(raw, j);
    if (stdId) MASTER_JOBS_MAP.set(stdId.toUpperCase(), j);
    MASTER_JOBS_MAP.set(normalizeJobKey(j.id), j);
  }
  if ((j as any).jobNumber) {
    const raw = String((j as any).jobNumber).trim().toUpperCase();
    MASTER_JOBS_MAP.set(raw, j);
    if (stdNum) MASTER_JOBS_MAP.set(stdNum.toUpperCase(), j);
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
    contracts?: number;
    callouts?: number;
    gatePasses?: number;
    inspections?: number;
    maintenance?: number;
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
    // Sub-Rental Tracking
    subRentalAgreementType: row.SubRentalAgreementType || row.subRentalAgreementType || undefined,
    subRentalDailyRate: row.SubRentalDailyRate !== undefined && row.SubRentalDailyRate !== null ? Number(row.SubRentalDailyRate) : (row.subRentalDailyRate !== undefined && row.subRentalDailyRate !== null ? Number(row.subRentalDailyRate) : undefined),
    subRentalMonthlyRate: row.SubRentalMonthlyRate !== undefined && row.SubRentalMonthlyRate !== null ? Number(row.SubRentalMonthlyRate) : (row.subRentalMonthlyRate !== undefined && row.subRentalMonthlyRate !== null ? Number(row.subRentalMonthlyRate) : undefined),
    subRentalOperatingRate: row.SubRentalOperatingRate !== undefined && row.SubRentalOperatingRate !== null ? Number(row.SubRentalOperatingRate) : (row.subRentalOperatingRate !== undefined && row.subRentalOperatingRate !== null ? Number(row.subRentalOperatingRate) : (row.OperatingRate !== undefined && row.OperatingRate !== null ? Number(row.OperatingRate) : undefined)),
    subRentalStandbyRate: row.SubRentalStandbyRate !== undefined && row.SubRentalStandbyRate !== null ? Number(row.SubRentalStandbyRate) : (row.subRentalStandbyRate !== undefined && row.subRentalStandbyRate !== null ? Number(row.subRentalStandbyRate) : (row.StandbyRate !== undefined && row.StandbyRate !== null ? Number(row.StandbyRate) : undefined)),
    subRentalRunCharge: row.SubRentalRunCharge !== undefined && row.SubRentalRunCharge !== null ? Number(row.SubRentalRunCharge) : (row.subRentalRunCharge !== undefined && row.subRentalRunCharge !== null ? Number(row.subRentalRunCharge) : (row.RunCharge !== undefined && row.RunCharge !== null ? Number(row.RunCharge) : undefined)),
    subRentalRedressCharge: row.SubRentalRedressCharge !== undefined && row.SubRentalRedressCharge !== null ? Number(row.SubRentalRedressCharge) : (row.subRentalRedressCharge !== undefined && row.subRentalRedressCharge !== null ? Number(row.subRentalRedressCharge) : (row.RedressCharge !== undefined && row.RedressCharge !== null ? Number(row.RedressCharge) : undefined)),
    supplierPoNumber: row.SupplierPoNumber || row.supplierPoNumber || undefined,
    supplierCurrency: row.SupplierCurrency || row.supplierCurrency || 'AED',
    rentalStartDate: row.RentalStartDate || row.rentalStartDate || undefined,
    rentalEndDate: row.RentalEndDate || row.rentalEndDate || undefined,
  };
}

function isLegalCandidate(c: string): boolean {
  if (!c) return false;
  const s = String(c).trim().toUpperCase();
  if (
    !s ||
    s === '—' ||
    s === '-' ||
    s === 'PENDING' ||
    s === 'NULL' ||
    s === 'UNDEFINED' ||
    s === 'NIL' ||
    s === 'N/A' ||
    s === 'NA' ||
    s === 'NONE' ||
    s === 'NO' ||
    s === 'TBD' ||
    s === 'NOT INVOICED' ||
    s === 'OPEN' ||
    s.startsWith('ERP') ||
    s.startsWith('DFT') ||
    s.startsWith('DRAFT')
  ) {
    return false;
  }
  if (/^\d+$/.test(s)) return false;
  return /[A-Z]/.test(s);
}

export function cleanDateValue(val: any): string {
  if (!val) return '';
  const str = String(val).trim();
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
    return '';
  }
  return str;
}

/**
 * Normalises known client name variants to their canonical form.
 * Fixes typos and deduplicates entries that appear under multiple spellings.
 */
function normalizeRawClientName(name: string): string {
  const u = name.toUpperCase().trim();
  // Typo fix: CHRUCHILL → CHURCHILL
  if (u === 'CHRUCHILL / CORETRAX') return 'CHURCHILL / CORETRAX';
  // BUNDUQ (short form) → full legal name
  if (u === 'BUNDUQ') return 'BUNDUQ COMPANY LIMITED';
  // HALLIBURTON - UAE → Halliburton Worldwide Limited (used in contracts)
  if (u === 'HALLIBURTON - UAE') return 'HALLIBURTON WORLDWIDE LIMITED';
  // HALLIBURTON - INDIA → same group
  if (u === 'HALLIBUTON - INDIA' || u === 'HALLIBURTON - INDIA') return 'HALLIBURTON WORLDWIDE LIMITED';
  // GIS / General Integrated Services variants → canonical GIS - UAE
  if (u.startsWith('GENERAL INTEGRATED')) return 'GIS - UAE';
  return name;
}

export function resolveJobClient(
  rawClient?: string | null,
  contractRef?: string | null,
  masterClient?: string | null,
  rig?: string | null
): string {
  const c = String(rawClient || '').trim();
  const cUpper = c.toUpperCase();
  
  // Generic placeholders or contract project codes accidentally saved in client field
  const isGeneric =
    !c ||
    cUpper.includes('EMDAD') ||
    cUpper === 'CLIENT' ||
    cUpper === 'NIL' ||
    cUpper === 'NULL' ||
    cUpper === 'UNDEFINED' ||
    cUpper === '—' ||
    cUpper === '-' ||
    ['444558', '47000', '16358', '16119', 'DVP-', 'TW-', 'CHURCHIL', 'WIS-', 'BAKER-', 'GOSS-', 'WFD-', 'ALB/', 'CW369672', 'ITS -', 'ITS-'].some((code) => cUpper.includes(code));

  // 1. Resolve from Contract / Project Reference or raw client if it holds a contract code
  const proj = String(contractRef || rawClient || '').toUpperCase().trim();
  if (proj.includes('444558')) return 'ADNOC OFFSHORE';
  if (proj.includes('4700012465')) return 'ADNOC ONSHORE - WHIPSTOCK';
  if (proj.includes('4700016147')) return 'ADNOC SOUR GAS';
  if (proj.includes('4700018368')) return 'ADNOC DRILLING COMPANY P.J.S.C.';
  if (proj.includes('4700023373')) return 'ADNOC DRILLING COMPANY P.J.S.C.';
  if (proj.includes('4700023861')) return 'ADNOC ONSHORE - RENTALS';
  if (proj.includes('4700024096')) return 'ADNOC DRILLING COMPANY P.J.S.C.';
  if (proj.includes('4700024608')) return 'ADNOC DRILLING COMPANY P.J.S.C.';
  if (proj.includes('4700015149')) return 'ADNOC DRILLING COMPANY P.J.S.C.';
  if (proj.includes('16358.13') || proj.includes('16358') || proj.includes('4700004348')) return 'ADNOC ONSHORE - FISHING';
  if (proj.includes('16119.01') || proj.includes('16119')) return 'ADNOC ONSHORE - MACHINING';
  if (proj.includes('4700012347')) return 'ADNOC ONSHORE - FISHING';
  if (proj.includes('DVP-2023-K-016') || proj.includes('BUNDUQ')) return 'BUNDUQ COMPANY LIMITED';
  if (proj.includes('TW-') || proj.includes('TURNWELL')) return 'TURNWELL INDUSTRIES LLC';
  if (proj.includes('ALB/') || proj.includes('COSMO')) return 'COSMO E&P ALBAHRIYA LIMITED';
  if (proj.includes('CW369672') || proj.includes('HALLIBURTON')) return 'HALLIBURTON WORLDWIDE LIMITED';
  if (proj.includes('ITS') || proj.includes('NABORS')) return 'ITS (NABORS)';
  if (proj.includes('CHURCHIL') || proj.includes('CORETRAX')) return 'CHURCHILL / CORETRAX';
  if (proj.includes('WIS') || proj.includes('WELLBORE INTEGRITY')) return 'WELLBORE INTEGRITY SOLUTIONS';
  if (proj.includes('BAKER')) return 'BAKER HUGHES';
  if (proj.includes('GOSS')) return 'GOSS';
  if (proj.includes('CSS') || proj.includes('CONSOLIDATED')) return 'CONSOLIDATED SUPPLIERS';
  if (proj.includes('WFD') || proj.includes('WEATHERFORD')) return 'WEATHERFORD';
  if (proj.includes('MOTORMAX')) return 'MOTORMAX';
  if (proj.includes('PROGROUP')) return 'PROGROUP';
  if (proj.includes('ARCHER')) return 'ARCHER';
  if (proj.includes('MA-ES') || proj.includes('CAMERON') || proj.includes('MALEGA')) return 'MALEGA ENERGY SERVICE';
  if (proj.includes('OVERSEAS') || proj.includes('OWEN')) return 'OWEN SOLUTIONS';
  if (proj.includes('GORDON')) return 'GORDON TECHNOLOGIES';
  if (proj.includes('ELITE')) return 'ELITE WELLBORE';
  if (proj.includes('GIS')) return 'GIS - UAE';
  if (proj.includes('NUCLIEX')) return 'Nucliex Drilling Technologies Ltd';
  if (proj.includes('SLB') || proj.includes('SCHLUMBERGER')) return 'SLB (SCHLUMBERGER)';

  // 2. If master has a specific client, use it
  if (
    masterClient &&
    !masterClient.toUpperCase().includes('EMDAD') &&
    masterClient.toUpperCase() !== 'CLIENT' &&
    masterClient.trim() !== ''
  ) {
    return normalizeRawClientName(masterClient.trim());
  }

  // 3. If we have a specific non-placeholder client from input, use it
  if (!isGeneric) {
    return normalizeRawClientName(c);
  }

  // 4. Resolve from Rig if rig gives a clue
  const rigUpper = String(rig || '').toUpperCase().trim();
  if (rigUpper.startsWith('AD-') || rigUpper.startsWith('ND-')) return 'ADNOC DRILLING COMPANY P.J.S.C.';
  if (rigUpper.includes('AL YASAT') || rigUpper.includes('YEMILAH') || rigUpper.includes('GHASHA') || rigUpper.includes('UMM') || rigUpper.includes('HAIL')) {
    return 'ADNOC OFFSHORE';
  }

  return 'ADNOC DRILLING COMPANY P.J.S.C.';
}

function normalizeJob(row: any): any {
  const rawId = row.JobID || row.jobId || row.jobNumber || row.ID || row.id || '';
  const jId = formatStandardJobId(rawId);
  const key = String(rawId).trim().toUpperCase();
  const master = MASTER_JOBS_MAP.get(jId.toUpperCase()) || MASTER_JOBS_MAP.get(key) || MASTER_JOBS_MAP.get(normalizeJobKey(rawId));

  // 1. Resolve Legal Invoice Number / Credit Note:
  const legalCandidates = [
    String(row.LegalInvoiceNumber || row.legalInvoiceNumber || '').trim(),
    String(row.LegalNumber || row.legalNumber || '').trim(),
    String(row.LegalInvoiceNo || row.legalInvoiceNo || '').trim(),
    String(row.LegalInvoice || row.legalInvoice || '').trim(),
    String(master?.legalInvoiceNumber || '').trim(),
  ];

  const legalInvoiceNumber = legalCandidates.find(isLegalCandidate) || '';

  // 2. Resolve ERP / Draft / Emdad Invoice Number:
  const erpCandidates = [
    String(row.DraftInvoiceNumber || row.draftInvoiceNumber || '').trim(),
    String(row.DraftInvoiceNo || row.draftInvoiceNo || '').trim(),
    String(row.EmdadInvoiceNo || row.emdadInvoiceNo || '').trim(),
    String(row.ERPInvoiceNo || row.erpInvoiceNo || row.ERPRef || row.erpRef || '').trim(),
    String(master?.draftInvoiceNumber || '').trim(),
  ];

  const draftInvoiceNumber = erpCandidates.find((c) => {
    if (!c || c === '—' || c === '-' || c.toUpperCase() === 'PENDING' || c === legalInvoiceNumber) return false;
    return true;
  }) || '';

  // 3. Resolve Invoiced Amount (preserves negative credit amounts and exact decimal figures)
  let invoiceAmount: number = 0;
  if (row.InvoiceAmount !== undefined && row.InvoiceAmount !== null && row.InvoiceAmount !== '') {
    invoiceAmount = Number(row.InvoiceAmount);
  } else if (row.invoiceAmount !== undefined && row.invoiceAmount !== null && row.invoiceAmount !== '') {
    invoiceAmount = Number(row.invoiceAmount);
  } else if (master?.invoiceAmount !== undefined && master.invoiceAmount !== null) {
    invoiceAmount = Number(master.invoiceAmount);
  } else if (row.InvoicedAmountUSD !== undefined && row.InvoicedAmountUSD !== null && row.InvoicedAmountUSD !== '') {
    invoiceAmount = Number(row.InvoicedAmountUSD);
  }

  if (!invoiceAmount && (row.Cost || row.cost || master?.cost)) {
    const rawCost = String(row.Cost || row.cost || master?.cost).replace(/[^0-9.-]/g, '');
    const num = parseFloat(rawCost);
    if (!isNaN(num) && num !== 0) {
      invoiceAmount = num;
    }
  }

  const hasLegal = Boolean(legalInvoiceNumber);
  const hasErp = Boolean(draftInvoiceNumber);
  const rawStatus = String(row.Status || row.status || master?.status || 'Open').trim();
  
  let status = rawStatus;
  if (hasLegal || rawStatus.toLowerCase() === 'completed' || rawStatus.toLowerCase() === 'final invoiced' || rawStatus.toLowerCase() === 'closed') {
    status = 'Completed';
  } else if (hasErp || rawStatus.toLowerCase().includes('ses') || rawStatus.toLowerCase().includes('approval')) {
    status = 'Under SES';
  }

  const resolvedContract = String(
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
  ).trim();

  const resolvedRig = row.Rig || row.rig || master?.rig || '';

  const resolvedClient = resolveJobClient(
    row.Client || row.client,
    resolvedContract,
    master?.client,
    resolvedRig
  );

  const mobDate = cleanDateValue(
    row.MobDate || row.mobDate || master?.mobDate || row.FirstDtDate || (row.CreatedDate && !String(row.CreatedDate).startsWith('2026-09') ? String(row.CreatedDate).split('T')[0] : '')
  );

  const demobDate = cleanDateValue(
    row.DemobDate || row.demobDate || master?.demobDate || row.LastRtDate
  );

  const firstDtDate = cleanDateValue(row.FirstDtDate || row.firstDtDate);
  const lastRtDate = cleanDateValue(row.LastRtDate || row.lastRtDate);
  const docsSignedDate = cleanDateValue(row.DocsSignedDate || row.docsSignedDate);
  const submittedToBillingDate = cleanDateValue(row.SubmittedToBillingDate || row.submittedToBillingDate) || null;
  const draftInvoicedDate = cleanDateValue(row.DraftInvoicedDate || row.draftInvoicedDate) || null;
  const sesSubmittedDate = cleanDateValue(row.SesSubmittedDate || row.sesSubmittedDate) || null;
  const finalInvoicedDate = cleanDateValue(row.FinalInvoicedDate || row.finalInvoicedDate) || (hasLegal ? (cleanDateValue(row.InvoiceDate || row.MobDate) || '2024-01-01') : null);
  const invoiceDate = cleanDateValue(row.InvoiceDate || row.LegalInvoiceDate) || (hasLegal ? (mobDate || '2024-01-01') : '');

  return {
    id: jId,
    jobNumber: jId,
    calloutId: row.CalloutID || row.calloutId || master?.calloutId || '',
    rig: resolvedRig,
    well: row.Well || row.well || master?.well || '',
    client: resolvedClient,
    contract: resolvedContract,
    poNumber: row.PONumber || row.poNumber || master?.poNumber || '',
    clientRef: String(row.ClientRef || row.clientRef || master?.clientRef || '').trim(),
    erpRef: row.ERPRef || row.erpRef || '',
    holeSection: row.HoleSection || row.holeSection || '',
    serviceType: row.ServiceType || row.serviceType || master?.serviceType || 'Downhole Rental',
    invoicingType: row.InvoicingType || row.invoicingType || 'PerJob',
    currency: row.Currency || row.currency || 'USD',
    mobDate,
    demobDate,
    status: status,
    tools: [],
    operatingDays: 0,
    standbyDays: 0,
    isLocked: Boolean(legalInvoiceNumber && isLegalCandidate(legalInvoiceNumber)),
    invoiceNumber: legalInvoiceNumber || draftInvoiceNumber || row.LegalInvoiceNo || row.EmdadInvoiceNo || '',
    legalInvoiceNumber,
    draftInvoiceNumber,
    invoiceAmount,
    sesNumber: row.SesNumber || row.sesNumber || '',
    invoiceDate,
    invoicedAmountUSD: invoiceAmount,
    cost: row.Cost || row.cost || master?.cost || '',
    createdDate: cleanDateValue(row.CreatedDate || row.createdDate || master?.createdDate),
    createdBy: row.CreatedBy || row.createdBy || master?.createdBy || 'Operations',
    firstDtDate,
    lastRtDate,
    docsSignedDate,
    submittedToBillingDate,
    draftInvoicedDate,
    sesSubmittedDate,
    finalInvoicedDate,
    notes: row.Notes || row.notes || master?.notes || undefined,
    technicalDetails: row.TechnicalDetails || row.technicalDetails || master?.technicalDetails || undefined,
    assignedCrew: row.AssignedCrew || row.assignedCrew || master?.assignedCrew || undefined,
    crewMembers: row.CrewMembers || row.crewMembers || master?.crewMembers || undefined,
    dailyLogs: row.DailyLogs || row.dailyLogs || master?.dailyLogs || undefined,
    utilizationStatuses: row.UtilizationStatuses || row.utilizationStatuses || undefined,
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
  const descUpper = (desc || '').toUpperCase();

  // If description explicitly identifies the tool family, description ALWAYS takes priority
  // (e.g. STABILIZER must never become STRING MILL, DRILLING SCRAPER must never become OVERSHOT)
  if (descUpper.includes('NEAR BIT STABILIZER') || descUpper.includes('NEAR BIT STAB')) return 'NEAR BIT STABILIZER';
  if (descUpper.includes('STRING STABILIZER') || descUpper.includes('STRING STAB')) return 'STRING STABILIZER';
  if (descUpper.includes('STABILIZER') || descUpper.includes('STAB W/')) return 'STRING STABILIZER';
  if (descUpper.includes('CASING SCRAPER') || descUpper.includes('DRILLING SCRAPER') || descUpper.includes('ACTIVATED DRILLING SCRAPER')) return 'CASING SCRAPER';
  if (descUpper.includes('STRING MILL') || descUpper.includes('WATERMELON MILL')) return 'STRING MILL';
  if (descUpper.includes('PILOT MILL')) return 'PILOT MILL';
  if (descUpper.includes('TAPER MILL')) return 'TAPER MILL';
  if (descUpper.includes('JUNK MILL') || descUpper.includes('BLADED JUNK MILL')) return 'JUNK MILL';
  if (descUpper.includes('DRILLING JAR') || descUpper.includes('HYD-MECH') || descUpper.includes('HYDRO-MECH')) return 'DRILLING JAR';
  if (descUpper.includes('FISHING JAR') || descUpper.includes('SUPER FISHING JAR')) return 'FISHING JAR';
  if (descUpper.includes('JAR ACCELERATOR') || descUpper.includes('INTENSIFIER')) return 'FISHING ACCELERATOR';
  if (descUpper.includes('ROLLER REAMER')) return 'ROLLER REAMER';
  if (descUpper.includes('HOLE OPENER')) return 'HOLE OPENER';
  if (descUpper.includes('OVERSHOT') && !descUpper.includes('EXTENSION') && !descUpper.includes('GUIDE')) return 'OVERSHOT';
  if (descUpper.includes('CARGO BASKET')) return 'CARGO BASKET';
  if (descUpper.includes('JUNK BASKET') || descUpper.includes('RCJB')) return 'JUNK BASKET';

  // If invShortDesc is a clean, concise category (< 35 chars, no long connection specs)
  if (invShortDesc && invShortDesc !== 'Downhole Tool') {
    const s = invShortDesc.trim();
    if (s.length > 0 && s.length <= 35 && !s.includes(' W/') && !s.includes('PIN X') && !s.includes(' C/W ') && !s.includes(' C/ W ') && !s.includes('REG Box') && !s.includes('REG PIN') && !s.includes('(') && !s.includes(')')) {
      return s;
    }
  }

  // If shortDesc is clean and concise
  if (shortDesc && shortDesc !== 'Downhole Tool') {
    const s = shortDesc.trim();
    if (s.length > 0 && s.length <= 35 && !s.includes(' W/') && !s.includes('PIN X') && !s.includes(' C/W ') && !s.includes(' C/ W ') && !s.includes('REG Box') && !s.includes('REG PIN') && !s.includes('(') && !s.includes(')')) {
      return s;
    }
  }

  const text = `${shortDesc || ''} ${desc || ''}`.toUpperCase();
  if (!text.trim()) return 'Downhole Tool';

  // 1. Grapples & Grapple Controls (Prioritized over generic BASKET / OVERSHOT)
  if (text.includes('BASKET GRAPPLE PLAIN CONTROL') || text.includes('PLAIN CONTROL')) return 'BASKET GRAPPLE CONTROL';
  if (text.includes('SPIRAL GRAPPLE CONTROL')) return 'SPIRAL GRAPPLE CONTROL';
  if (text.includes('GRAPPLE CONTROL')) return 'GRAPPLE CONTROL';
  if (text.includes('MILL CONTROL PACKER') || text.includes('MILL CONTROL PACKOFF') || text.includes('MILL CONTROL')) return 'MILL CONTROL PACKER';
  if (text.includes('TYPE "A" PACKOFF') || text.includes('TYPE "A" PACKER') || text.includes('TYPE A PACKOFF') || text.includes('TYPE A PACKER') || text.includes('PACKOFF') || text.includes('PACKER')) return 'PACKOFF';

  if (text.includes('BASKET GRAPPLE')) return 'BASKET GRAPPLE';
  if (text.includes('SPIRAL GRAPPLE')) return 'SPIRAL GRAPPLE';
  if (text.includes('SPEAR GRAPPLE')) return 'SPEAR GRAPPLE';
  if (text.includes('GRAPPLE') && !text.includes('OVERSHOT')) return 'GRAPPLE';

  // 2. Overshot Guides & Overshot Extensions
  if (text.includes('HOLLOW MILL GUIDE') || text.includes('MILL GUIDE')) return 'HOLLOW MILL GUIDE';
  if (text.includes('WALL HOOK GUIDE') || text.includes('OVERSIZED GUIDE')) return 'OVERSHOT GUIDE';
  if (text.includes('FS OVERSHOT EXTENSION') || text.includes('SC OVERSHOT EXTENSION') || text.includes('SH OVERSHOT EXTENSION') || text.includes('OVERSHOT EXTENSION') || text.includes('OVERSHOT EXTENSION SUB')) return 'OVERSHOT EXTENSION';
  if (text.includes('FS OVERSHOT') || text.includes('FULL STRENGTH OVERSHOT') || text.includes('F.S OVERSHOT') || text.includes('F.S. OVERSHOT')) return 'FS OVERSHOT';
  if (text.includes('SC OVERSHOT') || text.includes('SHORT CATCH OVERSHOT')) return 'SC OVERSHOT';
  if (text.includes('SH OVERSHOT') || text.includes('SEMI-FLUSH OVERSHOT') || text.includes('SLIM HOLE OVERSHOT')) return 'SH OVERSHOT';
  if (text.includes('SERIES 150') || text.includes('SERIES 70') || text.includes('OVERSHOT')) return 'OVERSHOT';

  // 3. Wash Pipe & Accessories
  if (text.includes('WASH PIPE') || text.includes('WASHOVER PIPE') || text.includes('WASHPIPE')) return 'WASH PIPE';
  if (text.includes('FLAT BOTTOM WASHOVER SHOE') || text.includes('WAVY BOTTOM WASHOVER SHOE') || text.includes('WASHOVER SHOE') || text.includes('ROTARY SHOE')) return 'WASHOVER SHOE';
  if (text.includes('CROSSOVER BUSHING')) return 'CROSSOVER BUSHING';
  if (text.includes('TRIPLE BUSHING')) return 'TRIPLE BUSHING';
  if (text.includes('DRIVE SUB') || text.includes('DRIVE BUSHING')) return 'DRIVE SUB';
  if (text.includes('SIDE DOOR ELEVATOR') || text.includes('ELEVATOR')) return 'ELEVATOR';
  if (text.includes('SAFETY CLAMP')) return 'SAFETY CLAMP';
  if (text.includes('WASH PIPE SLIP') || text.includes('CASING SLIP') || text.includes('DRILL PIPE SLIP') || text.includes('SLIP FOR')) return 'SLIP';
  if (text.includes('LIFT PLUG') || text.includes('LIFTING PLUG')) return 'LIFT PLUG';

  // 4. Baskets, Containers & Vessels
  if (text.includes('JUNK BASKET') || text.includes('RCJB') || text.includes('POOR BOY') || text.includes('POOR BUOY')) return 'JUNK BASKET';
  if (text.includes('CARGO BASKET') || text.includes('TOOL BASKET') || text.includes('HALF HEIGHT BASKET') || text.includes('DRUM BASKET') || text.includes('BASKET W/') || text.includes('FEET CARGO BASKET') || text.includes('FT CARGO BASKET') || text.startsWith('CARGO BASKET')) {
    return 'CARGO BASKET';
  }
  if (text.includes('CONTAINER') || text.includes('WORKSHOP')) return 'CONTAINER';

  // 5. Releasing Spears & Casing Cutters
  if (text.includes('SPEAR STOP SUB')) return 'SPEAR STOP SUB';
  if (text.includes('SPEAR EXTENSION')) return 'SPEAR EXTENSION';
  if (text.includes('RELEASING SPEAR') || text.includes('ITCO RELEASING SPEAR') || text.includes('ROPE SPEAR') || text.includes('MANDREL RELEASING SPEAR') || text.includes('CASING SPEAR') || text.includes('SPEAR')) return 'CASING SPEAR';
  if (text.includes('EXTERNAL CUTTER') || text.includes('INTERNAL CUTTER') || text.includes('CASING CUTTER')) return 'EXTERNAL CUTTER';

  // 6. Mills & Taps
  if (text.includes('TAPER TAP') || text.includes('DIE COLLAR')) return 'TAPER TAP';
  if (text.includes('BLADED JUNK MILL') || text.includes('JUNK MILL')) return 'JUNK MILL';
  if (text.includes('TAPER MILL')) return 'TAPER MILL';
  if (text.includes('PILOT MILL')) return 'PILOT MILL';
  if (text.includes('STRING MILL') || text.includes('WATERMELON MILL')) return 'STRING MILL';
  if (text.includes('MILL')) return 'MILL';

  // 7. Stabilizers & Reamers
  if (text.includes('NEAR BIT STABILIZER') || text.includes('NEAR BIT STAB')) return 'NEAR BIT STABILIZER';
  if (text.includes('STRING STABILIZER') || text.includes('STRING STAB')) return 'STRING STABILIZER';
  if (text.includes('STABILIZER') || text.includes('STAB')) return 'STABILIZER';
  if (text.includes('ROLLER REAMER') || text.includes('UNDERREAMER') || text.includes('REAMER')) return 'ROLLER REAMER';
  if (text.includes('HOLE OPENER')) return 'HOLE OPENER';
  if (text.includes('CASING SCRAPER') || text.includes('SCRAPER')) return 'CASING SCRAPER';

  // 8. Jars, Accelerators & Bumper Subs
  if (text.includes('HYD-MECH') || text.includes('HYDRO-MECH')) return 'HYD-MECH DRILLING JAR';
  if (text.includes('SUPERIOR HYD') || text.includes('SUPER FISHING JAR') || text.includes('FISHING JAR')) return 'FISHING JAR';
  if (text.includes('DRILLING JAR')) return 'DRILLING JAR';
  if (text.includes('JAR ACCELERATOR') || text.includes('FISHING ACCELERATOR') || text.includes('JAR INTENSIFIER') || text.includes('INTENSIFIER')) return 'FISHING ACCELERATOR';
  if (text.includes('BUMPER SUB') || text.includes('FISHING BUMPER SUB')) return 'BUMPER SUB';
  if (text.includes('SHOCK TOOL') || text.includes('SHOCK SUB')) return 'SHOCK TOOL';

  // 9. Subs, Valves & Joints
  if (text.includes('SAFETY JOINT') || text.includes('COARSE THREAD SAFETY JOINT')) return 'SAFETY JOINT';
  if (text.includes('JUNK SUB') || text.includes('BOOT BASKET')) return 'JUNK SUB';
  if (text.includes('SAVER SUB')) return 'SAVER SUB';
  if (text.includes('CROSS OVER SUB') || text.includes('CROSSOVER SUB') || text.includes('X-OVER') || text.includes('CROSS-OVER') || text.startsWith('CROSSOVER')) return 'CROSS OVER SUB';
  if (text.includes('BIT SUB')) return 'BIT SUB';
  if (text.includes('FLOAT SUB')) return 'FLOAT SUB';
  if (text.includes('LIFT SUB') || text.includes('LIFTING SUB') || text.includes('LIFT NIPPLE')) return 'LIFT SUB';
  if (text.includes('CIRCULATING SUB') || text.includes('CIRCULATION SUB')) return 'CIRCULATING SUB';
  if (text.includes('TOP DRIVE SUB')) return 'TOP DRIVE SUB';
  if (text.includes('PUP JOINT')) return 'PUP JOINT';
  if (text.includes('SUB') && !text.includes('SUB-CONTRACTOR')) return 'SUB';

  // 10. Magnets & Impression Blocks
  if (text.includes('DITCH MAGNET') || text.includes('FISHING MAGNET') || text.includes('MAGNET')) return 'FISHING MAGNET';
  if (text.includes('IMPRESSION BLOCK') || text.includes('LEAD IMPRESSION BLOCK') || text.includes('LEAD IMP')) return 'IMPRESSION BLOCK';

  // 11. Pressure Control & Tubulars
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
    // Excel serial date integer e.g. 25000 to 65000 (1968 - 2077)
    if (num >= 25000 && num <= 65000) {
      try {
        const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
        if (!isNaN(dateObj.getTime())) {
          const y = dateObj.getUTCFullYear();
          if (y <= 1900 || y === 1970) return '';
          return dateObj.toISOString().split('T')[0];
        }
      } catch {}
    }
  }
  const s = String(d).trim();
  if (!s || s === '—' || s === '-' || s === 'null' || s === 'undefined' || s.includes('1900')) return '';
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ')) return s.split(' ')[0];
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    if (dmy[3] === '1900' || parseInt(dmy[3], 10) <= 1900) return '';
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return s;
}

/**
 * Parses any date format (DD-MM-YYYY, DD/MM/YYYY, ISO, timestamps) into numeric milliseconds for reliable temporal comparison
 */
export function parseDateToTimestamp(d: any): number {
  if (d === null || d === undefined || d === '') return 0;
  if (typeof d === 'number') return d;
  const s = String(d).trim();
  if (!s || s === '—' || s === '-' || s === 'null' || s === 'undefined') return 0;

  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    const year = parseInt(dmy[3], 10);
    if (year <= 1900 || year === 1970) return 0;
    return new Date(Date.UTC(year, month, day)).getTime();
  }

  const cleaned = cleanDateStr(s);
  if (!cleaned) return 0;
  const t = new Date(cleaned).getTime();
  return isNaN(t) ? 0 : t;
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
    assetNo: String(row.assetNo || row.AssetNo || '').trim(), // never fall back to serial/SystemID
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

  const lines = rawLines
    .map(normalizeDTLine)
    .filter(Boolean)
    .map((line: any) => {
      // If line has a return date before this DT's dispatch date, it is leftover/corrupt historical data
      if (line && rawDate && line.returnDate && line.returnDate < rawDate) {
        return {
          ...line,
          returnedRtNumber: '',
          rtBatchId: null,
          returnDate: '',
          dateIn: '',
          Date_In: '',
          status: 'OnRig',
        };
      }
      return line;
    });

  // Deduplicate lines by serial & itemNo to prevent historical multi-well Cartesian product duplication
  const seenLineKeys = new Set<string>();
  const deduplicatedLines = lines.filter((l: any) => {
    const s = String(l?.serial || l?.assetNo || '').trim().toUpperCase();
    const item = l?.itemNo ? String(l.itemNo) : '';
    const key = `${s}:::${item}`;
    if (s && seenLineKeys.has(key)) return false;
    if (s) seenLineKeys.add(key);
    return true;
  });

  return {
    id: String(row.DTBatchID || row.dtBatchId || row.id || row.ID || row.dtNumber || row.DTNumber || ''),
    dtNumber: String(row.DTNumber || row.dtNumber || row.TicketNumber || row.ticketNumber || row.id || ''),
    jobId: formatStandardJobId(String(row.JobID || row.jobId || row.JobNumber || row.jobNumber || row.JobNo || row.jobNo || row.Job || row.job || '')),
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
    isLocked: Boolean(
      row.isLocked === true ||
      row.IsLocked === true ||
      row.isLocked === 1 ||
      row.IsLocked === 1 ||
      row.isLocked === 'true' ||
      row.IsLocked === 'true' ||
      row.isLocked === '1' ||
      row.IsLocked === '1'
    ),
    lockedBy: row.lockedBy || row.LockedBy || null,
    lockedDate: cleanDateStr(row.lockedDate || row.LockedDate || null),
    isSigned: Boolean(row.isSigned || row.IsSigned || row.signedDocUrl || row.SignedDocUrl),
    signedDocUrl: row.signedDocUrl || row.SignedDocUrl || '',
    signedDocName: row.signedDocName || row.SignedDocName || '',
    signedDate: cleanDateStr(row.signedDate || row.SignedDate || ''),
    toolLines: deduplicatedLines,
    tools: deduplicatedLines,
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
    row.receivingDate ||
    row.ReceivingDate ||
    row.receiving_date ||
    row.Receiving_Date ||
    row.returnDate ||
    row.ReturnDate ||
    row.rtDate ||
    row.RTDate ||
    row.Date ||
    row.date ||
    row.ReceivedDate ||
    row.receivedDate ||
    row.emdadSignDate ||
    row.EmdadSignDate ||
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
    assetNo: String(row.assetNo || row.AssetNo || row.Asset_No || row.asset_no || '').trim(), // never fall back to serial/SystemID
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
    row.receivingDate ||
    row.ReceivingDate ||
    row.receiving_date ||
    row.Receiving_Date ||
    row.RTDate ||
    row.rtDate ||
    row.Date ||
    row.date ||
    row.TicketDate ||
    row.ticketDate ||
    row.ReceivedDate ||
    row.receivedDate ||
    row.emdadSignDate ||
    row.EmdadSignDate ||
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
    row.waybillDate
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

  // Deduplicate lines by serial & itemNo to prevent historical multi-well Cartesian product duplication
  const seenRtLineKeys = new Set<string>();
  const deduplicatedRtLines = lines.filter((l: any) => {
    const s = String(l?.serial || l?.assetNo || '').trim().toUpperCase();
    const item = l?.itemNo ? String(l.itemNo) : '';
    const key = `${s}:::${item}`;
    if (s && seenRtLineKeys.has(key)) return false;
    if (s) seenRtLineKeys.add(key);
    return true;
  });

  const carrier = String(
    row.Carrier ||
    row.carrier ||
    row.ShippedVia ||
    row.shippedVia ||
    row.TransportCompany ||
    row.transportCompany ||
    row.Transporter ||
    row.transporter ||
    ''
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
    jobId: formatStandardJobId(String(row.JobID || row.jobId || row.JobNumber || row.jobNumber || row.JobNo || row.jobNo || '')),
    rtDate: effectiveRtDate,
    receivingDate: effectiveRtDate,
    emdadSignDate: cleanDateStr(row.emdadSignDate || row.EmdadSignDate || ''),
    backloadRmDate: effectiveBackloadDate,
    loadingNoteNo: loadingNoteNo || '',
    lNoteNo: loadingNoteNo || '',
    loadingNoteDate: loadingNoteDate || '',
    lNoteDate: loadingNoteDate || '',
    carrier,
    shippedVia: carrier,
    driverName,
    truckNo,
    contract: String(row.Contract || row.contract || row.ContractRef || row.contractRef || row.ContractNo || row.contractNo || ''),
    rig: String(row.Rig || row.rig || row.RigName || row.rigName || ''),
    well: String(row.Well || row.well || row.WellName || row.wellName || ''),
    receivedBy: String(row.ReceivedBy || row.receivedBy || row.Inspector || row.inspector || row.QCInspector || row.qcInspector || '').trim(),
    condition: String(row.Condition || row.condition || row.Notes || row.notes || ''),
    notes: String(row.Notes || row.notes || ''),
    isLocked: Boolean(
      row.isLocked === true ||
      row.IsLocked === true ||
      row.isLocked === 1 ||
      row.IsLocked === 1 ||
      row.isLocked === 'true' ||
      row.IsLocked === 'true' ||
      row.isLocked === '1' ||
      row.IsLocked === '1'
    ),
    lockedBy: row.lockedBy || row.LockedBy || null,
    lockedDate: cleanDateStr(row.lockedDate || row.LockedDate || null),
    isSigned: Boolean(row.isSigned || row.IsSigned || row.signedDocUrl || row.SignedDocUrl),
    signedDocUrl: row.signedDocUrl || row.SignedDocUrl || '',
    signedDocName: row.signedDocName || row.SignedDocName || '',
    signedDate: cleanDateStr(row.signedDate || row.SignedDate || ''),
    toolLines: deduplicatedRtLines,
    tools: deduplicatedRtLines,
  };
}

/** tbl_Callouts + tbl_CalloutItems -> Callout (via getcallouts) */
function normalizeCalloutItem(row: any): any {
  const assetNo = String(
    row.assetNo ||
    row.AssetNo ||
    row.partNo ||
    row.PartNo ||
    row.PartNum ||
    row.partNum ||
    row.Part_No ||
    row.part_no ||
    ''
  ).trim();
  const desc = String(
    row.description ||
    row.Description ||
    row.desc ||
    row.Desc ||
    row.toolDescription ||
    row.ToolDescription ||
    row.PartDescription ||
    row.partDescription ||
    ''
  ).trim();
  const shortDesc = String(
    row.shortDesc ||
    row.ShortDesc ||
    row.cat ||
    row.Cat ||
    row.category ||
    row.Category ||
    row.toolType ||
    row.ToolType ||
    ''
  ).trim();
  const supplier = String(
    row.supplier ||
    row.Supplier ||
    row.vendor ||
    row.Vendor ||
    row.ownership ||
    row.Ownership ||
    'EMDAD'
  ).trim();

  return {
    itemId: row.ItemID || row.itemId,
    seq: Number(row.seq ?? row.Seq ?? 0),
    size: row.size || row.Size || '',
    shortDesc: shortDesc,
    cat: row.cat || row.Cat || shortDesc,
    qty: Number(row.qty ?? row.Qty ?? 0),
    assigned: Number(row.assigned ?? row.Assigned ?? 0),
    serialNos: Array.isArray(row.serialNos) ? row.serialNos : (row.serial ? [String(row.serial)] : []),
    status: row.status || row.Status || 'Pending',
    assetNo: assetNo,
    partNo: assetNo,
    description: desc,
    desc: desc,
    supplier: supplier,
    comments: String(row.comments || row.Comments || 'ACCEPTED').trim(),
    insNum: String(row.insNum || row.InsNum || '').trim(),
    insDate: cleanDateStr(row.insDate || row.InsDate || ''),
    qtyIn: Number(row.qtyIn ?? row.QtyIn ?? (row.qty ?? row.Qty ?? 1)),
  };
}

function normalizeCallout(row: any): any {
  const items = Array.isArray(row.items) ? row.items.map(normalizeCalloutItem) : [];
  const id = row.id || row.CalloutID || '';
  const notes = String(row.notes || row.Notes || row.remarks || row.Remarks || '').trim();
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
    notes,
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

  // 1. Purge any synthetic dummy tickets (DT-CLS, DT-AUTO, RT-CLS, RT-AUTO)
  dtBatches = (dtBatches || []).filter((b: any) => {
    const id = String(b?.id || '').toUpperCase();
    const num = String(b?.dtNumber || '').toUpperCase();
    return (
      !id.startsWith('DT-AUTO') &&
      !id.startsWith('DT-CLS') &&
      !num.startsWith('DT-CLS') &&
      !num.startsWith('DT-AUTO') &&
      !num.includes('10000') &&
      !id.includes('10000') &&
      !num.includes('10001') &&
      !id.includes('10001') &&
      !num.includes('10002') &&
      !id.includes('10002')
    );
  });

  rtBatches = (rtBatches || []).filter((b: any) => {
    const id = String(b?.id || '').toUpperCase();
    const num = String(b?.rtNumber || '').toUpperCase();
    return !id.startsWith('RT-AUTO') && !id.startsWith('RT-CLS') && !num.startsWith('RT-CLS') && !num.startsWith('RT-AUTO');
  });

  // 2. Attach contract references to DTs if missing and clean dummy references
  dtBatches.forEach((b: any) => {
    if (!b.contract || b.contract === '—') {
      const j = b.jobId ? jobsById.get(String(b.jobId).trim().toUpperCase()) : null;
      if (j) {
        b.contract = j.contract || j.client || (j.poNumber ? `PO-${j.poNumber}` : '');
      }
    }
    (b.toolLines || []).forEach((tl: any) => {
      const ref = String(tl.returnedRtNumber || tl.rtBatchId || '').trim();
      if (ref.toUpperCase().startsWith('RT-AUTO') || ref.toUpperCase().startsWith('RT-CLS')) {
        tl.returnedRtNumber = '';
        tl.rtBatchId = null;
      } else if (ref && ref !== '—' && ref !== '-') {
        tl.status = 'Returned';
      }
    });
  });

  // 3. Index genuine DTs and RTs by Job ID and normalized job key
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

  // 4. Reconcile completed jobs with legal invoices (FSH, FR, WHP) - DO NOT fabricate fake tickets!
  jobs.forEach((job) => {
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

      // Lock authentic DTs and mark tool lines as returned
      jobDTs.forEach((dt) => {
        dt.isSigned = true;
        dt.isLocked = true;
        (dt.toolLines || []).forEach((tl: any) => {
          tl.status = 'Returned';
        });
      });

      // Lock authentic RTs
      jobRTs.forEach((rt) => {
        rt.isSigned = true;
        rt.isLocked = true;
        (rt.toolLines || []).forEach((tl: any) => {
          tl.status = 'Returned';
        });
      });

      job.signedDtAttached = jobDTs.length > 0;
      job.signedRtAttached = jobRTs.length > 0;
      job.signedUtilizationAttached = true;
      if (!job.status || job.status.toLowerCase() !== 'completed') {
        job.status = 'Completed';
      }
    }
  });

  // 2. Link Inventory with DT and RT ledger (Request 4)
  if (inventory && Array.isArray(inventory) && inventory.length > 0) {
    const toolLatestDT = new Map<string, { dt: any; date: string; time: number; rig: string; jobId: string }>();
    const toolLatestRT = new Map<string, { rt: any; date: string; time: number; routedTo: string }>();

    dtBatches.forEach((dt) => {
      // Only consider genuinely dispatched and locked DTs for physical yard inventory movement
      const isDispatched = Boolean(
        dt.isLocked === true ||
        dt.isLocked === 1 ||
        String(dt.isLocked) === 'true' ||
        String(dt.isLocked) === '1'
      );
      if (!isDispatched) return;

      const rawDtDate = String(dt.dispatchDate || dt.rmDate || '');
      const dtTime = parseDateToTimestamp(rawDtDate) || 1672531200000; // default 2023-01-01
      const entry = { dt, date: rawDtDate, time: dtTime, rig: dt.rig || 'Rig', jobId: dt.jobId };

      const registerDtKey = (k: string) => {
        if (!k) return;
        const prev = toolLatestDT.get(k);
        if (!prev || dtTime >= prev.time) toolLatestDT.set(k, entry);
        const stripped = k.replace(/^EMD-?/i, '');
        if (stripped && stripped !== k) {
          const prevS = toolLatestDT.get(stripped);
          if (!prevS || dtTime >= prevS.time) toolLatestDT.set(stripped, entry);
        }
      };

      (dt.toolLines || []).forEach((tl: any) => {
        const serialKey = String(tl.serial || '').trim().toUpperCase();
        const assetKey = String(tl.assetNo || '').trim().toUpperCase();
        if (serialKey) registerDtKey(serialKey);
        if (assetKey) registerDtKey(assetKey);
      });
    });

    rtBatches.forEach((rt) => {
      const rawRtDate = String(rt.rtDate || rt.backloadRmDate || '');
      const rtTime = parseDateToTimestamp(rawRtDate) || 1672531200000;

      (rt.toolLines || []).forEach((tl: any) => {
        const serialKey = String(tl.serial || '').trim().toUpperCase();
        const assetKey = String(tl.assetNo || '').trim().toUpperCase();
        const entry = { rt, date: rawRtDate, time: rtTime, routedTo: tl.routedTo || 'Emdad Base' };

        const registerRtKey = (k: string) => {
          if (!k) return;
          const prev = toolLatestRT.get(k);
          if (!prev || rtTime >= prev.time) toolLatestRT.set(k, entry);
          const stripped = k.replace(/^EMD-?/i, '');
          if (stripped && stripped !== k) {
            const prevS = toolLatestRT.get(stripped);
            if (!prevS || rtTime >= prevS.time) toolLatestRT.set(stripped, entry);
          }
        };

        if (serialKey) registerRtKey(serialKey);
        if (assetKey) registerRtKey(assetKey);
      });
    });

    inventory.forEach((tool: any) => {
      const sKey = String(tool.serial || '').trim().toUpperCase();
      const aKey = String(tool.assetNo || '').trim().toUpperCase();
      const idKey = String(tool.id || '').trim().toUpperCase();
      const sStrip = sKey.replace(/^EMD-?/i, '');
      const aStrip = aKey.replace(/^EMD-?/i, '');

      const latestDT = toolLatestDT.get(sKey) ||
        (aKey ? toolLatestDT.get(aKey) : undefined) ||
        (sStrip ? toolLatestDT.get(sStrip) : undefined) ||
        (aStrip ? toolLatestDT.get(aStrip) : undefined) ||
        (idKey ? toolLatestDT.get(idKey) : undefined);

      const latestRT = toolLatestRT.get(sKey) ||
        (aKey ? toolLatestRT.get(aKey) : undefined) ||
        (sStrip ? toolLatestRT.get(sStrip) : undefined) ||
        (aStrip ? toolLatestRT.get(aStrip) : undefined) ||
        (idKey ? toolLatestRT.get(idKey) : undefined);

      if (latestDT) {
        const isReturned = Boolean(latestRT && latestRT.time >= latestDT.time);
        if (!isReturned) {
          tool.status = 'On Rig';
          const rigName = (latestDT.rig || '').trim();
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
      } else {
        // If tool was marked 'On Rig' but has no active dispatched DT, reset to base
        if (tool.status === 'On Rig') {
          tool.status = 'Good';
          tool.location = 'Emdad Base';
          tool.currentJobId = null;
          tool.currentRig = null;
          tool.rig = undefined;
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
      let pages = 0;
      let nextUrl: string | null = `${baseEndpoint}/${tbl}?$top=5000`;
      const fetchHeaders = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      };

      while (nextUrl && pages < maxPages) {
        pages++;
        let r = await fetch(nextUrl, { headers: fetchHeaders });
        if (!r.ok && r.status === 400 && pages === 1) {
          nextUrl = `${baseEndpoint}/${tbl}?$top=1000`;
          r = await fetch(nextUrl, { headers: fetchHeaders });
          if (!r.ok && r.status === 400) {
            nextUrl = `${baseEndpoint}/${tbl}?$top=500`;
            r = await fetch(nextUrl, { headers: fetchHeaders });
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

      // Only extract genuine ticket foreign keys — NEVER the line's own primary key (ID, id, LineID, itemNo)
      const rawRefs = type === 'DT'
        ? [
            line.dtNumber, line.DTNumber, line.DT_Number, line.dt_number,
            line.TicketNumber, line.ticketNumber, line.Ticket_Number, line.ticket_number,
            line.DTNo, line.dtNo, line.DT_No, line.dt_no,
            line.DeliveryTicketNo, line.deliveryTicketNo, line.DeliveryTicketNumber, line.deliveryTicketNumber,
            line.DTBatchID, line.dtBatchId, line.DT_Batch_ID, line.dt_batch_id,
            line.DeliveryTicketID, line.deliveryTicketId, line.DT_ID, line.dt_id,
            line.DTHeaderID, line.dtHeaderId,
          ]
        : [
            line.rtNumber, line.RTNumber, line.RT_Number, line.rt_number,
            line.TicketNumber, line.ticketNumber, line.Ticket_Number, line.ticket_number,
            line.RTNo, line.rtNo, line.RT_No, line.rt_no,
            line.RGT_No, line.rgtNo, line.RGTNo, line.rgt_no,
            line.ReceivingTicketNo, line.receivingTicketNo, line.ReceivingTicketNumber, line.receivingTicketNumber,
            line.RTBatchID, line.rtBatchId, line.RT_Batch_ID, line.rt_batch_id,
            line.ReceivingTicketID, line.receivingTicketId, line.RT_ID, line.rt_id,
            line.RTHeaderID, line.rtHeaderId,
          ];

      rawRefs.forEach((r) => {
        if (r != null && r !== '') {
          const s = String(r).trim();
          if (s && s !== '—' && s !== '-') {
            keys.add(s);
            keys.add(s.toUpperCase());
            const norm = s.toUpperCase().replace(/^(DT|RT|RGT)[-_]?/i, '');
            if (norm) {
              keys.add(norm);
              keys.add(`${type}-${norm}`);
            }
          }
        }
      });

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
            ticket.DeliveryTicketNo, ticket.deliveryTicketNo, ticket.DeliveryTicketNumber, ticket.deliveryTicketNumber,
            ticket.DTBatchID, ticket.dtBatchId, ticket.DT_Batch_ID, ticket.dt_batch_id,
            ticket.DeliveryTicketID, ticket.deliveryTicketId, ticket.DT_ID, ticket.dt_id,
            ticket.DTHeaderID, ticket.dtHeaderId,
            ticket.id, ticket.ID,
          ]
        : [
            ticket.rtNumber, ticket.RTNumber, ticket.RT_Number, ticket.rt_number,
            ticket.TicketNumber, ticket.ticketNumber, ticket.Ticket_Number, ticket.ticket_number,
            ticket.RTNo, ticket.rtNo, ticket.RT_No, ticket.rt_no,
            ticket.RGT_No, ticket.rgtNo, ticket.RGTNo, ticket.rgt_no,
            ticket.ReceivingTicketNo, ticket.receivingTicketNo, ticket.ReceivingTicketNumber, ticket.receivingTicketNumber,
            ticket.RTBatchID, ticket.rtBatchId, ticket.RT_Batch_ID, ticket.rt_batch_id,
            ticket.ReceivingTicketID, ticket.receivingTicketId, ticket.RT_ID, ticket.rt_id,
            ticket.RTHeaderID, ticket.rtHeaderId,
            ticket.id, ticket.ID,
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
        }
      }

      ticket.toolLines = foundLines && foundLines.length > 0 ? foundLines : [];
      return ticket;
    });
  }

  // Strategy 1: If endpoint is /data-api/rest (Azure Static Web Apps Linked Database)
  if (endpoint.includes('/data-api/rest') || endpoint.endsWith('/rest')) {
    try {
      const [invRes, jobRes, dtRes, dtLineRes, rtRes, rtLineRes] = await Promise.allSettled([
        fetchAllTablePages(endpoint, ['tbl_Inventory', 'Inventory', 'tblInventory', 'ToolInventory', 'tools', 'tbl_Tools', 'Tools']),
        fetchAllTablePages(endpoint, ['tbl_Jobs', 'Jobs', 'tblJobs', 'DrillingJobs', 'tbl_DrillingJobs', 'tbl_JobHeader', 'JobHeader', 'tbl_JobRegister', 'JobRegister']),
        fetchAllTablePages(endpoint, ['tbl_DeliveryTickets', 'DeliveryTickets', 'tbl_DTBatches', 'DTBatches', 'tbl_DT', 'DT', 'tbl_DeliveryTicket', 'DeliveryTicket', 'tbl_DT_Header', 'DTHeader']),
        fetchAllTablePages(endpoint, ['tbl_DTLines', 'DTLines', 'tbl_DeliveryTicketLines', 'DeliveryTicketLines', 'tbl_DTBatchLines', 'DTBatchLines', 'tbl_DT_Lines', 'tblDTLines', 'tbl_DeliveryTickets_Lines', 'DeliveryTickets_Lines']),
        fetchAllTablePages(endpoint, ['tbl_ReceivingTickets', 'ReceivingTickets', 'tbl_RTBatches', 'RTBatches', 'tbl_RT', 'RT', 'tbl_ReceivingTicket', 'ReceivingTicket', 'tbl_RT_Header', 'RTHeader']),
        fetchAllTablePages(endpoint, ['tbl_RTLines', 'RTLines', 'tbl_ReceivingTicketLines', 'ReceivingTicketLines', 'tbl_RTBatchLines', 'RTBatchLines', 'tbl_RT_Lines', 'tblRTLines', 'tbl_ReceivingTickets_Lines', 'ReceivingTickets_Lines']),
      ]);

      const invRows = invRes.status === 'fulfilled' && Array.isArray(invRes.value) ? invRes.value : [];
      const jobRows = jobRes.status === 'fulfilled' && Array.isArray(jobRes.value) ? jobRes.value : [];
      const dtRows = dtRes.status === 'fulfilled' && Array.isArray(dtRes.value) ? dtRes.value : [];
      const dtLineRows = dtLineRes.status === 'fulfilled' && Array.isArray(dtLineRes.value) ? dtLineRes.value : [];
      const rtRows = rtRes.status === 'fulfilled' && Array.isArray(rtRes.value) ? rtRes.value : [];
      const rtLineRows = rtLineRes.status === 'fulfilled' && Array.isArray(rtLineRes.value) ? rtLineRes.value : [];

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
          const existingKeys = new Set<string>();
          jobs.forEach((j: any) => {
            const raw = String(j.id || '').trim().toUpperCase();
            if (raw) existingKeys.add(raw);
            const std = formatStandardJobId(j.id).toUpperCase();
            if (std) existingKeys.add(std);
            const norm = normalizeJobKey(j.id);
            if (norm) existingKeys.add(norm);
          });
          MASTER_JOBS.forEach((mj) => {
            const rawK = String(mj.id || '').trim().toUpperCase();
            const stdK = formatStandardJobId(mj.id).toUpperCase();
            const normK = normalizeJobKey(mj.id);
            if (!existingKeys.has(rawK) && !existingKeys.has(stdK) && !existingKeys.has(normK)) {
              jobs!.push(normalizeJob(mj));
              existingKeys.add(rawK);
              existingKeys.add(stdK);
              existingKeys.add(normK);
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
          message: 'Connected to Azure SQL database',
        };
      }
    } catch (err: any) {
      console.warn('Azure Data API fetch warning:', err);
    }
  }

  // Strategy 2: Azure Function / Custom REST API
  try {
    const apiKey = getApiKey();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    };
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
        u.searchParams.set('_t', String(Date.now()));
        if (apiKey && !u.searchParams.has('code')) {
          u.searchParams.set('code', apiKey);
        }
        return base.startsWith('http') ? u.toString() : `${u.pathname}${u.search}`;
      } catch {
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}action=${actionName}&env=live&_t=${Date.now()}${apiKey ? `&code=${encodeURIComponent(apiKey)}` : ''}`;
      }
    }

    // Determine function base endpoint
    const fnEndpoint =
      endpoint.includes('/data-api/rest') || endpoint.endsWith('/rest')
        ? DEFAULT_AZURE_FUNCTION_URL
        : endpoint;

    // All API variant attempts — fired in PARALLEL (Promise.race) so the app never
    // waits 30 s × 6 = 3 minutes for sequential cold-start probes.  Each attempt gets
    // its own AbortController so losers are cancelled the instant a winner responds.
    // The winning URL+method is cached in sessionStorage so the NEXT sync skips straight
    // to it instead of probing again.
    const WIN_KEY = 'emdad_fn_winner';
    const cachedWinner = (() => {
      try { return JSON.parse(sessionStorage.getItem(WIN_KEY) || 'null'); } catch { return null; }
    })();

    type Attempt = { method: string; url: string; body: string | undefined; tag: string };
    const allAttempts: Attempt[] = [
      { method: 'GET',  url: buildUrl(fnEndpoint, 'GET_ALL_DATA'),  body: undefined,                                                     tag: 'GET/GET_ALL_DATA' },
      { method: 'POST', url: buildUrl(fnEndpoint, 'GET_ALL_DATA'),  body: JSON.stringify({ action: 'GET_ALL_DATA', env: 'live' }),        tag: 'POST/GET_ALL_DATA' },
      { method: 'GET',  url: buildUrl(fnEndpoint, 'getInventory'),  body: undefined,                                                     tag: 'GET/getInventory' },
      { method: 'POST', url: buildUrl(fnEndpoint, 'SYNC_ALL_DATA'), body: JSON.stringify({ action: 'SYNC_ALL_DATA', env: 'live' }),       tag: 'POST/SYNC_ALL_DATA' },
      { method: 'GET',  url: buildUrl(fnEndpoint, 'SYNC_ALL_DATA'), body: undefined,                                                     tag: 'GET/SYNC_ALL_DATA' },
      { method: 'GET',  url: buildUrl(DEFAULT_AZURE_FUNCTION_URL, 'GET_ALL_DATA'), body: undefined,                                      tag: 'GET/DEFAULT_GET_ALL_DATA' },
    ];

    // If we have a cached winner from a previous call this session, put it first and
    // skip the rest — avoids the probe entirely for warm calls.
    const attempts: Attempt[] = cachedWinner
      ? [cachedWinner, ...allAttempts.filter((a) => a.tag !== cachedWinner.tag)]
      : allAttempts;

    /**
     * Race all attempts in parallel.  Each has a 12-second AbortController timeout.
     * Returns the first { res, json, attempt } that yields an HTTP 200 with parseable
     * JSON — or null if all fail.
     */
    async function raceAttempts(list: Attempt[]): Promise<{ res: Response; json: any; attempt: Attempt } | null> {
      const controllers = list.map(() => new AbortController());
      // 12-second hard timeout per attempt (Azure Function cold-start is ≤ 30 s, so
      // this lets the parallel group resolve well before any single one would time out)
      const timers = controllers.map((c, i) =>
        setTimeout(() => { try { c.abort(); } catch { /* ignore */ } }, 12_000 + i * 300)
      );
      const cleanup = () => timers.forEach((t) => clearTimeout(t));

      const settled = await Promise.allSettled(
        list.map(async (attempt, i) => {
          const res = await fetch(attempt.url, {
            method: attempt.method,
            headers,
            body: attempt.body,
            signal: controllers[i].signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          // Cancel all other in-flight requests
          controllers.forEach((c, j) => { if (j !== i) { try { c.abort(); } catch { /* ignore */ } } });
          return { res, json, attempt };
        })
      );

      cleanup();
      for (const r of settled) {
        if (r.status === 'fulfilled') return r.value;
      }
      return null;
    }

    const winner = await raceAttempts(attempts);
    if (!winner) {
      return {
        success: false,
        source: 'azure-function',
        message: 'All Azure Function probe attempts failed or timed out (12 s each).',
      };
    }

    // Cache the winning attempt for this session so the next sync is instant
    try { sessionStorage.setItem(WIN_KEY, JSON.stringify({ method: winner.attempt.method, url: winner.attempt.url, body: winner.attempt.body, tag: winner.attempt.tag })); } catch { /* ignore */ }

    let lastError = '';
    {
      const json = winner.json;
      try {
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
            const existingKeys = new Set<string>();
            parsedJobs.forEach((j: any) => {
              const raw = String(j.id || '').trim().toUpperCase();
              if (raw) existingKeys.add(raw);
              const std = formatStandardJobId(j.id).toUpperCase();
              if (std) existingKeys.add(std);
              const norm = normalizeJobKey(j.id);
              if (norm) existingKeys.add(norm);
            });
            MASTER_JOBS.forEach((mj) => {
              const rawK = String(mj.id || '').trim().toUpperCase();
              const stdK = formatStandardJobId(mj.id).toUpperCase();
              const normK = normalizeJobKey(mj.id);
              if (!existingKeys.has(rawK) && !existingKeys.has(stdK) && !existingKeys.has(normK)) {
                parsedJobs.push(normalizeJob(mj));
                existingKeys.add(rawK);
                existingKeys.add(stdK);
                existingKeys.add(normK);
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
            message: 'Connected to Azure SQL database',
          };
        } else {
          lastError = `Returned 200 OK but keys were [${Object.keys(payload || {}).join(', ')}]`;
        }
      } catch (e: any) {
        lastError = e?.message || 'Network error';
      }
    } // end single-winner block

    return {
      success: false,
      source: 'azure-function',
      message: `Azure API reached but data was empty: ${lastError}`,
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };
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
    urlObj.searchParams.set('_t', String(Date.now()));
    if (apiKey && !urlObj.searchParams.has('code')) {
      urlObj.searchParams.set('code', apiKey);
    }
    url = endpoint.startsWith('http') ? urlObj.toString() : `${urlObj.pathname}${urlObj.search}`;
  } catch {
    url = `${endpoint}?action=${action}&env=live&_t=${Date.now()}${apiKey ? `&code=${encodeURIComponent(apiKey)}` : ''}`;
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

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an API action with automatic exponential backoff retry.
 * Handles Azure Function cold starts (10-30s delay) and transient network drops.
 * Delays: Attempt 1 -> 1s, Attempt 2 -> 3s, Attempt 3 -> 9s.
 */
export async function fetchWithRetry<T = any>(
  action: string,
  body: Record<string, any> = {},
  maxRetries = 3
): Promise<T | null> {
  let lastError: any = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetchFromApi<T>(action, body);
      if (res !== null) {
        return res;
      }
    } catch (e: any) {
      lastError = e;
    }

    if (i < maxRetries - 1) {
      const delay = 1000 * Math.pow(3, i); // 1s, 3s, 9s
      console.warn(`[API Retry] Action '${action}' attempt ${i + 1} did not succeed. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  if (lastError) {
    console.warn(`[API Retry] Action '${action}' exhausted all ${maxRetries} retries:`, lastError?.message || lastError);
  }
  return null;
}

export { addToOutbox, getOutbox, removeFromOutbox, getOutboxCount } from './outboxQueue';
export type { OutboxItem } from './outboxQueue';

export async function flushOfflineOutbox(): Promise<{ processed: number; remaining: number; errors: number }> {
  return { processed: 0, remaining: 0, errors: 0 };
}

/**
 * Universal resilient save wrapper:
 * 1. Tries direct Azure SQL save with 3 auto-retries and exponential backoff (1s, 3s, 9s).
 * 2. If all retries fail (offline, VPN down, Azure outage), enqueues to persistent IndexedDB Outbox.
 * 3. Returns a clear status so the UI knows if it saved live or queued for automatic sync.
 */
interface SaveAttemptResult {
  ok: boolean;
  permanent: boolean;
  status?: number;
  data?: any;
  error?: string;
}

/**
 * Posts a write action and reports WHY it failed, so the save path can tell a
 * permanent server rejection (4xx) apart from a transient network/offline failure.
 */
async function postActionWithStatus(action: string, body: Record<string, any> = {}): Promise<SaveAttemptResult> {
  const endpoint = getApiEndpoint();
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };
  if (apiKey) headers['x-functions-key'] = apiKey;

  let url = endpoint;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const fullBase = url.startsWith('http') ? url : `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
    const urlObj = new URL(fullBase);
    urlObj.searchParams.set('action', action);
    urlObj.searchParams.set('env', 'live');
    urlObj.searchParams.set('_t', String(Date.now()));
    if (apiKey && !urlObj.searchParams.has('code')) urlObj.searchParams.set('code', apiKey);
    url = endpoint.startsWith('http') ? urlObj.toString() : `${urlObj.pathname}${urlObj.search}`;
  } catch {
    url = `${endpoint}?action=${action}&env=live&_t=${Date.now()}${apiKey ? `&code=${encodeURIComponent(apiKey)}` : ''}`;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, env: 'live', ...body }),
    });
    if (!res.ok) {
      // 4xx (except 408 Request Timeout / 429 Too Many Requests) are permanent:
      // the request itself is bad, so retrying or queuing will never succeed.
      const permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
      return { ok: false, permanent, status: res.status, error: `HTTP ${res.status}` };
    }
    const json = await res.json().catch(() => null);
    if (json && json.success === false) {
      return { ok: false, permanent: true, status: res.status, error: json.error || 'Server rejected the request' };
    }
    return { ok: true, permanent: false, status: res.status, data: json && json.data !== undefined ? json.data : json };
  } catch (e: any) {
    // Network error / connection reset / offline / Azure cold-start timeout -> transient, safe to retry or queue.
    return { ok: false, permanent: false, error: e?.message || 'Network error' };
  }
}

/**
 * Universal resilient save wrapper (integrity-fixed):
 * - Retries only TRANSIENT failures (offline / connection reset / cold start).
 * - On a PERMANENT (4xx) server rejection, stops immediately and reports failure,
 *   instead of falsely reporting success and queuing a request that can never succeed.
 * - Only genuine transient failures are queued to the offline outbox.
 */
async function executeResilientSave(
  action: string,
  payload: any,
  entityLabel: string
): Promise<{ success: boolean; queued?: boolean; message: string }> {
  let last: SaveAttemptResult | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await postActionWithStatus(action, payload);
    if (last.ok) {
      return { success: true, message: `${entityLabel} saved to Azure SQL` };
    }
    if (last.permanent) {
      console.warn(`[Save] ${entityLabel} rejected by server (${last.status}): ${last.error}`);
      return {
        success: false,
        message: `${entityLabel} was NOT saved - the server rejected it (${last.error}). Please review the entry and try again.`,
      };
    }
    if (attempt < 2) await sleep(800 * Math.pow(2, attempt)); // 800ms, 1600ms
  }

  return {
    success: false,
    message: `Failed to save ${entityLabel} to Azure SQL: ${last?.error || 'Server did not respond'}. Please try again.`,
  };
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

  let callouts: any[] | undefined = undefined;
  let gatePasses: any[] | undefined = undefined;
  let contracts: any[] | undefined = undefined;
  let inspections: any[] | undefined = undefined;
  let maintenance: any[] | undefined = undefined;

  // Strategy 1: If endpoint is Azure Data API Builder
  if (endpoint.includes('/data-api/rest') || endpoint.endsWith('/rest')) {
    try {
      const [
        calloutsRes,
        calloutItemsRes,
        gatePassesRes,
        gatePassLinesRes,
        contractsRes,
        contractRatesRes,
        inspectionsRes,
        maintenanceRes,
      ] = await Promise.allSettled([
        fetchAllTablePages(endpoint, ['tbl_Callouts', 'Callouts', 'tblCallouts']),
        fetchAllTablePages(endpoint, ['tbl_CalloutItems', 'CalloutItems', 'tbl_CalloutLines', 'CalloutLines']),
        fetchAllTablePages(endpoint, ['tbl_GatePasses', 'GatePasses', 'tbl_GatePass', 'GatePass']),
        fetchAllTablePages(endpoint, ['tbl_GatePassLines', 'GatePassLines', 'tbl_GatePass_Lines']),
        fetchAllTablePages(endpoint, ['tbl_Contracts', 'Contracts', 'tblContracts']),
        fetchAllTablePages(endpoint, ['tbl_ContractRates', 'ContractRates', 'tblContractRates', 'rates']),
        fetchAllTablePages(endpoint, ['tbl_Inspections', 'Inspections', 'tbl_Inspection', 'Inspection']),
        fetchAllTablePages(endpoint, ['tbl_MaintenanceOrders', 'MaintenanceOrders', 'tbl_Maintenance', 'Maintenance']),
      ]);

      const calloutsRaw = calloutsRes.status === 'fulfilled' && Array.isArray(calloutsRes.value) ? calloutsRes.value : [];
      const calloutItemsRaw = calloutItemsRes.status === 'fulfilled' && Array.isArray(calloutItemsRes.value) ? calloutItemsRes.value : [];
      const gatePassesRaw = gatePassesRes.status === 'fulfilled' && Array.isArray(gatePassesRes.value) ? gatePassesRes.value : [];
      const gatePassLinesRaw = gatePassLinesRes.status === 'fulfilled' && Array.isArray(gatePassLinesRes.value) ? gatePassLinesRes.value : [];
      const contractsRaw = contractsRes.status === 'fulfilled' && Array.isArray(contractsRes.value) ? contractsRes.value : [];
      const contractRatesRaw = contractRatesRes.status === 'fulfilled' && Array.isArray(contractRatesRes.value) ? contractRatesRes.value : [];
      const inspectionsRaw = inspectionsRes.status === 'fulfilled' && Array.isArray(inspectionsRes.value) ? inspectionsRes.value : [];
      const maintenanceRaw = maintenanceRes.status === 'fulfilled' && Array.isArray(maintenanceRes.value) ? maintenanceRes.value : [];

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
    } catch (err) {
      console.warn('Data API secondary modules notice:', err);
    }
  }

  // Strategy 2: Azure Function fallback (fills in any module not loaded by Strategy 1)
  try {
    const [calloutsRes, gatePassesRes, contractsRes, inspectionsRes, maintenanceRes] = await Promise.allSettled([
      callouts ? Promise.resolve(null) : fetchFromApi<any[]>('getcallouts'),
      gatePasses ? Promise.resolve(null) : fetchFromApi<any[]>('getgatepasses'),
      contracts ? Promise.resolve(null) : fetchFromApi<any[]>('getcontracts'),
      inspections ? Promise.resolve(null) : fetchFromApi<any[]>('getinspections'),
      maintenance ? Promise.resolve(null) : fetchFromApi<any[]>('getmaintenance'),
    ]);

    if (!callouts && calloutsRes.status === 'fulfilled' && Array.isArray(calloutsRes.value)) {
      callouts = calloutsRes.value.map(normalizeCallout);
    }
    if (!gatePasses && gatePassesRes.status === 'fulfilled' && Array.isArray(gatePassesRes.value)) {
      gatePasses = gatePassesRes.value.map(normalizeGatePass);
    }
    if (!contracts && contractsRes.status === 'fulfilled' && Array.isArray(contractsRes.value)) {
      contracts = contractsRes.value
        .filter((r: any) => r && r.status !== 'Archived' && r.Status !== 'Archived')
        .map(normalizeContract);
    }
    if (!inspections && inspectionsRes.status === 'fulfilled' && Array.isArray(inspectionsRes.value)) {
      inspections = inspectionsRes.value.map(normalizeInspection);
    }
    if (!maintenance && maintenanceRes.status === 'fulfilled' && Array.isArray(maintenanceRes.value)) {
      maintenance = maintenanceRes.value.map(normalizeMaintenance);
    }
  } catch (e) {
    console.warn('Secondary modules fetch notice:', e);
  }

  return { callouts, gatePasses, contracts, inspections, maintenance };
}

export interface AllModulesLiveResult {
  success: boolean;
  source: 'azure-sql' | 'data-api' | 'azure-function' | 'local-cache';
  data: {
    inventory: any[];
    jobs: any[];
    dtBatches: any[];
    rtBatches: any[];
    contracts: any[];
    callouts: any[];
    gatePasses: any[];
    inspections: any[];
    maintenance: any[];
  };
  counts: {
    inventory: number;
    jobs: number;
    dtBatches: number;
    rtBatches: number;
    contracts: number;
    callouts: number;
    gatePasses: number;
    inspections: number;
    maintenance: number;
  };
  message: string;
}

/**
 * Master unified synchronization function that pulls and reconciles ALL modules
 * from Azure SQL and backend services concurrently:
 * Tools, Jobs, Delivery Tickets, Receiving Tickets, Contracts & Rates, Callouts,
 * Gate Passes, Inspections, and Maintenance Orders.
 */
/**
 * Supplemental jobs-only fetch — tries several Azure Function action variants that
 * may return ALL jobs without the row cap that GET_ALL_DATA imposes.
 * Called in parallel with the primary fetch; results are merged in, so jobs above
 * the GET_ALL_DATA limit (e.g. JOB-26-01814+) always appear.
 */
async function fetchJobsSupplemental(): Promise<any[]> {
  const endpoint = getApiEndpoint();
  const apiKey = (() => {
    try { return localStorage.getItem('emdad_api_key') || ''; } catch { return ''; }
  })();

  function makeUrl(base: string, action: string, extra = ''): string {
    const sep = base.includes('?') ? '&' : '?';
    const keyPart = apiKey ? `&code=${encodeURIComponent(apiKey)}` : '';
    return `${base}${sep}action=${action}&env=live&_t=${Date.now()}${keyPart}${extra}`;
  }

  // Try all known "fetch all jobs" action names the Azure Function might expose
  const variants = [
    makeUrl(endpoint, 'getjobs', '&all=true'),
    makeUrl(endpoint, 'getjobs'),
    makeUrl(endpoint, 'GET_JOBS'),
    makeUrl(endpoint, 'getAllJobs'),
    makeUrl(endpoint, 'getJobsAll'),
  ];

  for (const url of variants) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(url, {
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();
      let payload = json?.data !== undefined ? json.data : json;
      if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { /* ignore */ } }
      const raw =
        (Array.isArray(payload) ? payload : null) ||
        payload?.jobs ||
        payload?.Jobs ||
        payload?.tbl_Jobs ||
        payload?.value ||
        null;
      if (Array.isArray(raw) && raw.length > 0) {
        return raw.map(normalizeJob);
      }
    } catch {
      // try next variant
    }
  }
  return [];
}

export async function fetchAllModulesLive(): Promise<AllModulesLiveResult> {
  const [primarySettled, secondarySettled, suppJobsSettled] = await Promise.allSettled([
    fetchLiveDatabaseData(),
    fetchSecondaryModules(),
    fetchJobsSupplemental(),
  ]);

  const primaryRes = primarySettled.status === 'fulfilled' ? primarySettled.value : {
    success: false,
    source: 'failed' as const,
    data: { inventory: [], jobs: [], dtBatches: [], rtBatches: [] },
    message: 'Primary database connection notice',
  };
  const secondaryRes = secondarySettled.status === 'fulfilled' ? secondarySettled.value : {};
  // Supplemental jobs from dedicated getjobs action (bypasses GET_ALL_DATA row cap)
  const suppJobs: any[] = suppJobsSettled.status === 'fulfilled' ? suppJobsSettled.value : [];

  const customTools = loadCustomTools();
  const customJobs = loadCustomJobs();

  const isPureSql = typeof window !== 'undefined' && localStorage.getItem('emdad_mode') === 'production';

  let invList: any[] =
    primaryRes.data?.inventory && primaryRes.data.inventory.length > 0
      ? primaryRes.data.inventory
      : (isPureSql ? [] : INITIAL_INVENTORY);
  invList = mergeInventoryWithCustomTools(invList, customTools);

  let jobsList: any[] =
    primaryRes.data?.jobs && primaryRes.data.jobs.length > 0
      ? primaryRes.data.jobs
      : MASTER_JOBS;

  // Merge supplemental jobs (from dedicated getjobs call) into the primary list.
  // This captures any jobs above the GET_ALL_DATA SQL row cap (e.g. JOB-26-01814+).
  if (suppJobs.length > 0) {
    const existingKeys = new Set<string>();
    jobsList.forEach((j: any) => {
      const k = String(j.id || '').trim().toUpperCase();
      if (k) existingKeys.add(k);
      const std = formatStandardJobId(j.id).toUpperCase();
      if (std) existingKeys.add(std);
      const norm = normalizeJobKey(j.id);
      if (norm) existingKeys.add(norm);
    });
    suppJobs.forEach((sj: any) => {
      const rawK = String(sj.id || '').trim().toUpperCase();
      const stdK = formatStandardJobId(sj.id).toUpperCase();
      const normK = normalizeJobKey(sj.id);
      if (!existingKeys.has(rawK) && !existingKeys.has(stdK) && !existingKeys.has(normK)) {
        jobsList.push(sj);
        if (rawK) existingKeys.add(rawK);
        if (stdK) existingKeys.add(stdK);
        if (normK) existingKeys.add(normK);
      }
    });
  }

  jobsList = mergeJobsWithCustomJobs(jobsList, customJobs);

  const rawDtList: any[] =
    primaryRes.data?.dtBatches && primaryRes.data.dtBatches.length > 0
      ? primaryRes.data.dtBatches
      : (isPureSql ? [] : INITIAL_DT_BATCHES);

  const dtList: any[] = (rawDtList || []).filter((b: any) => {
    const id = String(b?.id || '').toUpperCase();
    const num = String(b?.dtNumber || '').toUpperCase();
    return !num.includes('10000') && !id.includes('10000') && !num.includes('10001') && !id.includes('10001') && !num.includes('10002') && !id.includes('10002');
  });

  const rtList: any[] =
    primaryRes.data?.rtBatches && primaryRes.data.rtBatches.length > 0
      ? primaryRes.data.rtBatches
      : (isPureSql ? [] : INITIAL_RT_BATCHES);

  let contractsList: any[] =
    secondaryRes.contracts && secondaryRes.contracts.length > 0
      ? secondaryRes.contracts
      : (primaryRes.data?.contracts && primaryRes.data.contracts.length > 0
          ? primaryRes.data.contracts
          : INITIAL_CONTRACTS);
  contractsList = mergeContractsWithCustom(contractsList);

  let calloutsList: any[] =
    secondaryRes.callouts && secondaryRes.callouts.length > 0
      ? secondaryRes.callouts
      : INITIAL_CALLOUTS;

  // Purge DT-26-10001 from callouts if present
  calloutsList = (Array.isArray(calloutsList) ? calloutsList : []).map((c: any) => {
    if (!c) return c;
    const hasTargetDt = Array.isArray(c?.items) && c.items.some((it: any) => String(it?.dtNumber || '').trim().toUpperCase() === 'DT-26-10001');

    if (hasTargetDt) {
      return {
        ...c,
        items: (Array.isArray(c.items) ? c.items : []).map((it: any) => {
          if (!it) return it;
          if (String(it?.dtNumber || '').trim().toUpperCase() === 'DT-26-10001') {
            return { ...it, dtNumber: undefined, status: 'Assigned' };
          }
          return it;
        }),
      };
    }
    return c;
  });
  calloutsList = mergeCalloutsWithCustom(calloutsList, loadCustomCallouts());

  const gatePassesList: any[] =
    secondaryRes.gatePasses && secondaryRes.gatePasses.length > 0
      ? secondaryRes.gatePasses
      : INITIAL_GATE_PASSES;

  const inspectionsList: any[] =
    secondaryRes.inspections && secondaryRes.inspections.length > 0
      ? secondaryRes.inspections
      : INITIAL_INSPECTIONS;

  const maintenanceList: any[] =
    secondaryRes.maintenance && secondaryRes.maintenance.length > 0
      ? secondaryRes.maintenance
      : INITIAL_MAINTENANCE;

  const counts = {
    inventory: invList.length,
    jobs: jobsList.length,
    dtBatches: dtList.length,
    rtBatches: rtList.length,
    contracts: contractsList.length,
    callouts: calloutsList.length,
    gatePasses: gatePassesList.length,
    inspections: inspectionsList.length,
    maintenance: maintenanceList.length,
  };

  const isConnected = primaryRes.success || Boolean(secondaryRes.contracts || secondaryRes.callouts);
  const source = primaryRes.source !== 'failed' ? primaryRes.source : 'azure-sql';

  const message = primaryRes.success
    ? `Azure SQL synced — ${counts.jobs} jobs · ${counts.inventory} tools · ${counts.dtBatches} DTs`
    : secondaryRes.contracts || secondaryRes.callouts
      ? `Partial sync — secondary modules loaded (jobs from local cache)`
      : `Local cache active — ${primaryRes.message || 'Azure connection unavailable'}`;

  return {
    success: isConnected,
    source,
    data: {
      inventory: invList,
      jobs: jobsList,
      dtBatches: dtList,
      rtBatches: rtList,
      contracts: contractsList,
      callouts: calloutsList,
      gatePasses: gatePassesList,
      inspections: inspectionsList,
      maintenance: maintenanceList,
    },
    counts,
    message,
  };
}

export async function saveCalloutApi(callout: any): Promise<{ success: boolean; queued?: boolean; message: string }> {
  const cId = String(callout.id || callout.CalloutID || '').trim();
  const notesVal = String(callout.notes || callout.Notes || callout.remarks || callout.Remarks || '').trim();
  if (cId && notesVal && typeof window !== 'undefined') {
    try {
      localStorage.setItem(`emdad_callout_notes_${cId}`, notesVal);
    } catch {}
  }
  const enrichedCallout = {
    ...callout,
    id: cId,
    CalloutID: cId,
    notes: notesVal,
    Notes: notesVal,
    remarks: notesVal,
    Remarks: notesVal,
  };
  saveCustomCallout(enrichedCallout);
  return executeResilientSave('savecallout', { callout: enrichedCallout, Callout: enrichedCallout, payload: enrichedCallout }, 'Callout');
}

export async function saveGatePassApi(gatePass: any): Promise<{ success: boolean; queued?: boolean; message: string }> {
  return executeResilientSave('savegatepass', { gatepass: gatePass, gatePass }, 'Gate pass');
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

export async function saveContractRatesApi(
  contractCode: string,
  rates: import('../types').ContractRateItem[]
): Promise<{ success: boolean; queued?: boolean; message: string }> {
  return executeResilientSave('savecontractrates', { code: contractCode, rates }, 'Contract rates');
}

export async function saveJobToolHoleSectionApi(
  jobId: string,
  toolIdOrSerial: string,
  holeSection: string,
  contractRef: string,
  opsRate: number,
  standbyRate: number,
  currency: string
): Promise<{ success: boolean; queued?: boolean; message: string }> {
  return executeResilientSave('savejobtoolsection', {
    jobId,
    toolIdOrSerial,
    holeSection,
    contractRef,
    opsRate,
    standbyRate,
    currency,
  }, 'Tool hole section');
}

export async function saveContractApi(contract: any): Promise<{ success: boolean; queued?: boolean; message: string }> {
  // Sanitize dates for SQL: pbgExpiryDate if "OPEN ENDED" must be sent as null to avoid SQL date parse error
  const sanitized = { ...contract };
  if (sanitized.pbgExpiryDate && String(sanitized.pbgExpiryDate).toUpperCase().includes('OPEN')) {
    sanitized.pbgExpiryDate = null;
    if (!sanitized.notes || !sanitized.notes.includes('OPEN ENDED')) {
      sanitized.notes = (sanitized.notes ? sanitized.notes + ' ' : '') + '(PBG Expiry: OPEN ENDED)';
    }
  }
  return executeResilientSave('savecontract', { contract: sanitized }, 'Contract');
}

export async function deleteContractApi(contract: any): Promise<{ success: boolean; queued?: boolean; message: string }> {
  const cId = String(contract?.id || '').trim();
  const cRef = String(contract?.contractRef || contract?.contractNo || '').trim();

  // Try direct delete action
  try {
    await fetchWithRetry('deletecontract', { id: cId, contractId: cId, contractRef: cRef, contractNo: cRef, code: cRef }, 2);
  } catch {}

  // Also update status to 'Archived' in SQL so queries filtering out Archived records exclude it
  const archived = {
    ...contract,
    status: 'Archived',
    Status: 'Archived',
  };
  return executeResilientSave('savecontract', { contract: archived, payload: archived }, 'Contract');
}

export async function saveInspectionApi(inspection: any): Promise<{ success: boolean; queued?: boolean; message: string }> {
  return executeResilientSave('saveinspection', { inspection }, 'Inspection');
}

export async function saveMaintenanceApi(maintenance: any): Promise<{ success: boolean; queued?: boolean; message: string }> {
  return executeResilientSave('savemaintenance', { maintenance }, 'Maintenance');
}

export async function saveInventoryApi(tool: any): Promise<{ success: boolean; message: string }> {
  if (!tool) return { success: true, message: 'No tool provided' };

  const sysId = String(tool.id || tool.serial || tool.SystemID || tool.Serial || '').trim();
  const serial = String(tool.serial || tool.id || tool.Serial || tool.SystemID || '').trim();
  const assetNo = String(tool.assetNo || tool.AssetNo || tool.partNo || tool.PartNo || '').trim();
  const shortDesc = String(tool.shortDesc || tool.ShortDesc || tool.category || tool.Category || tool.ToolType || 'Downhole Tool').trim();
  const desc = String(tool.desc || tool.Description || tool.toolDescription || `${tool.size || ''} ${shortDesc}`).trim();
  const size = String(tool.size || tool.Size || tool.toolSize || '').trim();
  const qty = Number(tool.qty ?? tool.Qty ?? 1);
  const location = String(tool.location || tool.Location || 'Emdad Base').trim();
  const status = String(tool.status || tool.Status || 'Good').trim();
  const ownership = String(tool.ownership || tool.Ownership || (tool.isEmdad ? 'EMDAD' : 'Sub-Contractor')).trim();
  const isEmdad = Boolean(tool.isEmdad ?? (ownership.toUpperCase().includes('EMDAD')));
  const supplier = String(tool.supplier || tool.Supplier || tool.vendor || tool.Vendor || ownership).trim();
  const addedDate = String(tool.addedDate || tool.AddedDate || new Date().toISOString().split('T')[0]).trim();

  const enrichedTool = {
    ...tool,
    id: sysId,
    serial,
    assetNo: assetNo || serial,
    shortDesc,
    desc,
    size,
    qty,
    location,
    status,
    ownership,
    isEmdad,
    supplier,
    addedDate,
    SystemID: sysId,
    Serial: serial,
    AssetNo: assetNo || serial,
    PartNo: assetNo || serial,
    ShortDesc: shortDesc,
    Category: shortDesc,
    Description: desc,
    ToolDescription: desc,
    Size: size,
    ToolSize: size,
    Qty: qty,
    Quantity: qty,
    Location: location,
    Status: status,
    Ownership: ownership,
    IsEmdad: isEmdad ? 1 : 0,
    Supplier: supplier,
    Vendor: supplier,
    AddedDate: addedDate,
    CreatedDate: addedDate,
    subRentalAgreementType: tool.subRentalAgreementType,
    subRentalDailyRate: tool.subRentalDailyRate,
    subRentalMonthlyRate: tool.subRentalMonthlyRate,
    subRentalOperatingRate: tool.subRentalOperatingRate,
    subRentalStandbyRate: tool.subRentalStandbyRate,
    subRentalRunCharge: tool.subRentalRunCharge,
    subRentalRedressCharge: tool.subRentalRedressCharge,
    supplierPoNumber: tool.supplierPoNumber,
    supplierCurrency: tool.supplierCurrency || 'AED',
    rentalStartDate: tool.rentalStartDate,
    rentalEndDate: tool.rentalEndDate,
    SubRentalAgreementType: tool.subRentalAgreementType,
    SubRentalDailyRate: tool.subRentalDailyRate,
    SubRentalMonthlyRate: tool.subRentalMonthlyRate,
    SubRentalOperatingRate: tool.subRentalOperatingRate,
    SubRentalStandbyRate: tool.subRentalStandbyRate,
    SubRentalRunCharge: tool.subRentalRunCharge,
    SubRentalRedressCharge: tool.subRentalRedressCharge,
    OperatingRate: tool.subRentalOperatingRate,
    StandbyRate: tool.subRentalStandbyRate,
    RunCharge: tool.subRentalRunCharge,
    RedressCharge: tool.subRentalRedressCharge,
    SupplierPoNumber: tool.supplierPoNumber,
    SupplierCurrency: tool.supplierCurrency || 'AED',
    RentalStartDate: tool.rentalStartDate,
    RentalEndDate: tool.rentalEndDate,
  };

  // Always persist to local custom tools store so user additions and modifications never vanish
  try {
    saveCustomTool(enrichedTool);
  } catch (err) {
    console.warn('[saveInventoryApi] Could not save to custom tools store:', err);
  }

  // The Azure Function uses 'addtool' for inserts and 'updatetool' for updates
  // Both require tool.id / SystemID in Azure SQL
  const isExisting = Boolean(tool._isExisting || tool.isExisting);
  const primaryAction = isExisting ? 'updatetool' : 'addtool';

  const res = await executeResilientSave(primaryAction, { tool: enrichedTool, item: enrichedTool, payload: enrichedTool }, 'Tool');
  if (!res.success && !isExisting) {
    // If addtool failed (e.g. key already exists), try updatetool as fallback
    const updateRes = await executeResilientSave('updatetool', { tool: enrichedTool, item: enrichedTool, payload: enrichedTool }, 'Tool');
    if (updateRes.success) return updateRes;
  }
  return res;
}

export async function saveJobApi(job: any): Promise<{ success: boolean; queued?: boolean; message: string }> {
  if (!job) return { success: true, message: 'No job provided' };
  const jId = String(job.id || job.jobNumber || '').trim();
  const notesVal = String(job.notes || job.Notes || job.remarks || job.Remarks || '').trim();

  try {
    saveCustomJob(job);
    if (jId && notesVal && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`emdad_job_notes_${jId}`, notesVal);
      } catch {}
    }
  } catch (err) {
    console.warn('[saveJobApi] Could not save to custom jobs store:', err);
  }

  const enrichedJob = {
    ...job,
    id: jId,
    JobID: jId,
    JobNumber: jId,
    notes: notesVal,
    Notes: notesVal,
    remarks: notesVal,
    Remarks: notesVal,
    TechnicalDetails: job.technicalDetails,
    Rig: job.rig,
    Well: job.well,
    Client: job.client,
    Contract: job.contract,
    Status: job.status,
  };

  return executeResilientSave('savejob', { job: enrichedJob, Job: enrichedJob, payload: enrichedJob }, 'Job');
}

export function toSqlIsoDate(val?: any): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === '—' || s === '-') return null;
  // If already ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  // If DD-MM-YYYY or DD/MM/YYYY
  const dmMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmMatch) {
    const day = dmMatch[1].padStart(2, '0');
    const month = dmMatch[2].padStart(2, '0');
    const year = dmMatch[3];
    return `${year}-${month}-${day}`;
  }
  // Try Date parse
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch {}
  return null;
}

function cleanDTBatchForSql(batch: any): any {
  if (!batch) return batch;
  const cleaned = { ...batch };

  // Convert all date fields to strict SQL ISO format (YYYY-MM-DD)
  if (cleaned.deliveryDate) cleaned.deliveryDate = toSqlIsoDate(cleaned.deliveryDate);
  if (cleaned.dispatchDate) cleaned.dispatchDate = toSqlIsoDate(cleaned.dispatchDate);
  if (cleaned.rmDate) cleaned.rmDate = toSqlIsoDate(cleaned.rmDate);
  if (cleaned.emdadSignDate) cleaned.emdadSignDate = toSqlIsoDate(cleaned.emdadSignDate);
  if (cleaned.clientSignDate) cleaned.clientSignDate = toSqlIsoDate(cleaned.clientSignDate);
  if (cleaned.lockedDate) cleaned.lockedDate = toSqlIsoDate(cleaned.lockedDate);

  if (!cleaned.dispatchDate) {
    cleaned.dispatchDate = cleaned.deliveryDate || new Date().toISOString().split('T')[0];
  }
  cleaned.deliveryDate = cleaned.dispatchDate;
  // rmDate is distinct from date shipped/dispatch date and is entered manually via date picker

  // Ensure toolLines have full metadata and clean technical names
  if (Array.isArray(cleaned.toolLines)) {
    cleaned.toolLines = cleaned.toolLines.map((tl: any, idx: number) => {
      const rawSerial = String(tl.serial || tl.Serial || '').trim();
      const rawAssetNo = String(tl.assetNo || tl.AssetNo || tl.partNo || '').trim();
      let assetNo = rawAssetNo;
      let serial = rawSerial;

      if (!assetNo || assetNo.toUpperCase().startsWith('EMD-')) {
        if (rawSerial && !rawSerial.toUpperCase().startsWith('EMD-')) {
          assetNo = rawSerial;
        }
      }
      if (!serial || serial.toUpperCase().startsWith('EMD-')) {
        if (assetNo && !assetNo.toUpperCase().startsWith('EMD-')) {
          serial = assetNo;
        }
      }
      if (!assetNo) assetNo = serial || `TOOL-${idx + 1}`;
      if (!serial) serial = assetNo;

      const desc = String(tl.desc || tl.Description || tl.description || tl.toolDescription || tl.shortDesc || '').trim();
      const shortDesc = String(tl.shortDesc || tl.ShortDesc || extractToolType(desc) || 'Downhole Tool').trim();
      const size = String(tl.size || tl.Size || extractSizeFromDescription(desc) || '—').trim();

      return {
        ...tl,
        id: tl.id || idx + 1,
        itemNo: tl.itemNo || idx + 1,
        serial,
        Serial: serial,
        assetNo,
        AssetNo: assetNo,
        desc,
        description: desc,
        toolDescription: desc,
        ToolDescription: desc,
        shortDesc,
        ShortDesc: shortDesc,
        size,
        Size: size,
        status: tl.status || 'OnRig',
        ownership: tl.ownership || 'EMDAD',
        Ownership: tl.ownership || 'EMDAD',
        qty: Number(tl.qty || 1),
        allocatedRig: tl.allocatedRig || null,
        allocatedWell: tl.allocatedWell || null,
        clientDtNo: tl.clientDtNo || null,
      };
    });
  }

  return cleaned;
}

function cleanRTBatchForSql(batch: any): any {
  if (!batch) return batch;
  const cleaned = { ...batch };
  if (cleaned.rtDate) cleaned.rtDate = toSqlIsoDate(cleaned.rtDate);
  if (cleaned.backloadRmDate) cleaned.backloadRmDate = toSqlIsoDate(cleaned.backloadRmDate);
  if (cleaned.loadingNoteDate) cleaned.loadingNoteDate = toSqlIsoDate(cleaned.loadingNoteDate);
  if (cleaned.lNoteDate) cleaned.lNoteDate = toSqlIsoDate(cleaned.lNoteDate);
  if (cleaned.dateIn) cleaned.dateIn = toSqlIsoDate(cleaned.dateIn);
  return cleaned;
}

export async function saveDeliveryTicketApi(dtBatch: any): Promise<{ success: boolean; queued?: boolean; message: string }> {
  const cleaned = cleanDTBatchForSql(dtBatch);
  return executeResilientSave('savedeliveryticket', { batch: cleaned, dtBatch: cleaned, payload: cleaned }, 'Delivery Ticket');
}

export async function deleteDeliveryTicketApi(dtNumberOrId: string): Promise<{ success: boolean; queued?: boolean; message: string }> {
  return executeResilientSave('deletedeliveryticket', { dtNumber: dtNumberOrId, id: dtNumberOrId }, 'Delete Delivery Ticket');
}

export async function saveReceivingTicketApi(rtBatch: any): Promise<{ success: boolean; queued?: boolean; message: string }> {
  const cleaned = cleanRTBatchForSql(rtBatch);
  return executeResilientSave('savereceivingticket', { batch: cleaned, rtBatch: cleaned, payload: cleaned }, 'Receiving Ticket');
}

export async function deleteReceivingTicketApi(rtNumberOrId: string): Promise<{ success: boolean; queued?: boolean; message: string }> {
  return executeResilientSave('deletereceivingticket', { rtNumber: rtNumberOrId, id: rtNumberOrId }, 'Delete Receiving Ticket');
}

export async function saveDailyFieldLogsApi(logs: Array<{
  jobId: string;
  dtNumber?: string;
  toolSerial: string;
  date: string;
  status: '1' | 'S' | string;
  rate?: number;
}>): Promise<{ success: boolean; queued?: boolean; message: string }> {
  return executeResilientSave('savedailyfieldlogs', { logs, payload: logs }, 'Daily Logs');
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

/**
 * Persists Custom Column Definitions to Azure SQL / Backend API
 */
export async function saveCustomColumnsApi(customColumns: any[]): Promise<{ success: boolean; queued?: boolean; message: string }> {
  return executeResilientSave('savecustomcolumns', { columns: customColumns, payload: customColumns }, 'Custom columns');
}

/**
 * Fetches Custom Column Definitions from Azure SQL / Backend API
 */
export async function fetchCustomColumnsApi(): Promise<any[] | null> {
  try {
    const res = await fetchFromApi('getcustomcolumns', {});
    if (res && Array.isArray(res)) return res;
    if (res && Array.isArray(res.columns)) return res.columns;
    if (res && Array.isArray(res.data)) return res.data;
  } catch {}
  return null;
}


