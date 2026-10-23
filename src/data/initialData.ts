import {
  User,
  UserRole,
  NavModule,
  ToolItem,
  Callout,
  DrillingJob,
  DTBatch,
  RTBatch,
  InspectionRecord,
  MaintenanceRecord,
  GatePass,
  ContractRecord,
  MovementLog,
  SubmittedInvoiceRecord
} from '../types';

// ─── USERS ────────────────────────────────────────────────────────────────────
// Real user accounts — authentication handled via Azure SQL login endpoint
export const USERS: User[] = [
  { id: 1, username: 'ravi', name: 'Ravi Parapu', role: 'Admin', pass: 'Ravi@2026' },
  { id: 2, username: 'azim', name: 'Azim', role: 'Handler', pass: 'Azim@2026' },
  { id: 3, username: 'deen', name: 'Deen', role: 'Handler', pass: 'Deen@2026' },
  { id: 4, username: 'surej', name: 'Surej', role: 'Handler', pass: 'Surej@2026' },
  { id: 5, username: 'raghu', name: 'Raghu', role: 'Handler', pass: 'Raghu@2026' },
  { id: 6, username: 'nihas', name: 'Nihas', role: 'QC', pass: 'Nihas@2026' },
  { id: 7, username: 'inspect', name: 'Inspector', role: 'Inspector', pass: 'Inspect@2026' },
  { id: 8, username: 'ramya', name: 'Ramya', role: 'Accounts', pass: 'Ramya@2026' },
  { id: 9, username: 'alanood', name: 'Alanood', role: 'Accounts', pass: 'Alanood@2026' },
  { id: 10, username: 'viewer', name: 'Viewer', role: 'Viewer', pass: 'View@2026' },
];

export const INITIAL_USER: User = USERS[0];

// ─── ROLE PERMISSIONS ─────────────────────────────────────────────────────────
export const MODULE_PERMISSIONS: Record<UserRole, NavModule[]> = {
  Admin: [
    'dashboard', 'callouts', 'jobs', 'dt', 'rt', 'job-tools-list', 'tool-history',
    'gatepass', 'utilization', 'inventory-dash', 'inventory', 'categories-sizes',
    'maintenance-dash', 'inspection', 'maintenance', 'billing-dash', 'invoicing',
    'tool-revenue-report', 'subcontractor-rentals', 'monthly-expenses', 'consumables',
    'contract-dash', 'contracts', 'data-management', 'settings',
  ],
  Operations: [
    'dashboard', 'jobs', 'callouts', 'dt', 'rt', 'job-tools-list', 'tool-history',
    'gatepass', 'utilization', 'inventory-dash', 'inventory', 'categories-sizes',
    'maintenance-dash', 'inspection', 'maintenance', 'billing-dash', 'invoicing',
    'tool-revenue-report', 'subcontractor-rentals', 'monthly-expenses', 'consumables',
    'contract-dash', 'contracts',
  ],
  Handler: [
    'dashboard', 'jobs', 'callouts', 'dt', 'rt', 'job-tools-list', 'tool-history',
    'gatepass', 'utilization', 'inventory-dash', 'inventory', 'categories-sizes',
    'maintenance-dash', 'inspection', 'maintenance', 'billing-dash', 'invoicing',
    'tool-revenue-report', 'contract-dash', 'contracts',
  ],
  Accounts: [
    'dashboard', 'jobs', 'callouts', 'dt', 'rt', 'job-tools-list', 'tool-history',
    'gatepass', 'utilization', 'inventory-dash', 'inventory', 'categories-sizes',
    'maintenance-dash', 'inspection', 'maintenance', 'billing-dash', 'invoicing',
    'tool-revenue-report', 'subcontractor-rentals', 'monthly-expenses', 'consumables',
    'contract-dash', 'contracts',
  ],
  QC: [
    'dashboard', 'jobs', 'dt', 'rt', 'job-tools-list', 'tool-history',
    'gatepass', 'utilization', 'inventory-dash', 'inventory', 'categories-sizes',
    'maintenance-dash', 'inspection', 'maintenance', 'billing-dash', 'invoicing',
    'tool-revenue-report', 'contract-dash', 'contracts',
  ],
  Inspector: [
    'dashboard', 'jobs', 'dt', 'rt', 'job-tools-list', 'tool-history',
    'gatepass', 'utilization', 'inventory-dash', 'inventory', 'categories-sizes',
    'maintenance-dash', 'inspection', 'maintenance', 'billing-dash', 'invoicing',
    'tool-revenue-report', 'contract-dash', 'contracts',
  ],
  Viewer: [
    'dashboard', 'jobs', 'callouts', 'dt', 'rt', 'job-tools-list', 'tool-history',
    'gatepass', 'utilization', 'inventory-dash', 'inventory', 'categories-sizes',
    'maintenance-dash', 'inspection', 'maintenance', 'billing-dash', 'invoicing',
    'tool-revenue-report', 'contract-dash', 'contracts',
  ],
};

export const WRITE_PERMISSIONS: Record<UserRole, NavModule[]> = {
  Admin: [
    'inventory', 'categories-sizes', 'callouts', 'jobs', 'dt', 'rt', 'gatepass',
    'inspection', 'maintenance', 'utilization', 'contracts', 'billing-dash', 'invoicing',
    'subcontractor-rentals', 'monthly-expenses', 'consumables', 'settings', 'data-management',
  ],
  Operations: [
    'inventory', 'categories-sizes', 'callouts', 'jobs', 'dt', 'rt', 'gatepass',
    'inspection', 'maintenance', 'utilization', 'contracts', 'subcontractor-rentals', 'consumables',
  ],
  Handler: [
    'inventory', 'callouts', 'jobs', 'dt', 'rt', 'gatepass', 'utilization',
  ],
  Accounts: [
    'billing-dash', 'invoicing', 'contracts', 'subcontractor-rentals', 'monthly-expenses', 'consumables',
  ],
  QC: ['inspection', 'maintenance'],
  Inspector: ['inspection'],
  Viewer: [],
};

// ─── DROPDOWN CONFIG ──────────────────────────────────────────────────────────
// These are UI dropdown values — not demo data
export const TOOL_SIZES: string[] = [
  '1-7/8"', '1.900"', '2-5/16"', '2-3/8"', '2-13/16"', '2-7/8"', '3-1/8"', '3-1/4"', '3-1/2"', '3-3/4"', '3-7/8"',
  '4"', '4-1/32"', '4-1/8"', '4-1/2"', '4-3/4"', '5"', '5-1/8"', '5-1/4"', '5-1/2"', '5-9/16"', '5-5/8"', '5-3/4"',
  '5-7/8"', '6"', '6-1/16"', '6-1/8"', '6-1/4"', '6-1/2"', '6-5/8"', '6-3/4"', '7"', '7-5/8"', '7-7/8"', '8"',
  '8-1/8"', '8-1/4"', '8-3/8"', '8-1/2"', '8-5/8"', '9"', '9-1/2"', '9-5/8"', '9-7/8"', '10-3/4"', '11"', '11-1/4"',
  '11-1/2"', '11-3/4"', '11-7/8"', '12"', '12-1/8"', '12-1/4"', '12-3/8"', '12-3/4"', '13-3/8"', '13-5/8"', '14-3/4"',
  '14-7/8"', '15"', '15-1/4"', '15-3/4"', '15-7/8"', '16"', '16-3/4"', '17-1/8"', '17-1/4"', '17-3/8"', '17-1/2"',
  '18-1/2"', '18-5/8"', '20"', '20-1/2"', '20-3/4"', '21"', '21-1/4"', '21-3/4"', '21-7/8"', '22"', '25-3/4"',
  '25-7/8"', '26"', '29-1/2"', '30"', '36"', '42"',
];

export const TOOL_CATEGORIES: string[] = [
  '13-5/8" DOUBLE BOP', '13-5/8" DOUBLE VARIABLE RAMS', "13-5/8' BOP - U TYPE", "13-5/8' SINGLE BOP", '2-7/8" DRILLPIPE',
  'AGITATOR', 'AUTO DRILLER', 'AUTO FILL SUB', 'BELL NIPPLE', 'BIT SUB', 'BOP JETTING SUB', 'BOWL', 'BULL NOSE',
  'CASING BRUSH (HEAVY DUTY)', 'CASING CUTTER', 'CASING SCRAPPER (ROTATING)', 'CROSSOVER', 'DITCH MAGNET', 'DIVERTER',
  'DRILL COLLAR', 'DRILL COLLAR - SHORT', 'DRILLPIPE', 'FLOAT SUB', 'FLOAT VALVE', 'HOLE OPENER', 'HWDP',
  'HYD DRILLING JAR', 'HYD-MECH DRILLING JAR', 'JUNK MILL', 'JUNK SUB', 'NEAR BIT STAB', 'NMDC - FLEX', 'NMDC - PONY',
  'NMDC - SHORT', 'NMDC - SLICK', 'OVERSHOT-FS', 'POLYVOLVE', 'PONY COLLAR', 'REAMEAR STABILIZER - BI DIR',
  'REAMEAR STABILIZER - UNI DIR', 'RISER - 10FT', 'RISER - 15FT', 'RISER - 20FT', 'RISER - 3FT', 'RISER - 4FT', 'RISER - 5FT',
  'ROLLER REAMER', 'SAFETY JOINT', 'SHOCK TOOL', 'SHORT DC', 'SPIRAL HWDP', 'STRING MAGNET', 'STRING STAB',
  'STRING STAB - 7.5/8"', 'STRING STAB - NON MAG', 'TAPER MILL', 'TUBING', 'WASHPIPE',
];

// ─── EMPTY INITIAL STATES ─────────────────────────────────────────────────────
// All operational data comes from Azure SQL. These are empty so the app starts
// clean and loads real data on login instead of showing demo records.

export const INITIAL_INVENTORY: ToolItem[] = [];
export const INITIAL_CALLOUTS: Callout[] = [];
export const INITIAL_JOBS: DrillingJob[] = [];
export const INITIAL_SUBMITTED_INVOICES: Record<string, SubmittedInvoiceRecord[]> = {};
export const INITIAL_DT_BATCHES: DTBatch[] = [];
export const INITIAL_RT_BATCHES: RTBatch[] = [];
export const INITIAL_INSPECTIONS: InspectionRecord[] = [];
export const INITIAL_MAINTENANCE: MaintenanceRecord[] = [];
export const INITIAL_GATE_PASSES: GatePass[] = [];
export const INITIAL_CONTRACTS: ContractRecord[] = [];
export const INITIAL_LOGS: MovementLog[] = [];
