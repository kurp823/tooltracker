/**
 * Official EMDAD Ticket & Manifest Printout Service
 * Replicates the exact official formats:
 * 1. DELIVERY TICKET (Form No.: DSF-001 Rev.: 02, 01-Jul-2018)
 * 2. DISPATCH CHECKLIST (Form No.: DSF-003, Rev.: 02, 01-Jul-2018)
 * 3. RECEIVING TICKET (Form No.: DSF-001 Rev.: 02, 01-Jul-2018)
 */

import { EMDAD_LOGO_BASE64 } from '../constants/branding';

export interface DeliveryTicketPrintData {
  dtNumber: string;
  client?: string;
  materialRequest?: string;
  jobNumber?: string;
  clientRef?: string;
  radioMsgNo?: string;
  serviceTicket?: string;
  ticketNo?: string;
  contractNo?: string;
  rig?: string;
  well?: string;
  shippedDate?: string;
  deliveredTo?: string;
  msvName?: string;
  vehicleVesselNo?: string;
  driverName?: string;
  contactNo?: string;
  notes?: string;
  tools: Array<{
    itemNo?: number | string;
    partNo?: string;
    description: string;
    qty: number;
    serial?: string;
    size?: string;
  }>;
}

export interface DispatchChecklistPrintData {
  ticketNo?: string;
  project?: string;
  projectDesc?: string;
  dtNumber?: string;
  rig?: string;
  well?: string;
  date?: string;
  client?: string;
  comments?: string;
  wellId?: string;
  tools: Array<{
    lineNo?: number | string;
    partNo?: string;
    description: string;
    qty: number;
  }>;
}

export interface ReceivingTicketPrintData {
  rtNumber: string;
  client?: string;
  jobNumber?: string;
  vehicleVesselNo?: string;
  clientRef?: string;
  projectNo?: string;
  lNoteNo?: string;
  serviceTicketNo?: string;
  dateReceived?: string;
  rig?: string;
  well?: string;
  lNoteDate?: string;
  notes?: string;
  tools: Array<{
    itemNo?: number | string;
    serialNo?: string;
    description: string;
    qty: number;
    remarks?: string; // 'Used' | 'Not Used'
  }>;
}

// Common CSS for print preview & paper output
const COMMON_PRINT_CSS = `
  @page {
    size: A4 portrait;
    margin: 10mm 12mm 10mm 12mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    font-size: 9pt;
    color: #000;
    line-height: 1.35;
    margin: 0;
    padding: 10px;
    background: #fff;
  }
  .print-page {
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
    background: #fff;
    position: relative;
  }
  .header-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 4px;
    position: relative;
  }
  .header-logo {
    height: 38px;
    width: auto;
    object-fit: contain;
  }
  .header-title {
    font-size: 14pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: center;
    flex: 1;
  }
  .header-ticket-right {
    font-size: 9.5pt;
    font-weight: bold;
    color: #000;
    text-align: right;
    white-space: nowrap;
  }
  .header-line {
    border-bottom: 1.5px solid #000;
    margin: 6px 0 10px 0;
  }
  .meta-grid {
    display: grid;
    margin-bottom: 12px;
    font-size: 8.5pt;
    line-height: 1.55;
  }
  .meta-row {
    display: flex;
    align-items: flex-start;
  }
  .meta-label {
    font-weight: bold;
    color: #000;
    white-space: nowrap;
  }
  .meta-colon {
    padding: 0 4px;
    font-weight: bold;
  }
  .meta-val {
    color: #000;
    word-break: break-word;
    font-weight: 500;
  }
  table.items-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
    margin-bottom: 12px;
    font-size: 8.5pt;
  }
  table.items-table thead tr {
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    background-color: #fff;
  }
  table.items-table th {
    padding: 4px 6px;
    font-weight: bold;
    color: #000;
    text-align: left;
    border-left: 1px solid #000;
    border-right: 1px solid #000;
  }
  table.items-table th:first-child {
    border-left: 1px solid #000;
  }
  table.items-table th:last-child {
    border-right: 1px solid #000;
  }
  table.items-table td {
    padding: 3.5px 6px;
    vertical-align: top;
    color: #000;
    border-left: 1px solid #000;
    border-right: 1px solid #000;
  }
  table.items-table tbody tr {
    page-break-inside: avoid;
    border-bottom: 0.5px solid #d1d5db;
  }
  table.items-table tbody tr:last-child {
    border-bottom: 1px solid #000;
  }
  .center {
    text-align: center !important;
  }
  .right {
    text-align: right !important;
  }
  .bold {
    font-weight: bold;
  }
  .signature-block {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 25px;
    padding: 0 30px;
    page-break-inside: avoid;
  }
  .sig-col {
    text-align: center;
    width: 240px;
  }
  .sig-title {
    font-size: 9pt;
    font-weight: bold;
    margin-bottom: 40px;
  }
  .sig-line {
    border-top: 1px solid #000;
    width: 100%;
  }
  .page-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 8pt;
    color: #333;
    margin-top: 15px;
    padding-top: 4px;
    border-top: 0.5px solid #ccc;
    page-break-inside: avoid;
  }
  .checklist-box {
    border-top: 1px solid #000;
    margin-top: 15px;
    padding-top: 10px;
    font-size: 8.5pt;
    page-break-inside: avoid;
  }
  .checklist-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 20px;
    margin-bottom: 10px;
  }
  .check-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .check-sq {
    display: inline-block;
    width: 11px;
    height: 11px;
    border: 1.5px solid #000;
    border-radius: 1px;
  }
  .comments-box {
    margin-top: 6px;
  }
  .comments-inner {
    border: 1px solid #8b5cf6;
    border-radius: 2px;
    padding: 6px 10px;
    margin-top: 4px;
    font-size: 8.5pt;
    min-height: 22px;
  }
  @media print {
    body {
      padding: 0;
    }
    .no-print {
      display: none !important;
    }
  }
`;

/**
 * 1. DELIVERY TICKET (DSF-001)
 */
export function generateDeliveryTicketHtml(data: DeliveryTicketPrintData): string {
  const tools = data.tools && data.tools.length > 0 ? data.tools : [
    { itemNo: 1, partNo: '—', description: 'No tools listed', qty: 1 }
  ];

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Delivery Ticket - ${data.dtNumber}</title>
<style>${COMMON_PRINT_CSS}</style>
</head>
<body>
  <div class="print-page">
    <!-- Header with Logo and Centered Underlined Title -->
    <div class="header-container">
      <img src="${EMDAD_LOGO_BASE64}" alt="EMDAD Logo" class="header-logo" />
      <div class="header-title" style="text-decoration: underline;">DELIVERY TICKET</div>
      <div style="width: 120px;"></div> <!-- Balancer for centering -->
    </div>

    <!-- Solid Divider Line -->
    <div class="header-line"></div>

    <!-- 3-Column Metadata Grid Matching PDF Format -->
    <div class="meta-grid" style="grid-template-columns: 36% 32% 32%; gap: 3px 12px;">
      <!-- Column 1 -->
      <div>
        <div class="meta-row">
          <span class="meta-label" style="width: 105px;">Client</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.client || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 105px;">Material Request</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.materialRequest || 'MR FROM CLIENT'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 105px;">Job Number</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.jobNumber || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 105px;">Client Ref.</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.clientRef || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 105px;">Radio Msg No.</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.radioMsgNo || 'N/A'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 105px;">Service Ticket</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.serviceTicket || data.jobNumber || '—'}</span>
        </div>
      </div>

      <!-- Column 2 -->
      <div>
        <div class="meta-row">
          <span class="meta-label" style="width: 85px;">Ticket No.</span>
          <span class="meta-colon">:</span>
          <span class="meta-val bold">${data.dtNumber}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 85px;">Contract No.</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.contractNo || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 85px;">Rig</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.rig || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 85px;">Well</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.well || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 85px;">Shipped</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.shippedDate || '—'}</span>
        </div>
      </div>

      <!-- Column 3 -->
      <div>
        <div class="meta-row">
          <span class="meta-label" style="width: 110px;">Delivered To</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.deliveredTo || 'YARD 08'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 110px;">MSV Name</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.msvName || 'MARSOL SUPREME'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 110px;">Vehicle No./Vessel No.</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.vehicleVesselNo || '70136 AD/54912'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 110px;">Driver Name</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.driverName || 'SARWAN/JAGJEETH SINGH'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 110px;">Contact No.</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.contactNo || '055 890 7562/0555971632'}</span>
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 60px;" class="center">Item No.</th>
          <th style="width: 140px;">Part No</th>
          <th>Description</th>
          <th style="width: 50px;" class="center">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${tools.map((t, idx) => `
          <tr>
            <td class="center">${t.itemNo ?? idx + 1}</td>
            <td class="bold">${t.partNo || t.serial || '—'}</td>
            <td>${t.description}</td>
            <td class="center">${t.qty ?? 1}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    ${data.notes ? `
      <div style="margin: 12px 0 8px 0; font-size: 8.5pt;">
        <strong>Notes :</strong> ${data.notes}
      </div>
    ` : ''}

    <!-- Signatures -->
    <div class="signature-block">
      <div class="sig-col">
        <div class="sig-title">Authorised Signature</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-col">
        <div class="sig-title">Customer Signature &amp; Stamp</div>
        <div class="sig-line"></div>
      </div>
    </div>

    <!-- Page Footer -->
    <div class="page-footer">
      <div>Form No.: DSF-001 Rev.: 02, 01-Jul-2018</div>
      <div>EMDAD L.L.C</div>
      <div>1 of 1</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 2. DISPATCH CHECKLIST (DSF-003)
 */
export function generateDispatchChecklistHtml(data: DispatchChecklistPrintData): string {
  const tools = data.tools && data.tools.length > 0 ? data.tools : [
    { lineNo: 1, partNo: '—', description: 'No tools listed', qty: 1 }
  ];

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Dispatch Checklist - ${data.ticketNo || data.dtNumber || 'Checklist'}</title>
<style>${COMMON_PRINT_CSS}</style>
</head>
<body>
  <div class="print-page">
    <!-- Header with Logo, Centered Title, and Ticket No on Right -->
    <div class="header-container">
      <img src="${EMDAD_LOGO_BASE64}" alt="EMDAD Logo" class="header-logo" />
      <div class="header-title">DISPATCH CHECKLIST</div>
      <div class="header-ticket-right">Ticket No : ${data.ticketNo || data.dtNumber || '—'}</div>
    </div>

    <!-- Solid Divider Line -->
    <div class="header-line"></div>

    <!-- Metadata Grid (3 Columns) -->
    <div class="meta-grid" style="grid-template-columns: 34% 33% 33%; gap: 3px 14px;">
      <!-- Row 1 -->
      <div class="meta-row">
        <span class="meta-label" style="width: 110px;">PROJECT</span>
        <span class="meta-colon">:</span>
        <span class="meta-val">${data.project || '—'}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label" style="width: 60px;">RIG</span>
        <span class="meta-colon">:</span>
        <span class="meta-val">${data.rig || '—'}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label" style="width: 60px;">DATE</span>
        <span class="meta-colon">:</span>
        <span class="meta-val">${data.date || '—'}</span>
      </div>

      <!-- Row 2 -->
      <div class="meta-row">
        <span class="meta-label" style="width: 110px;">PROJECT DESC</span>
        <span class="meta-colon">:</span>
        <span class="meta-val">${data.projectDesc || data.project || '—'}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label" style="width: 60px;">WELL</span>
        <span class="meta-colon">:</span>
        <span class="meta-val">${data.well || '—'}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label" style="width: 60px;">CLIENT</span>
        <span class="meta-colon">:</span>
        <span class="meta-val">${data.client || '—'}</span>
      </div>

      <!-- Row 3 -->
      <div class="meta-row" style="grid-column: span 3;">
        <span class="meta-label" style="width: 150px;">DELIVERY TICKET NO.</span>
        <span class="meta-colon">:</span>
        <span class="meta-val bold">${data.dtNumber || '—'}</span>
      </div>
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 60px;" class="center">Line No.</th>
          <th style="width: 140px;">Part No</th>
          <th>Description</th>
          <th style="width: 50px;" class="center">Qty.</th>
        </tr>
      </thead>
      <tbody>
        ${tools.map((t, idx) => `
          <tr>
            <td class="center">${t.lineNo ?? idx + 1}</td>
            <td class="bold">${t.partNo || '—'}</td>
            <td>${t.description}</td>
            <td class="center">${t.qty ?? 1}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Quality & Rig Inspection Checklist (Mandatory Section) -->
    <div class="checklist-box">
      <div class="checklist-grid">
        <div class="check-item"><span class="check-sq"></span> Asset numbers are visible</div>
        <div class="check-item"><span class="check-sq"></span> Basket Color coded</div>
        <div class="check-item"><span class="check-sq"></span> Thread protectors are available (For Applicable)</div>
        <div class="check-item"><span class="check-sq"></span> Slings &amp; shackles secured with Safety pin</div>
        <div class="check-item"><span class="check-sq"></span> Tools secured properly</div>
        <div class="check-item"><span class="check-sq"></span> Confirm the SWL of Basket</div>
      </div>

      <div class="comments-box">
        <strong>Comments :</strong>
        <div class="comments-inner">
          ${data.comments || (data.wellId ? `WELL'S ID - ${data.wellId}` : 'ALL TOOLS CHECKED & VERIFIED FIT FOR MOBILIZATION')}
        </div>
      </div>
    </div>

    <!-- Signatures -->
    <div style="display: flex; justify-content: space-between; padding: 0 40px; margin-top: 30px; font-size: 9pt; font-weight: bold;">
      <div>Prepared By</div>
      <div>Verified By</div>
    </div>

    <!-- Page Footer -->
    <div class="page-footer">
      <div>Form No. : DSF-003, Rev.: 02, 01-Jul-2018</div>
      <div>EMDAD LLC.</div>
      <div>Page 1 of 1</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 3. RECEIVING TICKET (DSF-001)
 */
export function generateReceivingTicketHtml(data: ReceivingTicketPrintData): string {
  const tools = data.tools && data.tools.length > 0 ? data.tools : [
    { itemNo: 1, serialNo: '—', description: 'No returned tools listed', qty: 1, remarks: 'Not Used' }
  ];

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Receiving Ticket - ${data.rtNumber}</title>
<style>${COMMON_PRINT_CSS}</style>
</head>
<body>
  <div class="print-page">
    <!-- Header with Logo, Centered Title, and Ticket No on Right -->
    <div class="header-container">
      <img src="${EMDAD_LOGO_BASE64}" alt="EMDAD Logo" class="header-logo" />
      <div class="header-title" style="text-decoration: underline;">RECEIVING TICKET</div>
      <div class="header-ticket-right">Ticket No : ${data.rtNumber}</div>
    </div>

    <!-- Solid Divider Line -->
    <div class="header-line"></div>

    <!-- 2-Column Metadata Grid Matching PDF Format -->
    <div class="meta-grid" style="grid-template-columns: 50% 50%; gap: 3px 20px;">
      <!-- Column 1 (Left) -->
      <div>
        <div class="meta-row">
          <span class="meta-label" style="width: 140px;">Backload From</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.client || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 140px;">Job Number</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.jobNumber || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 140px;">Vessel No./Vehicle No.</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.vehicleVesselNo || 'CREST MERCURY TWO'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 140px;">Client Ref</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.clientRef || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 140px;">Project No</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.projectNo || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 140px;">L.Note / Manifest No</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.lNoteNo || '—'}</span>
        </div>
      </div>

      <!-- Column 2 (Right) -->
      <div>
        <div class="meta-row">
          <span class="meta-label" style="width: 140px;">Service Ticket Number</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.serviceTicketNo || data.jobNumber || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 140px;">Date Received</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.dateReceived || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 140px;">Rig</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.rig || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 140px;">Well</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.well || '—'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label" style="width: 140px;">L.Note / Manifest Date</span>
          <span class="meta-colon">:</span>
          <span class="meta-val">${data.lNoteDate || data.dateReceived || '—'}</span>
        </div>
      </div>
    </div>

    <!-- Items Table with Remarks Column -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 50px;" class="center">Item #</th>
          <th style="width: 130px;">Serial No.</th>
          <th>Description</th>
          <th style="width: 50px;" class="center">Qty.</th>
          <th style="width: 90px;" class="center">Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${tools.map((t, idx) => `
          <tr>
            <td class="center">${t.itemNo ?? idx + 1}</td>
            <td class="bold">${t.serialNo || '—'}</td>
            <td>${t.description}</td>
            <td class="center">${t.qty ?? 1}</td>
            <td class="center font-medium">${t.remarks || 'Not Used'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    ${data.notes ? `
      <div style="margin: 12px 0 8px 0; font-size: 8.5pt;">
        <strong>Note :</strong> ${data.notes}
      </div>
    ` : ''}

    <!-- Signatures -->
    <div class="signature-block">
      <div class="sig-col">
        <div class="sig-title">Authorised Signature</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-col">
        <div class="sig-title">Customer Signature &amp; Stamp</div>
        <div class="sig-line"></div>
      </div>
    </div>

    <!-- Page Footer -->
    <div class="page-footer">
      <div>Form No.: DSF-001 Rev.: 02, 01-Jul-2018</div>
      <div>EMDAD L.L.C</div>
      <div>1 of 1</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Universal print window launcher with popup protection & auto-print trigger
 */
export function openPrintWindow(htmlContent: string, title = 'EMDAD Printout'): void {
  const printWindow = window.open('', '_blank', 'width=950,height=750');
  if (!printWindow) {
    alert('Please allow popups in your browser to view and print official EMDAD tickets.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 350);
}
