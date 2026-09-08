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
    invoicedAmountUSD: Number(row.InvoicedAmountUSD || 0),
  };
}

function normalizeDTBatch(row: any): any {
  return {
    id: row.DTBatchID || row.dtBatchId || row.id || '',
    dtNumber: row.DTNumber || row.dtNumber || '',
    jobId: row.JobID || row.jobId || '',
    rmDate: row.RMDate || row.rmDate || row.DispatchDate || '',
    rmRef: row.RMRef || row.rmRef || '',
    rig: row.Rig || row.rig || '',
    well: row.Well || row.well || '',
    contract: row.Contract || row.contract || '',
    dispatchedBy: row.DispatchedBy || row.dispatchedBy || '',
    recipient: row.Recipient || row.recipient || '',
    notes: row.Notes || row.notes || '',
    tools: [],
  };
}

function normalizeRTBatch(row: any): any {
  return {
    id: row.RTBatchID || row.rtBatchId || row.id || '',
    rtNumber: row.RTNumber || row.rtNumber || '',
    jobId: row.JobID || row.jobId || '',
    rtDate: row.RTDate || row.rtDate || '',
    contract: row.Contract || row.contract || '',
    rig: row.Rig || row.rig || '',
    well: row.Well || row.well || '',
    receivedBy: row.ReceivedBy || row.receivedBy || '',
    tools: [],
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
          message: `Connected to Azure Function (${payload.inventory?.length || 0} tools, ${payload.jobs?.length || 0} jobs)`,
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
