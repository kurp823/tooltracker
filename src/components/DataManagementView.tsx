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
  ContractRateItem,
  SubDivision,
} from '../types';
import {
  saveJobApi,
  saveInventoryApi,
  saveDeliveryTicketApi,
  saveReceivingTicketApi,
  saveCalloutApi,
  saveGatePassApi,
  saveContractApi,
  saveContractRatesApi,
  saveInspectionApi,
  saveMaintenanceApi,
  saveCustomColumnsApi,
  fetchLiveDatabaseData,
  fetchSecondaryModules,
} from '../services/api';
import {
  CustomColumnDef,
  getCustomColumns,
  saveCustomColumns,
} from '../services/customColumnService';
import {
  saveCustomContract,
  saveCustomContractRates,
} from '../services/customContracts';
import {
  getConsumablesList,
  saveConsumablesList,
  getConsumableIssuances,
  saveConsumableIssuances,
} from '../services/consumablesService';
import {
  loadPurchaseOrders,
  saveAllPurchaseOrders,
  loadGoodsReceiptNotes,
  saveAllGoodsReceiptNotes,
  PurchaseOrder,
  GoodsReceiptNote,
  POLineItem,
  GRNLineItem,
} from '../services/poManagementService';
import {
  getSubContractorRentals,
  saveSubContractorRentals,
} from '../services/subContractorRentalService';
import {
  getMonthlyExpenseRecords,
  saveMonthExpenseRecord,
  STANDARD_COST_CODES,
} from '../services/monthlyExpenseService';
import {
  loadCrewPersonnel,
  saveAllCrewPersonnel,
} from '../services/crewPersonnelService';
import {
  DROPDOWN_DEFINITIONS,
  getDropdownOptions,
  saveDropdownOptions,
  addDropdownOption,
  DropdownListKey,
} from '../services/dropdownService';
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
  Plus,
  Trash2,
  Sliders,
  ShieldAlert,
  Info,
  Eye,
  Table,
  ListFilter,
} from 'lucide-react';

export type TableEntityKey =
  // Core Operations
  | 'jobs'
  | 'inventory'
  | 'dtBatches'
  | 'rtBatches'
  | 'callouts'
  | 'gatePasses'
  | 'inspections'
  | 'maintenance'
  | 'contracts'
  | 'contractRates'
  // Consumables & Stores
  | 'consumables'
  | 'consumable_issuances'
  // Procurement & Goods Inward (PO & GRN)
  | 'purchase_orders'
  | 'purchase_order_lines'
  | 'goods_receipts'
  | 'goods_receipt_lines'
  // Financial, Sub-Contractors & P&L
  | 'subcontractor_rentals'
  | 'monthly_expenses'
  // Master Configuration & Personnel
  | 'tool_categories'
  | 'tool_sizes'
  | 'crew_members'
  | 'dropdown_lookups'
  // Job Dossier Sub-Screens
  | 'dossier_checklist'
  | 'dossier_itemsselect'
  | 'dossier_crew'
  | 'dossier_ddr'
  | 'dossier_utilization';

export interface FieldDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  required?: boolean;
  description: string;
  sample: any;
  defaultSample?: any;
  allowedValues?: string[];
  isCustom?: boolean;
}

export type TableCategory =
  | 'Operations'
  | 'Inventory & Stores'
  | 'Procurement (PO & GRN)'
  | 'Financial & Sub-Rentals'
  | 'Quality & Maintenance'
  | 'Commercial & Contracts'
  | 'Master Config & Personnel'
  | 'Job Dossier';

interface TableDefinition {
  key: TableEntityKey;
  sqlTable: string;
  epicorCode: string;
  name: string;
  primaryKey: string;
  category: TableCategory;
  description: string;
  fields: FieldDefinition[];
  detailKey?: string;
  detailForeignKey?: string;
  detailName?: string;
  detailSqlTable?: string;
  detailFields?: FieldDefinition[];
}

const TABLE_DEFINITIONS: Record<TableEntityKey, TableDefinition> = {
  // Job Dossier Sub-Screens Models
  dossier_checklist: {
    key: 'dossier_checklist',
    sqlTable: 'tbl_JobChecklistLines',
    epicorCode: 'JD001 - Dossier Checklist',
    name: 'Job Dossier: Planned Tools (Checklist)',
    primaryKey: 'partNo',
    category: 'Job Dossier',
    description: 'Job planned equipment, reserved items, inspection certs and delivery readiness checklist inside Job Dossier.',
    fields: [
      { key: 'itemNo', label: 'Item No (Seq)', type: 'number', required: true, description: 'Line sequence number', sample: 1 },
      { key: 'partNo', label: 'PartNo / Serial', type: 'string', required: true, description: 'Assigned tool serial or asset ID', sample: 'EMD-1025' },
      { key: 'description', label: 'Description', type: 'string', required: true, description: 'Tool technical description', sample: '6-1/2" HYDRAULIC DRILLING JAR' },
      { key: 'size', label: 'Size', type: 'string', description: 'Tool OD / Size', sample: '6-1/2"' },
      { key: 'qty', label: 'DTQTY', type: 'number', required: true, description: 'Dispatched quantity', sample: 1 },
      { key: 'supplier', label: 'Supplier', type: 'string', description: 'Tool owner / vendor', sample: 'EMDAD' },
      { key: 'qtyIn', label: 'QTYIN', type: 'number', description: 'Quantity received back', sample: 1 },
      { key: 'insNum', label: 'INS_NUM', type: 'string', description: 'QC Inspection certificate number', sample: 'GIS-Z-01480-2023' },
      { key: 'insDate', label: 'INS_DATE', type: 'date', description: 'Inspection certification date', sample: '2023-05-15' },
      { key: 'comments', label: 'Comments / Acceptance', type: 'string', description: 'Inspection acceptance comments', sample: 'ACCEPTED' },
      { key: 'cat', label: 'Category', type: 'string', description: 'Tool category classification', sample: 'HYD DRILLING JAR' },
    ],
  },
  dossier_itemsselect: {
    key: 'dossier_itemsselect',
    sqlTable: 'tbl_ToolPicker_View',
    epicorCode: 'JD002 - Tool Assignment Picker',
    name: 'Job Dossier: Tool Assignment Picker (itemsselect)',
    primaryKey: 'serial',
    category: 'Job Dossier',
    description: 'Modal grid used by operations supervisors to search, filter, and assign downhole tools to jobs.',
    fields: [
      { key: 'serial', label: 'PartNo / Serial', type: 'string', required: true, description: 'Tool serial number', sample: 'EMD-1025' },
      { key: 'description', label: 'Description', type: 'string', required: true, description: 'Tool full description', sample: '7" OD CUTLIP GUIDE' },
      { key: 'size', label: 'Size', type: 'string', description: 'Tool OD', sample: '7"' },
      { key: 'qty', label: 'DTQTY', type: 'number', description: 'Quantity available', sample: 1 },
      { key: 'supplier', label: 'Supplier', type: 'string', description: 'Tool ownership entity', sample: 'EMDAD' },
      { key: 'insDate', label: 'Ins_Date', type: 'date', description: 'Latest inspection date', sample: '2023-03-31' },
      { key: 'insNum', label: 'Ins_Num', type: 'string', description: 'Latest inspection certificate', sample: 'GIS-Z-01073-2023' },
      { key: 'condition', label: 'Condition', type: 'string', description: 'Condition state', sample: 'ACCEPTED' },
    ],
  },
  dossier_crew: {
    key: 'dossier_crew',
    sqlTable: 'tbl_JobCrewMembers',
    epicorCode: 'JD003 - Field Crew & Engineers',
    name: 'Job Dossier: Field Engineers & Rig Crew',
    primaryKey: 'badgeNo',
    category: 'Job Dossier',
    description: 'Certified field fishing engineers, whipstock specialists, and rig tool supervisors allocated to the job.',
    fields: [
      { key: 'badgeNo', label: 'Badge #', type: 'string', required: true, description: 'Company badge number', sample: 'EMD-4102' },
      { key: 'name', label: 'Engineer Name', type: 'string', required: true, description: 'Full certified name', sample: 'Ahmed Al-Mansoor' },
      { key: 'designation', label: 'Designation / Role', type: 'string', required: true, description: 'Operational role', sample: 'Lead Fishing Engineer' },
      { key: 'mobDate', label: 'Mob Date', type: 'date', description: 'Mobilization date to rig', sample: '2023-05-15' },
      { key: 'demobDate', label: 'Demob Date', type: 'date', description: 'Demobilization date from rig', sample: '2023-05-28' },
      { key: 'rigPassNo', label: 'Rig Pass / Cert', type: 'string', description: 'Rig Pass safety number', sample: 'RP-88421' },
      { key: 'h2sExpiry', label: 'H2S Expiry', type: 'date', description: 'H2S certification expiry date', sample: '2025-12-12' },
      { key: 'status', label: 'Crew Status', type: 'string', description: 'Status on rig', sample: 'Mobilized (On Rig)' },
    ],
  },
  dossier_ddr: {
    key: 'dossier_ddr',
    sqlTable: 'tbl_JobDailyLogs',
    epicorCode: 'JD004 - 24-Hr Daily Operations Logs',
    name: 'Job Dossier: 24-Hr Operations Log (DDR)',
    primaryKey: 'id',
    category: 'Job Dossier',
    description: 'Daily operational progress, standby vs operational hours, hole depth, and field engineer remarks.',
    fields: [
      { key: 'id', label: 'Log ID', type: 'string', required: true, description: 'Unique log entry ID', sample: 'DDR-01' },
      { key: 'date', label: 'Log Date', type: 'date', required: true, description: 'Date of operation', sample: '2023-05-16' },
      { key: 'status', label: 'Status', type: 'string', required: true, description: 'Operational or Standby', sample: 'Operational' },
      { key: 'depth', label: 'Hole Depth / Section', type: 'string', description: 'Current hole depth or section', sample: '8-1/2" Section (3,420 m)' },
      { key: 'activity', label: '24-Hr Operations Summary', type: 'string', required: true, description: 'Detailed shift remarks', sample: 'Run in hole with fishing assembly. Latched fish at 3,410m.' },
      { key: 'loggedBy', label: 'Logged By', type: 'string', description: 'Field supervisor name', sample: 'Ahmed Al-Mansoor' },
    ],
  },
  dossier_utilization: {
    key: 'dossier_utilization',
    sqlTable: 'tbl_JobToolUtilization',
    epicorCode: 'JD005 - Utilization Matrix',
    name: 'Job Dossier: Tool Utilization Ledger',
    primaryKey: 'serial',
    category: 'Job Dossier',
    description: 'Day-by-day tool operating days, standby days, and rental rate calculation ledger inside Job Dossier.',
    fields: [
      { key: 'serial', label: 'Tool Serial', type: 'string', required: true, description: 'Serialized tool number', sample: 'EMD-1025' },
      { key: 'assetNo', label: 'Asset Number', type: 'string', description: 'Asset or Part number', sample: 'DJ650-003' },
      { key: 'operDays', label: 'Operating Days', type: 'number', description: 'Total operating days', sample: 12 },
      { key: 'standbyDays', label: 'Standby Days', type: 'number', description: 'Total standby days', sample: 3 },
      { key: 'dayRate', label: 'Operating Day Rate', type: 'number', description: 'Contract rate per day', sample: 450 },
      { key: 'standbyRate', label: 'Standby Day Rate', type: 'number', description: 'Standby rate per day', sample: 225 },
      { key: 'totalAmount', label: 'Total Charge', type: 'number', description: 'Calculated charge amount', sample: 6075 },
    ],
  },
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
      {
        key: 'status',
        label: 'Current Status',
        type: 'string',
        description: 'Job lifecycle status: Open, Ongoing, Waiting on Signed Docs, Submitted to Billing Team, SES Submitted, Final invoiced, Completed, Closed',
        sample: 'Ongoing (Options: Open | Ongoing | Waiting on Signed Docs | Submitted to Billing Team | SES Submitted | Final invoiced | Completed | Closed)',
        defaultSample: 'Ongoing',
        allowedValues: ['Open', 'Ongoing', 'Waiting on Signed Docs', 'Submitted to Billing Team', 'SES Submitted', 'Final invoiced', 'Completed', 'Closed'],
      },
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
    category: 'Inventory & Stores',
    description: 'Downhole drilling tools, jars, shock tools, reamers, stabilizers, crossovers, and motors inventory.',
    fields: [
      { key: 'serial', label: 'Serial Number', type: 'string', required: true, description: 'Physical serial / Asset ID', sample: 'EMD-1025' },
      { key: 'assetNo', label: 'Part Number / Asset No', type: 'string', description: 'Part/Catalog reference', sample: 'DJ650-003' },
      { key: 'shortDesc', label: 'Tool Category / Type', type: 'string', required: true, description: 'Classification (e.g., HYD DRILLING JAR, STABILIZER)', sample: 'HYD DRILLING JAR' },
      { key: 'desc', label: 'Full Description', type: 'string', description: 'Detailed engineering description', sample: '6-1/2" HYDRAULIC DRILLING JAR 4-1/2" IF' },
      { key: 'size', label: 'Tool Size / OD', type: 'string', description: 'Tool outer diameter (e.g., 6-1/2", 8", 9-1/2")', sample: '6-1/2"' },
      { key: 'qty', label: 'Quantity', type: 'number', description: 'Quantity (usually 1 per serial)', sample: 1 },
      {
        key: 'location',
        label: 'Current Location',
        type: 'string',
        description: 'Current physical location: Emdad Base, On Rig, Inspection Bay, Workshop, Returned to Supplier',
        sample: 'Emdad Base (Options: Emdad Base | On Rig | Inspection Bay | Workshop | Returned to Supplier)',
        defaultSample: 'Emdad Base',
        allowedValues: ['Emdad Base', 'On Rig', 'Inspection Bay', 'Workshop', 'Returned to Supplier'],
      },
      {
        key: 'status',
        label: 'Tool Status',
        type: 'string',
        description: 'Tool readiness status: Good, Inspection, Repair, Redress, On Rig, Removed, Lost in Hole, Scrapped',
        sample: 'Good (Options: Good | Inspection | Repair | Redress | On Rig | Removed | Lost in Hole | Scrapped)',
        defaultSample: 'Good',
        allowedValues: ['Good', 'Inspection', 'Repair', 'Redress', 'On Rig', 'Removed', 'Lost in Hole', 'Scrapped'],
      },
      {
        key: 'ownership',
        label: 'Ownership',
        type: 'string',
        description: 'Tool ownership entity: EMDAD, MOTORMAX, EPIS, ELITE, SALTIRE, Customer',
        sample: 'EMDAD (Options: EMDAD | MOTORMAX | EPIS | ELITE | SALTIRE | Customer)',
        defaultSample: 'EMDAD',
        allowedValues: ['EMDAD', 'MOTORMAX', 'EPIS', 'ELITE', 'SALTIRE', 'Customer'],
      },
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
      {
        key: 'status',
        label: 'Status',
        type: 'string',
        description: 'Tool status on ticket: OnRig (active on rig) or Returned (backloaded to base)',
        sample: 'OnRig (Options: OnRig | Returned)',
        defaultSample: 'OnRig',
        allowedValues: ['OnRig', 'Returned'],
      },
      {
        key: 'ownership',
        label: 'Ownership',
        type: 'string',
        description: 'Tool ownership entity: EMDAD, MOTORMAX, EPIS, ELITE, SALTIRE, Customer',
        sample: 'EMDAD (Options: EMDAD | MOTORMAX | EPIS | ELITE | SALTIRE | Customer)',
        defaultSample: 'EMDAD',
        allowedValues: ['EMDAD', 'MOTORMAX', 'EPIS', 'ELITE', 'SALTIRE', 'Customer'],
      },
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
      {
        key: 'condition',
        label: 'Condition',
        type: 'string',
        description: 'Overall backload condition: Good, Used, Damaged, Redress Needed',
        sample: 'Used (Options: Good | Used | Damaged | Redress Needed)',
        defaultSample: 'Used',
        allowedValues: ['Good', 'Used', 'Damaged', 'Redress Needed'],
      },
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
      {
        key: 'used',
        label: 'Used on Well?',
        type: 'boolean',
        description: 'Downhole run flag: true (run downhole) or false (standby/unused)',
        sample: 'true (Options: true | false)',
        defaultSample: true,
        allowedValues: ['true', 'false'],
      },
      {
        key: 'routedTo',
        label: 'Routed To',
        type: 'string',
        description: 'Base routing location: Inspection Bay, Emdad Base, Workshop, Available Inventory',
        sample: 'Inspection Bay (Options: Inspection Bay | Emdad Base | Workshop | Available Inventory)',
        defaultSample: 'Inspection Bay',
        allowedValues: ['Inspection Bay', 'Emdad Base', 'Workshop', 'Available Inventory'],
      },
      {
        key: 'condition',
        label: 'Tool Condition',
        type: 'string',
        description: 'Specific physical condition: Good condition, Used, Damaged, Seals worn, Thread damaged',
        sample: 'Good condition (Options: Good condition | Used | Damaged | Seals worn | Thread damaged)',
        defaultSample: 'Good condition',
        allowedValues: ['Good condition', 'Used', 'Damaged', 'Seals worn', 'Thread damaged'],
      },
      {
        key: 'ownership',
        label: 'Ownership',
        type: 'string',
        description: 'Tool ownership entity: EMDAD, MOTORMAX, EPIS, ELITE, SALTIRE, Customer',
        sample: 'EMDAD (Options: EMDAD | MOTORMAX | EPIS | ELITE | SALTIRE | Customer)',
        defaultSample: 'EMDAD',
        allowedValues: ['EMDAD', 'MOTORMAX', 'EPIS', 'ELITE', 'SALTIRE', 'Customer'],
      },
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
      {
        key: 'status',
        label: 'Status',
        type: 'string',
        description: 'Callout status: Active, Forecast, Pending, In Progress, Closed',
        sample: 'Active (Options: Active | Forecast | Pending | In Progress | Closed)',
        defaultSample: 'Active',
        allowedValues: ['Active', 'Forecast', 'Pending', 'In Progress', 'Closed'],
      },
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
    category: 'Inventory & Stores',
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
    category: 'Quality & Maintenance',
    description: 'Receiving inspection, MPI, ultrasonic, thread visual, and QA/QC certifications.',
    fields: [
      { key: 'woNumber', label: 'Work Order Number', type: 'string', required: true, description: 'Unique inspection WO (e.g. WO-INS-26-0001)', sample: 'WO-INS-26-0001' },
      { key: 'serial', label: 'Tool Serial Number', type: 'string', required: true, description: 'Inspected tool serial', sample: 'EMD-1025' },
      { key: 'shortDesc', label: 'Tool Category', type: 'string', description: 'Tool classification', sample: 'HYD DRILLING JAR' },
      { key: 'receivedDate', label: 'Received Date', type: 'date', description: 'Date received in inspection bay', sample: '2026-03-08' },
      { key: 'inspector', label: 'Inspector Name', type: 'string', description: 'Certified NDT inspector', sample: 'Nihas' },
      {
        key: 'status',
        label: 'Inspection Status',
        type: 'string',
        description: 'QC inspection status: Pending, In Progress, Pass, Fail, Complete',
        sample: 'Pass (Options: Pending | In Progress | Pass | Fail | Complete)',
        defaultSample: 'Pass',
        allowedValues: ['Pending', 'In Progress', 'Pass', 'Fail', 'Complete'],
      },
      { key: 'reportNumber', label: 'NDT Report Number', type: 'string', description: 'Official inspection cert/report number', sample: 'NDT-2026-0412' },
      {
        key: 'disposition',
        label: 'Disposition',
        type: 'string',
        description: 'Post-inspection disposition: Accept to Fleet, Send to Redress, Scrap, Quarantine',
        sample: 'Accept to Fleet (Options: Accept to Fleet | Send to Redress | Scrap | Quarantine)',
        defaultSample: 'Accept to Fleet',
        allowedValues: ['Accept to Fleet', 'Send to Redress', 'Scrap', 'Quarantine'],
      },
      { key: 'notes', label: 'Findings / Remarks', type: 'string', description: 'Technical findings', sample: 'Threads and seals passed full visual & dimensional' },
    ],
  },
  maintenance: {
    key: 'maintenance',
    sqlTable: 'tbl_MaintenanceOrders',
    epicorCode: 'UD108 - Maintenance Orders',
    name: 'Maintenance & Repairs',
    primaryKey: 'woNumber',
    category: 'Quality & Maintenance',
    description: 'In-house workshop redressing, OEM servicing, machining, hardbanding, and third-party repairs.',
    fields: [
      { key: 'woNumber', label: 'Work Order Number', type: 'string', required: true, description: 'Maintenance WO (e.g. WO-MNT-26-0001)', sample: 'WO-MNT-26-0001' },
      { key: 'serial', label: 'Tool Serial Number', type: 'string', required: true, description: 'Tool serial being repaired', sample: 'EMD-1025' },
      { key: 'issue', label: 'Issue / Reason', type: 'string', required: true, description: 'Fault description or scheduled redress', sample: 'Post-job disassembly, seal replacement, hydraulic fluid flush' },
      {
        key: 'type',
        label: 'Maintenance Type',
        type: 'string',
        description: 'Maintenance classification: InHouse, Vendor, ThirdParty',
        sample: 'InHouse (Options: InHouse | Vendor | ThirdParty)',
        defaultSample: 'InHouse',
        allowedValues: ['InHouse', 'Vendor', 'ThirdParty'],
      },
      { key: 'vendor', label: 'Vendor Name', type: 'string', description: 'External workshop or OEM (if vendor repair)', sample: 'COUGAR DRILLING SERVICES' },
      { key: 'startDate', label: 'Start Date', type: 'date', description: 'Repair start date (YYYY-MM-DD)', sample: '2026-03-10' },
      {
        key: 'status',
        label: 'Status',
        type: 'string',
        description: 'Maintenance order status: In Progress, Sent to Vendor, Received from Vendor, Ready for QC, Complete - Ready, Closed',
        sample: 'Complete - Ready (Options: In Progress | Sent to Vendor | Received from Vendor | Ready for QC | Complete - Ready | Closed)',
        defaultSample: 'Complete - Ready',
        allowedValues: ['In Progress', 'Sent to Vendor', 'Received from Vendor', 'Ready for QC', 'Complete - Ready', 'Closed'],
      },
      { key: 'actualCost', label: 'Actual Cost ($)', type: 'number', description: 'Total cost incurred', sample: 850.00 },
      { key: 'notes', label: 'Repair Notes', type: 'string', description: 'Work completed details', sample: 'O-rings, backup rings, and mandrels inspected and certified' },
    ],
  },
  contracts: {
    key: 'contracts',
    sqlTable: 'tbl_Contracts',
    epicorCode: 'UD109 - Master Contracts',
    name: 'Master Contracts Register',
    primaryKey: 'id',
    category: 'Commercial & Contracts',
    description: 'Client frame agreements, PO numbers, contract duration, status, and bank guarantees.',
    fields: [
      { key: 'id', label: 'ContractID', type: 'string', required: true, description: 'Unique Contract reference (e.g. 1 or CON-ADNOC-01)', sample: '1' },
      { key: 'client', label: 'Client', type: 'string', required: true, description: 'Client operator name', sample: 'ADNOC OFFSHORE' },
      { key: 'contractRef', label: 'ContractRef', type: 'string', description: 'Contract Reference / SAP Number', sample: '444558' },
      { key: 'shortDesc', label: 'Short Desc', type: 'string', description: 'Short agreement description or package title', sample: 'ADNOC OFFSHORE - Fishing Services' },
      {
        key: 'currency',
        label: 'Currency',
        type: 'string',
        description: 'Contract billing currency: USD or AED',
        sample: 'USD (Options: USD | AED)',
        defaultSample: 'USD',
        allowedValues: ['USD', 'AED'],
      },
      { key: 'startDate', label: 'StartDate', type: 'date', description: 'Start date (YYYY-MM-DD)', sample: '2023-01-01' },
      { key: 'endDate', label: 'EndDate', type: 'date', description: 'Expiry date (YYYY-MM-DD)', sample: '2028-12-31' },
      {
        key: 'status',
        label: 'Status',
        type: 'string',
        description: 'Contract agreement status: Active, Closed, Completed, Expired',
        sample: 'Active (Options: Active | Closed | Completed | Expired)',
        defaultSample: 'Active',
        allowedValues: ['Active', 'Closed', 'Completed', 'Expired'],
      },
      { key: 'contractValue', label: 'ContractValue', type: 'number', description: 'Total contract amount (leave blank for Unit Rate)', sample: 5000000 },
      { key: 'pbgNumber', label: 'PBGNumber', type: 'string', description: 'Performance bank guarantee reference', sample: 'ACLG1900238' },
      { key: 'pbgValue', label: 'PBGValue', type: 'number', description: 'PBG security amount in AED', sample: 626510 },
      { key: 'pbgIssueDate', label: 'PBGIssueDate', type: 'date', description: 'PBG issuance date (YYYY-MM-DD)', sample: '2019-01-01' },
      { key: 'pbgExpiryDate', label: 'PBGExpiryDate', type: 'string', description: 'PBG expiry date (YYYY-MM-DD or OPEN ENDED)', sample: 'OPEN ENDED' },
      { key: 'poNumber', label: 'PONumber', type: 'string', description: 'Governing Purchase Order number', sample: '4200222381' },
      { key: 'invoicedToDate', label: 'InvoicedToDate', type: 'number', description: 'Cumulative invoiced amount to date', sample: 0 },
      { key: 'notes', label: 'Notes', type: 'string', description: 'Contract remarks and scope terms', sample: 'Provision of Fishing & Downhole tool rental services' },
    ],
  },
  contractRates: {
    key: 'contractRates',
    sqlTable: 'tbl_ContractRates',
    epicorCode: 'UD110 - Contract Rates Schedule',
    name: 'Contract Rates Schedule',
    primaryKey: 'rateId',
    category: 'Commercial & Contracts',
    description: 'Itemized equipment day rates, standby rates, run charges, and redress fees linked to master contracts.',
    fields: [
      { key: 'contractCode', label: 'ContractCode', type: 'string', required: true, description: 'Master Contract ID or Ref (e.g. 1, 2, AOF, 444558)', sample: '1' },
      { key: 'rateId', label: 'RateID', type: 'string', required: true, description: 'Line sequence number or Rate ID', sample: '1' },
      { key: 'contractRef', label: 'ContractRef', type: 'string', description: 'Schedule / Ref Code (e.g. SCHEDULE 2)', sample: 'SCHEDULE 2' },
      { key: 'category', label: 'Category', type: 'string', required: true, description: 'Tool category / ERP catalog name', sample: 'FAST REAMER' },
      { key: 'shortDesc', label: 'ToolDescription', type: 'string', required: true, description: 'EMDAD Tool Description / ShortDesc', sample: 'FAST REAMER' },
      { key: 'size', label: 'ToolOD', type: 'string', description: 'Tool OD / Size', sample: '12-1/4"' },
      { key: 'holeSection', label: 'HoleSection', type: 'string', description: 'Hole section', sample: '12-1/4"' },
      { key: 'opsRate', label: 'OperatingRate', type: 'number', required: true, description: 'Operating day rate', sample: 3445.00 },
      { key: 'standbyRate', label: 'StandbyRate', type: 'number', required: true, description: 'Standby day rate (typically 50%)', sample: 1722.50 },
      { key: 'runCharges', label: 'RunCharges', type: 'number', description: 'Run charges per trip', sample: 0 },
      { key: 'monthlyCharges', label: 'MonthlyCharges', type: 'number', description: 'Monthly fixed charges', sample: 0 },
      { key: 'redress', label: 'RedressFee', type: 'number', description: 'Redress / inspection fee', sample: 0 },
      {
        key: 'currency',
        label: 'Currency',
        type: 'string',
        description: 'Currency: USD or AED',
        sample: 'USD (Options: USD | AED)',
        defaultSample: 'USD',
        allowedValues: ['USD', 'AED'],
      },
    ],
  },
  // ==========================================
  // Consumables & Stores Module
  // ==========================================
  consumables: {
    key: 'consumables',
    sqlTable: 'tbl_Consumables',
    epicorCode: 'UD201 - Consumables & Store SKUs',
    name: 'Consumables & Store SKUs',
    primaryKey: 'partNo',
    category: 'Inventory & Stores',
    description: 'Consumables inventory catalog, redress seal kits, paints, lubricants, stock on hand, bin locations, and reorder levels.',
    fields: [
      { key: 'partNo', label: 'Part / SKU Number', type: 'string', required: true, description: 'Consumable Part Number (e.g. RK-JAR-650)', sample: 'RK-JAR-650' },
      { key: 'id', label: 'Internal ID', type: 'string', description: 'Internal SKU Identifier', sample: 'SKU-001' },
      { key: 'description', label: 'Description', type: 'string', required: true, description: 'Item name / technical description', sample: '6-1/2" HYD JAR COMPLETE REDRESS SEAL KIT' },
      {
        key: 'category',
        label: 'Category',
        type: 'string',
        required: true,
        description: 'Store category',
        sample: 'Redress Kit (Options: Redress Kit | Paint & Coatings | Spare Parts | Lubricants & Oils | HSE & Safety | Seals & O-Rings)',
        defaultSample: 'Redress Kit',
        allowedValues: ['Redress Kit', 'Paint & Coatings', 'Spare Parts', 'Lubricants & Oils', 'HSE & Safety', 'Seals & O-Rings'],
      },
      {
        key: 'unit',
        label: 'Unit of Measure',
        type: 'string',
        description: 'Packaging unit (EA, KIT, LTR, CAN, SET, BOX)',
        sample: 'KIT (Options: EA | KIT | LTR | CAN | SET | BOX)',
        defaultSample: 'KIT',
        allowedValues: ['EA', 'KIT', 'LTR', 'CAN', 'SET', 'BOX'],
      },
      { key: 'currentStock', label: 'Current Stock', type: 'number', required: true, description: 'Physical quantity in store', sample: 24 },
      { key: 'reorderLevel', label: 'Reorder Level', type: 'number', description: 'Minimum stock alert threshold', sample: 5 },
      { key: 'unitCostAED', label: 'Unit Cost (AED)', type: 'number', required: true, description: 'Standard unit acquisition cost in AED', sample: 1850 },
      { key: 'binLocation', label: 'Bin / Shelf Location', type: 'string', description: 'Physical warehouse bin rack', sample: 'BIN-B3-04' },
      { key: 'supplier', label: 'Vendor / Manufacturer', type: 'string', description: 'OEM supplier or manufacturer', sample: 'Cougar / Specialist Seals' },
      { key: 'lastRestockedDate', label: 'Last Restocked Date', type: 'date', description: 'Most recent replenishment date', sample: '2026-03-01' },
    ],
  },
  consumable_issuances: {
    key: 'consumable_issuances',
    sqlTable: 'tbl_StoreIssues',
    epicorCode: 'UD202 - Store Issuance Vouchers (SIV)',
    name: 'Store Issuance Vouchers (SIV)',
    primaryKey: 'issuanceId',
    category: 'Inventory & Stores',
    description: 'Store issues to workshop bays, redress orders, jobs, or rigs with cost allocation by sub-division.',
    fields: [
      { key: 'issuanceId', label: 'Issuance ID', type: 'string', required: true, description: 'Unique SIV record key', sample: 'SIV-2026-001' },
      { key: 'sivNumber', label: 'SIV Voucher #', type: 'string', description: 'Official store voucher number', sample: 'SIV-001' },
      { key: 'issueDate', label: 'Issue Date', type: 'date', required: true, description: 'Date item was issued (YYYY-MM-DD)', sample: '2026-03-12' },
      { key: 'partNo', label: 'Part Number', type: 'string', required: true, description: 'Issued SKU part number', sample: 'RK-JAR-650' },
      { key: 'description', label: 'Description', type: 'string', description: 'Consumable description', sample: '6-1/2" HYD JAR COMPLETE REDRESS SEAL KIT' },
      { key: 'qtyIssued', label: 'Quantity Issued', type: 'number', required: true, description: 'Number of units disbursed', sample: 1 },
      { key: 'unitCostAED', label: 'Unit Cost (AED)', type: 'number', description: 'Unit cost at time of issue', sample: 1850 },
      { key: 'totalCostAED', label: 'Total Value (AED)', type: 'number', description: 'Total disbursed value in AED', sample: 1850 },
      {
        key: 'destinationType',
        label: 'Destination Type',
        type: 'string',
        description: 'Usage location',
        sample: 'TOOL_REDRESS (Options: WORKSHOP_BASE | TOOL_REDRESS)',
        defaultSample: 'TOOL_REDRESS',
        allowedValues: ['WORKSHOP_BASE', 'TOOL_REDRESS'],
      },
      { key: 'workshopArea', label: 'Workshop Bay', type: 'string', description: 'Target workshop bay or work center', sample: 'Bay 2 - Redress Area' },
      { key: 'toolSerialNo', label: 'Linked Tool Serial', type: 'string', description: 'Serial of tool receiving the consumable', sample: 'EMD-1025' },
      { key: 'jobId', label: 'Linked Job Number', type: 'string', description: 'Drilling job charging this expense', sample: 'Job-023-00001' },
      {
        key: 'subDivision',
        label: 'Division Allocation',
        type: 'string',
        description: 'P&L sector allocation',
        sample: 'FISHING (Options: FISHING | WHIPSTOCK | RENTALS)',
        defaultSample: 'FISHING',
        allowedValues: ['FISHING', 'WHIPSTOCK', 'RENTALS'],
      },
      { key: 'requestedBy', label: 'Requested By', type: 'string', description: 'Technician requesting materials', sample: 'Nihas' },
      { key: 'issuedBy', label: 'Issued By', type: 'string', description: 'Storekeeper issuing goods', sample: 'Deen' },
      { key: 'remarks', label: 'Remarks / Notes', type: 'string', description: 'Issuance reason / job purpose', sample: 'Allocated for post-job redress' },
    ],
  },
  // ==========================================
  // Procurement: Purchase Orders & Goods Inward
  // ==========================================
  purchase_orders: {
    key: 'purchase_orders',
    sqlTable: 'tbl_PurchaseOrders',
    epicorCode: 'UD203 - Purchase Orders Master',
    name: 'Purchase Orders (PO)',
    primaryKey: 'poNumber',
    category: 'Procurement (PO & GRN)',
    description: 'Commercial purchase orders for tools/assets, fleet inventory, and consumables with contract link and division.',
    detailKey: 'lines',
    detailForeignKey: 'poNumber',
    detailName: 'PO Line Items (Details)',
    detailSqlTable: 'tbl_PurchaseOrderLines',
    fields: [
      { key: 'poNumber', label: 'PO Number', type: 'string', required: true, description: 'Commercial PO Number (e.g. PO-2026-001)', sample: 'PO-2026-001' },
      { key: 'supplier', label: 'Supplier / Vendor', type: 'string', required: true, description: 'Vendor company name', sample: 'COUGAR DRILLING SERVICES' },
      { key: 'orderDate', label: 'PO Date', type: 'date', required: true, description: 'Issuance date (YYYY-MM-DD)', sample: '2026-02-15' },
      { key: 'expectedDeliveryDate', label: 'Delivery Due Date', type: 'date', description: 'Expected delivery date', sample: '2026-03-15' },
      {
        key: 'currency',
        label: 'Currency',
        type: 'string',
        required: true,
        description: 'PO commercial currency: AED or USD',
        sample: 'USD (Options: USD | AED)',
        defaultSample: 'USD',
        allowedValues: ['USD', 'AED'],
      },
      { key: 'contractRef', label: 'Contract Reference', type: 'string', description: 'Client master contract SAP code (e.g. 444558)', sample: '444558' },
      {
        key: 'subDivision',
        label: 'Business Division',
        type: 'string',
        description: 'Division allocation',
        sample: 'FISHING (Options: FISHING | WHIPSTOCK | RENTALS)',
        defaultSample: 'FISHING',
        allowedValues: ['FISHING', 'WHIPSTOCK', 'RENTALS'],
      },
      { key: 'totalAmount', label: 'Total PO Amount', type: 'number', description: 'Total purchase order value', sample: 125000 },
      { key: 'inwardedAmount', label: 'Inwarded Value', type: 'number', description: 'Cumulative amount received on GRNs', sample: 0 },
      { key: 'balanceAmount', label: 'Balance Outstanding', type: 'number', description: 'Remaining unfulfilled amount', sample: 125000 },
      {
        key: 'status',
        label: 'PO Status',
        type: 'string',
        description: 'Order fulfillment status',
        sample: 'OPEN (Options: DRAFT | OPEN | PARTIALLY_RECEIVED | FULFILLED | CANCELLED)',
        defaultSample: 'OPEN',
        allowedValues: ['DRAFT', 'OPEN', 'PARTIALLY_RECEIVED', 'FULFILLED', 'CANCELLED'],
      },
      { key: 'paymentTerms', label: 'Payment Terms', type: 'string', description: 'Commercial payment terms', sample: 'Net 60 Days' },
      { key: 'notes', label: 'Remarks / Notes', type: 'string', description: 'Commercial notes and specifications', sample: 'Procurement of replacement jar mandrels and assemblies' },
    ],
    detailFields: [
      { key: 'poNumber', label: 'PO Number (Parent)', type: 'string', required: true, description: 'Parent Purchase Order Number', sample: 'PO-2026-001' },
      { key: 'itemNo', label: 'Line Item #', type: 'number', required: true, description: 'Line sequence number', sample: 1 },
      { key: 'partNo', label: 'Part / SKU Number', type: 'string', required: true, description: 'Tool or consumable part number', sample: 'DJ650-003' },
      { key: 'description', label: 'Item Description', type: 'string', required: true, description: 'Detailed item description', sample: '6-1/2" HYDRAULIC DRILLING JAR' },
      { key: 'category', label: 'Tool Category', type: 'string', description: 'Catalog category', sample: 'HYD DRILLING JAR' },
      { key: 'size', label: 'Tool OD / Size', type: 'string', description: 'OD dimension', sample: '6-1/2"' },
      {
        key: 'classification',
        label: '3-Way Classification',
        type: 'string',
        required: true,
        description: 'Procurement destination: ASSET (CapEx with depreciation), INVENTORY (Fleet), or CONSUMABLE',
        sample: 'ASSET (Options: ASSET | INVENTORY | CONSUMABLE)',
        defaultSample: 'ASSET',
        allowedValues: ['ASSET', 'INVENTORY', 'CONSUMABLE'],
      },
      {
        key: 'subDivision',
        label: 'Division',
        type: 'string',
        description: 'Operational sector',
        sample: 'FISHING (Options: FISHING | WHIPSTOCK | RENTALS)',
        defaultSample: 'FISHING',
        allowedValues: ['FISHING', 'WHIPSTOCK', 'RENTALS'],
      },
      { key: 'contractRef', label: 'Contract Reference', type: 'string', description: 'Linked contract code', sample: '444558' },
      { key: 'orderedQty', label: 'Ordered Qty', type: 'number', required: true, description: 'Ordered quantity', sample: 2 },
      { key: 'receivedQty', label: 'Received Qty', type: 'number', description: 'Inwarded quantity to date', sample: 0 },
      { key: 'balanceQty', label: 'Balance Qty', type: 'number', description: 'Pending delivery quantity', sample: 2 },
      { key: 'unitPrice', label: 'Unit Price', type: 'number', required: true, description: 'Price per unit in PO currency', sample: 25000 },
      { key: 'totalPrice', label: 'Total Price', type: 'number', description: 'Extended line amount', sample: 50000 },
      { key: 'usefulLifeMonths', label: 'Useful Life (Months)', type: 'number', description: 'Asset depreciation period in months (for ASSET classification)', sample: 60 },
      { key: 'salvageValue', label: 'Salvage Value', type: 'number', description: 'Residual asset value', sample: 5000 },
      { key: 'monthlyDepreciation', label: 'Monthly Depreciation', type: 'number', description: 'Calculated monthly depreciation cost', sample: 750 },
    ],
  },
  purchase_order_lines: {
    key: 'purchase_order_lines',
    sqlTable: 'tbl_PurchaseOrderLines',
    epicorCode: 'UD204 - PO Line Items (Flat)',
    name: 'PO Line Items (All Orders)',
    primaryKey: 'lineId',
    category: 'Procurement (PO & GRN)',
    description: 'Flattened purchase order item lines across all active and fulfilled POs with asset classification and depreciation parameters.',
    fields: [
      { key: 'lineId', label: 'Line ID', type: 'string', required: true, description: 'Unique line identifier', sample: 'PO-2026-001-1' },
      { key: 'poNumber', label: 'PO Number', type: 'string', required: true, description: 'Parent PO Number', sample: 'PO-2026-001' },
      { key: 'itemNo', label: 'Item #', type: 'number', required: true, description: 'Sequence number', sample: 1 },
      { key: 'partNo', label: 'Part Number', type: 'string', required: true, description: 'Part number', sample: 'DJ650-003' },
      { key: 'description', label: 'Item Description', type: 'string', required: true, description: 'Item description', sample: '6-1/2" HYDRAULIC DRILLING JAR' },
      { key: 'category', label: 'Category', type: 'string', description: 'Tool category', sample: 'HYD DRILLING JAR' },
      { key: 'size', label: 'Size', type: 'string', description: 'Tool size / OD', sample: '6-1/2"' },
      {
        key: 'classification',
        label: 'Classification',
        type: 'string',
        required: true,
        description: 'ASSET, INVENTORY, or CONSUMABLE',
        sample: 'ASSET (Options: ASSET | INVENTORY | CONSUMABLE)',
        defaultSample: 'ASSET',
        allowedValues: ['ASSET', 'INVENTORY', 'CONSUMABLE'],
      },
      {
        key: 'subDivision',
        label: 'Sub-Division',
        type: 'string',
        description: 'Division allocation',
        sample: 'FISHING (Options: FISHING | WHIPSTOCK | RENTALS)',
        defaultSample: 'FISHING',
        allowedValues: ['FISHING', 'WHIPSTOCK', 'RENTALS'],
      },
      { key: 'contractRef', label: 'Contract Reference', type: 'string', description: 'SAP Contract Ref', sample: '444558' },
      { key: 'orderedQty', label: 'Ordered Qty', type: 'number', required: true, description: 'Quantity ordered', sample: 2 },
      { key: 'receivedQty', label: 'Received Qty', type: 'number', description: 'Quantity inwarded', sample: 0 },
      { key: 'balanceQty', label: 'Balance Qty', type: 'number', description: 'Quantity remaining', sample: 2 },
      { key: 'unitPrice', label: 'Unit Price', type: 'number', required: true, description: 'Unit price in currency', sample: 25000 },
      { key: 'totalPrice', label: 'Total Price', type: 'number', description: 'Total line amount', sample: 50000 },
      { key: 'usefulLifeMonths', label: 'Useful Life (Months)', type: 'number', description: 'Depreciation life', sample: 60 },
      { key: 'salvageValue', label: 'Salvage Value', type: 'number', description: 'Salvage value', sample: 5000 },
      { key: 'monthlyDepreciation', label: 'Monthly Depreciation', type: 'number', description: 'Monthly depreciation', sample: 750 },
    ],
  },
  goods_receipts: {
    key: 'goods_receipts',
    sqlTable: 'tbl_GoodsReceipts',
    epicorCode: 'UD205 - Goods Receipt Notes (GRN)',
    name: 'Goods Receipt Notes (GRN)',
    primaryKey: 'ticketNo',
    category: 'Procurement (PO & GRN)',
    description: 'Warehouse and base receipt tickets inwarding physical tools, serialized assets, and consumables against POs.',
    detailKey: 'lines',
    detailForeignKey: 'ticketNo',
    detailName: 'GRN Line Items (Details)',
    detailSqlTable: 'tbl_GoodsReceiptLines',
    fields: [
      { key: 'ticketNo', label: 'GRN Ticket #', type: 'string', required: true, description: 'Unique Goods Receipt Ticket Number (e.g. GRN-2026-001)', sample: 'GRN-2026-001' },
      { key: 'poNumber', label: 'PO Number', type: 'string', required: true, description: 'Matching Purchase Order number', sample: 'PO-2026-001' },
      { key: 'supplier', label: 'Supplier / Vendor', type: 'string', required: true, description: 'Delivering vendor name', sample: 'COUGAR DRILLING SERVICES' },
      { key: 'supplierDt', label: 'Supplier Delivery Note', type: 'string', description: 'Vendor delivery note / packing slip #', sample: 'DN-99412' },
      { key: 'dateRecd', label: 'Date Received', type: 'date', required: true, description: 'Physical receipt date (YYYY-MM-DD)', sample: '2026-03-10' },
      { key: 'mfgReceivedBy', label: 'Received By', type: 'string', description: 'Receiving storekeeper / inspector', sample: 'Noor Islam' },
      {
        key: 'currency',
        label: 'Currency',
        type: 'string',
        description: 'Currency: USD or AED',
        sample: 'USD (Options: USD | AED)',
        defaultSample: 'USD',
        allowedValues: ['USD', 'AED'],
      },
      { key: 'totalItemsReceived', label: 'Total Items Received', type: 'number', description: 'Total item count', sample: 2 },
      { key: 'totalInwardValue', label: 'Total Inward Value', type: 'number', description: 'Total landed value', sample: 50000 },
      {
        key: 'qcStatus',
        label: 'QC Status',
        type: 'string',
        description: 'Goods inward QA/QC verification state',
        sample: 'ACCEPTED (Options: ACCEPTED | ACCEPTED_WITH_DEVIATION | REJECTED | PENDING_INSPECTION)',
        defaultSample: 'ACCEPTED',
        allowedValues: ['ACCEPTED', 'ACCEPTED_WITH_DEVIATION', 'REJECTED', 'PENDING_INSPECTION'],
      },
      { key: 'comments', label: 'Receipt Remarks', type: 'string', description: 'Quality inspection & receiving remarks', sample: 'All items received in good condition with OEM certs' },
    ],
    detailFields: [
      { key: 'ticketNo', label: 'GRN Ticket # (Parent)', type: 'string', required: true, description: 'Parent GRN ticket number', sample: 'GRN-2026-001' },
      { key: 'poNumber', label: 'PO Number', type: 'string', description: 'Parent PO number', sample: 'PO-2026-001' },
      { key: 'partNo', label: 'Part / Catalog #', type: 'string', required: true, description: 'Part number', sample: 'DJ650-003' },
      { key: 'toolsno', label: 'Serial / Asset ID', type: 'string', description: 'Physical serialized identifier assigned to fleet', sample: 'EMD-1025' },
      { key: 'description', label: 'Description', type: 'string', description: 'Item description', sample: '6-1/2" HYDRAULIC DRILLING JAR' },
      { key: 'category', label: 'Category', type: 'string', description: 'Tool category', sample: 'HYD DRILLING JAR' },
      { key: 'size', label: 'Size', type: 'string', description: 'Tool size', sample: '6-1/2"' },
      {
        key: 'classification',
        label: 'Classification',
        type: 'string',
        required: true,
        description: 'ASSET, INVENTORY, or CONSUMABLE',
        sample: 'ASSET (Options: ASSET | INVENTORY | CONSUMABLE)',
        defaultSample: 'ASSET',
        allowedValues: ['ASSET', 'INVENTORY', 'CONSUMABLE'],
      },
      {
        key: 'subDivision',
        label: 'Division',
        type: 'string',
        description: 'Operational sector',
        sample: 'FISHING (Options: FISHING | WHIPSTOCK | RENTALS)',
        defaultSample: 'FISHING',
        allowedValues: ['FISHING', 'WHIPSTOCK', 'RENTALS'],
      },
      { key: 'contractRef', label: 'Contract Reference', type: 'string', description: 'Linked contract SAP code', sample: '444558' },
      { key: 'qtyReceived', label: 'Qty Received', type: 'number', required: true, description: 'Received count', sample: 1 },
      { key: 'unitPrice', label: 'Unit Price', type: 'number', required: true, description: 'Acquisition price per unit', sample: 25000 },
      { key: 'bookValue', label: 'Book Value', type: 'number', description: 'Recorded asset book value', sample: 25000 },
      { key: 'currency', label: 'Currency', type: 'string', description: 'Currency', sample: 'USD' },
      { key: 'belongsTo', label: 'Ownership', type: 'string', description: 'Owner entity (EMDAD, MOTORMAX, etc.)', sample: 'EMDAD' },
      { key: 'reqInsp', label: 'QC Inspection Required?', type: 'boolean', description: 'Flag if tool requires NDT inspection before dispatch', sample: true },
      { key: 'insDate', label: 'Inspection Date', type: 'date', description: 'Date of receiving QC inspection', sample: '2026-03-11' },
      { key: 'usefulLifeMonths', label: 'Useful Life (Months)', type: 'number', description: 'Depreciation duration in months', sample: 60 },
      { key: 'salvageValue', label: 'Salvage Value', type: 'number', description: 'Salvage value', sample: 2500 },
      { key: 'monthlyDepreciation', label: 'Monthly Depreciation', type: 'number', description: 'Monthly depreciation', sample: 375 },
      { key: 'comments', label: 'Line Comments', type: 'string', description: 'Line remarks', sample: 'Passed visual & thread inspection' },
    ],
  },
  goods_receipt_lines: {
    key: 'goods_receipt_lines',
    sqlTable: 'tbl_GoodsReceiptLines',
    epicorCode: 'UD206 - Goods Receipt Line Items',
    name: 'GRN Inward Lines (All Receipts)',
    primaryKey: 'lineId',
    category: 'Procurement (PO & GRN)',
    description: 'Flattened goods receipt item lines inwarded into inventory or asset register with serial numbers and inspection flags.',
    fields: [
      { key: 'lineId', label: 'Line ID', type: 'string', required: true, description: 'Unique receipt line key', sample: 'GRN-2026-001-1' },
      { key: 'ticketNo', label: 'GRN Ticket #', type: 'string', required: true, description: 'Parent GRN ticket #', sample: 'GRN-2026-001' },
      { key: 'poNumber', label: 'PO Number', type: 'string', description: 'Purchase order #', sample: 'PO-2026-001' },
      { key: 'partNo', label: 'Part Number', type: 'string', required: true, description: 'Part number', sample: 'DJ650-003' },
      { key: 'toolsno', label: 'Serial / Asset ID', type: 'string', description: 'Tool physical serial number', sample: 'EMD-1025' },
      { key: 'description', label: 'Description', type: 'string', description: 'Item description', sample: '6-1/2" HYDRAULIC DRILLING JAR' },
      { key: 'category', label: 'Category', type: 'string', description: 'Tool category', sample: 'HYD DRILLING JAR' },
      { key: 'size', label: 'Size', type: 'string', description: 'Size / OD', sample: '6-1/2"' },
      {
        key: 'classification',
        label: 'Classification',
        type: 'string',
        required: true,
        description: 'ASSET, INVENTORY, or CONSUMABLE',
        sample: 'ASSET (Options: ASSET | INVENTORY | CONSUMABLE)',
        defaultSample: 'ASSET',
        allowedValues: ['ASSET', 'INVENTORY', 'CONSUMABLE'],
      },
      {
        key: 'subDivision',
        label: 'Sub-Division',
        type: 'string',
        description: 'Division allocation',
        sample: 'FISHING (Options: FISHING | WHIPSTOCK | RENTALS)',
        defaultSample: 'FISHING',
        allowedValues: ['FISHING', 'WHIPSTOCK', 'RENTALS'],
      },
      { key: 'contractRef', label: 'Contract Reference', type: 'string', description: 'Contract SAP reference', sample: '444558' },
      { key: 'qtyReceived', label: 'Qty Received', type: 'number', required: true, description: 'Inwarded count', sample: 1 },
      { key: 'unitPrice', label: 'Unit Price', type: 'number', required: true, description: 'Unit cost', sample: 25000 },
      { key: 'bookValue', label: 'Book Value', type: 'number', description: 'Asset book value', sample: 25000 },
      { key: 'currency', label: 'Currency', type: 'string', description: 'Currency', sample: 'USD' },
      { key: 'belongsTo', label: 'Ownership', type: 'string', description: 'Owner entity', sample: 'EMDAD' },
      { key: 'reqInsp', label: 'Inspection Required?', type: 'boolean', description: 'Inspection required flag', sample: true },
      { key: 'insDate', label: 'Inspection Date', type: 'date', description: 'Inspection certification date', sample: '2026-03-11' },
      { key: 'usefulLifeMonths', label: 'Useful Life (Months)', type: 'number', description: 'Useful life in months', sample: 60 },
      { key: 'salvageValue', label: 'Salvage Value', type: 'number', description: 'Salvage value', sample: 2500 },
      { key: 'monthlyDepreciation', label: 'Monthly Depreciation', type: 'number', description: 'Monthly depreciation', sample: 375 },
      { key: 'comments', label: 'Comments', type: 'string', description: 'Line comments', sample: 'Passed visual inspection' },
    ],
  },
  // ==========================================
  // Financial, Sub-Contractors & P&L Module
  // ==========================================
  subcontractor_rentals: {
    key: 'subcontractor_rentals',
    sqlTable: 'tbl_SubContractorRentals',
    epicorCode: 'UD207 - Sub-Contractor Tool Rentals',
    name: 'Sub-Contractor Rentals (3rd Party)',
    primaryKey: 'rentalId',
    category: 'Financial & Sub-Rentals',
    description: 'Third-party cross-rental equipment hired for customer jobs, daily/standby rates, accruals, and supplier invoices.',
    fields: [
      { key: 'rentalId', label: 'Rental Record ID', type: 'string', required: true, description: 'Unique rental record ID (e.g. SRA-2026-001)', sample: 'SRA-2026-001' },
      { key: 'jobId', label: 'Job Number', type: 'string', required: true, description: 'Linked drilling job number', sample: 'Job-023-00001' },
      { key: 'supplierName', label: 'Sub-Contractor Vendor', type: 'string', required: true, description: 'Rental tool supplier name', sample: 'Motormax Drilling Technologies' },
      { key: 'rentalAgreementNo', label: 'Agreement / PO #', type: 'string', description: 'Vendor agreement or callout number', sample: 'MM-RA-2026-44' },
      { key: 'toolDesc', label: 'Tool Description', type: 'string', required: true, description: 'Hired tool description', sample: '8" HYDRAULIC DRILLING JAR' },
      { key: 'serialNo', label: 'Serial Number', type: 'string', required: true, description: 'Vendor physical tool serial number', sample: 'MM-JAR-801' },
      {
        key: 'rentalType',
        label: 'Rental Rate Model',
        type: 'string',
        description: 'Pricing model: Daily, Monthly, or Lumpsum',
        sample: 'Daily (Options: Daily | Monthly | Lumpsum)',
        defaultSample: 'Daily',
        allowedValues: ['Daily', 'Monthly', 'Lumpsum'],
      },
      { key: 'rateAmount', label: 'Operating Rate / Day', type: 'number', required: true, description: 'Daily operating rental charge', sample: 650 },
      { key: 'standbyRate', label: 'Standby Rate / Day', type: 'number', description: 'Daily standby rental charge', sample: 325 },
      { key: 'startDate', label: 'Hire Start Date', type: 'date', required: true, description: 'Start date of rental agreement', sample: '2026-03-01' },
      { key: 'endDate', label: 'Hire Return Date', type: 'date', description: 'End date or return date (blank if active)', sample: '2026-03-15' },
      { key: 'operatingDays', label: 'Operating Days', type: 'number', description: 'Total operating days billed', sample: 10 },
      { key: 'standbyDays', label: 'Standby Days', type: 'number', description: 'Total standby days billed', sample: 4 },
      { key: 'totalAccrued', label: 'Total Accrued Cost', type: 'number', description: 'Calculated internal cost accrual', sample: 7800 },
      { key: 'poReference', label: 'Client PO Reference', type: 'string', description: 'Client PO reference', sample: 'PO-2026-088' },
      { key: 'invoiceRef', label: 'Vendor Invoice #', type: 'string', description: 'Actual supplier tax invoice number', sample: 'INV-MM-9102' },
      { key: 'invoiceDate', label: 'Invoice Date', type: 'date', description: 'Date of supplier invoice', sample: '2026-03-20' },
      { key: 'invoiceAmount', label: 'Invoice Amount', type: 'number', description: 'Actual billed amount from vendor', sample: 7800 },
      { key: 'variance', label: 'Accrual Variance', type: 'number', description: 'Difference between invoice and accrual', sample: 0 },
      {
        key: 'division',
        label: 'Division Allocation',
        type: 'string',
        description: 'Business division',
        sample: 'RENTALS (Options: FISHING | WHIPSTOCK | RENTALS)',
        defaultSample: 'RENTALS',
        allowedValues: ['FISHING', 'WHIPSTOCK', 'RENTALS'],
      },
      { key: 'clientCode', label: 'Client / Operator', type: 'string', description: 'Client code', sample: 'ADNOC OFFSHORE' },
      { key: 'rig', label: 'Rig', type: 'string', description: 'Rig name', sample: 'AL YASAT' },
      { key: 'well', label: 'Well', type: 'string', description: 'Well identifier', sample: 'ZK-89.5-68' },
      { key: 'contractRef', label: 'Contract Reference', type: 'string', description: 'Contract reference', sample: '444558' },
      { key: 'accrualMonth', label: 'Accrual Month (YYYY-MM)', type: 'string', required: true, description: 'Accounting period for accrual', sample: '2026-03' },
      {
        key: 'status',
        label: 'Status',
        type: 'string',
        description: 'Rental lifecycle status',
        sample: 'ACCRUED (Options: ACCRUED | INVOICE_RECEIVED | PAID | DISPUTED)',
        defaultSample: 'ACCRUED',
        allowedValues: ['ACCRUED', 'INVOICE_RECEIVED', 'PAID', 'DISPUTED'],
      },
      { key: 'notes', label: 'Notes', type: 'string', description: 'Operational rental remarks', sample: 'Third party rental jar mobilized to rig' },
    ],
  },
  monthly_expenses: {
    key: 'monthly_expenses',
    sqlTable: 'tbl_MonthlyExpenses',
    epicorCode: 'UD208 - Monthly P&L Expenses',
    name: 'Monthly P&L Expenses & Depreciation',
    primaryKey: 'code',
    category: 'Financial & Sub-Rentals',
    description: 'Cost code ledger breakdown across Fishing, Whipstock, and Rentals divisions with depreciation schedule.',
    fields: [
      { key: 'periodKey', label: 'Period Key (YYYY-MM)', type: 'string', required: true, description: 'Month period (e.g. 2026-09)', sample: '2026-09' },
      { key: 'code', label: 'Cost Code', type: 'string', required: true, description: 'Standard financial cost code (e.g. CC-01, CC-10)', sample: 'CC-01' },
      { key: 'name', label: 'Expense Name', type: 'string', required: true, description: 'Ledger line description', sample: 'Cost of Materials' },
      {
        key: 'category',
        label: 'Cost Category',
        type: 'string',
        description: 'Cost classification',
        sample: 'DIRECT (Options: DIRECT | OVERHEAD | DEPRECIATION)',
        defaultSample: 'DIRECT',
        allowedValues: ['DIRECT', 'OVERHEAD', 'DEPRECIATION'],
      },
      { key: 'fishing', label: 'Fishing Division (AED)', type: 'number', description: 'Expense incurred by Fishing', sample: 85000 },
      { key: 'whipstock', label: 'Whipstock Division (AED)', type: 'number', description: 'Expense incurred by Whipstock', sample: 14000 },
      { key: 'rentals', label: 'Rentals Division (AED)', type: 'number', description: 'Expense incurred by Rentals', sample: 62000 },
      { key: 'total', label: 'Total Expense (AED)', type: 'number', description: 'Total combined expenditure', sample: 161000 },
      { key: 'sourceType', label: 'Source Type', type: 'string', description: 'Calculation origin (MANUAL_ADMIN, CONSUMABLES_AUTO, SUB_RENTAL_AUTO, DEPRECIATION_AUTO, TRUE_UP)', sample: 'MANUAL_ADMIN' },
      { key: 'sector', label: 'Asset Sector', type: 'string', description: 'Depreciation sector (e.g. P&M, Vehicles, Comp & Printers)', sample: 'P&M' },
      { key: 'usefulLifeMonths', label: 'Useful Life (Months)', type: 'number', description: 'Depreciation schedule useful life', sample: 60 },
    ],
  },
  // ==========================================
  // Master Configuration & Personnel Module
  // ==========================================
  tool_categories: {
    key: 'tool_categories',
    sqlTable: 'tbl_ToolCategories',
    epicorCode: 'UD209 - Tool Categories Master',
    name: 'Tool Categories Master',
    primaryKey: 'categoryName',
    category: 'Master Config & Personnel',
    description: 'Downhole tool catalog categories (e.g. HYD DRILLING JAR, CASING SCRAPER, SECTION MILL) for fleet classification.',
    fields: [
      { key: 'categoryName', label: 'Category Name', type: 'string', required: true, description: 'Tool category in uppercase (e.g. HYD DRILLING JAR, WHIPSTOCK)', sample: 'HYD DRILLING JAR' },
      {
        key: 'division',
        label: 'Default Division',
        type: 'string',
        description: 'Associated business sector',
        sample: 'FISHING (Options: FISHING | WHIPSTOCK | RENTALS | GENERAL)',
        defaultSample: 'FISHING',
        allowedValues: ['FISHING', 'WHIPSTOCK', 'RENTALS', 'GENERAL'],
      },
      { key: 'description', label: 'Description', type: 'string', description: 'Category technical description', sample: 'Hydraulic and mechanical downhole jars' },
      { key: 'active', label: 'Is Active?', type: 'boolean', description: 'Active in dropdown selections', sample: true },
    ],
  },
  tool_sizes: {
    key: 'tool_sizes',
    sqlTable: 'tbl_ToolSizes',
    epicorCode: 'UD210 - Tool Sizes Master',
    name: 'Tool Sizes Master',
    primaryKey: 'sizeString',
    category: 'Master Config & Personnel',
    description: 'Standardized outer diameter (OD) sizes (e.g., 6-1/2", 8", 9-1/2") for tools and hole sections.',
    fields: [
      { key: 'sizeString', label: 'Size / OD (Inches)', type: 'string', required: true, description: 'Tool outer diameter string (e.g. 6-1/2", 8", 12-1/4")', sample: '6-1/2"' },
      { key: 'category', label: 'Tool Category', type: 'string', description: 'Category applicability (e.g. ALL or HYD DRILLING JAR)', sample: 'ALL' },
      { key: 'odInches', label: 'OD Numeric Value (Inches)', type: 'number', description: 'Decimal outer diameter (e.g. 6.5 for 6-1/2")', sample: 6.5 },
      { key: 'active', label: 'Is Active?', type: 'boolean', description: 'Active in dropdown selections', sample: true },
    ],
  },
  crew_members: {
    key: 'crew_members',
    sqlTable: 'tbl_CrewMembers',
    epicorCode: 'UD211 - Certified Field Crew & Engineers',
    name: 'Field Crew & Engineers Master',
    primaryKey: 'badgeNo',
    category: 'Master Config & Personnel',
    description: 'Certified field supervisors, fishing specialists, rig engineers, safety passports, and offshore cert expiries.',
    fields: [
      { key: 'badgeNo', label: 'Badge Number', type: 'string', required: true, description: 'Company badge ID (e.g. EMD-4102)', sample: 'EMD-4102' },
      { key: 'name', label: 'Full Engineer Name', type: 'string', required: true, description: 'Certified personnel full name', sample: 'Ahmed Al-Mansoor' },
      { key: 'role', label: 'Professional Designation', type: 'string', required: true, description: 'Operational engineering title', sample: 'Lead Fishing & Whipstock Specialist' },
      { key: 'phone', label: 'Phone Number', type: 'string', description: 'Contact mobile number', sample: '+971 50 123 4567' },
      { key: 'email', label: 'Email Address', type: 'string', description: 'Corporate email address', sample: 'ahmed.mansoor@emdad.ae' },
      { key: 'rigPassNo', label: 'Rig Pass Passport #', type: 'string', description: 'ADNOC / Industry Rig Pass ID', sample: 'ADNOC-RP-88412' },
      { key: 'h2sExpiry', label: 'H2S Certification Expiry', type: 'date', description: 'H2S safety ticket expiry date', sample: '2027-04-15' },
      { key: 'bosietExpiry', label: 'BOSIET / Offshore Expiry', type: 'date', description: 'BOSIET offshore survival expiry', sample: '2027-08-20' },
      { key: 'medicalExpiry', label: 'Offshore Medical Expiry', type: 'date', description: 'Offshore medical certification expiry', sample: '2027-01-10' },
      {
        key: 'status',
        label: 'Personnel Status',
        type: 'string',
        description: 'Current readiness status',
        sample: 'Active (Options: Active | On Rig | On Leave | Inactive)',
        defaultSample: 'Active',
        allowedValues: ['Active', 'On Rig', 'On Leave', 'Inactive'],
      },
      { key: 'dayRateAED', label: 'Manpower Day Rate (AED)', type: 'number', description: 'Standard billable / internal cost day rate in AED', sample: 3500 },
    ],
  },
  dropdown_lookups: {
    key: 'dropdown_lookups',
    sqlTable: 'tbl_DropdownLookups',
    epicorCode: 'UD212 - Master Dropdowns & Lookups',
    name: 'Master Dropdowns & Lookups',
    primaryKey: 'lookupId',
    category: 'Master Config & Personnel',
    description: 'Centralized dropdown items (clients, rigs, suppliers, categories, units, statuses, currencies) across the application.',
    fields: [
      { key: 'lookupId', label: 'Composite Lookup ID', type: 'string', required: true, description: 'Unique lookup ID: listKey_optionValue', sample: 'suppliers_Weatherford' },
      { key: 'listKey', label: 'Dropdown List Key', type: 'string', required: true, description: 'Lookup classification key (e.g. suppliers, clients, rigs, consumableUnits)', sample: 'suppliers' },
      { key: 'group', label: 'Lookup Group', type: 'string', description: 'Functional group', sample: 'Commercial & Financial' },
      { key: 'optionValue', label: 'Dropdown Option Value', type: 'string', required: true, description: 'Selectable dropdown item text', sample: 'Weatherford' },
      { key: 'sortOrder', label: 'Display Order', type: 'number', description: 'Sequence index in dropdown menus', sample: 1 },
      { key: 'active', label: 'Is Active?', type: 'boolean', description: 'Active in dropdown menus', sample: true },
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
  customCategories?: string[];
  customSizes?: string[];
  onUpdateCustomCategories?: (cats: string[]) => void;
  onUpdateCustomSizes?: (sizes: string[]) => void;
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
  customCategories,
  customSizes,
  onUpdateCustomCategories,
  onUpdateCustomSizes,
}) => {
  const [selectedEntityKey, setSelectedEntityKey] = useState<TableEntityKey>('jobs');
  const [isDetailMode, setIsDetailMode] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'import' | 'live' | 'preview'>('live');
  const [liveDataSearch, setLiveDataSearch] = useState('');

  // Custom Columns State
  const [allCustomColumns, setAllCustomColumns] = useState<CustomColumnDef[]>(() => getCustomColumns());
  const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
  const [newColLabel, setNewColLabel] = useState('');
  const [newColKey, setNewColKey] = useState('');
  const [newColType, setNewColType] = useState<'string' | 'number' | 'date' | 'select' | 'boolean'>('string');
  const [newColWidth, setNewColWidth] = useState<number>(140);
  const [newColOptions, setNewColOptions] = useState<string>('');
  const [newColDescription, setNewColDescription] = useState('');
  const [isSyncingSql, setIsSyncingSql] = useState(false);

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

  // Handler to create custom column and save live to Azure SQL
  const handleSaveNewColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColLabel.trim()) {
      showToast('Column label is required', 'error');
      return;
    }

    const colKey = (newColKey.trim() || newColLabel.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')).replace(/^_+|_+$/g, '');
    const optionsArray = newColType === 'select'
      ? newColOptions.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const newColumn: CustomColumnDef = {
      id: `${selectedEntityKey}_${colKey}_${Date.now()}`,
      key: colKey,
      label: newColLabel.trim(),
      modelKey: selectedEntityKey,
      type: newColType,
      width: newColWidth || 140,
      visible: true,
      options: optionsArray,
      createdDate: new Date().toISOString(),
      createdBy: user?.name || 'Admin',
    };

    const updated = [...allCustomColumns.filter((c) => !(c.modelKey === selectedEntityKey && c.key === colKey)), newColumn];
    setAllCustomColumns(updated);
    saveCustomColumns(updated);

    // Sync live to Azure SQL
    setIsSyncingSql(true);
    try {
      const sqlRes = await saveCustomColumnsApi(updated);
      showToast(sqlRes.message || 'Custom column registered & saved to Azure SQL live.', 'success');
    } catch {
      showToast('Custom column created locally.', 'info');
    } finally {
      setIsSyncingSql(false);
    }

    // Reset modal form
    setNewColLabel('');
    setNewColKey('');
    setNewColType('string');
    setNewColWidth(140);
    setNewColOptions('');
    setNewColDescription('');
    setIsAddColumnModalOpen(false);
  };

  const handleDeleteCustomColumn = async (colId: string) => {
    if (!window.confirm('Are you sure you want to remove this custom column?')) return;
    const updated = allCustomColumns.filter((c) => c.id !== colId);
    setAllCustomColumns(updated);
    saveCustomColumns(updated);

    try {
      await saveCustomColumnsApi(updated);
      showToast('Column removed from schema and Azure SQL database.', 'success');
    } catch {
      showToast('Column removed locally.', 'info');
    }
  };

  // Helper to dynamically calculate live record count for each entity
  const getEntityCount = (key: TableEntityKey): number => {
    switch (key) {
      case 'jobs': return jobs.length;
      case 'inventory': return inventory.length;
      case 'dtBatches': return dtBatches.length;
      case 'rtBatches': return rtBatches.length;
      case 'callouts': return callouts.length;
      case 'gatePasses': return gatePasses.length;
      case 'inspections': return inspections.length;
      case 'maintenance': return maintenance.length;
      case 'contracts': return contracts.length;
      case 'contractRates': return contracts.reduce((acc, c) => acc + (c.rates?.length || 0), 0);
      case 'consumables': return getConsumablesList().length;
      case 'consumable_issuances': return getConsumableIssuances().length;
      case 'purchase_orders': return loadPurchaseOrders().length;
      case 'purchase_order_lines': return loadPurchaseOrders().reduce((acc, p) => acc + (p.lines?.length || 0), 0);
      case 'goods_receipts': return loadGoodsReceiptNotes().length;
      case 'goods_receipt_lines': return loadGoodsReceiptNotes().reduce((acc, g) => acc + (g.lines?.length || 0), 0);
      case 'subcontractor_rentals': return getSubContractorRentals().length;
      case 'monthly_expenses': {
        const records = getMonthlyExpenseRecords();
        return Object.values(records).reduce((acc, r) => acc + (r.rows?.length || 0), 0) || STANDARD_COST_CODES.length;
      }
      case 'tool_categories': {
        let cats = customCategories;
        if (!cats || cats.length === 0) {
          try {
            const s = localStorage.getItem('emdad_custom_categories');
            if (s) cats = JSON.parse(s);
          } catch {}
        }
        return cats?.length || 16;
      }
      case 'tool_sizes': {
        let szs = customSizes;
        if (!szs || szs.length === 0) {
          try {
            const s = localStorage.getItem('emdad_custom_sizes');
            if (s) szs = JSON.parse(s);
          } catch {}
        }
        return szs?.length || 14;
      }
      case 'crew_members': return loadCrewPersonnel().length;
      case 'dropdown_lookups': {
        return Object.keys(DROPDOWN_DEFINITIONS).reduce((acc, k) => acc + getDropdownOptions(k as DropdownListKey).length, 0);
      }
      case 'dossier_checklist': return dtBatches.reduce((acc, dt) => acc + (dt.toolLines?.length || 0), 0);
      case 'dossier_itemsselect': return inventory.length;
      case 'dossier_crew': return loadCrewPersonnel().length;
      case 'dossier_ddr': return 2;
      case 'dossier_utilization': return dtBatches.reduce((acc, dt) => acc + (dt.toolLines?.length || 0), 0);
      default: return 0;
    }
  };

  // Map state to selected entity across all 27 tables in ToolTracker
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
      case 'contractRates': {
        const allRates: any[] = [];
        contracts.forEach((c) => {
          if (Array.isArray(c.rates)) {
            c.rates.forEach((r, idx) => {
              allRates.push({
                contractCode: c.id || c.contractRef || '',
                rateId: r.no ?? `${idx + 1}`,
                contractRef: r.contractRef || c.contractRef || '',
                category: r.category || '',
                shortDesc: r.shortDesc || '',
                size: r.size || '',
                holeSection: r.holeSection || '',
                opsRate: r.opsRate ?? 0,
                standbyRate: r.standbyRate ?? 0,
                runCharges: r.runCharges ?? null,
                monthlyCharges: r.monthlyCharges ?? null,
                redress: r.redress ?? null,
                currency: r.currency || c.currency || 'USD',
              });
            });
          }
        });
        return allRates;
      }
      case 'consumables':
        return getConsumablesList();
      case 'consumable_issuances':
        return getConsumableIssuances();
      case 'purchase_orders':
        return loadPurchaseOrders();
      case 'purchase_order_lines': {
        const allLines: any[] = [];
        loadPurchaseOrders().forEach((po) => {
          if (Array.isArray(po.lines)) {
            po.lines.forEach((line, idx) => {
              allLines.push({
                lineId: line.lineId || `${po.poNumber}-${idx + 1}`,
                poNumber: po.poNumber,
                itemNo: line.itemNo ?? idx + 1,
                partNo: line.partNo || '',
                description: line.description || '',
                category: line.category || '',
                size: line.size || '',
                classification: line.classification || 'INVENTORY',
                subDivision: line.subDivision || po.subDivision || 'FISHING',
                contractRef: line.contractRef || po.contractRef || '',
                orderedQty: line.orderedQty ?? 1,
                receivedQty: line.receivedQty ?? 0,
                balanceQty: line.balanceQty ?? line.orderedQty ?? 1,
                unitPrice: line.unitPrice ?? 0,
                totalPrice: line.totalPrice ?? ((line.orderedQty ?? 1) * (line.unitPrice ?? 0)),
                usefulLifeMonths: line.usefulLifeMonths ?? 60,
                salvageValue: line.salvageValue ?? 0,
                monthlyDepreciation: line.monthlyDepreciation ?? 0,
              });
            });
          }
        });
        return allLines;
      }
      case 'goods_receipts':
        return loadGoodsReceiptNotes();
      case 'goods_receipt_lines': {
        const allLines: any[] = [];
        loadGoodsReceiptNotes().forEach((grn) => {
          if (Array.isArray(grn.lines)) {
            grn.lines.forEach((line, idx) => {
              allLines.push({
                lineId: line.lineId || `${grn.ticketNo}-${idx + 1}`,
                ticketNo: grn.ticketNo,
                poNumber: grn.poNumber,
                partNo: line.partNo || '',
                toolsno: line.toolsno || '',
                description: line.description || '',
                category: line.category || '',
                size: line.size || '',
                classification: line.classification || 'INVENTORY',
                subDivision: line.subDivision || 'FISHING',
                contractRef: line.contractRef || '',
                qtyReceived: line.qtyReceived ?? 1,
                unitPrice: line.unitPrice ?? 0,
                bookValue: line.bookValue ?? line.unitPrice ?? 0,
                currency: line.currency || grn.currency || 'USD',
                belongsTo: line.belongsTo || grn.supplier || 'EMDAD',
                reqInsp: line.reqInsp ?? false,
                insDate: line.insDate || '',
                usefulLifeMonths: line.usefulLifeMonths ?? 60,
                salvageValue: line.salvageValue ?? 0,
                monthlyDepreciation: line.monthlyDepreciation ?? 0,
                comments: line.comments || '',
              });
            });
          }
        });
        return allLines;
      }
      case 'subcontractor_rentals':
        return getSubContractorRentals();
      case 'monthly_expenses': {
        const records = getMonthlyExpenseRecords();
        const rows: any[] = [];
        Object.entries(records).forEach(([periodKey, rec]) => {
          if (Array.isArray(rec.rows)) {
            rec.rows.forEach((r) => {
              rows.push({
                periodKey,
                code: r.code,
                name: r.name,
                category: r.category,
                fishing: r.fishing ?? 0,
                whipstock: r.whipstock ?? 0,
                rentals: r.rentals ?? 0,
                total: r.total ?? ((r.fishing || 0) + (r.whipstock || 0) + (r.rentals || 0)),
                sourceType: r.sourceType || 'MANUAL_ADMIN',
                sector: r.sector || '',
                usefulLifeMonths: r.usefulLifeMonths ?? 60,
              });
            });
          }
        });
        return rows.length > 0 ? rows : STANDARD_COST_CODES.map((c) => ({
          periodKey: '2026-09',
          code: c.code,
          name: c.name,
          category: c.category,
          fishing: 0,
          whipstock: 0,
          rentals: 0,
          total: 0,
          sourceType: c.sourceType,
          sector: (c as any).sector || '',
          usefulLifeMonths: (c as any).usefulLifeMonths || 60,
        }));
      }
      case 'tool_categories': {
        let cats = customCategories;
        if (!cats || cats.length === 0) {
          try {
            const s = localStorage.getItem('emdad_custom_categories');
            if (s) cats = JSON.parse(s);
          } catch {}
        }
        if (!cats || cats.length === 0) {
          cats = [
            'BIT SUB', 'CARGO BASKET', 'CROSSOVER SUB', 'CUTLIP GUIDE', 'DRILL PIPE',
            'DRILLING JAR', 'FISHING JAR', 'GUNDRILL REAMER', 'HOLE OPENER',
            'HYD DRILLING JAR', 'MOTOR', 'OVERSHOT', 'ROLLER REAMER', 'SAFETY VALVE',
            'STABILIZER', 'WHIPSTOCK',
          ];
        }
        return cats.map((catName) => ({
          categoryName: catName,
          division: catName.includes('WHIPSTOCK') ? 'WHIPSTOCK' : catName.includes('JAR') ? 'FISHING' : 'RENTALS',
          description: `Downhole ${catName} equipment`,
          active: true,
        }));
      }
      case 'tool_sizes': {
        let szList = customSizes;
        if (!szList || szList.length === 0) {
          try {
            const s = localStorage.getItem('emdad_custom_sizes');
            if (s) szList = JSON.parse(s);
          } catch {}
        }
        if (!szList || szList.length === 0) {
          szList = ['3-1/2"', '4-3/4"', '5-3/4"', '6"', '6-1/2"', '6-3/4"', '8"', '8-1/8"', '8-1/2"', '9-1/2"', '11-3/4"', '12-1/4"', '17-1/2"', '26"'];
        }
        return szList.map((sz) => {
          const num = parseFloat(sz.replace(/[^0-9.]/g, '')) || 0;
          return {
            sizeString: sz,
            category: 'ALL',
            odInches: num,
            active: true,
          };
        });
      }
      case 'crew_members':
        return loadCrewPersonnel();
      case 'dropdown_lookups': {
        const lookups: any[] = [];
        Object.entries(DROPDOWN_DEFINITIONS).forEach(([k, def]) => {
          const options = getDropdownOptions(k as DropdownListKey);
          options.forEach((opt, idx) => {
            lookups.push({
              lookupId: `${k}_${opt.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
              listKey: k,
              group: def.group,
              optionValue: opt,
              sortOrder: idx + 1,
              active: true,
            });
          });
        });
        return lookups;
      }
      case 'dossier_checklist': {
        const lines: any[] = [];
        dtBatches.forEach((dt) => {
          if (Array.isArray(dt.toolLines)) {
            dt.toolLines.forEach((l, idx) => {
              lines.push({
                itemNo: l.itemNo ?? idx + 1,
                partNo: l.serial || l.assetNo || `SER-${idx + 1}`,
                description: l.desc || l.shortDesc || '',
                size: l.size || '',
                qty: l.qty ?? 1,
                supplier: l.ownership || 'EMDAD',
                qtyIn: 1,
                insNum: 'GIS-Z-01480-2023',
                insDate: '2023-05-15',
                comments: l.remarks || 'ACCEPTED',
                cat: l.shortDesc || 'DRILLING JAR',
              });
            });
          }
        });
        return lines;
      }
      case 'dossier_itemsselect':
        return inventory.map((t, idx) => ({
          serial: t.serial || `SER-${idx + 1}`,
          description: t.desc || t.shortDesc || '',
          size: t.size || '',
          qty: t.qty ?? 1,
          supplier: t.ownership || t.supplier || 'EMDAD',
          insDate: '2023-03-31',
          insNum: 'GIS-Z-01073-2023',
          condition: t.status || 'ACCEPTED',
        }));
      case 'dossier_crew': {
        const crew = loadCrewPersonnel();
        return crew.map((c) => ({
          badgeNo: c.badgeNo,
          name: c.name,
          designation: c.role,
          mobDate: '2023-05-15',
          demobDate: '2023-05-28',
          rigPassNo: c.rigPassNo || 'ADNOC-RP-88412',
          h2sExpiry: c.h2sExpiry || '2027-04-15',
          status: c.status || 'Mobilized (On Rig)',
        }));
      }
      case 'dossier_ddr': {
        const logs: any[] = [];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('emdad_daily_logs_')) {
              const raw = localStorage.getItem(k);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) logs.push(...parsed);
              }
            }
          }
        } catch {}
        if (logs.length > 0) return logs;
        return [
          { id: 'DDR-01', date: '2023-05-16', status: 'Operational', depth: '8-1/2" Section (3,420 m)', activity: 'Run in hole with fishing assembly. Latched fish at 3,410m.', loggedBy: 'Ahmed Al-Mansoor' },
          { id: 'DDR-02', date: '2023-05-17', status: 'Operational', depth: '8-1/2" Section (3,420 m)', activity: 'Worked jar up and down. Successfully recovered fish to surface.', loggedBy: 'Ahmed Al-Mansoor' },
        ];
      }
      case 'dossier_utilization': {
        const utils: any[] = [];
        dtBatches.forEach((dt) => {
          if (Array.isArray(dt.toolLines)) {
            dt.toolLines.forEach((l) => {
              utils.push({
                serial: l.serial,
                assetNo: l.assetNo || l.serial,
                operDays: 10,
                standbyDays: 2,
                dayRate: 450,
                standbyRate: 225,
                totalAmount: 4950,
              });
            });
          }
        });
        return utils;
      }
      default:
        return [];
    }
  }, [
    selectedEntityKey,
    jobs,
    inventory,
    dtBatches,
    rtBatches,
    callouts,
    gatePasses,
    inspections,
    maintenance,
    contracts,
    customCategories,
    customSizes,
  ]);

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

  const modelCustomColumns = useMemo(() => {
    return allCustomColumns.filter((c) => c.modelKey === selectedEntityKey);
  }, [allCustomColumns, selectedEntityKey]);

  const baseFields: FieldDefinition[] = isDetailMode && selectedDef.detailFields
    ? selectedDef.detailFields
    : selectedDef.fields;

  // Merge base schema fields with live admin custom columns
  const activeFields: FieldDefinition[] = useMemo(() => {
    const customConverted: FieldDefinition[] = modelCustomColumns.map((c) => ({
      key: c.key,
      label: c.label,
      type: c.type === 'select' ? 'string' : c.type,
      required: false,
      description: `Custom User-Defined Field (Created by ${c.createdBy || 'Admin'})`,
      sample: c.options ? c.options.join(', ') : 'Custom Value',
      allowedValues: c.options,
      isCustom: true,
    }));
    return [...baseFields, ...customConverted];
  }, [baseFields, modelCustomColumns]);

  const activeTableName = isDetailMode && selectedDef.detailName
    ? selectedDef.detailName
    : selectedDef.name;

  const activeSqlTable = isDetailMode && selectedDef.detailSqlTable
    ? selectedDef.detailSqlTable
    : selectedDef.sqlTable;

  const filteredLiveData = useMemo(() => {
    if (!currentTableData || currentTableData.length === 0) return [];
    if (!liveDataSearch.trim()) return currentTableData;
    const q = liveDataSearch.trim().toLowerCase();
    return currentTableData.filter((row: any) => {
      if (!row) return false;
      return Object.values(row).some((val) => {
        if (val === null || val === undefined) return false;
        if (typeof val === 'object') return false;
        return String(val).toLowerCase().includes(q);
      });
    });
  }, [currentTableData, liveDataSearch]);

  // Flexible resolver helper that matches key, label, uppercase, lowercase, stripped spaces
  const resolveFieldVal = (row: any, fieldKey: string, fieldLabel?: string) => {
    if (!row) return undefined;
    if (row[fieldKey] !== undefined && row[fieldKey] !== '') return row[fieldKey];
    if (fieldLabel && row[fieldLabel] !== undefined && row[fieldLabel] !== '') return row[fieldLabel];
    
    const targetKeys = [
      fieldKey.toLowerCase(),
      (fieldLabel || '').toLowerCase(),
      fieldKey.replace(/[^a-z0-9]/gi, '').toLowerCase(),
      (fieldLabel || '').replace(/[^a-z0-9]/gi, '').toLowerCase(),
    ];
    if (fieldKey === 'rateId' || fieldKey === 'no') {
      targetKeys.push('rateid', 'no', 'itemno', 'item', 'seq', 'linenumber', 'line');
    }
    if (fieldKey === 'contractCode' || fieldKey === 'id') {
      targetKeys.push('contractcode', 'contractid', 'contractref', 'contract', 'contractno');
    }
    if (fieldKey === 'shortDesc' || fieldKey === 'toolDescription') {
      targetKeys.push('shortdesc', 'tooldescription', 'description', 'emdadshortdesc', 'toolname');
    }
    if (fieldKey === 'opsRate') {
      targetKeys.push('opsrate', 'operatingrate', 'dayrate', 'oprate', 'operatingdayrate');
    }
    if (fieldKey === 'standbyRate') {
      targetKeys.push('standbyrate', 'stbyrate', 'standby');
    }
    for (const k of Object.keys(row)) {
      const cleanK = k.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (targetKeys.includes(cleanK) && row[k] !== undefined && row[k] !== '') {
        return row[k];
      }
    }
    return undefined;
  };

  // Generate blank template Excel with columns and notes
  const handleDownloadTemplate = () => {
    const headers = activeFields.map((f) => f.key);
    const sampleRow: Record<string, any> = {};
    activeFields.forEach((f) => {
      if (f.defaultSample !== undefined) {
        sampleRow[f.key] = f.defaultSample;
      } else if (typeof f.sample === 'string' && f.sample.includes(' (Options:')) {
        sampleRow[f.key] = f.sample.split(' (Options:')[0].trim();
      } else {
        sampleRow[f.key] = f.sample;
      }
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
      } else if (selectedEntityKey === 'purchase_orders') {
        const pos = loadPurchaseOrders();
        pos.forEach((po) => {
          if (Array.isArray(po.lines)) {
            po.lines.forEach((line, idx) => {
              exportLines.push({
                poNumber: po.poNumber,
                itemNo: line.itemNo ?? idx + 1,
                partNo: line.partNo || '',
                description: line.description || '',
                category: line.category || '',
                size: line.size || '',
                classification: line.classification || 'INVENTORY',
                subDivision: line.subDivision || po.subDivision || 'FISHING',
                contractRef: line.contractRef || po.contractRef || '',
                orderedQty: line.orderedQty ?? 1,
                receivedQty: line.receivedQty ?? 0,
                balanceQty: line.balanceQty ?? line.orderedQty ?? 1,
                unitPrice: line.unitPrice ?? 0,
                totalPrice: line.totalPrice ?? ((line.orderedQty ?? 1) * (line.unitPrice ?? 0)),
                usefulLifeMonths: line.usefulLifeMonths ?? 60,
                salvageValue: line.salvageValue ?? 0,
                monthlyDepreciation: line.monthlyDepreciation ?? 0,
              });
            });
          }
        });
      } else if (selectedEntityKey === 'goods_receipts') {
        const grns = loadGoodsReceiptNotes();
        grns.forEach((grn) => {
          if (Array.isArray(grn.lines)) {
            grn.lines.forEach((line, idx) => {
              exportLines.push({
                ticketNo: grn.ticketNo,
                poNumber: grn.poNumber,
                partNo: line.partNo || '',
                toolsno: line.toolsno || '',
                description: line.description || '',
                category: line.category || '',
                size: line.size || '',
                classification: line.classification || 'INVENTORY',
                subDivision: line.subDivision || 'FISHING',
                contractRef: line.contractRef || '',
                qtyReceived: line.qtyReceived ?? 1,
                unitPrice: line.unitPrice ?? 0,
                bookValue: line.bookValue ?? line.unitPrice ?? 0,
                currency: line.currency || grn.currency || 'USD',
                belongsTo: line.belongsTo || grn.supplier || 'EMDAD',
                reqInsp: line.reqInsp ?? false,
                insDate: line.insDate || '',
                usefulLifeMonths: line.usefulLifeMonths ?? 60,
                salvageValue: line.salvageValue ?? 0,
                monthlyDepreciation: line.monthlyDepreciation ?? 0,
                comments: line.comments || '',
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
      const pkDef = fieldsToValidate.find((f) => f.key === pk);
      const pkValue = resolveFieldVal(row, pk, pkDef?.label);
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
          const reqDef = fieldsToValidate.find((f) => f.key === reqKey);
          const val = resolveFieldVal(row, reqKey, reqDef?.label);
          if (!val || String(val).trim() === '') {
            errors.push({
              row: rowNum,
              column: reqKey,
              message: `Required field "${reqKey}" is missing.`,
            });
          }
        }
      });

      // Check allowed values if defined
      fieldsToValidate.forEach((f) => {
        if (f.allowedValues && f.allowedValues.length > 0) {
          const val = row[f.key] ?? row[f.label] ?? row[f.key.toUpperCase()] ?? row[f.key.toLowerCase()];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            const strVal = String(val).trim();
            const matched = f.allowedValues.some(
              (opt) => opt.toLowerCase() === strVal.toLowerCase()
            );
            if (!matched) {
              errors.push({
                row: rowNum,
                column: f.key,
                message: `Invalid value "${strVal}". Allowed options: ${f.allowedValues.join(', ')}`,
              });
            }
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
        let val = resolveFieldVal(raw, f.key, f.label);
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
          let str = val !== undefined && val !== null ? String(val).trim() : '';
          if (f.allowedValues && f.allowedValues.length > 0 && str) {
            const exactMatch = f.allowedValues.find(
              (opt) => opt.toLowerCase() === str.toLowerCase()
            );
            if (exactMatch) {
              str = exactMatch;
            }
          }
          cleaned[f.key] = str;
        }
      });
      return cleaned;
    };

    // BRANCH A: Line Items Detail Import (DT, RT, PO, GRN)
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

    // Detail Import for Purchase Order Lines
    if (isDetailMode && selectedEntityKey === 'purchase_orders') {
      try {
        const pos = loadPurchaseOrders();
        const posMap = new Map(pos.map((p) => [p.poNumber.trim().toUpperCase(), p]));
        for (let i = 0; i < parsedRows.length; i++) {
          const raw = parsedRows[i];
          const poNumVal = String(raw.poNumber || raw.PONUMBER || raw['PO Number'] || '').trim();
          const partNoVal = String(raw.partNo || raw.PARTNO || raw['Part Number'] || '').trim();
          if (!poNumVal || !partNoVal) {
            errorCount++;
            continue;
          }
          let poObj = posMap.get(poNumVal.toUpperCase());
          if (!poObj) {
            if (allowAdd) {
              poObj = {
                poId: `PO-${Date.now()}-${i}`,
                poNumber: poNumVal,
                supplier: String(raw.supplier || 'SUPPLIER'),
                orderDate: new Date().toISOString().split('T')[0],
                currency: 'USD',
                totalAmount: 0,
                inwardedAmount: 0,
                balanceAmount: 0,
                status: 'OPEN',
                createdAt: new Date().toISOString(),
                lines: [],
              };
              posMap.set(poNumVal.toUpperCase(), poObj);
            } else {
              errorCount++;
              continue;
            }
          }
          const lineCleaned = cleanRow(raw, activeFields);
          if (!poObj.lines) poObj.lines = [];
          const existingLineIdx = poObj.lines.findIndex(
            (l) => (l.partNo && l.partNo.toUpperCase() === partNoVal.toUpperCase()) || String(l.itemNo) === String(lineCleaned.itemNo)
          );
          if (existingLineIdx >= 0) {
            if (allowUpdate) {
              poObj.lines[existingLineIdx] = { ...poObj.lines[existingLineIdx], ...lineCleaned };
              updatedCount++;
            }
          } else {
            if (allowAdd) {
              poObj.lines.push({
                ...lineCleaned,
                lineId: `POL-${Date.now()}-${i}`,
                itemNo: lineCleaned.itemNo || poObj.lines.length + 1,
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
        const updatedPOs = Array.from(posMap.values()).map((p) => {
          const totalAmt = p.lines.reduce((s: number, l: any) => s + (l.totalPrice || (l.orderedQty * l.unitPrice) || 0), 0);
          return {
            ...p,
            totalAmount: totalAmt,
            balanceAmount: totalAmt - (p.inwardedAmount || 0),
          };
        });
        saveAllPurchaseOrders(updatedPOs);
        onUpdateState('purchase_orders', () => updatedPOs);
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const summaryMsg = `Processed ${total} PO lines in ${elapsedSec}s: ${addedCount} Added, ${updatedCount} Updated, ${errorCount} Skipped.`;
        setProcessLogs((prev) => [
          { time: new Date().toLocaleTimeString(), type: 'success', msg: summaryMsg },
          ...prev,
        ]);
        showToast(summaryMsg, 'success');
      } catch (err: any) {
        showToast(`Error processing PO lines: ${err?.message}`, 'error');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Detail Import for Goods Receipt Lines
    if (isDetailMode && selectedEntityKey === 'goods_receipts') {
      try {
        const grns = loadGoodsReceiptNotes();
        const grnsMap = new Map(grns.map((g) => [g.ticketNo.trim().toUpperCase(), g]));
        for (let i = 0; i < parsedRows.length; i++) {
          const raw = parsedRows[i];
          const ticketVal = String(raw.ticketNo || raw.TICKETNO || raw['Ticket No'] || '').trim();
          const partNoVal = String(raw.partNo || raw.PARTNO || raw['Part Number'] || '').trim();
          if (!ticketVal || !partNoVal) {
            errorCount++;
            continue;
          }
          let grnObj = grnsMap.get(ticketVal.toUpperCase());
          if (!grnObj) {
            if (allowAdd) {
              grnObj = {
                grnId: `GRN-${Date.now()}-${i}`,
                ticketNo: ticketVal,
                poNumber: String(raw.poNumber || ''),
                supplier: String(raw.supplier || 'SUPPLIER'),
                supplierDt: String(raw.supplierDt || ''),
                dateRecd: new Date().toISOString().split('T')[0],
                mfgReceivedBy: user.name,
                currency: 'USD',
                totalItemsReceived: 0,
                totalInwardValue: 0,
                qcStatus: 'ACCEPTED',
                createdAt: new Date().toISOString(),
                lines: [],
              };
              grnsMap.set(ticketVal.toUpperCase(), grnObj);
            } else {
              errorCount++;
              continue;
            }
          }
          const lineCleaned = cleanRow(raw, activeFields);
          if (!grnObj.lines) grnObj.lines = [];
          const existingLineIdx = grnObj.lines.findIndex(
            (l) => (l.toolsno && l.toolsno.toUpperCase() === String(raw.toolsno || '').toUpperCase()) ||
                   (l.partNo && l.partNo.toUpperCase() === partNoVal.toUpperCase() && !l.toolsno)
          );
          if (existingLineIdx >= 0) {
            if (allowUpdate) {
              grnObj.lines[existingLineIdx] = { ...grnObj.lines[existingLineIdx], ...lineCleaned };
              updatedCount++;
            }
          } else {
            if (allowAdd) {
              grnObj.lines.push({
                ...lineCleaned,
                lineId: `GRL-${Date.now()}-${i}`,
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
        const updatedGRNs = Array.from(grnsMap.values()).map((g) => {
          const totalVal = g.lines.reduce((s: number, l: any) => s + (l.bookValue || (l.qtyReceived * l.unitPrice) || 0), 0);
          const totalQty = g.lines.reduce((s: number, l: any) => s + (l.qtyReceived || 0), 0);
          return {
            ...g,
            totalItemsReceived: totalQty,
            totalInwardValue: totalVal,
          };
        });
        saveAllGoodsReceiptNotes(updatedGRNs);
        onUpdateState('goods_receipts', () => updatedGRNs);
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const summaryMsg = `Processed ${total} GRN lines in ${elapsedSec}s: ${addedCount} Added, ${updatedCount} Updated, ${errorCount} Skipped.`;
        setProcessLogs((prev) => [
          { time: new Date().toLocaleTimeString(), type: 'success', msg: summaryMsg },
          ...prev,
        ]);
        showToast(summaryMsg, 'success');
      } catch (err: any) {
        showToast(`Error processing GRN lines: ${err?.message}`, 'error');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // BRANCH C: Contract Rates Schedule Import (tbl_ContractRates)
    if (selectedEntityKey === 'contractRates') {
      try {
        const modifiedContracts = [...contracts];
        const findContractIndex = (code: string) => {
          const cClean = code.trim().toUpperCase();
          let idx = modifiedContracts.findIndex((c) => String(c.id).trim().toUpperCase() === cClean);
          if (idx >= 0) return idx;
          idx = modifiedContracts.findIndex((c) => String(c.contractRef || '').trim().toUpperCase() === cClean);
          if (idx >= 0) return idx;
          idx = modifiedContracts.findIndex((c) => String(c.contractNo || '').trim().toUpperCase() === cClean);
          if (idx >= 0) return idx;
          idx = modifiedContracts.findIndex((c) => String(c.name || '').trim().toUpperCase().includes(cClean));
          if (idx >= 0) return idx;
          idx = modifiedContracts.findIndex((c) => String(c.client || '').trim().toUpperCase().includes(cClean));
          return idx;
        };

        const ratesByContract = new Map<string, any[]>();
        for (let i = 0; i < parsedRows.length; i++) {
          const raw = parsedRows[i];
          const contractCodeVal = String(
            resolveFieldVal(raw, 'contractCode', 'ContractCode') ||
            resolveFieldVal(raw, 'contractRef', 'ContractRef') ||
            resolveFieldVal(raw, 'contract', 'Contract') ||
            resolveFieldVal(raw, 'id', 'ContractID') ||
            ''
          ).trim();

          const rateIdVal = String(
            resolveFieldVal(raw, 'rateId', 'RateID') ||
            resolveFieldVal(raw, 'no', 'No') ||
            `${i + 1}`
          ).trim();

          if (!contractCodeVal) {
            errorCount++;
            continue;
          }

          const cleaned = cleanRow(raw, selectedDef.fields);
          const rateItem: ContractRateItem = {
            no: rateIdVal,
            contractRef: cleaned.contractRef || '',
            category: cleaned.category || 'GENERAL',
            shortDesc: cleaned.shortDesc || cleaned.category || 'TOOL',
            size: cleaned.size || '',
            holeSection: cleaned.holeSection || cleaned.size || '',
            opsRate: Number(cleaned.opsRate) || 0,
            standbyRate: Number(cleaned.standbyRate) || (Number(cleaned.opsRate) * 0.5),
            runCharges: cleaned.runCharges ?? null,
            monthlyCharges: cleaned.monthlyCharges ?? null,
            redress: cleaned.redress ?? null,
            currency: cleaned.currency || 'USD',
          };

          const existingList = ratesByContract.get(contractCodeVal.toUpperCase()) || [];
          existingList.push(rateItem);
          ratesByContract.set(contractCodeVal.toUpperCase(), existingList);

          if (i % 25 === 0 || i === total - 1) {
            const elapsedMin = (Date.now() - startTime) / 60000;
            const rpm = elapsedMin > 0 ? Math.round((i + 1) / elapsedMin) : 0;
            setProcessProgress({ current: i + 1, total, rpm });
          }
        }

        for (const [cCode, importedRates] of ratesByContract.entries()) {
          const cIdx = findContractIndex(cCode);
          if (cIdx >= 0) {
            const targetContract = { ...modifiedContracts[cIdx] };
            const currentRates = Array.isArray(targetContract.rates) ? [...targetContract.rates] : [];

            importedRates.forEach((impRate) => {
              const existingRateIdx = currentRates.findIndex(
                (r) => String(r.no).trim().toUpperCase() === String(impRate.no).trim().toUpperCase() ||
                       (String(r.shortDesc).trim().toUpperCase() === String(impRate.shortDesc).trim().toUpperCase() &&
                        String(r.size || '').trim().toUpperCase() === String(impRate.size || '').trim().toUpperCase() &&
                        String(r.holeSection || '').trim().toUpperCase() === String(impRate.holeSection || '').trim().toUpperCase())
              );

              if (existingRateIdx >= 0) {
                if (allowUpdate) {
                  currentRates[existingRateIdx] = { ...currentRates[existingRateIdx], ...impRate };
                  updatedCount++;
                }
              } else {
                if (allowAdd) {
                  currentRates.push(impRate);
                  addedCount++;
                }
              }
            });

            targetContract.rates = currentRates;
            modifiedContracts[cIdx] = targetContract;

            // Persist to persistent storage and Azure SQL
            saveCustomContract(targetContract);
            saveCustomContractRates(targetContract.id, targetContract.rates);
            if (targetContract.contractRef) saveCustomContractRates(targetContract.contractRef, targetContract.rates);
            if (targetContract.contractNo) saveCustomContractRates(targetContract.contractNo, targetContract.rates);
            await saveContractRatesApi(targetContract.id, targetContract.rates);
            await saveContractApi(targetContract);
          } else {
            errorCount += importedRates.length;
            newLogs.unshift({
              time: new Date().toLocaleTimeString(),
              type: 'warn',
              msg: `Contract "${cCode}" not found in Master Contracts Register. Skipped ${importedRates.length} rate line(s).`,
            });
          }
        }

        onUpdateState('contracts', () => modifiedContracts);

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const summaryMsg = `Processed ${total} contract rate items in ${elapsedSec}s: ${addedCount} Added, ${updatedCount} Updated, ${errorCount} Skipped.`;
        setProcessLogs((prev) => [
          { time: new Date().toLocaleTimeString(), type: 'success', msg: summaryMsg },
          ...prev,
        ]);
        showToast(summaryMsg, 'success');
      } catch (err: any) {
        setProcessLogs((prev) => [
          { time: new Date().toLocaleTimeString(), type: 'error', msg: `Rates schedule write failure: ${err?.message || 'Network error'}` },
          ...prev,
        ]);
        showToast('Error persisting contract rates schedule to Azure SQL.', 'error');
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
      const pkDef = activeFields.find((f) => f.key === pk);
      const pkValRaw = resolveFieldVal(raw, pk, pkDef?.label);
      const pkVal = String(pkValRaw || '').trim();

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
            saveCustomContract(item);
            if (Array.isArray(item.rates) && item.rates.length > 0) {
              saveCustomContractRates(item.id, item.rates);
              if (item.contractRef) saveCustomContractRates(item.contractRef, item.rates);
              if (item.contractNo) saveCustomContractRates(item.contractNo, item.rates);
              await saveContractRatesApi(item.contractRef || item.contractNo || item.id, item.rates);
            }
            await saveContractApi(item);
          } else if (selectedEntityKey === 'inspections') {
            await saveInspectionApi(item);
          } else if (selectedEntityKey === 'maintenance') {
            await saveMaintenanceApi(item);
          }
        }
      }

      // Specific module storage engines
      if (selectedEntityKey === 'consumables') {
        saveConsumablesList(updatedStateList);
      } else if (selectedEntityKey === 'consumable_issuances') {
        saveConsumableIssuances(updatedStateList);
      } else if (selectedEntityKey === 'purchase_orders') {
        saveAllPurchaseOrders(updatedStateList);
      } else if (selectedEntityKey === 'purchase_order_lines') {
        const currentPOs = loadPurchaseOrders();
        const poMap = new Map(currentPOs.map((p) => [p.poNumber.toUpperCase(), p]));
        updatedStateList.forEach((line) => {
          const parentPO = poMap.get((line.poNumber || '').toUpperCase());
          if (parentPO) {
            if (!parentPO.lines) parentPO.lines = [];
            const lIdx = parentPO.lines.findIndex((pl) => pl.lineId === line.lineId || pl.itemNo === line.itemNo);
            if (lIdx >= 0) parentPO.lines[lIdx] = { ...parentPO.lines[lIdx], ...line };
            else parentPO.lines.push(line);
          }
        });
        saveAllPurchaseOrders(currentPOs);
      } else if (selectedEntityKey === 'goods_receipts') {
        saveAllGoodsReceiptNotes(updatedStateList);
      } else if (selectedEntityKey === 'goods_receipt_lines') {
        const currentGRNs = loadGoodsReceiptNotes();
        const grnMap = new Map(currentGRNs.map((g) => [g.ticketNo.toUpperCase(), g]));
        updatedStateList.forEach((line) => {
          const parentGRN = grnMap.get((line.ticketNo || '').toUpperCase());
          if (parentGRN) {
            if (!parentGRN.lines) parentGRN.lines = [];
            const lIdx = parentGRN.lines.findIndex((gl) => gl.lineId === line.lineId || gl.toolsno === line.toolsno);
            if (lIdx >= 0) parentGRN.lines[lIdx] = { ...parentGRN.lines[lIdx], ...line };
            else parentGRN.lines.push(line);
          }
        });
        saveAllGoodsReceiptNotes(currentGRNs);
      } else if (selectedEntityKey === 'subcontractor_rentals') {
        saveSubContractorRentals(updatedStateList);
      } else if (selectedEntityKey === 'monthly_expenses') {
        const records = getMonthlyExpenseRecords();
        updatedStateList.forEach((row) => {
          const pKey = row.periodKey || '2026-09';
          if (!records[pKey]) {
            records[pKey] = {
              periodKey: pKey,
              monthName: pKey,
              year: parseInt(pKey.split('-')[0], 10) || 2026,
              isFrozen: false,
              status: 'DRAFT',
              rows: [],
              totalFishing: 0,
              totalWhipstock: 0,
              totalRentals: 0,
              grandTotal: 0,
            };
          }
          const rIdx = records[pKey].rows.findIndex((r) => r.code === row.code);
          if (rIdx >= 0) {
            records[pKey].rows[rIdx] = { ...records[pKey].rows[rIdx], ...row };
          } else {
            records[pKey].rows.push(row);
          }
        });
        Object.values(records).forEach((rec) => saveMonthExpenseRecord(rec));
        window.dispatchEvent(new Event('monthly_expenses_updated'));
      } else if (selectedEntityKey === 'tool_categories') {
        const cats = Array.from(new Set(updatedStateList.map((c) => c.categoryName || c.name || c.category).filter(Boolean))).sort() as string[];
        localStorage.setItem('emdad_custom_categories', JSON.stringify(cats));
        if (onUpdateCustomCategories) onUpdateCustomCategories(cats);
        window.dispatchEvent(new Event('categories_updated'));
      } else if (selectedEntityKey === 'tool_sizes') {
        const szs = Array.from(new Set(updatedStateList.map((s) => s.sizeString || s.name || s.size).filter(Boolean))) as string[];
        localStorage.setItem('emdad_custom_sizes', JSON.stringify(szs));
        if (onUpdateCustomSizes) onUpdateCustomSizes(szs);
        window.dispatchEvent(new Event('sizes_updated'));
      } else if (selectedEntityKey === 'crew_members') {
        saveAllCrewPersonnel(updatedStateList);
      } else if (selectedEntityKey === 'dropdown_lookups') {
        updatedStateList.forEach((lookup) => {
          if (lookup.listKey && lookup.optionValue) {
            addDropdownOption(lookup.listKey as DropdownListKey, lookup.optionValue);
          }
        });
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
                      const count = getEntityCount(def.key);

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

          {/* Workspace Tabs (Live View / Data Import / Schema Mapping) */}
          <div className="flex border-b border-slate-200 bg-white px-4 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('live')}
              className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'live'
                  ? 'border-[#1a3055] text-[#1a3055]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-blue-600" />
              <span>Live Database View ({currentTableData.length} records)</span>
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'import'
                  ? 'border-[#1a3055] text-[#1a3055]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>Data Import & Preview ({parsedRows.length} rows loaded)</span>
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'preview'
                  ? 'border-[#1a3055] text-[#1a3055]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Table className="w-3.5 h-3.5 text-slate-500" />
              <span>Database Schema & Columns ({activeFields.length} columns)</span>
            </button>
          </div>

          {/* Central Workspace Table */}
          <div className="flex-1 overflow-auto p-3">
            {activeTab === 'live' ? (
              <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden flex flex-col h-full">
                {/* Search & Actions Bar for Live Database */}
                <div className="bg-[#f8fafc] px-3 py-2 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 max-w-md">
                    <div className="relative w-full">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={liveDataSearch}
                        onChange={(e) => setLiveDataSearch(e.target.value)}
                        placeholder={`Search in ${activeTableName} across all columns...`}
                        className="w-full pl-8 pr-7 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-sans"
                      />
                      {liveDataSearch && (
                        <button
                          onClick={() => setLiveDataSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer font-bold"
                          title="Clear search"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      Showing {filteredLiveData.length} of {currentTableData.length} records
                    </span>
                    <button
                      onClick={handleExportCurrentData}
                      className="px-2.5 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded border border-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Export live table to Excel"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Export Excel</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('import')}
                      className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-900 font-semibold rounded border border-blue-300 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Upload data into this table"
                    >
                      <Upload className="w-3.5 h-3.5 text-blue-700" />
                      <span>Bulk Upload / Correct</span>
                    </button>
                  </div>
                </div>

                {/* Live Records Table */}
                {filteredLiveData.length > 0 ? (
                  <div className="flex-1 overflow-auto max-h-[520px]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b border-slate-200 font-bold z-10">
                        <tr>
                          <th className="p-2 w-12 text-center text-[10px] text-slate-400 border-r border-slate-200">#</th>
                          {activeFields.map((field) => (
                            <th key={field.key} className="p-2 whitespace-nowrap border-r border-slate-200 bg-slate-100">
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
                        {filteredLiveData.map((row: any, idx: number) => (
                          <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                            <td className="p-2 text-center font-mono text-[10px] text-slate-400 bg-slate-50/50 border-r border-slate-200">
                              {idx + 1}
                            </td>
                            {activeFields.map((field) => {
                              const val = resolveFieldVal(row, field.key, field.label);
                              let displayVal: React.ReactNode = <span className="text-slate-300">—</span>;
                              if (val !== undefined && val !== null && val !== '') {
                                if (typeof val === 'boolean') {
                                  displayVal = (
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${val ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                                      {val ? 'TRUE' : 'FALSE'}
                                    </span>
                                  );
                                } else if (typeof val === 'object') {
                                  displayVal = (
                                    <span className="font-mono text-[10px] text-slate-600 truncate max-w-[200px] block" title={JSON.stringify(val)}>
                                      {Array.isArray(val) ? `[${val.length} items]` : JSON.stringify(val)}
                                    </span>
                                  );
                                } else {
                                  displayVal = (
                                    <span className="truncate max-w-[240px] block" title={String(val)}>
                                      {String(val)}
                                    </span>
                                  );
                                }
                              }
                              return (
                                <td key={field.key} className="p-2 whitespace-nowrap border-r border-slate-100 font-mono text-[11px] text-slate-800">
                                  {displayVal}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white min-h-[260px]">
                    {currentTableData.length === 0 ? (
                      <>
                        <Database className="w-12 h-12 text-slate-300 mb-2" />
                        <div className="text-sm font-bold text-slate-700">No Records Found in {activeTableName}</div>
                        <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
                          This table is currently empty in live storage. You can download the template builder and import records directly.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleDownloadTemplate}
                            className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded border border-slate-300 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 text-blue-600" />
                            <span>Download Template Builder</span>
                          </button>
                          <button
                            onClick={() => setActiveTab('import')}
                            className="px-3.5 py-1.5 text-xs bg-[#1a3055] hover:bg-[#24426d] text-white font-semibold rounded shadow-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5 text-blue-200" />
                            <span>Upload Excel File</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Search className="w-10 h-10 text-slate-300 mb-2" />
                        <div className="text-sm font-bold text-slate-700">No Matching Records</div>
                        <p className="text-xs text-slate-500 max-w-md mt-1 mb-3">
                          No records match your filter: <code className="font-mono text-rose-600">"{liveDataSearch}"</code>
                        </p>
                        <button
                          onClick={() => setLiveDataSearch('')}
                          className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded border border-slate-300 cursor-pointer"
                        >
                          Clear Search
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : activeTab === 'import' ? (
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
                {/* Custom Column Top Action Header */}
                <div className="bg-[#f1f5f9] px-4 py-2.5 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span>🏷️</span>
                      <span>Database Schema &amp; Custom Fields Dictionary</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200 font-bold">
                        {activeFields.length} Total Columns ({modelCustomColumns.length} Custom)
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Columns configured here automatically appear live across all users in <strong>{activeTableName}</strong>.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddColumnModalOpen(true)}
                    className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Custom Column</span>
                  </button>
                </div>

                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2 w-32">Field Key</th>
                      <th className="p-2 w-36">Label</th>
                      <th className="p-2 w-20">Type</th>
                      <th className="p-2 w-24">Constraint</th>
                      <th className="p-2">Description</th>
                      <th className="p-2 font-mono min-w-[240px]">Sample Value &amp; Options</th>
                      <th className="p-2 text-center w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {activeFields.map((f) => {
                      const matchedCustom = modelCustomColumns.find((c) => c.key === f.key);
                      return (
                      <tr key={f.key} className={`transition-colors ${f.isCustom ? 'bg-emerald-50/40 hover:bg-emerald-50/70' : 'hover:bg-slate-50'}`}>
                        <td className="p-2 font-mono font-bold text-slate-800 flex items-center gap-1">
                          {f.isCustom && <span className="text-emerald-600 font-bold text-xs" title="Custom Column">★</span>}
                          <span>{f.key}</span>
                        </td>
                        <td className="p-2 font-medium text-slate-700">
                          {f.label}
                          {f.isCustom && (
                            <span className="ml-1.5 px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                              Custom
                            </span>
                          )}
                        </td>
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
                        <td className="p-2 text-slate-600 leading-relaxed">{f.description}</td>
                        <td className="p-2 bg-slate-50/60 text-[11px]">
                          <div className="font-mono text-slate-800 font-semibold break-words">
                            {String(f.sample)}
                          </div>
                          {f.allowedValues && f.allowedValues.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <span className="text-[10px] font-sans font-semibold text-slate-500 uppercase tracking-wider">
                                Accepted:
                              </span>
                              {f.allowedValues.map((val) => (
                                <span
                                  key={val}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200/80"
                                >
                                  {val}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {f.isCustom && matchedCustom ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomColumn(matchedCustom.id)}
                              className="p-1 rounded text-rose-600 hover:text-rose-800 hover:bg-rose-50 cursor-pointer transition"
                              title="Delete this custom column from schema and SQL database"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-slate-300 text-[11px] font-mono">—</span>
                          )}
                        </td>
                      </tr>
                    );
                    })}
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

      {/* Add Custom Column Modal (Admin Only) */}
      {isAddColumnModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-lg overflow-hidden flex flex-col">
            <div className="bg-[#1a3055] text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm">Add Custom Column to Schema</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddColumnModalOpen(false)}
                className="text-white/80 hover:text-white font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveNewColumn} className="p-4 space-y-3.5 text-xs">
              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[11px] text-blue-900 leading-tight">
                Target Model: <strong className="text-[#1a3055]">{activeTableName}</strong> ({activeSqlTable})
                <br />
                This new column will be saved directly to the database schema and appear live for all users.
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Column Display Name / Label <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder='e.g. "BHA Assembly No", "Thread Spec", "Inspector Badge"'
                  value={newColLabel}
                  onChange={(e) => {
                    setNewColLabel(e.target.value);
                    if (!newColKey) {
                      setNewColKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                    }
                  }}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Field Key (Database Identifier)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. bha_assembly_no"
                    value={newColKey}
                    onChange={(e) => setNewColKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono text-slate-700 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Data Type
                  </label>
                  <select
                    value={newColType}
                    onChange={(e) => setNewColType(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="string">Text (String)</option>
                    <option value="number">Numeric (Number)</option>
                    <option value="date">Date (Calendar DD-MM-YYYY)</option>
                    <option value="select">Dropdown List (Select)</option>
                    <option value="boolean">Yes / No (Checkbox)</option>
                  </select>
                </div>
              </div>

              {newColType === 'select' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Dropdown Options (Comma-Separated)
                  </label>
                  <input
                    type="text"
                    placeholder='e.g. "Approved, Rejected, Under Review, Pending"'
                    value={newColOptions}
                    onChange={(e) => setNewColOptions(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Default Column Width (px)
                  </label>
                  <input
                    type="number"
                    min="60"
                    max="600"
                    value={newColWidth}
                    onChange={(e) => setNewColWidth(parseInt(e.target.value, 10) || 140)}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Excel Resizable
                  </label>
                  <div className="py-2 text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Yes (Full Excel Drag Support)</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Description / Instructions for Users
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional guidelines for what operators should enter in this column..."
                  value={newColDescription}
                  onChange={(e) => setNewColDescription(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded p-2 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddColumnModalOpen(false)}
                  className="px-3.5 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSyncingSql}
                  className="px-5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isSyncingSql ? 'Saving to Azure SQL...' : 'Save & Publish Live'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
