/**
 * EMDAD Operations Platform - Type Definitions
 */

export type UserRole = 'Admin' | 'Handler' | 'QC' | 'Inspector' | 'Accounts' | 'Viewer' | 'Operations';

export interface User {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  pass: string;
}

export type NavModule =
  | 'dashboard'          // Operations Dashboard
  | 'callouts'           // Rig Callouts
  | 'jobs'               // Drilling Jobs
  | 'dt'                 // Delivery Tickets (DT)
  | 'rt'                 // Receiving Tickets (RT)
  | 'gatepass'           // Security Gate Pass
  | 'utilization'        // Fleet Utilization (Moved to Operations Module)
  | 'inventory-dash'     // Inventory Dashboard
  | 'inventory'          // Tool Fleet Catalog
  | 'maintenance-dash'   // Maintenance & QC Dashboard
  | 'inspection'         // QC Inspection Bay
  | 'maintenance'        // Maintenance Orders
  | 'billing-dash'       // Billing Dashboard
  | 'contracts'          // Master Contracts
  | 'settings';          // System & Azure SQL

export type ViewKey = NavModule;

export interface ToolItem {
  id: string;          // SystemID (e.g. EMD-1125, 351)
  serial: string;      // Serial Number / SystemID
  assetNo: string;     // Asset/Part Number (e.g. DJ650-003)
  size: string;        // e.g. 8", 6-3/4", 9-1/2"
  shortDesc: string;   // Category / Tool Type (e.g. HYD DRILLING JAR)
  desc: string;        // Full technical description
  qty: number;
  location: string;    // Emdad Base, On Rig, Inspection Bay, Workshop, Returned to Supplier
  status: 'Good' | 'Repair' | 'Inspection' | 'Redress' | 'Removed' | 'On Rig';
  ownership: string;   // EMDAD, MOTORMAX, EPIS, ELITE, SALTIRE, FLOW TOOLS, etc.
  isEmdad: boolean;
  oemSerial?: string;
  supplier?: string;
  addedDate?: string;
  rig?: string;
  well?: string;
  contract?: string;
  currentJobId?: string | null;
}

export interface CalloutItem {
  seq: number;
  size: string;
  shortDesc: string;
  qty: number;
  assigned: number;
  serialNos: string[];
  status: 'Pending' | 'Partial' | 'Assigned' | 'Released';
}

export interface Callout {
  id: string;           // CAL-YY-NNNNN
  CalloutID?: string;
  rig: string;
  well: string;
  client: string;
  contract?: string;
  poRef?: string;
  status: 'Active' | 'Forecast' | 'Closed' | 'Pending' | 'In Progress';
  createdDate: string;
  items: CalloutItem[];
  jobId?: string | null;
}

export type JobLifecycleStatus =
  | 'Open'
  | 'Ongoing'
  | 'Job completed and waiting signed docs'
  | 'Job completed'
  | 'Tickets submitted to billing team'
  | 'Draft invoiced'
  | 'Under SES approval'
  | 'Final invoiced'
  | 'Closed';

export interface DrillingJob {
  id: string;           // JOB-YY-NNNNN
  JobID?: string;
  jobNumber?: string;
  calloutId?: string | null;
  rig: string;
  well: string;
  client: string;
  contract?: string;
  poNumber?: string;
  clientRef?: string;
  erpRef?: string;
  holeSection?: string;
  serviceType?: string;
  invoicingType?: 'PerJob' | 'Monthly';
  currency?: string;
  mobDate?: string | null;
  demobDate?: string | null;
  status: JobLifecycleStatus;
  createdDate?: string;
  createdBy?: string;
  // Lifecycle timestamps & details
  firstDtDate?: string | null;
  lastRtDate?: string | null;
  docsSignedDate?: string | null;
  submittedToBillingDate?: string | null;
  draftInvoicedDate?: string | null;
  sesSubmittedDate?: string | null;
  finalInvoicedDate?: string | null;
  draftInvoiceNumber?: string;
  sesNumber?: string;
  legalInvoiceNumber?: string;
  invoiceAmount?: number | null;
  notes?: string;
}

export interface DTLine {
  serial: string;
  assetNo: string;
  shortDesc: string;
  desc: string;
  size: string;
  status: 'OnRig' | 'Returned';
  rtBatchId?: string | null;
  used?: boolean | null;
  ownership: string;
  isEmdad: boolean;
}

export interface DTBatch {
  id: string;           // DTB-timestamp
  DTBatchID?: string;
  dtNumber: string;     // DT-YY-NNNNN
  jobId: string;
  rmDate: string;
  rmRef: string;
  dispatchDate: string;
  rig: string;
  well: string;
  contract?: string;
  dispatchedBy: string;
  recipient?: string;
  notes?: string;
  toolLines: DTLine[];
  isLocked?: boolean;
  lockedBy?: string;
  lockedDate?: string;
  // Document attachment
  signedDocUrl?: string;
  signedDocName?: string;
  signedDate?: string;
  isSigned?: boolean;
}

export interface RTLine {
  serial: string;
  assetNo: string;
  shortDesc: string;
  dtBatchId?: string;
  used: boolean;
  routedTo: string;
  condition?: string;
  size?: string;
  ownership?: string;
}

export interface RTBatch {
  id: string;           // RTB-timestamp
  RTBatchID?: string;
  rtNumber: string;     // RT-YY-NNNNN
  jobId: string;
  rtDate: string;
  backloadRmDate?: string;
  contract?: string;
  rig: string;
  well: string;
  receivedBy: string;
  toolLines: RTLine[];
  // Document attachment
  signedDocUrl?: string;
  signedDocName?: string;
  signedDate?: string;
  isSigned?: boolean;
}

export interface GatePassLine {
  serial: string;
  assetNo: string;
  shortDesc: string;
  size: string;
  qty: number;
  condition?: string;
}

export interface GatePass {
  id: string;
  gpNumber: string;     // GP-YY-NNNNN
  supplier: string;
  gpDate: string;
  preparedBy: string;
  authorizedBy?: string;
  notes?: string;
  toolLines: GatePassLine[];
}

export interface InspectionRecord {
  id: string;           // INS-YY-NNNNN
  woNumber: string;     // WO-INS-YY-NNNNN
  serial: string;
  assetNo: string;
  shortDesc: string;
  size: string;
  fromRtId?: string | null;
  rtNumber?: string;
  receivedDate: string;
  inspector?: string;
  inspectionDate?: string | null;
  status: 'Pending' | 'Complete' | 'Pass' | 'Fail';
  reportNumber?: string;
  hasReport?: boolean;
  reportDate?: string | null;
  reportDocUrl?: string;
  reportDocName?: string;
  qcApproved?: boolean;
  qcApprovedBy?: string | null;
  qcApprovedDate?: string | null;
  disposition?: string | null;
  notes?: string;
}

export interface MaintenanceRecord {
  id: string;           // MNT-YY-NNNNN
  woNumber: string;     // WO-MNT-YY-NNNNN
  serial: string;
  assetNo: string;
  shortDesc: string;
  size: string;
  fromInspectionId?: string | null;
  issue: string;
  type: 'InHouse' | 'Vendor' | 'ThirdParty';
  vendor?: string;
  vendorPoRef?: string;
  vendorQuoteRef?: string;
  vendorInvoiceRef?: string;
  repairScope?: string;
  partsReplaced?: string;
  assignedTo?: string;
  startDate: string;
  dispatchToVendorDate?: string | null;
  receivedFromVendorDate?: string | null;
  estCompleteDate?: string | null;
  completedDate?: string | null;
  status: 'In Progress' | 'Sent to Vendor' | 'Received from Vendor' | 'Ready for QC' | 'Awaiting Parts' | 'Complete - Ready' | 'Completed' | 'Closed';
  stage?: 'Workshop' | 'Dispatched to Vendor' | 'Received from Vendor' | 'Ready for QC' | 'Completed';
  cost?: number | null;
  estCost?: number | null;
  hasReport?: boolean;
  reportDocUrl?: string;
  reportDocName?: string;
  thirdPartyCocRef?: string;
  hasThirdPartyCoc?: boolean;
  thirdPartyCocDocUrl?: string;
  thirdPartyCocDocName?: string;
  notes?: string;
}

export interface JobUtRow {
  id: string;
  serial: string;
  assetNo: string;
  desc: string;
  dtNum: string;
  dtDate: string;
  rmDateDispatch: string;
  rtNum?: string;
  rtDate?: string;
  rmDateBackload?: string;
  rotHours?: number | string;
}

export interface JobUtData {
  jobId: string;
  cells: Record<string, string>; // key: `${rowId}|${YYYY-MM-DD}` => 'S' | '1' | 'B' | ''
  rmDates?: Record<string, { rmDateDispatch?: string; rmDateBackload?: string; rotHours?: string }>;
  savedMonths?: Record<string, { at: string }>;
  rates?: {
    currency: string;
    standby: number;
    ops: number;
    cap: number | null;
  };
  signedDocUrl?: string;
  signedDocName?: string;
  signedDate?: string;
  isSigned?: boolean;
}

export interface ContractRecord {
  id: string;
  contractNo?: string;
  contractRef?: string;
  name?: string;
  client: string;
  poNumber?: string;
  currency: string;
  status: 'Active' | 'Completed' | 'Expired';
  contractValue?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  standbyDiscountPct?: number;
  description?: string;
  pbgNumber?: string;
  pbgValue?: number | null;
  pbgIssueDate?: string | null;
  pbgExpiryDate?: string | null;
  invoicedToDate?: number | null;
  notes?: string;
}

export interface MovementLog {
  id: number;
  serial: string;
  action: string;
  from: string;
  to: string;
  ref: string;
  date: string;
  by: string;
}

export interface ToastMessage {
  id: string;
  msg: string;
  type?: 'ok' | 'err' | 'wrn' | 'inf';
}

export interface AppState {
  inventory: ToolItem[];
  callouts: Callout[];
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  inspections: InspectionRecord[];
  maintenance: MaintenanceRecord[];
  gatePasses: GatePass[];
  contracts: ContractRecord[];
}

export interface SubmittedInvoiceRecord {
  invoiceNo: string;
  jobId: string;
  periodYM: string;
  submittedAt: string;
  subtotal: number;
  vatAmount: number;
  totalWithVat: number;
  status: 'Submitted' | 'Draft' | 'Final';
  notes?: string;
}
