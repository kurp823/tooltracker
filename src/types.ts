// ─── Core Types — mapped exactly to ToolTrackingDB columns ─────────────────

export type UserRole =
  | 'Admin'
  | 'Operations'
  | 'QAQC'
  | 'ThirdParty'
  | 'Billing'
  | 'Finance'
  | 'CostController'
  | 'Executive'

export interface User {
  UserID: number
  Username: string
  FullName: string | null
  Role: UserRole | null
  Email: string | null
  Active: boolean
  CreatedDate: string | null
  LastLogin: string | null
  MustChangePassword: boolean
}

export interface AuthUser extends User {
  token?: string
}

// ─── Job ────────────────────────────────────────────────────────────────────

// Real tbl_Jobs.Status values (confirmed live, 3824 jobs):
// Completed (3675), Ongoing (55), JobCompleted (47),
// Draft Invoice Submitted (42), Open (5)
export type JobStatus = 'Open' | 'Ongoing' | 'Completed' | 'JobCompleted' | 'Draft Invoice Submitted'
// 'Monthly' is what switches on the rollover button and period-based
// invoicing — ADNOC Drilling 4700024096 and the Turnwell packages, where a
// new job is raised each month and tools with no return ticket carry over.
export type InvoicingType = 'PerJob' | 'PerDay' | 'Lump Sum' | 'Monthly'

export interface Job {
  JobID: string
  CalloutID: string | null
  Rig: string
  Well: string
  Client: string
  Contract: string | null
  PONumber: string | null
  ClientRef: string | null
  ERPRef: string | null
  HoleSection: string | null
  ServiceType: string | null
  InvoicingType: InvoicingType
  /** True when the job is Completed and has not been unlocked by an Admin. */
  IsLocked?: boolean
  UnlockedBy?: string | null
  UnlockedAt?: string | null
  UnlockReason?: string | null
  Currency: string
  MobDate: string | null
  DemobDate: string | null
  Status: JobStatus
  CreatedDate: string | null
  CreatedBy: string | null
  FirstDtDate: string | null
  LastRtDate: string | null
  DocsSignedDate: string | null
  SubmittedToBillingDate: string | null
  DraftInvoicedDate: string | null
  SesSubmittedDate: string | null
  FinalInvoicedDate: string | null
  DraftInvoiceNumber: string | null
  SesNumber: string | null
  LegalInvoiceNumber: string | null
  InvoiceAmount: number | null
  NetInvoiceAmount: number | null
  NetSubcontract: number | null
  InvoiceDate: string | null
  FiscalYear: string | null
  Notes: string | null
  UpdatedAt: string | null
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export type InventoryStatus = 'Good' | 'Damaged' | 'In Maintenance' | 'Retired' | 'In Field'
export type OwnershipType = 'Own' | 'Subcontract'

export interface InventoryItem {
  SystemID: string
  AssetNo: string | null
  Size: string | null
  ShortDesc: string | null
  Description: string | null
  Qty: number | null
  Location: string
  Status: InventoryStatus
  Ownership: string | null
  IsEmdad: boolean        // 1 = Own, 0 = Subcontract
  Serial: string | null
  Supplier: string | null
}

// ─── Tool Categories & Sizes ─────────────────────────────────────────────────

export interface ToolCategory {
  CategoryID: number
  CategoryName: string
  ToolFamily: string | null
  InInventory: boolean
  IsRentalTool: boolean
  RequiresInspection: boolean
  ActiveFlag: boolean
  SortOrder: number | null
  Notes: string | null
}

export interface ToolSize {
  SizeID: number
  SizeLabel: string
  SizeDecimal: number | null
  InInventory: boolean
  ActiveFlag: boolean
  SortOrder: number | null
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export interface Client {
  ClientID?: number
  ClientName: string
  ShortName?: string | null
  Country?: string | null
  Address?: string | null
  ContactPerson?: string | null
  ContactEmail?: string | null
  ContactPhone?: string | null
  IsActive?: boolean
  Notes?: string | null
}

// ─── Contracts ───────────────────────────────────────────────────────────────

export type ContractStatus = 'Active' | 'Expired' | 'Pending' | 'Cancelled'

export interface Contract {
  ContractID?: number
  ContractNumber: string
  ContractName?: string | null
  ClientID?: number | null
  ClientName?: string | null
  Description?: string | null
  StartDate?: string | null
  EndDate?: string | null
  Currency: string
  Status: ContractStatus
  IsActive?: boolean
  Notes?: string | null
}

export interface ContractRate {
  RateID?: number
  ContractID?: number
  ItemCode?: string | null
  Description?: string | null
  UnitPrice?: number | null
  Currency?: string | null
  UOM?: string | null
  IsActive?: boolean
}

// ─── Delivery Tickets ─────────────────────────────────────────────────────────

export type DTStatus = 'Draft' | 'Signed' | 'Locked'

export interface DeliveryTicket {
  dtNumber: string
  jobNumber: string
  clientCode: string | null
  deliveryDate: string | null
  rig: string | null
  well: string | null
  poNumber: string | null
  clientRef: string | null
  vehicleVessel: string | null
  driverName: string | null
  emdadRep: string | null
  emdadSignDate: string | null
  clientSignedBy: string | null
  clientSignDate: string | null
  status: DTStatus
  calloutRef: string | null
  lockStage: string | null
  lockedAt: string | null
  lockedBy: string | null
}

export interface DeliveryTicketLine {
  id?: number
  dtNumber: string
  itemNo: number
  serial: string | null
  assetNo: string | null
  toolDescription: string | null
  size: string | null
  qty: number
  condition: string | null
  remarks: string | null
}

// ─── Receiving Tickets ────────────────────────────────────────────────────────

export type RTStatus = 'Draft' | 'Signed' | 'Locked'

export interface ReceivingTicket {
  id?: number
  rtNumber: string
  jobNumber: string
  linkedDtNumber: string | null
  clientCode: string
  receivingDate: string
  rig: string | null
  well: string | null
  manifestNumber: string | null
  clientRef: string | null
  vehicleVessel: string | null
  emdadRep: string | null
  emdadSignDate: string | null
  clientSignedBy: string | null
  clientSignDate: string | null
  status: RTStatus
  notes: string | null
  attachmentRef: string | null
  createdBy: string | null
  createdAt: string | null
  updatedAt: string | null
  lockStage: string | null
  lockedAt: string | null
  lockedBy: string | null
}

export interface ReceivingTicketLine {
  id?: number
  rtNumber: string
  itemNo: number
  serial: string | null
  toolDescription: string | null
  qty: number
  usedStatus: string
  condition: string | null
  remarks: string | null
  routedTo: string | null
  routedAt: string | null
  routedBy: string | null
}

// ─── Daily Field Logs (Utilization) ──────────────────────────────────────────

export type UtilizationCode = 'S' | '1'

export interface DailyFieldLog {
  LogID?: number
  JobID: string
  DTNumber: string | null
  ToolSerial: string
  LogDate: string
  StatusType: UtilizationCode
  RateCharged: number | null
  CreatedDate: string | null
}

// ─── Gate Pass ────────────────────────────────────────────────────────────────

export interface GatePass {
  id?: number
  gatePassNumber: string
  jobNumber: string
  direction: 'Out' | 'In'
  passDate: string
  rig: string | null
  well: string | null
  vehicleVessel: string | null
  driverName: string | null
  emdadRep: string | null
  status: string
  notes: string | null
  createdBy: string | null
  createdAt: string | null
}

export interface GatePassLine {
  id?: number
  gatePassNumber: string
  itemNo: number
  serial: string | null
  assetNo: string | null
  toolDescription: string | null
  qty: number
  remarks: string | null
}

// ─── Inspection ───────────────────────────────────────────────────────────────

export interface Inspection {
  id?: number
  inspectionRef: string
  jobNumber: string | null
  serial: string | null
  assetNo: string | null
  toolDescription: string | null
  inspectionDate: string
  inspector: string | null
  type: string | null
  result: 'Pass' | 'Fail' | 'Conditional' | null
  status: string
  notes: string | null
  createdBy: string | null
  createdAt: string | null
}

// ─── Maintenance ──────────────────────────────────────────────────────────────

export interface MaintenanceJob {
  id?: number
  jobCardNumber: string
  serial: string | null
  asset: string | null
  jobNumber: string | null
  jobType: string | null
  priority: 'Normal' | 'High' | 'Urgent'
  triggeredBy: string | null
  supplierCode: string | null
  supplierName: string | null
  vendorOrderRef: string | null
  dateIn: string | null
  estimatedOut: string | null
  dateOut: string | null
  description: string | null
  scopeOfWork: string | null
  workDone: string | null
  partsUsed: string | null
  laborHours: number | null
  cost: number | null
  status: 'Open' | 'In Progress' | 'Completed' | 'Cancelled'
  completedDate: string | null
  completedBy: string | null
  attachmentRef: string | null
  notes: string | null
  createdBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'Draft'
  | 'Submitted'
  | 'SES Submitted'
  | 'Final Invoiced'
  | 'Cancelled'

export interface Invoice {
  id?: number
  invoiceNumber: string
  jobNumber: string
  clientCode: string | null
  invoiceDate: string | null
  dueDate: string | null
  currency: string
  subtotal: number | null
  vatAmount: number | null
  totalAmount: number | null
  netAmount: number | null
  status: InvoiceStatus
  legalInvoiceNumber: string | null
  legalInvoiceDate: string | null
  sesNumber: string | null
  notes: string | null
  createdBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface InvoiceLine {
  id?: number
  invoiceNumber: string
  lineNo: number
  description: string | null
  serial: string | null
  assetNo: string | null
  dtNumber: string | null
  opsQty: number | null
  opsRate: number | null
  opsAmount: number | null
  standbyQty: number | null
  standbyRate: number | null
  standbyAmount: number | null
  totalAmount: number | null
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

export interface Supplier {
  id?: number
  supplierCode: string
  supplierName: string
  supplierType: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  address: string | null
  vatNumber: string | null
  paymentTerms: string | null
  currency: string
  notes: string | null
  active: boolean
  createdBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalJobs: number
  activeJobs: number
  openJobs: number
  completedThisMonth: number
  totalInventory: number
  inFieldTools: number
  pendingInvoices: number
  pendingInspections: number
  pendingMaintenance: number
  recentJobs: JobSummary[]
}

export interface JobSummary {
  JobID: string
  Client: string
  Rig: string
  Well: string
  Status: JobStatus
  MobDate: string | null
  DemobDate: string | null
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  total?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// ─── Job Tools (new table) ────────────────────────────────────────────────────

export interface JobTool {
  JobToolID?: number
  JobID: string
  SystemID: string | null
  Serial: string | null
  AssetNo: string | null
  ShortDesc: string | null
  Size: string | null
  IsEmdad: boolean
  AddedDate: string | null
  AddedBy: string | null
  Notes: string | null
}

// ─── Job Personnel (new table) ────────────────────────────────────────────────

export interface JobPersonnel {
  id?: number
  JobID: string
  UserID: number | null
  Name: string
  Role: string | null
  MobDate: string | null
  DemobDate: string | null
  Notes: string | null
}

// ─── Tool movement / Job tools list report ───────────────────────────────────

export interface ToolMovement {
  TicketNo: string
  DateOut: string | null
  Item: number | null
  PartNo: string | null
  Serial: string | null
  Description: string | null
  Size: string | null
  Qty: number | null
  RgtNo: string | null
  DateIn: string | null
  Comments: string | null
  Condition: string | null
  Supplier: string | null
  JobID: string | null
  Rig: string | null
  Well: string | null
  PONumber: string | null
  OpsDays: number | null
  StandbyDays: number | null
  OpsAmount: number | null
  StandbyAmount: number | null
  TotalAmount: number | null
}
