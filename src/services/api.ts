/**
 * Service for Azure SQL integration via the Azure Function backend,
 * and standalone deployment exports.
 *
 * This app previously also supported Azure Static Web Apps' Data API Builder
 * ("linked database") as an alternative backend, auto-selected whenever the
 * hostname ended in azurestaticapps.net. That was removed: it assumed every
 * such deployment had a database connection linked in Azure, which isn't
 * true for all of them (e.g. polite-tree-...), and a deployment without one
 * gets back the Static Web App's default HTML error page (HTTP 405) instead
 * of JSON — which is exactly what broke login there. The Azure Function
 * below is the single confirmed-working backend, so it's now the only path.
 *
 * IMPORTANT (2026-09-08): The Azure Function's GET_ALL_DATA action was
 * previously reading Delivery/Receiving Tickets from tbl_DTBatches and
 * tbl_RTBatches — both confirmed EMPTY (0 rows). The real, populated data
 * (2,643 delivery tickets, 2,424 receiving tickets) lives in
 * tbl_DeliveryTickets/tbl_DeliveryTicketLines and
 * tbl_ReceivingTickets/tbl_ReceivingTicketLines, which the app had never
 * queried. The normalizers below were rewritten to match those tables'
 * real columns (see the accompanying Azure Function code for the
 * corresponding server-side query/shape). Login was also moved server-side
 * against the real tbl_Users table (10 real rows, previously unused —
 * the app authenticated against a hardcoded array in initialData.ts).
 */

export interface DbConnectionStatus {
  isConnected: boolean;
  source: 'azure-sql' | 'azure-function' | 'local-cache';
  lastChecked: string;
  message: string;
  counts: {
    inventory: number;
    jobs: number;
    dtBatches: number;
    rtBatches: number;
  };
}

const DEFAULT_FUNCTION_ENDPOINT =
  'https://tooltracker-api-dyath8gehaavcdah.westeurope-01.azurewebsites.net/api/ToolTracker';

export function getApiEndpoint(): string {
  const custom = localStorage.getItem('azure_api_endpoint');
  if (custom && custom.trim()) return custom.trim();
  return DEFAULT_FUNCTION_ENDPOINT;
}

/**
 * Normalizes SQL column names (PascalCase or standard) to front-end camelCase
 */
function normalizeInventoryItem(row: any): any {
  return {
    id: row.SystemID || row.systemId || row.id || `TOOL-${Math.random().toString(36).substring(7)}`,
    serial: row.SystemID || row.serial || row.SystemId || '',
    assetNo: row.AssetNo || row.assetNo || '',
    size: row.Size || row.size || '',
    shortDesc: row.ShortDesc || row.shortDesc || row.category || '',
    desc: row.Description || row.desc || '',
    qty: Number(row.Qty ?? row.qty ?? 1),
    location: row.Location || row.location || 'Emdad Base',
    status: row.Status || row.status || 'Good',
    ownership: row.Ownership || row.ownership || (row.IsEmdad ? 'EMDAD' : 'Sub-Contractor'),
    isEmdad: Boolean(row.IsEmdad ?? row.isEmdad ?? true),
    oemSerial: row.OEMSerial || row.oemSerial || '',
    supplier: row.Supplier || row.supplier || '',
    addedDate: row.AddedDate || row.addedDate || '',
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
    // NOTE: kept for backward compat with any cached local data; the live
    // field the rest of the app actually reads is `invoiceAmount` (see
    // architecture-review-2026-09-06.md finding #5 — this mismatch is not
    // fixed here, flagging only).
    invoicedAmountUSD: Number(row.InvoicedAmountUSD || 0),
  };
}

/** tbl_DeliveryTicketLines (enriched server-side with tbl_Inventory + return status) -> DTLine */
function normalizeDTLine(row: any, parentDtNumber?: string): any {
  const usedStatus = (row.usedStatus || '').toString().toLowerCase();
  return {
    serial: row.serial || '',
    assetNo: row.AssetNo || row.assetNo || '',
    shortDesc: row.ShortDesc || row.shortDesc || row.toolDescription || '',
    desc: row.toolDescription || row.ShortDesc || row.shortDesc || '',
    size: row.Size || row.size || '',
    status: row.lineStatus === 'Returned' ? 'Returned' : 'OnRig',
    rtBatchId: row.returnedRtNumber || null,
    used: row.usedStatus != null ? usedStatus === 'used' : null,
    ownership: row.Ownership || row.ownership || '',
    isEmdad: Boolean(row.IsEmdad ?? row.isEmdad ?? true),
    // extra columns carried through from tbl_DeliveryTicketLines, not on
    // the original DTLine type but useful and harmless as optional fields
    itemNo: row.itemNo,
    qty: row.qty,
    remarks: row.remarks,
    dtNumber: row.dtNumber || parentDtNumber,
  };
}

/** tbl_DeliveryTickets -> DTBatch (real, populated table — see header note) */
function normalizeDTBatch(row: any): any {
  const id = String(row.id ?? row.DTBatchID ?? row.dtBatchId ?? '');
  const deliveryDate = row.deliveryDate || row.DeliveryDate || row.RMDate || row.rmDate || '';
  const lines = Array.isArray(row.toolLines)
    ? row.toolLines.map((l: any) => normalizeDTLine(l, row.dtNumber))
    : [];
  return {
    id,
    DTBatchID: id,
    dtNumber: row.dtNumber || row.DTNumber || '',
    jobId: row.jobNumber || row.JobID || row.jobId || '',
    clientCode: row.clientCode || '',
    rmDate: deliveryDate,
    rmRef: row.rmRef || '',
    dispatchDate: deliveryDate,
    rig: row.rig || row.Rig || '',
    well: row.well || row.Well || '',
    contract: row.contract || row.Contract || '',
    poNumber: row.poNumber || '',
    clientRef: row.clientRef || '',
    vehicleVessel: row.vehicleVessel || '',
    driverName: row.driverName || '',
    dispatchedBy: row.emdadRep || row.dispatchedBy || row.DispatchedBy || '',
    recipient: row.clientSignedBy || row.recipient || row.Recipient || '',
    notes: row.notes || row.Notes || '',
    toolLines: lines,
    isLocked: Boolean(row.lockedAt || row.lockStage === 'Locked'),
    lockedBy: row.lockedBy || '',
    lockedDate: row.lockedAt || '',
    lockStage: row.lockStage || '',
    calloutRef: row.calloutRef || '',
    status: row.status || '',
    createdBy: row.createdBy || '',
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || '',
    // Document attachment — now backed by the real attachmentRef column
    // instead of base64-in-localStorage (architecture-review finding #3)
    signedDocUrl: row.attachmentRef || row.signedDocUrl || '',
    signedDocName: row.attachmentRef ? String(row.attachmentRef).split('/').pop() : row.signedDocName || '',
    signedDate: row.clientSignDate || row.emdadSignDate || row.signedDate || '',
    isSigned: Boolean(row.clientSignedBy || row.isSigned),
  };
}

/** tbl_ReceivingTicketLines (enriched server-side with tbl_Inventory) -> RTLine */
function normalizeRTLine(row: any, parentLinkedDtNumber?: string): any {
  const usedStatus = (row.usedStatus || '').toString().toLowerCase();
  return {
    serial: row.serial || '',
    assetNo: row.AssetNo || row.assetNo || '',
    shortDesc: row.ShortDesc || row.shortDesc || row.toolDescription || '',
    dtBatchId: row.dtNumber || parentLinkedDtNumber || undefined,
    used: usedStatus === 'used',
    routedTo: row.routedTo || '',
    condition: row.condition || '',
    size: row.Size || row.size || '',
    ownership: row.Ownership || row.ownership || '',
    // extra columns from tbl_ReceivingTicketLines, optional/passthrough
    itemNo: row.itemNo,
    qty: row.qty,
    remarks: row.remarks,
    routedAt: row.routedAt,
    routedBy: row.routedBy,
  };
}

/** tbl_ReceivingTickets -> RTBatch (real, populated table — see header note) */
function normalizeRTBatch(row: any): any {
  const id = String(row.id ?? row.RTBatchID ?? row.rtBatchId ?? '');
  const lines = Array.isArray(row.toolLines)
    ? row.toolLines.map((l: any) => normalizeRTLine(l, row.linkedDtNumber))
    : [];
  return {
    id,
    RTBatchID: id,
    rtNumber: row.rtNumber || row.RTNumber || '',
    jobId: row.jobNumber || row.JobID || row.jobId || '',
    linkedDtNumber: row.linkedDtNumber || '',
    clientCode: row.clientCode || '',
    rtDate: row.receivingDate || row.RTDate || row.rtDate || '',
    manifestNumber: row.manifestNumber || '',
    clientRef: row.clientRef || '',
    vehicleVessel: row.vehicleVessel || '',
    contract: row.contract || row.Contract || '',
    rig: row.rig || row.Rig || '',
    well: row.well || row.Well || '',
    receivedBy: row.emdadRep || row.receivedBy || row.ReceivedBy || '',
    toolLines: lines,
    isLocked: Boolean(row.lockedAt || row.lockStage === 'Locked'),
    lockedBy: row.lockedBy || '',
    lockedDate: row.lockedAt || '',
    lockStage: row.lockStage || '',
    status: row.status || '',
    notes: row.notes || '',
    createdBy: row.createdBy || '',
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || '',
    // Document attachment — now backed by the real attachmentRef column
    signedDocUrl: row.attachmentRef || row.signedDocUrl || '',
    signedDocName: row.attachmentRef ? String(row.attachmentRef).split('/').pop() : row.signedDocName || '',
    signedDate: row.clientSignDate || row.emdadSignDate || row.signedDate || '',
    isSigned: Boolean(row.clientSignedBy || row.isSigned),
  };
}

/**
 * NOTE (2026-09-08, revised): The Azure Function's `getcallouts`,
 * `getgatepasses`, and `getcontracts` actions already alias their SQL
 * columns to the exact camelCase shape these types use (confirmed from the
 * real index.js — this was NOT missing backend work, only missing frontend
 * calls). These normalizers are written tolerant of BOTH that already-
 * camelCase shape and a raw-PascalCase fallback, so they're safe either way.
 */
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
  return {
    id: row.id || row.ContractID || '',
    contractRef: row.contractRef || row.ContractRef || '',
    client: row.client || row.Client || '',
    poNumber: row.poNumber || row.PONumber || '',
    currency: row.currency || row.Currency || 'USD',
    status: row.status || row.Status || 'Active',
    contractValue: (row.contractValue ?? row.ContractValue) != null ? Number(row.contractValue ?? row.ContractValue) : null,
    startDate: row.startDate || row.StartDate || null,
    endDate: row.endDate || row.EndDate || null,
    pbgNumber: row.pbgNumber || row.PBGNumber || '',
    pbgValue: (row.pbgValue ?? row.PBGValue) != null ? Number(row.pbgValue ?? row.PBGValue) : null,
    pbgIssueDate: row.pbgIssueDate || row.PBGIssueDate || null,
    pbgExpiryDate: row.pbgExpiryDate || row.PBGExpiryDate || null,
    invoicedToDate: (row.invoicedToDate ?? row.InvoicedToDate) != null ? Number(row.invoicedToDate ?? row.InvoicedToDate) : null,
    notes: row.notes || row.Notes || '',
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
 * Attempts to fetch live data from the Azure Function backend
 */
export async function fetchLiveDatabaseData(): Promise<{
  success: boolean;
  data?: {
    inventory?: any[];
    jobs?: any[];
    dtBatches?: any[];
    rtBatches?: any[];
    callouts?: any[];
    gatePasses?: any[];
    contracts?: any[];
    inspections?: any[];
    maintenance?: any[];
  };
  source: 'azure-function' | 'failed';
  message: string;
}> {
  const endpoint = getApiEndpoint();

  try {
    // NOTE (2026-09-08, revised): Callouts/GatePasses/Contracts/Inspections/
    // Maintenance are NOT part of GET_ALL_DATA in the real Function — they
    // each have their own existing action (getcallouts, getgatepasses,
    // getcontracts, getinspections, getmaintenance), already fully built
    // server-side. Fetched here in parallel and merged into one result so
    // App.tsx's existing handleFetchLiveSql code doesn't need to change.
    const [gadJson, calloutsRaw, gatePassesRaw, contractsRaw, inspectionsRaw, maintenanceRaw] = await Promise.all([
      fetch(`${endpoint}?action=GET_ALL_DATA&env=live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GET_ALL_DATA', env: 'live' }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetchFromApi<any[]>('getcallouts'),
      fetchFromApi<any[]>('getgatepasses'),
      fetchFromApi<any[]>('getcontracts'),
      fetchFromApi<any[]>('getinspections'),
      fetchFromApi<any[]>('getmaintenance'),
    ]);

    const payload = gadJson ? gadJson.data || gadJson : null;
    if (payload && (payload.inventory || payload.jobs)) {
      return {
        success: true,
        source: 'azure-function',
        data: {
          inventory: Array.isArray(payload.inventory)
            ? payload.inventory.map(normalizeInventoryItem)
            : undefined,
          jobs: Array.isArray(payload.jobs) ? payload.jobs.map(normalizeJob) : [],
          dtBatches: Array.isArray(payload.dtBatches) ? payload.dtBatches.map(normalizeDTBatch) : [],
          rtBatches: Array.isArray(payload.rtBatches) ? payload.rtBatches.map(normalizeRTBatch) : [],
          callouts: Array.isArray(calloutsRaw) ? calloutsRaw.map(normalizeCallout) : undefined,
          gatePasses: Array.isArray(gatePassesRaw) ? gatePassesRaw.map(normalizeGatePass) : undefined,
          contracts: Array.isArray(contractsRaw) ? contractsRaw.map(normalizeContract) : undefined,
          inspections: Array.isArray(inspectionsRaw) ? inspectionsRaw.map(normalizeInspection) : undefined,
          maintenance: Array.isArray(maintenanceRaw) ? maintenanceRaw.map(normalizeMaintenance) : undefined,
        },
        message: `Connected to Azure Function (${payload.inventory?.length || 0} tools, ${payload.jobs?.length || 0} jobs, ${payload.dtBatches?.length || 0} delivery tickets, ${payload.rtBatches?.length || 0} receiving tickets)`,
      };
    }
  } catch (err: any) {
    console.warn('Azure Function fetch warning:', err);
  }

  return {
    success: false,
    source: 'failed',
    message: 'Unable to reach the Azure Function backend. Using local cache.',
  };
}

/**
 * Save actions for the modules that were previously localStorage-only on
 * the frontend (Callouts, Gate Passes, Contracts, Inspections, Maintenance,
 * Jobs). The Azure Function already has working `savecallout`/
 * `savegatepass`/`savecontract`/`saveinspection`/`savemaintenance`/`savejob`
 * actions (confirmed from the real index.js on 2026-09-08) — these were
 * simply never called from the frontend. Action names and body payload
 * keys below match that real backend exactly (note: no underscores, and
 * `gatepass` — not `gatePass` — as the body key for the gate pass action).
 */
export async function saveCalloutApi(callout: any): Promise<{ success: boolean; message: string }> {
  const result = await fetchFromApi('savecallout', { callout });
  return result !== null
    ? { success: true, message: 'Callout saved to Azure SQL.' }
    : { success: false, message: 'Could not reach Azure SQL — callout saved locally only for now.' };
}

export async function saveGatePassApi(gatePass: any): Promise<{ success: boolean; message: string }> {
  const result = await fetchFromApi('savegatepass', { gatepass: gatePass });
  return result !== null
    ? { success: true, message: 'Gate pass saved to Azure SQL.' }
    : { success: false, message: 'Could not reach Azure SQL — gate pass saved locally only for now.' };
}

export async function saveContractApi(contract: any): Promise<{ success: boolean; message: string }> {
  const result = await fetchFromApi('savecontract', { contract });
  return result !== null
    ? { success: true, message: 'Contract saved to Azure SQL.' }
    : { success: false, message: 'Could not reach Azure SQL — contract saved locally only for now.' };
}

export async function saveInspectionApi(inspection: any): Promise<{ success: boolean; message: string }> {
  const result = await fetchFromApi('saveinspection', { inspection });
  return result !== null
    ? { success: true, message: 'Inspection saved to Azure SQL.' }
    : { success: false, message: 'Could not reach Azure SQL — inspection saved locally only for now.' };
}

export async function saveMaintenanceApi(maintenance: any): Promise<{ success: boolean; message: string }> {
  const result = await fetchFromApi('savemaintenance', { maintenance });
  return result !== null
    ? { success: true, message: 'Maintenance record saved to Azure SQL.' }
    : { success: false, message: 'Could not reach Azure SQL — maintenance record saved locally only for now.' };
}

export async function saveJobApi(job: any): Promise<{ success: boolean; message: string }> {
  const result = await fetchFromApi('savejob', { job });
  return result !== null
    ? { success: true, message: 'Job saved to Azure SQL.' }
    : { success: false, message: 'Could not reach Azure SQL — job saved locally only for now.' };
}

/**
 * Added 2026-09-08 — closes the last real gap: new/edited Delivery and
 * Receiving Tickets previously only reached SQL via the manual "Sync"
 * button (which silently swallows failures). These call new
 * `savedeliveryticket`/`savereceivingticket` actions targeting the real
 * tbl_DeliveryTickets/tbl_ReceivingTickets tables (NOT the old
 * savedtbatch/savertbatch actions, which point at the empty
 * tbl_DTBatches/tbl_RTBatches tables) — see
 * tooltracker-dt-rt-save-actions.js for the server side.
 */
export async function saveDeliveryTicketApi(batch: any): Promise<{ success: boolean; message: string }> {
  const result = await fetchFromApi('savedeliveryticket', { batch });
  return result !== null
    ? { success: true, message: 'Delivery ticket saved to Azure SQL.' }
    : { success: false, message: 'Could not reach Azure SQL — delivery ticket saved locally only for now.' };
}

export async function saveReceivingTicketApi(batch: any): Promise<{ success: boolean; message: string }> {
  const result = await fetchFromApi('savereceivingticket', { batch });
  return result !== null
    ? { success: true, message: 'Receiving ticket saved to Azure SQL.' }
    : { success: false, message: 'Could not reach Azure SQL — receiving ticket saved locally only for now.' };
}

/**
 * General API caller
 */
export async function fetchFromApi<T = any>(
  action: string,
  body: Record<string, any> = {}
): Promise<T | null> {
  const endpoint = getApiEndpoint();
  try {
    const res = await fetch(`${endpoint}?action=${action}&env=live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
 * Real server-side login against tbl_Users via the Azure Function's real
 * `login` action (lowercase — confirmed from the actual Kudu source, not
 * guessed). Replaces the previous client-side check against a hardcoded
 * array in data/initialData.ts (architecture-review-2026-09-06.md finding
 * under "Login" — no server-side check existed before this).
 *
 * The Function's `login` case already returns exactly the shape the app's
 * User type needs (id, username, name, role) plus `email` and
 * `mustChangePassword`, via `ok(context, user)` / `err(context, msg, code)`
 * helpers — this parses that {success, data|error} envelope directly
 * rather than remapping PascalCase columns (there's no remapping to do).
 *
 * NOTE: tbl_Users.Password has no indication of hashing (plain
 * varchar(200)). This sends the password as typed and the server compares
 * it as stored. That's a real gap worth a follow-up fix (e.g. bcrypt with
 * a one-time forced reset for the 10 existing users), not something this
 * change silently solves.
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
    // The Function's ok()/err() envelope: { success: true, data: user } or
    // { success: false, error: msg }. Handled defensively in case that
    // envelope shape differs from what fetchFromApi elsewhere assumes.
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

  try {
    const res = await fetch(endpoint, {
      method: 'HEAD',
      headers: { 'Cache-Control': 'no-cache' },
    }).catch(() =>
      fetch(endpoint, { method: 'GET', headers: { 'Cache-Control': 'no-cache' } })
    );

    const latencyMs = Math.round(performance.now() - start);

    if (res.ok || res.status === 401 || res.status === 403 || res.status === 405) {
      return {
        ok: true,
        latencyMs,
        endpoint,
        message: `Endpoint reachable (${res.status} ${res.statusText}) in ${latencyMs}ms.`,
      };
    }

    return {
      ok: false,
      latencyMs,
      endpoint,
      message: `Endpoint responded with HTTP ${res.status}: ${res.statusText}`,
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
