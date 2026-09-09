/**
 * Service for Azure SQL integration, Data API Builder, Azure Functions backend,
 * and standalone deployment exports
 */

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

export function getApiEndpoint(): string {
  const custom = localStorage.getItem('azure_api_endpoint');
  if (custom && custom.trim()) return custom.trim();
  // By default, if deployed on Azure Static Web Apps with Database Connection,
  // the relative path /data-api/rest is used.
  if (typeof window !== 'undefined' && window.location.hostname.includes('azurestaticapps.net')) {
    return '/data-api/rest';
  }
  return 'https://tooltracker-api-dyath8gehaavcdah.westeurope-01.azurewebsites.net/api/ToolTracker';
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
  return {
    id: jId,
    jobNumber: jId,
    calloutId: row.CalloutID || row.calloutId || '',
    rig: row.Rig || row.rig || '',
    well: row.Well || row.well || '',
    client: row.Client || row.client || '',
    contract: row.Contract || row.contract || '',
    poNumber: row.PONumber || row.poNumber || '',
    clientRef: row.ClientRef || row.clientRef || '',
    erpRef: row.ERPRef || row.erpRef || '',
    holeSection: row.HoleSection || row.holeSection || '',
    serviceType: row.ServiceType || row.serviceType || 'Downhole Rental',
    invoicingType: row.InvoicingType || row.invoicingType || 'PerJob',
    currency: row.Currency || row.currency || 'USD',
    mobDate: row.MobDate || row.mobDate || '',
    demobDate: row.DemobDate || row.demobDate || '',
    status: row.Status || row.status || 'Open',
    tools: [],
    operatingDays: 0,
    standbyDays: 0,
    isLocked: Boolean(row.LegalInvoiceNo || row.legalInvoiceNo),
    invoiceNumber: row.LegalInvoiceNo || row.EmdadInvoiceNo || '',
    invoiceDate: row.InvoiceDate || row.LegalInvoiceDate || '',
    invoicedAmountUSD: Number(row.InvoicedAmountUSD || 0),
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
 * Normalizes a single row from tbl_DeliveryTicketLines (or nested tool line) into DTLine
 */
export function normalizeDTLine(row: any): any {
  if (!row) return null;
  const serial = String(row.serial || row.Serial || row.serialNo || row.SerialNo || '').trim();

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
    row.toolDescription ||
    row.ToolDescription ||
    row.toolDesc ||
    row.ToolDesc ||
    row.ToolName ||
    shortDesc ||
    ''
  ).trim();

  let size = String(row.size || row.Size || '').trim();
  if (!size && rawDesc) {
    size = extractSizeFromDescription(rawDesc);
  }

  const finalShortDesc = shortDesc || rawDesc || 'Downhole Tool';
  const finalDesc = rawDesc || shortDesc || 'Downhole Tool';
  const rawStatus = String(row.status || row.Status || '').trim().toLowerCase();
  const status = (rawStatus === 'returned' || rawStatus === 'backloaded') ? 'Returned' : 'OnRig';
  const ownership = String(row.ownership || row.Ownership || 'EMDAD').trim();
  const isEmdad = Boolean(row.isEmdad ?? row.IsEmdad ?? (ownership.toUpperCase().includes('EMDAD')));

  return {
    id: row.id || row.ID || row.LineID || row.itemNo || undefined,
    itemNo: Number(row.itemNo ?? row.ItemNo ?? 1),
    serial,
    assetNo: String(row.assetNo || row.AssetNo || serial).trim(),
    size,
    shortDesc: finalShortDesc,
    desc: finalDesc,
    toolDescription: finalDesc,
    qty: Number(row.qty ?? row.Qty ?? 1),
    remarks: String(row.remarks || row.Remarks || '').trim(),
    status,
    ownership,
    isEmdad,
    used: row.used ?? null,
    rtBatchId: row.rtBatchId || row.RTBatchID || null,
  };
}

export function normalizeDTBatch(row: any): any {
  const rawLines = Array.isArray(row.toolLines)
    ? row.toolLines
    : Array.isArray(row.tools)
    ? row.tools
    : Array.isArray(row.lines)
    ? row.lines
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
    contract: String(row.Contract || row.contract || row.ContractRef || row.contractRef || row.ContractNo || row.contractNo || row.Client || row.client || ''),
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
  const serial = String(row.serial || row.Serial || row.serialNo || row.SerialNo || '').trim();

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
    row.toolDescription ||
    row.ToolDescription ||
    row.toolDesc ||
    row.ToolDesc ||
    row.ToolName ||
    shortDesc ||
    ''
  ).trim();

  let size = String(row.size || row.Size || '').trim();
  if (!size && rawDesc) {
    size = extractSizeFromDescription(rawDesc);
  }

  const finalShortDesc = shortDesc || rawDesc || 'Downhole Tool';
  const finalDesc = rawDesc || shortDesc || 'Downhole Tool';

  return {
    id: row.id || row.ID || row.LineID || row.itemNo || undefined,
    itemNo: Number(row.itemNo ?? row.ItemNo ?? 1),
    serial,
    assetNo: String(row.assetNo || row.AssetNo || serial).trim(),
    shortDesc: finalShortDesc,
    desc: finalDesc,
    toolDescription: finalDesc,
    size,
    used: Boolean(row.used ?? row.Used ?? false),
    routedTo: String(row.routedTo || row.RoutedTo || (row.used ? 'Inspection Bay' : 'Base Stock')),
    condition: String(row.condition || row.Condition || 'Good condition'),
    ownership: String(row.ownership || row.Ownership || 'EMDAD'),
    remarks: String(row.remarks || row.Remarks || ''),
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
    : [];

  const lines = rawLines.map(normalizeRTLine).filter(Boolean);

  const cleanDateStr = (d: any) => {
    if (!d) return '';
    const s = String(d).trim();
    return s.includes('T') ? s.split('T')[0] : s;
  };

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
    row.createdDate
  );

  return {
    id: String(row.RTBatchID || row.rtBatchId || row.id || row.ID || row.rtNumber || row.RTNumber || ''),
    rtNumber: String(row.RTNumber || row.rtNumber || row.TicketNumber || row.ticketNumber || row.id || ''),
    jobId: String(row.JobID || row.jobId || row.JobNumber || row.jobNumber || row.JobNo || row.jobNo || ''),
    rtDate: rawDate,
    backloadRmDate: cleanDateStr(row.BackloadRMDate || row.backloadRmDate || row.BackloadDate || rawDate),
    contract: String(row.Contract || row.contract || row.ContractRef || row.contractRef || ''),
    rig: String(row.Rig || row.rig || ''),
    well: String(row.Well || row.well || ''),
    receivedBy: String(row.ReceivedBy || row.receivedBy || row.Inspector || row.DispatchedBy || 'Receiving Staff'),
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
  const contractRef = row.contractRef || row.ContractRef || '';
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

  // Strategy 1: If endpoint is /data-api/rest (Azure Static Web Apps Linked Database)
  if (endpoint.includes('/data-api/rest') || endpoint.endsWith('/rest')) {
    try {
      // Fetch up to 10,000 inventory items, supporting both nextLink pagination and high $top limits
      async function fetchAllInventoryPages(baseEndpoint: string): Promise<any[]> {
        const tableVariants = ['tbl_Inventory', 'Inventory', 'tblInventory', 'ToolInventory', 'tools'];
        for (const tbl of tableVariants) {
          try {
            let allRows: any[] = [];
            let nextUrl: string | null = `${baseEndpoint}/${tbl}?$top=5000`;
            let pages = 0;

            while (nextUrl && pages < 10) {
              pages++;
              const r = await fetch(nextUrl);
              if (!r.ok) break;
              const json = await r.json();
              const rows = json.value || json;
              if (Array.isArray(rows) && rows.length > 0) {
                allRows = allRows.concat(rows);
                // Check if Data API Builder returned nextLink for pagination
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

      const invRows = await fetchAllInventoryPages(endpoint);
      const jobsPromise = fetch(`${endpoint}/tbl_Jobs?$top=1000`)
        .catch(() => fetch(`${endpoint}/Jobs?$top=1000`))
        .catch(() => null);

      const dtPromise = fetch(`${endpoint}/tbl_DeliveryTickets?$top=5000`)
        .catch(() => fetch(`${endpoint}/DeliveryTickets?$top=5000`))
        .catch(() => fetch(`${endpoint}/tbl_DTBatches?$top=5000`))
        .catch(() => fetch(`${endpoint}/DTBatches?$top=5000`))
        .catch(() => null);

      const dtLinesPromise = fetch(`${endpoint}/tbl_DeliveryTicketLines?$top=50000`)
        .catch(() => fetch(`${endpoint}/DeliveryTicketLines?$top=50000`))
        .catch(() => fetch(`${endpoint}/tbl_DTBatchLines?$top=50000`))
        .catch(() => fetch(`${endpoint}/DTBatchLines?$top=50000`))
        .catch(() => null);

      const rtPromise = fetch(`${endpoint}/tbl_ReceivingTickets?$top=5000`)
        .catch(() => fetch(`${endpoint}/ReceivingTickets?$top=5000`))
        .catch(() => fetch(`${endpoint}/tbl_RTBatches?$top=5000`))
        .catch(() => fetch(`${endpoint}/RTBatches?$top=5000`))
        .catch(() => null);

      const rtLinesPromise = fetch(`${endpoint}/tbl_ReceivingTicketLines?$top=50000`)
        .catch(() => fetch(`${endpoint}/ReceivingTicketLines?$top=50000`))
        .catch(() => fetch(`${endpoint}/tbl_RTBatchLines?$top=50000`))
        .catch(() => fetch(`${endpoint}/RTBatchLines?$top=50000`))
        .catch(() => null);

      const [jobsRes, dtRes, dtLinesRes, rtRes, rtLinesRes] = await Promise.allSettled([
        jobsPromise,
        dtPromise,
        dtLinesPromise,
        rtPromise,
        rtLinesPromise,
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

      if (jobsRes.status === 'fulfilled' && jobsRes.value && jobsRes.value.ok) {
        const json = await jobsRes.value.json();
        const rows = json.value || json;
        if (Array.isArray(rows)) {
          jobs = rows.map(normalizeJob);
          hasAnySuccess = true;
        }
      }

      const dtLinesByDt = new Map<string, any[]>();
      if (dtLinesRes.status === 'fulfilled' && dtLinesRes.value && dtLinesRes.value.ok) {
        try {
          const json = await dtLinesRes.value.json();
          const rows = json.value || json;
          if (Array.isArray(rows)) {
            rows.forEach((line: any) => {
              const dtNum = String(line.dtNumber || line.DTNumber || line.dtBatchId || line.DTBatchID || '').trim();
              if (dtNum) {
                if (!dtLinesByDt.has(dtNum)) dtLinesByDt.set(dtNum, []);
                dtLinesByDt.get(dtNum)!.push(line);
              }
            });
          }
        } catch {
          // ignore parsing error
        }
      }

      if (dtRes.status === 'fulfilled' && dtRes.value && dtRes.value.ok) {
        const json = await dtRes.value.json();
        const rows = json.value || json;
        if (Array.isArray(rows)) {
          dtBatches = rows.map((r: any) => {
            const dtNum = String(r.dtNumber || r.DTNumber || r.TicketNumber || r.ticketNumber || r.id || '').trim();
            if ((!r.toolLines || r.toolLines.length === 0) && dtLinesByDt.has(dtNum)) {
              r.toolLines = dtLinesByDt.get(dtNum);
            }
            return normalizeDTBatch(r);
          });
          hasAnySuccess = true;
        }
      }

      const rtLinesByRt = new Map<string, any[]>();
      if (rtLinesRes.status === 'fulfilled' && rtLinesRes.value && rtLinesRes.value.ok) {
        try {
          const json = await rtLinesRes.value.json();
          const rows = json.value || json;
          if (Array.isArray(rows)) {
            rows.forEach((line: any) => {
              const rtNum = String(line.rtNumber || line.RTNumber || line.rtBatchId || line.RTBatchID || '').trim();
              if (rtNum) {
                if (!rtLinesByRt.has(rtNum)) rtLinesByRt.set(rtNum, []);
                rtLinesByRt.get(rtNum)!.push(line);
              }
            });
          }
        } catch {
          // ignore parsing error
        }
      }

      if (rtRes.status === 'fulfilled' && rtRes.value && rtRes.value.ok) {
        const json = await rtRes.value.json();
        const rows = json.value || json;
        if (Array.isArray(rows)) {
          rtBatches = rows.map((r: any) => {
            const rtNum = String(r.rtNumber || r.RTNumber || r.TicketNumber || r.ticketNumber || r.id || '').trim();
            if ((!r.toolLines || r.toolLines.length === 0) && rtLinesByRt.has(rtNum)) {
              r.toolLines = rtLinesByRt.get(rtNum);
            }
            return normalizeRTBatch(r);
          });
          hasAnySuccess = true;
        }
      }

      if (hasAnySuccess) {
        return {
          success: true,
          source: 'data-api',
          data: { inventory, jobs: jobs || [], dtBatches: dtBatches || [], rtBatches: rtBatches || [] },
          message: `Loaded live from Azure Data API (${inventory?.length ?? 0} tools, ${jobs?.length ?? 0} jobs)`,
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
        const u = new URL(base.startsWith('http') ? base : `https://${base}`);
        u.searchParams.set('action', actionName);
        u.searchParams.set('env', 'live');
        if (apiKey && !u.searchParams.has('code')) {
          u.searchParams.set('code', apiKey);
        }
        return u.toString();
      } catch {
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}action=${actionName}&env=live${apiKey ? `&code=${encodeURIComponent(apiKey)}` : ''}`;
      }
    }

    // The Azure Function was created with action 'SYNC_ALL_DATA' or 'GET_ALL_DATA'
    const attempts = [
      { method: 'POST', url: buildUrl(endpoint, 'SYNC_ALL_DATA'), body: JSON.stringify({ action: 'SYNC_ALL_DATA', env: 'live' }) },
      { method: 'GET', url: buildUrl(endpoint, 'SYNC_ALL_DATA'), body: undefined },
      { method: 'POST', url: buildUrl(endpoint, 'GET_ALL_DATA'), body: JSON.stringify({ action: 'GET_ALL_DATA', env: 'live' }) },
      { method: 'GET', url: buildUrl(endpoint, 'GET_ALL_DATA'), body: undefined },
      { method: 'GET', url: buildUrl(endpoint, 'GET_INVENTORY'), body: undefined },
      { method: 'POST', url: buildUrl(endpoint, 'GET_INVENTORY'), body: JSON.stringify({ action: 'GET_INVENTORY', env: 'live' }) },
      { method: 'GET', url: buildUrl(endpoint, ''), body: undefined },
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
            payload.deliveryTicketLines ||
            payload.tbl_DeliveryTicketLines ||
            payload.DeliveryTicketLines ||
            payload.tbl_DTBatchLines ||
            payload.DTBatchLines ||
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
            payload.receivingTicketLines ||
            payload.tbl_ReceivingTicketLines ||
            payload.ReceivingTicketLines ||
            payload.tbl_RTBatchLines ||
            payload.RTBatchLines ||
            payload.rtLines ||
            [];

          if (Array.isArray(rawDt) && Array.isArray(rawDtLines) && rawDtLines.length > 0) {
            const linesByDt = new Map<string, any[]>();
            rawDtLines.forEach((line: any) => {
              const dtNum = String(line.dtNumber || line.DTNumber || line.dtBatchId || line.DTBatchID || '').trim();
              if (dtNum) {
                if (!linesByDt.has(dtNum)) linesByDt.set(dtNum, []);
                linesByDt.get(dtNum)!.push(line);
              }
            });
            rawDt.forEach((ticket: any) => {
              const dtNum = String(ticket.dtNumber || ticket.DTNumber || ticket.TicketNumber || ticket.id || '').trim();
              if ((!ticket.toolLines || ticket.toolLines.length === 0) && linesByDt.has(dtNum)) {
                ticket.toolLines = linesByDt.get(dtNum);
              }
            });
          }

          if (Array.isArray(rawRt) && Array.isArray(rawRtLines) && rawRtLines.length > 0) {
            const linesByRt = new Map<string, any[]>();
            rawRtLines.forEach((line: any) => {
              const rtNum = String(line.rtNumber || line.RTNumber || line.rtBatchId || line.RTBatchID || '').trim();
              if (rtNum) {
                if (!linesByRt.has(rtNum)) linesByRt.set(rtNum, []);
                linesByRt.get(rtNum)!.push(line);
              }
            });
            rawRt.forEach((ticket: any) => {
              const rtNum = String(ticket.rtNumber || ticket.RTNumber || ticket.TicketNumber || ticket.id || '').trim();
              if ((!ticket.toolLines || ticket.toolLines.length === 0) && linesByRt.has(rtNum)) {
                ticket.toolLines = linesByRt.get(rtNum);
              }
            });
          }
        }

        if (Array.isArray(rawInventory) || (Array.isArray(rawJobs) && rawJobs.length > 0)) {
          const invList = Array.isArray(rawInventory) ? rawInventory.map(normalizeInventoryItem) : undefined;
          return {
            success: true,
            source: 'azure-function',
            data: {
              inventory: invList,
              jobs: Array.isArray(rawJobs) ? rawJobs.map(normalizeJob) : [],
              dtBatches: Array.isArray(rawDt) ? rawDt.map(normalizeDTBatch) : [],
              rtBatches: Array.isArray(rawRt) ? rawRt.map(normalizeRTBatch) : [],
            },
            message: `Connected to Azure SQL via API (${invList?.length || 0} tools, ${rawJobs?.length || 0} jobs)`,
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
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    urlObj.searchParams.set('action', action);
    urlObj.searchParams.set('env', 'live');
    if (apiKey && !urlObj.searchParams.has('code')) {
      urlObj.searchParams.set('code', apiKey);
    }
    url = urlObj.toString();
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
    const res = await fetchFromApi('savegatepass', { gatePass });
    return { success: res !== null, message: res ? 'Gate pass saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
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
    const res = await fetchFromApi('savedeliveryticket', { dtBatch });
    return { success: res !== null, message: res ? 'Delivery Ticket saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
}

export async function saveReceivingTicketApi(rtBatch: any): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetchFromApi('savereceivingticket', { rtBatch });
    return { success: res !== null, message: res ? 'Receiving Ticket saved to Azure SQL' : 'Saved locally' };
  } catch {
    return { success: true, message: 'Saved locally' };
  }
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

