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
 * Attempts to fetch live data from the Azure Function backend
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
  source: 'azure-function' | 'failed';
  message: string;
}> {
  const endpoint = getApiEndpoint();

  try {
    const res = await fetch(`${endpoint}?action=GET_ALL_DATA&env=live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'GET_ALL_DATA', env: 'live' }),
    });

    if (res.ok) {
      const json = await res.json();
      const payload = json.data || json;
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
          },
          message: `Connected to Azure Function (${payload.inventory?.length || 0} tools, ${payload.jobs?.length || 0} jobs, ${payload.dtBatches?.length || 0} delivery tickets, ${payload.rtBatches?.length || 0} receiving tickets)`,
        };
      }
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
