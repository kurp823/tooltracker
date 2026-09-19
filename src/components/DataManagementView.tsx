import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  User,
  ToolItem,
  Callout,
  DrillingJob,
  DTBatch,
  RTBatch,
  InspectionRecord,
  MaintenanceRecord,
  GatePass,
  ContractRecord,
} from '../types';
import {
  saveJobApi,
  saveInventoryApi,
  saveDeliveryTicketApi,
  saveReceivingTicketApi,
  saveCalloutApi,
  saveGatePassApi,
  saveContractApi,
  saveInspectionApi,
  saveMaintenanceApi,
  fetchLiveDatabaseData,
  fetchSecondaryModules,
} from '../services/api';
import {
  Database,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RefreshCw,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Layers,
  FileText,
  Search,
  CheckSquare,
  Square,
  ShieldAlert,
  Info,
} from 'lucide-react';

export type TableEntityKey =
  | 'jobs'
  | 'inventory'
  | 'dtBatches'
  | 'rtBatches'
  | 'callouts'
  | 'gatePasses'
  | 'inspections'
  | 'maintenance'
  | 'contracts';

export interface FieldDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  required?: boolean;
  description: string;
  sample: any;
}

interface TableDefinition {
  key: TableEntityKey;
  sqlTable: string;
  epicorCode: string;
  name: string;
  primaryKey: string;
  category: 'Operations' | 'Inventory' | 'Quality' | 'Commercial';
  description: string;
  fields: FieldDefinition[];
  detailKey?: string;
  detailForeignKey?: string;
  detailName?: string;
  detailSqlTable?: string;
  detailFields?: FieldDefinition[];
}

const TABLE_DEFINITIONS: Record<TableEntityKey, TableDefinition> = {
  jobs: {
    key: 'jobs',
    sqlTable: 'tbl_Jobs',
    epicorCode: 'UD101 - Drilling Jobs',
    name: 'Drilling Jobs',
    primaryKey: 'id',
    category: 'Operations',
    description: 'Drilling jobs master register with rig, well, client, PO number, start/end dates, job value, legal invoice number, and lifecycle stage.',
    fields: [
      { key: 'id', label: 'Job Number (ID)', type: 'string', required: true, description: 'Unique Job Identifier (e.g., Job-023-00001 or JOB-26-0001)', sample: 'Job-023-00001' },
      { key: 'client', label: 'Client', type: 'string', required: true, description: 'Client / Operator name', sample: 'ADNOC OFFSHORE' },
      { key: 'rig', label: 'Rig', type: 'string', required: true, description: 'Drilling Rig name / number', sample: 'AL YASAT' },
      { key: 'well', label: 'Well', type: 'string', required: true, description: 'Well identifier', sample: 'ZK-89.5-68' },
      { key: 'poNumber', label: 'PO Number', type: 'string', description: 'Client Purchase Order Number', sample: '4200222381' },
      { key: 'contract', label: 'Contract / Project Code', type: 'string', description: 'Contract Ref or ERP Code', sample: '444558' },
      { key: 'invoiceAmount', label: 'Job Value ($)', type: 'number', description: 'Total job billing value / invoice amount', sample: 3765.91 },
      { key: 'legalInvoiceNumber', label: 'Legal / Invoice NO', type: 'string', description: 'Official tax invoice NO (e.g. FSH-02620, FR-..., WHP-...)', sample: 'FSH-02620' },
      { key: 'draftInvoiceNumber', label: 'ERP / Draft Invoice NO', type: 'string', description: 'Under-approval ERP document number', sample: '209149' },
      { key: 'status', label: 'Current Status', type: 'string', description: 'Open, Ongoing, Waiting on Signed Docs, Submitted to Billing Team, SES Submitted, Completed', sample: 'Completed' },
      { key: 'mobDate', label: 'Mob Date', type: 'date', description: 'Mobilization date (YYYY-MM-DD)', sample: '2023-05-28' },
      { key: 'demobDate', label: 'Demob Date', type: 'date', description: 'Demobilization date (YYYY-MM-DD)', sample: '2023-06-07' },
      { key: 'notes', label: 'Remarks / Notes', type: 'string', description: 'Operational remarks', sample: 'Fishing operations completed successfully' },
    ],
  },
  inventory: {
    key: 'inventory',
    sqlTable: 'tbl_Tools_Master',
    epicorCode: 'UD102 - Tool Fleet Inventory',
    name: 'Tool Fleet & Assets',
    primaryKey: 'serial',
    category: 'Inventory',
    description: 'Downhole drilling tools, jars, shock tools, reamers, stabilizers, crossovers, and motors inventory.',
    fields: [
      { key: 'serial', label: 'Serial Number', type: 'string', required: true, description: 'Physical serial / Asset ID', sample: 'EMD-1025' },
      { key: 'assetNo', label: 'Part Number / Asset No', type: 'string', description: 'Part/Catalog reference', sample: 'DJ650-003' },
      { key: 'shortDesc', label: 'Tool Category / Type', type: 'string', required: true, description: 'Classification (e.g., HYD DRILLING JAR, STABILIZER)', sample: 'HYD DRILLING JAR' },
      { key: 'desc', label: 'Full Description', type: 'string', description: 'Detailed engineering description', sample: '6-1/2" HYDRAULIC DRILLING JAR 4-1/2" IF' },
      { key: 'size', label: 'Tool Size / OD', type: 'string', description: 'Tool outer diameter (e.g., 6-1/2", 8", 9-1/2")', sample: '6-1/2"' },
      { key: 'qty', label: 'Quantity', type: 'number', description: 'Quantity (usually 1 per serial)', sample: 1 },
      { key: 'location', label: 'Current Location', type: 'string', description: 'Emdad Base, On Rig, Inspection Bay, Workshop, Returned to Supplier', sample: 'Emdad Base' },
      { key: 'status', label: 'Tool Status', type: 'string', description: 'Good, Repair, Inspection, Redress, Removed, On Rig', sample: 'Good' },
      { key: 'ownership', label: 'Ownership', type: 'string', description: 'EMDAD, MOTORMAX, EPIS, ELITE, SALTIRE, etc.', sample: 'EMDAD' },
      { key: 'supplier', label: 'Supplier / OEM', type: 'string', description: 'OEM or rental supplier', sample: 'COUGAR' },
    ],
  },
  dtBatches: {
    key: 'dtBatches',
    sqlTable: 'tbl_DeliveryTickets',
    epicorCode: 'UD103 - Delivery Tickets (DT)',
    name: 'Delivery Tickets (DT)',
    primaryKey: 'dtNumber',
    category: 'Operations',
    description: 'Mobilization and dispatch delivery tickets sending tools and equipment to rigs, including line-item tool details.',
    detailKey: 'toolLines',
    detailForeignKey: 'dtNumber',
    detailName: 'DT Tool Lines (Details)',
    detailSqlTable: 'tbl_DeliveryTicketLines',
    fields: [
      { key: 'dtNumber', label: 'DT Number', type: 'string', required: true, description: 'Unique ticket number (e.g. DT-23-0001)', sample: 'DT-23-0001' },
      { key: 'jobId', label: 'Job Number', type: 'string', required: true, description: 'Linked Job ID', sample: 'Job-023-00001' },
      { key: 'dispatchDate', label: 'Dispatch Date', type: 'date', required: true, description: 'Ticket departure date (YYYY-MM-DD)', sample: '2023-05-28' },
      { key: 'rmDate', label: 'RM Date', type: 'date', description: 'Road manifest / dispatch date', sample: '2023-05-28' },
      { key: 'rmRef', label: 'RM Reference', type: 'string', description: 'Road manifest number', sample: 'RM-5501' },
      { key: 'rig', label: 'Rig', type: 'string', description: 'Destination rig', sample: 'AL YASAT' },
      { key: 'well', label: 'Well', type: 'string', description: 'Destination well', sample: 'ZK-89.5-68' },
      { key: 'contract', label: 'Contract', type: 'string', description: 'Contract reference', sample: '444558' },
      { key: 'dispatchedBy', label: 'Dispatched By', type: 'string', description: 'Dispatcher name', sample: 'Azim' },
      { key: 'recipient', label: 'Recipient / Driver', type: 'string', description: 'Rig receiver / transporter', sample: 'ADNOC Transport' },
      { key: 'notes', label: 'Notes / Remarks', type: 'string', description: 'Ticket remarks', sample: 'Loaded with thread protectors' },
    ],
    detailFields: [
      { key: 'dtNumber', label: 'DT Number (Parent)', type: 'string', required: true, description: 'Parent DT Number (must match Header DT Number)', sample: 'DT-23-0001' },
      { key: 'itemNo', label: 'Item No', type: 'number', required: true, description: 'Line sequence number (1, 2, 3...)', sample: 1 },
      { key: 'serial', label: 'Serial Number', type: 'string', required: true, description: 'Physical tool serial / asset number', sample: 'EMD-1025' },
      { key: 'assetNo', label: 'Asset / Part No', type: 'string', description: 'Asset / catalog reference', sample: 'DJ650-003' },
      { key: 'shortDesc', label: 'Tool Category / Type', type: 'string', required: true, description: 'Tool classification (e.g., HYD DRILLING JAR)', sample: 'HYD DRILLING JAR' },
      { key: 'desc', label: 'Tool Description', type: 'string', description: 'Detailed tool description', sample: '6-1/2" HYDRAULIC DRILLING JAR 4-1/2" IF' },
      { key: 'size', label: 'Size / OD', type: 'string', description: 'Outer diameter (e.g., 6-1/2", 8")', sample: '6-1/2"' },
      { key: 'qty', label: 'Quantity', type: 'number', description: 'Dispatched quantity', sample: 1 },
      { key: 'status', label: 'Status', type: 'string', description: 'OnRig or Returned', sample: 'OnRig' },
      { key: 'ownership', label: 'Ownership', type: 'string', description: 'EMDAD, MOTORMAX, EPIS, etc.', sample: 'EMDAD' },
      { key: 'remarks', label: 'Remarks / Serial Notes', type: 'string', description: 'Line inspection remarks or condition', sample: 'Good condition' },
    ],
  },
  rtBatches: {
    key: 'rtBatches',
    sqlTable: 'tbl_ReceivingTickets',
    epicorCode: 'UD104 - Receiving Tickets (RT)',
    name: 'Receiving Tickets (RT)',
    primaryKey: 'rtNumber',
    category: 'Operations',
    description: 'Backload receiving tickets returning tools from rigs back to base, including line-item tool details.',
    detailKey: 'toolLines',
    detailForeignKey: 'rtNumber',
    detailName: 'RT Tool Lines (Details)',
    detailSqlTable: 'tbl_ReceivingTicketLines',
    fields: [
      { key: 'rtNumber', label: 'RT Number', type: 'string', required: true, description: 'Unique ticket number (e.g. RT-23-0001)', sample: 'RT-23-0001' },
      { key: 'jobId', label: 'Job Number', type: 'string', required: true, description: 'Linked Job ID', sample: 'Job-023-00001' },
      { key: 'rtDate', label: 'Receiving Date', type: 'date', required: true, description: 'Backload receipt date (YYYY-MM-DD)', sample: '2023-06-07' },
      { key: 'rig', label: 'Rig', type: 'string', description: 'Origin rig', sample: 'AL YASAT' },
      { key: 'well', label: 'Well', type: 'string', description: 'Origin well', sample: 'ZK-89.5-68' },
      { key: 'contract', label: 'Contract', type: 'string', description: 'Contract reference', sample: '444558' },
      { key: 'receivedBy', label: 'Received By', type: 'string', description: 'Base inspector / receiver name', sample: 'Deen' },
      { key: 'condition', label: 'Condition', type: 'string', description: 'Good / Used / Damaged / Redress Needed', sample: 'Used' },
      { key: 'notes', label: 'Notes', type: 'string', description: 'Receiving remarks', sample: 'All tools accounted for' },
    ],
    detailFields: [
      { key: 'rtNumber', label: 'RT Number (Parent)', type: 'string', required: true, description: 'Parent RT Number (must match Header RT Number)', sample: 'RT-23-0001' },
      { key: 'itemNo', label: 'Item No', type: 'number', required: true, description: 'Line sequence number (1, 2, 3...)', sample: 1 },
      { key: 'serial', label: 'Serial Number', type: 'string', required: true, description: 'Returned tool serial number', sample: 'EMD-1025' },
      { key: 'assetNo', label: 'Asset / Part No', type: 'string', description: 'Asset / catalog reference', sample: 'DJ650-003' },
      { key: 'shortDesc', label: 'Tool Category / Type', type: 'string', required: true, description: 'Tool classification (e.g., HYD DRILLING JAR)', sample: 'HYD DRILLING JAR' },
      { key: 'desc', label: 'Tool Description', type: 'string', description: 'Detailed tool description', sample: '6-1/2" HYDRAULIC DRILLING JAR 4-1/2" IF' },
      { key: 'size', label: 'Size / OD', type: 'string', description: 'Outer diameter', sample: '6-1/2"' },
      { key: 'used', label: 'Used on Well?', type: 'boolean', description: 'True if tool was run downhole in well', sample: true },
      { key: 'routedTo', label: 'Routed To', type: 'string', description: 'Inspection Bay, Base Stock, Workshop Redress', sample: 'Inspection Bay' },
      { key: 'condition', label: 'Tool Condition', type: 'string', description: 'Good condition, thread damaged, seals worn', sample: 'Good condition' },
      { key: 'remarks', label: 'Remarks / Notes', type: 'string', description: 'Receiving line observations', sample: 'Threads cleaned and inspected' },
    ],
  },
  callouts: {
    key: 'callouts',
    sqlTable: 'tbl_Callouts',
    epicorCode: 'UD105 - Rig Callouts',
    name: 'Rig Callouts',
    primaryKey: 'id',
    category: 'Operations',
    description: 'Initial customer requests from operators for tools and equipment mobilization.',
    fields: [
      { key: 'id', label: 'Callout ID', type: 'string', required: true, description: 'Unique Callout ID (e.g. CAL-26-0001)', sample: 'CAL-26-0001' },
      { key: 'client', label: 'Client', type: 'string', required: true, description: 'Customer operator name', sample: 'ADNOC OFFSHORE' },
      { key: 'rig', label: 'Rig', type: 'string', required: true, description: 'Rig name', sample: 'AL YASAT' },
      { key: 'well', label: 'Well', type: 'string', required: true, description: 'Well identifier', sample: 'ZK-89.5-68' },
      { key: 'status', label: 'Status', type: 'string', description: 'Active, Forecast, Closed, Pending, In Progress', sample: 'Active' },
      { key: 'createdDate', label: 'Callout Date', type: 'date', description: 'Request received date (YYYY-MM-DD)', sample: '2026-03-01' },
      { key: 'poRef', label: 'PO Reference', type: 'string', description: 'Customer PO or Callout Ref', sample: '4200222381' },
      { key: 'contract', label: 'Contract Reference', type: 'string', description: 'Governing master contract', sample: '444558' },
    ],
  },
  gatePasses: {
    key: 'gatePasses',
    sqlTable: 'tbl_GatePasses',
    epicorCode: 'UD106 - Security Gate Passes',
    name: 'Security Gate Passes',
    primaryKey: 'gpNumber',
    category: 'Inventory',
    description: 'Security gate passes for sending tools to vendors or third-party workshops.',
    fields: [
      { key: 'gpNumber', label: 'Gate Pass Number', type: 'string', required: true, description: 'Unique gate pass number (e.g. GP-26-0001)', sample: 'GP-26-0001' },
      { key: 'supplier', label: 'Destination / Vendor', type: 'string', required: true, description: 'Vendor, machine shop, or customer base', sample: 'AL-MANSOORI WORKSHOP' },
      { key: 'gpDate', label: 'Gate Pass Date', type: 'date', required: true, description: 'Issuance date (YYYY-MM-DD)', sample: '2026-03-05' },
      { key: 'preparedBy', label: 'Prepared By', type: 'string', description: 'Officer preparing gate pass', sample: 'Azim' },
      { key: 'authorizedBy', label: 'Authorized By', type: 'string', description: 'Security authority / Manager', sample: 'Ravi Parapu' },
      { key: 'notes', label: 'Notes', type: 'string', description: 'Gate pass remarks', sample: 'For thread recutting and hardbanding' },
    ],
  },
  inspections: {
    key: 'inspections',
    sqlTable: 'tbl_Inspections',
    epicorCode: 'UD107 - QC Inspections',
    name: 'QC Inspection Bay',
    primaryKey: 'woNumber',
    category: 'Quality',
    description: 'Receiving inspection, MPI, ultrasonic, thread visual, and QA/QC certifications.',
    fields: [
      { key: 'woNumber', label: 'Work Order Number', type: 'string', required: true, description: 'Unique inspection WO (e.g. WO-INS-26-0001)', sample: 'WO-INS-26-0001' },
      { key: 'serial', label: 'Tool Serial Number', type: 'string', required: true, description: 'Inspected tool serial', sample: 'EMD-1025' },
      { key: 'shortDesc', label: 'Tool Category', type: 'string', description: 'Tool classification', sample: 'HYD DRILLING JAR' },
      { key: 'receivedDate', label: 'Received Date', type: 'date', description: 'Date received in inspection bay', sample: '2026-03-08' },
      { key: 'inspector', label: 'Inspector Name', type: 'string', description: 'Certified NDT inspector', sample: 'Nihas' },
      { key: 'status', label: 'Inspection Status', type: 'string', description: 'Pending, Complete, Pass, Fail', sample: 'Pass' },
      { key: 'reportNumber', label: 'NDT Report Number', type: 'string', description: 'Official inspection cert/report number', sample: 'NDT-2026-0412' },
      { key: 'disposition', label: 'Disposition', type: 'string', description: 'Accept to Fleet / Send to Redress / Scrap', sample: 'Accept to Fleet' },
      { key: 'notes', label: 'Findings / Remarks', type: 'string', description: 'Technical findings', sample: 'Threads and seals passed full visual & dimensional' },
    ],
  },
  maintenance: {
    key: 'maintenance',
    sqlTable: 'tbl_MaintenanceOrders',
    epicorCode: 'UD108 - Maintenance Orders',
    name: 'Maintenance & Repairs',
    primaryKey: 'woNumber',
    category: 'Quality',
    description: 'In-house workshop redressing, OEM servicing, machining, hardbanding, and third-party repairs.',
    fields: [
      { key: 'woNumber', label: 'Work Order Number', type: 'string', required: true, description: 'Maintenance WO (e.g. WO-MNT-26-0001)', sample: 'WO-MNT-26-0001' },
      { key: 'serial', label: 'Tool Serial Number', type: 'string', required: true, description: 'Tool serial being repaired', sample: 'EMD-1025' },
      { key: 'issue', label: 'Issue / Reason', type: 'string', required: true, description: 'Fault description or scheduled redress', sample: 'Post-job disassembly, seal replacement, hydraulic fluid flush' },
      { key: 'type', label: 'Maintenance Type', type: 'string', description: 'InHouse, Vendor, ThirdParty', sample: 'InHouse' },
      { key: 'vendor', label: 'Vendor Name', type: 'string', description: 'External workshop or OEM (if vendor repair)', sample: 'COUGAR DRILLING SERVICES' },
      { key: 'startDate', label: 'Start Date', type: 'date', description: 'Repair start date (YYYY-MM-DD)', sample: '2026-03-10' },
      { key: 'status', label: 'Status', type: 'string', description: 'In Progress, Sent to Vendor, Received from Vendor, Ready for QC, Complete - Ready', sample: 'Complete - Ready' },
      { key: 'actualCost', label: 'Actual Cost ($)', type: 'number', description: 'Total cost incurred', sample: 850.00 },
      { key: 'notes', label: 'Repair Notes', type: 'string', description: 'Work completed details', sample: 'O-rings, backup rings, and mandrels inspected and certified' },
    ],
  },
  contracts: {
    key: 'contracts',
    sqlTable: 'tbl_Contracts',
    epicorCode: 'UD109 - Master Contracts',
    name: 'Master Contracts & Rates',
    primaryKey: 'id',
    category: 'Commercial',
    description: 'Client frame agreements, PO numbers, contract duration, day rates, and bank guarantees.',
    fields: [
      { key: 'id', label: 'Contract ID', type: 'string', required: true, description: 'Unique Contract reference (e.g. CON-ADNOC-01)', sample: 'CON-ADNOC-01' },
      { key: 'contractNo', label: 'Contract / Tender No', type: 'string', description: 'Official agreement reference', sample: '444558' },
      { key: 'client', label: 'Client', type: 'string', required: true, description: 'Client operator name', sample: 'ADNOC OFFSHORE' },
      { key: 'currency', label: 'Currency', type: 'string', description: 'USD or AED', sample: 'USD' },
      { key: 'contractValue', label: 'Contract Ceiling Value', type: 'number', description: 'Total contract amount', sample: 5000000 },
      { key: 'startDate', label: 'Effective Start Date', type: 'date', description: 'Start date (YYYY-MM-DD)', sample: '2023-01-01' },
      { key: 'endDate', label: 'Expiry Date', type: 'date', description: 'Expiry date (YYYY-MM-DD)', sample: '2026-12-31' },
      { key: 'status', label: 'Contract Status', type: 'string', description: 'Active, Completed, Expired, Closed', sample: 'Active' },
      { key: 'poNumber', label: 'Governing PO Number', type: 'string', description: 'Framework purchase order', sample: '4200222381' },
      { key: 'pbgNumber', label: 'PBG Number', type: 'string', description: 'Performance bank guarantee reference', sample: 'PBG-99214' },
      { key: 'notes', label: 'Notes', type: 'string', description: 'Contract remarks', sample: 'Includes fishing jars, shock tools, and hole openers' },
    ],
  },
};

interface DataManagementViewProps {
  user?: User | null;
  jobs: DrillingJob[];
  inventory: ToolItem[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  callouts: Callout[];
  gatePasses: GatePass[];
  inspections: InspectionRecord[];
  maintenance: MaintenanceRecord[];
  contracts: ContractRecord[];
  onUpdateState: (key: TableEntityKey, updater: (prev: any[]) => any[]) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshAllData?: () => Promise<void>;
}

export const DataManagementView: React.FC<DataManagementViewProps> = ({
  user,
  jobs,
  inventory,
  dtBatches,
  rtBatches,
  callouts,
  gatePasses,
  inspections,
  maintenance,
  contracts,
  onUpdateState,
  showToast,
  onRefreshAllData,
}) => {
  const [selectedEntityKey, setSelectedEntityKey] = useState<TableEntityKey>('jobs');
  const [isDetailMode, setIsDetailMode] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'import' | 'preview'>('import');

  // Import options modeled after Epicor DMT
  const [allowAdd, setAllowAdd] = useState(true);
  const [allowUpdate, setAllowUpdate] = useState(true);
  const [allowDelete, setAllowDelete] = useState(false);
  const [writeCompleteLog, setWriteCompleteLog] = useState(true);
  const [writeErrorsToLog, setWriteErrorsToLog] = useState(true);

  // File & Process state
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<{ row: number; column: string; message: string }[]>([]);
  const [isValidated, setIsValidated] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState<{ current: number; total: number; rpm: number }>({ current: 0, total: 0, rpm: 0 });
  const [processLogs, setProcessLogs] = useState<{ time: string; type: 'info' | 'success' | 'error' | 'warn'; msg: string }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDef = TABLE_DEFINITIONS[selectedEntityKey];

  // Map state to selected entity
  const currentTableData = useMemo(() => {
    switch (selectedEntityKey) {
      case 'jobs':
        return jobs;
      case 'inventory':
        return inventory;
      case 'dtBatches':
        return dtBatches;
      case 'rtBatches':
        return rtBatches;
      case 'callouts':
        return callouts;
      case 'gatePasses':
        return gatePasses;
      case 'inspections':
        return inspections;
      case 'maintenance':
        return maintenance;
      case 'contracts':
        return contracts;
      default:
        return [];
    }
  }, [selectedEntityKey, jobs, inventory, dtBatches, rtBatches, callouts, gatePasses, inspections, maintenance, contracts]);

  // Admin access protection
  if (user?.role !== 'Admin') {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white border border-rose-200 rounded-lg p-6 shadow-xs text-center">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-2xl font-bold mx-auto mb-3">
          🔒
        </div>
        <h2 className="text-base font-bold text-slate-800">Admin Clearance Required</h2>
        <p className="text-xs text-slate-600 mt-2 max-w-md mx-auto">
          The <strong>Data Management Tool (DMT)</strong> has direct import and export capabilities affecting database tables. Access is strictly restricted to users with the <strong>Admin</strong> role.
        </p>
        <div className="mt-4 inline-block px-3 py-1 bg-slate-100 rounded text-xs font-mono text-slate-700 border border-slate-300">
          Current Role: <strong>{user?.role || 'Guest'}</strong> (Access Restricted)
        </div>
      </div>
    );
  }

  const activeFields: FieldDefinition[] = isDetailMode && selectedDef.detailFields
    ? selectedDef.detailFields
    : selectedDef.fields;

  const activeTableName = isDetailMode && selectedDef.detailName
    ? selectedDef.detailName
    : selectedDef.name;

  const activeSqlTable = isDetailMode && selectedDef.detailSqlTable
    ? selectedDef.detailSqlTable
    : selectedDef.sqlTable;

  // Generate blank template Excel with columns and notes
  const handleDownloadTemplate = () => {
    const headers = activeFields.map((f) => f.key);
    const sampleRow: Record<string, any> = {};
    activeFields.forEach((f) => {
      sampleRow[f.key] = f.sample;
    });

    const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers });

    // Set column widths
    const colWidths = activeFields.map((f) => ({
      wch: Math.max(f.key.length, f.label.length, 16),
    }));
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    const sheetTitle = activeTableName.substring(0, 31);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle);

    const fileName = isDetailMode
      ? `Template_${activeSqlTable}_Lines.xlsx`
      : `Template_${selectedDef.sqlTable}_${selectedDef.key}.xlsx`;

    XLSX.writeFile(workbook, fileName);
    showToast(`Template for ${activeTableName} downloaded successfully.`, 'success');
  };

  // Export current live table data to Excel
  const handleExportCurrentData = () => {
    if (isDetailMode) {
      // Export line items flattened across parent batches
      const exportLines: any[] = [];
      if (selectedEntityKey === 'dtBatches') {
        dtBatches.forEach((dt) => {
          if (Array.isArray(dt.toolLines)) {
            dt.toolLines.forEach((line, idx) => {
              exportLines.push({
                dtNumber: dt.dtNumber,
                itemNo: line.itemNo ?? idx + 1,
                serial: line.serial || '',
                assetNo: line.assetNo || '',
                shortDesc: line.shortDesc || '',
                desc: line.desc || line.toolDescription || '',
                size: line.size || '',
                qty: line.qty ?? 1,
                status: line.status || 'OnRig',
                ownership: line.ownership || 'EMDAD',
                remarks: line.remarks || '',
              });
            });
          }
        });
      } else if (selectedEntityKey === 'rtBatches') {
        rtBatches.forEach((rt) => {
          if (Array.isArray(rt.toolLines)) {
            rt.toolLines.forEach((line, idx) => {
              exportLines.push({
                rtNumber: rt.rtNumber,
                itemNo: line.itemNo ?? idx + 1,
                serial: line.serial || '',
                assetNo: line.assetNo || '',
                shortDesc: line.shortDesc || '',
                desc: line.desc || line.toolDescription || '',
                size: line.size || '',
                used: line.used ?? false,
                routedTo: line.routedTo || 'Inspection Bay',
                condition: line.condition || '',
                remarks: line.remarks || '',
              });
            });
          }
        });
      }

      if (exportLines.length === 0) {
        showToast(`No tool lines found in ${selectedDef.name} to export.`, 'info');
        return;
      }

      const fieldKeys = activeFields.map((f) => f.key);
      const worksheet = XLSX.utils.json_to_sheet(exportLines, { header: fieldKeys });
      const colWidths = activeFields.map((f) => ({
        wch: Math.max(f.key.length, 18),
      }));
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, activeTableName.substring(0, 31));

      const dateStamp = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `Export_${activeSqlTable}_${dateStamp}.xlsx`);
      showToast(`Exported ${exportLines.length} lines from ${activeTableName}.`, 'success');
      return;
    }

    if (!currentTableData || currentTableData.length === 0) {
      showToast(`No records found in ${selectedDef.name} to export.`, 'info');
      return;
    }

    const fieldKeys = selectedDef.fields.map((f) => f.key);

    const exportRows = currentTableData.map((item: any) => {
      const row: Record<string, any> = {};
      fieldKeys.forEach((key) => {
        const val = item[key];
        if (typeof val === 'object' && val !== null) {
          row[key] = JSON.stringify(val);
        } else {
          row[key] = val !== undefined && val !== null ? val : '';
        }
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: fieldKeys });
    const colWidths = selectedDef.fields.map((f) => ({
      wch: Math.max(f.key.length, 18),
    }));
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, selectedDef.name.substring(0, 31));

    const dateStamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Export_${selectedDef.sqlTable}_${dateStamp}.xlsx`);
    showToast(`Exported ${currentTableData.length} records from ${selectedDef.name}.`, 'success');
  };

  // Parse uploaded file (CSV or Excel)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setIsValidated(false);
    setValidationErrors([]);
    setProcessLogs([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });

        if (!json || json.length === 0) {
          showToast('The uploaded file is empty.', 'error');
          return;
        }

        setParsedRows(json);
        showToast(`Loaded ${json.length} rows from ${file.name}. Ready for validation.`, 'info');
      } catch (err: any) {
        showToast(`Failed to parse file: ${err?.message || 'Invalid format'}`, 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Validate uploaded records against table definitions
  const handleValidate = () => {
    if (parsedRows.length === 0) {
      showToast('Please upload an Excel or CSV file first.', 'error');
      return;
    }

    const errors: { row: number; column: string; message: string }[] = [];
    const fieldsToValidate = activeFields;
    const pk = isDetailMode
      ? (selectedDef.detailForeignKey || 'dtNumber')
      : selectedDef.primaryKey;
    const requiredFields = fieldsToValidate.filter((f) => f.required).map((f) => f.key);

    parsedRows.forEach((row, index) => {
      const rowNum = index + 2; // Accounting for header row
      // Check Primary / Foreign Key
      const pkValue = row[pk] || row[pk.toUpperCase()] || row[pk.toLowerCase()];
      if (!pkValue || String(pkValue).trim() === '') {
        errors.push({
          row: rowNum,
          column: pk,
          message: isDetailMode
            ? `Mandatory Parent Key "${pk}" is missing.`
            : `Mandatory Primary Key "${pk}" is missing.`,
        });
      }

      // Check other required fields
      requiredFields.forEach((reqKey) => {
        if (reqKey !== pk) {
          const val = row[reqKey] || row[reqKey.toUpperCase()] || row[reqKey.toLowerCase()];
          if (!val || String(val).trim() === '') {
            errors.push({
              row: rowNum,
              column: reqKey,
              message: `Required field "${reqKey}" is missing.`,
            });
          }
        }
      });
    });

    setValidationErrors(errors);
    setIsValidated(true);

    if (errors.length === 0) {
      showToast(`Validation Passed: ${parsedRows.length} rows verified without errors.`, 'success');
      setProcessLogs([
        {
          time: new Date().toLocaleTimeString(),
          type: 'success',
          msg: `Validation completed: ${parsedRows.length} rows validated successfully against ${activeSqlTable}.`,
        },
      ]);
    } else {
      showToast(`Validation Found ${errors.length} issue(s). Check the Error List below.`, 'error');
      setProcessLogs([
        {
          time: new Date().toLocaleTimeString(),
          type: 'error',
          msg: `Validation failed: Found ${errors.length} issue(s) across ${parsedRows.length} rows.`,
        },
      ]);
    }
  };

  // Process and commit imports into Database & State
  const handleProcess = async () => {
    if (parsedRows.length === 0) {
      showToast('No file loaded to process.', 'error');
      return;
    }

    if (!isValidated) {
      handleValidate();
      if (validationErrors.length > 0) {
        showToast('Please resolve validation errors before processing.', 'error');
        return;
      }
    }

    if (validationErrors.length > 0) {
      const proceed = window.confirm(
        `There are ${validationErrors.length} validation errors. Do you still want to proceed and skip bad rows?`
      );
      if (!proceed) return;
    }

    setIsProcessing(true);
    const startTime = Date.now();
    const total = parsedRows.length;
    let addedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    const newLogs = [...processLogs];
    newLogs.unshift({
      time: new Date().toLocaleTimeString(),
      type: 'info',
      msg: `Starting import of ${total} records into ${activeSqlTable}...`,
    });
    setProcessLogs(newLogs);

    // Helper to normalize an imported object
    const cleanRow = (raw: any, fields: FieldDefinition[]): any => {
      const cleaned: any = {};
      fields.forEach((f) => {
        let val = raw[f.key] ?? raw[f.label] ?? raw[f.key.toUpperCase()] ?? raw[f.key.toLowerCase()];
        if (f.type === 'number') {
          if (val !== undefined && val !== '' && val !== null) {
            const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
            cleaned[f.key] = isNaN(num) ? 0 : num;
          } else {
            cleaned[f.key] = null;
          }
        } else if (f.type === 'date') {
          if (val) {
            if (typeof val === 'number') {
              // Excel serial date format
              const d = new Date(Math.round((val - 25569) * 86400 * 1000));
              cleaned[f.key] = d.toISOString().split('T')[0];
            } else {
              cleaned[f.key] = String(val).trim();
            }
          } else {
            cleaned[f.key] = null;
          }
        } else if (f.type === 'boolean') {
          cleaned[f.key] = val === true || String(val).toLowerCase() === 'true' || val === 1 || val === '1';
        } else {
          cleaned[f.key] = val !== undefined && val !== null ? String(val).trim() : '';
        }
      });
      return cleaned;
    };

    // BRANCH A: Line Items Detail Import (DT Tool Lines or RT Tool Lines)
    if (isDetailMode && (selectedEntityKey === 'dtBatches' || selectedEntityKey === 'rtBatches')) {
      try {
        const parentKey = selectedEntityKey === 'dtBatches' ? 'dtNumber' : 'rtNumber';
        const modifiedParentBatches = new Map<string, any>();

        // Pre-populate clone map of parents
        if (selectedEntityKey === 'dtBatches') {
          dtBatches.forEach((dt) => {
            modifiedParentBatches.set(dt.dtNumber.trim().toUpperCase(), {
              ...dt,
              toolLines: Array.isArray(dt.toolLines) ? [...dt.toolLines] : [],
            });
          });
        } else {
          rtBatches.forEach((rt) => {
            modifiedParentBatches.set(rt.rtNumber.trim().toUpperCase(), {
              ...rt,
              toolLines: Array.isArray(rt.toolLines) ? [...rt.toolLines] : [],
            });
          });
        }

        for (let i = 0; i < parsedRows.length; i++) {
          const raw = parsedRows[i];
          const parentVal = String(raw[parentKey] || raw[parentKey.toUpperCase()] || raw[parentKey.toLowerCase()] || '').trim();
          const serialVal = String(raw.serial || raw.SERIAL || raw['Serial Number'] || '').trim();

          if (!parentVal || !serialVal) {
            errorCount++;
            continue;
          }

          let parentObj = modifiedParentBatches.get(parentVal.toUpperCase());
          if (!parentObj) {
            // Auto-create parent shell if allowAdd is true
            if (allowAdd) {
              if (selectedEntityKey === 'dtBatches') {
                parentObj = {
                  id: `DTB-${Date.now()}-${i}`,
                  dtNumber: parentVal,
                  jobId: 'PENDING-JOB',
                  rmDate: new Date().toISOString().split('T')[0],
                  rmRef: '',
                  dispatchDate: new Date().toISOString().split('T')[0],
                  rig: '',
                  well: '',
                  dispatchedBy: user.name,
                  toolLines: [],
                };
              } else {
                parentObj = {
                  id: `RTB-${Date.now()}-${i}`,
                  rtNumber: parentVal,
                  jobId: 'PENDING-JOB',
                  rtDate: new Date().toISOString().split('T')[0],
                  rig: '',
                  well: '',
                  receivedBy: user.name,
                  toolLines: [],
                };
              }
              modifiedParentBatches.set(parentVal.toUpperCase(), parentObj);
            } else {
              errorCount++;
              continue;
            }
          }

          const lineCleaned = cleanRow(raw, activeFields);
          const lines: any[] = parentObj.toolLines;
          const existingLineIdx = lines.findIndex(
            (l) => String(l.serial).trim().toUpperCase() === serialVal.toUpperCase()
          );

          if (existingLineIdx >= 0) {
            if (allowUpdate) {
              lines[existingLineIdx] = { ...lines[existingLineIdx], ...lineCleaned };
              updatedCount++;
            }
          } else {
            if (allowAdd) {
              lines.push({
                ...lineCleaned,
                itemNo: lineCleaned.itemNo || lines.length + 1,
              });
              addedCount++;
            }
          }

          if (i % 25 === 0 || i === total - 1) {
            const elapsedMin = (Date.now() - startTime) / 60000;
            const rpm = elapsedMin > 0 ? Math.round((i + 1) / elapsedMin) : 0;
            setProcessProgress({ current: i + 1, total, rpm });
          }
        }

        // Persist updated parents to Azure SQL
        const updatedParentList = Array.from(modifiedParentBatches.values());
        for (const batch of updatedParentList) {
          if (selectedEntityKey === 'dtBatches') {
            await saveDeliveryTicketApi(batch);
          } else {
            await saveReceivingTicketApi(batch);
          }
        }

        onUpdateState(selectedEntityKey, () => updatedParentList);

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const summaryMsg = `Processed ${total} detail lines in ${elapsedSec}s: ${addedCount} Added, ${updatedCount} Updated, ${errorCount} Skipped.`;
        setProcessLogs((prev) => [
          { time: new Date().toLocaleTimeString(), type: 'success', msg: summaryMsg },
          ...prev,
        ]);
        showToast(summaryMsg, 'success');
      } catch (err: any) {
        setProcessLogs((prev) => [
          { time: new Date().toLocaleTimeString(), type: 'error', msg: `Detail write failure: ${err?.message || 'Network error'}` },
          ...prev,
        ]);
        showToast('Error persisting tool lines to database.', 'error');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // BRANCH B: Standard Header Table Import
    const pk = selectedDef.primaryKey;
    const existingMap = new Map<string, any>();
    currentTableData.forEach((item: any) => {
      const val = item[pk];
      if (val) existingMap.set(String(val).trim().toUpperCase(), item);
    });

    const itemsToSave: any[] = [];
    const updatedStateList: any[] = [...currentTableData];

    for (let i = 0; i < parsedRows.length; i++) {
      const raw = parsedRows[i];
      const pkVal = String(raw[pk] || raw[pk.toUpperCase()] || raw[pk.toLowerCase()] || '').trim();

      if (!pkVal) {
        errorCount++;
        continue;
      }

      const norm = cleanRow(raw, selectedDef.fields);
      const existing = existingMap.get(pkVal.toUpperCase());

      if (existing) {
        if (allowUpdate) {
          const merged = { ...existing, ...norm };
          itemsToSave.push(merged);
          const idx = updatedStateList.findIndex(
            (it) => String(it[pk]).trim().toUpperCase() === pkVal.toUpperCase()
          );
          if (idx >= 0) updatedStateList[idx] = merged;
          updatedCount++;
        }
      } else {
        if (allowAdd) {
          itemsToSave.push(norm);
          updatedStateList.push(norm);
          addedCount++;
        }
      }

      // Progress reporting
      if (i % 25 === 0 || i === total - 1) {
        const elapsedMin = (Date.now() - startTime) / 60000;
        const rpm = elapsedMin > 0 ? Math.round((i + 1) / elapsedMin) : 0;
        setProcessProgress({ current: i + 1, total, rpm });
      }
    }

    // Persist changes to Azure SQL using dedicated API for each entity
    try {
      if (itemsToSave.length > 0) {
        const sampleLimit = Math.min(itemsToSave.length, 100);
        for (let j = 0; j < sampleLimit; j++) {
          const item = itemsToSave[j];
          if (selectedEntityKey === 'jobs') {
            await saveJobApi(item);
          } else if (selectedEntityKey === 'inventory') {
            await saveInventoryApi(item);
          } else if (selectedEntityKey === 'dtBatches') {
            await saveDeliveryTicketApi(item);
          } else if (selectedEntityKey === 'rtBatches') {
            await saveReceivingTicketApi(item);
          } else if (selectedEntityKey === 'callouts') {
            await saveCalloutApi(item);
          } else if (selectedEntityKey === 'gatePasses') {
            await saveGatePassApi(item);
          } else if (selectedEntityKey === 'contracts') {
            await saveContractApi(item);
          } else if (selectedEntityKey === 'inspections') {
            await saveInspectionApi(item);
          } else if (selectedEntityKey === 'maintenance') {
            await saveMaintenanceApi(item);
          }
        }
      }

      // Update in-memory state
      onUpdateState(selectedEntityKey, () => updatedStateList);

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const summaryMsg = `Processed ${total} rows in ${elapsedSec}s: ${addedCount} Added, ${updatedCount} Updated, ${errorCount} Skipped.`;

      setProcessLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          type: 'success',
          msg: summaryMsg,
        },
        ...prev,
      ]);

      showToast(summaryMsg, 'success');
    } catch (err: any) {
      setProcessLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          type: 'error',
          msg: `Database write failure: ${err?.message || 'Network error'}`,
        },
        ...prev,
      ]);
      showToast('Error persisting imported records to Azure SQL.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Group entities by Category for Epicor-style sidebar tree
  const groupedEntities = useMemo(() => {
    const groups: Record<string, TableDefinition[]> = {};
    Object.values(TABLE_DEFINITIONS).forEach((def) => {
      if (!groups[def.category]) groups[def.category] = [];
      groups[def.category].push(def);
    });
    return groups;
  }, []);

  const filteredEntities = useMemo(() => {
    if (!searchFilter.trim()) return TABLE_DEFINITIONS;
    const q = searchFilter.toLowerCase();
    const result: Record<string, TableDefinition> = {};
    Object.entries(TABLE_DEFINITIONS).forEach(([k, def]) => {
      if (
        def.name.toLowerCase().includes(q) ||
        def.sqlTable.toLowerCase().includes(q) ||
        def.epicorCode.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q)
      ) {
        result[k as TableEntityKey] = def;
      }
    });
    return result as Record<TableEntityKey, TableDefinition>;
  }, [searchFilter]);

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-slate-100">
      {/* Top Banner (Epicor DMT Header Style) */}
      <div className="bg-[#1a3055] text-white px-4 py-2.5 flex items-center justify-between shadow-xs shrink-0 border-b border-[#24426d]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-base shadow-xs">
            <Database className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-wide text-white">EMDAD DMT</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-900/80 text-blue-200 border border-blue-700/50">
                Data Management Tool
              </span>
              <span className="text-[11px] text-blue-200 font-medium">
                — Direct Database Upload & Sync
              </span>
            </div>
            <p className="text-[11px] text-blue-300/90 leading-none mt-0.5">
              Safely import, update, and extract records without modifying Azure SQL directly.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRefreshAllData && (
            <button
              onClick={async () => {
                showToast('Refreshing live data from Azure SQL...', 'info');
                await onRefreshAllData();
                showToast('All database tables refreshed.', 'success');
              }}
              className="px-2.5 py-1 text-xs bg-blue-900/60 hover:bg-blue-800 text-blue-100 rounded border border-blue-700/60 transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
              title="Pull latest live records from Azure SQL"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Azure SQL</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 text-[11px] font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Admin Clearance: {user.name}</span>
          </div>
        </div>
      </div>

      {/* Main DMT Window (Split Left Navigation Tree & Right Import Workspace) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Tables Navigation Tree (Epicor DMT Left Sidebar) */}
        <div className="w-72 bg-white border-r border-slate-300 flex flex-col shrink-0 shadow-xs">
          {/* Tree Header & Filter */}
          <div className="p-2.5 border-b border-slate-200 bg-slate-50">
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <FolderTree className="w-3.5 h-3.5 text-slate-500" />
                <span>Database Tables</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {Object.keys(TABLE_DEFINITIONS).length} Tables
              </span>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search table or code..."
                className="w-full pl-7 pr-2 py-1 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
              />
            </div>
          </div>

          {/* Table List / Tree View */}
          <div className="flex-1 overflow-y-auto p-1 text-xs">
            {Object.entries(groupedEntities).map(([category, items]) => {
              const matchedItems = items.filter((it) => filteredEntities[it.key]);
              if (matchedItems.length === 0) return null;

              return (
                <div key={category} className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100/80 rounded flex items-center gap-1.5">
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                    <span>{category}</span>
                  </div>

                  <div className="mt-0.5 space-y-0.5 pl-2">
                    {matchedItems.map((def) => {
                      const isSelected = selectedEntityKey === def.key;
                      let count = 0;
                      switch (def.key) {
                        case 'jobs': count = jobs.length; break;
                        case 'inventory': count = inventory.length; break;
                        case 'dtBatches': count = dtBatches.length; break;
                        case 'rtBatches': count = rtBatches.length; break;
                        case 'callouts': count = callouts.length; break;
                        case 'gatePasses': count = gatePasses.length; break;
                        case 'inspections': count = inspections.length; break;
                        case 'maintenance': count = maintenance.length; break;
                        case 'contracts': count = contracts.length; break;
                      }

                      return (
                        <button
                          key={def.key}
                          onClick={() => {
                            setSelectedEntityKey(def.key);
                            setIsDetailMode(false);
                            setParsedRows([]);
                            setUploadedFileName(null);
                            setIsValidated(false);
                            setValidationErrors([]);
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-blue-100/80 text-blue-900 font-bold border-l-3 border-[#1a3055]'
                              : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="flex flex-col min-w-0 pr-1">
                            <span className="truncate text-xs">{def.name}</span>
                            <span className="font-mono text-[10px] text-slate-400 truncate">
                              {def.sqlTable}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] bg-slate-200/70 text-slate-600 px-1.5 py-0.2 rounded shrink-0">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Info Box in Tree Footer */}
          <div className="p-2.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-600">
            <div className="flex items-center gap-1 text-slate-800 font-semibold mb-1">
              <Info className="w-3.5 h-3.5 text-blue-600" />
              <span>Safe Database Architecture</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">
              Excel and CSV imports validate primary keys and sanitize data before triggering Azure SQL stored sync procedures.
            </p>
          </div>
        </div>

        {/* Right Side: Selected Table Workspace */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          {/* Entity Tab Header (Epicor UD Source Bar) */}
          <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded bg-[#1a3055] text-white font-mono font-bold text-xs">
                {selectedDef.epicorCode}
              </span>
              <div>
                <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span>{activeTableName}</span>
                  <span className="text-xs font-mono font-normal text-slate-400">({activeSqlTable})</span>
                </div>
                {selectedDef.detailFields && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <button
                      onClick={() => {
                        setIsDetailMode(false);
                        setParsedRows([]);
                        setUploadedFileName(null);
                        setIsValidated(false);
                        setValidationErrors([]);
                      }}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                        !isDetailMode
                          ? 'bg-[#1a3055] text-white font-semibold'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      Header Table ({selectedDef.name})
                    </button>
                    <button
                      onClick={() => {
                        setIsDetailMode(true);
                        setParsedRows([]);
                        setUploadedFileName(null);
                        setIsValidated(false);
                        setValidationErrors([]);
                      }}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                        isDetailMode
                          ? 'bg-[#1a3055] text-white font-semibold'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      Lines Detail ({selectedDef.detailName})
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-3 py-1 text-xs rounded bg-white hover:bg-slate-50 text-slate-700 font-medium border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Download ready-to-fill Excel template with headers and sample data"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                <span>Template Builder</span>
              </button>

              <button
                onClick={handleExportCurrentData}
                className="px-3 py-1 text-xs rounded bg-white hover:bg-slate-50 text-slate-700 font-medium border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Export all live records currently in the database to Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export Current Data</span>
              </button>
            </div>
          </div>

          {/* File Upload & Source Select Bar */}
          <div className="p-3 bg-slate-200/70 border-b border-slate-300 flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
              Source File:
            </span>
            <div className="flex-1 flex items-center gap-2 bg-white border border-slate-300 rounded px-2.5 py-1">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <input
                type="text"
                readOnly
                value={uploadedFileName || 'No source file selected. Click Browse or drag-and-drop file.'}
                className="w-full text-xs text-slate-700 bg-transparent outline-none truncate font-mono"
              />
              {parsedRows.length > 0 && (
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded shrink-0 border border-blue-200 font-mono">
                  {parsedRows.length} Rows
                </span>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded border border-slate-300 shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Browse...</span>
            </button>

            {parsedRows.length > 0 && (
              <button
                onClick={() => {
                  setParsedRows([]);
                  setUploadedFileName(null);
                  setIsValidated(false);
                  setValidationErrors([]);
                }}
                className="px-2 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-medium cursor-pointer"
                title="Clear loaded file"
              >
                Clear
              </button>
            )}
          </div>

          {/* Workspace Tabs (Data Preview / Field Mapping) */}
          <div className="flex border-b border-slate-200 bg-white px-4 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('import')}
              className={`py-2 px-3 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'import'
                  ? 'border-[#1a3055] text-[#1a3055]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Data Import & Preview ({parsedRows.length} rows loaded)
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`py-2 px-3 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'preview'
                  ? 'border-[#1a3055] text-[#1a3055]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Database Schema & Columns ({activeFields.length} columns)
            </button>
          </div>

          {/* Central Workspace Table */}
          <div className="flex-1 overflow-auto p-3">
            {activeTab === 'import' ? (
              parsedRows.length > 0 ? (
                <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden">
                  <div className="max-h-[220px] overflow-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b border-slate-200 font-bold">
                        <tr>
                          <th className="p-2 w-12 text-center text-[10px] text-slate-400 border-r border-slate-200">#</th>
                          {activeFields.map((field) => (
                            <th key={field.key} className="p-2 whitespace-nowrap border-r border-slate-200">
                              <div className="flex flex-col">
                                <span>{field.label}</span>
                                <span className="text-[10px] font-mono text-slate-400 font-normal">
                                  {field.key} {field.required && <span className="text-rose-600 font-bold">*</span>}
                                </span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows.slice(0, 100).map((row, idx) => (
                          <tr key={idx} className="hover:bg-blue-50/40">
                            <td className="p-2 text-center font-mono text-[10px] text-slate-400 bg-slate-50/50 border-r border-slate-200">
                              {idx + 1}
                            </td>
                            {activeFields.map((field) => {
                              const val = row[field.key] ?? row[field.label] ?? row[field.key.toUpperCase()] ?? row[field.key.toLowerCase()];
                              return (
                                <td key={field.key} className="p-2 whitespace-nowrap border-r border-slate-100 font-mono text-[11px] text-slate-800">
                                  {val !== undefined && val !== null ? String(val) : <span className="text-slate-300">—</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedRows.length > 100 && (
                    <div className="p-2 bg-slate-50 text-[11px] text-slate-500 text-center border-t border-slate-200 font-sans">
                      Showing first 100 of {parsedRows.length} rows for preview. Full dataset will be processed on clicking Process.
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-8 text-center bg-white">
                  <FileSpreadsheet className="w-12 h-12 text-slate-300 mb-2" />
                  <div className="text-sm font-bold text-slate-700">No Data File Loaded</div>
                  <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
                    Download the <strong>Template Builder</strong> Excel file, fill in or update your records, and upload it here. You can also export current records, edit in Excel, and re-import with <strong>Update</strong> checked.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadTemplate}
                      className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded border border-slate-300 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      <span>Download Excel Template</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-1.5 text-xs bg-[#1a3055] hover:bg-[#24426d] text-white font-semibold rounded shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-blue-200" />
                      <span>Upload Completed Excel</span>
                    </button>
                  </div>
                </div>
              )
            ) : (
              // Database Schema & Column Dictionary Tab
              <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2">Field Key</th>
                      <th className="p-2">Label</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Constraint</th>
                      <th className="p-2">Description</th>
                      <th className="p-2 font-mono">Sample Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {activeFields.map((f) => (
                      <tr key={f.key} className="hover:bg-slate-50">
                        <td className="p-2 font-mono font-bold text-slate-800">{f.key}</td>
                        <td className="p-2 font-medium text-slate-700">{f.label}</td>
                        <td className="p-2">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                            {f.type}
                          </span>
                        </td>
                        <td className="p-2">
                          {f.required ? (
                            <span className="text-rose-600 font-bold text-[10px] bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                              Required
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Optional</span>
                          )}
                        </td>
                        <td className="p-2 text-slate-600">{f.description}</td>
                        <td className="p-2 font-mono text-slate-700 bg-slate-50/60 text-[11px]">{String(f.sample)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Lower Panel: Epicor DMT Control Bar (Add/Update Checkboxes, Validate, Process, Logs) */}
          <div className="bg-white border-t border-slate-300 p-3 shrink-0 shadow-md">
            {/* Upper control strip */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-2.5 border-b border-slate-200">
              {/* Checkboxes like Epicor DMT */}
              <div className="flex items-center gap-5 text-xs select-none">
                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={allowAdd}
                    onChange={(e) => setAllowAdd(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span>Add New</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={allowUpdate}
                    onChange={(e) => setAllowUpdate(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span>Update Existing</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-not-allowed opacity-50 font-semibold text-slate-500" title="Delete is disabled to protect database integrity">
                  <input
                    type="checkbox"
                    checked={allowDelete}
                    disabled
                    onChange={() => {}}
                    className="w-4 h-4 text-slate-400 rounded border-slate-300"
                  />
                  <span>Delete</span>
                </label>

                <div className="h-4 w-px bg-slate-300 mx-1"></div>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 text-[11px]">
                  <input
                    type="checkbox"
                    checked={writeCompleteLog}
                    onChange={(e) => setWriteCompleteLog(e.target.checked)}
                    className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300"
                  />
                  <span>Write Complete Log</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 text-[11px]">
                  <input
                    type="checkbox"
                    checked={writeErrorsToLog}
                    onChange={(e) => setWriteErrorsToLog(e.target.checked)}
                    className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300"
                  />
                  <span>Write Errors to Log</span>
                </label>
              </div>

              {/* Action Buttons (Validate, Process, Cancel) */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleValidate}
                  disabled={parsedRows.length === 0 || isProcessing}
                  className={`px-4 py-1.5 text-xs font-semibold rounded border transition-colors flex items-center gap-1.5 shadow-2xs ${
                    parsedRows.length === 0 || isProcessing
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300 cursor-pointer'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Validate</span>
                </button>

                <button
                  onClick={handleProcess}
                  disabled={parsedRows.length === 0 || isProcessing}
                  className={`px-4 py-1.5 text-xs font-bold rounded shadow-xs transition-colors flex items-center gap-1.5 ${
                    parsedRows.length === 0 || isProcessing
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                  }`}
                >
                  {isProcessing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>{isProcessing ? 'Processing...' : 'Process'}</span>
                </button>
              </div>
            </div>

            {/* Status Statistics bar (Epicor Metrics) */}
            <div className="grid grid-cols-4 gap-2 pt-2 text-[11px] text-slate-600 font-mono">
              <div>
                <span className="text-slate-400">Total Rows: </span>
                <span className="font-bold text-slate-800">{parsedRows.length}</span>
              </div>
              <div>
                <span className="text-slate-400">Errors: </span>
                <span className={`font-bold ${validationErrors.length > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                  {validationErrors.length}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Processed: </span>
                <span className="font-bold text-slate-800">
                  {processProgress.current} / {processProgress.total}
                </span>
              </div>
              <div>
                <span className="text-slate-400">RPM: </span>
                <span className="font-bold text-slate-800">{processProgress.rpm} rows/min</span>
              </div>
            </div>

            {/* Error Log Box (Epicor DMT bottom text area) */}
            <div className="mt-2 bg-slate-900 text-slate-100 rounded p-2 text-xs font-mono h-24 overflow-y-auto border border-slate-700">
              {validationErrors.length > 0 && (
                <div className="mb-2 text-rose-400 font-bold border-b border-rose-900/60 pb-1">
                  ⚠ Validation Issues ({validationErrors.length}):
                  {validationErrors.map((err, i) => (
                    <div key={i} className="text-[11px] text-rose-300 font-normal">
                      [Row {err.row}] Column "{err.column}": {err.message}
                    </div>
                  ))}
                </div>
              )}

              {processLogs.length > 0 ? (
                processLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`text-[11px] leading-relaxed ${
                      log.type === 'error'
                        ? 'text-rose-400'
                        : log.type === 'success'
                        ? 'text-emerald-400'
                        : log.type === 'warn'
                        ? 'text-amber-400'
                        : 'text-slate-300'
                    }`}
                  >
                    <span className="text-slate-500">[{log.time}]</span> {log.msg}
                  </div>
                ))
              ) : (
                <div className="text-slate-500 italic text-[11px]">
                  Process and validation logs will appear here upon loading and running imports.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
