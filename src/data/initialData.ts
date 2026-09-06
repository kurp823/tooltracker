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

export const MODULE_PERMISSIONS: Record<UserRole, NavModule[]> = {
  Admin: [
    'dashboard',
    'callouts',
    'jobs',
    'dt',
    'rt',
    'gatepass',
    'utilization',
    'inventory-dash',
    'inventory',
    'maintenance-dash',
    'inspection',
    'maintenance',
    'billing-dash',
    'contracts',
    'settings',
  ],
  Operations: [
    'dashboard',
    'callouts',
    'jobs',
    'dt',
    'rt',
    'gatepass',
    'utilization',
    'inventory-dash',
    'inventory',
    'maintenance-dash',
    'inspection',
    'maintenance',
    'billing-dash',
    'contracts',
  ],
  Handler: [
    'dashboard',
    'callouts',
    'jobs',
    'dt',
    'rt',
    'gatepass',
    'utilization',
    'inventory-dash',
    'inventory',
    'maintenance-dash',
    'inspection',
    'maintenance',
    'contracts',
  ],
  QC: ['dashboard', 'inventory-dash', 'inventory', 'maintenance-dash', 'inspection', 'maintenance'],
  Inspector: ['dashboard', 'inventory-dash', 'inventory', 'maintenance-dash', 'inspection'],
  Accounts: ['dashboard', 'billing-dash', 'inventory-dash', 'inventory', 'utilization', 'contracts'],
  Viewer: ['dashboard', 'inventory-dash', 'inventory', 'jobs', 'dt', 'rt', 'utilization', 'contracts'],
};

export const WRITE_PERMISSIONS: Record<UserRole, NavModule[]> = {
  Admin: ['inventory', 'callouts', 'jobs', 'dt', 'rt', 'gatepass', 'inspection', 'maintenance', 'utilization', 'contracts', 'settings'],
  Operations: ['inventory', 'callouts', 'jobs', 'dt', 'rt', 'gatepass', 'inspection', 'maintenance', 'utilization', 'contracts'],
  Handler: ['inventory', 'callouts', 'jobs', 'dt', 'rt', 'gatepass', 'utilization'],
  QC: ['inspection', 'maintenance'],
  Inspector: ['inspection'],
  Accounts: ['contracts', 'billing-dash'],
  Viewer: [],
};

export const TOOL_SIZES: string[] = [
  '1-7/8"', '1.900"', '2-5/16"', '2-3/8"', '2-13/16"', '2-7/8"', '3-1/8"', '3-1/4"', '3-1/2"', '3-3/4"', '3-7/8"',
  '4"', '4-1/32"', '4-1/8"', '4-1/2"', '4-3/4"', '5"', '5-1/8"', '5-1/4"', '5-1/2"', '5-9/16"', '5-5/8"', '5-3/4"',
  '5-7/8"', '6"', '6-1/16"', '6-1/8"', '6-1/4"', '6-1/2"', '6-5/8"', '6-3/4"', '7"', '7-5/8"', '7-7/8"', '8"',
  '8-1/8"', '8-1/4"', '8-3/8"', '8-1/2"', '8-5/8"', '9"', '9-1/2"', '9-5/8"', '9-7/8"', '10-3/4"', '11"', '11-1/4"',
  '11-1/2"', '11-3/4"', '11-7/8"', '12"', '12-1/8"', '12-1/4"', '12-3/8"', '12-3/4"', '13-3/8"', '13-5/8"', '14-3/4"',
  '14-7/8"', '15"', '15-1/4"', '15-3/4"', '15-7/8"', '16"', '16-3/4"', '17-1/8"', '17-1/4"', '17-3/8"', '17-1/2"',
  '18-1/2"', '18-5/8"', '20"', '20-1/2"', '20-3/4"', '21"', '21-1/4"', '21-3/4"', '21-7/8"', '22"', '25-3/4"',
  '25-7/8"', '26"', '29-1/2"', '30"', '36"', '42"'
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
  'STRING STAB - 7.5/8"', 'STRING STAB - NON MAG', 'TAPER MILL', 'TUBING', 'WASHPIPE'
];

export const INITIAL_INVENTORY: ToolItem[] = [
  { id: '351', serial: '351', assetNo: '351', size: '9-1/2"', shortDesc: 'SHOCK TOOL', desc: '9 1/2" Shock tool w/ 7-5/8" Reg Pin x Box ST950-00.000', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'MOTORMAX', isEmdad: false, supplier: 'MOTORMAX', addedDate: '2024-01-01' },
  { id: '355', serial: '355', assetNo: '355', size: '8"', shortDesc: 'HYD-MECH DRILLING JAR', desc: '8" Double acting Hydro-Mech drilling jar w/ 6-5/8" Reg Pin Box JAR203-HM', qty: 1, location: 'On Rig', status: 'On Rig', rig: 'ND-11', well: 'BU-324', contract: 'ADNOC Onshore', currentJobId: 'JOB-26-00001', ownership: 'MOTORMAX', isEmdad: false, supplier: 'MOTORMAX', addedDate: '2024-01-01' },
  { id: '356', serial: '356', assetNo: '356', size: '8"', shortDesc: 'HYD-MECH DRILLING JAR', desc: '8" OD DOUBLE ACTING HYDRO-MECHANICAL DRILLING JAR C/W 6-5/8" REG PIN x BOX', qty: 1, location: 'Returned to Supplier', status: 'Removed', ownership: 'MOTORMAX', isEmdad: false, supplier: 'MOTORMAX', addedDate: '2024-01-01' },
  { id: '360', serial: '360', assetNo: '360', size: '6-3/4"', shortDesc: 'HYD DRILLING JAR', desc: '6-3/4" OD DOUBLE ACTING HYDRAULIC DRILLING JAR C/W 4-1/2" IF PIN x BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'MOTORMAX', isEmdad: false, supplier: 'MOTORMAX', addedDate: '2024-01-01' },
  { id: '362', serial: '362', assetNo: '362', size: '4-3/4"', shortDesc: 'HYD DRILLING JAR', desc: '4-3/4" OD DOUBLE ACTING HYDRAULIC DRILLING JAR C/W 3-1/2" IF PIN x BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'MOTORMAX', isEmdad: false, supplier: 'MOTORMAX', addedDate: '2024-01-01' },
  { id: '368', serial: '368', assetNo: '368', size: '4-3/4"', shortDesc: 'HYD-MECH DRILLING JAR', desc: '4-3/4" OD DOUBLE ACTING HYDRO-MECHANICAL DRILLING JAR C/W 3-1/2" IF PIN x BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'MOTORMAX', isEmdad: false, supplier: 'MOTORMAX', addedDate: '2024-01-01' },
  { id: '413', serial: '413', assetNo: '413', size: '8"', shortDesc: 'SHOCK TOOL', desc: '8" Shock tool w/ 6-5/8" Reg Pin x Box ST800-01.00.00', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'MOTORMAX', isEmdad: false, supplier: 'MOTORMAX', addedDate: '2024-01-01' },
  { id: '202069', serial: '202069', assetNo: '202069', size: '8-1/4"', shortDesc: 'NEAR BIT STAB', desc: '8-1/4" NEAR BIT REAMER W/NC46 BOX x NC46 BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EPIS', isEmdad: false, supplier: 'EPIS', addedDate: '2024-01-01' },
  { id: '207A99', serial: '207A99', assetNo: '207A99', size: '15"', shortDesc: 'STRING STAB', desc: '15" OD STRING STABILIZER C/W 7-5/8" REG PIN x BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EPIS', isEmdad: false, supplier: 'EPIS', addedDate: '2024-01-01' },
  { id: '26244-2', serial: '26244-2', assetNo: '26244-2', size: '25-3/4"', shortDesc: 'STRING STAB', desc: '25-3/4" OD STRING STABILIZER C/W 7-5/8" REG PIN x BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'ELITE', isEmdad: false, supplier: 'ELITE', addedDate: '2024-01-01' },
  { id: '26244-4/TS-0852', serial: '26244-4/TS-0852', assetNo: '26244-4/TS-0852', size: '22"', shortDesc: 'NEAR BIT STAB', desc: '22" NEAR BIT STABILIZER, 7-5/8" REG P x B', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'ELITE', isEmdad: false, supplier: 'ELITE', addedDate: '2024-01-01' },
  { id: 'BFS1811', serial: 'BFS1811', assetNo: 'BFS1811', size: '26"', shortDesc: 'STRING STAB', desc: '26" STRING STABILIZER C/W 7-5/8" REG PIN x 7-5/8" REG BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EPIS', isEmdad: false, supplier: 'EPIS', addedDate: '2024-01-01' },
  { id: 'CP 170505-1', serial: 'CP 170505-1', assetNo: 'CP 170505-1', size: '29-1/2"', shortDesc: 'DIVERTER', desc: '29-1/2" DIVERTER 500 PSI', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'FLOW TOOLS', isEmdad: false, supplier: 'FLOW TOOLS', addedDate: '2024-01-01' },
  { id: 'EMD-1125', serial: 'EMD-1125', assetNo: 'DJ650-003', size: '6-1/2"', shortDesc: 'HYD DRILLING JAR', desc: '6-1/2" OD DRILLING JAR ASSY (HQ650), XT-50 PIN x BOX CONNECTIONS', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1126', serial: 'EMD-1126', assetNo: 'DJ650-004', size: '6-1/2"', shortDesc: 'HYD DRILLING JAR', desc: '6-1/2" DRILLING JAR (HQ650) W/ 4-1/2" IF PIN X BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'DSI950400NM011', serial: 'DSI950400NM011', assetNo: 'DSI950400NM011', size: '9-1/2"', shortDesc: 'NMDC - SLICK', desc: '9-1/2" OD NON-MAG DRILL COLLAR W/ 4" ID C/W 7-5/8" REG BOX x 7-5/8" REG PIN', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'DSI', isEmdad: false, supplier: 'DSI', addedDate: '2024-01-01' },
  { id: 'EMD-1128', serial: 'EMD-1128', assetNo: 'EMD2950-1', size: '29-1/2"', shortDesc: 'DIVERTER', desc: '29.1/2" 500 PSI DIVERTER STUDDED TOP FLANGE BOTTOM', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1129', serial: 'EMD-1129', assetNo: 'EMD30-01', size: '30"', shortDesc: 'DIVERTER', desc: '30" 1K ANNULAR BOP HYDRIL, STUDDED TOP AND FLANGE BOTTOM', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1131', serial: 'EMD-1131', assetNo: 'FS434-001', size: '4-3/4"', shortDesc: 'FLOAT SUB', desc: '4-3/4" FLOAT SUB W/ NON PORTED FLOAT VALVE C/W 3-1/2" IF PIN X BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1132', serial: 'EMD-1132', assetNo: 'FS434-002', size: '4-3/4"', shortDesc: 'FLOAT SUB', desc: '4-3/4" FLOAT SUB W/ 3-1/2" IF PIN X BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1161', serial: 'EMD-1161', assetNo: 'FS634-001', size: '6-3/4"', shortDesc: 'FLOAT SUB', desc: '6-3/4" FLOAT SUB W/ 4-1/2" IF PIN X BOX', qty: 1, location: 'On Rig', status: 'On Rig', rig: 'ND-11', well: 'BU-324', contract: 'ADNOC Onshore', currentJobId: 'JOB-26-00001', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1163', serial: 'EMD-1163', assetNo: 'FS634-003', size: '6-3/4"', shortDesc: 'FLOAT SUB', desc: '6-3/4" FLOAT SUB PLUNGER TYPE W/NON-PORTED VALVE C/W 4-1/2" IF PIN x BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1198', serial: 'EMD-1198', assetNo: 'FS8-001', size: '8"', shortDesc: 'FLOAT SUB', desc: '8" OD FLOAT SUB W/ PLUNGER TYPE NON-PORTED VALVE C/W 6-5/8" REG PIN X BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1209', serial: 'EMD-1209', assetNo: 'FS912-001', size: '9-1/2"', shortDesc: 'FLOAT SUB', desc: '9-1/2" OD FLOAT SUB W/PLUNGER TYPE NON-PORTED VALVE C/W 7-5/8" REG PIN x BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'FT0013', serial: 'FT0013', assetNo: 'FT0013', size: '21-1/4"', shortDesc: 'RISER - 4FT', desc: 'MARINE RISER / SPACER SPOOL - 21-1/4" 2K - 4FT LONG', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'FLOW TOOLS', isEmdad: false, supplier: 'FLOW TOOLS', addedDate: '2024-01-01' },
  { id: 'FT0226', serial: 'FT0226', assetNo: 'FT0226', size: '21-1/4"', shortDesc: 'BELL NIPPLE', desc: 'Bell Nipple, 21-1/4" 2000 PSI Flange Welded Pipe OD 24" x ID 22-3/4" - 15FT', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'FLOW TOOLS', isEmdad: false, supplier: 'FLOW TOOLS', addedDate: '2024-01-01' },
  { id: 'HVS1012', serial: 'HVS1012', assetNo: 'HVS1012', size: '3-1/2"', shortDesc: 'POLYVOLVE', desc: 'PolyVolve Swivel DS, Size 3-1/2" (5-5/8" OD), XT 39 Box x Pin c/w Safety Clamp', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'HYDROVOLVE', isEmdad: false, supplier: 'HYDROVOLVE', addedDate: '2024-01-01' },
  { id: 'HVS1019', serial: 'HVS1019', assetNo: 'HVS1019', size: '5-7/8"', shortDesc: 'POLYVOLVE', desc: 'PolyVolve Swivel DS, Size 5-7/8" (8" OD), 6-5/8 REG Box x Pin c/w Safety Clamp', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'HYDROVOLVE', isEmdad: false, supplier: 'HYDROVOLVE', addedDate: '2024-01-01' },
  { id: 'EMD-1265', serial: 'EMD-1265', assetNo: 'MR2950-1', size: '29-1/2"', shortDesc: 'RISER - 15FT', desc: 'MARINE RISER / SPACER SPOOL - 29-1/2" 500PSI - 15FT LONG', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1272', serial: 'EMD-1272', assetNo: 'NMDC434-01', size: '4-3/4"', shortDesc: 'NMDC - SLICK', desc: '4-3/4" NMDC, 2-11/16 ID, W/ 3-1/2" IF PIN X BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1274', serial: 'EMD-1274', assetNo: 'NMDC434-03', size: '4-3/4"', shortDesc: 'NMDC - FLEX', desc: '4-3/4" NMDC FLEX (2-11/16"ID) W/ 3-1/2" IF PIN X BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1281', serial: 'EMD-1281', assetNo: 'NMDC634-01', size: '6-3/4"', shortDesc: 'NMDC - SLICK', desc: '6-3/4" NMDC, 2-13/16 ID, W/ 4-1/2" IF PIN X BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1287', serial: 'EMD-1287', assetNo: 'NMDC634-05', size: '6-3/4"', shortDesc: 'NMDC - FLEX', desc: '6-3/4" NON-MAG DRILL COLLAR (FLEX), 2-13/16"ID C/W 4-1/2" IF PIN X BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1293', serial: 'EMD-1293', assetNo: 'NMDC912-01', size: '9-1/2"', shortDesc: 'NMDC - SLICK', desc: '9-1/2" NON-MAGNETIC DRILL COLLAR W/ 4"ID C/W 7-5/8" REG PIN X BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'OSC109707A', serial: 'OSC109707A', assetNo: 'OSC109707A', size: '8"', shortDesc: 'HYD DRILLING JAR', desc: '8" DRILLING JAR C/W 6-5/8" REG PIN X 6-5/8" REG BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'OSC', isEmdad: false, supplier: 'OSC', addedDate: '2024-01-01' },
  { id: 'EMD-1364', serial: 'EMD-1364', assetNo: 'RS1218-001', size: '12-1/8"', shortDesc: 'REAMEAR STABILIZER - BI DIR', desc: '12-1/8" Reamer stabilizer w/ 6-5/8" Reg pin x Box (BI DIRECTIONAL)', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1369', serial: 'EMD-1369', assetNo: 'RS1578-001', size: '15-7/8"', shortDesc: 'REAMEAR STABILIZER - BI DIR', desc: '15-7/8" Reamer stabilizer w/ 7-5/8" Reg Pin x Box (BI DIRECTIONAL)', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1378', serial: 'EMD-1378', assetNo: 'RS838-001', size: '8-3/8"', shortDesc: 'REAMEAR STABILIZER - BI DIR', desc: '8-3/8" Reamer stabilizer w/ 4-1/2" IF Pin x Box (BI DIRECTIONAL)', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1437', serial: 'EMD-1437', assetNo: 'STB12-01', size: '12"', shortDesc: 'STRING STAB', desc: '12" STRING STABILIZER C/W 6-5/8" REG PIN X 6-5/8" REG BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1445', serial: 'EMD-1445', assetNo: 'STB1218-01', size: '12-1/8"', shortDesc: 'STRING STAB', desc: '12-1/8" STRING STABILIZER C/W 6-5/8" REG PIN X 6-5/8" REG BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1453', serial: 'EMD-1453', assetNo: 'STB15-01', size: '15"', shortDesc: 'STRING STAB', desc: '15" STRING STABILIZER C/W 7-5/8" REG PIN x 7-5/8" REG BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1473', serial: 'EMD-1473', assetNo: 'STB1712-01', size: '17-1/2"', shortDesc: 'STRING STAB', desc: '17-1/2" OD STRING STABILIZER C/W 7-5/8" REG PIN x BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1487', serial: 'EMD-1487', assetNo: 'STB21-01', size: '21"', shortDesc: 'STRING STAB', desc: '21" STRING STAB W/ 7 5/8"REG PIN x BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1501', serial: 'EMD-1501', assetNo: 'STB2534-01', size: '25-3/4"', shortDesc: 'STRING STAB', desc: '25-3/4" OD STRING STABILIZER C/W 7-5/8" REG PIN x BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'EMD-1509', serial: 'EMD-1509', assetNo: 'STB-36-001', size: '36"', shortDesc: 'STRING STAB', desc: '36" STRING STABILIZER W/ 7 5/8"REG PIN x BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'EMDAD', isEmdad: true, supplier: 'EMDAD', addedDate: '2024-01-01' },
  { id: 'TRD15283', serial: 'TRD15283', assetNo: 'TRD15283', size: '12-1/8"', shortDesc: 'STRING STAB - NON MAG', desc: '12-1/8" OD NON-MAG STABILIZER C/W 6-5/8" REG PIN X BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'NABORS', isEmdad: false, supplier: 'NABORS', addedDate: '2024-01-01' },
  { id: 'TRD40903', serial: 'TRD40903', assetNo: 'TRD40903', size: '9-1/2"', shortDesc: 'NMDC - SLICK', desc: '9-1/2" OD NON-MAG DRILL COLLAR W/ 4" ID C/W 7-5/8" REG BOX x 7-5/8" REG PIN', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'NABORS', isEmdad: false, supplier: 'NABORS', addedDate: '2024-01-01' },
  { id: 'TRD60981', serial: 'TRD60981', assetNo: 'TRD60981', size: '8-1/4"', shortDesc: 'NMDC - SLICK', desc: '8 1/4" NMDC W/ 6-5/8" REG PIN X BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'NABORS', isEmdad: false, supplier: 'NABORS', addedDate: '2024-01-01' },
  { id: 'TRD61007', serial: 'TRD61007', assetNo: 'TRD61007', size: '4-3/4"', shortDesc: 'NMDC - FLEX', desc: '4-3/4" NMDC FLEX (2-11/16"ID) W/ 3-1/2" IF PIN X BOX', qty: 1, location: 'Emdad Base', status: 'Good', ownership: 'NABORS', isEmdad: false, supplier: 'NABORS', addedDate: '2024-01-01' }
];

export const INITIAL_CALLOUTS: Callout[] = [
  {
    id: 'CAL-26-00001',
    rig: 'ND-11',
    well: 'BU-324',
    client: 'ADNOC Onshore',
    contract: 'ADNOC Onshore',
    poRef: 'PO-ONSHORE-47002',
    status: 'Active',
    createdDate: '2026-08-15',
    items: [
      { seq: 1, size: '8"', shortDesc: 'HYD-MECH DRILLING JAR', qty: 1, assigned: 1, serialNos: ['355'], status: 'Assigned' },
      { seq: 2, size: '6-3/4"', shortDesc: 'FLOAT SUB', qty: 1, assigned: 1, serialNos: ['EMD-1161'], status: 'Assigned' }
    ]
  },
  {
    id: 'CAL-26-00002',
    rig: 'AD-45',
    well: 'GH-0512',
    client: 'ADNOC Drilling',
    contract: 'ADNOC Drilling',
    poRef: 'PO-ADD-88910',
    status: 'Active',
    createdDate: '2026-08-20',
    items: [
      { seq: 1, size: '9-1/2"', shortDesc: 'SHOCK TOOL', qty: 1, assigned: 1, serialNos: ['351'], status: 'Assigned' },
      { seq: 2, size: '12-1/8"', shortDesc: 'STRING STAB', qty: 1, assigned: 0, serialNos: [], status: 'Pending' }
    ]
  }
];

export const INITIAL_JOBS: DrillingJob[] = [
  {
    id: 'JOB-26-00001',
    calloutId: 'CAL-26-00001',
    rig: 'ND-11',
    well: 'BU-324',
    client: 'ADNOC Onshore',
    contract: 'ADNOC Onshore',
    poNumber: '4700023861',
    clientRef: 'ATK-2026-081',
    holeSection: '12-1/4"',
    serviceType: 'Downhole Rental',
    invoicingType: 'PerJob',
    currency: 'USD',
    mobDate: '2026-08-18',
    status: 'Ongoing',
    createdDate: '2026-08-16',
    createdBy: 'Ravi Parapu'
  },
  {
    id: 'JOB-26-00002',
    calloutId: 'CAL-26-00002',
    rig: 'AD-45',
    well: 'GH-0512',
    client: 'ADNOC Drilling',
    contract: 'ADNOC Drilling',
    poNumber: 'PO-ADD-88910',
    clientRef: 'RM-AD45-09',
    holeSection: '8-1/2"',
    serviceType: 'Downhole Rental',
    invoicingType: 'Monthly',
    currency: 'USD',
    mobDate: '2026-08-22',
    status: 'Open',
    createdDate: '2026-08-21',
    createdBy: 'Azim'
  },
  {
    id: 'JOB-26-00003',
    calloutId: 'CAL-26-00002',
    rig: 'AD-45',
    well: 'GH-0512',
    client: 'ADNOC Drilling',
    contract: 'ADNOC Drilling',
    poNumber: 'PO-ADD-88910',
    clientRef: 'RM-AD45-09',
    holeSection: '12-1/4"',
    serviceType: 'Downhole Rental',
    invoicingType: 'Monthly',
    currency: 'AED',
    mobDate: '2026-08-31',
    status: 'Final invoiced',
    firstDtDate: '2026-08-18',
    finalInvoicedDate: '2026-09-01',
    legalInvoiceNumber: 'INV-202608-0042, INV-202609-JOB2600003',
    invoiceAmount: 103400,
    createdDate: '2026-08-25',
    createdBy: 'Azim'
  }
];

export const INITIAL_SUBMITTED_INVOICES: Record<string, SubmittedInvoiceRecord[]> = {
  'JOB-26-00003': [
    {
      invoiceNo: 'INV-202608-0042',
      jobId: 'JOB-26-00003',
      periodYM: '2026-08',
      submittedAt: '2026-08-31',
      subtotal: 36571,
      vatAmount: 1829,
      totalWithVat: 38400,
      status: 'Final',
      notes: 'August 2026 monthly billing cycle'
    },
    {
      invoiceNo: 'INV-202609-JOB2600003',
      jobId: 'JOB-26-00003',
      periodYM: '2026-09',
      submittedAt: '2026-09-01',
      subtotal: 61905,
      vatAmount: 3095,
      totalWithVat: 65000,
      status: 'Final',
      notes: 'September 2026 monthly billing cycle'
    }
  ]
};

export const INITIAL_DT_BATCHES: DTBatch[] = [
  {
    id: 'DTB-1724000001',
    dtNumber: 'DT-26-00001',
    jobId: 'JOB-26-00001',
    rmDate: '2026-08-18',
    rmRef: 'ATK-2026-081',
    dispatchDate: '2026-08-18',
    rig: 'ND-11',
    well: 'BU-324',
    contract: 'ADNOC Onshore',
    dispatchedBy: 'Ravi Parapu',
    recipient: 'Rig Superintendent Ali',
    notes: 'Mobilized with thread protectors and inspected lift subs.',
    isLocked: true,
    lockedBy: 'Ravi Parapu',
    lockedDate: '2026-08-18',
    toolLines: [
      { serial: '355', assetNo: '355', shortDesc: 'HYD-MECH DRILLING JAR', desc: '8" Double acting Hydro-Mech drilling jar w/ 6-5/8" Reg Pin Box JAR203-HM', size: '8"', status: 'OnRig', used: null, ownership: 'MOTORMAX', isEmdad: false },
      { serial: 'EMD-1161', assetNo: 'FS634-001', shortDesc: 'FLOAT SUB', desc: '6-3/4" FLOAT SUB W/ 4-1/2" IF PIN X BOX', size: '6-3/4"', status: 'OnRig', used: null, ownership: 'EMDAD', isEmdad: true }
    ]
  }
];

export const INITIAL_RT_BATCHES: RTBatch[] = [
  {
    id: 'RTB-1724000002',
    rtNumber: 'RT-26-00001',
    jobId: 'JOB-26-00001',
    rtDate: '2026-08-26',
    backloadRmDate: '2026-08-25',
    contract: 'ADNOC Onshore',
    rig: 'ND-11',
    well: 'BU-324',
    receivedBy: 'Nihas',
    toolLines: [
      { serial: 'EMD-1131', assetNo: 'FS434-001', shortDesc: 'FLOAT SUB', used: true, routedTo: 'Inspection Bay', condition: 'Good with normal seal wear', size: '4-3/4"', ownership: 'EMDAD' }
    ]
  }
];

export const INITIAL_INSPECTIONS: InspectionRecord[] = [
  {
    id: 'INS-26-00001',
    woNumber: 'WO-INS-26-00001',
    serial: 'EMD-1131',
    assetNo: 'FS434-001',
    shortDesc: 'FLOAT SUB',
    size: '4-3/4"',
    fromRtId: 'RTB-1724000002',
    rtNumber: 'RT-26-00001',
    receivedDate: '2026-08-26',
    inspector: 'Inspector',
    inspectionDate: null,
    status: 'Pending',
    reportNumber: 'RPT-2026-091',
    disposition: '',
    notes: 'Awaiting MPI and dimensional seal check.'
  }
];

export const INITIAL_MAINTENANCE: MaintenanceRecord[] = [
  {
    id: 'MNT-26-00001',
    woNumber: 'WO-MNT-26-00001',
    serial: '360',
    assetNo: '360',
    shortDesc: 'HYD DRILLING JAR',
    size: '6-3/4"',
    fromInspectionId: null,
    issue: 'Mandrel wash pipe redress required',
    type: 'InHouse',
    vendor: '',
    assignedTo: 'Nihas',
    startDate: '2026-08-22',
    estCompleteDate: '2026-09-02',
    completedDate: null,
    status: 'In Progress',
    cost: 450,
    notes: 'Replaced seals and pressure tested to 5,000 psi.'
  }
];

export const INITIAL_GATE_PASSES: GatePass[] = [
  {
    id: 'GP-26-00001',
    gpNumber: 'GP-26-00001',
    supplier: 'MOTORMAX',
    gpDate: '2026-08-10',
    preparedBy: 'Ravi Parapu',
    authorizedBy: 'Ravi Parapu',
    notes: 'Routine return of standby jars after drilling campaign completion.',
    toolLines: [
      { serial: '356', assetNo: '356', shortDesc: 'HYD-MECH DRILLING JAR', size: '8"', qty: 1, condition: 'Good' }
    ]
  }
];

export const INITIAL_CONTRACTS: ContractRecord[] = [
  {
    id: 'CON-01',
    client: 'ADNOC Onshore',
    contractRef: '4700023861',
    poNumber: 'PO-ONSHORE-47002',
    currency: 'USD',
    status: 'Active',
    contractValue: 2500000.0,
    startDate: '2025-01-01',
    endDate: '2027-12-31',
    pbgNumber: 'PBG-ADCB-99481',
    pbgValue: 250000.0,
    pbgIssueDate: '2025-01-05',
    pbgExpiryDate: '2026-10-15',
    invoicedToDate: 840000.0,
    notes: 'Master agreement for drilling tools rental across all onshore fields.'
  },
  {
    id: 'CON-02',
    client: 'ADNOC Drilling',
    contractRef: '4600019230',
    poNumber: 'PO-ADD-88910',
    currency: 'USD',
    status: 'Active',
    contractValue: 1800000.0,
    startDate: '2025-06-01',
    endDate: '2027-05-31',
    pbgNumber: 'PBG-FAB-77123',
    pbgValue: 180000.0,
    pbgIssueDate: '2025-06-01',
    pbgExpiryDate: '2026-09-20',
    invoicedToDate: 420000.0,
    notes: 'High pressure diverter and shock tool rental package.'
  }
];

export const INITIAL_LOGS: MovementLog[] = [
  { id: 1, serial: '355', action: 'DT Dispatch', from: 'Emdad Base', to: 'On Rig', ref: 'DT-26-00001', date: '2026-08-18', by: 'Ravi Parapu' },
  { id: 2, serial: 'EMD-1161', action: 'DT Dispatch', from: 'Emdad Base', to: 'On Rig', ref: 'DT-26-00001', date: '2026-08-18', by: 'Ravi Parapu' },
  { id: 3, serial: 'EMD-1131', action: 'RT Return', from: 'On Rig', to: 'Inspection Bay', ref: 'RT-26-00001', date: '2026-08-26', by: 'Nihas' }
];
