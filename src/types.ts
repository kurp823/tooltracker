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
  mustChangePassword?: boolean;
}

export type NavModule =
  | 'dashboard'          // Operations Dashboard
  | 'callouts'           // Rig Callouts
  | 'jobs'               // Drilling Jobs
  | 'dt'                 // Delivery Tickets (DT)
  | 'rt'                 // Receiving Tickets (RT)
  | 'gatepass'           // Security Gate Pass
  | 'job-tools-list'     // Job Tools List (JST_Job_ToolsList)
  | 'tool-history'       // Tool Movement History (Multi-job tool trail)
  | 'utilization'        // Fleet Utilization (Moved to Operations Module)
  | 'inventory-dash'     // Inventory Dashboard
  | 'inventory'          // Tool Fleet Catalog
  | 'categories-sizes'   // Tool Categories & Sizes Master
  | 'maintenance-dash'   // Maintenance & QC Dashboard
  | 'inspection'         // QC Inspection Bay
  | 'maintenance'        // Maintenance Orders
  | 'billing-dash'       // Billing Dashboard
  | 'invoicing'          // Invoicing Screen (Audit, Verification Ledger, Draft & Final Legal Invoices)
  | 'billing-package'    // Invoice & Billing Package Generator (Calculation Ticket + Draft Invoice)
  | 'tool-revenue-report' // Tool Fleet Revenue & Utilization Analytics Report
  | 'subcontractor-rentals' // Sub-Contractor Tool Rentals (Lease Rental-Equipment)
  | 'monthly-expenses'   // Monthly Expense Grid & Sub-Division P&L
  | 'consumables'        // Consumables Store & Store Issuance Vouchers
  | 'po-management'     // PO Creation, Bulk Upload, Multi-Line GRNs & Supplier Reports
  | 'contract-dash'      // Contracts Analytics Dashboard (Ceiling vs Legally Invoiced Revenue)
  | 'contracts'          // Master Contracts Register
  | 'data-management'   // Data Management Tool (DMT)
  | 'settings';          // System & Azure SQL

export type ViewKey = NavModule;

export type SubDivision = 'FISHING' | 'WHIPSTOCK' | 'RENTALS';

export interface ToolItem {
  id: string;          // SystemID (e.g. EMD-1125, 351)
  serial: string;      // Serial Number / SystemID
  assetNo: string;     // Asset/Part Number (e.g. DJ650-003)
  size: string;        // e.g. 8", 6-3/4", 9-1/2"
  shortDesc: string;   // Category / Tool Type (e.g. HYD DRILLING JAR)
  desc: string;        // Full technical description
  qty: number;
  location: string;    // Emdad Base, On Rig, Inspection Bay, Workshop, Returned to Supplier
  status: 'Good' | 'Reserved' | 'Repair' | 'Inspection' | 'Redress' | 'Removed' | 'On Rig' | 'Lost in Hole' | 'Scrapped' | string;
  ownership: string;   // EMDAD, MOTORMAX, EPIS, ELITE, SALTIRE, FLOW TOOLS, etc.
  isEmdad: boolean;
  oemSerial?: string;
  supplier?: string;
  addedDate?: string;
  rig?: string;
  well?: string;
  contract?: string;
  currentJobId?: string | null;
  // Sub-Rental Financial & Commercial Tracking
  subRentalAgreementType?: 'Daily' | 'BackToBack' | 'MonthlyPool';
  subRentalDailyRate?: number | null;     // Supplier daily cost rate (e.g. AED 4,200)
  subRentalMonthlyRate?: number | null;   // Supplier monthly cost (if MonthlyPool)
  subRentalOperatingRate?: number | null; // Operations day rate (e.g. AED 4,500)
  subRentalStandbyRate?: number | null;   // Standby day rate (e.g. AED 3,000)
  subRentalRunCharge?: number | null;     // Run charge / RIH charge
  subRentalRedressCharge?: number | null; // Redress / refurbishment charge
  supplierPoNumber?: string;              // e.g. PO-4200222381
  supplierCurrency?: string;              // AED / USD
  rentalStartDate?: string | null;        // Delivery/custody start date
  rentalEndDate?: string | null;          // Off-hire / return date
  // Tool Reservation (set when tool is ticked into a job checklist)
  reservedForJob?: string;               // e.g. "JOB-26-01839"
  reservedForRig?: string;               // e.g. "AD-117"
  reservedForWell?: string;              // e.g. "BB-543"
}

export interface CalloutItem {
  seq: number;
  size: string;
  shortDesc: string;
  qty: number;
  assigned: number;
  serialNos: string[];
  status: 'Pending' | 'Partial' | 'Assigned' | 'Released';
  dtNumber?: string;
  partNo?: string;
  description?: string;
  supplier?: string;
  ownership?: string;
  isEmdad?: boolean;
  qtyIn?: number;
  insNum?: string;
  insDate?: string;
  comments?: string;
  cat?: string;
  condition?: string;
  allocatedRig?: string;
  allocatedWell?: string;
  clientDtNo?: string;
  mobDate?: string;
}

export interface Callout {
  id: string;           // CAL-YY-NNNNN or ticket number (e.g. 2120, 2266)
  CalloutID?: string;
  rig: string;
  well: string;
  client: string;
  contract?: string;
  poRef?: string;
  poNumber?: string;
  status: 'Active' | 'Forecast' | 'Closed' | 'Pending' | 'In Progress' | 'Checklist - Opened' | 'Delivery Ticket - Created' | 'Delivery Ticket - Released';
  createdDate: string;
  items: CalloutItem[];
  jobId?: string | null;
  ticketNo?: string;
  reqDate?: string;
  projectNo?: string;
  emailRef?: string;
  taskorderNo?: string;
  notes?: string;
}

export type JobLifecycleStatus =
  | 'Open'
  | 'Ongoing'
  | 'Waiting on Signed Docs'
  | 'Submitted to Billing Team'
  | 'SES Submitted'
  | 'Completed'
  | 'Job completed and waiting signed docs'
  | 'Job completed'
  | 'Tickets submitted to billing team'
  | 'Draft invoiced'
  | 'Under SES approval'
  | 'Final invoiced'
  | 'Closed';

export interface JobStatusTransition {
  id: string;
  fromStatus: string;
  toStatus: string;
  date: string; // YYYY-MM-DD
  daysInStage: number; // How many days were spent in the previous status
  changedBy: string;
  notes?: string;
  docRef?: string; // e.g. signed ticket transmittal, draft inv #, SES #, legal inv #
  signedDocsConfirmed?: boolean;
}

export type AttachmentCategory =
  | 'Signed Delivery Ticket'
  | 'Combined DT & Manifest'
  | 'Client Mobilization Manifest'
  | 'Signed Receiving Ticket'
  | 'Combined RT & Demob Manifest'
  | 'Client Demobilization Manifest'
  | 'Dual-Signed Rig Daily Log'
  | 'Utilization Sign-off'
  | 'Inspection / MPI Certificate'
  | 'Other Supporting Document';

export interface AttachedDoc {
  id: string;
  name: string;
  url: string;
  category: AttachmentCategory;
  sourceType: 'DT' | 'RT' | 'Utilization' | 'Job';
  sourceRef: string; // e.g. "DT-02171", "RT-02214", "Rig AD-63 Daily Log"
  uploadDate: string;
  uploadedBy?: string;
  fileSize?: string;
  notes?: string;
}

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
  poValue?: number;
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
  firstDtDate?: string;
  lastRtDate?: string;
  // Lifecycle timestamps & stage tracking
  openedDate?: string;
  ongoingDate?: string;
  waitingSignedDocsDate?: string;
  submittedToBillingDate?: string | null;
  draftInvoicedDate?: string | null;
  sesSubmittedDate?: string | null;
  finalInvoicedDate?: string | null;
  completedDate?: string | null;
  statusHistory?: JobStatusTransition[];
  // Mandatory verification flags
  signedDtAttached?: boolean;
  signedRtAttached?: boolean;
  signedUtilizationAttached?: boolean;
  utilizationAttachments?: AttachedDoc[];
  billingTransmittalRef?: string;
  draftInvoiceNumber?: string;
  sesNumber?: string;
  legalInvoiceNumber?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: number | null;
  notes?: string;
  dtToolsCount?: number;
  rtToolsCount?: number;
  toolsOnRig?: number;
  cost?: string | number;
  jobDescription?: string;
  serviceCategory?: string;
  subDivision?: SubDivision;
  field?: string;
  contractNo?: string;
  technicalDetails?: {
    serviceCategory?: 'Fishing' | 'Whipstock' | 'Rentals';
    casing?: string;
    csgPpf?: string;
    scopeOfWork?: string;
    // Whipstock:
    inclination?: string;
    whipstockType?: 'PERMANENT' | 'RETRIEVABLE';
    settingDepth?: string;
    // Rentals:
    holeSection1?: string;
    casing1?: string;
    holeSection2?: string;
    casing2?: string;
    holeSection3?: string;
    casing3?: string;
    holeSection4?: string;
    casing4?: string;
    holeSection5?: string;
    casing5?: string;
    holeSection6?: string;
    casing6?: string;
    wellboreCleanout1?: boolean;
    casingCleanout1?: string;
    wellboreCleanout2?: boolean;
    casingCleanout2?: string;
  };
  crewMembers?: JobCrewMember[];
  assignedCrew?: JobCrewMember[];
  dailyLogs?: DailyFieldLog[];
  utilizationStatuses?: Record<string, string>;
  lastRtNumber?: string;
  docsSignedDate?: string | null;
  // Sub-Contractor Tool Cost Tracking per Tool & Month
  subRentalCosts?: Record<string, JobToolSubRentalCost>;
}

export interface JobToolSubRentalCost {
  toolKey: string;           // Serial or AssetNo
  supplier: string;          // MOTORMAX, EPIS, ELITE, SALTIRE, etc.
  subSbDays?: number | null; // Subcontract Standby Days
  subOpsDays?: number | null;// Subcontract Operating Days
  subSbRate?: number | null; // Subcontract Standby Rate (AED/day)
  subOpsRate?: number | null;// Subcontract Operating Rate (AED/day)
  subRunCharge?: number | null; // Subcontract Run Charge
  subRedressCharge?: number | null; // Subcontract Redress Charge
  subMonthlyRate?: number | null; // Monthly Pool Charge if applicable
  totalSubCost?: number | null; // Total Accrued Subcontract Cost
  currency?: string;         // AED / USD
  poNumber?: string;         // Supplier PO Number
  notes?: string;
}

export interface DailyFieldLog {
  id: string;
  date: string;         // YYYY-MM-DD or DD-MM-YYYY
  status: 'Operational' | 'Standby';
  depth?: string;        // e.g. "8,450 ft" or "6-1/8 Hole"
  activity: string;     // Drilling / milling / fishing operations summary
  loggedBy: string;     // Engineer name
}

export interface JobCrewMember {
  id: string;
  badgeNo: string;
  name: string;
  designation: string; // e.g. "Lead Fishing Engineer", "Whipstock Specialist", "Field Supervisor"
  mobDate: string;
  demobDate?: string;
  dailyRateUSD: number;
  operatingDays: number;
  standbyDays: number;
  totalChargeUSD: number;
  rigPassNo?: string;
  h2sExpiry?: string;
  status: 'Mobilized (On Rig)' | 'Demobilized' | 'Standby';
  contactNo?: string;
  comments?: string;
}

export interface DTLine {
  id?: number | string;
  itemNo?: number;
  serial: string;
  assetNo: string;
  shortDesc: string;
  desc: string;
  toolDescription?: string;
  size: string;
  status: 'OnRig' | 'Returned';
  rtBatchId?: string | null;
  used?: boolean | null;
  ownership: string;
  isEmdad: boolean;
  qty?: number;
  remarks?: string;
  allocatedRig?: string;
  allocatedWell?: string;
  clientDtNo?: string;
  supplier?: string;
}

export interface DTBatch {
  id: string;           // DTB-timestamp
  DTBatchID?: string;
  dtNumber: string;     // DT-YY-NNNNN
  jobId: string;
  jobNumber?: string;
  client?: string;
  rmDate: string;
  rmRef: string;
  dispatchDate: string;
  deliveryDate?: string;
  rig: string;
  well: string;
  contract?: string;
  dispatchedBy: string;
  recipient?: string;
  notes?: string;
  deliveredTo?: string;
  msvName?: string;
  vesselBoat?: string;
  transport?: string;
  vehicleNo?: string;
  vehicleVesselNo?: string;
  vesselNo?: string;
  driverName?: string;
  contactNo?: string;
  designation?: string;
  toolLines: DTLine[];
  isLocked?: boolean;
  lockedBy?: string;
  lockedDate?: string;
  // Document attachments (supports multiple attachments and combined documents)
  signedDocUrl?: string;
  signedDocName?: string;
  signedDate?: string;
  isSigned?: boolean;
  attachments?: AttachedDoc[];
}

export interface RTLine {
  id?: number | string;
  itemNo?: number;
  serial: string;
  assetNo: string;
  shortDesc: string;
  desc?: string;
  toolDescription?: string;
  dtBatchId?: string;
  used: boolean;
  routedTo: string;
  condition?: string;
  size?: string;
  ownership?: string;
  supplier?: string;
  qty?: number;
  remarks?: string;
  dateIn?: string;
  Date_In?: string;
  DateIn?: string;
  rtDate?: string;
  rtNumber?: string;
  loadingNoteNo?: string;
  loadingNoteDate?: string;
}

export interface RTBatch {
  id: string;           // RTB-timestamp
  RTBatchID?: string;
  rtNumber: string;     // RT-YY-NNNNN
  jobId: string;
  jobNumber?: string;
  client?: string;
  rtDate: string;
  receivingDate?: string;
  emdadSignDate?: string;
  backloadRmDate?: string;
  loadingNoteNo?: string;
  loadingNoteDate?: string;
  lNoteNo?: string;
  lNoteDate?: string;
  carrier?: string;
  shippedVia?: string;
  driverName?: string;
  truckNo?: string;
  contract?: string;
  rig: string;
  well: string;
  receivedBy: string;
  toolLines: RTLine[];
  condition?: string;
  notes?: string;
  isLocked?: boolean;
  recipient?: string;
  // Document attachments (supports multiple attachments and combined documents)
  signedDocUrl?: string;
  signedDocName?: string;
  signedDate?: string;
  isSigned?: boolean;
  attachments?: AttachedDoc[];
}

export interface GatePassLine {
  serial: string;
  assetNo: string;
  shortDesc: string;
  size: string;
  qty: number;
  condition?: string;
  ownership?: string;
}

export interface GatePass {
  id: string;
  gpNumber: string;     // GP-YY-NNNNN
  gpType?: 'Return Third-Party Tool (Permanent)' | 'Dispatch for Repair / Maintenance (Returnable)';
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
  actualCost?: number | null;
  estimatedCost?: number | null;
  facility?: string;
  scope?: string;
  reason?: string;
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
  attachments?: AttachedDoc[];
}

export interface ContractRateItem {
  no?: number | string;
  contractRef?: string;       // e.g. "SCHEDULE 2", "A.3.6"
  category: string;          // ERP Name, e.g. "FAST REAMER", "GUNDRILL REAMER"
  shortDesc: string;         // EMDAD ShortDesc (Inventory Match), e.g. "FAST REAMER", "HWDP"
  size?: string;             // Tool OD, e.g. "12-1/4\"", "16\""
  holeSection?: string;      // Rate Section / Hole Section, e.g. "12-1/4\"", "16\""
  opsRate: number;           // Operating Day Rate (USD/AED)
  standbyRate: number;       // Standby Day Rate (USD/AED)
  runCharges?: number | null;
  monthlyCharges?: number | null;
  redress?: number | null;    // Redress / inspection fee
  currency?: string;         // USD or AED
}

export interface ContractRecord {
  id: string;
  contractNo?: string;
  contractRef?: string;
  subDivision?: SubDivision;
  name?: string;
  shortDesc?: string;
  client: string;
  poNumber?: string;
  currency: string;
  status: 'Active' | 'Completed' | 'Expired' | 'Closed' | 'Archived';
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
  rates?: ContractRateItem[];
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

export interface CalculationTicketLine {
  itemNo: number;
  serialNumber: string;
  toolDescription: string;
  qty: number;
  deliveryTicketNo: string;
  deliveryDate: string;
  returnDate: string;
  rentalDays: number;
  rgtNo: string; // RT No or RGT No
  contractRefOper: string;
  contractRefStandby: string;
  operDays: number;
  operRateUSD: number;
  standbyDays: number;
  standbyRateUSD: number;
  operTotalUSD: number;
  standbyTotalUSD: number;
  totalChargesUSD: number;
  // Sub-Contractor / Supplier Payable Cost Breakdown
  supplier?: string;
  isSubTool?: boolean;
  subSbDays?: number;
  subOpsDays?: number;
  subSbRateUSD?: number;
  subOpsRateUSD?: number;
  subRunChargeUSD?: number;
  subRedressChargeUSD?: number;
  totalSubCostUSD?: number;
  allocatedRig?: string;
  allocatedWell?: string;
  clientDtNo?: string;
}

export interface VerificationPackageDoc {
  deliveryTickets: Array<{
    ticketNo: string;
    date: string;
    toolsCount: number;
    description: string;
    signedBy?: string;
  }>;
  totalToolsMobilized: number;
  totalCrewMobilized: number;
  mobManifest: {
    manifestRef: string;
    receivedDate: string;
    rigName: string;
    verifiedBy: string;
    transportMode: string;
  };
  receivingTickets: Array<{
    ticketNo: string;
    date: string;
    toolsReturned: number;
    backloadStatus: string;
    routedTo: string;
  }>;
  demobManifest: {
    manifestRef: string;
    releaseDate: string;
    rigName: string;
    vesselOrTruck: string;
    destination: string;
  };
  rigSignoff: {
    engineerName: string;
    mobDate: string;
    demobDate: string;
    operationalDays: number;
    standbyDays: number;
    operationSummary: string;
    approvalRef: string;
    supervisorName: string;
  };
}

export interface DraftInvoicePackageData {
  jobId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dateOfSupply: string;
  customerCode: string;
  customerName: string;
  customerAddress: string;
  customerTrn: string;
  contractNo: string;
  poNo: string;
  rig: string;
  well: string;
  serviceOrderNo: string; // Job ID
  deliveryTicketRefs: string; // e.g. "DT-02171, DT-02311"
  returnLoadingNoteNo: string; // e.g. "RT-02214"
  lines: CalculationTicketLine[];
  // true when no real DT/RT or archived utilization records were found for
  // this job (lines is empty) - the UI must show this plainly, never fill
  // the gap with invented tools/ticket numbers.
  noMatchedRecords?: boolean;
  // true when at least one line's Operating/Standby days came from real
  // confirmed daily logs (tbl_DailyFieldLogs, saved by the Utilization
  // screen) rather than the flat "2 operating days if used" estimate.
  usesConfirmedUtilization?: boolean;
  // Tool descriptions on this invoice whose category/description could not
  // be mapped to any contract rate line and ended up on a $0 or generic
  // fallback rate - a pricing gap to fix on the Contracts/Rates screen, not
  // a real $0 charge.
  unmappedToolDescriptions?: string[];
  // where `lines` came from: 'live' DT/RT batches, 'historical' archived
  // utilization records, or 'none' when nothing real was found.
  dataSource?: 'live' | 'historical' | 'none';
  // true when the job already carries a legal/final invoice number - it has
  // already been billed, so the UI should treat this package as locked
  // (read-only) rather than letting it be re-finalized.
  isLocked?: boolean;
  crewChargeUSD: number;
  crewDays: number;
  crewDailyRateUSD: number;
  operDays: number;
  standbyDays: number;
  operDaysSummary: string;
  operationalChargeUSD: number;
  standbyChargeUSD: number;
  grossValueUSD: number;
  vatPercentage: number; // 5.000%
  vatAmountUSD: number;
  grandTotalUSD: number;
  exchangeRateUSDToAED: number; // 3.6725
  crewChargeAED: number;
  operationalChargeAED: number;
  standbyChargeAED: number;
  taxableAmountTotalAED: number;
  vatTotalAED: number;
  grandTotalAED: number;
  amountInWords: string;
  standbyNotes: string;
  operNotes: string;
  verificationPackage: VerificationPackageDoc;
  attachedDocuments?: AttachedDoc[];
  bankDetails: {
    remitTo: string;
    accountAddress: string;
    usdIban: string;
    swift: string;
  };
}

export interface SubContractorRental {
  rentalId: string;
  id?: string;
  jobId: string;
  supplierName: string; // Motormax, Epis, Coretrax, Weatherford, etc.
  rentalAgreementNo: string;
  toolDesc: string;
  serialNo: string;
  rentalType: 'Daily' | 'Monthly' | 'Lumpsum';
  rateAmount: number;     // Operating rate
  standbyRate: number;    // Standby rate
  startDate: string;      // YYYY-MM-DD
  endDate?: string;       // YYYY-MM-DD or empty if ongoing
  operatingDays: number;
  standbyDays: number;
  totalAccrued: number;   // (operDays * rate) + (standbyDays * standbyRate)
  poReference: string;
  invoiceRef?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  variance?: number;      // invoiceAmount - totalAccrued
  division: SubDivision;  // Auto-linked from Job
  clientCode: string;     // Auto-linked from Job
  rig?: string;           // Auto-linked from Job
  well?: string;          // Auto-linked from Job
  contractRef?: string;   // Auto-linked from Job
  accrualMonth: string;   // YYYY-MM (e.g. 2026-09)
  invoiceMonth?: string;  // YYYY-MM (e.g. 2026-11)
  isPriorPeriodTrueUp?: boolean;
  status: 'ACCRUED' | 'INVOICE_RECEIVED' | 'PAID' | 'DISPUTED';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyExpenseRow {
  code: string;
  name: string;
  category: 'DIRECT' | 'OVERHEAD' | 'DEPRECIATION' | 'ADMIN';
  fishing: number;
  whipstock: number;
  rentals: number;
  total: number;
  sourceType: 'MANUAL_ADMIN' | 'SUB_RENTAL_AUTO' | 'CONSUMABLES_AUTO' | 'DEPRECIATION_AUTO' | 'TRUE_UP';
  sector?: 'P&M' | 'Vehicles' | 'Comp & Printers' | 'IP Rights' | 'None';
  usefulLifeMonths?: number;
  isLocked?: boolean;
}

export interface MonthlyExpenseRecord {
  periodKey: string; // e.g. "2026-09", "2026-10"
  monthName: string;
  year: number;
  isFrozen: boolean; // Jan-Sep 2026 = true
  status: 'DRAFT' | 'REVIEWED' | 'APPROVED' | 'LOCKED';
  lockedBy?: string;
  lockedAt?: string;
  rows: MonthlyExpenseRow[];
  totalFishing: number;
  totalWhipstock: number;
  totalRentals: number;
  grandTotal: number;
}

export interface ConsumableItem {
  id: string;
  partNo: string;
  description: string;
  category: 'Redress Kit' | 'Paint & Coatings' | 'Spare Parts' | 'Lubricants & Oils' | 'HSE & Safety' | 'Seals & O-Rings';
  unit: string; // 'EA', 'KIT', 'LTR', 'CAN', 'SET'
  currentStock: number;
  unitCostAED: number;
  reorderLevel: number;
  binLocation: string;
  supplier?: string;
  lastRestockedDate?: string;
}

export interface ConsumableReceipt {
  receiptId: string;
  poNumber: string;
  partNo: string;
  description: string;
  qtyReceived: number;
  unitCostAED: number;
  totalCostAED: number;
  supplier: string;
  receivedDate: string;
  receivedBy: string;
  notes?: string;
}

export interface ConsumableIssuance {
  issuanceId: string;
  issueDate: string;
  partNo: string;
  description: string;
  qtyIssued: number;
  unitCostAED: number;
  totalCostAED: number;
  destinationType: 'WORKSHOP_BASE' | 'TOOL_REDRESS';
  workshopArea?: string; // e.g. "Main Workshop Bay 1"
  toolSerialNo?: string; // Linked tool
  jobId?: string;        // Linked job
  subDivision: SubDivision;
  requestedBy: string;
  issuedBy: string;
  sivNumber: string; // Store Issuance Voucher #
  remarks?: string;
}

// ==========================================
// Field Crew & Manpower Master
// ==========================================
export interface CrewPersonnel {
  id: string;
  badgeNo: string;
  name: string;
  role: string;
  phone?: string;
  email?: string;
  rigPassNo?: string;
  h2sExpiry?: string;
  bosietExpiry?: string;
  medicalExpiry?: string;
  status: 'Active' | 'On Rig' | 'On Leave' | 'Inactive';
  dayRateAED?: number;
  assignedJobId?: string | null;
  assignedRig?: string | null;
}

// ==========================================
// PO & Goods Inward (GRN) Management
// ==========================================
export type ProcurementClassification = 'ASSET' | 'INVENTORY' | 'CONSUMABLE';

export interface POLineItem {
  lineId: string;
  itemNo: number;
  partNo: string;
  description: string;
  category: string;
  size?: string;
  contractRef?: string;
  subDivision: SubDivision;
  orderedQty: number;
  receivedQty: number;
  balanceQty: number;
  unitPrice: number;
  totalPrice: number;
  classification: ProcurementClassification;
  belongsTo?: string;
  usefulLifeMonths?: number;
  salvageValue?: number;
  monthlyDepreciation?: number;
}

export interface PurchaseOrder {
  poId: string;
  poNumber: string;
  supplier: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  currency: 'AED' | 'USD';
  contractRef?: string;
  subDivision?: SubDivision;
  paymentTerms?: string;
  notes?: string;
  totalAmount: number;
  inwardedAmount: number;
  balanceAmount: number;
  status: 'DRAFT' | 'OPEN' | 'PARTIALLY_RECEIVED' | 'FULFILLED' | 'CANCELLED';
  createdBy?: string;
  createdAt: string;
  lines: POLineItem[];
}

export interface GRNLineItem {
  lineId: string;
  poLineId?: string;
  partNo: string;
  description: string;
  category: string;
  size?: string;
  toolsno?: string;        // Serial / SystemID
  contractRef?: string;
  subDivision: SubDivision;
  qtyReceived: number;
  unitPrice: number;
  bookValue: number;
  currency: 'AED' | 'USD';
  belongsTo: string;       // EMDAD, CORETRAX, EPIS, etc.
  reqInsp: boolean;        // Inspection required checkbox
  insDate?: string;        // Inspection Date
  classification: ProcurementClassification;
  usefulLifeMonths?: number;
  salvageValue?: number;
  monthlyDepreciation?: number;
  comments?: string;
}

export interface GoodsReceiptNote {
  grnId: string;
  ticketNo: string;        // Ticket No (e.g. "230")
  poNumber: string;        // PO Num (e.g. "32175")
  supplier: string;        // Supplier (e.g. "EMDAD")
  supplierDt: string;      // Supplier DT / DN (e.g. "DN-66057")
  dateRecd: string;        // Date Recd (e.g. "8/15/2023")
  mfgReceivedBy: string;   // Mfg / Received By (e.g. "NOOR ISLAM")
  currency: 'AED' | 'USD';
  totalItemsReceived: number;
  totalInwardValue: number;
  qcStatus: 'ACCEPTED' | 'ACCEPTED_WITH_DEVIATION' | 'REJECTED' | 'PENDING_INSPECTION';
  comments?: string;
  createdAt: string;
  createdBy?: string;
  lines: GRNLineItem[];
}

