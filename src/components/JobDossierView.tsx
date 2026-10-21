import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  DrillingJob,
  DTBatch,
  RTBatch,
  Callout,
  CalloutItem,
  ToolItem,
  User,
  ContractRecord,
  JobCrewMember,
  DailyFieldLog,
  InspectionRecord,
  JobToolSubRentalCost,
  SubDivision,
} from '../types';
import { saveCustomJob } from '../services/customJobs';
import { saveCustomCallout } from '../services/customCallouts';
import { resolveContractSubDivision } from '../services/customContracts';
import { saveJobToolHoleSectionApi, extractToolType, saveDailyFieldLogsApi, fetchDailyFieldLogsApi } from '../services/api';
import {
  getContractRateOptionsForTool,
  findBestMatchingOption,
  isAdnocDrillingRentalContract,
  ToolHoleSectionOption,
} from '../services/contractRateResolver';
import { EMDAD_LOGO_BASE64, EmdadLogo } from '../constants/branding';
import { useModulePermission, ReadOnlyBanner } from '../services/permissionService';
import { isLegalInvoiceNumber } from '../jobLifecycle';
import {
  generateDeliveryTicketHtml,
  generateDispatchChecklistHtml,
  generateReceivingTicketHtml,
  openPrintWindow,
  DeliveryTicketPrintData,
  DispatchChecklistPrintData,
  ReceivingTicketPrintData,
} from '../services/ticketPrintService';
import {
  useResizableColumns,
  ResizerHandle,
  useCustomColumns,
} from '../services/customColumnService';
import { DropdownListKey, getDropdownOptions } from '../services/dropdownService';
import { AdminDropdownModal } from './AdminDropdownModal';
import { Settings as SettingsIcon } from 'lucide-react';
import {
  loadCrewPersonnel,
  addCrewPersonnel,
  updateCrewPersonnel,
  deleteCrewPersonnel,
} from '../services/crewPersonnelService';
import { DTFooterSection } from './DTFooterSection';
import {
  CalloutHeaderForm,
  RTHeaderForm,
  ChecklistRowInputCells,
  DTToolLineInputCells,
} from './JobDossierFormParts';

interface JobDossierViewProps {
  job: DrillingJob;
  user?: User | null;
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  callouts: Callout[];
  inventory: ToolItem[];
  contracts?: ContractRecord[];
  inspections?: InspectionRecord[];
  customCategories?: string[];
  customSizes?: string[];
  // These return void | Promise<void> because the parent's save handlers now
  // genuinely await the Azure SQL write before resolving — callers here that
  // `await` them get a real "saving finished" signal for spinners, not just
  // the instant the optimistic local state update happens.
  onSaveJob: (job: DrillingJob) => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
  onSaveDTBatch: (batch: DTBatch) => void | Promise<void>;
  onUpdateDTBatch?: (batch: DTBatch, addedTools?: ToolItem[], removedTools?: ToolItem[]) => void | Promise<void>;
  onDeleteDTBatch?: (dtNumber: string) => void;
  onSaveRTBatch: (batch: RTBatch) => void | Promise<void>;
  onUpdateRTBatch?: (batch: RTBatch) => void | Promise<void>;
  onSaveCallout?: (callout: Callout) => void | Promise<void>;
  onBackToRegister?: () => void;
  onNavigateToInvoicing?: (jobId: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type DossierTabKey =
  | 'job-header'
  | 'technical-details'
  | 'manpower'
  | 'checklist'
  | 'delivery-tickets'
  | 'return-tickets'
  | 'utilization';

// Strict Date Formatter (DD-MM-YYYY)
export const formatDateDD_MM_YYYY = (val?: string | Date | number | null): string => {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'number' || (typeof val === 'string' && /^\d{5}$/.test(val.trim()))) {
    const num = typeof val === 'number' ? val : parseInt(val.trim(), 10);
    if (num >= 25000 && num <= 65000) {
      try {
        const d = new Date(Math.round((num - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) {
          const year = d.getUTCFullYear();
          if (year <= 1900 || year === 1970) return '—';
          const day = String(d.getUTCDate()).padStart(2, '0');
          const month = String(d.getUTCMonth() + 1).padStart(2, '0');
          return `${day}-${month}-${year}`;
        }
      } catch {}
    }
  }
  const str = String(val).trim();
  if (!str || str === '—' || str === '-' || str === 'null' || str === 'undefined' || str.includes('1900')) return '—';

  // If already DD-MM-YYYY (numbers)
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const parts = str.split('-');
    if (parseInt(parts[2], 10) <= 1900 || parts[2] === '1970') return '—';
    return str;
  }

  // If DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const parts = str.split('/');
    if (parseInt(parts[2], 10) <= 1900 || parts[2] === '1970') return '—';
    return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
  }

  // If DD/MM/YY
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(str)) {
    const parts = str.split('/');
    const yr = parseInt(parts[2], 10) > 50 ? `19${parts[2]}` : `20${parts[2]}`;
    if (parseInt(yr, 10) <= 1900 || yr === '1970') return '—';
    return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${yr}`;
  }

  // If YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    if (parseInt(isoMatch[1], 10) <= 1900 || isoMatch[1] === '1970') return '—';
    return `${isoMatch[3].padStart(2, '0')}-${isoMatch[2].padStart(2, '0')}-${isoMatch[1]}`;
  }

  // If DD-MMM-YY or DD-MMM-YYYY (e.g. 25-Aug-23)
  const mmmMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (mmmMatch) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const mNum = months[mmmMatch[2].toLowerCase()] || '01';
    let yr = mmmMatch[3];
    if (yr.length === 2) {
      yr = parseInt(yr, 10) > 50 ? `19${yr}` : `20${yr}`;
    }
    if (parseInt(yr, 10) <= 1900 || yr === '1970') return '—';
    return `${mmmMatch[1].padStart(2, '0')}-${mNum}-${yr}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    if (year <= 1900 || year === 1970) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}-${month}-${year}`;
  }
  return str;
};

// Helper to extract the first non-empty, non-placeholder date from a list of candidates
export const getValidDateString = (...candidates: any[]): string => {
  for (const c of candidates) {
    if (!c) continue;
    const s = String(c).trim();
    if (!s || s === '—' || s === '-' || s === 'null' || s === 'undefined' || s.includes('1900') || s === '1970-01-01') continue;
    return s;
  }
  return '';
};

// Converts any date representation to YYYY-MM-DD for HTML5 date input fields
export const toInputDateFormat = (val?: string | Date | null): string => {
  if (!val || val === '—' || val === '-') return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  const mmmMatch = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (mmmMatch) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const mNum = months[mmmMatch[2].toLowerCase()] || '01';
    let yr = mmmMatch[3];
    if (yr.length === 2) {
      yr = parseInt(yr, 10) > 50 ? `19${yr}` : `20${yr}`;
    }
    return `${yr}-${mNum}-${mmmMatch[1].padStart(2, '0')}`;
  }
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1900) {
      return d.toISOString().split('T')[0];
    }
  } catch {}
  return '';
};

// Parse flexible dates into milliseconds timestamp for range comparisons
const parseDateToMs = (val?: string | Date | null): number => {
  if (!val) return 0;
  const str = String(val).trim();
  if (!str || str === '—' || str === '-') return 0;

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    return new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10)).getTime();
  }

  // DD-MMM-YY or DD-MMM-YYYY
  const mmmMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (mmmMatch) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const m = months[mmmMatch[2].toLowerCase()] ?? 0;
    let yr = parseInt(mmmMatch[3], 10);
    if (yr < 100) yr = yr > 50 ? 1900 + yr : 2000 + yr;
    return new Date(yr, m, parseInt(mmmMatch[1], 10)).getTime();
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Company roster of certified field engineers & supervisors
const MASTER_PERSONNEL_ROSTER: Omit<JobCrewMember, 'operatingDays' | 'standbyDays' | 'totalChargeUSD'>[] = [
  {
    id: 'ENG-01',
    badgeNo: 'EMD-4102',
    name: 'Ahmed Al-Mansoor',
    designation: 'Lead Fishing Engineer',
    mobDate: '15-05-2023',
    demobDate: '28-05-2023',
    dailyRateUSD: 850,
    rigPassNo: 'RP-88421',
    h2sExpiry: '12-12-2025',
    status: 'Mobilized (On Rig)',
    contactNo: '+971501122334',
  },
  {
    id: 'ENG-02',
    badgeNo: 'EMD-3841',
    name: 'Rajesh Sharma',
    designation: 'Whipstock Specialist',
    mobDate: '18-05-2023',
    demobDate: '26-05-2023',
    dailyRateUSD: 750,
    rigPassNo: 'RP-90112',
    h2sExpiry: '15-01-2026',
    status: 'Mobilized (On Rig)',
    contactNo: '+971502233445',
  },
  {
    id: 'ENG-03',
    badgeNo: 'EMD-5012',
    name: 'Mohamed Tariq',
    designation: 'Field Tool Supervisor',
    mobDate: '15-05-2023',
    demobDate: undefined,
    dailyRateUSD: 700,
    rigPassNo: 'RP-77231',
    h2sExpiry: '20-11-2025',
    status: 'Mobilized (On Rig)',
    contactNo: '+971503344556',
  },
  {
    id: 'ENG-04',
    badgeNo: 'EMD-2914',
    name: 'David Miller',
    designation: 'Senior Downhole Rental Tech',
    mobDate: '16-05-2023',
    demobDate: undefined,
    dailyRateUSD: 650,
    rigPassNo: 'RP-65492',
    h2sExpiry: '05-05-2026',
    status: 'Standby',
    contactNo: '+971504455667',
  },
  {
    id: 'ENG-05',
    badgeNo: 'EMD-4890',
    name: 'Sultan Al-Zaabi',
    designation: 'Directional & Milling Engineer',
    mobDate: '17-05-2023',
    demobDate: '27-05-2023',
    dailyRateUSD: 800,
    rigPassNo: 'RP-99120',
    h2sExpiry: '18-08-2025',
    status: 'Standby',
    contactNo: '+971505566778',
  },
  {
    id: 'ENG-06',
    badgeNo: 'EMD-3301',
    name: 'Johnathan Vance',
    designation: 'Lead BHA Specialist',
    mobDate: '15-05-2023',
    demobDate: undefined,
    dailyRateUSD: 850,
    rigPassNo: 'RP-54129',
    h2sExpiry: '30-10-2026',
    status: 'Mobilized (On Rig)',
    contactNo: '+971506677889',
  },
  {
    id: 'ENG-07',
    badgeNo: 'EMD-5120',
    name: 'Khaled Bin Rashid',
    designation: 'Rig Tool Coordinator',
    mobDate: '15-05-2023',
    demobDate: '28-05-2023',
    dailyRateUSD: 600,
    rigPassNo: 'RP-71203',
    h2sExpiry: '14-07-2025',
    status: 'Demobilized',
    contactNo: '+971507788990',
  },
];

export const getCleanAssetNo = (...candidates: (string | undefined | null)[]): string => {
  for (const c of candidates) {
    if (!c) continue;
    const str = String(c).trim();
    if (str && !str.toUpperCase().startsWith('EMD-') && str !== '—' && str !== '-') {
      return str;
    }
  }
  for (const c of candidates) {
    if (!c) continue;
    const str = String(c).trim();
    if (str && str !== '—' && str !== '-') return str;
  }
  return '—';
};

export const JobDossierView: React.FC<JobDossierViewProps> = ({
  job: initialJob,
  user,
  jobs,
  dtBatches,
  rtBatches,
  callouts,
  inventory,
  contracts = [],
  inspections = [],
  onSaveJob,
  onRefresh,
  onSaveDTBatch,
  onUpdateDTBatch,
  onDeleteDTBatch,
  onSaveRTBatch,
  onUpdateRTBatch,
  onSaveCallout,
  onBackToRegister,
  onNavigateToInvoicing,
  showToast,
  customCategories: propCustomCategories,
  customSizes: propCustomSizes,
}) => {
  // Current active top tab
  const [activeTab, setActiveTab] = useState<DossierTabKey>('job-header');

  // Technical Details sub-tab
  const [techSubTab, setTechSubTab] = useState<'fishing' | 'whipstock' | 'rentals'>('fishing');

  // Helper to normalize job numbers for robust live SQL data matching (e.g. Job-026-01737 <-> Job-26-01737)
  const normalizeJobKey = (val?: string | null) => {
    if (!val) return '';
    return val
      .trim()
      .toUpperCase()
      .replace(/^(JOB|CAL|DT|RT)[-_]?/i, '')
      .replace(/^0+/, '')
      .replace(/-0+/, '-');
  };

  // Dynamic Dropdowns from dropdownService
  const [adminModalKey, setAdminModalKey] = useState<DropdownListKey | null>(null);
  const [serviceCategoriesList, setServiceCategoriesList] = useState<string[]>(() => getDropdownOptions('jobServiceCategories'));
  const [subDivisionsList, setSubDivisionsList] = useState<string[]>(() => getDropdownOptions('subDivisions'));

  useEffect(() => {
    const handleUpdate = () => {
      setServiceCategoriesList(getDropdownOptions('jobServiceCategories'));
      setSubDivisionsList(getDropdownOptions('subDivisions'));
    };
    window.addEventListener('dropdown_options_updated', handleUpdate);
    return () => window.removeEventListener('dropdown_options_updated', handleUpdate);
  }, []);

  // Job Header state — reads directly from the server record, no localStorage shadow copy.
  const [jobData, setJobData] = useState<DrillingJob>(() => ({ ...initialJob, notes: initialJob?.notes || '' }));

  useEffect(() => {
    setJobData((prev) => {
      const jId = initialJob?.id || (initialJob as any)?.jobNumber || '';
      let notesToKeep = initialJob?.notes || '';
      // If server returned empty notes, preserve the user's in-flight typed notes
      // (a re-render racing an unsaved edit) — never a localStorage draft.
      if (!notesToKeep && prev && (prev.id === jId || normalizeJobKey(prev.id) === normalizeJobKey(jId)) && prev.notes) {
        notesToKeep = prev.notes;
      }
      return {
        ...initialJob,
        notes: notesToKeep,
      };
    });
  }, [initialJob]);

  // Auto-sync with Azure SQL the moment a job file is opened.
  // Fixes jobs that show correct tool counts / "Ongoing" status in the register
  // (a server-side aggregate) but whose Checklist / Delivery Ticket tabs render
  // empty here, because the in-memory jobs/dtBatches/rtBatches/callouts arrays
  // this component was mounted with were fetched before this job's records were
  // created or last updated. Runs once per job id, not on every re-render.
  const autoRefreshedJobIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    const jId = initialJob?.id || (initialJob as any)?.jobNumber || '';
    if (!jId || !onRefresh) return;
    if (autoRefreshedJobIdRef.current === jId) return;
    autoRefreshedJobIdRef.current = jId;
    Promise.resolve(onRefresh()).catch(() => {});
  }, [initialJob?.id, onRefresh]);

  // LOCKED STATE RULE: Only authentic legal invoices (FSH, FR, WHP, INV, CN, DN) or closed state lock a job.
  // Draft invoices, internal ERP numbers, and active operational stages (SES, In Progress) NEVER lock the job.
  const isJobInvoicedOrSubmitted = useMemo(() => {
    const legal = String(jobData?.legalInvoiceNumber || '').trim();
    if (isLegalInvoiceNumber(legal)) return true;
    if (jobData?.invoiceNumber && isLegalInvoiceNumber(jobData.invoiceNumber)) return true;
    const stage = String(jobData?.status || '').toLowerCase().trim();
    return stage === 'closed' || stage === 'final invoiced';
  }, [jobData?.legalInvoiceNumber, jobData?.invoiceNumber, jobData?.status]);

  const { canEdit: canEditJobs, isReadOnly } = useModulePermission(user, 'jobs');
  const { canEdit: canEditDT } = useModulePermission(user, 'dt');
  const isAdmin = user?.role === 'Admin';
  const isJobInvoicedOrFinished = Boolean(isJobInvoicedOrSubmitted);

  // Admin Re-open override state (strictly available only to Admin users)
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenJustification, setReopenJustification] = useState('');

  // When Admin unlocks with justification, the entire Job Dossier across ALL tabs is completely unlocked for editing & correction
  const isClosedOrInvoiced = isJobInvoicedOrFinished && !adminUnlocked;
  const isJobLocked = isClosedOrInvoiced;
  const isLocked = (!canEditJobs && !isAdmin) || isJobLocked;
  // Delivery ticket editing permission: requires jobs or dt editing rights, and unlocked status
  const canUserEditDT = (canEditJobs || canEditDT || isAdmin) && !isClosedOrInvoiced;

  // Resizable columns & custom columns for Checklist table
  const checklistCustomCols = useCustomColumns('dossier_checklist');
  const checklistResizer = useResizableColumns('dossier_checklist_grid', {
    select: 40,
    itemNo: 50,
    partNo: 140,
    description: 280,
    qty: 60,
    supplier: 110,
    qtyIn: 60,
    insNum: 140,
    insDate: 105,
    comments: 110,
    cat: 120,
    status: 140,
    actions: 75,
  });

  // Resizable columns & custom columns for itemsselect tool picker
  const toolPickerCustomCols = useCustomColumns('dossier_itemsselect');
  const toolPickerResizer = useResizableColumns('dossier_itemsselect_grid', {
    select: 48,
    serial: 140,
    description: 320,
    size: 80,
    qty: 60,
    supplier: 110,
    insDate: 105,
    insNum: 140,
    condition: 100,
  });

  // Resizable columns & custom columns for Manpower / Crew table
  const crewCustomCols = useCustomColumns('dossier_crew');
  const crewResizer = useResizableColumns('dossier_crew_grid', {
    seq: 48,
    badgeNo: 95,
    name: 180,
    designation: 180,
    mobDate: 100,
    demobDate: 100,
    rigPass: 110,
    h2s: 100,
    status: 90,
    action: 60,
  });

  // Resizable columns & custom columns for Daily Field Log (DDR)
  const ddrCustomCols = useCustomColumns('dossier_ddr');
  const ddrResizer = useResizableColumns('dossier_ddr_grid', {
    date: 110,
    status: 100,
    depth: 130,
    activity: 350,
    loggedBy: 140,
    action: 55,
  });

  // Utilization Date Boundary: Rig Backload Date (RT) vs Base Yard Return Date
  const [utilEndDateMode, setUtilEndDateMode] = useState<'BACKLOAD' | 'YARD_RETURN'>('BACKLOAD');

  // Daily Field Log state (Daily Drilling Report / Operational Remarks)
  const [dailyLogs, setDailyLogs] = useState<DailyFieldLog[]>(() => {
    return jobData.dailyLogs || [];
  });
  const [isAddDailyLogOpen, setIsAddDailyLogOpen] = useState(false);
  const [newLogDate, setNewLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [newLogStatus, setNewLogStatus] = useState<'Operational' | 'Standby'>('Operational');
  const [newLogDepth, setNewLogDepth] = useState('');
  const [newLogActivity, setNewLogActivity] = useState('');
  const [newLogEngineer, setNewLogEngineer] = useState(user?.name || 'Field Engineer');

  const handleAddDailyLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogActivity.trim()) {
      showToast('Please enter the daily operations summary.', 'error');
      return;
    }
    const entry: DailyFieldLog = {
      id: `LOG-${Date.now()}`,
      date: newLogDate,
      status: newLogStatus,
      depth: newLogDepth.trim() || undefined,
      activity: newLogActivity.trim(),
      loggedBy: newLogEngineer.trim(),
    };
    const updatedLogs = [entry, ...dailyLogs];
    setDailyLogs(updatedLogs);
    const updatedJob = {
      ...jobData,
      dailyLogs: updatedLogs,
    };
    setJobData(updatedJob);
    onSaveJob(updatedJob);
    setIsAddDailyLogOpen(false);
    setNewLogActivity('');
    setNewLogDepth('');
    showToast(`Daily log for ${formatDateDD_MM_YYYY(newLogDate)} recorded successfully!`, 'success');
  };

  const handleDeleteDailyLog = (logId: string) => {
    if (isClosedOrInvoiced || isLocked) return;
    const updatedLogs = dailyLogs.filter((l) => l.id !== logId);
    setDailyLogs(updatedLogs);
    const updatedJob = {
      ...jobData,
      dailyLogs: updatedLogs,
    };
    setJobData(updatedJob);
    onSaveJob(updatedJob);
    showToast('Daily log entry removed.', 'info');
  };

  // Helper to remove any Performance Bank Guarantee (PBG) notes or values from contract strings
  const cleanContractName = (raw?: string | null) => {
    if (!raw) return '';
    let s = String(raw).trim();
    s = s.replace(/PBG\s*[:\-].*$/i, '');
    s = s.replace(/\(AED\s+[\d,\.]+\s*-\s*OPEN\s+ENDED\)/gi, '');
    s = s.replace(/\(AED\s+[\d,\.]+.*?\)/gi, '');
    s = s.replace(/\.\s*$/, '').trim();
    s = s.replace(/^Contract Description:\s*/i, '');
    return s;
  };

  // Prevent legal invoice number or draft invoice number from ever duplicating as operational ticket number
  const isInvoiceRef = (val?: string | null) => {
    if (!val) return false;
    const v = String(val).trim().toUpperCase();
    const legal = String(jobData?.legalInvoiceNumber || '').trim().toUpperCase();
    const draft = String(jobData?.draftInvoiceNumber || '').trim().toUpperCase();
    const inv = String(jobData?.invoiceNumber || '').trim().toUpperCase();
    if (legal && v === legal) return true;
    if (draft && v === draft) return true;
    if (inv && v === inv) return true;
    if (/^FR-\d+/i.test(v)) return true;
    return false;
  };

  const sanitizeTicketNumber = (val?: string | null) => {
    if (!val || isInvoiceRef(val)) return '';
    return String(val).trim();
  };

  // Dynamic distinct Clients & Contracts pulled from real database records
  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    const curClient = String(jobData?.client || '').trim().toUpperCase();
    if (curClient) set.add(curClient);
    (Array.isArray(jobs) ? jobs : []).forEach((j) => {
      const s = String(j?.client || '').trim().toUpperCase();
      if (s) set.add(s);
    });
    (Array.isArray(contracts) ? contracts : []).forEach((c) => {
      const c1 = String((c as any)?.clientName || '').trim().toUpperCase();
      const c2 = String(c?.client || '').trim().toUpperCase();
      if (c1) set.add(c1);
      if (c2) set.add(c2);
    });
    (Array.isArray(dtBatches) ? dtBatches : []).forEach((d) => {
      const s = String((d as any)?.client || d?.client || '').trim().toUpperCase();
      if (s) set.add(s);
    });
    (Array.isArray(rtBatches) ? rtBatches : []).forEach((r) => {
      const s = String((r as any)?.client || r?.client || '').trim().toUpperCase();
      if (s) set.add(s);
    });
    (Array.isArray(callouts) ? callouts : []).forEach((c) => {
      const s = String(c?.client || '').trim().toUpperCase();
      if (s) set.add(s);
    });
    ['ADNOC ONSHORE', 'ADNOC OFFSHORE', 'ADNOC DRILLING', 'SNOC', 'SCHLUMBERGER', 'BAKER HUGHES', 'HALLIBURTON', 'WEATHERFORD'].forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [jobs, contracts, dtBatches, rtBatches, callouts, jobData?.client]);

  const contractOptions = useMemo(() => {
    const map = new Map<string, string>(); // Name -> Contract No
    const curContract = String(jobData?.contract || '').trim();
    if (curContract) {
      const cleanCurrent = cleanContractName(curContract);
      if (cleanCurrent) map.set(cleanCurrent, String(jobData?.contractNo || ''));
    }
    (Array.isArray(contracts) ? contracts : []).forEach((c) => {
      let name = String(c?.name || c?.shortDesc || (c as any)?.title || (c as any)?.contractName || '');
      name = cleanContractName(name);
      if (!name && c?.description) {
        name = cleanContractName(String(c.description));
      }
      const no = String(c?.contractNo || (c as any)?.contractNumber || '').trim();
      if (!name) name = no;
      if (name) {
        map.set(name, no || map.get(name) || '');
      }
    });
    (Array.isArray(jobs) ? jobs : []).forEach((j) => {
      const cName = String(j?.contract || '').trim();
      if (cName) {
        const clean = cleanContractName(cName);
        if (clean) map.set(clean, String(j?.contractNo || ''));
      }
    });
    (Array.isArray(dtBatches) ? dtBatches : []).forEach((d) => {
      const cName = String(d?.contract || '').trim();
      if (cName) {
        const clean = cleanContractName(cName);
        if (clean) map.set(clean, cName);
      }
    });
    (Array.isArray(callouts) ? callouts : []).forEach((c) => {
      const cName = String(c?.contract || '').trim();
      if (cName) {
        const clean = cleanContractName(cName);
        if (clean) map.set(clean, String(c?.projectNo || ''));
      }
    });
    if (!map.has('ADNOC ONSHORE - RENTALS')) map.set('ADNOC ONSHORE - RENTALS', '4700023861');
    if (!map.has('ADNOC OFFSHORE - RENTALS')) map.set('ADNOC OFFSHORE - RENTALS', '4700015149');
    if (!map.has('SCHEDULE 2 RENTALS')) map.set('SCHEDULE 2 RENTALS', '4700012465');
    return Array.from(map.entries()).map(([name, no]) => ({ name, no }));
  }, [contracts, jobs, dtBatches, callouts, jobData.contract, jobData.contractNo]);

  // Related real data for this specific job from live database
  const jobDTs = useMemo(() => {
    const rawId = String(jobData?.id || jobData?.jobNumber || '').trim().toUpperCase();
    const normId = normalizeJobKey(jobData?.id || jobData?.jobNumber);
    if (!rawId && !normId) return [];

    return (Array.isArray(dtBatches) ? dtBatches : []).filter((b) => {
      if (!b) return false;
      const id = String(b.id || '').toUpperCase();
      const num = String(b.dtNumber || '').toUpperCase();
      if (
        id.startsWith('DT-AUTO') ||
        id.startsWith('DT-CLS') ||
        num.startsWith('DT-CLS') ||
        num.startsWith('DT-AUTO')
      ) {
        return false;
      }
      const bJob = String(b.jobId || (b as any)?.jobNumber || '').trim().toUpperCase();
      const bNorm = normalizeJobKey(b.jobId || (b as any)?.jobNumber);
      if (bJob && rawId && bJob === rawId) return true;
      if (bNorm && normId && bNorm === normId) return true;
      return false;
    });
  }, [dtBatches, jobData]);

  const jobRTs = useMemo(() => {
    const rawId = String(jobData?.id || jobData?.jobNumber || '').trim().toUpperCase();
    const normId = normalizeJobKey(jobData?.id || jobData?.jobNumber);
    if (!rawId && !normId) return [];

    // 1. Collect all explicit RT references from this job's DT lines
    const jobReferencedRTs = new Set<string>();
    jobDTs.forEach((dt) => {
      const dtDate = dt.dispatchDate || dt.rmDate;
      (dt.toolLines || []).forEach((tl: any) => {
        const ref = String(tl?.rtBatchId || tl?.returnedRtNumber || (tl as any)?.rgtNo || '').trim().toUpperCase();
        const retDate = tl?.returnDate || tl?.dateIn || (tl as any)?.Date_In;
        if (ref && ref !== '—' && ref !== '-' && !ref.startsWith('RT-AUTO') && !ref.startsWith('RT-CLS') && (!retDate || !dtDate || retDate >= dtDate)) {
          jobReferencedRTs.add(ref);
        }
      });
    });

    const matched = (Array.isArray(rtBatches) ? rtBatches : []).filter((b) => {
      if (!b) return false;
      const id = String(b.id || '').toUpperCase();
      const num = String(b.rtNumber || '').toUpperCase();
      if (id.startsWith('RT-AUTO') || id.startsWith('RT-CLS') || num.startsWith('RT-CLS') || num.startsWith('RT-AUTO')) {
        return false;
      }
      const bJob = String(b.jobId || (b as any)?.jobNumber || '').trim().toUpperCase();
      const bNorm = normalizeJobKey(b.jobId || (b as any)?.jobNumber);
      const bNum = String(b.rtNumber || b.id || '').trim().toUpperCase();

      if (bJob && rawId && bJob === rawId) return true;
      if (bNorm && normId && bNorm === normId) return true;
      if (bNum && jobReferencedRTs.has(bNum) && (!bJob || bJob === rawId || (bNorm && normId && bNorm === normId))) {
        return true;
      }

      return false;
    });

    // Deduplicate by rtNumber or id
    const seen = new Set<string>();
    return matched.filter((rt) => {
      const key = String(rt?.rtNumber || rt?.id || '').trim().toUpperCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rtBatches, jobData, jobDTs]);

  const jobCallouts = useMemo(() => {
    const rawId = String(jobData?.id || jobData?.jobNumber || '').trim().toUpperCase();
    const normId = normalizeJobKey(jobData?.id || jobData?.jobNumber);
    const calIdFromJob = String(jobData?.calloutId || '').trim().toUpperCase();
    const normCalFromJob = normalizeJobKey(jobData?.calloutId);

    return (Array.isArray(callouts) ? callouts : []).filter((c) => {
      if (!c) return false;
      const cId = String(c.id || (c as any)?.calloutNumber || '').trim().toUpperCase();
      const cNormId = normalizeJobKey(c.id || (c as any)?.calloutNumber);
      const cJob = String(c.jobId || (c as any)?.jobNumber || '').trim().toUpperCase();
      const cNorm = normalizeJobKey(c.jobId || (c as any)?.jobNumber);
      if (rawId && cJob && cJob === rawId) return true;
      if (normId && cNorm && normId === cNorm) return true;
      if (calIdFromJob && (cId === calIdFromJob || cNormId === normCalFromJob)) return true;
      if (normId && cNormId && normId === cNormId) return true;
      return false;
    });
  }, [callouts, jobData]);

  // Equipment dispatch and reconciliation counts
  const totalDispatched = useMemo(() => {
    return jobDTs.reduce((acc, dt) => acc + (dt.toolLines?.length || 0), 0);
  }, [jobDTs]);

  const totalReturned = useMemo(() => {
    let count = 0;
    const returnedSerialsOnJob = new Set<string>();

    jobDTs.forEach((dt) => {
      (dt.toolLines || []).forEach((tl: any) => {
        const isRet = tl.status === 'Returned' || Boolean(tl.rtBatchId || tl.returnedRtNumber);
        if (isRet) {
          const s = (tl.serial || tl.assetNo || '').trim().toUpperCase();
          if (s) returnedSerialsOnJob.add(s);
          else count++;
        }
      });
    });

    if (returnedSerialsOnJob.size > 0) {
      return returnedSerialsOnJob.size + count;
    }

    return jobRTs.reduce((acc, rt) => acc + (rt.toolLines?.length || 0), 0);
  }, [jobDTs, jobRTs]);

  const activeOnRig = useMemo(() => {
    return Math.max(0, totalDispatched - totalReturned);
  }, [totalDispatched, totalReturned]);

  // Automated Checklist Status derived from workflow lifecycle
  const automatedChecklistStatus = useMemo(() => {
    if (isJobInvoicedOrSubmitted || (totalDispatched > 0 && activeOnRig === 0)) {
      return 'Checklist - Closed / Released';
    }
    const anyDispatched = jobDTs.some((d) => d.isLocked);
    if (anyDispatched) {
      return 'Delivery Ticket - Dispatched to Rig';
    }
    if (jobDTs.length > 0) {
      return 'Delivery Ticket - Created';
    }
    return 'Checklist - Opened';
  }, [isJobInvoicedOrSubmitted, totalDispatched, activeOnRig, jobDTs]);

  // All mobilized tools linked to DT and RT
  const allMobilizedTools = useMemo(() => {
    return jobDTs.flatMap((d) =>
      (d.toolLines || []).map((t) => {
        const tSerial = (t.serial || '').trim().toUpperCase();
        const tAsset = (t.assetNo || '').trim().toUpperCase();
        const dtDate = d.dispatchDate || d.rmDate;
        const returnBatch = jobRTs.find((rt) =>
          (rt.toolLines || []).some((rtl) => {
            const rSerial = (rtl.serial || '').trim().toUpperCase();
            const rAsset = (rtl.assetNo || '').trim().toUpperCase();
            return (tSerial && (rSerial === tSerial || rAsset === tSerial)) || (tAsset && (rSerial === tAsset || rAsset === tAsset));
          }) ||
          rt.id === t.rtBatchId ||
          rt.rtNumber === t.rtBatchId
        );
        let candidateDate = null;
        if (returnBatch) {
          if (utilEndDateMode === 'BACKLOAD') {
            candidateDate = returnBatch.backloadRmDate || returnBatch.rtDate || (returnBatch as any).Date_In || (returnBatch as any).dateIn;
          } else {
            candidateDate = returnBatch.rtDate || (returnBatch as any).Date_In || (returnBatch as any).dateIn || returnBatch.backloadRmDate;
          }
        } else {
          candidateDate = (t as any).rtDate || (t as any).returnDate || (t as any).Date_In || (t as any).dateIn || (t.status === 'Returned' ? jobData.demobDate : null);
        }
        
        const isValidDate = candidateDate && (!dtDate || candidateDate >= dtDate);
        const rDate = isValidDate ? candidateDate : (returnBatch ? (utilEndDateMode === 'BACKLOAD' ? (returnBatch.backloadRmDate || returnBatch.rtDate) : returnBatch.rtDate) : null);
        const rNum = returnBatch ? returnBatch.rtNumber : (isValidDate && t.rtBatchId && t.rtBatchId !== '—' ? t.rtBatchId : null);

        return {
          ...t,
          dtNumber: d.dtNumber,
          dispatchDate: d.dispatchDate,
          returnDate: rDate,
          rtNumber: rNum,
        };
      })
    );
  }, [jobDTs, jobRTs, jobData.demobDate, utilEndDateMode]);

  // Dynamic Month Options based strictly on first DT to last RT
  const utilMonthOptions = useMemo(() => {
    let startMs = 0;
    jobDTs.forEach((dt) => {
      const ms = parseDateToMs(dt.dispatchDate);
      if (ms > 0 && (startMs === 0 || ms < startMs)) startMs = ms;
    });
    if (!startMs && jobData.mobDate) startMs = parseDateToMs(jobData.mobDate);
    if (!startMs && jobData.firstDtDate) startMs = parseDateToMs(jobData.firstDtDate);
    if (!startMs) startMs = Date.now();

    let endMs = 0;
    jobRTs.forEach((rt) => {
      const ms = parseDateToMs(rt.rtDate || rt.backloadRmDate);
      if (ms > 0 && ms > endMs) endMs = ms;
    });
    if (!endMs && jobData.lastRtDate) endMs = parseDateToMs(jobData.lastRtDate);
    if (activeOnRig > 0 || endMs === 0 || endMs < startMs) {
      endMs = Math.max(endMs, Date.now());
    }

    const startDate = new Date(startMs);
    const endDate = new Date(endMs);

    const startY = startDate.getFullYear();
    const startM = startDate.getMonth() + 1;
    const endY = endDate.getFullYear();
    const endM = endDate.getMonth() + 1;

    const options: { month: number; year: number; key: string; label: string }[] = [];
    let curY = startY;
    let curM = startM;

    while (curY < endY || (curY === endY && curM <= endM)) {
      options.push({
        month: curM,
        year: curY,
        key: `${curY}-${curM}`,
        label: `${MONTH_NAMES[curM - 1]} ${curY}`,
      });
      curM += 1;
      if (curM > 12) {
        curM = 1;
        curY += 1;
      }
    }

    if (options.length === 0) {
      const d = new Date();
      options.push({
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        key: `${d.getFullYear()}-${d.getMonth() + 1}`,
        label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
      });
    }

    return options;
  }, [jobDTs, jobRTs, jobData.mobDate, jobData.firstDtDate, jobData.lastRtDate, activeOnRig]);

  // Real SQL Job Value directly from database invoiceAmount or cost
  const sqlJobValue = useMemo(() => {
    if (jobData.invoiceAmount !== null && jobData.invoiceAmount !== undefined && jobData.invoiceAmount !== 0) {
      return jobData.invoiceAmount;
    }
    if (typeof jobData.cost === 'number' && jobData.cost !== 0) {
      return jobData.cost;
    }
    const parsed = parseFloat(String(jobData.cost || '').replace(/[^0-9.-]/g, ''));
    return !isNaN(parsed) && parsed !== 0 ? parsed : 0;
  }, [jobData.invoiceAmount, jobData.cost]);

  const poValueNum = typeof jobData.poValue === 'number' ? jobData.poValue : parseFloat(String(jobData.poValue || 0)) || 0;
  const poBalance = poValueNum - sqlJobValue;

  // Manpower / Crew State
  const [assignedCrew, setAssignedCrew] = useState<JobCrewMember[]>(() => {
    return jobData.crewMembers || [];
  });
  useEffect(() => {
    setAssignedCrew(jobData.crewMembers || []);
  }, [jobData.crewMembers]);

  // Manpower Picker Modal State
  const [isPersonnelSelectOpen, setIsPersonnelSelectOpen] = useState(false);
  const [selectedPersonnelRole, setSelectedPersonnelRole] = useState<string>('All Roles');
  const [checkedPersonnelBadges, setCheckedPersonnelBadges] = useState<string[]>([]);

  // Dynamic Master Crew State from crewPersonnelService
  const [masterCrew, setMasterCrew] = useState(() => loadCrewPersonnel());

  useEffect(() => {
    const handleCrewUpdate = () => setMasterCrew(loadCrewPersonnel());
    window.addEventListener('crew_updated', handleCrewUpdate);
    return () => window.removeEventListener('crew_updated', handleCrewUpdate);
  }, []);

  // Add / Edit Crew Member Modal State
  const [isCrewFormModalOpen, setIsCrewFormModalOpen] = useState(false);
  const [editingCrewId, setEditingCrewId] = useState<string | null>(null);
  const [crewFormData, setCrewFormData] = useState({
    badgeNo: '',
    name: '',
    role: 'Lead Fishing & Whipstock Specialist',
    phone: '',
    email: '',
    rigPassNo: '',
    h2sExpiry: '',
    bosietExpiry: '',
    medicalExpiry: '',
    status: 'Active' as 'Active' | 'On Rig' | 'On Leave' | 'Inactive',
    dayRateAED: 3500,
  });



  // Unique roles for personnel picker
  const availablePersonnelRoles = useMemo(() => {
    const set = new Set<string>();
    masterCrew.forEach((p) => set.add(p.role));
    return ['All Roles', ...Array.from(set).sort()];
  }, [masterCrew]);

  const filteredPersonnelRoster = useMemo(() => {
    return masterCrew.filter((p) => {
      if (selectedPersonnelRole === 'All Roles') return true;
      return p.role === selectedPersonnelRole;
    });
  }, [masterCrew, selectedPersonnelRole]);

  // Selected Checklist within Checklist Tab
  const [selectedCalloutId, setSelectedCalloutId] = useState<string>(() => {
    return jobCallouts[0]?.id || (jobData.calloutId ? jobData.calloutId : 'NEW');
  });

  // Active callout object - Guaranteed to link to this jobData.id
  const activeCallout = useMemo(() => {
    const foundById = (selectedCalloutId && selectedCalloutId !== 'NEW')
      ? jobCallouts.find((c) => c.id === selectedCalloutId)
      : null;
    const foundByJobCalloutId = jobData.calloutId
      ? jobCallouts.find((c) => c.id === jobData.calloutId)
      : null;
    const found = foundById || foundByJobCalloutId || jobCallouts[0];
    if (found) {
      const safeTicket = sanitizeTicketNumber(found.ticketNo) || sanitizeTicketNumber((found as any).calloutNumber) || sanitizeTicketNumber(jobData.clientRef);
      return {
        ...found,
        ticketNo: safeTicket,
        status: automatedChecklistStatus,
      };
    }
    const safeFallbackTicket = sanitizeTicketNumber(jobData.clientRef);
    return {
      id: jobData.calloutId || `CAL-${jobData.id.replace(/^JOB-?/i, '')}`,
      ticketNo: safeFallbackTicket,
      jobId: jobData.id,
      jobNumber: jobData.id,
      rig: jobData.rig || '',
      well: jobData.well || '',
      client: jobData.client || '',
      contract: jobData.contract || '',
      poNumber: jobData.poNumber || '',
      projectNo: jobData.contractNo || jobData.contract || '—',
      reqDate: formatDateDD_MM_YYYY(jobData.mobDate || jobData.firstDtDate || new Date().toISOString()),
      status: automatedChecklistStatus,
      createdDate: new Date().toISOString().split('T')[0],
      emailRef: 'Approved via ADNOC Operations',
      items: [],
    };
  }, [jobCallouts, selectedCalloutId, jobData, automatedChecklistStatus]);

  // Fast multi-key inventory lookup map (by serial, by assetNo, by id, uppercase & trimmed, plus stripped/prefixed variations)
  const inventoryMap = useMemo(() => {
    const map = new Map<string, ToolItem>();
    const registerKey = (key: string | undefined | null, tool: ToolItem) => {
      if (!key) return;
      const clean = String(key).trim().toUpperCase();
      if (!clean) return;
      map.set(clean, tool);
      // Strip EMD- prefix (e.g. EMD-6384 -> 6384)
      const stripped = clean.replace(/^EMD-?/i, '');
      if (stripped && stripped !== clean) {
        map.set(stripped, tool);
      }
      // Add EMD- prefix if not already present (e.g. 6384 -> EMD-6384)
      if (!clean.startsWith('EMD-')) {
        map.set(`EMD-${clean}`, tool);
      }
      // Strip all non-alphanumeric (e.g. EMD-6384 -> EMD6384)
      const alphanumeric = clean.replace(/[^A-Z0-9]/g, '');
      if (alphanumeric && alphanumeric !== clean) {
        map.set(alphanumeric, tool);
      }
    };

    (inventory || []).forEach((t) => {
      registerKey(t.serial, t);
      registerKey(t.assetNo, t);
      registerKey(String(t.id), t);
      registerKey(t.oemSerial, t);
    });
    return map;
  }, [inventory]);

  const resolveToolDetails = useCallback((
    rawSerial?: string,
    rawAssetNo?: string,
    fallbackDesc?: string,
    fallbackShortDesc?: string,
    rawSupplier?: string,
    rawOwnership?: string
  ) => {
    const lookupInv = (key?: any) => {
      if (!key) return undefined;
      const k = String(key).trim().toUpperCase();
      if (!k) return undefined;
      return (
        inventoryMap.get(k) ||
        inventoryMap.get(k.replace(/^EMD-?/i, '')) ||
        (!k.startsWith('EMD-') ? inventoryMap.get(`EMD-${k}`) : undefined) ||
        inventoryMap.get(k.replace(/[^A-Z0-9]/g, ''))
      );
    };

    const rawAsset = String(rawAssetNo || '').trim();
    const rawSer = String(rawSerial || '').trim();
    // IMPORTANT: a stored EMD- SystemID still counts as an explicit identity.
    // Excluding it here let the description-match fallback below silently
    // swap an EMD- referenced tool (e.g. EMD-6380) for a different, unrelated
    // physical tool whenever its description also matched something else in
    // inventory - this is the exact bug that made the same tool resolve
    // differently on the Checklist vs. the Delivery Ticket. Any non-blank,
    // non-dash reference - EMD- or not - must skip the fuzzy match.
    const hasExplicitIdentity = Boolean(
      (rawAsset && rawAsset !== '—') ||
      (rawSer && rawSer !== '—')
    );

    let inv = lookupInv(rawSerial) || lookupInv(rawAssetNo);
    const matchedByKey = Boolean(inv);

    // If still not found, and NO explicit serial or asset was provided, try searching inventory by description match
    if (!inv && !hasExplicitIdentity && (fallbackDesc || fallbackShortDesc)) {
      const cleanDesc = String(fallbackDesc || fallbackShortDesc || '').trim().toUpperCase();
      inv = (Array.isArray(inventory) ? inventory : []).find((t) => {
        const td = String(t?.desc || '').trim().toUpperCase();
        return td && cleanDesc && (td === cleanDesc || td.includes(cleanDesc) || cleanDesc.includes(td));
      });
    }

    // Priority 1: Genuine physical Asset Number (never EMD- if a physical asset exists)
    const invAsset = String(inv?.assetNo || '').trim();
    const invOem = String(inv?.oemSerial || '').trim();
    const invSerial = String(inv?.serial || '').trim();

    let assetNo = getCleanAssetNo(rawAsset, invAsset, invOem, rawSer, invSerial);
    if (!assetNo || assetNo === '—') {
      assetNo = rawAsset || rawSer || (matchedByKey ? (invAsset || invSerial) : '') || '—';
    }

    // Priority 2: Genuine Serial Number
    let serial = getCleanAssetNo(rawSer, invSerial, rawAsset, invAsset, invOem);
    if (!serial || serial === '—') {
      serial = rawSer || (matchedByKey ? invSerial : '') || assetNo || '—';
    }

    // Priority 3: Genuine Technical Description (never bare tool type if technical description is available)
    let desc = '';
    const invDesc = String(inv?.desc || '').trim();
    const fbDesc = String(fallbackDesc || '').trim();
    const fbShort = String(fallbackShortDesc || '').trim();
    const invShort = String(inv?.shortDesc || '').trim();

    if (fbDesc) {
      desc = fbDesc;
    } else if (invDesc) {
      desc = invDesc;
    } else if (fbShort) {
      desc = fbShort;
    } else if (invShort) {
      desc = invShort;
    } else {
      desc = 'Downhole Tool';
    }

    // Priority 4: Clean Tool Category / Short Description
    // IMPORTANT: extractToolType() must run FIRST, not as a last-resort fallback.
    // It pattern-matches the description for real tool families (STABILIZER,
    // DRILLING JAR, STRING MILL, etc.) and only falls back to invShort /
    // fallbackShortDesc when those are themselves clean & concise category
    // names (<=35 chars, no connection specs). Using invShort/fallbackShortDesc
    // directly here (as before) let a raw inventory record whose shortDesc
    // field actually holds a full technical description (a data-entry/import
    // artifact) leak straight into the Category column verbatim.
    const shortDesc = extractToolType(desc, fallbackShortDesc, invShort) || 'Downhole Tool';

    // Priority 5: Third-Party Supplier & Ownership Resolution (live inventory updates ALWAYS reflect immediately!)
    const invSup = String(inv?.supplier || '').trim();
    const invOwn = String(inv?.ownership || '').trim();
    const supplier = (
      (invSup && invSup.toUpperCase() !== 'EMDAD' ? invSup : '') ||
      (invOwn && invOwn.toUpperCase() !== 'EMDAD' ? invOwn : '') ||
      (inv && inv.isEmdad === false ? String(inv.ownership || inv.supplier || 'Sub-Contractor').trim() : '') ||
      (rawSupplier && String(rawSupplier).trim().toUpperCase() !== 'EMDAD' ? String(rawSupplier).trim() : '') ||
      (rawOwnership && String(rawOwnership).trim().toUpperCase() !== 'EMDAD' ? String(rawOwnership).trim() : '') ||
      String(inv?.supplier || '') ||
      String(inv?.ownership || '') ||
      String(rawSupplier || '') ||
      String(rawOwnership || '') ||
      'EMDAD'
    );

    const isEmdad = inv ? Boolean(inv.isEmdad) : (!supplier || String(supplier).trim().toUpperCase() === 'EMDAD');

    return { inv, assetNo, serial, desc, shortDesc, supplier, ownership: supplier, isEmdad };
  }, [inventoryMap, inventory]);

  // Default whipstock checklist tools for Job-026-01816
  // Synchronize checklist items with job's Delivery Tickets to eliminate any system ID mix-up
  const resolveChecklistItemWithDT = useCallback((it: CalloutItem, idx: number) => {
    if (!it) return it;
    const rawDt = String(it?.dtNumber || '').trim().toUpperCase();

    // Only associate with a DT if explicitly linked via it.dtNumber
    const targetDT = rawDt ? jobDTs.find(d => String(d?.dtNumber || '').trim().toUpperCase() === rawDt) : null;

    // Find matching line on targetDT strictly by tool serial/assetNo — NEVER match by array index idx!
    const itSerial = String(it?.serialNos?.[0] || '').trim().toUpperCase();
    const itPart = String(it?.partNo || '').trim().toUpperCase();

    // Canonical inventory identity for this checklist item (resolves EMD- system
    // IDs through to the same underlying tool record, whatever key format was used).
    const itInv = resolveToolDetails(it?.serialNos?.[0], it?.partNo).inv;
    const itInvKey = itInv ? String(itInv.id || itInv.serial || itInv.assetNo).trim().toUpperCase() : '';

    const dtLine = targetDT?.toolLines?.find(tl => {
      if (!tl) return false;
      const s = String(tl.serial || '').trim().toUpperCase();
      const a = String(tl.assetNo || '').trim().toUpperCase();
      if (itSerial && itSerial !== '—' && (s === itSerial || a === itSerial)) return true;
      if (itPart && itPart !== '—' && (s === itPart || a === itPart)) return true;
      // Fallback: the checklist item may still carry a raw EMD- system ID while the
      // DT line already shows the resolved physical asset no (or vice versa), so a
      // plain string match above would miss the link entirely. Resolve both sides
      // to the same underlying inventory record and match on that instead — this
      // is what caused the same tool to show different Asset Nos on the Checklist
      // vs the Delivery Ticket for the same job.
      if (itInvKey) {
        const tlInv = resolveToolDetails(tl.serial, tl.assetNo).inv;
        const tlInvKey = tlInv ? String(tlInv.id || tlInv.serial || tlInv.assetNo).trim().toUpperCase() : '';
        if (tlInvKey && tlInvKey === itInvKey) return true;
      }
      return false;
    });

    const candidateSerial = dtLine?.serial || it?.serialNos?.[0];
    const candidateAssetNo = dtLine?.assetNo || it?.partNo;
    const candidateDesc = it?.description || dtLine?.toolDescription || dtLine?.desc;
    const candidateSupplier = dtLine?.ownership || dtLine?.supplier || it?.supplier;

    const resolved = resolveToolDetails(candidateSerial, candidateAssetNo, candidateDesc, it?.shortDesc || it?.cat, candidateSupplier);
    return {
      ...it,
      dtNumber: targetDT ? targetDT.dtNumber : undefined,
      status: (targetDT ? 'Released' : (it.status === 'Released' ? 'Assigned' : it.status || 'Assigned')) as any,
      partNo: getCleanAssetNo(it.partNo, resolved.assetNo, it.serialNos?.[0], resolved.serial),
      serialNos: (it.serialNos && it.serialNos.length > 0 && it.serialNos[0] !== '—') ? it.serialNos : [resolved.serial && resolved.serial !== '—' ? resolved.serial : resolved.assetNo],
      description: it.description || resolved.desc,
      shortDesc: it.shortDesc || it.cat || resolved.shortDesc,
      cat: it.cat || resolved.shortDesc,
      supplier: it.supplier || resolved.supplier,
      ownership: it.ownership || resolved.supplier,
      isEmdad: it.isEmdad ?? resolved.isEmdad,
    };
  }, [jobDTs, resolveToolDetails]);

  // Checklist Items State
  const [checklistItems, setChecklistItems] = useState<CalloutItem[]>(() => {
    if (activeCallout?.items && activeCallout.items.length > 0) {
      return activeCallout.items.filter(Boolean).map((it, idx) => resolveChecklistItemWithDT(it, idx));
    }
    return [];
  });

  useEffect(() => {
    if (activeCallout && Array.isArray(activeCallout.items)) {
      setChecklistItems(
        activeCallout.items.filter(Boolean).map((it, idx) => resolveChecklistItemWithDT(it, idx))
      );
    }
  }, [activeCallout, resolveChecklistItemWithDT]);

  // Master Tool Categories & Sizes for Tool Picker
  const customCategories = useMemo<string[]>(() => {
    if (propCustomCategories && propCustomCategories.length > 0) return propCustomCategories;
    const s = localStorage.getItem('emdad_custom_categories');
    if (s) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => (typeof item === 'string' ? item : item?.categoryName || item?.name || String(item || ''))).filter(Boolean);
        }
      } catch {}
    }
    return [
      'BIT SUB',
      'CARGO BASKET',
      'CROSSOVER SUB',
      'CUTLIP GUIDE',
      'DRILL PIPE',
      'DRILLING JAR',
      'FISHING JAR',
      'GUNDRILL REAMER',
      'HOLE OPENER',
      'HYD DRILLING JAR',
      'MOTOR',
      'OVERSHOT',
      'ROLLER REAMER',
      'SAFETY VALVE',
      'STABILIZER',
      'WHIPSTOCK',
    ];
  }, [propCustomCategories]);

  const customSizes = useMemo<string[]>(() => {
    if (propCustomSizes && propCustomSizes.length > 0) return propCustomSizes;
    const s = localStorage.getItem('emdad_custom_sizes');
    if (s) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => (typeof item === 'string' ? item : item?.sizeString || item?.name || item?.size || String(item || ''))).filter(Boolean);
        }
      } catch {}
    }
    return ['3-1/2"', '4-3/4"', '5-3/4"', '6"', '6-1/2"', '6-3/4"', '8"', '8-1/8"', '8-1/2"', '9-1/2"', '11-3/4"', '12-1/4"', '17-1/2"', '26"'];
  }, [propCustomSizes]);

  // Tool Selection Modal (itemsselect) State
  const [isToolSelectOpen, setIsToolSelectOpen] = useState(false);
  const [isToolModalMaximized, setIsToolModalMaximized] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedToolSize, setSelectedToolSize] = useState<string>('');
  const [toolSearchQuery, setToolSearchQuery] = useState<string>('');
  const [checkedToolSerials, setCheckedToolSerials] = useState<string[]>([]);
  // Stores the EXACT asset number shown in the picker table for each checked key,
  // so handleInsertSelectedTools uses what the user actually saw — no re-computation.
  const [checkedToolDisplayMap, setCheckedToolDisplayMap] = useState<Record<string, string>>({});

  // Unique categories in inventory + custom categories
  const availableCategories = useMemo(() => {
    const set = new Set<string>(customCategories);
    inventory.forEach((t) => {
      if (t.shortDesc) set.add(t.shortDesc.trim());
      else if (t.desc) set.add(t.desc.split(' ')[0]);
    });
    return Array.from(set).sort();
  }, [inventory, customCategories]);

  const filteredCategories = useMemo(() => {
    if (!categorySearchQuery || categorySearchQuery.trim() === '') {
      return availableCategories;
    }
    const q = categorySearchQuery.toLowerCase().trim();
    return availableCategories.filter((c) => c.toLowerCase().includes(q));
  }, [availableCategories, categorySearchQuery]);

  // Helper to determine which DT an item belongs to in this job, and whether that DT is locked
  const getAssignedDTForChecklistItem = useCallback((item: CalloutItem): { dtNumber: string; isLocked: boolean } | null => {
    if (item.dtNumber) {
      const itUpper = (item.dtNumber || '').trim().toUpperCase();
      const match = jobDTs.find((d) => (d.dtNumber || '').trim().toUpperCase() === itUpper);
      return { dtNumber: item.dtNumber, isLocked: match?.isLocked ?? false };
    }
    // Build a set of candidate identifiers for this checklist item.
    // We must check BOTH serialNos[0] AND partNo independently because the serialNos[0]
    // may be an internal EMD- number (e.g. "EMD-0001") that doesn't appear in the DT tool line,
    // while partNo holds the real asset number (e.g. "SM850-017") that DOES appear.
    const candidates = new Set<string>();
    if (item.serialNos?.[0]) candidates.add(item.serialNos[0].trim().toUpperCase());
    if (item.partNo)         candidates.add(item.partNo.trim().toUpperCase());
    candidates.delete('');
    candidates.delete('—');
    if (candidates.size === 0) return null;

    for (const dt of jobDTs) {
      const match = dt.toolLines?.some((l) => {
        const s = (l.serial  || '').trim().toUpperCase();
        const a = (l.assetNo || '').trim().toUpperCase();
        return (s && candidates.has(s)) || (a && candidates.has(a));
      });
      if (match) {
        return { dtNumber: dt.dtNumber, isLocked: dt.isLocked ?? false };
      }
    }
    return null;
  }, [jobDTs]);

  // Strict check: Is this specifically ADNOC Drilling Shared Rental Pool Contract 4700024096?
  const isContract4700024096 = useMemo(() => {
    const cNo = (jobData.contractNo || jobData.contract || '').trim();
    const cl = (jobData.client || '').trim().toLowerCase();
    return cNo.includes('4700024096') || (cl.includes('drilling') && cNo.includes('4700024096'));
  }, [jobData.contractNo, jobData.contract, jobData.client]);

  // Available Rigs list for tool allocation dropdowns (derived from all active jobs + known ADNOC Drilling rigs)
  const adnocRigOptions = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      if (j.rig && j.rig.trim() && j.rig !== '—' && !j.rig.includes('Multi')) set.add(j.rig.trim());
    });
    // Ensure primary ADNOC Drilling fleet rigs are present
    ['ND-11', 'ND-12', 'ND-14', 'ND-15', 'ND-16', 'ND-17', 'ND-18', 'ND-19', 'ND-20', 'ND-21',
     'AD-15', 'AD-16', 'AD-17', 'AD-18', 'AD-19', 'AD-20', 'AD-21', 'AD-22', 'AD-45', 'AD-55',
     'AD-65', 'AD-75', 'AD-85', 'AD-101', 'AD-102', 'AD-103', 'AD-104', 'AD-105', 'AD-106',
     'AL YASAT', 'AL DABB\'IYA', 'AL GHALLAN', 'SALAMAH', 'HODAIRIYAT', 'UMM AL ANBAR'].forEach((r) => set.add(r));
    return Array.from(set).sort();
  }, [jobs]);

  // Modal State: Rollover unreturned tools from previous month's job
  const [isRolloverModalOpen, setIsRolloverModalOpen] = useState(false);
  const [selectedPreviousJobId, setSelectedPreviousJobId] = useState<string>('');

  // Eligible previous jobs under Contract 4700024096
  const previousPoolJobs = useMemo(() => {
    if (!isContract4700024096) return [];
    return jobs.filter((j) => {
      if (j.id === jobData.id) return false;
      const c = (j.contractNo || j.contract || '').trim();
      return c.includes('4700024096') || (j.client || '').toLowerCase().includes('drilling');
    });
  }, [isContract4700024096, jobs, jobData.id]);

  // Compute unreturned tools from selected previous job
  const unreturnedToolsFromPreviousJob = useMemo(() => {
    if (!selectedPreviousJobId) return [];
    const prevDTs = dtBatches.filter((b) => (b.jobId || (b as any).jobNumber) === selectedPreviousJobId);
    const prevRTs = rtBatches.filter((b) => (b.jobId || (b as any).jobNumber) === selectedPreviousJobId);

    const returnedSerials = new Set<string>();
    prevRTs.forEach((rt) => {
      rt.toolLines?.forEach((tl) => {
        if (tl.serial) returnedSerials.add(tl.serial.trim().toUpperCase());
        if (tl.assetNo) returnedSerials.add(tl.assetNo.trim().toUpperCase());
      });
    });

    const unreturned: any[] = [];
    prevDTs.forEach((dt) => {
      (dt.toolLines || []).forEach((tl) => {
        const s = (tl.serial || '').trim().toUpperCase();
        const a = (tl.assetNo || '').trim().toUpperCase();
        const isRet = (s && returnedSerials.has(s)) || (a && returnedSerials.has(a)) || tl.status === 'Returned' || Boolean(tl.rtBatchId);
        if (!isRet) {
          unreturned.push({
            ...tl,
            fromDT: dt.dtNumber,
            dispatchDate: dt.dispatchDate || dt.rmDate,
            allocatedRig: tl.allocatedRig || dt.rig || '',
            allocatedWell: tl.allocatedWell || dt.well || '',
            clientDtNo: tl.clientDtNo || '',
          });
        }
      });
    });
    return unreturned;
  }, [selectedPreviousJobId, dtBatches, rtBatches]);

  // Checklist items that are still pending or not yet locked on a dispatched DT
  const pendingChecklistItems = useMemo(() => {
    return checklistItems.filter((ci) => {
      const assigned = getAssignedDTForChecklistItem(ci);
      return !assigned || !assigned.isLocked;
    });
  }, [checklistItems, getAssignedDTForChecklistItem]);

  // Checklist items that have not been assigned to ANY delivery ticket yet
  const unassignedChecklistItems = useMemo(() => {
    return checklistItems.filter((ci) => {
      const assigned = getAssignedDTForChecklistItem(ci);
      return !assigned;
    });
  }, [checklistItems, getAssignedDTForChecklistItem]);

  // Selected checklist item sequence numbers for generating Delivery Ticket
  const [selectedChecklistSeqs, setSelectedChecklistSeqs] = useState<number[]>([]);

  // Automatically select all pending (not dispatched on a locked DT) checklist items
  useEffect(() => {
    const pendingSeqs = checklistItems
      .filter((ci) => {
        const assigned = getAssignedDTForChecklistItem(ci);
        return !assigned || !assigned.isLocked;
      })
      .map((ci) => ci.seq);

    setSelectedChecklistSeqs((prev) => {
      const set = new Set(prev);
      let changed = false;
      pendingSeqs.forEach((seq) => {
        if (!set.has(seq)) {
          set.add(seq);
          changed = true;
        }
      });
      return changed ? Array.from(set) : prev;
    });
  }, [checklistItems, getAssignedDTForChecklistItem]);

  const toggleChecklistItem = useCallback((seq: number) => {
    setSelectedChecklistSeqs((prev) =>
      prev.includes(seq) ? prev.filter((s) => s !== seq) : [...prev, seq]
    );
  }, []);

  const allPendingSelected = useMemo(() => {
    if (pendingChecklistItems.length === 0) return false;
    return pendingChecklistItems.every((item) => selectedChecklistSeqs.includes(item.seq));
  }, [pendingChecklistItems, selectedChecklistSeqs]);

  const toggleSelectAllPending = useCallback(() => {
    if (allPendingSelected) {
      const pendingSet = new Set(pendingChecklistItems.map((item) => item.seq));
      setSelectedChecklistSeqs((prev) => prev.filter((seq) => !pendingSet.has(seq)));
    } else {
      const newSeqs = new Set([...selectedChecklistSeqs, ...pendingChecklistItems.map((item) => item.seq)]);
      setSelectedChecklistSeqs(Array.from(newSeqs));
    }
  }, [allPendingSelected, pendingChecklistItems, selectedChecklistSeqs]);

  const selectedPendingCount = useMemo(() => {
    const set = new Set(selectedChecklistSeqs);
    return pendingChecklistItems.filter((item) => set.has(item.seq)).length;
  }, [pendingChecklistItems, selectedChecklistSeqs]);

  const categoryInventory = useMemo(() => {
    // Collect all serials returned to base on an RT for this job
    const returnedSerialsInJob = new Set<string>();
    jobRTs.forEach((rt) => {
      rt.toolLines?.forEach((tl) => {
        if (tl.serial) returnedSerialsInJob.add(tl.serial.trim().toUpperCase());
        if (tl.assetNo) returnedSerialsInJob.add(tl.assetNo.trim().toUpperCase());
      });
    });

    // Collect all serials currently pending or deployed on rig without return
    const activeSerialsInJob = new Set<string>();
    checklistItems.forEach((item) => {
      const sKey = (item.serialNos?.[0] || item.partNo || '').trim().toUpperCase();
      const aKey = (item.partNo || '').trim().toUpperCase();
      const assigned = getAssignedDTForChecklistItem(item);
      const isReturned = (sKey && returnedSerialsInJob.has(sKey)) || (aKey && returnedSerialsInJob.has(aKey));

      // If pending dispatch, OR if deployed on rig and not yet returned on an RT:
      if (!assigned?.isLocked || !isReturned) {
        if (sKey) activeSerialsInJob.add(sKey);
        if (aKey) activeSerialsInJob.add(aKey);
      }
    });

    // Strictly enforce:
    // 1. Tool must be In Base / Yard (location is 'Emdad Base', contains 'base' or 'yard', and NOT 'On Rig', 'Workshop', etc.)
    // 2. Tool must be in 'Good' / Ready operational status (NOT 'Repair', 'Redress', 'Inspection', 'On Rig', 'Lost in Hole', 'Scrapped', 'Removed')
    // 3. Tool must have ACCEPTED / Pass inspection condition (not Rejected / Fail)
    // 4. Tool must NOT currently be pending or active on rig for this job
    const validInventory = inventory.filter((t) => {
      const sKey = (t.serial || '').trim().toUpperCase();
      const aKey = (t.assetNo || '').trim().toUpperCase();

      // Exclude if currently pending or active on rig for this job
      if (sKey && activeSerialsInJob.has(sKey)) return false;
      if (aKey && activeSerialsInJob.has(aKey)) return false;

      // Status check: must be 'Good' (or 'Ready', 'Accepted', 'Available')
      const st = (t.status || 'Good').trim().toUpperCase();
      const isGoodStatus = st === 'GOOD' || st === 'READY' || st === 'ACCEPTED' || st === 'AVAILABLE';
      if (!isGoodStatus) return false;

      // Location check: must be in Base / Yard, and not On Rig or Workshop or Inspection Bay
      const loc = (t.location || 'Emdad Base').trim().toUpperCase();
      const isAtBase =
        loc.includes('BASE') ||
        loc.includes('YARD') ||
        loc === 'EMDAD BASE' ||
        loc === 'EMDAD' ||
        loc === 'WAREHOUSE' ||
        loc === 'STORE';
      const isDispatched = loc.includes('RIG') || loc.includes('WORKSHOP') || loc.includes('SUPPLIER') || loc.includes('INSPECTION');
      if (!isAtBase || isDispatched) return false;

      // Inspection check: if inspection records exist, latest inspection must not be Fail / Rejected / Scrapped
      const toolInspections = (inspections || []).filter(
        (ins) =>
          (ins.serial && ins.serial.trim().toUpperCase() === sKey) ||
          (aKey && ins.serial && ins.serial.trim().toUpperCase() === aKey)
      );
      if (toolInspections.length > 0) {
        const latestIns = [...toolInspections].sort(
          (a, b) =>
            new Date(b.inspectionDate || b.reportDate || b.receivedDate || '').getTime() -
            new Date(a.inspectionDate || a.reportDate || a.receivedDate || '').getTime()
        )[0];
        const insSt = (latestIns?.status || '').trim().toUpperCase();
        if (insSt === 'REJECTED' || insSt === 'FAIL' || insSt === 'FAILED' || insSt === 'SCRAP' || insSt === 'SCRAPPED' || insSt === 'REPAIR') {
          return false;
        }
      }

      return true;
    });

    if (!selectedCategory) return validInventory;
    return validInventory.filter((t) => {
      const matchShort = (t.shortDesc || '').toUpperCase().includes(selectedCategory.toUpperCase());
      const matchDesc = (t.desc || '').toUpperCase().includes(selectedCategory.toUpperCase());
      return matchShort || matchDesc;
    });
  }, [inventory, selectedCategory, checklistItems, inspections, jobRTs, getAssignedDTForChecklistItem]);

  const availableSizes = useMemo(() => {
    const set = new Set<string>(customSizes);
    categoryInventory.forEach((t) => {
      if (t.size) set.add(t.size.trim());
    });
    return Array.from(set).sort();
  }, [categoryInventory, customSizes]);

  const modalAvailableTools = useMemo(() => {
    const cleanSz = (s: string) => (s || '').trim().toLowerCase().replace(/["″\s]/g, '');
    const q = (toolSearchQuery || '').trim().toLowerCase();
    return categoryInventory.filter((t) => {
      if (selectedToolSize && cleanSz(t.size) !== cleanSz(selectedToolSize)) return false;
      if (q) {
        const matchAsset = (t.assetNo || '').toLowerCase().includes(q);
        const matchSerial = (t.serial || '').toLowerCase().includes(q);
        const matchDesc = (t.desc || '').toLowerCase().includes(q);
        const matchShort = (t.shortDesc || '').toLowerCase().includes(q);
        if (!matchAsset && !matchSerial && !matchDesc && !matchShort) return false;
      }
      return true;
    });
  }, [categoryInventory, selectedToolSize, toolSearchQuery]);

  // Selected DT for DT Tab
  const [selectedDTNumber, setSelectedDTNumber] = useState<string>(() => {
    return jobDTs[0]?.dtNumber || '';
  });
  useEffect(() => {
    if (!selectedDTNumber && jobDTs.length > 0) {
      setSelectedDTNumber(jobDTs[0].dtNumber);
    }
  }, [jobDTs, selectedDTNumber]);

  const activeDT = useMemo(() => {
    return jobDTs.find((d) => d.dtNumber === selectedDTNumber) || jobDTs[0] || null;
  }, [jobDTs, selectedDTNumber]);

  // Build a Delivery Ticket line directly FROM an already-resolved Checklist line.
  // The user selects the exact checklist row — its Asset No, Serial, Description
  // and Category are already correct and already on screen. Re-running an
  // inventory lookup here (as this used to do) could pull a DIFFERENT desc/
  // category straight from the inventory record's own (sometimes messier or
  // differently-worded) desc/shortDesc fields, which is exactly what caused the
  // same tool to show a different Category on the Delivery Ticket than on the
  // Checklist. So: copy the checklist item's fields verbatim, and only fall back
  // to a fresh inventory lookup when the checklist item itself has no identity
  // (no Asset No and no Serial) to go on at all.
  const buildDTLineFromChecklistItem = useCallback((ci: CalloutItem, idx: number) => {
    const hasIdentity = Boolean(
      (ci.partNo && ci.partNo !== '—') || (ci.serialNos?.[0] && ci.serialNos[0] !== '—')
    );
    const resolved = hasIdentity
      ? null
      : resolveToolDetails(ci.serialNos?.[0], ci.partNo, ci.description, ci.cat || ci.shortDesc, ci.supplier);

    const assetNo = (ci.partNo && ci.partNo !== '—' ? ci.partNo : '') || resolved?.assetNo || ci.serialNos?.[0] || '—';
    const serial = (ci.serialNos?.[0] && ci.serialNos[0] !== '—' ? ci.serialNos[0] : '') || resolved?.serial || assetNo;
    const desc = ci.description || resolved?.desc || ci.shortDesc || ci.cat || 'Downhole Tool';
    const shortDesc = ci.cat || ci.shortDesc || resolved?.shortDesc || 'Downhole Tool';
    const supplier = ci.supplier || ci.ownership || resolved?.supplier || 'EMDAD';

    return {
      id: idx + 1,
      itemNo: idx + 1,
      serial,
      assetNo,
      shortDesc,
      desc,
      size: ci.size || resolved?.inv?.size || '—',
      status: 'OnRig' as const,
      ownership: supplier,
      supplier,
      isEmdad: ci.isEmdad ?? resolved?.isEmdad ?? (String(supplier).toUpperCase() === 'EMDAD'),
      qty: ci.qty || 1,
      remarks: '',
      allocatedRig: ci.allocatedRig || jobData.rig || '',
      allocatedWell: ci.allocatedWell || jobData.well || '',
      clientDtNo: ci.clientDtNo || '',
    };
  }, [resolveToolDetails, jobData.rig, jobData.well]);

  // Canonical tool identity -> Checklist item lookup. Used to self-heal the
  // Delivery Ticket display for DT lines whose own stored desc/category went
  // stale (e.g. a DT generated before the fix above, or one whose line was
  // edited independently of the checklist) WITHOUT needing the user to click
  // "Sync from Checklist" or wait on a Refresh that only re-fetches the same
  // stale stored data. The checklist item the user selected is always the
  // source of truth for what a tool actually is.
  const checklistItemByToolKey = useMemo(() => {
    const map = new Map<string, CalloutItem>();
    checklistItems.forEach((ci) => {
      const inv = resolveToolDetails(ci.serialNos?.[0], ci.partNo).inv;
      const key = inv
        ? String(inv.id || inv.serial || inv.assetNo).trim().toUpperCase()
        : (String(ci.partNo || '').trim().toUpperCase() !== '—' && ci.partNo ? String(ci.partNo).trim().toUpperCase() : String(ci.serialNos?.[0] || '').trim().toUpperCase());
      if (key) map.set(key, ci);
    });
    return map;
  }, [checklistItems, resolveToolDetails]);

  const getChecklistMatchForToolLine = useCallback((t: { serial?: string; assetNo?: string }) => {
    const inv = resolveToolDetails(t?.serial, t?.assetNo).inv;
    const key = inv
      ? String(inv.id || inv.serial || inv.assetNo).trim().toUpperCase()
      : (String(t?.assetNo || '').trim().toUpperCase() !== '—' && t?.assetNo ? String(t.assetNo).trim().toUpperCase() : String(t?.serial || '').trim().toUpperCase());
    return key ? checklistItemByToolKey.get(key) : undefined;
  }, [checklistItemByToolKey, resolveToolDetails]);

  // One-time backend correction for Delivery Tickets saved before the fix that
  // made new DTs copy their Category straight from the Checklist line. Runs
  // once per DT (tracked in a ref so it never loops), and only writes when a
  // line's own stored Category is blank or the generic "Downhole Tool"
  // placeholder. After this runs, the corrected Category is permanently saved
  // in Azure SQL — the DT table above reads it directly with no lookup, the
  // same way the Checklist does, so there's nothing left to "sync" or
  // "refresh" for this tool ever again.
  const healedDTNumbersRef = React.useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!onUpdateDTBatch) return;
    // Wait for the Checklist to actually have data before attempting a heal.
    // On first mount this effect used to run before the Checklist's own
    // useEffect (and the auto-refresh from Azure SQL) had populated
    // checklistItems — it found nothing to match against, marked the DT as
    // "already processed" anyway, and then never got a second chance once the
    // real checklist data arrived a moment later. That's the actual reason
    // the Category stayed wrong even after this fix shipped: the heal was
    // burning its one shot on an empty checklist every time.
    if (checklistItems.length === 0) return;
    jobDTs.forEach((dt) => {
      const dtNum = dt?.dtNumber;
      if (!dtNum || healedDTNumbersRef.current.has(dtNum)) return;
      healedDTNumbersRef.current.add(dtNum);

      let changed = false;
      const healedLines = (dt.toolLines || []).map((tl) => {
        const stored = String(tl.shortDesc || '').trim();
        const needsHeal = !stored || stored.toLowerCase() === 'downhole tool';
        if (!needsHeal) return tl;
        const match = getChecklistMatchForToolLine(tl);
        const betterCat = String(match?.cat || match?.shortDesc || '').trim();
        if (betterCat && betterCat.toLowerCase() !== 'downhole tool') {
          changed = true;
          return { ...tl, shortDesc: betterCat };
        }
        return tl;
      });

      if (changed) {
        onUpdateDTBatch({ ...dt, toolLines: healedLines });
      }
    });
  }, [jobDTs, checklistItems, getChecklistMatchForToolLine, onUpdateDTBatch]);

  const draftDT = useMemo<DTBatch>(() => {
    const curYr = new Date().getFullYear().toString().slice(-2);
    const existingSeqs = dtBatches
      .filter((b) => {
        const s = String(b.dtNumber || '').toUpperCase();
        return !s.includes('10001') && !s.includes('100001') && !s.includes('10002');
      })
      .map((b) => {
        const m = (b.dtNumber || '').match(/^DT-(?:\d+-)?(\d+)$/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n) && n > 0 && n < 10000);
    let nextSeq = existingSeqs.length > 0 ? Math.max(...existingSeqs) + 1 : 2393;
    while (dtBatches.some((b) => String(b.dtNumber || '').toUpperCase() === `DT-${curYr}-${String(nextSeq).padStart(5, '0')}`)) {
      nextSeq++;
    }
    const nextDTNum = `DT-${curYr}-${String(nextSeq).padStart(5, '0')}`;
    // Use YYYY-MM-DD (ISO) format — <input type="date"> requires this exact format.
    const dispatchDateStr = toInputDateFormat(jobData.mobDate) || new Date().toISOString().split('T')[0];

    const tools: any[] = (checklistItems && checklistItems.length > 0)
      ? checklistItems.map((ci, idx) => ({
          ...buildDTLineFromChecklistItem(ci, idx),
          remarks: 'Reserved in Checklist',
        }))
      : [];

    return {
      id: `DT-DRAFT-${jobData.id}`,
      dtNumber: nextDTNum,
      jobId: jobData.id,
      jobNumber: jobData.id,
      rmDate: dispatchDateStr,
      rmRef: `MR-${jobData.id.slice(-4) || '881'}`,
      dispatchDate: dispatchDateStr,
      deliveryDate: dispatchDateStr,
      rig: jobData.rig,
      well: jobData.well,
      contract: jobData.contractNo || jobData.contract,
      dispatchedBy: user?.name || 'Operations',
      recipient: `${jobData.rig} Toolpusher`,
      notes: '',
      isLocked: false,
      toolLines: tools,
    };
  }, [dtBatches, jobData, checklistItems, jobDTs.length, user, buildDTLineFromChecklistItem]);

  const effectiveDT = activeDT || draftDT;

  // Selected RT for RT Tab
  const [selectedRTNumber, setSelectedRTNumber] = useState<string>(() => {
    return jobRTs[0]?.rtNumber || '';
  });
  useEffect(() => {
    if (!selectedRTNumber && jobRTs.length > 0) {
      setSelectedRTNumber(jobRTs[0].rtNumber);
    }
  }, [jobRTs, selectedRTNumber]);

  const activeRT = useMemo(() => {
    return jobRTs.find((r) => r.rtNumber === selectedRTNumber) || jobRTs[0] || null;
  }, [jobRTs, selectedRTNumber]);

  const draftRT = useMemo<RTBatch>(() => {
    const curYr = new Date().getFullYear().toString().slice(-2);
    const rtNums = rtBatches
      .map((b) => {
        const m = (b.rtNumber || '').match(/^RT-\d+-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextSeq = rtNums.length > 0 ? Math.max(...rtNums) + 1 : 1;
    const newRtNumber = `RT-${curYr}-${String(nextSeq).padStart(5, '0')}`;
    const defaultDate = jobData.demobDate || new Date().toISOString().split('T')[0];

    return {
      id: `RT-DRAFT-${jobData.id}`,
      rtNumber: newRtNumber,
      jobId: jobData.id || jobData.jobNumber || '',
      rtDate: defaultDate,
      backloadRmDate: defaultDate,
      loadingNoteNo: '',
      loadingNoteDate: '',
      contract: jobData.contractNo || jobData.contract || '',
      rig: jobData.rig || '',
      well: jobData.well || '',
      receivedBy: '',
      carrier: '',
      toolLines: [],
    };
  }, [rtBatches, jobData]);

  const effectiveRT = activeRT || draftRT;

  // Delivery Ticket Creation handler
  const handleCreateNewDTInJob = () => {
    if (isClosedOrInvoiced || isLocked) {
      showToast('Cannot create delivery ticket: this job is invoiced and locked.', 'error');
      return;
    }
    const curYr = new Date().getFullYear().toString().slice(-2);
    const existingSeqs = dtBatches
      .filter((b) => {
        const s = String(b.dtNumber || '').toUpperCase();
        return !s.includes('10001') && !s.includes('100001') && !s.includes('10002');
      })
      .map((b) => {
        const m = (b.dtNumber || '').match(/^DT-(?:\d+-)?(\d+)$/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n) && n > 0 && n < 10000);
    let nextSeq = existingSeqs.length > 0 ? Math.max(...existingSeqs) + 1 : 2393;
    while (dtBatches.some((b) => String(b.dtNumber || '').toUpperCase() === `DT-${curYr}-${String(nextSeq).padStart(5, '0')}`)) {
      nextSeq++;
    }
    const nextDTNum = `DT-${curYr}-${String(nextSeq).padStart(5, '0')}`;
    // Use YYYY-MM-DD (ISO) format — <input type="date"> requires this exact format.
    const dispatchDateStr = toInputDateFormat(jobData.mobDate) || new Date().toISOString().split('T')[0];

    const toolsToInclude: any[] = checklistItems.length > 0
      ? checklistItems.map((ci, idx) => ({
          ...buildDTLineFromChecklistItem(ci, idx),
          remarks: 'Mobilized',
        }))
      : [];

    const newDT: DTBatch = {
      id: `DTB-${Date.now()}`,
      dtNumber: nextDTNum,
      jobId: jobData.id,
      jobNumber: jobData.id,
      rmDate: dispatchDateStr,
      rmRef: `MR-${jobData.id.slice(-4) || '881'}`,
      dispatchDate: dispatchDateStr,
      deliveryDate: dispatchDateStr,
      rig: jobData.rig,
      well: jobData.well,
      contract: jobData.contractNo || jobData.contract,
      dispatchedBy: user?.name || 'Operations',
      recipient: `${jobData.rig} Toolpusher`,
      notes: '',
      isLocked: false,
      toolLines: toolsToInclude,
    };

    onSaveDTBatch(newDT);
    setSelectedDTNumber(newDT.dtNumber);
    showToast(`Delivery Ticket ${newDT.dtNumber} created for Job ${jobData.id}.`, 'success');
  };

  // Delivery Ticket & Return Ticket Notes states — reflect the stored record only,
  // no localStorage shadow copy. An unsaved edit is lost on refresh, same as every
  // other field here; that's the honest behavior, not a bug.
  const [dtNotesInput, setDtNotesInput] = useState(() => effectiveDT?.notes || '');

  useEffect(() => {
    setDtNotesInput(effectiveDT?.notes || '');
  }, [effectiveDT?.id, effectiveDT?.dtNumber]);
  // Note: effectiveDT?.notes intentionally NOT in deps — resets editor mid-typing on any re-render.

  const handleSaveDTNotes = (silent = false) => {
    // Only persist if an active DT exists. Never auto-create a DT from saving notes!
    const targetDT = activeDT;
    if (!targetDT) return;
    const trimmed = dtNotesInput.trim();
    const updated: DTBatch = {
      ...targetDT,
      notes: trimmed,
    };
    if (onUpdateDTBatch) {
      onUpdateDTBatch(updated);
    } else {
      onSaveDTBatch(updated);
      setSelectedDTNumber(updated.dtNumber);
    }
    if (!silent) {
      showToast(`Delivery Ticket ${targetDT.dtNumber} notes saved successfully.`, 'success');
    }
  };

  const getDTField = (dt: DTBatch | null, field: string): string => {
    if (!dt) return '';
    const val = (dt as any)[field];
    return val !== undefined && val !== null ? String(val) : '';
  };

  const handleUpdateDTField = (field: string, value: string) => {
    // Use effectiveDT (activeDT || draftDT) so footer/header fields are editable
    // even before the DT has been formally selected in the dropdown.
    const targetDT = activeDT || draftDT;
    if (!targetDT) return;
    const updated: DTBatch = {
      ...targetDT,
      [field]: value,
    };
    if (field === 'vesselBoat') {
      (updated as any).msvName = value;
    } else if (field === 'vehicleNo') {
      (updated as any).vehicleVesselNo = value;
      (updated as any).vesselNo = value;
    }
    if (onUpdateDTBatch) {
      onUpdateDTBatch(updated);
    } else {
      onSaveDTBatch(updated);
      setSelectedDTNumber(updated.dtNumber);
    }
  };

  // Reflects the stored record only — no localStorage shadow copy (same reasoning as DT notes above).
  const [rtNotesInput, setRtNotesInput] = useState(() => effectiveRT?.notes || '');

  useEffect(() => {
    setRtNotesInput(effectiveRT?.notes || '');
  }, [effectiveRT?.id, effectiveRT?.rtNumber]);
  // Note: effectiveRT?.notes intentionally NOT in deps — resets editor mid-typing on any re-render.

  const handleSaveRTNotes = (silent = false) => {
    const targetRT = effectiveRT;
    if (!targetRT) return;
    const trimmed = rtNotesInput.trim();
    const updated: RTBatch = {
      ...targetRT,
      notes: trimmed,
    };
    if (activeRT && onUpdateRTBatch) {
      onUpdateRTBatch(updated);
    } else {
      onSaveRTBatch(updated);
      setSelectedRTNumber(updated.rtNumber);
    }
    if (!silent) {
      showToast(`Receiving Ticket ${targetRT.rtNumber} notes saved successfully.`, 'success');
    }
  };

  // Confirm receipt and lock a Return/Receiving Ticket against further edits
  // (mirrors handleConfirmAndLockDT below — same pattern, RT side)
  const handleConfirmAndLockRT = () => {
    const targetRT = effectiveRT;
    if (!targetRT) return;
    const count = targetRT.toolLines?.length || 0;
    const confirmed = window.confirm(
      adminUnlocked
        ? `Confirm corrections and re-lock Receiving Ticket ${targetRT.rtNumber}?\n\n` +
          `• Tools Returned: ${count}\n` +
          `• Rig / Well: ${jobData.rig} / ${jobData.well}\n\n` +
          `This will save all corrected RT fields, lock the Receiving Ticket, and restore the workspace to normal locked mode.`
        : `Are you sure you want to confirm receipt and lock Receiving Ticket ${targetRT.rtNumber}?\n\n` +
          `• Tools Received Back: ${count}\n` +
          `• Rig / Well: ${jobData.rig} / ${jobData.well}\n\n` +
          `This confirms the manifest is complete and locks this ticket against further modifications.`
    );
    if (!confirmed) return;

    const updatedBatch: RTBatch = {
      ...targetRT,
      isLocked: true,
      lockedBy: user?.name || 'Operations',
      lockedDate: new Date().toISOString(),
    };

    if (activeRT && onUpdateRTBatch) {
      onUpdateRTBatch(updatedBatch);
    } else {
      onSaveRTBatch(updatedBatch);
      setSelectedRTNumber(updatedBatch.rtNumber);
    }

    if (adminUnlocked) {
      setAdminUnlocked(false);
    }

    showToast(`Receiving Ticket ${updatedBatch.rtNumber} confirmed and locked.`, 'success');
  };

  // Explicit Unlock Receiving Ticket
  const handleUnlockRT = () => {
    if (!activeRT) return;
    const confirmed = window.confirm(
      `Unlock Receiving Ticket ${activeRT.rtNumber} for editing?\n\n` +
      `• Job: ${jobData.id}\n` +
      `• Rig: ${jobData.rig} / Well: ${jobData.well}\n\n` +
      `This will unlock this Receiving Ticket so you can correct returned tool lines or manifest details.`
    );
    if (!confirmed) return;

    const unlockedBatch: RTBatch = {
      ...activeRT,
      isLocked: false,
      lockedBy: undefined,
      lockedDate: undefined,
    };

    if (onUpdateRTBatch) {
      onUpdateRTBatch(unlockedBatch);
    } else {
      onSaveRTBatch(unlockedBatch);
    }
    setAdminUnlocked(true);
    showToast(`Receiving Ticket ${activeRT.rtNumber} unlocked for editing.`, 'info');
  };

  // Robust field resolvers for Return Tickets
  const resolveRtDate = (rt?: RTBatch | null): string => {
    if (!rt) return '—';
    const val = getValidDateString(
      rt.rtDate,
      rt.backloadRmDate,
      (rt as any).Date_In,
      (rt as any).dateIn,
      (rt as any).DateIn,
      (rt as any).rmDate,
      (rt as any).date,
      (rt as any).ticketDate,
      (rt.toolLines || []).find((l: any) => getValidDateString(l.dateIn, l.Date_In, l.returnDate))?.dateIn,
      (rt.toolLines || []).find((l: any) => getValidDateString(l.Date_In))?.Date_In,
      jobData.demobDate,
      jobData.lastRtDate
    );
    if (val) return formatDateDD_MM_YYYY(val);
    return '—';
  };

  const resolveRtLoadingNoteNo = (rt?: RTBatch | null): string => {
    if (!rt) return '—';
    const val =
      rt.loadingNoteNo ||
      rt.lNoteNo ||
      (rt as any).LNoteNo ||
      (rt as any).l_note_no ||
      (rt as any).loadingNote ||
      (rt as any).lnNo ||
      (rt as any).LNNo;
    const clean = String(val || '').trim();
    if (!clean || clean === '—' || clean === '-' || clean === 'null' || clean === 'undefined') return '—';
    return clean;
  };

  const resolveRtLoadingNoteDate = (rt?: RTBatch | null): string => {
    if (!rt) return '—';
    const val = getValidDateString(
      rt.loadingNoteDate,
      rt.lNoteDate,
      (rt as any).LNoteDate,
      (rt as any).l_note_date,
      (rt as any).loadingDate
    );
    if (val) return formatDateDD_MM_YYYY(val);
    return '—';
  };

  const resolveRtCarrier = (rt?: RTBatch | null): string => {
    if (!rt) return '—';
    const val = rt.carrier || rt.shippedVia || (rt as any).transporter;
    const clean = String(val || '').trim();
    if (!clean || clean === '—' || clean === '-' || clean === 'null' || clean === 'undefined') return '—';
    return clean;
  };

  const handleCreateNewRTInJob = () => {
    if (isClosedOrInvoiced || isLocked) {
      showToast('Cannot create return ticket: this job is invoiced and locked.', 'error');
      return;
    }
    const curYr = new Date().getFullYear().toString().slice(-2);
    const rtNums = rtBatches
      .map((b) => {
        const m = b.rtNumber.match(/^RT-\d+-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextSeq = rtNums.length > 0 ? Math.max(...rtNums) + 1 : 1;
    const newRtNumber = `RT-${curYr}-${String(nextSeq).padStart(5, '0')}`;
    const defaultDate = jobData.demobDate || new Date().toISOString().split('T')[0];

    const newRT: RTBatch = {
      id: `RTB-${Date.now()}`,
      rtNumber: newRtNumber,
      jobId: jobData.id || jobData.jobNumber || '',
      rtDate: defaultDate,
      backloadRmDate: defaultDate,
      loadingNoteNo: '',
      loadingNoteDate: '',
      contract: jobData.contractNo || jobData.contract || '',
      rig: jobData.rig || '',
      well: jobData.well || '',
      receivedBy: '',
      carrier: '',
      toolLines: [],
    };

    onSaveRTBatch(newRT);
    setSelectedRTNumber(newRT.rtNumber);
    showToast(`New Return Ticket ${newRtNumber} created for Job ${jobData.id}. Please enter Loading Note and receiving details.`, 'success');
  };

  const handleUpdateRTHeaderField = (field: keyof RTBatch | string, value: any) => {
    const targetRT = effectiveRT;
    if (!targetRT || isClosedOrInvoiced || isLocked) return;
    const updatedRT: RTBatch = {
      ...targetRT,
      [field]: value,
    };
    if (field === 'loadingNoteNo') {
      (updatedRT as any).lNoteNo = value;
    }
    if (field === 'loadingNoteDate') {
      (updatedRT as any).lNoteDate = value;
    }
    if (field === 'carrier') {
      (updatedRT as any).shippedVia = value;
    }
    if (field === 'rtDate') {
      (updatedRT as any).backloadRmDate = value;
    }
    if (activeRT && onUpdateRTBatch) {
      onUpdateRTBatch(updatedRT);
    } else {
      onSaveRTBatch(updatedRT);
      setSelectedRTNumber(updatedRT.rtNumber);
    }
  };

  const handleUpdateRTToolLine = (lineIdx: number, updates: Partial<ToolItem> | any) => {
    if (!activeRT || isClosedOrInvoiced || isLocked) return;
    const updatedToolLines = (activeRT.toolLines || []).map((line, idx) => {
      if (idx === lineIdx) {
        return {
          ...line,
          ...updates,
        };
      }
      return line;
    });
    const updatedRT: RTBatch = {
      ...activeRT,
      toolLines: updatedToolLines,
    };
    if (onUpdateRTBatch) {
      onUpdateRTBatch(updatedRT);
    } else {
      onSaveRTBatch(updatedRT);
    }
  };

  // Return Goods: Filter DTs that actually have unreturned tools
  const unreturnedDTs = useMemo(() => {
    return jobDTs.filter((dt) => {
      const lines = dt.toolLines || [];
      const unreturned = lines.filter((line) => {
        const isReturned = jobRTs.some((rt) =>
          (rt.toolLines || []).some((rtl) => rtl.serial === line.serial || (line.assetNo && rtl.assetNo === line.assetNo))
        );
        return !isReturned;
      });
      return unreturned.length > 0;
    });
  }, [jobDTs, jobRTs]);

  // RGT Lower Table: Selected DT for tool backload
  const [rgtSearchDTNo, setRgtSearchDTNo] = useState<string>(() => {
    return unreturnedDTs[0]?.dtNumber || jobDTs[0]?.dtNumber || '';
  });
  useEffect(() => {
    if (unreturnedDTs.length > 0 && !unreturnedDTs.some((d) => d.dtNumber === rgtSearchDTNo)) {
      setRgtSearchDTNo(unreturnedDTs[0].dtNumber);
    }
  }, [unreturnedDTs, rgtSearchDTNo]);

  const [rgtCheckedSerials, setRgtCheckedSerials] = useState<string[]>([]);
  const [rgtMoveDateIn, setRgtMoveDateIn] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const rgtDTToolsToReturn = useMemo(() => {
    if (!rgtSearchDTNo) return [];
    const targetDT = jobDTs.find((d) => d.dtNumber === rgtSearchDTNo);
    if (!targetDT) return [];
    const lines = targetDT.toolLines || [];
    // Only show tools not yet in an RT
    return lines.filter((line) => {
      const isReturned = jobRTs.some((rt) =>
        (rt.toolLines || []).some((rtl) => rtl.serial === line.serial || (line.assetNo && rtl.assetNo === line.assetNo))
      );
      return !isReturned;
    });
  }, [jobDTs, jobRTs, rgtSearchDTNo]);

  // Save Job Record (Unified save handler)
  const handleSaveJobHeader = () => {
    handleExplicitSaveJob();
  };

  // Update Callout Header Values
  const handleUpdateCalloutHeader = (field: string, val: string) => {
    if (isClosedOrInvoiced || isLocked) return;
    const updatedCallout = {
      ...activeCallout,
      [field]: val,
    } as Callout;
    if (onSaveCallout) {
      onSaveCallout(updatedCallout);
    }
  };

  // Insert Personnel from Modal
  const handleInsertSelectedPersonnel = () => {
    if (isClosedOrInvoiced || isLocked) return;
    const selectedPersons = MASTER_PERSONNEL_ROSTER.filter((p) => checkedPersonnelBadges.includes(p.badgeNo));
    const newMembers: JobCrewMember[] = selectedPersons.map((p, idx) => ({
      id: `CREW-${Date.now()}-${idx}`,
      badgeNo: p.badgeNo,
      name: p.name,
      designation: p.designation,
      mobDate: formatDateDD_MM_YYYY(jobData.mobDate || new Date().toISOString()),
      demobDate: undefined,
      dailyRateUSD: p.dailyRateUSD,
      operatingDays: 7,
      standbyDays: 0,
      totalChargeUSD: 7 * p.dailyRateUSD,
      rigPassNo: p.rigPassNo,
      h2sExpiry: p.h2sExpiry,
      status: 'Mobilized (On Rig)',
      contactNo: p.contactNo,
    }));

    const updatedCrew = [...assignedCrew, ...newMembers];
    setAssignedCrew(updatedCrew);
    setCheckedPersonnelBadges([]);
    setIsPersonnelSelectOpen(false);

    const updatedJob = { ...jobData, crewMembers: updatedCrew };
    setJobData(updatedJob);
    onSaveJob(updatedJob);

    showToast(`Assigned ${newMembers.length} certified engineer(s) to Rig ${jobData.rig}.`, 'success');
  };

  // Save / Update Master Crew Member (Admin Only)
  const handleSaveMasterCrewMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!crewFormData.badgeNo.trim()) {
      showToast('Badge number is required.', 'error');
      return;
    }
    if (!crewFormData.name.trim()) {
      showToast('Full name is required.', 'error');
      return;
    }

    if (editingCrewId) {
      updateCrewPersonnel(editingCrewId, crewFormData);
      showToast(`Updated personnel record for ${crewFormData.name}.`, 'success');
    } else {
      addCrewPersonnel(crewFormData);
      showToast(`Added ${crewFormData.name} to Master Certified Personnel.`, 'success');
    }
    setMasterCrew(loadCrewPersonnel());
    setIsCrewFormModalOpen(false);
  };

  // Delete Crew Member
  const handleDeleteCrewMember = (id: string) => {
    if (isClosedOrInvoiced || isLocked) return;
    const updated = assignedCrew.filter((c) => c.id !== id);
    setAssignedCrew(updated);
    const updatedJob = { ...jobData, crewMembers: updated };
    setJobData(updatedJob);
    onSaveJob(updatedJob);
    showToast('Crew member removed from this job.', 'info');
  };

  // Insert tools from modal to checklist
  const handleInsertSelectedTools = () => {
    if (isClosedOrInvoiced || isLocked) return;
    const newlySelectedTools = inventory.filter((t) => {
      const key = (t.id ? String(t.id).trim() : '') || (t.serial ? String(t.serial).trim() : '') || (t.assetNo ? String(t.assetNo).trim() : '');
      return checkedToolSerials.includes(key) || (t.serial && checkedToolSerials.includes(t.serial));
    });
    const newItems: CalloutItem[] = newlySelectedTools.map((t, idx) => {
      const resolved = resolveToolDetails(t.serial, t.assetNo, t.desc, t.shortDesc, t.supplier, t.ownership);

      const toolKey = (t.id ? String(t.id).trim() : '') || (t.serial ? String(t.serial).trim() : '') || (t.assetNo ? String(t.assetNo).trim() : '');
      const pickedAssetNo = checkedToolDisplayMap[toolKey] || (t.serial ? checkedToolDisplayMap[t.serial] : '') || (t.assetNo ? checkedToolDisplayMap[t.assetNo] : '');

      const _tAsset  = String(t.assetNo   || '').trim();
      const _tSerial = String(t.serial     || '').trim();
      const _tOem    = String(t.oemSerial  || '').trim();
      const _isEmd   = (v: string) => !v || v.toUpperCase().startsWith('EMD-');

      // The exact asset number the user selected from the screen
      const exactAssetNo: string =
        pickedAssetNo ||
        (!_isEmd(_tAsset)  ? _tAsset  : '') ||
        (!_isEmd(_tSerial) ? _tSerial : '') ||
        (!_isEmd(_tOem)    ? _tOem    : '') ||
        _tAsset || _tSerial || resolved.assetNo || '—';

      const exactSerial: string =
        (!_isEmd(_tSerial) ? _tSerial : '') ||
        (!_isEmd(_tAsset)  ? _tAsset  : '') ||
        (!_isEmd(_tOem)    ? _tOem    : '') ||
        exactAssetNo || _tSerial || resolved.serial || '—';

      const exactDesc = t.desc || t.shortDesc || resolved.desc;
      // resolved.shortDesc already runs extractToolType() over t.desc/t.shortDesc
      // and only keeps the raw inventory shortDesc when it is a clean, short
      // category name — use it directly so a tool whose inventory shortDesc
      // field actually holds a long technical description doesn't get copied
      // verbatim into the Checklist's Category column.
      const exactShortDesc = resolved.shortDesc;
      const exactSize = t.size || resolved.inv?.size || '—';
      const exactSupplier = t.supplier || t.ownership || resolved.supplier;

      // Look up genuine inspection record for this tool
      const toolInspections = (inspections || []).filter(
        (ins) =>
          (ins.serial && exactSerial && ins.serial.trim().toLowerCase() === exactSerial.trim().toLowerCase()) ||
          (ins.serial && exactAssetNo && ins.serial.trim().toLowerCase() === exactAssetNo.trim().toLowerCase()) ||
          (ins.serial && t.serial && ins.serial.trim().toLowerCase() === t.serial.trim().toLowerCase()) ||
          (ins.serial && t.assetNo && ins.serial.trim().toLowerCase() === t.assetNo.trim().toLowerCase())
      );
      const latestIns = toolInspections.length > 0
        ? [...toolInspections].sort(
            (a, b) =>
              new Date(b.inspectionDate || b.reportDate || b.receivedDate || '').getTime() -
              new Date(a.inspectionDate || a.reportDate || a.receivedDate || '').getTime()
          )[0]
        : null;

      const rawInsDate = latestIns?.inspectionDate || latestIns?.reportDate || latestIns?.receivedDate;
      const genuineInsDate = rawInsDate
        ? formatDateDD_MM_YYYY(rawInsDate)
        : (t.addedDate ? formatDateDD_MM_YYYY(t.addedDate) : '—');
      const genuineInsNum = latestIns?.reportNumber || latestIns?.woNumber || latestIns?.id || '—';
      const genuineCondition = latestIns?.status
        ? latestIns.status.toUpperCase()
        : (t.status?.toUpperCase() === 'GOOD' ? 'ACCEPTED' : (t.status?.toUpperCase() || 'ACCEPTED'));

      return {
        seq: checklistItems.length + idx + 1,
        size: exactSize,
        shortDesc: exactShortDesc,
        qty: 1,
        assigned: 1,
        serialNos: [exactSerial],
        status: 'Assigned',
        partNo: exactAssetNo,
        description: exactDesc,
        supplier: exactSupplier,
        ownership: exactSupplier,
        isEmdad: resolved.isEmdad,
        qtyIn: 1,
        insNum: genuineInsNum,
        insDate: genuineInsDate,
        comments: genuineCondition,
        cat: exactShortDesc,
        condition: genuineCondition,
        allocatedRig: jobData.rig || '',
        allocatedWell: jobData.well || '',
        clientDtNo: '',
        mobDate: formatDateDD_MM_YYYY(new Date().toISOString()),
      };
    });

    const updated = [...checklistItems, ...newItems];
    setChecklistItems(updated);
    setCheckedToolSerials([]);
    setCheckedToolDisplayMap({});
    setToolSearchQuery('');
    setIsToolSelectOpen(false);

    const calloutToSave = ({
      ...activeCallout,
      jobId: jobData.id,
      jobNumber: jobData.id,
      items: updated,
    } as unknown) as Callout;

    setSelectedCalloutId(calloutToSave.id);

    if (onSaveCallout) {
      onSaveCallout(calloutToSave);
    }

    if (!jobData.calloutId || jobData.calloutId !== calloutToSave.id) {
      const updatedJob = { ...jobData, calloutId: calloutToSave.id };
      setJobData(updatedJob);
      onSaveJob(updatedJob);
    }

    showToast(`Inserted ${newItems.length} tool(s) into Checklist. Reserved for Job ${jobData.id}.`, 'success');
  };

  // Update specific fields on a checklist item (allocatedRig, allocatedWell, clientDtNo, partNo)
  const handleUpdateChecklistItemField = (seq: number, field: 'allocatedRig' | 'allocatedWell' | 'clientDtNo' | 'partNo', value: string) => {
    if ((isClosedOrInvoiced || isLocked) && !adminUnlocked) return;
    const cleanVal = value.trim();
    const updated = checklistItems.map((ci) => {
      if (ci.seq === seq) {
        if (field === 'partNo') {
          return { ...ci, partNo: cleanVal, serialNos: [cleanVal] };
        }
        return { ...ci, [field]: value };
      }
      return ci;
    });
    setChecklistItems(updated);

    // If item is already on a DT, update that DT batch's toolLine as well
    const targetItem = checklistItems.find((ci) => ci.seq === seq);
    if (targetItem && targetItem.dtNumber) {
      const targetDT = dtBatches.find((b) => b.dtNumber === targetItem.dtNumber);
      if (targetDT && onUpdateDTBatch) {
        const itemSerial = (targetItem.serialNos?.[0] || targetItem.partNo || '').trim().toUpperCase();
        const updatedToolLines = (targetDT.toolLines || []).map((tl) => {
          const s = (tl.serial || '').trim().toUpperCase();
          const a = (tl.assetNo || '').trim().toUpperCase();
          if (s === itemSerial || a === itemSerial) {
            if (field === 'partNo') {
              return { ...tl, assetNo: cleanVal, serial: cleanVal, AssetNo: cleanVal, Serial: cleanVal };
            }
            return { ...tl, [field]: value };
          }
          return tl;
        });
        onUpdateDTBatch({ ...targetDT, toolLines: updatedToolLines });
      }
    }

    const calloutToSave = ({
      ...activeCallout,
      jobId: jobData.id,
      jobNumber: jobData.id,
      items: updated,
    } as unknown) as Callout;
    if (onSaveCallout) onSaveCallout(calloutToSave);
  };

  // Direct Admin / User update of DT line Asset No
  const handleUpdateDTLineAssetNo = (idx: number, newAssetNo: string) => {
    if ((isClosedOrInvoiced || isLocked) && !adminUnlocked) return;
    if (!effectiveDT || !onUpdateDTBatch) return;
    const cleanAsset = newAssetNo.trim();
    if (!cleanAsset) return;
    const updatedLines = (effectiveDT.toolLines || []).map((tl, i) => {
      if (i === idx) {
        return { ...tl, assetNo: cleanAsset, serial: cleanAsset, AssetNo: cleanAsset, Serial: cleanAsset };
      }
      return tl;
    });
    const updatedDT = { ...effectiveDT, toolLines: updatedLines };
    onUpdateDTBatch(updatedDT);
    showToast(`Updated tool line ${idx + 1} Asset No to ${cleanAsset}`, 'success');
  };

  // Rollover unreturned tools from previous month's job into current checklist
  const handleConfirmRolloverFromPreviousJob = () => {
    if (unreturnedToolsFromPreviousJob.length === 0) {
      showToast('No unreturned tools found in the selected previous job.', 'info');
      return;
    }

    // Check which tools are already in this checklist to prevent duplicates
    const currentSerials = new Set<string>();
    checklistItems.forEach((ci) => {
      const s = (ci.serialNos?.[0] || '').trim().toUpperCase();
      const a = (ci.partNo || '').trim().toUpperCase();
      if (s) currentSerials.add(s);
      if (a) currentSerials.add(a);
    });

    const newRolloverItems: CalloutItem[] = [];
    unreturnedToolsFromPreviousJob.forEach((tl) => {
      const s = (tl.serial || '').trim().toUpperCase();
      const a = (tl.assetNo || '').trim().toUpperCase();
      if ((s && currentSerials.has(s)) || (a && currentSerials.has(a))) {
        return; // already in this checklist
      }

      const resolved = resolveToolDetails(tl.serial, tl.assetNo, tl.desc, tl.shortDesc, tl.supplier || tl.ownership);
      newRolloverItems.push({
        seq: checklistItems.length + newRolloverItems.length + 1,
        size: tl.size || resolved.inv?.size || '—',
        shortDesc: resolved.shortDesc,
        qty: 1,
        assigned: 1,
        serialNos: [resolved.serial],
        status: 'Assigned',
        partNo: getCleanAssetNo(tl.assetNo, resolved.assetNo, tl.serial, resolved.serial),
        description: tl.desc || resolved.desc,
        supplier: resolved.supplier,
        ownership: resolved.supplier,
        isEmdad: resolved.isEmdad,
        qtyIn: 1,
        insNum: tl.insNum || '—',
        insDate: tl.insDate || '—',
        comments: 'ROLLOVER ACTIVE',
        cat: resolved.shortDesc,
        condition: 'ACCEPTED',
        allocatedRig: tl.allocatedRig || '',
        allocatedWell: tl.allocatedWell || '',
        clientDtNo: tl.clientDtNo || '',
        mobDate: formatDateDD_MM_YYYY(tl.dispatchDate || new Date().toISOString()),
      });
    });

    if (newRolloverItems.length === 0) {
      showToast('All unreturned tools from the selected job are already present in this checklist.', 'info');
      setIsRolloverModalOpen(false);
      return;
    }

    const updated = [...checklistItems, ...newRolloverItems];
    setChecklistItems(updated);
    setIsRolloverModalOpen(false);

    const calloutToSave = ({
      ...activeCallout,
      jobId: jobData.id,
      jobNumber: jobData.id,
      items: updated,
    } as unknown) as Callout;

    if (onSaveCallout) onSaveCallout(calloutToSave);

    showToast(`Successfully rolled over ${newRolloverItems.length} active unreturned tool(s) from ${selectedPreviousJobId}!`, 'success');
  };

  // Delete row from checklist
  const handleDeleteChecklistRow = (seq: number) => {
    if (isClosedOrInvoiced || isLocked) return;
    const itemToDelete = checklistItems.find((item) => item.seq === seq);
    if (itemToDelete) {
      const assigned = getAssignedDTForChecklistItem(itemToDelete);
      if (assigned?.isLocked) {
        showToast(`Cannot delete tool ${itemToDelete.serialNos?.[0] || itemToDelete.partNo}: already dispatched on Delivery Ticket ${assigned.dtNumber}.`, 'error');
        return;
      }
    }
    const updated = checklistItems
      .filter((item) => item.seq !== seq)
      .map((item, idx) => ({ ...item, seq: idx + 1 }));
    setChecklistItems(updated);
    setSelectedChecklistSeqs((prev) => prev.filter((s) => s !== seq));
    const calloutToSave = ({
      ...activeCallout,
      jobId: jobData.id,
      jobNumber: jobData.id,
      items: updated,
    } as unknown) as Callout;
    saveCustomCallout(calloutToSave);
    if (onSaveCallout) {
      onSaveCallout(calloutToSave);
    }
    showToast('Row removed from checklist and released back to yard availability.', 'info');
  };

  // AUTOMATED LIFECYCLE BRIDGE: Generate Delivery Ticket (DT) from Checklist
  const handleGenerateDTFromChecklist = () => {
    if (isClosedOrInvoiced || isLocked) {
      showToast('Action disabled: Invoiced jobs cannot generate new delivery tickets.', 'error');
      return;
    }
    if (checklistItems.length === 0) {
      showToast('No tools in checklist to generate Delivery Ticket from.', 'error');
      return;
    }

    // Determine pending tools that have been selected/checked by the user
    const selectedSet = new Set(selectedChecklistSeqs);
    const toolsToMobilize = pendingChecklistItems.filter((ci) => selectedSet.has(ci.seq));

    if (toolsToMobilize.length === 0) {
      if (pendingChecklistItems.length === 0) {
        showToast('All tools in the checklist have already been dispatched on Delivery Tickets. Click "+ Select Tools" to add equipment for a new mobilization.', 'info');
      } else {
        showToast('Please check the box for at least one pending tool to generate a Delivery Ticket.', 'error');
      }
      return;
    }

    const confirmed = window.confirm(
      `Generate Delivery Ticket for ${toolsToMobilize.length} selected tool(s)?\n\n` +
      `• Job: ${jobData.id} (${jobData.rig} / ${jobData.well})\n` +
      `• Equipment Count: ${toolsToMobilize.length} tool(s)\n\n` +
      `This will create an editable Draft Manifest. The ticket will NOT be dispatched or locked until you review and confirm dispatch.`
    );
    if (!confirmed) return;

    const curYr = new Date().getFullYear().toString().slice(-2);
    const existingSeqs = dtBatches
      .filter((b) => {
        const s = String(b.dtNumber || '').toUpperCase();
        return !s.includes('10001') && !s.includes('100001') && !s.includes('10002');
      })
      .map((b) => {
        const m = (b.dtNumber || '').match(/^DT-(?:\d+-)?(\d+)$/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n) && n > 0 && n < 10000);
    let nextSeq = existingSeqs.length > 0 ? Math.max(...existingSeqs) + 1 : 2393;
    while (dtBatches.some((b) => String(b.dtNumber || '').toUpperCase() === `DT-${curYr}-${String(nextSeq).padStart(5, '0')}`)) {
      nextSeq++;
    }
    const nextDTNum = `DT-${curYr}-${String(nextSeq).padStart(5, '0')}`;

    const newDT: DTBatch = {
      id: `DTB-${Date.now()}`,
      dtNumber: nextDTNum,
      jobId: jobData.id,
      jobNumber: jobData.id,
      rmDate: new Date().toISOString().split('T')[0],        // YYYY-MM-DD — required by <input type="date">
      rmRef: `MR-${jobData.id.slice(-4) || '881'}`,
      dispatchDate: new Date().toISOString().split('T')[0],  // YYYY-MM-DD
      deliveryDate: new Date().toISOString().split('T')[0],  // YYYY-MM-DD
      rig: jobData.rig,
      well: jobData.well,
      contract: jobData.contractNo || jobData.contract,
      dispatchedBy: user?.name || '',
      designation: '',
      deliveredTo: '',
      vesselBoat: '',
      msvName: '',
      transport: '',
      vehicleNo: '',
      vehicleVesselNo: '',
      driverName: '',
      contactNo: '',
      recipient: `${jobData.rig} Toolpusher`,
      notes: '',
      isLocked: false,
      toolLines: toolsToMobilize.map((ci, idx) => buildDTLineFromChecklistItem(ci, idx)),
    };

    onSaveDTBatch(newDT);

    // Update checklistItems so that mobilized items now link to this nextDTNum
    const mobilizeSeqs = new Set(toolsToMobilize.map((t) => t.seq));
    const updatedChecklistItems = checklistItems.map((ci) => {
      if (mobilizeSeqs.has(ci.seq)) {
        return {
          ...ci,
          dtNumber: nextDTNum,
          status: 'Released' as const,
        };
      }
      return ci;
    });
    setChecklistItems(updatedChecklistItems);

    // Remove mobilized seqs from selection
    setSelectedChecklistSeqs((prev) => prev.filter((seq) => !mobilizeSeqs.has(seq)));

    if (onSaveCallout) {
      onSaveCallout({
        ...activeCallout,
        status: 'Delivery Ticket - Created',
        items: updatedChecklistItems,
      });
    }

    setSelectedDTNumber(newDT.dtNumber);
    setActiveTab('delivery-tickets');
    showToast(`Delivery Ticket ${newDT.dtNumber} generated for ${toolsToMobilize.length} selected tool(s)!`, 'success');
  };

  // Delivery Ticket Confirmation & Lock (Ship to Rig)
  const handleConfirmAndLockDT = () => {
    const targetDT = effectiveDT;
    if (!targetDT) return;
    const count = targetDT.toolLines?.length || 0;
    const confirmed = window.confirm(
      adminUnlocked
        ? `Confirm corrections and re-lock Delivery Ticket ${targetDT.dtNumber}?\n\n` +
          `• Equipment Count: ${count}\n` +
          `• Destination: Rig ${jobData.rig} / Well ${jobData.well}\n\n` +
          `This will save all corrected DT fields, lock the Delivery Ticket, and restore the workspace to normal locked mode.`
        : `Are you sure you want to confirm dispatch and lock Delivery Ticket ${targetDT.dtNumber}?\n\n` +
          `• Tools to release: ${count}\n` +
          `• Destination: Rig ${jobData.rig} / Well ${jobData.well}\n\n` +
          `This confirms equipment has been released from yard and locks this ticket against modifications.`
    );
    if (!confirmed) return;

    const updatedToolLines = (targetDT.toolLines || []).map((tl) => {
      const resolved = resolveToolDetails(tl.serial, tl.assetNo, tl.desc, tl.shortDesc, tl.supplier || (tl as any).ownership);
      return {
        ...tl,
        assetNo: getCleanAssetNo(tl.assetNo, resolved.assetNo, tl.serial, resolved.serial),
        serial: resolved.serial,
        ownership: resolved.supplier,
        supplier: resolved.supplier,
        isEmdad: resolved.isEmdad,
        desc: tl.desc || resolved.desc,
        shortDesc: resolved.shortDesc,
      };
    });

    const updatedBatch: DTBatch = {
      ...targetDT,
      toolLines: updatedToolLines,
      isLocked: true,
      lockedBy: user?.name || 'Operations',
      lockedDate: new Date().toISOString(),
      dispatchDate: targetDT.dispatchDate || new Date().toISOString().split('T')[0],
    };

    if (activeDT && onUpdateDTBatch) {
      onUpdateDTBatch(updatedBatch);
    } else {
      onSaveDTBatch(updatedBatch);
      setSelectedDTNumber(updatedBatch.dtNumber);
    }

    if (onSaveCallout) {
      onSaveCallout({
        ...activeCallout,
        items: checklistItems,
        status: 'Delivery Ticket - Dispatched to Rig' as any,
      });
    }

    if (adminUnlocked) {
      setAdminUnlocked(false);
    }

    showToast(`Delivery Ticket ${updatedBatch.dtNumber} confirmed and locked in normal position.`, 'success');
  };

  // Explicit Unlock Delivery Ticket
  const handleUnlockDT = () => {
    if (!activeDT) return;
    const confirmed = window.confirm(
      `Unlock Delivery Ticket ${activeDT.dtNumber} for editing?\n\n` +
      `• Job: ${jobData.id}\n` +
      `• Rig: ${jobData.rig} / Well: ${jobData.well}\n\n` +
      `This will unlock this Delivery Ticket so you can correct tool serials, remove duplicate lines, or re-sync from checklist.`
    );
    if (!confirmed) return;

    const unlockedBatch: DTBatch = {
      ...activeDT,
      isLocked: false,
      lockedBy: undefined,
      lockedDate: undefined,
    };

    if (onUpdateDTBatch) {
      onUpdateDTBatch(unlockedBatch);
    } else {
      onSaveDTBatch(unlockedBatch);
    }
    setAdminUnlocked(true);
    showToast(`Delivery Ticket ${activeDT.dtNumber} unlocked for editing.`, 'info');
  };

  // Re-sync tools on Delivery Ticket directly from Checklist
  const handleSyncToolsFromChecklist = () => {
    if (!activeDT) return;
    if (checklistItems.length === 0) {
      showToast('No tools in Checklist to sync. Please add tools in the Checklist tab first.', 'error');
      return;
    }
    const confirmed = window.confirm(
      `Sync Delivery Ticket ${activeDT.dtNumber} with the ${checklistItems.length} tool(s) currently in Checklist?\n\n` +
      `This will replace the tools currently on this ticket with your actual checklist tools.`
    );
    if (!confirmed) return;

    // Deduplicate checklist items by serial / assetNo
    const seenKeys = new Set<string>();
    const deduplicatedChecklist = checklistItems.filter((ci) => {
      const s = String(ci.serialNos?.[0] || ci.partNo || '').trim().toUpperCase();
      if (!s) return true;
      if (seenKeys.has(s)) return false;
      seenKeys.add(s);
      return true;
    });

    const syncedTools = deduplicatedChecklist.map((ci, idx) => buildDTLineFromChecklistItem(ci, idx));

    const updatedBatch: DTBatch = {
      ...activeDT,
      toolLines: syncedTools,
    };

    if (onUpdateDTBatch) {
      onUpdateDTBatch(updatedBatch);
    } else {
      onSaveDTBatch(updatedBatch);
    }

    const updatedChecklist = checklistItems.map((ci) => ({
      ...ci,
      dtNumber: activeDT.dtNumber,
      status: 'Released' as const,
    }));
    setChecklistItems(updatedChecklist);
    if (onSaveCallout) {
      onSaveCallout({
        ...activeCallout,
        items: updatedChecklist,
      });
    }

    showToast(`Updated Delivery Ticket ${activeDT.dtNumber} with ${syncedTools.length} tool(s) from Checklist.`, 'success');
  };

  // Delete Delivery Ticket
  const handleDeleteCurrentDT = () => {
    if (!activeDT) return;
    const dtNum = activeDT.dtNumber;
    const confirmed = window.confirm(
      `Delete Delivery Ticket ${dtNum}?\n\n` +
      `• Job: ${jobData.id} (${jobData.rig} / ${jobData.well})\n` +
      `• Equipment Count: ${activeDT.toolLines?.length || 0} tool(s)\n\n` +
      `This will permanently delete this Delivery Ticket, return assigned tools to yard inventory, and reset checklist tools so you can re-generate a new ticket.`
    );
    if (!confirmed) return;

    if (onDeleteDTBatch) {
      onDeleteDTBatch(dtNum);
    }
    setSelectedDTNumber('');

    const targetUpper = (dtNum || '').trim().toUpperCase();
    const isOnlyDT = jobDTs.length <= 1;

    const updatedChecklist = checklistItems.map((ci) => {
      const ciDt = (ci.dtNumber || '').trim().toUpperCase();
      if (ciDt === targetUpper || isOnlyDT) {
        return { ...ci, dtNumber: undefined, status: 'Assigned' as const };
      }
      return ci;
    });
    setChecklistItems(updatedChecklist);
    if (onSaveCallout) {
      onSaveCallout({
        ...activeCallout,
        status: 'Active',
        items: updatedChecklist,
      });
    }

    showToast(`Delivery Ticket ${dtNum} deleted successfully. Checklist reset for new dispatch.`, 'info');
  };

  // Remove individual tool line from active DT
  const handleRemoveToolLineFromDT = (lineIndex: number) => {
    if (!activeDT) return;
    const targetLine = activeDT.toolLines[lineIndex];
    const updatedLines = activeDT.toolLines.filter((_, i) => i !== lineIndex);
    const updatedDT: DTBatch = {
      ...activeDT,
      toolLines: updatedLines,
    };

    if (onUpdateDTBatch) {
      onUpdateDTBatch(updatedDT, undefined, targetLine ? [{ serial: targetLine.serial, assetNo: targetLine.assetNo } as any] : undefined);
    } else {
      onSaveDTBatch(updatedDT);
    }

    if (targetLine?.serial) {
      const s = targetLine.serial.trim().toUpperCase();
      const updatedChecklist = checklistItems.map((ci) => {
        const cSerial = (ci.serialNos?.[0] || ci.partNo || '').trim().toUpperCase();
        if (cSerial === s && ci.dtNumber === activeDT.dtNumber) {
          return { ...ci, dtNumber: undefined, status: 'Assigned' as const };
        }
        return ci;
      });
      setChecklistItems(updatedChecklist);
    }

    showToast(`Removed tool line #${lineIndex + 1} from Delivery Ticket ${activeDT.dtNumber}.`, 'info');
  };

  // Transfer checked tools from Lower DT to Upper RT
  const handleMoveToolsToRT = () => {
    if (isClosedOrInvoiced || isLocked) {
      showToast('Action disabled: Invoiced jobs cannot accept new returns.', 'error');
      return;
    }
    if (rgtCheckedSerials.length === 0) {
      showToast('Please check at least one tool to return.', 'error');
      return;
    }

    let targetRT = activeRT;
    if (!targetRT) {
      // Automatically create a new RT batch for this job
      const curYr = new Date().getFullYear().toString().slice(-2);
      const rtNums = rtBatches
        .map((b) => {
          const m = b.rtNumber.match(/^RT-\d+-(\d+)$/);
          return m ? parseInt(m[1], 10) : 0;
        })
        .filter((n) => !isNaN(n));
      const nextSeq = rtNums.length > 0 ? Math.max(...rtNums) + 1 : 1;
      const newRtNumber = `RT-${curYr}-${String(nextSeq).padStart(5, '0')}`;
      const defaultDate = rgtMoveDateIn || jobData.demobDate || new Date().toISOString().split('T')[0];

      targetRT = {
        id: `RTB-${Date.now()}`,
        rtNumber: newRtNumber,
        jobId: jobData.id || jobData.jobNumber || '',
        rtDate: defaultDate,
        backloadRmDate: defaultDate,
        loadingNoteNo: '',
        loadingNoteDate: '',
        contract: jobData.contractNo || jobData.contract || '',
        rig: jobData.rig || '',
        well: jobData.well || '',
        receivedBy: '',
        carrier: '',
        toolLines: [],
      };
    }

    const selectedLines = rgtDTToolsToReturn.filter((t) => rgtCheckedSerials.includes(t.serial));
    const effectiveReturnDate = rgtMoveDateIn || toInputDateFormat(resolveRtDate(targetRT)) || new Date().toISOString().split('T')[0];
    const formattedReturnDate = formatDateDD_MM_YYYY(effectiveReturnDate);

    const newRTLines = selectedLines.map((t, idx) => {
      const resolved = resolveToolDetails(t.serial, t.assetNo, t.desc, t.shortDesc, t.supplier || (t as any).ownership);
      return {
        itemNo: (targetRT!.toolLines?.length || 0) + idx + 1,
        serial: resolved.serial || t.serial,
        assetNo: getCleanAssetNo(t.assetNo, resolved.assetNo, t.serial, resolved.serial),
        shortDesc: t.shortDesc || resolved.shortDesc,
        desc: t.desc || resolved.desc,
        size: t.size,
        used: true,
        condition: 'USED',
        routedTo: 'Inspection Bay',
        remarks: 'USED',
        dateIn: formattedReturnDate,
        Date_In: formattedReturnDate,
        rtDate: formattedReturnDate,
        rtNumber: targetRT!.rtNumber,
      };
    });

    const updatedRT: RTBatch = {
      ...targetRT,
      toolLines: [...(targetRT.toolLines || []), ...newRTLines],
    };

    if (onUpdateRTBatch && activeRT) {
      onUpdateRTBatch(updatedRT);
    } else {
      onSaveRTBatch(updatedRT);
    }
    setSelectedRTNumber(updatedRT.rtNumber);
    setRgtCheckedSerials([]);
    showToast(`Moved ${newRTLines.length} tool(s) to Return Ticket ${updatedRT.rtNumber} with Date In ${formattedReturnDate}.`, 'success');
  };

  // Official EMDAD Ticket & Manifest Print Handlers
  const handlePrintDeliveryTicket = (dt?: DTBatch) => {
    const targetDT = dt || effectiveDT;
    if (!targetDT) {
      alert('Please select or create a Delivery Ticket first.');
      return;
    }
    const deliveredTo = getDTField(targetDT, 'deliveredTo');
    const msvName = getDTField(targetDT, 'vesselBoat') || getDTField(targetDT, 'msvName');
    const vehicleVesselNo = getDTField(targetDT, 'vehicleNo') || getDTField(targetDT, 'vehicleVesselNo') || getDTField(targetDT, 'vesselNo');
    const driverName = getDTField(targetDT, 'driverName');
    const contactNo = getDTField(targetDT, 'contactNo');

    const printData: DeliveryTicketPrintData = {
      dtNumber: targetDT.dtNumber,
      client: jobData.client || '—',
      materialRequest: targetDT.rmRef || 'MR FROM CLIENT',
      jobNumber: jobData.id || '—',
      clientRef: (jobData as any).clientRef || '—',
      radioMsgNo: 'N/A',
      serviceTicket: jobData.id || '—',
      ticketNo: targetDT.dtNumber,
      contractNo: jobData.contractNo || cleanContractName(jobData.contract) || '—',
      rig: jobData.rig || targetDT.rig || '—',
      well: jobData.well || targetDT.well || '—',
      shippedDate: formatDateDD_MM_YYYY(targetDT.dispatchDate || targetDT.rmDate || new Date()),
      deliveredTo: deliveredTo || '—',
      msvName: msvName || '—',
      vehicleVesselNo: vehicleVesselNo || '—',
      driverName: driverName || '—',
      contactNo: contactNo || '—',
      notes: targetDT.notes,
      tools: (targetDT.toolLines || []).map((t, idx) => {
        const resolved = resolveToolDetails(t.serial, t.assetNo, t.desc, t.shortDesc, t.supplier || (t as any).ownership);
        return {
          itemNo: idx + 1,
          partNo: getCleanAssetNo(t.assetNo, resolved.assetNo, t.serial, resolved.serial),
          serial: resolved.serial,
          description: t.desc || resolved.desc,
          qty: t.qty || 1,
          size: t.size || resolved.inv?.size || '—',
        };
      }),
    };
    const html = generateDeliveryTicketHtml(printData);
    openPrintWindow(html, `Delivery Ticket - ${targetDT.dtNumber}`);
  };

  const handlePrintDispatchChecklist = (dt?: DTBatch) => {
    const targetDT = dt || effectiveDT;
    let tools: Array<{ lineNo?: number | string; partNo?: string; description: string; qty: number }> = [];

    if (targetDT && targetDT.toolLines && targetDT.toolLines.length > 0) {
      tools = targetDT.toolLines.map((t, idx) => {
        const resolved = resolveToolDetails(t.serial, t.assetNo, t.desc, t.shortDesc, t.supplier || (t as any).ownership);
        return {
          lineNo: idx + 1,
          partNo: getCleanAssetNo(t.assetNo, resolved.assetNo, t.serial, resolved.serial),
          description: t.desc || resolved.desc,
          qty: t.qty || 1,
        };
      });
    } else if (activeCallout && activeCallout.items && activeCallout.items.length > 0) {
      tools = activeCallout.items.flatMap((it, idx) => {
        const serials = it.serialNos || [];
        if (serials.length > 0) {
          return serials.map((s, sIdx) => {
            const resolved = resolveToolDetails(s, it.partNo, it.description, it.shortDesc || it.cat, it.supplier);
            return {
              lineNo: `${idx + 1}.${sIdx + 1}`,
              partNo: getCleanAssetNo(it.partNo, resolved.assetNo, s, resolved.serial),
              description: it.description || resolved.desc,
              qty: 1,
            };
          });
        }
        const resolved = resolveToolDetails(undefined, it.partNo, it.description, it.shortDesc || it.cat, it.supplier);
        return [{
          lineNo: idx + 1,
          partNo: getCleanAssetNo(it.partNo, resolved.assetNo, resolved.serial),
          description: it.description || resolved.desc,
          qty: (it as any).qtyRequired || it.qty || 1,
        }];
      });
    }

    const checklistData: DispatchChecklistPrintData = {
      ticketNo: targetDT?.dtNumber || jobData.id,
      project: jobData.id,
      projectDesc: jobData.serviceCategory || jobData.jobDescription || 'RENTAL DRILLING TOOLS',
      dtNumber: targetDT?.dtNumber || '—',
      rig: jobData.rig || '—',
      well: jobData.well || '—',
      date: formatDateDD_MM_YYYY(targetDT?.dispatchDate || new Date()),
      client: jobData.client || '—',
      wellId: (jobData as any).wellId,
      comments: targetDT?.notes || ((jobData as any).wellId ? `WELL'S ID - ${(jobData as any).wellId}` : undefined),
      tools: tools.length > 0 ? tools : [{ lineNo: 1, partNo: '—', description: 'No tools listed', qty: 1 }],
    };
    const html = generateDispatchChecklistHtml(checklistData);
    openPrintWindow(html, `Dispatch Checklist - ${checklistData.ticketNo}`);
  };

  const handlePrintReceivingTicket = (rt?: RTBatch) => {
    const targetRT = rt || effectiveRT;
    if (!targetRT) {
      alert('Please select or create a Receiving Ticket first.');
      return;
    }
    const printData: ReceivingTicketPrintData = {
      rtNumber: targetRT.rtNumber,
      client: jobData.client || '—',
      jobNumber: jobData.id || '—',
      vehicleVesselNo: resolveRtCarrier(targetRT) || 'CREST MERCURY TWO',
      clientRef: (jobData as any).clientRef || '—',
      projectNo: jobData.id || '—',
      lNoteNo: resolveRtLoadingNoteNo(targetRT) || '—',
      serviceTicketNo: jobData.id || '—',
      dateReceived: resolveRtDate(targetRT) || '—',
      rig: jobData.rig || targetRT.rig || '—',
      well: jobData.well || targetRT.well || '—',
      lNoteDate: resolveRtLoadingNoteDate(targetRT) || resolveRtDate(targetRT) || '—',
      notes: (targetRT as any).notes || undefined,
      tools: (targetRT.toolLines || []).map((t, idx) => {
        const resolved = resolveToolDetails(t.serial, t.assetNo, t.desc, t.shortDesc);
        return {
          itemNo: idx + 1,
          serialNo: resolved.assetNo,
          description: resolved.desc,
          qty: (t as any).qty || 1,
          remarks: t.used ? 'Used' : 'Not Used',
        };
      }),
    };
    const html = generateReceivingTicketHtml(printData);
    openPrintWindow(html, `Receiving Ticket - ${targetRT.rtNumber}`);
  };

  // Generic print handler for backwards compatibility
  const handlePrintTicket = (type: 'onshore' | 'offshore' | 'report' | 'pob' | 'delivery' | 'checklist' | 'rt') => {
    if (type === 'delivery') {
      handlePrintDeliveryTicket(activeDT);
      return;
    }
    if (type === 'checklist') {
      handlePrintDispatchChecklist(activeDT);
      return;
    }
    if (type === 'rt') {
      handlePrintReceivingTicket(activeRT);
      return;
    }
    if (activeTab === 'return-tickets' && activeRT) {
      handlePrintReceivingTicket(activeRT);
      return;
    }
    if (activeTab === 'delivery-tickets' && activeDT) {
      handlePrintDeliveryTicket(activeDT);
      return;
    }

    window.print();
  };

  // ==========================================
  // DYNAMIC UTILIZATION SHEET SETUP & DATA
  // ==========================================
  // Dynamic Month & Year selection initialized to first month of job
  const [selectedUtilMonth, setSelectedUtilMonth] = useState<number>(() => {
    return utilMonthOptions[0]?.month || (new Date().getMonth() + 1);
  });
  const [selectedUtilYear, setSelectedUtilYear] = useState<number>(() => {
    return utilMonthOptions[0]?.year || new Date().getFullYear();
  });

  // Keep month/year valid within available options
  useEffect(() => {
    const isValid = utilMonthOptions.some((o) => o.month === selectedUtilMonth && o.year === selectedUtilYear);
    if (!isValid && utilMonthOptions.length > 0) {
      setSelectedUtilMonth(utilMonthOptions[0].month);
      setSelectedUtilYear(utilMonthOptions[0].year);
    }
  }, [utilMonthOptions, selectedUtilMonth, selectedUtilYear]);

  // Number of days in the selected calendar month
  const daysInUtilMonth = useMemo(() => {
    return new Date(selectedUtilYear, selectedUtilMonth, 0).getDate();
  }, [selectedUtilYear, selectedUtilMonth]);

  const utilDaysList = useMemo(() => {
    return Array.from({ length: daysInUtilMonth }, (_, i) => i + 1);
  }, [daysInUtilMonth]);

  // Interactive cell overrides for daily tool utilization (persisted per job & synced with Azure SQL)
  const [customUtilStatuses, setCustomUtilStatuses] = useState<Record<string, string>>(() => {
    if (jobData.utilizationStatuses && Object.keys(jobData.utilizationStatuses).length > 0) {
      return jobData.utilizationStatuses;
    }
    const jId = (jobData.id || jobData.jobNumber || '').trim();
    if (jId) {
      try {
        const saved = localStorage.getItem(`emdad_job_util_statuses_${jId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      } catch {}
    }
    return {};
  });

  const [isLoadingUtilDb, setIsLoadingUtilDb] = useState(false);
  const [isSavingUtilDb, setIsSavingUtilDb] = useState(false);
  const [lastSavedUtilTime, setLastSavedUtilTime] = useState<string | null>(null);

  // Load live daily utilization records from Azure SQL on mount or when job changes
  useEffect(() => {
    let isCancelled = false;
    const jId = (jobData.id || jobData.jobNumber || '').trim();
    if (!jId) return;

    const cacheKey = `emdad_job_util_statuses_${jId}`;
    let initialMap: Record<string, string> = {};
    if (jobData.utilizationStatuses && Object.keys(jobData.utilizationStatuses).length > 0) {
      initialMap = { ...jobData.utilizationStatuses };
    } else {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) initialMap = JSON.parse(cached);
      } catch {}
    }

    if (Object.keys(initialMap).length > 0) {
      setCustomUtilStatuses(initialMap);
    }

    setIsLoadingUtilDb(true);
    fetchDailyFieldLogsApi(jId)
      .then((rows) => {
        if (isCancelled || !Array.isArray(rows) || rows.length === 0) return;
        const dbMap: Record<string, string> = {};
        rows.forEach((r: any) => {
          const serial = String(r.ToolSerial || r.toolSerial || r.assetNumber || '').trim();
          const rawDate = String(r.Date || r.date || '').trim();
          const status = String(r.Status || r.status || '').trim();
          if (!serial || !rawDate || (status !== '1' && status !== 'S' && status !== '')) return;

          const dMatch = rawDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
          if (dMatch) {
            const y = parseInt(dMatch[1], 10);
            const m = parseInt(dMatch[2], 10);
            const d = parseInt(dMatch[3], 10);
            dbMap[`${serial}_${y}_${m}_${d}`] = status;
            dbMap[`${serial.toUpperCase()}_${y}_${m}_${d}`] = status;
          }
        });

        if (Object.keys(dbMap).length > 0) {
          setCustomUtilStatuses((prev) => {
            const merged = { ...prev, ...dbMap };
            try {
              localStorage.setItem(cacheKey, JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      })
      .catch((err) => {
        console.warn('Could not fetch daily field logs for job:', err);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingUtilDb(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [jobData.id, jobData.jobNumber]);

  const handleToggleDayStatus = (toolKey: string, dayNum: number) => {
    if (isLocked) return;
    const key = `${toolKey}_${selectedUtilYear}_${selectedUtilMonth}_${dayNum}`;
    const cur = customUtilStatuses[key];
    let next = '1';
    if (cur === '1') next = 'S';
    else if (cur === 'S') next = '';
    else if (cur === '') next = '1';
    else next = 'S';

    const nextStatuses = {
      ...customUtilStatuses,
      [key]: next,
      [`${toolKey.toUpperCase()}_${selectedUtilYear}_${selectedUtilMonth}_${dayNum}`]: next,
    };
    setCustomUtilStatuses(nextStatuses);

    // Save to local storage cache immediately
    const jId = (jobData.id || jobData.jobNumber || '').trim();
    if (jId) {
      try {
        localStorage.setItem(`emdad_job_util_statuses_${jId}`, JSON.stringify(nextStatuses));
      } catch {}
    }

    // Save to jobData and trigger onSaveJob so parent job state is in sync
    const updatedJob: DrillingJob = {
      ...jobData,
      utilizationStatuses: nextStatuses,
    };
    setJobData(updatedJob);
    onSaveJob(updatedJob);
  };

  // Active Contract matching for rate resolution
  const activeContract = useMemo(() => {
    const cKey = (jobData.contractNo || jobData.contract || '').trim().toLowerCase();
    const clKey = (jobData.client || '').trim().toLowerCase();
    return (
      (contracts || []).find((c) => {
        const cNo = (c.contractNo || c.contractRef || c.id || '').trim().toLowerCase();
        const cCl = (c.client || '').trim().toLowerCase();
        return (cKey && (cNo === cKey || cKey.includes(cNo))) || (clKey && (cCl === clKey || cCl.includes(clKey)));
      }) || null
    );
  }, [jobData.contractNo, jobData.contract, jobData.client, contracts]);

  // User-selected Hole Section & Contract Rate state per tool line (persisted per job)
  const [toolHoleSectionSelections, setToolHoleSectionSelections] = useState<
    Record<string, ToolHoleSectionOption>
  >(() => {
    try {
      const saved = localStorage.getItem(`emdad_job_tool_sections_${jobData.id || jobData.jobNumber}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        const cleaned: Record<string, ToolHoleSectionOption> = {};
        for (const [k, v] of Object.entries(parsed)) {
          const opt = v as ToolHoleSectionOption;
          if (opt && opt.contractRef !== 'Ref' && opt.holeSection !== 'Hole Section' && opt.category !== 'From ERP') {
            cleaned[k] = opt;
          }
        }
        return cleaned;
      }
    } catch {}
    return {};
  });

  // Subcontractor Tool Cost Overrides per tool & month (e.g. subSbDays, subOpsDays, subSbRate, subOpsRate, subRunCharge, subRedressCharge)
  const [jobSubRentalCosts, setJobSubRentalCosts] = useState<Record<string, Partial<JobToolSubRentalCost>>>(() => {
    try {
      const saved = localStorage.getItem(`emdad_job_subrental_costs_${jobData.id || jobData.jobNumber}`);
      if (saved) return JSON.parse(saved);
      if (jobData.subRentalCosts) return jobData.subRentalCosts;
    } catch {}
    return {};
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`emdad_job_subrental_costs_${jobData.id || jobData.jobNumber}`);
      if (saved) {
        setJobSubRentalCosts(JSON.parse(saved));
      } else if (jobData.subRentalCosts) {
        setJobSubRentalCosts(jobData.subRentalCosts);
      } else {
        setJobSubRentalCosts({});
      }
    } catch {
      setJobSubRentalCosts({});
    }
  }, [jobData.id, jobData.jobNumber, jobData.subRentalCosts]);

  const handleUpdateSubRentalCost = useCallback((toolKey: string, updates: Partial<JobToolSubRentalCost>) => {
    setJobSubRentalCosts((prev) => {
      const existing = prev[toolKey] || {};
      const next = { ...prev, [toolKey]: { ...existing, ...updates } };
      try {
        localStorage.setItem(`emdad_job_subrental_costs_${jobData.id || jobData.jobNumber}`, JSON.stringify(next));
      } catch {}
      // Update job in memory and notify parent
      if (onSaveJob) {
        onSaveJob({
          ...jobData,
          subRentalCosts: next as Record<string, JobToolSubRentalCost>,
        });
      }
      return next;
    });
  }, [jobData, onSaveJob]);

  const handleSelectToolHoleSection = useCallback(
    (toolKey: string, tool: any, selectedRateKey: string) => {
      const options = getContractRateOptionsForTool(
        {
          desc: tool.desc || tool.shortDesc || tool.toolDescription,
          assetNo: tool.assetNo || tool.serial,
          category: tool.category,
          size: tool.size,
        },
        activeContract
      );
      const chosen = options.find((o) => o.key === selectedRateKey) || options[0];
      if (!chosen) return;

      setToolHoleSectionSelections((prev) => {
        const next = { ...prev, [toolKey]: chosen };
        try {
          localStorage.setItem(`emdad_job_tool_sections_${jobData.id || jobData.jobNumber}`, JSON.stringify(next));
        } catch {}
        return next;
      });

      // Synchronize directly to Azure SQL
      saveJobToolHoleSectionApi(
        jobData.id || jobData.jobNumber,
        tool.serial || tool.assetNo || toolKey,
        chosen.holeSection,
        chosen.contractRef,
        chosen.opsRate,
        chosen.standbyRate,
        chosen.currency
      );
    },
    [activeContract, jobData.id, jobData.jobNumber]
  );

  // Compute operational days and commercial breakdown for each tool in selected month
  const toolUtilizationRows = useMemo(() => {
    return allMobilizedTools.map((t, idx) => {
      const dispMs = parseDateToMs(t.dispatchDate);
      const retMs = t.returnDate ? parseDateToMs(t.returnDate) : 0;

      let sbCount = 0;
      let opsCount = 0;
      const dayStatuses: Record<number, string> = {};
      const toolKey = t.serial || t.assetNo || String(idx);

      utilDaysList.forEach((dayNum) => {
        const curDate = new Date(selectedUtilYear, selectedUtilMonth - 1, dayNum).getTime();
        // If within operational window on rig
        const isDispatched = dispMs > 0 ? curDate >= dispMs : true;
        const isReturned = retMs > 0 ? curDate > retMs : false;

        if (isDispatched && !isReturned) {
          const overrideKey = `${toolKey}_${selectedUtilYear}_${selectedUtilMonth}_${dayNum}`;
          const customVal = customUtilStatuses[overrideKey];
          if (customVal !== undefined) {
            dayStatuses[dayNum] = customVal;
            if (customVal === '1') opsCount += 1;
            else if (customVal === 'S') sbCount += 1;
          } else {
            // Live condition from Return Ticket or tool line:
            // If tool was marked as Not Used / Standby, it was on Standby ('S')
            // If tool was marked as Used, it was Operational ('1')
            const isUsed = (t as any).used === true || (t as any).condition === 'Used' || (t as any).remark === 'Used';
            if (isUsed) {
              dayStatuses[dayNum] = '1';
              opsCount += 1;
            } else {
              dayStatuses[dayNum] = 'S';
              sbCount += 1;
            }
          }
        } else {
          dayStatuses[dayNum] = '';
        }
      });

      // Dynamic rate lookup from Master Contract Schedules using category synonyms and range rules
      const rateOptions = getContractRateOptionsForTool(
        {
          desc: t.desc || t.shortDesc,
          assetNo: t.serial || t.assetNo,
          category: (t as any).category,
          size: (t as any).size,
        },
        activeContract
      );

      const chosenOption =
        toolHoleSectionSelections[toolKey] ||
        findBestMatchingOption(rateOptions, (t as any).holeSection || (jobData as any).holeSection) ||
        rateOptions[0];

      const clientStr = String(jobData.client || '').toUpperCase();
      let billableSbCount = sbCount;
      if (clientStr.includes('ONSHORE') || clientStr.includes('ADCO')) {
        billableSbCount = Math.min(sbCount, 6);
      } else if (clientStr.includes('DRILLING')) {
        billableSbCount = Math.min(sbCount, 10);
      }

      const standbyRate = chosenOption
        ? chosenOption.standbyRate
        : (t as any).standbyRate || (t as any).standby_rate || (t as any).dayRate || 0;
      const opsRate = chosenOption
        ? chosenOption.opsRate
        : (t as any).opsRate || (t as any).ops_rate || (t as any).dayRate || 0;
      const currency = chosenOption?.currency || activeContract?.currency || jobData.currency || 'AED';
      const contractRef = chosenOption?.contractRef || '';
      const holeSection = chosenOption?.holeSection || '';

      const totalStandbyRate = billableSbCount * standbyRate;
      const totalOpsRate = opsCount * opsRate;
      const runCharge = (t as any).runCharge || chosenOption?.runCharges || 0;
      const redressCharge = (t as any).redressCharge || chosenOption?.redress || 0;
      const totalMonthValue = totalStandbyRate + totalOpsRate + runCharge + redressCharge;

      // Subcontractor / Supplier Cost Reconciliation
      const invMatch = inventory.find((inv) => {
        const iSer = (inv.serial || '').trim().toUpperCase();
        const iAsset = (inv.assetNo || '').trim().toUpperCase();
        const tSer = (t.serial || '').trim().toUpperCase();
        const tAss = (t.assetNo || '').trim().toUpperCase();
        return (tSer && (iSer === tSer || iAsset === tSer)) || (tAss && (iSer === tAss || iAsset === tAss));
      });

      const isSubTool = invMatch ? !invMatch.isEmdad : (!t.isEmdad && (((t as any).supplier || (t as any).ownership || '').trim().toUpperCase() !== 'EMDAD'));
      const supplierName = (
        (invMatch?.supplier && invMatch.supplier.trim().toUpperCase() !== 'EMDAD' ? invMatch.supplier.trim() : '') ||
        (invMatch?.ownership && invMatch.ownership.trim().toUpperCase() !== 'EMDAD' ? invMatch.ownership.trim() : '') ||
        (isSubTool ? (invMatch?.supplier || invMatch?.ownership || (t as any).supplier || (t as any).ownership || 'Sub-Contractor') : 'EMDAD')
      );

      // Saved overrides or defaults
      const subSaved = jobSubRentalCosts[toolKey] || {};
      const subSbDays = subSaved.subSbDays !== undefined && subSaved.subSbDays !== null ? Number(subSaved.subSbDays) : (isSubTool ? sbCount : 0);
      const subOpsDays = subSaved.subOpsDays !== undefined && subSaved.subOpsDays !== null ? Number(subSaved.subOpsDays) : (isSubTool ? opsCount : 0);
      
      // Default rate from inventory subRentalDailyRate or 70% of ops/standby if not set
      const defaultDailyCost = invMatch?.subRentalDailyRate || (invMatch?.subRentalMonthlyRate ? Math.round(invMatch.subRentalMonthlyRate / 30) : 0);
      const subSbRate = subSaved.subSbRate !== undefined && subSaved.subSbRate !== null
        ? Number(subSaved.subSbRate)
        : (isSubTool ? (defaultDailyCost ? Math.round(defaultDailyCost * 0.7) : Math.round(standbyRate * 0.75)) : 0);
      const subOpsRate = subSaved.subOpsRate !== undefined && subSaved.subOpsRate !== null
        ? Number(subSaved.subOpsRate)
        : (isSubTool ? (defaultDailyCost || Math.round(opsRate * 0.75)) : 0);
      const subRunCharge = subSaved.subRunCharge !== undefined && subSaved.subRunCharge !== null ? Number(subSaved.subRunCharge) : 0;
      const subRedressCharge = subSaved.subRedressCharge !== undefined && subSaved.subRedressCharge !== null ? Number(subSaved.subRedressCharge) : 0;

      const totalSubCost = isSubTool
        ? (subSbDays * subSbRate) + (subOpsDays * subOpsRate) + subRunCharge + subRedressCharge
        : 0;

      return {
        ...t,
        rowSeq: idx + 1,
        toolKey,
        dayStatuses,
        sbCount,
        opsCount,
        rateOptions,
        chosenOption,
        holeSection,
        contractRef,
        currency,
        standbyRate,
        opsRate,
        totalStandbyRate,
        totalOpsRate,
        runCharge,
        redressCharge,
        totalMonthValue,
        // Sub-Contractor fields
        isSubTool,
        supplierName,
        subSbDays,
        subOpsDays,
        subSbRate,
        subOpsRate,
        subRunCharge,
        subRedressCharge,
        totalSubCost,
      };
    });
  }, [
    allMobilizedTools,
    selectedUtilMonth,
    selectedUtilYear,
    utilDaysList,
    activeContract,
    customUtilStatuses,
    toolHoleSectionSelections,
    jobSubRentalCosts,
    inventory,
    jobData.client,
    jobData.currency,
    (jobData as any).holeSection,
  ]);

  const monthTotalSB = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.sbCount, 0), [toolUtilizationRows]);
  const monthTotalOps = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.opsCount, 0), [toolUtilizationRows]);
  const monthTotalSBRate = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.totalStandbyRate, 0), [toolUtilizationRows]);
  const monthTotalOpsRate = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.totalOpsRate, 0), [toolUtilizationRows]);
  const monthTotalRunCharge = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.runCharge, 0), [toolUtilizationRows]);
  const monthTotalRedress = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.redressCharge, 0), [toolUtilizationRows]);
  const totalToolRevenueAED = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.totalMonthValue, 0), [toolUtilizationRows]);
  const totalSubcontractCostAED = useMemo(() => toolUtilizationRows.reduce((a, r) => a + (r.totalSubCost || 0), 0), [toolUtilizationRows]);

  // Engineer Utilization calculation
  const engineerUtilizationRows = useMemo(() => {
    return assignedCrew.map((eng, idx) => {
      const mobMs = parseDateToMs(eng.mobDate);
      const demobMs = eng.demobDate ? parseDateToMs(eng.demobDate) : 0;

      let sbCount = 0;
      let opsCount = 0;
      const dayStatuses: Record<number, string> = {};

      utilDaysList.forEach((dayNum) => {
        const curDate = new Date(selectedUtilYear, selectedUtilMonth - 1, dayNum).getTime();
        const isMobilized = mobMs > 0 ? curDate >= mobMs : true;
        const isDemobilized = demobMs > 0 ? curDate > demobMs : false;

        if (isMobilized && !isDemobilized) {
          const daysSinceMob = mobMs > 0 ? Math.floor((curDate - mobMs) / (1000 * 60 * 60 * 24)) : dayNum;
          if (daysSinceMob === 0 || eng.status === 'Standby') {
            dayStatuses[dayNum] = 'S';
            sbCount += 1;
          } else {
            dayStatuses[dayNum] = '1';
            opsCount += 1;
          }
        } else {
          dayStatuses[dayNum] = '';
        }
      });

      const totalUSD = (opsCount + sbCount) * (eng.dailyRateUSD || 0);

      return {
        ...eng,
        rowSeq: idx + 1,
        dayStatuses,
        sbCount,
        opsCount,
        totalUSD,
      };
    });
  }, [assignedCrew, selectedUtilMonth, selectedUtilYear, utilDaysList]);

  const totalCrewRevenueUSD = useMemo(() => {
    return engineerUtilizationRows.reduce((acc, e) => acc + e.totalUSD, 0);
  }, [engineerUtilizationRows]);

  // Saving state indicator and last saved timestamp
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // While a save to Azure SQL is genuinely in progress, show a wait cursor
  // over the whole screen — not just the Save button — so it's visually
  // obvious the system is busy, the way a spinning cursor communicates "the
  // app is working" in a desktop application.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.cursor = isSaving ? 'wait' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [isSaving]);

  // Master Save Job File handler - Unified save across entire Job Dossier:
  // Saves Job Header, Technical Details, Notes, Crew, Daily Logs, AND Utilization matrix to Azure SQL
  const handleExplicitSaveJob = async () => {
    if (!canEditJobs && !isAdmin) {
      showToast('Cannot save: your role has view-only permissions for Drilling Jobs.', 'error');
      return;
    }
    if (isClosedOrInvoiced && !adminUnlocked) {
      showToast('Cannot save: this job is invoiced / completed and locked in read-only mode.', 'error');
      return;
    }
    const jId = (jobData.id || jobData.jobNumber || '').trim();
    if (!jId) {
      showToast('Cannot save: missing Job Number.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // 0. Persist active notes across individual tickets ONLY if active ticket genuinely exists
      if (activeDT && (!activeDT.isLocked || adminUnlocked) && dtNotesInput !== undefined) {
        handleSaveDTNotes(true);
      }
      if (activeRT && (!activeRT.isLocked || adminUnlocked) && rtNotesInput !== undefined) {
        handleSaveRTNotes(true);
      }

      const updatedJob: DrillingJob = {
        ...jobData,
        notes: jobData.notes || '',
        assignedCrew,
        crewMembers: assignedCrew,
        dailyLogs,
        utilizationStatuses: customUtilStatuses,
      };

      saveCustomJob(updatedJob);

      // 1. Persist local cache of utilization statuses
      try {
        localStorage.setItem(`emdad_job_util_statuses_${jId}`, JSON.stringify(customUtilStatuses));
      } catch {}

      // 2. Persist tool hole section selections to localStorage and Azure SQL
      if (Object.keys(toolHoleSectionSelections).length > 0) {
        try {
          localStorage.setItem(`emdad_job_tool_sections_${jId}`, JSON.stringify(toolHoleSectionSelections));
          for (const [toolKey, opt] of Object.entries(toolHoleSectionSelections)) {
            saveJobToolHoleSectionApi(
              jId,
              toolKey,
              opt.holeSection,
              opt.contractRef,
              opt.opsRate,
              opt.standbyRate,
              opt.currency
            ).catch(() => {});
          }
        } catch {}
      }

      // 3. Persist monthly utilization daily ledger rows to Azure SQL (tbl_DailyFieldLogs)
      if (toolUtilizationRows.length > 0) {
        const logEntries: Array<{
          jobId: string;
          dtNumber?: string;
          toolSerial: string;
          date: string;
          status: '1' | 'S';
          rate?: number;
        }> = [];

        toolUtilizationRows.forEach((row) => {
          const serial = row.toolKey;
          if (!serial) return;
          const opsRate = row.opsRate || 0;
          const sbRate = row.standbyRate || 0;

          utilDaysList.forEach((dayNum) => {
            const status = row.dayStatuses[dayNum];
            if (status === '1' || status === 'S') {
              const dateStr = `${selectedUtilYear}-${String(selectedUtilMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              logEntries.push({
                jobId: jId,
                dtNumber: row.dtNumber,
                toolSerial: serial,
                date: dateStr,
                status,
                rate: status === '1' ? opsRate : sbRate,
              });
            }
          });
        });

        if (logEntries.length > 0) {
          saveDailyFieldLogsApi(logEntries).catch(() => {});
        }
      }

      // 4. Save Job data to parent state and Azure SQL (tbl_Jobs).
      // Genuinely awaited: onSaveJob now only resolves once Azure SQL has
      // confirmed the write, so the "Saving…" spinner on the button below
      // stays up for the real duration of the save, not just a flash.
      await onSaveJob(updatedJob);
      setJobData(updatedJob);

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSavedTime(timeStr);
      setLastSavedUtilTime(timeStr);
      showToast(`Job File ${jobData.id} records (including Notes & Utilization) saved!`, 'success');
    } catch (e: any) {
      showToast(`Failed to save job file: ${e.message || 'Unknown error'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="access-dossier bg-[#dce6f1] min-h-screen text-slate-800 p-2 sm:p-4 select-none"
      style={{ fontFamily: "'Calibri', 'Arial Nova', 'Segoe UI', Arial, sans-serif", fontSize: '9pt' }}
    >
      <style>{`
        .access-dossier, .access-dossier * {
          font-family: 'Calibri', 'Arial Nova', 'Segoe UI', Arial, sans-serif;
        }
        .access-dossier input, .access-dossier select, .access-dossier textarea, .access-dossier td, .access-dossier th {
          font-size: 9pt;
        }
      `}</style>

      {/* Top Access Window Bar */}
      <div className="bg-[#1a3055] text-white px-3 py-1.5 rounded-t-md flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2 text-xs font-bold tracking-wide">
          <span>Job File Workspace &bull; Job No: <span className="font-mono text-amber-300">{jobData.id}</span></span>
          {jobData.legalInvoiceNumber && (
            <span className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 px-2 py-0.5 rounded text-[10px] font-mono">
              Legal Inv: {jobData.legalInvoiceNumber}
            </span>
          )}
          {lastSavedTime && (
            <span className="text-[10px] text-emerald-300 font-normal hidden sm:inline">
              (Saved at {lastSavedTime})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Prominent Save Job File Button */}
          <button
            type="button"
            onClick={handleExplicitSaveJob}
            disabled={isSaving || (!canEditJobs && !isAdmin) || (isClosedOrInvoiced && !adminUnlocked)}
            className={`text-xs bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-500 text-white px-3 py-1 rounded font-bold transition shadow-xs flex items-center gap-1.5 ${isSaving ? 'cursor-wait' : 'cursor-pointer'}`}
            title={isSaving ? 'Saving to Azure SQL — please wait…' : 'Save all changes in this Job File'}
          >
            {isSaving ? (
              <span
                className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"
                aria-hidden="true"
              />
            ) : (
              <span>💾</span>
            )}
            <span>{isSaving ? 'Saving…' : 'Save Job File'}</span>
          </button>

          {/* Admin Unlock / Re-lock Button */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                if (!adminUnlocked) {
                  setIsReopenModalOpen(true);
                } else {
                  setAdminUnlocked(false);
                  showToast('Admin override deactivated. Workspace restored to locked mode.', 'info');
                }
              }}
              className={`text-xs px-2.5 py-1 rounded cursor-pointer transition font-bold flex items-center gap-1 shadow-xs ${
                adminUnlocked
                  ? 'bg-amber-400 hover:bg-amber-500 text-slate-950 ring-2 ring-amber-300'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
              title={adminUnlocked ? 'Admin Override is ACTIVE. Click to re-lock.' : 'Admin Override: Unlock Job, Checklist & DT for corrections'}
            >
              <span>{adminUnlocked ? '🔓 Admin Unlocked' : '🔓 Admin Unlock'}</span>
            </button>
          )}

          {/* Refresh Button */}
          {onRefresh && (
            <button
              type="button"
              onClick={async () => {
                showToast('Synchronizing Job File with Azure SQL...', 'info');
                await onRefresh();
                showToast('Job File synchronized with Azure SQL.', 'success');
              }}
              className="text-xs bg-white/10 hover:bg-white/20 text-slate-200 px-2.5 py-1 rounded cursor-pointer transition font-medium flex items-center gap-1"
              title="Refresh live data from server"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          )}

          {onBackToRegister && (
            <button
              type="button"
              onClick={onBackToRegister}
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded cursor-pointer transition font-medium flex items-center gap-1"
            >
              <span>&larr;</span> Back to Register
            </button>
          )}
        </div>
      </div>

      {/* MS Access Tab Strip */}
      <div className="bg-slate-200 border-x border-b border-[#9fb6cf] flex items-center gap-0.5 px-2 pt-1.5 overflow-x-auto shadow-2xs">
        {[
          { key: 'job-header', label: 'Job Header' },
          { key: 'technical-details', label: 'Technical Details' },
          { key: 'manpower', label: 'Manpower / Crew' },
          { key: 'checklist', label: 'Checklistheader' },
          { key: 'delivery-tickets', label: 'Delivery Ticket Header' },
          { key: 'return-tickets', label: 'Return Ticket' },
          { key: 'utilization', label: 'Utilization' },
        ].map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as DossierTabKey)}
              className={`px-3 py-1.5 text-xs font-bold rounded-t-md border-t border-x transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                isActive
                  ? 'bg-white border-[#9fb6cf] text-[#1a3055] shadow-sm font-extrabold relative -bottom-[1px] z-10'
                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-amber-500' : 'bg-slate-400'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Form Body */}
      <div className="bg-white border-x border-b border-[#9fb6cf] p-4 rounded-b-md shadow-md min-h-[620px] relative">
        {isReadOnly && <ReadOnlyBanner role={user?.role} moduleName="Drilling Job File" />}
        {/* SIMPLIFIED LOCK BANNER */}
        {(isJobInvoicedOrFinished || adminUnlocked) && (
          <div className={`p-1.5 px-3 mb-3 rounded border text-xs flex flex-wrap items-center justify-between font-bold shadow-2xs gap-2 ${
            adminUnlocked
              ? 'bg-amber-100 border-amber-400 text-amber-950'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}>
            <div className="flex items-center gap-2">
              <span>{adminUnlocked ? '🔓' : '🔒'}</span>
              <span>
                {adminUnlocked ? 'Job Temporarily Re-opened by Admin' : 'Locked (Invoiced)'}
                {jobData.legalInvoiceNumber ? ` — Legal Invoice: ${jobData.legalInvoiceNumber}` : jobData.draftInvoiceNumber ? ` — Draft Invoice: ${jobData.draftInvoiceNumber}` : ''}
              </span>
              {adminUnlocked && (
                <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse">
                  Admin Audit Override Active — All Tabs Unlocked
                </span>
              )}
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1.5">
                {!adminUnlocked ? (
                  <button
                    type="button"
                    onClick={() => setIsReopenModalOpen(true)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-2.5 py-1 rounded shadow-2xs cursor-pointer flex items-center gap-1 transition"
                  >
                    <span>🔓</span>
                    <span>Admin Unlock &amp; Correction (All Tabs)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAdminUnlocked(false);
                      if (effectiveDT && !effectiveDT.isLocked && onUpdateDTBatch) {
                        onUpdateDTBatch({ ...effectiveDT, isLocked: true });
                      }
                      showToast('Admin override deactivated. Workspace restored to locked mode.', 'info');
                    }}
                    className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-2.5 py-1 rounded shadow-2xs cursor-pointer transition flex items-center gap-1"
                  >
                    <span>🔒</span>
                    <span>Re-lock Job Dossier</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Job Context Section: Compact 1-line Summary Ribbon on sub-tabs; Full 10-field Form on 'job-header' tab */}
        {activeTab !== 'job-header' ? (
          <div className="bg-[#f0f4f9] border border-[#b8cce0] rounded px-3 py-1.5 mb-2.5 flex items-center justify-between text-xs shadow-2xs shrink-0 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-bold text-slate-700">Rig: <span className="text-blue-900 font-mono">{jobData.rig || '—'}</span></span>
              <span className="text-slate-300">|</span>
              <span className="font-bold text-slate-700">Well: <span className="text-slate-900 font-mono">{jobData.well || '—'}</span></span>
              <span className="text-slate-300">|</span>
              <span className="font-bold text-slate-700">Client: <span className="text-slate-900 font-medium">{jobData.client || '—'}</span></span>
              <span className="text-slate-300">|</span>
              <span className="font-bold text-slate-700">Contract: <span className="text-slate-900 font-mono">{cleanContractName(jobData.contract) || jobData.contractNo || '—'}</span></span>
              <span className="text-slate-300">|</span>
              <span className="font-bold text-slate-700">Job Value: <span className="text-blue-900 font-mono font-bold bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">{sqlJobValue > 0 ? `${sqlJobValue.toLocaleString()} ${jobData.currency || 'USD'}` : (jobData.poValue ? `${Number(jobData.poValue).toLocaleString()} AED` : '—')}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                Dispatched: {totalDispatched}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                Active: {activeOnRig}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                Returned: {totalReturned}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-[#f0f4f9] border border-[#b8cce0] rounded-md p-3 mb-4 shadow-2xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-xs">
              {/* Left Column: Job No, Service Category, Job Description, Rig, Well, Field */}
              <div className="space-y-1.5">
                <div className="flex items-center">
                  <label className="w-28 font-bold text-slate-700 text-right pr-3">Job No:</label>
                  <input
                    type="text"
                    value={jobData.id || ''}
                    disabled={isLocked}
                    onChange={(e) => setJobData({ ...jobData, id: e.target.value, jobNumber: e.target.value })}
                    className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-mono font-bold text-slate-900 w-48 shadow-2xs focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Service Category */}
                <div className="flex items-center">
                  <div className="w-28 flex items-center justify-end pr-3 gap-1">
                    <label className="font-bold text-slate-700 text-right">Service Category:</label>
                    {user?.role === 'Admin' && (
                      <button
                        type="button"
                        onClick={() => setAdminModalKey('jobServiceCategories')}
                        className="text-[10px] text-blue-600 hover:text-blue-800 cursor-pointer"
                        title="Admin: Manage Service Categories"
                      >
                        <SettingsIcon className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                  <select
                    value={jobData.serviceCategory || jobData.serviceType || (serviceCategoriesList[0] || 'DOWN HOLE RENTALS')}
                    disabled={isLocked}
                    onChange={(e) =>
                      setJobData({
                        ...jobData,
                        serviceCategory: e.target.value,
                        serviceType: e.target.value,
                      })
                    }
                    className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-bold text-slate-800 w-64 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  >
                    {serviceCategoriesList.map((sc) => (
                      <option key={sc} value={sc}>
                        {sc}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Short Job Description Input */}
                <div className="flex items-center">
                  <label className="w-28 font-bold text-slate-700 text-right pr-3">Job Description:</label>
                  <input
                    type="text"
                    value={jobData.jobDescription || ''}
                    disabled={isLocked}
                    onChange={(e) => setJobData({ ...jobData, jobDescription: e.target.value })}
                    placeholder="e.g. 6-1/8 Hole Section Whipstock Casing Exit"
                    className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-medium text-slate-800 w-64 shadow-2xs focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex items-center">
                  <label className="w-28 font-bold text-slate-700 text-right pr-3">Rig:</label>
                  <input
                    type="text"
                    value={jobData.rig || ''}
                    disabled={isLocked}
                    onChange={(e) => setJobData({ ...jobData, rig: e.target.value })}
                    className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-bold text-slate-800 w-48 shadow-2xs focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex items-center">
                  <label className="w-28 font-bold text-slate-700 text-right pr-3">Well:</label>
                  <input
                    type="text"
                    value={jobData.well || ''}
                    disabled={isLocked}
                    onChange={(e) => setJobData({ ...jobData, well: e.target.value })}
                    className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-bold text-slate-800 w-48 shadow-2xs focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex items-center">
                  <label className="w-28 font-bold text-slate-700 text-right pr-3">Field:</label>
                  <input
                    type="text"
                    value={jobData.field || 'ASAB'}
                    disabled={isLocked}
                    onChange={(e) => setJobData({ ...jobData, field: e.target.value })}
                    className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-medium text-slate-800 w-48 shadow-2xs focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Right Column: Client, Contract, Contract No, PO Number, PO Value, Job Value */}
              <div className="space-y-1.5">
                <div className="flex items-center">
                  <label className="w-28 font-bold text-slate-700 text-right pr-3">Client:</label>
                  <select
                    value={jobData.client || ''}
                    disabled={isLocked}
                    onChange={(e) => setJobData({ ...jobData, client: e.target.value })}
                    className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-bold text-slate-800 w-64 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  >
                    {clientOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center">
                  <label className="w-28 font-bold text-slate-700 text-right pr-3">Contract:</label>
                  <select
                    value={cleanContractName(jobData.contract) || ''}
                    disabled={isLocked}
                    onChange={(e) => {
                      const chosen = e.target.value;
                      const found = contractOptions.find((co) => co.name === chosen);
                      const resolvedDiv = resolveContractSubDivision(found?.no || chosen);
                      setJobData({
                        ...jobData,
                        contract: chosen,
                        contractNo: found?.no || jobData.contractNo || '',
                        subDivision: resolvedDiv || jobData.subDivision || 'RENTALS',
                      });
                    }}
                    className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-medium text-slate-800 w-64 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  >
                    {contractOptions.map((co) => (
                      <option key={co.name} value={co.name}>
                        {co.name}{co.no && co.no !== co.name ? ` (${co.no})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center">
                  <label className="w-28 font-bold text-slate-700 text-right pr-3">Contract No:</label>
                  <input
                    type="text"
                    value={jobData.contractNo || jobData.contract || '4700023861'}
                    disabled={isLocked}
                    onChange={(e) => {
                      const val = e.target.value;
                      const resolvedDiv = resolveContractSubDivision(val);
                      setJobData({
                        ...jobData,
                        contractNo: val,
                        subDivision: resolvedDiv || jobData.subDivision,
                      });
                    }}
                    className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-mono font-bold text-slate-800 w-64 shadow-2xs focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex items-center">
                  <div className="w-28 flex items-center justify-end pr-3 gap-1">
                    <label className="font-bold text-slate-700 text-right">Sub-Division:</label>
                    {user?.role === 'Admin' && (
                      <button
                        type="button"
                        onClick={() => setAdminModalKey('subDivisions')}
                        className="text-[10px] text-blue-600 hover:text-blue-800 cursor-pointer"
                        title="Admin: Manage Sub-Divisions"
                      >
                        <SettingsIcon className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                  <select
                    value={jobData.subDivision || resolveContractSubDivision(jobData.contractNo || jobData.contract) || 'RENTALS'}
                    disabled={isLocked}
                    onChange={(e) => setJobData({ ...jobData, subDivision: e.target.value as SubDivision })}
                    className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-bold text-blue-900 w-64 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  >
                    {subDivisionsList.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center">
                  <label className="w-28 font-bold text-slate-700 text-right pr-3">PO Number:</label>
                  <input
                    type="text"
                    value={jobData.poNumber || ''}
                    disabled={isLocked}
                    onChange={(e) => setJobData({ ...jobData, poNumber: e.target.value })}
                    placeholder="e.g. PO-4700023861"
                    className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-mono font-bold text-slate-800 w-64 shadow-2xs focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex items-center">
                  <label className="w-28 font-bold text-slate-700 text-right pr-3">PO Value:</label>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <span className="absolute left-2 top-0.5 text-slate-400 font-bold text-[11px]">AED</span>
                      <input
                        type="number"
                        value={jobData.poValue !== undefined && jobData.poValue !== null ? jobData.poValue : ''}
                        disabled={isLocked}
                        onChange={(e) => setJobData({ ...jobData, poValue: parseFloat(e.target.value) || 0 })}
                        placeholder="0.00"
                        className="bg-white border border-[#9fb6cf] rounded pl-9 pr-2 py-0.5 text-xs font-mono font-bold text-slate-900 w-32 shadow-2xs focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                      />
                    </div>
                    <span className="font-bold text-slate-700 text-xs">Job Value:</span>
                    <span className="font-mono font-bold text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs shadow-2xs" title="Actual calculated job revenue / invoice amount">
                      {sqlJobValue > 0 ? `${sqlJobValue.toLocaleString()} ${jobData.currency || 'USD'}` : (jobData.poValue ? `${Number(jobData.poValue).toLocaleString()} AED` : '—')}
                    </span>
                  </div>
                </div>

                {/* Status / Fleet indicators */}
                <div className="flex items-center gap-2 pt-1 pl-28 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                    Dispatched Tools: {totalDispatched}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Returned: {totalReturned}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                    Active Tools: {activeOnRig}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-900 border border-purple-300">
                    Crew on Rig: {assignedCrew.filter((c) => c.status.includes('Rig')).length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: JOB HEADER & NOTES */}
        {activeTab === 'job-header' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notes &amp; Operational Log:</label>
              <textarea
                rows={8}
                value={jobData.notes || ''}
                disabled={isLocked}
                onChange={(e) => {
                  setJobData({ ...jobData, notes: e.target.value });
                }}
                onBlur={() => {
                  if (!isLocked) {
                    onSaveJob(jobData);
                    saveCustomJob(jobData);
                  }
                }}
                placeholder="Enter job notes, instructions, well history, and operational remarks here..."
                className="w-full bg-white border border-[#9fb6cf] rounded p-3 text-xs text-slate-800 leading-relaxed font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
              />
            </div>
            {!isLocked && (
              <div className="flex justify-end">
                <span className="text-[10px] text-slate-500 italic">Saves automatically when you click away from this field.</span>
              </div>
            )}

            {/* Daily Field Operations Log & Remarks (DDR) */}
            <div className="bg-white border border-[#b8cce0] rounded-md shadow-2xs overflow-hidden mt-4">
              <div className="bg-[#f0f4f9] px-3 py-2 border-b border-[#b8cce0] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-[#1a3055] flex items-center gap-1.5">
                    <span>📋</span>
                    <span>Daily Field Operations Log &amp; Remarks (DDR)</span>
                    <span className="text-[10px] bg-blue-100 text-blue-900 border border-blue-200 px-1.5 py-0.2 rounded font-bold">
                      {dailyLogs.length} {dailyLogs.length === 1 ? 'Entry' : 'Entries'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Day-by-day rig operations, hole depth, operational vs standby status, and engineer remarks.
                  </p>
                </div>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => setIsAddDailyLogOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1 rounded shadow-xs cursor-pointer flex items-center gap-1 transition"
                  >
                    <span>+</span>
                    <span>Add Daily Field Log</span>
                  </button>
                )}
              </div>

              {dailyLogs.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  <div className="text-2xl mb-1 text-slate-400">📝</div>
                  <p className="font-semibold text-slate-700">No daily field log entries recorded yet.</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Field engineers and operations supervisors can log daily progress, standby/operational status, and hole depth by clicking &quot;Add Daily Field Log&quot;.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#e9eff6] text-[#1a3055] font-bold border-b border-[#b8cce0] sticky top-0 text-[11px] select-none">
                      <tr>
                        <th style={{ width: ddrResizer.widths.date || 110 }} className="py-1.5 px-3 whitespace-nowrap relative">
                          <span>Date</span>
                          <ResizerHandle onMouseDown={(e) => ddrResizer.startResize('date', e)} />
                        </th>
                        <th style={{ width: ddrResizer.widths.status || 100 }} className="py-1.5 px-3 whitespace-nowrap relative">
                          <span>Status</span>
                          <ResizerHandle onMouseDown={(e) => ddrResizer.startResize('status', e)} />
                        </th>
                        <th style={{ width: ddrResizer.widths.depth || 130 }} className="py-1.5 px-3 whitespace-nowrap relative">
                          <span>Hole Depth / Section</span>
                          <ResizerHandle onMouseDown={(e) => ddrResizer.startResize('depth', e)} />
                        </th>
                        <th style={{ width: ddrResizer.widths.activity || 350 }} className="py-1.5 px-3 relative">
                          <span>24-Hr Operations Summary &amp; Remarks</span>
                          <ResizerHandle onMouseDown={(e) => ddrResizer.startResize('activity', e)} />
                        </th>
                        <th style={{ width: ddrResizer.widths.loggedBy || 140 }} className="py-1.5 px-3 whitespace-nowrap relative">
                          <span>Logged By</span>
                          <ResizerHandle onMouseDown={(e) => ddrResizer.startResize('loggedBy', e)} />
                        </th>
                        {ddrCustomCols.map((c) => (
                          <th
                            key={c.key}
                            style={{ width: ddrResizer.widths[c.key] || c.width || 120 }}
                            className="py-1.5 px-3 whitespace-nowrap relative bg-indigo-50/50 text-indigo-950 font-bold border-l border-indigo-200"
                            title={`Custom Column: ${c.label}`}
                          >
                            <span>{c.label}</span>
                            <ResizerHandle onMouseDown={(e) => ddrResizer.startResize(c.key, e)} />
                          </th>
                        ))}
                        {!isLocked && (
                          <th style={{ width: ddrResizer.widths.action || 55 }} className="py-1.5 px-2 text-center relative">
                            <span>Action</span>
                            <ResizerHandle onMouseDown={(e) => ddrResizer.startResize('action', e)} />
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dailyLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-blue-50/50">
                          <td className="py-2 px-3 whitespace-nowrap font-mono font-bold text-slate-800">
                            {formatDateDD_MM_YYYY(log.date)}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.status === 'Operational'
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : 'bg-amber-100 text-amber-900 border border-amber-300'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap font-mono text-slate-700">
                            {log.depth || '—'}
                          </td>
                          <td className="py-2 px-3 text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
                            {log.activity}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap text-slate-600 font-medium text-[11px]">
                            {log.loggedBy}
                          </td>
                          {ddrCustomCols.map((c) => {
                            const val = (log as any)[c.key] ?? (log as any).customFields?.[c.key];
                            return (
                              <td key={c.key} className="py-2 px-3 text-xs text-slate-700 font-mono border-l border-slate-100 whitespace-nowrap">
                                {val !== undefined && val !== null && String(val).trim() !== ''
                                  ? String(val)
                                  : <span className="text-slate-300 font-sans">—</span>}
                              </td>
                            );
                          })}
                          {!isLocked && (
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteDailyLog(log.id)}
                                className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 p-1 rounded cursor-pointer transition font-bold"
                                title="Delete daily log entry"
                              >
                                ✕
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: TECHNICAL DETAILS */}
        {activeTab === 'technical-details' && (
          <div className="space-y-3">
            <div className="flex border-b border-slate-300 gap-1 pb-1">
              {[
                { key: 'fishing', label: 'Fishing' },
                { key: 'whipstock', label: 'Whipstock' },
                { key: 'rentals', label: 'Rentals' },
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setTechSubTab(s.key as any)}
                  className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
                    techSubTab === s.key
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Sub-Tab 1: Fishing */}
            {techSubTab === 'fishing' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center">
                    <label className="w-24 font-bold text-slate-700">Casing:</label>
                    <input
                      type="text"
                      value={jobData.technicalDetails?.casing || ''}
                      disabled={isLocked}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: { ...jobData.technicalDetails, casing: e.target.value },
                        })
                      }
                      placeholder='e.g. 9-5/8"'
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-48 shadow-2xs disabled:bg-slate-100"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="w-24 font-bold text-slate-700">Csg ppf:</label>
                    <input
                      type="text"
                      value={jobData.technicalDetails?.csgPpf || ''}
                      disabled={isLocked}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: { ...jobData.technicalDetails, csgPpf: e.target.value },
                        })
                      }
                      placeholder="e.g. 47#"
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-48 shadow-2xs disabled:bg-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Scope of Work:</label>
                  <textarea
                    rows={8}
                    value={jobData.technicalDetails?.scopeOfWork || ''}
                    disabled={isLocked}
                    onChange={(e) =>
                      setJobData({
                        ...jobData,
                        technicalDetails: { ...jobData.technicalDetails, scopeOfWork: e.target.value },
                      })
                    }
                    placeholder="Enter fishing scope of work, fish specifications, depth, and target fish description..."
                    className="w-full bg-white border border-[#9fb6cf] rounded p-2.5 text-xs text-slate-800 font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                  />
                </div>
              </div>
            )}

            {/* Sub-Tab 2: Whipstock */}
            {techSubTab === 'whipstock' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center">
                    <label className="w-28 font-bold text-slate-700">Casing:</label>
                    <input
                      type="text"
                      value={jobData.technicalDetails?.casing || ''}
                      disabled={isLocked}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: { ...jobData.technicalDetails, casing: e.target.value },
                        })
                      }
                      placeholder='e.g. 7"'
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-48 shadow-2xs disabled:bg-slate-100"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="w-28 font-bold text-slate-700">Csg ppf:</label>
                    <input
                      type="text"
                      value={jobData.technicalDetails?.csgPpf || ''}
                      disabled={isLocked}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: { ...jobData.technicalDetails, csgPpf: e.target.value },
                        })
                      }
                      placeholder="e.g. 29#"
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-48 shadow-2xs disabled:bg-slate-100"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="w-28 font-bold text-slate-700">Inclination:</label>
                    <input
                      type="text"
                      value={jobData.technicalDetails?.inclination || ''}
                      disabled={isLocked}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: { ...jobData.technicalDetails, inclination: e.target.value },
                        })
                      }
                      placeholder="e.g. 45 deg"
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-48 shadow-2xs disabled:bg-slate-100"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="w-28 font-bold text-slate-700">Whipstock Type:</label>
                    <select
                      value={jobData.technicalDetails?.whipstockType || 'RETRIEVABLE'}
                      disabled={isLocked}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: {
                            ...jobData.technicalDetails,
                            whipstockType: e.target.value as any,
                          },
                        })
                      }
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-bold w-48 shadow-2xs cursor-pointer disabled:bg-slate-100"
                    >
                      <option value="RETRIEVABLE">1) RETRIEVABLE</option>
                      <option value="PERMANENT">2) PERMANENT</option>
                    </select>
                  </div>
                  <div className="flex items-center">
                    <label className="w-28 font-bold text-slate-700">Setting Depth:</label>
                    <input
                      type="text"
                      value={jobData.technicalDetails?.settingDepth || ''}
                      disabled={isLocked}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: { ...jobData.technicalDetails, settingDepth: e.target.value },
                        })
                      }
                      placeholder="e.g. 11,250 ft"
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-48 shadow-2xs disabled:bg-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Scope of Work:</label>
                  <textarea
                    rows={7}
                    value={jobData.technicalDetails?.scopeOfWork || ''}
                    disabled={isLocked}
                    onChange={(e) =>
                      setJobData({
                        ...jobData,
                        technicalDetails: { ...jobData.technicalDetails, scopeOfWork: e.target.value },
                      })
                    }
                    placeholder="Enter whipstock window milling, anchor setting, and orientation parameters..."
                    className="w-full bg-white border border-[#9fb6cf] rounded p-2.5 text-xs text-slate-800 font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                  />
                </div>
              </div>
            )}

            {/* Sub-Tab 3: Rentals */}
            {techSubTab === 'rentals' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[1, 2, 3, 4, 5, 6].map((num) => {
                    const hsKey = `holeSection${num}` as keyof NonNullable<DrillingJob['technicalDetails']>;
                    const csgKey = `casing${num}` as keyof NonNullable<DrillingJob['technicalDetails']>;
                    return (
                      <div key={num} className="flex items-center gap-2">
                        <label className="w-28 font-bold text-slate-700">Hole Section-{num}:</label>
                        <input
                          type="text"
                          value={(jobData.technicalDetails as any)?.[hsKey] || ''}
                          disabled={isLocked}
                          onChange={(e) =>
                            setJobData({
                              ...jobData,
                              technicalDetails: {
                                ...jobData.technicalDetails,
                                [hsKey]: e.target.value,
                              },
                            })
                          }
                          placeholder='e.g. 12-1/4"'
                          className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-28 shadow-2xs disabled:bg-slate-100"
                        />
                        <label className="font-bold text-slate-600 pl-2">Casing:</label>
                        <input
                          type="text"
                          value={(jobData.technicalDetails as any)?.[csgKey] || ''}
                          disabled={isLocked}
                          onChange={(e) =>
                            setJobData({
                              ...jobData,
                              technicalDetails: {
                                ...jobData.technicalDetails,
                                [csgKey]: e.target.value,
                              },
                            })
                          }
                          placeholder='e.g. 9-5/8"'
                          className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-28 shadow-2xs disabled:bg-slate-100"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Scope of work:</label>
                  <textarea
                    rows={6}
                    value={jobData.technicalDetails?.scopeOfWork || ''}
                    disabled={isLocked}
                    onChange={(e) =>
                      setJobData({
                        ...jobData,
                        technicalDetails: { ...jobData.technicalDetails, scopeOfWork: e.target.value },
                      })
                    }
                    placeholder="Enter rental tools scope of work, stabilizer placement, jar requirements..."
                    className="w-full bg-white border border-[#9fb6cf] rounded p-2.5 text-xs text-slate-800 font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                  />
                </div>
              </div>
            )}

            {!isLocked && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveJobHeader}
                  className="bg-[#386cb0] hover:bg-[#2c568f] text-white font-bold text-xs px-4 py-1.5 rounded shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>💾</span>
                  <span>Save Technical Details</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MANPOWER / CREW */}
        {activeTab === 'manpower' && (
          <div className="space-y-3">
            <div className="bg-[#f8fafc] border border-[#b8cce0] rounded p-3 text-xs flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div>
                <h3 className="font-bold text-[#1a3055] text-sm">Field Engineers &amp; Rig Crew Assignment</h3>
                <div className="text-slate-500 text-[11px]">
                  Mobilize certified fishing engineers, whipstock specialists, and rig tool supervisors for Rig <strong>{jobData.rig}</strong>.
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isClosedOrInvoiced && !isLocked && (
                  <button
                    type="button"
                    onClick={() => setIsPersonnelSelectOpen(true)}
                    className="bg-[#107c41] hover:bg-[#0c6233] text-white font-bold text-xs px-3.5 py-1.5 rounded-full shadow-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>➕</span>
                    <span>Select Personnel / Crew</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handlePrintTicket('pob')}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs px-3 py-1.5 rounded transition cursor-pointer"
                >
                  Print POB / Manifest
                </button>
              </div>
            </div>

            {/* Crew Members Table */}
            <div className="border border-[#b8cce0] rounded overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px] select-none">
                  <tr>
                    <th style={{ width: crewResizer.widths.seq || 48 }} className="py-1 px-2 whitespace-nowrap text-center relative">
                      <span>Seq</span>
                      <ResizerHandle onMouseDown={(e) => crewResizer.startResize('seq', e)} />
                    </th>
                    <th style={{ width: crewResizer.widths.badgeNo || 95 }} className="py-1 px-2 whitespace-nowrap relative">
                      <span>Badge #</span>
                      <ResizerHandle onMouseDown={(e) => crewResizer.startResize('badgeNo', e)} />
                    </th>
                    <th style={{ width: crewResizer.widths.name || 180 }} className="py-1 px-2 whitespace-nowrap relative">
                      <span>Engineer / Supervisor Name</span>
                      <ResizerHandle onMouseDown={(e) => crewResizer.startResize('name', e)} />
                    </th>
                    <th style={{ width: crewResizer.widths.designation || 180 }} className="py-1 px-2 whitespace-nowrap relative">
                      <span>Role / Designation</span>
                      <ResizerHandle onMouseDown={(e) => crewResizer.startResize('designation', e)} />
                    </th>
                    <th style={{ width: crewResizer.widths.mobDate || 100 }} className="py-1 px-2 whitespace-nowrap font-mono relative">
                      <span>Mob Date</span>
                      <ResizerHandle onMouseDown={(e) => crewResizer.startResize('mobDate', e)} />
                    </th>
                    <th style={{ width: crewResizer.widths.demobDate || 100 }} className="py-1 px-2 whitespace-nowrap font-mono relative">
                      <span>Demob Date</span>
                      <ResizerHandle onMouseDown={(e) => crewResizer.startResize('demobDate', e)} />
                    </th>
                    <th style={{ width: crewResizer.widths.rigPass || 110 }} className="py-1 px-2 whitespace-nowrap relative">
                      <span>Rig Pass / Cert</span>
                      <ResizerHandle onMouseDown={(e) => crewResizer.startResize('rigPass', e)} />
                    </th>
                    <th style={{ width: crewResizer.widths.h2s || 100 }} className="py-1 px-2 whitespace-nowrap font-mono relative">
                      <span>H2S Expiry</span>
                      <ResizerHandle onMouseDown={(e) => crewResizer.startResize('h2s', e)} />
                    </th>
                    <th style={{ width: crewResizer.widths.status || 90 }} className="py-1 px-2 whitespace-nowrap text-center relative">
                      <span>Status</span>
                      <ResizerHandle onMouseDown={(e) => crewResizer.startResize('status', e)} />
                    </th>
                    {crewCustomCols.map((c) => (
                      <th
                        key={c.key}
                        style={{ width: crewResizer.widths[c.key] || c.width || 120 }}
                        className="py-1 px-2 whitespace-nowrap relative bg-indigo-50/50 text-indigo-950 font-bold border-l border-indigo-200"
                        title={`Custom Column: ${c.label}`}
                      >
                        <span>{c.label}</span>
                        <ResizerHandle onMouseDown={(e) => crewResizer.startResize(c.key, e)} />
                      </th>
                    ))}
                    {!isClosedOrInvoiced && !isLocked && (
                      <th style={{ width: crewResizer.widths.action || 60 }} className="py-1 px-2 whitespace-nowrap text-center relative">
                        <span>Action</span>
                        <ResizerHandle onMouseDown={(e) => crewResizer.startResize('action', e)} />
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {assignedCrew.length === 0 ? (
                    <tr>
                      <td colSpan={(isClosedOrInvoiced || isLocked ? 9 : 10) + crewCustomCols.length} className="p-6 text-center text-slate-500 font-medium">
                        No field personnel assigned to this job yet.
                        {!isClosedOrInvoiced && !isLocked && (
                          <span> Click <strong>&quot;Select Personnel / Crew&quot;</strong> above to assign certified crew members.</span>
                        )}
                      </td>
                    </tr>
                  ) : (
                    assignedCrew.map((c, idx) => (
                      <tr key={c.id || idx} className="hover:bg-blue-50/50 h-7 leading-none">
                        <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{idx + 1}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{c.badgeNo}</td>
                        <td className="py-1 px-2 whitespace-nowrap truncate max-w-[180px] font-bold text-blue-900" title={c.name}>{c.name}</td>
                        <td className="py-1 px-2 whitespace-nowrap truncate max-w-[200px] text-slate-700" title={c.designation}>{c.designation}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px]">{formatDateDD_MM_YYYY(c.mobDate)}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-500">{c.demobDate ? formatDateDD_MM_YYYY(c.demobDate) : '— (Active)'}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-blue-700">{c.rigPassNo || '—'}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">{c.h2sExpiry ? formatDateDD_MM_YYYY(c.h2sExpiry) : '—'}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.status.includes('Rig')
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        {crewCustomCols.map((col) => {
                          const val = (c as any)[col.key] ?? (c as any).customFields?.[col.key];
                          return (
                            <td key={col.key} className="py-1 px-2 text-xs text-slate-700 font-mono border-l border-slate-100 whitespace-nowrap">
                              {val !== undefined && val !== null && String(val).trim() !== ''
                                ? String(val)
                                : <span className="text-slate-300 font-sans">—</span>}
                            </td>
                          );
                        })}
                        {!isClosedOrInvoiced && !isLocked && (
                          <td className="py-1 px-2 whitespace-nowrap text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteCrewMember(c.id)}
                              className="text-red-600 hover:text-red-800 font-bold text-[11px] hover:underline cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Crew Assignment Summary Bar */}
            <div className="bg-[#1a3055] text-white p-2.5 rounded flex items-center justify-between text-xs font-medium">
              <div>
                Total Assigned Personnel: <strong className="text-amber-400 font-mono font-bold">{assignedCrew.length} Engineers</strong>
              </div>
              <div>
                Active on Rig: <strong className="text-emerald-400 font-mono font-bold">{assignedCrew.filter((c) => c.status.includes('Rig')).length}</strong>
              </div>
              <div>
                Designated Rig: <strong className="text-white font-bold">{jobData.rig}</strong>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CHECKLISTHEADER / TOOLS CHECK LIST */}
        {activeTab === 'checklist' && (
          <div className="space-y-3">
            <div className="bg-[#f8fafc] border border-[#b8cce0] rounded p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-bold text-[#1a3055]">Tools Check List</h2>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    activeCallout.status.includes('Closed') || activeCallout.status.includes('Released')
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-blue-100 text-blue-900 border border-blue-300'
                  }`}>
                    {activeCallout.status || automatedChecklistStatus}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {(!isClosedOrInvoiced || adminUnlocked) && (!isLocked || adminUnlocked || isAdmin) && (
                    <>
                      {isContract4700024096 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (previousPoolJobs.length > 0) {
                              setSelectedPreviousJobId(previousPoolJobs[0].id);
                            }
                            setIsRolloverModalOpen(true);
                          }}
                          className="bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs px-3 py-1 rounded-full shadow-xs transition cursor-pointer flex items-center gap-1.5"
                          title="Import all active unreturned tools from a previous month's job under Contract 4700024096"
                        >
                          <span>📥</span>
                          <span>Rollover Tools</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setCheckedToolSerials([]);
                          setCheckedToolDisplayMap({});
                          setToolSearchQuery('');
                          setIsToolSelectOpen(true);
                        }}
                        className="bg-[#107c41] hover:bg-[#0c6233] text-white font-bold text-xs px-3 py-1 rounded-full shadow-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <span>➕</span>
                        <span>Select Tools</span>
                      </button>

                      {(() => {
                        const isDtDisabled = pendingChecklistItems.length === 0 || ((isClosedOrInvoiced || isLocked) && !adminUnlocked);
                        return (
                          <button
                            type="button"
                            disabled={isDtDisabled}
                            onClick={handleGenerateDTFromChecklist}
                            className={`font-bold text-xs px-3.5 py-1 rounded transition flex items-center gap-1.5 ${
                              isDtDisabled
                                ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed select-none shadow-none opacity-60'
                                : 'bg-blue-800 hover:bg-blue-900 text-white shadow-xs cursor-pointer active:scale-95'
                            }`}
                            title={
                              pendingChecklistItems.length === 0
                                ? 'No pending tools in checklist to dispatch (all tools dispatched on Delivery Tickets). Click "+ Select Tools" to add equipment.'
                                : selectedPendingCount > 0
                                ? `Transfer ${selectedPendingCount} selected pending tool(s) directly into a new Delivery Ticket`
                                : `Transfer all ${pendingChecklistItems.length} pending tool(s) into a new Delivery Ticket`
                            }
                          >
                            <span>🚚</span>
                            <span>
                              Generate DT from Checklist
                              {selectedPendingCount > 0
                                ? ` (${selectedPendingCount} Selected)`
                                : pendingChecklistItems.length > 0
                                ? ` (${pendingChecklistItems.length} Pending)`
                                : ' (0 Pending)'}
                            </span>
                          </button>
                        );
                      })()}
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => handlePrintDispatchChecklist()}
                    className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs px-2.5 py-1 rounded border border-amber-300 transition cursor-pointer"
                    title="Print Official Dispatch Checklist (Form DSF-003)"
                  >
                    PRINT DISPATCH CHECKLIST
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintTicket('report')}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs px-2.5 py-1 rounded transition cursor-pointer"
                  >
                    PRINT REPORT
                  </button>
                </div>
              </div>

              {/* Checklist Field Grid - memoized to prevent cascade re-renders on typing */}
              <CalloutHeaderForm
                calloutId={activeCallout.id || ''}
                reqDate={toInputDateFormat(activeCallout.reqDate)}
                projectNo={activeCallout.projectNo || jobData.contractNo || ''}
                poNumber={activeCallout.poNumber || jobData.poNumber || ''}
                emailRef={activeCallout.emailRef || ''}
                rigWellDisplay={`${jobData.rig} / ${jobData.well}`}
                disabled={isClosedOrInvoiced || isLocked}
                statusText={automatedChecklistStatus}
                statusClassName={
                  automatedChecklistStatus.includes('Closed')
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : automatedChecklistStatus.includes('Dispatched')
                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                    : automatedChecklistStatus.includes('Delivery Ticket')
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : automatedChecklistStatus.includes('In Progress')
                    ? 'bg-slate-50 text-slate-700 border-slate-200'
                    : 'bg-slate-100 text-slate-800 border-slate-300'
                }
                onFieldChange={handleUpdateCalloutHeader}
              />
            </div>

            {/* Checklist Table */}
            <div className="border border-[#b8cce0] rounded overflow-y-auto overflow-x-auto max-h-[calc(88vh-260px)] min-h-[320px]">
              <table className="min-w-full text-left text-xs border-collapse table-fixed">
                <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px] select-none sticky top-0 z-10 shadow-xs">
                  <tr>
                    <th style={{ width: checklistResizer.widths.select || 40 }} className="p-1.5 text-center relative overflow-hidden truncate">
                      <input
                        type="checkbox"
                        checked={allPendingSelected}
                        onChange={toggleSelectAllPending}
                        disabled={pendingChecklistItems.length === 0 || isClosedOrInvoiced || isLocked}
                        title="Select / Deselect all pending tools"
                        className="cursor-pointer accent-blue-600 rounded"
                      />
                      <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('select', e)} onDoubleClick={() => checklistResizer.resetColumn('select')} />
                    </th>
                    <th style={{ width: checklistResizer.widths.itemNo || 50 }} className="p-1.5 text-center relative overflow-hidden truncate">
                      <span>ItemNo</span>
                      <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('itemNo', e)} onDoubleClick={() => checklistResizer.resetColumn('itemNo')} />
                    </th>
                    <th style={{ width: checklistResizer.widths.partNo || 140 }} className="p-1.5 relative overflow-hidden truncate">
                      <span>Asset No</span>
                      <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('partNo', e)} onDoubleClick={() => checklistResizer.resetColumn('partNo')} />
                    </th>
                    <th style={{ width: checklistResizer.widths.description || 280 }} className="p-1.5 relative overflow-hidden truncate">
                      <span>Description</span>
                      <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('description', e)} onDoubleClick={() => checklistResizer.resetColumn('description')} />
                    </th>
                    <th style={{ width: checklistResizer.widths.qty || 60 }} className="p-1.5 text-center relative overflow-hidden truncate">
                      <span>DTQTY</span>
                      <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('qty', e)} onDoubleClick={() => checklistResizer.resetColumn('qty')} />
                    </th>
                    <th style={{ width: checklistResizer.widths.supplier || 110 }} className="p-1.5 relative overflow-hidden truncate">
                      <span>Supplier</span>
                      <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('supplier', e)} onDoubleClick={() => checklistResizer.resetColumn('supplier')} />
                    </th>
                    <th style={{ width: checklistResizer.widths.qtyIn || 60 }} className="p-1.5 text-center relative overflow-hidden truncate">
                      <span>QTYIN</span>
                      <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('qtyIn', e)} onDoubleClick={() => checklistResizer.resetColumn('qtyIn')} />
                    </th>
                    <th style={{ width: checklistResizer.widths.insNum || 140 }} className="p-1.5 relative overflow-hidden truncate">
                      <span>INS_NUM</span>
                      <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('insNum', e)} onDoubleClick={() => checklistResizer.resetColumn('insNum')} />
                    </th>
                    <th style={{ width: checklistResizer.widths.insDate || 105 }} className="p-1.5 relative overflow-hidden truncate">
                      <span>INS_DATE</span>
                      <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('insDate', e)} onDoubleClick={() => checklistResizer.resetColumn('insDate')} />
                    </th>
                    <th style={{ width: checklistResizer.widths.comments || 110 }} className="p-1.5 relative overflow-hidden truncate">
                      <span>Comments</span>
                      <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('comments', e)} onDoubleClick={() => checklistResizer.resetColumn('comments')} />
                    </th>
                    <th style={{ width: checklistResizer.widths.cat || 120 }} className="p-1.5 relative overflow-hidden truncate">
                      <span>Category</span>
                      <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('cat', e)} onDoubleClick={() => checklistResizer.resetColumn('cat')} />
                    </th>

                    {/* Dedicated Rig Allocation & Client DT Columns for ADNOC Drilling 4700024096 */}
                    {isContract4700024096 && (
                      <>
                        <th style={{ width: 130 }} className="p-1.5 relative bg-amber-50 text-amber-950 font-bold overflow-hidden truncate border-l border-amber-200">
                          <span title="ADNOC Drilling Rig Allocation">Assigned Rig 📍</span>
                        </th>
                        <th style={{ width: 100 }} className="p-1.5 relative bg-amber-50 text-amber-950 font-bold overflow-hidden truncate border-l border-amber-200">
                          <span title="Target Well Name">Well</span>
                        </th>
                        <th style={{ width: 130 }} className="p-1.5 relative bg-amber-50 text-amber-950 font-bold overflow-hidden truncate border-l border-amber-200">
                          <span title="ADNOC Drilling Confirmed Client DT #">Client DT No 🏷️</span>
                        </th>
                      </>
                    )}

                    <th style={{ width: checklistResizer.widths.status || 140 }} className="p-1.5 text-center relative overflow-hidden truncate">
                      <span>Mobilization / DT</span>
                      <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('status', e)} onDoubleClick={() => checklistResizer.resetColumn('status')} />
                    </th>

                    {/* Custom columns registered in Database Inspector */}
                    {checklistCustomCols.map((c) => (
                      <th
                        key={c.key}
                        style={{ width: checklistResizer.widths[c.key] || c.width || 130 }}
                        className="p-1.5 relative bg-emerald-50 text-emerald-950 font-bold overflow-hidden truncate"
                      >
                        <div className="flex items-center gap-1">
                          <span className="text-emerald-600 text-[10px]">★</span>
                          <span className="truncate">{c.label}</span>
                        </div>
                        <ResizerHandle onMouseDown={(e) => checklistResizer.startResize(c.key, e)} onDoubleClick={() => checklistResizer.resetColumn(c.key)} />
                      </th>
                    ))}

                    {!isClosedOrInvoiced && !isLocked && (
                      <th style={{ width: checklistResizer.widths.actions || 75 }} className="p-1.5 text-center relative overflow-hidden truncate">
                        <span>Action</span>
                        <ResizerHandle onMouseDown={(e) => checklistResizer.startResize('actions', e)} onDoubleClick={() => checklistResizer.resetColumn('actions')} />
                      </th>
                    )}
                    {/* Trailing flexible filler header to absorb excess table width */}
                    <th className="p-0 border-0 pointer-events-none w-auto" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {checklistItems.length === 0 ? (
                    <tr>
                      <td colSpan={(isClosedOrInvoiced || isLocked ? 13 : 14) + checklistCustomCols.length} className="p-6 text-center text-slate-500 font-medium">
                        No tools in checklist.
                        {!isClosedOrInvoiced && !isLocked && (
                          <span> Click <strong>&quot;Select Tools&quot;</strong> above to pick available tools from yard inventory.</span>
                        )}
                      </td>
                    </tr>
                  ) : (
                    checklistItems.map((item, i) => {
                      const assignedDT = getAssignedDTForChecklistItem(item);
                      // Direct read, no inventory lookup: whatever was recorded on this
                      // checklist line (Asset No, Description, Category, Supplier) when
                      // the tool was selected is exactly what's shown here. The backend
                      // record is the single source of truth — nothing is re-derived at
                      // display time.
                      const displayItemAssetNo = item.partNo || item.serialNos?.[0] || '—';
                      const displayItemDesc = item.description || '—';
                      const displayItemCategory = item.cat || item.shortDesc || '—';
                      const displayItemSupplier = item.supplier || item.ownership || 'EMDAD';

                      // Look up genuine inspection record if item has none or has dummy GIS-Z-
                      const itemInspections = (inspections || []).filter(
                        (ins) =>
                          (ins.serial && item.partNo && ins.serial.trim().toLowerCase() === item.partNo.trim().toLowerCase()) ||
                          (ins.serial && item.serialNos?.[0] && ins.serial.trim().toLowerCase() === item.serialNos[0].trim().toLowerCase())
                      );
                      const latestItemIns = itemInspections.length > 0
                        ? [...itemInspections].sort(
                            (a, b) =>
                              new Date(b.inspectionDate || b.reportDate || b.receivedDate || '').getTime() -
                              new Date(a.inspectionDate || a.reportDate || a.receivedDate || '').getTime()
                          )[0]
                        : null;
                      const hasDummyGIS = Boolean(item.insNum && item.insNum.startsWith('GIS-Z-'));
                      const displayInsNum = latestItemIns?.reportNumber || latestItemIns?.woNumber || latestItemIns?.id || (item.insNum && !hasDummyGIS ? item.insNum : '') || '—';
                      const rawItemInsDate = latestItemIns?.inspectionDate || latestItemIns?.reportDate || latestItemIns?.receivedDate;
                      const displayInsDate = rawItemInsDate
                        ? formatDateDD_MM_YYYY(rawItemInsDate)
                        : (item.insDate && !item.insDate.includes('undefined') ? item.insDate : '—');
                      const displayCondition = latestItemIns?.status ? latestItemIns.status.toUpperCase() : (item.comments || 'ACCEPTED');

                      return (
                        <tr key={i} className={`${assignedDT?.isLocked ? 'bg-slate-100 text-slate-400' : 'hover:bg-blue-50/50'} h-7 leading-none`}>
                          {/* Selection Checkbox */}
                          <td className="py-1 px-2 whitespace-nowrap text-center">
                            {assignedDT?.isLocked && !adminUnlocked ? (
                              <input
                                type="checkbox"
                                checked
                                disabled
                                className="cursor-not-allowed opacity-40 accent-slate-500 rounded"
                                title={`Locked: Tool already dispatched on Delivery Ticket ${assignedDT.dtNumber}`}
                              />
                            ) : (
                              <input
                                type="checkbox"
                                checked={selectedChecklistSeqs.includes(item.seq)}
                                disabled={(isClosedOrInvoiced || isLocked) && !adminUnlocked}
                                onChange={() => toggleChecklistItem(item.seq)}
                                className="cursor-pointer accent-blue-600 rounded"
                                title="Select tool to include in Delivery Ticket"
                              />
                            )}
                          </td>
                          <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600 truncate">{i + 1}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900 truncate" title={displayItemAssetNo}>
                            {adminUnlocked ? (
                              <input
                                type="text"
                                defaultValue={displayItemAssetNo}
                                onBlur={(e) => handleUpdateChecklistItemField(item.seq, 'partNo', e.target.value)}
                                className="bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 w-28 focus:ring-1 focus:ring-blue-500"
                                title="Admin Edit: Edit Asset No"
                              />
                            ) : (
                              displayItemAssetNo
                            )}
                          </td>
                          <td className="py-1 px-2 whitespace-nowrap truncate font-medium text-slate-800" title={displayItemDesc}>{displayItemDesc}</td>
                          <td className="py-1 px-2 whitespace-nowrap text-center font-bold truncate">{item.qty || 1}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-medium text-slate-700 truncate" title={displayItemSupplier}>{displayItemSupplier}</td>
                          <td className="py-1 px-2 whitespace-nowrap text-center font-bold truncate">{item.qtyIn || 1}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-blue-700 truncate" title={displayInsNum}>{displayInsNum}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600 truncate" title={displayInsDate}>{displayInsDate}</td>
                          <td className="py-1 px-2 whitespace-nowrap text-[11px] text-slate-600 truncate" title={displayCondition}>{displayCondition}</td>
                          <td className="py-1 px-2 whitespace-nowrap text-[11px] text-slate-600 truncate" title={displayItemCategory}>{displayItemCategory}</td>

                          {/* Rig Allocation & Client DT Cells — memoized per row */}
                          {isContract4700024096 && (
                            <ChecklistRowInputCells
                              seq={item.seq}
                              allocatedRig={item.allocatedRig || jobData.rig || ''}
                              allocatedWell={item.allocatedWell ?? (item.allocatedRig ? (item.allocatedWell || '') : (jobData.well || ''))}
                              clientDtNo={item.clientDtNo || ''}
                              disabled={(isClosedOrInvoiced || isLocked) && !adminUnlocked}
                              rigOptions={adnocRigOptions}
                              onFieldChange={handleUpdateChecklistItemField}
                            />
                          )}

                          {/* Mobilization / DT Status: Light grey for locked, light slate for pending (no purple, no amber) */}
                          <td className="py-1 px-2 whitespace-nowrap text-center truncate">
                            {assignedDT?.isLocked ? (
                              <span
                                className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300 inline-flex items-center gap-1"
                                title={`Dispatched on Delivery Ticket ${assignedDT.dtNumber}`}
                              >
                                🔒 {assignedDT.dtNumber}
                              </span>
                            ) : assignedDT ? (
                              <span
                                className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200 inline-flex items-center gap-1"
                                title={`Assigned to draft Delivery Ticket ${assignedDT.dtNumber}`}
                              >
                                Draft • {assignedDT.dtNumber}
                              </span>
                            ) : (
                              <span
                                className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200"
                                title="Reserved in checklist; pending Delivery Ticket generation"
                              >
                                Pending Dispatch
                              </span>
                            )}
                          </td>

                          {/* Custom Column cells for checklist */}
                          {checklistCustomCols.map((c) => {
                            const val = (item as any)[c.key] ?? (item as any).customFields?.[c.key] ?? '—';
                            return (
                              <td key={c.key} className="py-1 px-2 whitespace-nowrap font-mono text-slate-800 truncate" title={String(val)}>
                                {String(val)}
                              </td>
                            );
                          })}

                          {((!isClosedOrInvoiced || adminUnlocked) && (!isLocked || adminUnlocked)) && (
                            <td className="py-1 px-2 whitespace-nowrap text-center truncate">
                              {assignedDT?.isLocked && !adminUnlocked ? (
                                <span
                                  className="text-slate-400 font-bold text-[11px] inline-flex items-center gap-0.5 cursor-not-allowed select-none"
                                  title={`Locked: Tool already dispatched on Delivery Ticket ${assignedDT.dtNumber}. Cannot delete from checklist.`}
                                >
                                  🔒 Locked
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteChecklistRow(item.seq)}
                                  className="text-red-600 hover:text-red-800 font-bold text-[11px] hover:underline cursor-pointer"
                                  title="Delete row and return tool to inventory"
                                >
                                  Delete
                                </button>
                              )}
                            </td>
                          )}
                          {/* Trailing filler cell */}
                          <td className="p-0 border-0" />
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: DELIVERY TICKET HEADER / RENTAL TICKET */}
        {activeTab === 'delivery-tickets' && (
          <div className="space-y-3">
            {/* Header: Clean Dropdown for DT selection */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-300 pb-2 gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Select Delivery Ticket:</label>
                {jobDTs.length === 0 ? (
                  <span className="text-xs font-mono font-bold text-amber-900 bg-amber-50 border border-amber-300 rounded px-2.5 py-1">
                    No DT Generated (Draft Checklist Manifest)
                  </span>
                ) : (
                  <select
                    value={selectedDTNumber}
                    onChange={(e) => setSelectedDTNumber(e.target.value)}
                    className="bg-white border border-[#9fb6cf] rounded px-3 py-1 text-xs font-mono font-bold text-[#1a3055] shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500 min-w-[240px]"
                  >
                    {jobDTs.map((dt) => (
                      <option key={dt.dtNumber} value={dt.dtNumber}>
                        {dt.dtNumber} — {dt.toolLines?.length || 0} tool(s) ({formatDateDD_MM_YYYY(dt.dispatchDate)}) {dt.isLocked ? '🔒 Dispatched' : '🔓 Draft'}
                      </option>
                    ))}
                  </select>
                )}
                {(!isClosedOrInvoiced || adminUnlocked) && (!isLocked || adminUnlocked || isAdmin) && (
                  <>
                    <button
                      type="button"
                      onClick={handleCreateNewDTInJob}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-2.5 py-1 rounded shadow-2xs transition cursor-pointer flex items-center gap-1"
                      title="Create a new Delivery Ticket manifest for this job"
                    >
                      <span>+</span>
                      <span>New DT</span>
                    </button>
                    {pendingChecklistItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleGenerateDTFromChecklist}
                        className="bg-blue-800 hover:bg-blue-900 text-white font-bold text-xs px-3 py-1 rounded shadow-xs transition cursor-pointer flex items-center gap-1.5"
                        title="Create a new Delivery Ticket from selected checklist tools and dispatch to rig"
                      >
                        <span>🚚</span>
                        <span>
                          Create DT from Selected ✓ Tools
                          {selectedPendingCount > 0 ? ` (${selectedPendingCount} Selected)` : ` (${pendingChecklistItems.length} Pending)`}
                        </span>
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {jobDTs.length === 0 ? (
                  <>
                    <span className="bg-amber-50 text-amber-900 border border-amber-300 font-bold text-xs px-2.5 py-1 rounded flex items-center gap-1 shadow-2xs">
                      <span>📝</span>
                      <span>Draft Preview (Not Dispatched)</span>
                    </span>
                  </>
                ) : Boolean(activeDT?.isLocked) && !adminUnlocked ? (
                  <>
                    <span className="bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs px-3 py-1 rounded flex items-center gap-1 shadow-2xs">
                      <span>🔒</span>
                      <span>Dispatched &amp; Locked (Shipped to Rig)</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleUnlockDT}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-2.5 py-1 rounded shadow-2xs cursor-pointer flex items-center gap-1 transition"
                      title="Unlock this Delivery Ticket to edit equipment, remove duplicates, or re-sync from checklist"
                    >
                      <span>🔓</span>
                      <span>Unlock DT</span>
                    </button>
                    {(canEditJobs || isAdmin) && (
                      <button
                        type="button"
                        onClick={handleDeleteCurrentDT}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-2.5 py-1 rounded shadow-2xs transition cursor-pointer flex items-center gap-1"
                        title="Delete this Delivery Ticket, return tools to yard, and reset checklist"
                      >
                        <span>🗑️</span>
                        <span>Delete DT</span>
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setIsReopenModalOpen(true)}
                        className="bg-slate-600 hover:bg-slate-700 text-white font-bold text-xs px-2.5 py-1 rounded shadow-2xs cursor-pointer flex items-center gap-1 transition"
                        title="Admin Override: Unlock entire dossier"
                      >
                        <span>⚙️</span>
                        <span>Full Admin Unlock</span>
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs px-2.5 py-1 rounded flex items-center gap-1 shadow-2xs">
                      <span>🔓</span>
                      <span>Draft / Unlocked (In Yard)</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleSyncToolsFromChecklist}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-2.5 py-1 rounded shadow-2xs transition cursor-pointer flex items-center gap-1"
                      title="Replace equipment on this DT with tools currently in Checklist"
                    >
                      <span>🔄</span>
                      <span>Sync from Checklist</span>
                    </button>
                    {(canEditJobs || isAdmin) && (
                      <button
                        type="button"
                        onClick={handleDeleteCurrentDT}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-2.5 py-1 rounded shadow-2xs transition cursor-pointer flex items-center gap-1"
                        title="Delete this Delivery Ticket and return tools to yard"
                      >
                        <span>🗑️</span>
                        <span>Delete DT</span>
                      </button>
                    )}
                    {(!isClosedOrInvoiced || adminUnlocked) && (!isLocked || adminUnlocked) && (
                      <button
                        type="button"
                        onClick={handleConfirmAndLockDT}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3.5 py-1 rounded shadow-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <span>🚚</span>
                        <span>{adminUnlocked ? 'Confirm Corrections & Lock DT' : 'Confirm Dispatch & Lock DT (Ship to Rig)'}</span>
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handlePrintDeliveryTicket(effectiveDT)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-2.5 py-1 rounded border border-slate-300 cursor-pointer shadow-2xs"
                  title="Print Official Delivery Ticket (Form DSF-001)"
                >
                  Print Delivery Ticket
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintDispatchChecklist(effectiveDT)}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold text-xs px-2.5 py-1 rounded border border-amber-300 cursor-pointer shadow-2xs"
                  title="Print Official Dispatch Checklist (Form DSF-003)"
                >
                  Print Dispatch Checklist
                </button>
              </div>
            </div>

            {/* Rental Ticket Form / Details */}
            <div className="space-y-3">
              {jobDTs.length === 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded p-3 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-700 text-lg">⚠️</span>
                    <div>
                      <strong className="text-amber-900 font-bold">Delivery Ticket Not Generated Yet:</strong>
                      <span className="text-amber-800 ml-1">
                        Equipment is currently in yard (Emdad Base). The lines below are a draft preview. To dispatch equipment to Rig {jobData.rig}, select your checklist tools and click &quot;Create DT from Selected ✓ Tools&quot;.
                      </span>
                    </div>
                  </div>
                  {pendingChecklistItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleGenerateDTFromChecklist}
                      className="bg-blue-800 hover:bg-blue-900 text-white font-bold text-xs px-3.5 py-1.5 rounded shadow-xs whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                    >
                      <span>🚚</span>
                      <span>Create DT from Selected ✓ Tools</span>
                    </button>
                  )}
                </div>
              )}
              <div className="bg-[#f0f5fb] border border-[#b8cce0] rounded p-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                  <h3 className="font-bold text-blue-900 text-sm">Rental Ticket / Delivery Manifest</h3>
                  <span className="text-xs font-mono">
                    Ticket No : {jobDTs.length === 0 ? (
                      <span className="text-amber-800 font-bold text-sm bg-amber-50 border border-amber-300 px-2 py-0.5 rounded">
                        Draft Preview (Not Dispatched)
                      </span>
                    ) : (
                      <strong className="text-red-600 font-bold text-base">{effectiveDT.dtNumber}</strong>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div>
                    <span className="font-bold text-slate-600">Customer:</span>{' '}
                    <span className="font-bold">{jobData.client}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Project No:</span>{' '}
                    <span className="font-mono">{jobData.contractNo || cleanContractName(jobData.contract) || '—'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Sub-Division:</span>{' '}
                    <span className="font-bold px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800 border border-blue-200">
                      {jobData.subDivision || resolveContractSubDivision(jobData.contractNo || jobData.contract) || 'RENTALS'}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Purpose:</span>{' '}
                    <span>{jobData.serviceCategory || jobData.jobDescription || 'Downhole Rentals'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Rig:</span>{' '}
                    <span className="font-bold">{jobData.rig}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Job Number:</span>{' '}
                    <span className="font-mono font-bold text-blue-800">{jobData.id}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Well:</span>{' '}
                    <span>{jobData.well}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">DateShipped:</span>{' '}
                    <span className="font-mono font-bold">{formatDateDD_MM_YYYY(effectiveDT.dispatchDate)}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">RM Ref / Manifest:</span>{' '}
                    <span className="font-mono">{effectiveDT.rmRef || 'MR-881'}</span>
                  </div>
                </div>
              </div>

              {/* Mobilized Tools Table */}
              <div className="border border-[#b8cce0] rounded overflow-y-auto overflow-x-auto max-h-[calc(88vh-260px)] min-h-[260px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px] sticky top-0 z-10 shadow-xs">
                    <tr>
                      <th className="p-1.5 text-center w-12">ItemNo</th>
                      <th className="p-1.5">Asset No</th>
                      <th className="p-1.5">Description</th>
                      <th className="p-1.5 text-center w-14">DTQTY</th>
                      <th className="p-1.5">DATEOUT</th>
                      <th className="p-1.5">Job Number</th>
                      <th className="p-1.5">RGT_No</th>
                      <th className="p-1.5">Date_In</th>
                      <th className="p-1.5">Supplier</th>
                      <th className="p-1.5">Category</th>
                      {isContract4700024096 && (
                        <>
                          <th className="p-1.5 bg-amber-50 text-amber-950 font-bold border-l border-amber-200">Assigned Rig 📍</th>
                          <th className="p-1.5 bg-amber-50 text-amber-950 font-bold border-l border-amber-200">Well</th>
                          <th className="p-1.5 bg-amber-50 text-amber-950 font-bold border-l border-amber-200">Client DT # 🏷️</th>
                        </>
                      )}
                      {activeDT && (!activeDT.isLocked || adminUnlocked) && (
                        <th className="p-1.5 text-center w-14 bg-slate-100 border-l border-slate-200 text-slate-700">Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {effectiveDT.toolLines && effectiveDT.toolLines.length > 0 ? (
                      effectiveDT.toolLines.map((t, idx) => {
                        // Direct read, no inventory lookup: this Delivery Ticket line
                        // already carries its own Asset No, Description, Category and
                        // Supplier exactly as recorded when the ticket was created. The
                        // backend record is the single source of truth — nothing is
                        // re-derived at display time.
                        const displayDtAssetNo = t.assetNo || t.serial || '—';
                        const displayDtDesc = t.desc || '—';
                        const displayDtCategory = t.shortDesc || '—';
                        const displayDtSupplier = t.supplier || t.ownership || 'EMDAD';
                        const tSerial = (t.serial || '').trim().toUpperCase();
                        const tAsset = (t.assetNo || '').trim().toUpperCase();
                        const directRtRef = String((t as any).returnedRtNumber || t.rtBatchId || (t as any).rgtNo || '').trim();

                        const returnBatch = jobRTs.find((rt) => {
                          const rNum = (rt.rtNumber || rt.id || '').trim().toUpperCase();
                          const rNorm = normalizeJobKey(rNum);
                          const dNorm = normalizeJobKey(directRtRef);
                          if (directRtRef && directRtRef !== '—' && directRtRef !== '-' && (rNum === directRtRef.toUpperCase() || (rNorm && rNorm === dNorm))) return true;
                          return (rt.toolLines || []).some((rtl) => {
                            const rSerial = (rtl.serial || '').trim().toUpperCase();
                            const rAsset = (rtl.assetNo || '').trim().toUpperCase();
                            return (tSerial && (rSerial === tSerial || rAsset === tSerial)) || (tAsset && (rSerial === tAsset || rAsset === tAsset));
                          });
                        });

                        const dtDate = effectiveDT.dispatchDate || effectiveDT.rmDate;
                        const candidateReturnDate = (t as any).returnDate ||
                          (t as any).dateIn ||
                          (t as any).Date_In ||
                          returnBatch?.rtDate ||
                          returnBatch?.backloadRmDate ||
                          (returnBatch as any)?.Date_In ||
                          (returnBatch as any)?.dateIn;

                        const isReturnedValid = Boolean(candidateReturnDate && (!dtDate || candidateReturnDate >= dtDate));

                        let rgtNo: string | null = null;
                        let rgtDate: string | null = null;

                        if (returnBatch) {
                          rgtNo = returnBatch.rtNumber || (returnBatch as any).rgtNo || (directRtRef && directRtRef !== '—' ? directRtRef : null);
                          rgtDate = isReturnedValid ? candidateReturnDate : (returnBatch.rtDate || null);
                        } else if (directRtRef && directRtRef !== '—' && directRtRef !== '-' && isReturnedValid) {
                          rgtNo = directRtRef;
                          rgtDate = candidateReturnDate;
                        }

                        return (
                          <tr key={idx} className="hover:bg-blue-50/50 h-7 leading-none">
                            <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{idx + 1}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900" title={displayDtAssetNo}>
                              {adminUnlocked ? (
                                <input
                                  type="text"
                                  defaultValue={displayDtAssetNo}
                                  onBlur={(e) => handleUpdateDTLineAssetNo(idx, e.target.value)}
                                  className="bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 w-32 focus:ring-1 focus:ring-blue-500"
                                  title="Admin Edit: Edit Asset No"
                                />
                              ) : (
                                displayDtAssetNo
                              )}
                            </td>
                            <td className="py-1 px-2 whitespace-nowrap truncate max-w-[340px] font-medium text-slate-800" title={displayDtDesc}>{displayDtDesc}</td>
                            <td className="py-1 px-2 whitespace-nowrap text-center font-bold">{t.qty || 1}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">{formatDateDD_MM_YYYY(effectiveDT.dispatchDate)}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-blue-700">{jobData.id}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-emerald-700">{rgtNo || '—'}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">{rgtDate ? formatDateDD_MM_YYYY(rgtDate) : '—'}</td>
                            <td className="py-1 px-2 whitespace-nowrap text-slate-700 font-medium">{displayDtSupplier}</td>
                            <td className="py-1 px-2 whitespace-nowrap text-slate-600 text-[11px] font-medium">{displayDtCategory}</td>

                            {/* DT tool-line per-row inputs — memoized so only changed row re-renders */}
                            {isContract4700024096 && (
                              <DTToolLineInputCells
                                idx={idx}
                                allocatedRig={t.allocatedRig || effectiveDT.rig || jobData.rig || ''}
                                allocatedWell={t.allocatedWell ?? (t.allocatedRig ? (t.allocatedWell || '') : (effectiveDT.well || jobData.well || ''))}
                                clientDtNo={t.clientDtNo || ''}
                                disabled={(isClosedOrInvoiced || isLocked) && !adminUnlocked}
                                rigOptions={adnocRigOptions}
                                onRigChange={(i, newRig) => {
                                  const lines = (effectiveDT.toolLines || []).map((tl, j) => j === i ? { ...tl, allocatedRig: newRig } : tl);
                                  const batch = { ...effectiveDT, toolLines: lines };
                                  if (onUpdateDTBatch) onUpdateDTBatch(batch); else onSaveDTBatch(batch);
                                }}
                                onWellChange={(i, newWell) => {
                                  const lines = (effectiveDT.toolLines || []).map((tl, j) => j === i ? { ...tl, allocatedWell: newWell } : tl);
                                  const batch = { ...effectiveDT, toolLines: lines };
                                  if (onUpdateDTBatch) onUpdateDTBatch(batch); else onSaveDTBatch(batch);
                                }}
                                onClientDtChange={(i, newClientDt) => {
                                  const lines = (effectiveDT.toolLines || []).map((tl, j) => j === i ? { ...tl, clientDtNo: newClientDt } : tl);
                                  const batch = { ...effectiveDT, toolLines: lines };
                                  if (onUpdateDTBatch) onUpdateDTBatch(batch); else onSaveDTBatch(batch);
                                }}
                              />
                            )}
                            {activeDT && (!activeDT.isLocked || adminUnlocked) && (
                              <td className="py-1 px-2 whitespace-nowrap text-center border-l border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveToolLineFromDT(idx)}
                                  className="text-red-600 hover:text-red-800 font-bold text-xs hover:bg-red-50 p-1 rounded cursor-pointer transition"
                                  title={`Remove ${displayDtAssetNo} from this Delivery Ticket`}
                                >
                                  🗑️
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={isContract4700024096 ? (activeDT && (!activeDT.isLocked || adminUnlocked) ? 14 : 13) : (activeDT && (!activeDT.isLocked || adminUnlocked) ? 11 : 10)} className="p-6 text-center text-slate-500 font-medium bg-slate-50">
                          No tools added to Delivery Ticket yet.
                          {!isClosedOrInvoiced && !isLocked && (
                            <span>
                              {' '}Select tools in the <button type="button" onClick={() => setActiveTab('checklist')} className="text-blue-700 underline font-bold cursor-pointer">Checklist</button> tab and click &quot;Create DT from Selected ✓ Tools&quot;, or click <button type="button" onClick={handleCreateNewDTInJob} className="text-emerald-700 underline font-bold cursor-pointer">+ New DT</button> to add tools.
                            </span>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Logistics fields — memoized to prevent cascade re-renders on typing */}
              <DTFooterSection
                fields={{
                  dispatchedBy: getDTField(effectiveDT, 'dispatchedBy') || effectiveDT.dispatchedBy || '',
                  designation:  getDTField(effectiveDT, 'designation'),
                  deliveredTo:  getDTField(effectiveDT, 'deliveredTo'),
                  vesselBoat:   getDTField(effectiveDT, 'vesselBoat') || getDTField(effectiveDT, 'msvName'),
                  transport:    getDTField(effectiveDT, 'transport'),
                  vehicleNo:    getDTField(effectiveDT, 'vehicleNo') || getDTField(effectiveDT, 'vehicleVesselNo'),
                  driverName:   getDTField(effectiveDT, 'driverName'),
                  contactNo:    getDTField(effectiveDT, 'contactNo'),
                }}
                disabled={!canUserEditDT || (Boolean(effectiveDT.isLocked) && !adminUnlocked)}
                dispatchDate={toInputDateFormat(effectiveDT.dispatchDate) || new Date().toISOString().split('T')[0]}
                onFieldChange={(field, value) => handleUpdateDTField(field, value)}
              />

              {/* Delivery Ticket Notes & Non-Invoiced Manifest Items (same style as Job Header) */}
              <div className="bg-white border border-[#b8cce0] rounded-md p-3 space-y-2 shadow-2xs mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">📝</span>
                    <label className="text-xs font-bold text-[#1a3055]">
                      Delivery Ticket Notes &amp; Manifest Remarks (Slings, Protectors, Non-Invoiced Spares, Baskets)
                    </label>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Prints directly on Delivery Ticket Form DSF-001 under "Notes :"
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={dtNotesInput}
                  disabled={isClosedOrInvoiced || isLocked || (effectiveDT.isLocked && !adminUnlocked)}
                  onChange={(e) => setDtNotesInput(e.target.value)}
                  onBlur={() => {
                    if (!isClosedOrInvoiced && !isLocked && (!effectiveDT.isLocked || adminUnlocked)) {
                      handleSaveDTNotes(true);
                    }
                  }}
                  placeholder="Enter items with no invoicing value to print on the Delivery Ticket (e.g. 2 nos 3-meter lifting slings, 4 shackles, thread protectors, basket #EMD-04, spare O-rings)..."
                  className="w-full bg-[#fcfdff] border border-[#9fb6cf] rounded p-2.5 text-xs text-slate-800 leading-relaxed font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
                {!isClosedOrInvoiced && !isLocked && (!effectiveDT.isLocked || adminUnlocked) ? (
                  <div className="flex justify-end">
                    <span className="text-[10px] text-slate-500 italic">Saves automatically when you click away from this field.</span>
                  </div>
                ) : (effectiveDT.isLocked && !adminUnlocked) && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium italic">
                    <span>🔒</span>
                    <span>Ticket dispatched &amp; locked. Manifest notes are sealed.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: RETURN GOODS TICKET (RGT / RT) */}
        {activeTab === 'return-tickets' && (
          <div className="space-y-3">
            {/* RT Selector Strip */}
            <div className="bg-[#f0f5fb] border border-[#b8cce0] rounded p-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Select Return Ticket:</label>
                {jobRTs.length === 0 ? (
                  <span className="text-xs font-mono font-bold text-blue-900 bg-blue-50 border border-blue-200 rounded px-2.5 py-1">
                    {effectiveRT.rtNumber} (Draft Manifest)
                  </span>
                ) : (
                  <select
                    value={selectedRTNumber}
                    onChange={(e) => setSelectedRTNumber(e.target.value)}
                    className="bg-white border border-[#9fb6cf] rounded px-3 py-1 text-xs font-mono font-bold text-[#1a3055] shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500 min-w-[240px]"
                  >
                    {jobRTs.map((rt) => (
                      <option key={rt.rtNumber} value={rt.rtNumber}>
                        {rt.rtNumber} — {rt.toolLines?.length || 0} tool(s) ({resolveRtDate(rt)})
                      </option>
                    ))}
                  </select>
                )}
                {!isClosedOrInvoiced && !isLocked && (
                  <button
                    type="button"
                    onClick={handleCreateNewRTInJob}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-2.5 py-1 rounded shadow-2xs transition cursor-pointer flex items-center gap-1"
                    title="Generate a new Return Goods Ticket manifest for this job"
                  >
                    <span>+</span>
                    <span>New RT</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {jobRTs.length === 0 ? (
                  <span className="bg-amber-50 text-amber-900 border border-amber-300 font-bold text-xs px-2.5 py-1 rounded flex items-center gap-1 shadow-2xs">
                    <span>📝</span>
                    <span>Draft Preview (Not Confirmed)</span>
                  </span>
                ) : Boolean(activeRT?.isLocked) && !adminUnlocked ? (
                  <>
                    <span className="bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs px-3 py-1 rounded flex items-center gap-1 shadow-2xs">
                      <span>🔒</span>
                      <span>Received &amp; Locked</span>
                    </span>
                    {(!isClosedOrInvoiced || adminUnlocked) && (!isLocked || adminUnlocked) && (
                      <button
                        type="button"
                        onClick={handleUnlockRT}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-2.5 py-1 rounded shadow-2xs cursor-pointer flex items-center gap-1 transition"
                        title="Unlock this Receiving Ticket to correct returned tool lines or manifest details"
                      >
                        <span>🔓</span>
                        <span>Unlock RT</span>
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs px-2.5 py-1 rounded flex items-center gap-1 shadow-2xs">
                      <span>🔓</span>
                      <span>Draft / Unlocked</span>
                    </span>
                    {(!isClosedOrInvoiced || adminUnlocked) && (!isLocked || adminUnlocked) && (
                      <button
                        type="button"
                        onClick={handleConfirmAndLockRT}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3.5 py-1 rounded shadow-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <span>📥</span>
                        <span>{adminUnlocked ? 'Confirm Corrections & Lock RT' : 'Confirm Receipt & Lock RT'}</span>
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handlePrintReceivingTicket(effectiveRT)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-2.5 py-1 rounded border border-slate-300 cursor-pointer shadow-2xs"
                  title="Print Official Receiving Ticket (Form DSF-001)"
                >
                  Print Receiving Ticket
                </button>
              </div>
            </div>

            {/* Return Ticket Header Details */}
            <div className="bg-[#f0f5fb] border border-[#b8cce0] rounded p-3 text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="font-bold text-blue-900 text-sm">RETURN TICKET</h3>
                <span className="text-xs font-mono">
                  TicketNo: <strong className="text-red-600 font-bold text-base">{effectiveRT.rtNumber || '—'}</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
                <div>
                  <span className="font-bold text-slate-600 block mb-0.5">Customer:</span>
                  <span className="font-bold text-slate-900">{jobData.client}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600 block mb-0.5">Contract / Project:</span>
                  <span className="font-mono text-slate-800">{jobData.contractNo || cleanContractName(jobData.contract) || '—'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600 block mb-0.5">Rig / Well:</span>
                  <span className="font-mono font-bold text-blue-900">{jobData.rig} / {jobData.well}</span>
                </div>
                {/* RT header input fields — memoized to prevent cascade re-renders on typing */}
                <RTHeaderForm
                  isEditable={!(isClosedOrInvoiced || isLocked) && (!effectiveRT.isLocked || adminUnlocked)}
                  editDate={toInputDateFormat(effectiveRT.rtDate || effectiveRT.backloadRmDate || jobData.demobDate)}
                  editCarrier={effectiveRT.carrier || effectiveRT.shippedVia || ''}
                  editLoadingNoteDate={toInputDateFormat(effectiveRT.loadingNoteDate || effectiveRT.lNoteDate)}
                  editLoadingNoteNo={effectiveRT.loadingNoteNo || effectiveRT.lNoteNo || ''}
                  editReceivedBy={effectiveRT.receivedBy || ''}
                  displayDate={resolveRtDate(effectiveRT)}
                  displayCarrier={resolveRtCarrier(effectiveRT)}
                  displayLoadingNoteDate={resolveRtLoadingNoteDate(effectiveRT)}
                  displayLoadingNoteNo={resolveRtLoadingNoteNo(effectiveRT)}
                  displayReceivedBy={effectiveRT.receivedBy || '—'}
                  onFieldChange={handleUpdateRTHeaderField}
                />
              </div>
            </div>

            {/* Upper Table: Tools in active RT */}
            <div className="border border-[#b8cce0] rounded overflow-y-auto overflow-x-auto max-h-[calc(88vh-320px)] min-h-[220px]">
              <div className="bg-slate-100 px-3 py-1 border-b border-slate-200 font-bold text-xs text-slate-700 flex justify-between sticky top-0 z-20">
                <span>Received Tools in Return Ticket</span>
                <span className="text-emerald-700">Total Returned: {effectiveRT?.toolLines?.length || 0} tools</span>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px] sticky top-6 z-10 shadow-xs">
                  <tr>
                    <th className="p-1.5 text-center w-12">ItemNo</th>
                    <th className="p-1.5">Asset No</th>
                    <th className="p-1.5">Description</th>
                    <th className="p-1.5 text-center">RGT_No</th>
                    <th className="p-1.5">Date_In</th>
                    <th className="p-1.5">Comments (Condition)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {!effectiveRT || !effectiveRT.toolLines || effectiveRT.toolLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-500">
                        No returned tools added to this ticket yet.
                      </td>
                    </tr>
                  ) : (
                    effectiveRT.toolLines.map((t, idx) => {
                      const resolved = resolveToolDetails(t.serial, t.assetNo, t.desc, t.shortDesc, t.supplier || (t as any).ownership);
                      const displayRtAssetNo =
                        (t.assetNo && !t.assetNo.toUpperCase().startsWith('EMD-') && t.assetNo !== '—' ? t.assetNo : '') ||
                        (resolved.assetNo && !resolved.assetNo.toUpperCase().startsWith('EMD-') && resolved.assetNo !== '—' ? resolved.assetNo : '') ||
                        (t.serial && !t.serial.toUpperCase().startsWith('EMD-') && t.serial !== '—' ? t.serial : '') ||
                        (resolved.serial && !resolved.serial.toUpperCase().startsWith('EMD-') && resolved.serial !== '—' ? resolved.serial : '') ||
                        t.assetNo || resolved.assetNo || '—';
                      const displayRtDesc = t.desc || resolved.desc;
                      const matchedDTLine = jobDTs.flatMap((dt) => dt.toolLines || []).find(
                        (dtl: any) => dtl.serial && t.serial && String(dtl.serial).trim().toUpperCase() === String(t.serial).trim().toUpperCase()
                      );

                      const rawLineDate = getValidDateString(
                        (t as any).dateIn,
                        (t as any).Date_In,
                        (t as any).DateIn,
                        (t as any).date_in,
                        (t as any).returnDate,
                        (t as any).ReturnDate,
                        (t as any).rtDate,
                        (matchedDTLine as any)?.returnDate,
                        (matchedDTLine as any)?.dateIn,
                        (matchedDTLine as any)?.Date_In,
                        effectiveRT.rtDate,
                        effectiveRT.backloadRmDate,
                        (effectiveRT as any).Date_In,
                        (effectiveRT as any).dateIn,
                        jobData.demobDate,
                        jobData.lastRtDate
                      );

                      const displayDateIn = rawLineDate ? formatDateDD_MM_YYYY(rawLineDate) : '—';
                      const inputDateIn = toInputDateFormat(rawLineDate);

                      return (
                        <tr key={idx} className="hover:bg-blue-50/50 h-7 leading-none">
                          <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{idx + 1}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900" title={displayRtAssetNo}>{displayRtAssetNo}</td>
                          <td className="py-1 px-2 whitespace-nowrap truncate max-w-[340px] font-medium text-slate-800" title={displayRtDesc}>{displayRtDesc}</td>
                          <td className="py-1 px-2 whitespace-nowrap text-center font-mono font-bold text-blue-800">{effectiveRT.rtNumber}</td>
                          <td className="py-1 px-2 whitespace-nowrap">
                            {isClosedOrInvoiced || isLocked ? (
                              <span className="font-mono text-[11px] text-slate-700 font-medium">{displayDateIn}</span>
                            ) : (
                              <input
                                type="date"
                                value={inputDateIn}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  handleUpdateRTToolLine(idx, {
                                    dateIn: val ? formatDateDD_MM_YYYY(val) : '',
                                    Date_In: val ? formatDateDD_MM_YYYY(val) : '',
                                    returnDate: val ? formatDateDD_MM_YYYY(val) : '',
                                    rtDate: val ? formatDateDD_MM_YYYY(val) : '',
                                  });
                                }}
                                className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono text-slate-800 cursor-pointer focus:border-blue-500 focus:outline-none"
                              />
                            )}
                          </td>
                          <td className="py-1 px-2 whitespace-nowrap">
                            <select
                              value={t.condition || (t.used ? 'USED' : 'NOT USED')}
                              disabled={isClosedOrInvoiced || isLocked}
                              onChange={(e) => {
                                const newCond = e.target.value as 'USED' | 'NOT USED' | 'LIH';
                                const updatedToolLines = (activeRT.toolLines || []).map((line, lIdx) => {
                                  if (lIdx === idx) {
                                    return {
                                      ...line,
                                      condition: newCond,
                                      remarks: newCond,
                                      used: newCond === 'USED',
                                      status: newCond === 'LIH' ? 'Lost in Hole' : newCond === 'USED' ? 'Inspection' : 'Available',
                                      routedTo: newCond === 'LIH' ? 'Lost in Hole' : newCond === 'USED' ? 'Inspection Bay' : 'Available Inventory',
                                    };
                                  }
                                  return line;
                                });
                                const updatedRT: RTBatch = {
                                  ...activeRT,
                                  toolLines: updatedToolLines,
                                };
                                if (onUpdateRTBatch) {
                                  onUpdateRTBatch(updatedRT);
                                } else {
                                  onSaveRTBatch(updatedRT);
                                }
                                showToast(`Tool ${t.serial} condition updated to ${newCond} (${newCond === 'LIH' ? 'Lost in Hole' : newCond === 'USED' ? 'Routes to QC Inspection' : 'Returns to Available Inventory'}).`, 'info');
                              }}
                              className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-slate-800 cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
                            >
                              <option value="USED">USED</option>
                              <option value="NOT USED">NOT USED</option>
                              <option value="LIH">LIH</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Lower Section: Search DT No & Select Tools to Move to RT */}
            {unreturnedDTs.length === 0 || isClosedOrInvoiced ? (
              <div className="p-3 text-center text-slate-500 text-xs italic bg-slate-50 border border-slate-200 rounded">
                No equipment pending return for this job.
              </div>
            ) : (
              <div className="bg-[#fffbeb] border border-[#fde68a] rounded p-3 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-900">Search DT No for Backload:</span>
                    <select
                      value={rgtSearchDTNo}
                      onChange={(e) => setRgtSearchDTNo(e.target.value)}
                      className="bg-white border border-amber-300 rounded px-2.5 py-1 text-xs font-mono font-bold text-slate-800 cursor-pointer"
                    >
                      {unreturnedDTs.map((d) => (
                        <option key={d.dtNumber} value={d.dtNumber}>
                          {d.dtNumber} ({d.toolLines?.length || 0} tools dispatched)
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-amber-800">
                      &larr; Select DT with tools still on rig
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-amber-900 text-xs">Return Date (Date In):</span>
                      <input
                        type="date"
                        value={rgtMoveDateIn}
                        onChange={(e) => setRgtMoveDateIn(e.target.value)}
                        className="bg-white border border-amber-300 rounded px-2 py-0.5 text-xs font-mono font-bold text-slate-800 cursor-pointer shadow-2xs focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    {!isClosedOrInvoiced && !isLocked && (!effectiveRT.isLocked || adminUnlocked) && (
                      <button
                        type="button"
                        onClick={handleMoveToolsToRT}
                        disabled={rgtCheckedSerials.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs px-3.5 py-1 rounded shadow-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <span>⬇️</span>
                        <span>Enter / Move to RT Details ({rgtCheckedSerials.length})</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Lower DT Table: Tools from the selected DT */}
                <div className="border border-amber-200 rounded overflow-hidden bg-white">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-amber-100/70 text-amber-950 font-bold text-[11px]">
                      <tr>
                        <th className="p-1.5 text-center w-12">TicketNo</th>
                        <th className="p-1.5 text-center w-12">ItemNo</th>
                        <th className="p-1.5">Asset No</th>
                        <th className="p-1.5">Description</th>
                        <th className="p-1.5 text-center w-14">DTQTY</th>
                        <th className="p-1.5 text-center w-16">Ret_ [✓]</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {rgtDTToolsToReturn.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-500">
                            No unreturned tools available in selected DT.
                          </td>
                        </tr>
                      ) : (
                        rgtDTToolsToReturn.map((t, idx) => {
                          const resolved = resolveToolDetails(t.serial, t.assetNo, t.desc, t.shortDesc, t.supplier || (t as any).ownership);
                          const displayRgtAssetNo = getCleanAssetNo(t.assetNo, resolved.assetNo, t.serial, resolved.serial);
                          const displayRgtDesc = t.desc || resolved.desc;
                          const isChecked = rgtCheckedSerials.includes(t.serial);
                          return (
                            <tr key={idx} className={`h-7 leading-none ${isChecked ? 'bg-amber-100/80 font-semibold' : 'hover:bg-slate-50'}`}>
                              <td className="py-1 px-2 whitespace-nowrap text-center font-mono text-slate-600">{rgtSearchDTNo}</td>
                              <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{idx + 1}</td>
                              <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900" title={displayRgtAssetNo}>{displayRgtAssetNo}</td>
                              <td className="py-1 px-2 whitespace-nowrap truncate max-w-[340px] font-medium text-slate-800" title={displayRgtDesc}>{displayRgtDesc}</td>
                              <td className="py-1 px-2 whitespace-nowrap text-center font-bold">{t.qty || 1}</td>
                              <td className="py-1 px-2 whitespace-nowrap text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isClosedOrInvoiced || isLocked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setRgtCheckedSerials((prev) => [...prev, t.serial]);
                                    } else {
                                      setRgtCheckedSerials((prev) => prev.filter((s) => s !== t.serial));
                                    }
                                  }}
                                  className="cursor-pointer"
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Receiving Ticket Notes & Non-Invoiced Manifest Items (same style as Job Header) */}
                <div className="bg-white border border-[#b8cce0] rounded-md p-3 space-y-2 shadow-2xs mt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">📝</span>
                      <label className="text-xs font-bold text-[#1a3055]">
                        Receiving Ticket Notes &amp; Manifest Remarks (Slings, Protectors, Non-Invoiced Spares, Baskets)
                      </label>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Prints directly on Receiving Ticket Form DSF-001 under "Note :"
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={rtNotesInput}
                    disabled={isClosedOrInvoiced || isLocked || (Boolean(effectiveRT.isLocked) && !adminUnlocked)}
                    onChange={(e) => setRtNotesInput(e.target.value)}
                    onBlur={() => {
                      if (!isClosedOrInvoiced && !isLocked && (!effectiveRT.isLocked || adminUnlocked)) {
                        handleSaveRTNotes(true);
                      }
                    }}
                    placeholder="Enter items with no invoicing value received from rig to print on the Receiving Ticket (e.g. 2 nos 3-meter lifting slings, 4 shackles, thread protectors, basket #EMD-04, spare O-rings)..."
                    className="w-full bg-[#fcfdff] border border-[#9fb6cf] rounded p-2.5 text-xs text-slate-800 leading-relaxed font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  {!isClosedOrInvoiced && !isLocked && (!effectiveRT.isLocked || adminUnlocked) ? (
                    <div className="flex justify-end">
                      <span className="text-[10px] text-slate-500 italic">Saves automatically when you click away from this field.</span>
                    </div>
                  ) : (effectiveRT.isLocked && !adminUnlocked) && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium italic">
                      <span>🔒</span>
                      <span>Receiving ticket locked. Manifest notes are sealed.</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 7: UTILIZATION (FULLY DYNAMIC WITH MONTH/YEAR PICKER & ENGINEER UTILIZATION) */}
        {activeTab === 'utilization' && (
          <div className="space-y-3">
            {/* Top Job Utilization Context Bar */}
            <div className="bg-[#1a3055] text-white p-3 rounded text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <span className="text-slate-300">RIG / WELL:</span>{' '}
                <strong className="text-amber-400 font-mono font-bold">{jobData.rig} / {jobData.well}</strong>
              </div>
              <div>
                <span className="text-slate-300">CLIENT:</span>{' '}
                <strong className="text-white font-bold">{jobData.client}</strong>
              </div>
              <div>
                <span className="text-slate-300">CONTRACT:</span>{' '}
                <strong className="text-white font-mono">{jobData.contractNo || jobData.contract}</strong>
              </div>
              <div>
                <span className="text-slate-300">MONTHLY ACCRUAL:</span>{' '}
                <strong className="text-emerald-400 font-mono font-bold">
                  {totalToolRevenueAED.toLocaleString()} AED (${(totalToolRevenueAED / 3.6725 + totalCrewRevenueUSD).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD)
                </strong>
              </div>
            </div>

            {/* Month & Year Selection Bar (Dynamic first DT to last RT) */}
            <div className="bg-slate-100 border border-slate-300 rounded p-2.5 flex flex-wrap items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <label className="font-bold text-slate-700">Billing Period (DT to RT):</label>
                  <select
                    value={`${selectedUtilYear}-${selectedUtilMonth}`}
                    onChange={(e) => {
                      const [yStr, mStr] = e.target.value.split('-');
                      setSelectedUtilYear(parseInt(yStr, 10));
                      setSelectedUtilMonth(parseInt(mStr, 10));
                    }}
                    className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-800 cursor-pointer shadow-2xs"
                  >
                    {utilMonthOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <span className="text-slate-500 font-mono text-[11px]">
                  (Legend: <strong className="text-emerald-700 font-bold">1 = Ops</strong>, <strong className="text-blue-700 font-bold">S = Standby</strong>)
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-slate-600 text-xs">
                  Mobilized Tools in Month: <strong className="font-mono text-blue-900">{toolUtilizationRows.length}</strong>
                </span>

                {isLoadingUtilDb ? (
                  <span className="text-blue-600 text-[11px] font-medium flex items-center gap-1 animate-pulse">
                    <span>🔄</span> Loading live DB logs...
                  </span>
                ) : (
                  <span className="text-emerald-700 text-[11px] font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1">
                    <span>✓</span> Live Synced with Job File
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs px-3 py-1 rounded cursor-pointer transition shadow-2xs"
                >
                  Print Log
                </button>
              </div>
            </div>

            {/* 1. Field Engineer & Crew Utilization Section (First) */}
            <div>
              <div className="bg-[#1a3055] text-white px-3 py-1.5 rounded-t font-bold text-xs flex items-center justify-between">
                <span>Field Engineer &amp; Rig Crew Utilization &bull; {MONTH_NAMES[selectedUtilMonth - 1]} {selectedUtilYear}</span>
                <span className="text-amber-300 font-mono text-[11px]">
                  Total Manpower Charge: ${totalCrewRevenueUSD.toLocaleString()} USD
                </span>
              </div>
              <div className="border border-slate-300 rounded-b overflow-x-auto bg-white shadow-inner">
                <table className="w-full text-left text-[11px] border-collapse min-w-[1700px]">
                  <thead className="bg-[#e9f0f8] text-[#1a3055] font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-1.5 text-center w-9 min-w-[36px]">#</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[90px]">BADGE #</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[180px]">ENGINEER NAME</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[170px]">DESIGNATION / ROLE</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[95px]">MOB DATE</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[95px]">DEMOB DATE</th>
                      <th className="p-1.5 text-center whitespace-nowrap min-w-[90px]">DAILY RATE</th>
                      {utilDaysList.map((d) => (
                        <th key={d} className="p-0.5 text-center w-7 min-w-[28px] font-mono text-[11px] bg-slate-200/70 border-x border-slate-300">
                          {d}
                        </th>
                      ))}
                      <th className="p-1.5 text-center bg-blue-100 text-blue-950 font-bold whitespace-nowrap min-w-[70px]">SB DAYS</th>
                      <th className="p-1.5 text-center bg-emerald-100 text-emerald-950 font-bold whitespace-nowrap min-w-[70px]">OPS DAYS</th>
                      <th className="p-1.5 text-right bg-slate-100 text-slate-900 font-bold pr-2 whitespace-nowrap min-w-[110px]">TOTAL (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {engineerUtilizationRows.length === 0 ? (
                      <tr>
                        <td colSpan={utilDaysList.length + 10} className="p-6 text-center text-slate-500 font-medium">
                          No certified engineers assigned to Job {jobData.id}. Assign crew members in the &quot;Manpower / Crew&quot; tab.
                        </td>
                      </tr>
                    ) : (
                      engineerUtilizationRows.map((eng) => (
                        <tr key={eng.rowSeq} className="hover:bg-blue-50/50 h-7 leading-none">
                          <td className="p-1 text-center font-mono text-slate-500">{eng.rowSeq}</td>
                          <td className="p-1 font-mono text-slate-900 font-bold whitespace-nowrap">{eng.badgeNo}</td>
                          <td className="p-1 font-bold text-blue-900 whitespace-nowrap">{eng.name}</td>
                          <td className="p-1 text-slate-700 whitespace-nowrap">{eng.designation}</td>
                          <td className="p-1 font-mono whitespace-nowrap text-[10px]">{formatDateDD_MM_YYYY(eng.mobDate)}</td>
                          <td className="p-1 font-mono whitespace-nowrap text-[10px] text-slate-500">{eng.demobDate ? formatDateDD_MM_YYYY(eng.demobDate) : '—'}</td>
                          <td className="p-1 text-center font-mono font-bold whitespace-nowrap">${eng.dailyRateUSD}</td>
                          {utilDaysList.map((day) => {
                            const val = eng.dayStatuses[day];
                            return (
                              <td
                                key={day}
                                className={`p-0.5 text-center font-mono font-bold text-[10px] border-x border-slate-100 ${
                                  val === '1'
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : val === 'S'
                                    ? 'bg-blue-100 text-blue-900'
                                    : ''
                                }`}
                              >
                                {val}
                              </td>
                            );
                          })}
                          <td className="p-1 text-center font-bold text-blue-800 bg-blue-50/40">{eng.sbCount}</td>
                          <td className="p-1 text-center font-bold text-emerald-800 bg-emerald-50/40">{eng.opsCount}</td>
                          <td className="p-1 text-right font-mono font-bold pr-2 bg-slate-50/50">${eng.totalUSD.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {engineerUtilizationRows.length > 0 && (
                    <tfoot className="bg-[#e9f0f8] font-bold text-[#1a3055] border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={7} className="p-1.5 text-right uppercase">Crew Totals:</td>
                        {utilDaysList.map((day) => {
                          const activeCrew = engineerUtilizationRows.filter((e) => e.dayStatuses[day] !== '').length;
                          return (
                            <td key={day} className="p-0.5 text-center font-mono text-[10px] text-slate-700 border-x border-slate-300">
                              {activeCrew || ''}
                            </td>
                          );
                        })}
                        <td className="p-1.5 text-center font-mono text-blue-900">
                          {engineerUtilizationRows.reduce((acc, e) => acc + e.sbCount, 0)}
                        </td>
                        <td className="p-1.5 text-center font-mono text-emerald-900">
                          {engineerUtilizationRows.reduce((acc, e) => acc + e.opsCount, 0)}
                        </td>
                        <td className="p-1.5 text-right font-mono text-base text-slate-900 pr-2">
                          ${totalCrewRevenueUSD.toLocaleString()} USD
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* 2. Downhole Tool Fleet Utilization Matrix (Second) */}
            <div className="pt-2">
              <div className="bg-[#1a3055] text-white px-3 py-1.5 rounded-t font-bold text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span>Downhole Tool Fleet Utilization &bull; {MONTH_NAMES[selectedUtilMonth - 1]} {selectedUtilYear}</span>
                  {/* Utilization Boundary Toggle */}
                  <div className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded border border-white/20 text-[10px]">
                    <span className="text-slate-300">End Date Source:</span>
                    <button
                      type="button"
                      onClick={() => setUtilEndDateMode('BACKLOAD')}
                      className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                        utilEndDateMode === 'BACKLOAD'
                          ? 'bg-amber-400 text-slate-950 shadow-xs'
                          : 'text-slate-300 hover:text-white'
                      }`}
                      title="Tool utilization stops when backloaded from rig"
                    >
                      Rig Backload Date (RT)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUtilEndDateMode('YARD_RETURN')}
                      className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                        utilEndDateMode === 'YARD_RETURN'
                          ? 'bg-amber-400 text-slate-950 shadow-xs'
                          : 'text-slate-300 hover:text-white'
                      }`}
                      title="Tool utilization stops when physically returned to yard"
                    >
                      Yard Return Date
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400 font-mono text-[11px]">
                    Total Tool Revenue: {totalToolRevenueAED.toLocaleString()} AED
                  </span>
                  {totalSubcontractCostAED > 0 && (
                    <span className="text-orange-300 font-mono text-[11px] bg-orange-950/60 px-2 py-0.5 rounded border border-orange-700/60">
                      Total Sub-Rental Cost: {totalSubcontractCostAED.toLocaleString()} AED
                    </span>
                  )}
                </div>
              </div>
              <div className="border border-slate-300 rounded-b overflow-x-auto bg-white shadow-inner">
                <table className="w-full text-left text-[11px] border-collapse min-w-[3400px]">
                  <thead className="bg-[#e9f0f8] text-[#1a3055] font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-1.5 text-center w-9 min-w-[36px]">#</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[110px]">DT NO</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[95px]">DEL DATE</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[130px]">ASSET NO</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[220px]">DESCRIPTION</th>
                      <th className="p-1.5 text-center w-12 min-w-[48px]">QTY</th>
                      <th className="p-1.5 text-center whitespace-nowrap min-w-[80px]">STATUS</th>
                      <th className="p-1.5 text-center whitespace-nowrap min-w-[85px] bg-amber-100 text-amber-950 font-bold border-x border-slate-300">
                        CONTRACT REF
                      </th>
                      <th className="p-1.5 whitespace-nowrap min-w-[170px] max-w-[220px] bg-amber-100 text-amber-950 font-bold border-x border-slate-300">
                        HOLE SECTION
                      </th>
                      {utilDaysList.map((d) => (
                        <th key={d} className="p-0.5 text-center w-7 min-w-[28px] font-mono text-[11px] bg-slate-200/70 border-x border-slate-300">
                          {d}
                        </th>
                      ))}
                      <th className="p-1.5 text-center bg-blue-100 text-blue-950 font-bold whitespace-nowrap min-w-[75px]">TOTAL SB</th>
                      <th className="p-1.5 text-center bg-emerald-100 text-emerald-950 font-bold whitespace-nowrap min-w-[75px]">TOTAL OPS</th>
                      <th className="p-1.5 text-right bg-slate-100 text-slate-900 font-bold whitespace-nowrap min-w-[90px]">SB RATE</th>
                      <th className="p-1.5 text-right bg-slate-100 text-slate-900 font-bold whitespace-nowrap min-w-[90px]">OPS RATE</th>
                      <th className="p-1.5 text-right bg-blue-50 text-blue-950 font-bold whitespace-nowrap min-w-[120px]">TOTAL STDBY RATE</th>
                      <th className="p-1.5 text-right bg-emerald-50 text-emerald-950 font-bold whitespace-nowrap min-w-[120px]">TOTAL OPS RATE</th>
                      <th className="p-1.5 text-right bg-slate-100 text-slate-900 font-bold whitespace-nowrap min-w-[100px]">RUN CHARGE</th>
                      <th className="p-1.5 text-right bg-slate-100 text-slate-900 font-bold whitespace-nowrap min-w-[105px]">REDRESS CHARGE</th>
                      <th className="p-1.5 text-right bg-amber-100 text-amber-950 font-bold pr-3 whitespace-nowrap min-w-[160px] border-r-2 border-slate-400">
                        TOTAL VALUE FOR MONTH
                      </th>
                      {/* Sub-Contractor / Supplier Cost Columns */}
                      <th className="p-1.5 text-left bg-orange-100 text-orange-950 font-bold whitespace-nowrap min-w-[120px]">
                        SUPPLIER
                      </th>
                      <th className="p-1.5 text-center bg-orange-100 text-orange-950 font-bold whitespace-nowrap min-w-[85px]">
                        SUB SB DAYS
                      </th>
                      <th className="p-1.5 text-center bg-orange-100 text-orange-950 font-bold whitespace-nowrap min-w-[85px]">
                        SUB OPS DAYS
                      </th>
                      <th className="p-1.5 text-right bg-orange-50 text-orange-950 font-bold whitespace-nowrap min-w-[105px]">
                        SUB SB RATE
                      </th>
                      <th className="p-1.5 text-right bg-orange-50 text-orange-950 font-bold whitespace-nowrap min-w-[105px]">
                        SUB OPS RATE
                      </th>
                      <th className="p-1.5 text-right bg-orange-50 text-orange-950 font-bold whitespace-nowrap min-w-[100px]">
                        SUB RUN CHG
                      </th>
                      <th className="p-1.5 text-right bg-orange-50 text-orange-950 font-bold whitespace-nowrap min-w-[105px]">
                        SUB REDRESS
                      </th>
                      <th className="p-1.5 text-right bg-orange-200 text-orange-950 font-bold pr-3 whitespace-nowrap min-w-[150px]">
                        TOTAL SUB COST
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {toolUtilizationRows.length === 0 ? (
                      <tr>
                        <td colSpan={utilDaysList.length + 26} className="p-8 text-center text-slate-500 font-medium">
                          No mobilized tools found for Job {jobData.id} in {MONTH_NAMES[selectedUtilMonth - 1]} {selectedUtilYear}.
                        </td>
                      </tr>
                    ) : (
                      toolUtilizationRows.map((row) => {
                        const isDrilling = isAdnocDrillingRentalContract(activeContract, jobData.client);

                        return (
                          <tr key={row.rowSeq} className="hover:bg-blue-50/50 h-7 leading-none">
                            <td className="p-1 text-center font-mono text-slate-500">{row.rowSeq}</td>
                            <td className="p-1 font-mono text-blue-700 font-bold whitespace-nowrap">{row.dtNumber}</td>
                            <td className="p-1 font-mono whitespace-nowrap text-[10px]">{formatDateDD_MM_YYYY(row.dispatchDate)}</td>
                            <td className="p-1 font-mono font-bold whitespace-nowrap">{row.assetNo || row.serial}</td>
                            <td className="p-1 truncate max-w-[220px]" title={row.desc || row.shortDesc}>{row.desc || row.shortDesc}</td>
                            <td className="p-1 text-center font-bold">{row.qty || 1}</td>
                            <td className="p-1 text-center whitespace-nowrap">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                                {row.status || 'On Rig'}
                              </span>
                            </td>
                            {/* 8. Contract Reference Number Column */}
                            <td className="p-1 text-center font-mono font-bold text-blue-900 border-x border-slate-200 bg-white text-[11px] whitespace-nowrap">
                              {row.chosenOption?.contractRef && row.chosenOption.contractRef !== '—'
                                ? row.chosenOption.contractRef
                                : row.contractRef || '—'}
                            </td>
                            {/* 9. Hole Section Column (Dropdown for ADNOC Drilling 4700024096, text for others) */}
                            <td className="p-1 min-w-[170px] max-w-[220px] bg-amber-50/40 border-x border-slate-200">
                              {isDrilling && row.rateOptions && row.rateOptions.length > 0 ? (
                                <select
                                  value={row.chosenOption?.key || row.rateOptions[0]?.key || ''}
                                  disabled={isLocked}
                                  onChange={(e) => handleSelectToolHoleSection(row.toolKey, row, e.target.value)}
                                  className="w-full text-[10px] font-medium bg-white border border-amber-300 rounded px-1.5 py-0.5 text-[#1a3055] focus:ring-1 focus:ring-amber-500 outline-none cursor-pointer disabled:bg-slate-100"
                                  title="Select exact hole section for this tool"
                                >
                                  {row.rateOptions.map((opt: ToolHoleSectionOption) => (
                                    <option key={opt.key} value={opt.key}>
                                      {opt.holeSection}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="font-medium text-slate-800 text-[11px] truncate block px-1" title={row.chosenOption?.holeSection || row.size || 'Standard'}>
                                  {row.chosenOption?.holeSection || row.size || 'Standard'}
                                </span>
                              )}
                            </td>
                            {utilDaysList.map((day) => {
                              const val = row.dayStatuses[day];
                              return (
                                <td
                                  key={day}
                                  onClick={() => handleToggleDayStatus(row.toolKey, day)}
                                  title={`Day ${day}: ${val === '1' ? '1 (Active Operations / Drilling)' : val === 'S' ? 'S (Standby on Rig)' : 'Off Rig'}. Click to toggle.`}
                                  className={`p-0.5 text-center font-mono font-bold text-[10px] border-x border-slate-100 transition select-none ${
                                    !isLocked ? 'cursor-pointer hover:ring-1 hover:ring-blue-400' : ''
                                  } ${
                                    val === '1'
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : val === 'S'
                                      ? 'bg-blue-100 text-blue-900'
                                      : ''
                                  }`}
                                >
                                  {val}
                                </td>
                              );
                            })}
                            <td className="p-1 text-center font-bold text-blue-800 bg-blue-50/40">{row.sbCount}</td>
                            <td className="p-1 text-center font-bold text-emerald-800 bg-emerald-50/40">{row.opsCount}</td>
                            <td className="p-1 text-right font-mono text-slate-700">{row.standbyRate.toLocaleString()}</td>
                            <td className="p-1 text-right font-mono text-slate-700">{row.opsRate.toLocaleString()}</td>
                            <td className="p-1 text-right font-mono font-bold text-blue-900 bg-blue-50/30">{row.totalStandbyRate.toLocaleString()}</td>
                            <td className="p-1 text-right font-mono font-bold text-emerald-900 bg-emerald-50/30">{row.totalOpsRate.toLocaleString()}</td>
                            <td className="p-1 text-right font-mono text-slate-600">{row.runCharge.toLocaleString()}</td>
                            <td className="p-1 text-right font-mono text-slate-600">{row.redressCharge.toLocaleString()}</td>
                            <td className="p-1 text-right font-mono font-bold pr-2 text-slate-900 bg-amber-50/50 border-r-2 border-slate-300">
                              {row.totalMonthValue.toLocaleString()} {row.currency || 'AED'}
                            </td>

                            {/* Subcontractor / Supplier Cost Columns */}
                            <td className="p-1 whitespace-nowrap font-medium text-slate-800 bg-orange-50/30">
                              {row.isSubTool ? (
                                <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-orange-100 text-orange-900 border border-orange-200">
                                  {row.supplierName}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-sans text-[10px]">EMDAD (Owned)</span>
                              )}
                            </td>

                            <td className="p-1 text-center bg-orange-50/20">
                              {row.isSubTool ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={31}
                                  disabled={isLocked}
                                  value={row.subSbDays ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                    handleUpdateSubRentalCost(row.toolKey, { subSbDays: val });
                                  }}
                                  className="w-12 text-center font-mono font-bold text-[11px] bg-white border border-orange-300 rounded px-1 py-0.5 text-orange-950 focus:ring-1 focus:ring-orange-500 outline-none"
                                />
                              ) : (
                                <span className="text-slate-300 font-mono text-[10px]">—</span>
                              )}
                            </td>

                            <td className="p-1 text-center bg-orange-50/20">
                              {row.isSubTool ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={31}
                                  disabled={isLocked}
                                  value={row.subOpsDays ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                    handleUpdateSubRentalCost(row.toolKey, { subOpsDays: val });
                                  }}
                                  className="w-12 text-center font-mono font-bold text-[11px] bg-white border border-orange-300 rounded px-1 py-0.5 text-orange-950 focus:ring-1 focus:ring-orange-500 outline-none"
                                />
                              ) : (
                                <span className="text-slate-300 font-mono text-[10px]">—</span>
                              )}
                            </td>

                            <td className="p-1 text-right bg-orange-50/10">
                              {row.isSubTool ? (
                                <input
                                  type="number"
                                  step="any"
                                  min={0}
                                  disabled={isLocked}
                                  value={row.subSbRate ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                    handleUpdateSubRentalCost(row.toolKey, { subSbRate: val });
                                  }}
                                  className="w-16 text-right font-mono text-[11px] bg-white border border-orange-200 rounded px-1 py-0.5 text-slate-800 focus:ring-1 focus:ring-orange-500 outline-none"
                                />
                              ) : (
                                <span className="text-slate-300 font-mono text-[10px]">—</span>
                              )}
                            </td>

                            <td className="p-1 text-right bg-orange-50/10">
                              {row.isSubTool ? (
                                <input
                                  type="number"
                                  step="any"
                                  min={0}
                                  disabled={isLocked}
                                  value={row.subOpsRate ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                    handleUpdateSubRentalCost(row.toolKey, { subOpsRate: val });
                                  }}
                                  className="w-16 text-right font-mono text-[11px] bg-white border border-orange-200 rounded px-1 py-0.5 text-slate-800 focus:ring-1 focus:ring-orange-500 outline-none"
                                />
                              ) : (
                                <span className="text-slate-300 font-mono text-[10px]">—</span>
                              )}
                            </td>

                            <td className="p-1 text-right bg-orange-50/10">
                              {row.isSubTool ? (
                                <input
                                  type="number"
                                  step="any"
                                  min={0}
                                  disabled={isLocked}
                                  value={row.subRunCharge || ''}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                    handleUpdateSubRentalCost(row.toolKey, { subRunCharge: val });
                                  }}
                                  className="w-14 text-right font-mono text-[10px] bg-white border border-orange-200 rounded px-1 py-0.5 text-slate-700 focus:ring-1 focus:ring-orange-500 outline-none"
                                />
                              ) : (
                                <span className="text-slate-300 font-mono text-[10px]">—</span>
                              )}
                            </td>

                            <td className="p-1 text-right bg-orange-50/10">
                              {row.isSubTool ? (
                                <input
                                  type="number"
                                  step="any"
                                  min={0}
                                  disabled={isLocked}
                                  value={row.subRedressCharge || ''}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                    handleUpdateSubRentalCost(row.toolKey, { subRedressCharge: val });
                                  }}
                                  className="w-14 text-right font-mono text-[10px] bg-white border border-orange-200 rounded px-1 py-0.5 text-slate-700 focus:ring-1 focus:ring-orange-500 outline-none"
                                />
                              ) : (
                                <span className="text-slate-300 font-mono text-[10px]">—</span>
                              )}
                            </td>

                            <td className="p-1 text-right font-mono font-bold pr-2 bg-orange-100/60 text-orange-950">
                              {row.isSubTool ? (
                                <span>{row.totalSubCost.toLocaleString()} {row.currency || 'AED'}</span>
                              ) : (
                                <span className="text-slate-400 font-sans text-[10px] font-normal">— (Owned Fleet)</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {toolUtilizationRows.length > 0 && (
                    <tfoot className="bg-[#e9f0f8] font-bold text-[#1a3055] border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={9} className="p-1.5 text-right uppercase">Fleet Totals:</td>
                        {utilDaysList.map((day) => {
                          const dayActiveCount = toolUtilizationRows.filter((r) => r.dayStatuses[day] !== '').length;
                          return (
                            <td key={day} className="p-0.5 text-center font-mono text-[10px] text-slate-700 border-x border-slate-300">
                              {dayActiveCount || ''}
                            </td>
                          );
                        })}
                        <td className="p-1.5 text-center font-mono text-blue-900">{monthTotalSB}</td>
                        <td className="p-1.5 text-center font-mono text-emerald-900">{monthTotalOps}</td>
                        <td className="p-1.5 text-right font-mono text-slate-500">—</td>
                        <td className="p-1.5 text-right font-mono text-slate-500">—</td>
                        <td className="p-1.5 text-right font-mono text-blue-900">{monthTotalSBRate.toLocaleString()}</td>
                        <td className="p-1.5 text-right font-mono text-emerald-900">{monthTotalOpsRate.toLocaleString()}</td>
                        <td className="p-1.5 text-right font-mono text-slate-700">{monthTotalRunCharge.toLocaleString()}</td>
                        <td className="p-1.5 text-right font-mono text-slate-700">{monthTotalRedress.toLocaleString()}</td>
                        <td className="p-1.5 text-right font-mono text-base text-slate-900 pr-2 border-r-2 border-slate-400">
                          {totalToolRevenueAED.toLocaleString()} {activeContract?.currency || jobData.currency || 'AED'}
                        </td>
                        {/* Subcontractor Footers */}
                        <td className="p-1.5 text-left text-orange-900 text-[10px] font-bold">Sub-Rental Cost:</td>
                        <td className="p-1.5 text-center font-mono text-orange-950">
                          {toolUtilizationRows.reduce((a, r) => a + (r.subSbDays || 0), 0)}
                        </td>
                        <td className="p-1.5 text-center font-mono text-orange-950">
                          {toolUtilizationRows.reduce((a, r) => a + (r.subOpsDays || 0), 0)}
                        </td>
                        <td className="p-1.5 text-right font-mono text-slate-400">—</td>
                        <td className="p-1.5 text-right font-mono text-slate-400">—</td>
                        <td className="p-1.5 text-right font-mono text-slate-600">
                          {toolUtilizationRows.reduce((a, r) => a + (r.subRunCharge || 0), 0).toLocaleString()}
                        </td>
                        <td className="p-1.5 text-right font-mono text-slate-600">
                          {toolUtilizationRows.reduce((a, r) => a + (r.subRedressCharge || 0), 0).toLocaleString()}
                        </td>
                        <td className="p-1.5 text-right font-mono text-base text-orange-950 bg-orange-200/80 pr-2">
                          {totalSubcontractCostAED.toLocaleString()} {activeContract?.currency || jobData.currency || 'AED'}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* 3. FINAL FOOTER: TOTAL JOB VALUE (All Months & Life of Job) */}
            <div className="bg-[#1a3055] text-white p-3 rounded flex flex-wrap items-center justify-between text-xs font-bold shadow-md gap-3">
              <div className="flex items-center gap-2">
                <span className="text-base">📊</span>
                <span className="uppercase tracking-wide text-sm">TOTAL JOB VALUE (All Months &amp; Life of Job):</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-slate-300 font-normal">Active Window: {utilMonthOptions[0]?.label} &rarr; {utilMonthOptions[utilMonthOptions.length - 1]?.label}</span>
                <span className="text-amber-300 font-mono text-base font-extrabold">
                  {sqlJobValue > 0 ? `${sqlJobValue.toLocaleString()} ${jobData.currency || 'USD'}` : `${totalToolRevenueAED.toLocaleString()} AED`}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PERSONNELSELECT MODAL */}
      {isPersonnelSelectOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div
            className="bg-[#dce6f1] border-2 border-[#1a3055] rounded-md shadow-2xl w-full max-w-4xl h-[620px] max-h-[92vh] flex flex-col overflow-hidden"
            style={{ fontFamily: "'Calibri', 'Arial Nova', 'Segoe UI', Arial, sans-serif", fontSize: '9pt' }}
          >
            <div className="bg-[#1a3055] text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold flex-shrink-0">
              <div className="flex items-center gap-2">
                <span>personnelselect &bull; Field Crew Assignment Picker</span>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCrewId(null);
                      setCrewFormData({
                        badgeNo: `EMD-${Math.floor(1000 + Math.random() * 9000)}`,
                        name: '',
                        role: selectedPersonnelRole === 'All Roles' ? 'Lead Fishing & Whipstock Specialist' : selectedPersonnelRole,
                        phone: '',
                        email: '',
                        rigPassNo: `ADNOC-RP-${Math.floor(10000 + Math.random() * 90000)}`,
                        h2sExpiry: '2027-12-31',
                        bosietExpiry: '2028-06-30',
                        medicalExpiry: '2027-06-30',
                        status: 'Active',
                        dayRateAED: 3500,
                      });
                      setIsCrewFormModalOpen(true);
                    }}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    + Add Personnel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsPersonnelSelectOpen(false)}
                  className="text-white hover:text-amber-300 font-bold text-base cursor-pointer px-1"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="p-3 flex-1 flex flex-col min-h-0 space-y-2.5">
              <div className="bg-white border border-[#9fb6cf] rounded p-2 flex flex-wrap items-center justify-between gap-3 shadow-2xs flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <label className="font-extrabold text-slate-800 uppercase tracking-tight text-[11px]">ROLE / DESIGNATION :</label>
                  <select
                    value={selectedPersonnelRole}
                    onChange={(e) => setSelectedPersonnelRole(e.target.value)}
                    className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-800 w-64 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                  >
                    {availablePersonnelRoles.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div className="text-[11px] text-slate-600 font-medium">
                  Available in Role: <strong className="text-slate-900">{filteredPersonnelRoster.length}</strong>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded px-2.5 py-1 text-[11px] text-blue-900 leading-tight flex-shrink-0">
                Based on role selection, available certified engineers and supervisors show below. Select with checkbox and click <strong>&quot;Insert Selected Personnel&quot;</strong> to mobilize personnel to Rig {jobData.rig} for Job {jobData.id}.
              </div>

              {/* Personnel Table */}
              <div className="flex-1 min-h-0 bg-white border border-[#9fb6cf] rounded overflow-y-auto shadow-inner">
                <table className="w-full text-left border-collapse text-[11.5px]">
                  <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#9fb6cf] font-bold text-[11px] sticky top-0 z-10 shadow-2xs">
                    <tr>
                      <th className="py-1 px-2 whitespace-nowrap">Badge #</th>
                      <th className="py-1 px-2 whitespace-nowrap">Engineer Name</th>
                      <th className="py-1 px-2 whitespace-nowrap">Designation</th>
                      <th className="py-1 px-2 whitespace-nowrap">Rig Pass #</th>
                      <th className="py-1 px-2 whitespace-nowrap font-mono">H2S Expiry</th>
                      <th className="py-1 px-2 whitespace-nowrap text-center">Status</th>
                      <th className="py-1 px-2 whitespace-nowrap text-center w-14">select [✓]</th>
                      {isAdmin && <th className="py-1 px-2 whitespace-nowrap text-center w-16">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredPersonnelRoster.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 8 : 7} className="p-8 text-center text-slate-500 font-medium">
                          No personnel found for role: <strong>{selectedPersonnelRole}</strong>.
                        </td>
                      </tr>
                    ) : (
                      filteredPersonnelRoster.map((p) => {
                        const isChecked = checkedPersonnelBadges.includes(p.badgeNo);
                        return (
                          <tr
                            key={p.badgeNo}
                            onClick={() => {
                              if (isChecked) {
                                setCheckedPersonnelBadges((prev) => prev.filter((b) => b !== p.badgeNo));
                              } else {
                                setCheckedPersonnelBadges((prev) => [...prev, p.badgeNo]);
                              }
                            }}
                            className={`cursor-pointer transition h-7 leading-none ${
                              isChecked ? 'bg-amber-100/80 font-semibold' : 'hover:bg-blue-50/60'
                            }`}
                          >
                            <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{p.badgeNo}</td>
                            <td className="py-1 px-2 whitespace-nowrap truncate max-w-[200px] font-bold text-blue-900" title={p.name}>{p.name}</td>
                            <td className="py-1 px-2 whitespace-nowrap truncate max-w-[240px] text-slate-700" title={p.role}>{p.role}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-blue-700">{p.rigPassNo || '—'}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">{p.h2sExpiry ? formatDateDD_MM_YYYY(p.h2sExpiry) : '—'}</td>
                            <td className="py-1 px-2 whitespace-nowrap text-center">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                {p.status}
                              </span>
                            </td>
                            <td className="py-1 px-2 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setCheckedPersonnelBadges((prev) => [...prev, p.badgeNo]);
                                  } else {
                                    setCheckedPersonnelBadges((prev) => prev.filter((b) => b !== p.badgeNo));
                                  }
                                }}
                                className="cursor-pointer"
                              />
                            </td>
                            {isAdmin && (
                              <td className="py-1 px-2 whitespace-nowrap text-center space-x-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCrewId(p.id);
                                    setCrewFormData({
                                      badgeNo: p.badgeNo,
                                      name: p.name,
                                      role: p.role,
                                      phone: p.phone || '',
                                      email: p.email || '',
                                      rigPassNo: p.rigPassNo || '',
                                      h2sExpiry: p.h2sExpiry || '',
                                      bosietExpiry: p.bosietExpiry || '',
                                      medicalExpiry: p.medicalExpiry || '',
                                      status: p.status || 'Active',
                                      dayRateAED: p.dayRateAED || 3500,
                                    });
                                    setIsCrewFormModalOpen(true);
                                  }}
                                  className="px-1.5 py-0.5 text-xs text-blue-700 hover:bg-blue-100 rounded cursor-pointer"
                                  title="Edit details"
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Delete ${p.name} (${p.badgeNo})?`)) {
                                      deleteCrewPersonnel(p.id);
                                      setMasterCrew(loadCrewPersonnel());
                                      showToast(`Removed ${p.name}`, 'info');
                                    }
                                  }}
                                  className="px-1.5 py-0.5 text-xs text-rose-700 hover:bg-rose-100 rounded cursor-pointer"
                                  title="Delete personnel"
                                >
                                  🗑️
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-1 flex-shrink-0">
                <span className="text-slate-600 text-[11px]">
                  Total certified personnel: <strong>{filteredPersonnelRoster.length}</strong> | Selected: <strong className="text-blue-900">{checkedPersonnelBadges.length}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPersonnelSelectOpen(false)}
                    className="px-3.5 py-1 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertSelectedPersonnel}
                    disabled={checkedPersonnelBadges.length === 0}
                    className="px-5 py-1 rounded bg-[#107c41] hover:bg-[#0c6233] disabled:opacity-50 text-white font-bold shadow-xs cursor-pointer text-xs flex items-center gap-1.5"
                  >
                    <span>Insert Selected Personnel ({checkedPersonnelBadges.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT MASTER CREW PERSONNEL MODAL (ADMIN ONLY) */}
      {isCrewFormModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div
            className="bg-[#dce6f1] border-2 border-[#1a3055] rounded-md shadow-2xl w-full max-w-xl flex flex-col overflow-hidden"
            style={{ fontFamily: "'Calibri', 'Arial Nova', 'Segoe UI', Arial, sans-serif", fontSize: '9pt' }}
          >
            <div className="bg-[#1a3055] text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold flex-shrink-0">
              <div className="flex items-center gap-2">
                <span>personnelmaster &bull; {editingCrewId ? 'Edit Certified Personnel' : 'Add New Certified Personnel'} (Admin)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCrewFormModalOpen(false)}
                className="text-white hover:text-amber-300 font-bold text-base cursor-pointer px-1"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveMasterCrewMember} className="p-3 space-y-3 bg-white text-slate-800">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Badge Number *</label>
                  <input
                    type="text"
                    required
                    value={crewFormData.badgeNo}
                    onChange={(e) => setCrewFormData({ ...crewFormData, badgeNo: e.target.value.toUpperCase() })}
                    placeholder="e.g. EMD-4102"
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold text-slate-900 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={crewFormData.name}
                    onChange={(e) => setCrewFormData({ ...crewFormData, name: e.target.value })}
                    placeholder="e.g. Ahmed Al-Mansoor"
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-bold text-slate-900 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Role / Designation *</label>
                  <input
                    type="text"
                    required
                    list="crew-roles-list"
                    value={crewFormData.role}
                    onChange={(e) => setCrewFormData({ ...crewFormData, role: e.target.value })}
                    placeholder="Select or enter role"
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-medium text-slate-900 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                  <datalist id="crew-roles-list">
                    <option value="Lead Fishing & Whipstock Specialist" />
                    <option value="Senior Downhole Tool Engineer" />
                    <option value="Whipstock Operations Specialist" />
                    <option value="Senior Fishing Operations Supervisor" />
                    <option value="Field Service Engineer (Casing Exit & Mills)" />
                    <option value="Downhole Rentals Field Engineer" />
                    <option value="Fishing & Redress Tech Specialist" />
                  </datalist>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">ADNOC Rig Pass #</label>
                  <input
                    type="text"
                    value={crewFormData.rigPassNo}
                    onChange={(e) => setCrewFormData({ ...crewFormData, rigPassNo: e.target.value.toUpperCase() })}
                    placeholder="e.g. ADNOC-RP-88412"
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">H2S Expiry</label>
                  <input
                    type="date"
                    value={crewFormData.h2sExpiry}
                    onChange={(e) => setCrewFormData({ ...crewFormData, h2sExpiry: e.target.value })}
                    className="w-full border border-slate-300 rounded px-2 py-1 text-slate-900 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">BOSIET Expiry</label>
                  <input
                    type="date"
                    value={crewFormData.bosietExpiry}
                    onChange={(e) => setCrewFormData({ ...crewFormData, bosietExpiry: e.target.value })}
                    className="w-full border border-slate-300 rounded px-2 py-1 text-slate-900 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Medical Expiry</label>
                  <input
                    type="date"
                    value={crewFormData.medicalExpiry}
                    onChange={(e) => setCrewFormData({ ...crewFormData, medicalExpiry: e.target.value })}
                    className="w-full border border-slate-300 rounded px-2 py-1 text-slate-900 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={crewFormData.phone}
                    onChange={(e) => setCrewFormData({ ...crewFormData, phone: e.target.value })}
                    placeholder="+971 50 xxx xxxx"
                    className="w-full border border-slate-300 rounded px-2.5 py-1 text-slate-900 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={crewFormData.status}
                    onChange={(e) => setCrewFormData({ ...crewFormData, status: e.target.value as any })}
                    className="w-full border border-slate-300 rounded px-2.5 py-1 text-slate-900 bg-slate-50 font-bold"
                  >
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Off Duty">Off Duty</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Day Rate (AED)</label>
                  <input
                    type="number"
                    value={crewFormData.dayRateAED}
                    onChange={(e) => setCrewFormData({ ...crewFormData, dayRateAED: Number(e.target.value) || 0 })}
                    className="w-full border border-slate-300 rounded px-2.5 py-1 font-mono font-bold text-slate-900 bg-slate-50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCrewFormModalOpen(false)}
                  className="px-4 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 rounded bg-[#107c41] hover:bg-[#0c6233] text-white font-bold shadow-xs cursor-pointer text-xs"
                >
                  💾 {editingCrewId ? 'Update Personnel' : 'Save Personnel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ITEMSSELECT TOOL PICKER MODAL */}
      {isToolSelectOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div
            className={`bg-[#dce6f1] border-2 border-[#1a3055] rounded-md shadow-2xl flex flex-col overflow-hidden transition-all duration-150 ${
              isToolModalMaximized
                ? 'w-[98vw] h-[96vh] max-w-none max-h-none'
                : 'w-[96vw] max-w-[1450px] h-[820px] max-h-[95vh]'
            }`}
            style={{ fontFamily: "'Calibri', 'Arial Nova', 'Segoe UI', Arial, sans-serif", fontSize: '9pt' }}
          >
            <div className="bg-[#1a3055] text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold flex-shrink-0">
              <div className="flex items-center gap-2">
                <span>itemsselect &bull; Tool Assignment Picker</span>
              </div>
              <div className="flex items-center gap-2">
                {onRefresh && (
                  <button
                    type="button"
                    onClick={() => {
                      onRefresh();
                      showToast('Refreshing inventory from Azure SQL...', 'info');
                    }}
                    className="text-xs text-white/90 hover:text-white bg-blue-700/80 hover:bg-blue-600 px-2.5 py-0.5 rounded cursor-pointer transition flex items-center gap-1 font-semibold"
                    title="Refresh inventory from Azure SQL immediately to pick up newly added tools"
                  >
                    <span>🔄</span>
                    <span>Sync Live Tools</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsToolModalMaximized(!isToolModalMaximized)}
                  className="text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded cursor-pointer transition font-mono"
                  title={isToolModalMaximized ? 'Restore window size' : 'Maximize window size'}
                >
                  {isToolModalMaximized ? '❐ Restore' : '⛶ Maximize'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsToolSelectOpen(false);
                    setCheckedToolSerials([]);
                    setCheckedToolDisplayMap({});
                    setToolSearchQuery('');
                  }}
                  className="text-white hover:text-amber-300 font-bold text-base cursor-pointer px-1"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="p-3 flex-1 flex flex-col min-h-0 space-y-2.5">
              {/* Category Combobox (Type-to-Search) & Tool Size Filter */}
              <div className="bg-white border border-[#9fb6cf] rounded p-2 flex flex-wrap items-center justify-between gap-3 shadow-2xs flex-shrink-0 relative">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Category Type-To-Search Combobox */}
                  <div className="flex items-center gap-1.5 relative">
                    <label className="font-extrabold text-slate-800 uppercase tracking-tight text-[11px]">CATEGORY :</label>
                    <div className="relative">
                      <div className="flex items-center">
                        <input
                          type="text"
                          value={categorySearchQuery}
                          onChange={(e) => {
                            setCategorySearchQuery(e.target.value);
                            setIsCategoryDropdownOpen(true);
                          }}
                          onFocus={() => setIsCategoryDropdownOpen(true)}
                          placeholder="Search or select category (All Categories)..."
                          className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-800 w-64 sm:w-80 shadow-2xs cursor-text focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                        {(categorySearchQuery || selectedCategory) && (
                          <button
                            type="button"
                            onClick={() => {
                              setCategorySearchQuery('');
                              setSelectedCategory('');
                              setSelectedToolSize('');
                              setIsCategoryDropdownOpen(true);
                            }}
                            className="absolute right-2 text-slate-400 hover:text-slate-700 text-xs cursor-pointer font-bold"
                            title="Clear to view All Categories"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Dropdown Options */}
                      {isCategoryDropdownOpen && (
                        <div className="absolute left-0 top-full mt-1 w-80 max-h-64 overflow-y-auto bg-white border-2 border-[#1a3055] rounded shadow-2xl z-50 text-xs divide-y divide-slate-100">
                          <div className="bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 flex justify-between items-center sticky top-0 border-b border-slate-200">
                            <span>Select Category ({filteredCategories.length})</span>
                            <button
                              type="button"
                              onClick={() => setIsCategoryDropdownOpen(false)}
                              className="text-slate-500 hover:text-red-600 font-bold px-1"
                            >
                              ✕
                            </button>
                          </div>
                          {/* All Categories Option */}
                          <div
                            onClick={() => {
                              setSelectedCategory('');
                              setCategorySearchQuery('');
                              setSelectedToolSize('');
                              setIsCategoryDropdownOpen(false);
                            }}
                            className={`px-3 py-1.5 cursor-pointer hover:bg-blue-100 flex items-center justify-between transition ${
                              !selectedCategory ? 'bg-blue-50 font-bold text-blue-900' : 'text-slate-800'
                            }`}
                          >
                            <span className="font-bold flex items-center gap-1.5">
                              <span className="text-amber-500">★</span>
                              <span>All Categories</span>
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {inventory.length} tools in stock
                            </span>
                          </div>

                          {filteredCategories.length === 0 ? (
                            <div className="p-3 text-center text-slate-400 italic">No matching categories found</div>
                          ) : (
                            filteredCategories.map((c) => (
                              <div
                                key={c}
                                onClick={() => {
                                  setSelectedCategory(c);
                                  setCategorySearchQuery(c);
                                  setSelectedToolSize('');
                                  setIsCategoryDropdownOpen(false);
                                }}
                                className={`px-3 py-1.5 cursor-pointer hover:bg-blue-100 flex items-center justify-between transition ${
                                  selectedCategory === c ? 'bg-blue-50 font-bold text-blue-900' : 'text-slate-800'
                                }`}
                              >
                                <span>{c}</span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {inventory.filter((t) => t.shortDesc?.trim().toUpperCase() === c.toUpperCase()).length} in stock
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tool Size Filter */}
                  <div className="flex items-center gap-1.5">
                    <label className="font-extrabold text-slate-800 uppercase tracking-tight text-[11px]">TOOL SIZE :</label>
                    <select
                      value={selectedToolSize}
                      onChange={(e) => setSelectedToolSize(e.target.value)}
                      className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-800 w-32 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">All Sizes</option>
                      {availableSizes.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Asset No / Tool Search Filter */}
                  <div className="flex items-center gap-1.5 relative">
                    <label className="font-extrabold text-slate-800 uppercase tracking-tight text-[11px] flex items-center gap-1">
                      <span>🔍</span>
                      <span>ASSET NO :</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={toolSearchQuery}
                        onChange={(e) => setToolSearchQuery(e.target.value)}
                        placeholder="Search Asset No, Serial..."
                        className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-800 w-48 sm:w-64 shadow-2xs cursor-text focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                      {toolSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setToolSearchQuery('')}
                          className="absolute right-2 text-slate-400 hover:text-slate-700 text-xs cursor-pointer font-bold"
                          title="Clear Search"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-slate-600 font-medium">
                  {toolSearchQuery && (
                    <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200 text-[10px] font-bold">
                      Filter: &ldquo;{toolSearchQuery}&rdquo;
                    </span>
                  )}
                  <div>
                    Matching Tools: <strong className="text-slate-900 font-bold">{modalAvailableTools.length}</strong>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1.5 text-[11px] text-emerald-950 leading-tight flex-shrink-0 flex items-center justify-between">
                <div>
                  <span className="font-bold text-emerald-800">✓ Base &amp; Good Condition Filter Active:</span> Only tools physically located in <strong>Base</strong> and in verified <strong>Good / Accepted</strong> condition appear for mobilization. Tools on rig, in repair/redress, in inspection, or already assigned to this checklist are strictly excluded.
                </div>
                <div className="text-[11px] text-slate-600 font-medium pl-2 whitespace-nowrap">
                  Job: <strong className="text-slate-900">{jobData.id}</strong>
                </div>
              </div>

              {/* Tools Table with Checkbox as Column 1 */}
              <div className="flex-1 min-h-0 bg-white border border-[#9fb6cf] rounded overflow-auto shadow-inner">
                <table className="min-w-full text-left border-collapse text-[11.5px] table-fixed">
                  <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#9fb6cf] font-bold text-[11px] sticky top-0 z-10 shadow-2xs select-none">
                    <tr>
                      <th
                        style={{ width: toolPickerResizer.widths.select || 48 }}
                        className="py-1.5 px-3 whitespace-nowrap text-center sticky left-0 bg-[#e9f0f8] z-20 shadow-2xs border-r border-[#9fb6cf] relative overflow-hidden"
                      >
                        <input
                          type="checkbox"
                          checked={modalAvailableTools.length > 0 && modalAvailableTools.every((t) => {
                            const k = (t.id ? String(t.id).trim() : '') || (t.serial ? String(t.serial).trim() : '') || (t.assetNo ? String(t.assetNo).trim() : '');
                            return checkedToolSerials.includes(k) || (t.serial && checkedToolSerials.includes(t.serial));
                          })}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCheckedToolSerials(modalAvailableTools.map((t) => (t.id ? String(t.id).trim() : '') || (t.serial ? String(t.serial).trim() : '') || (t.assetNo ? String(t.assetNo).trim() : '')));
                              setCheckedToolDisplayMap(Object.fromEntries(modalAvailableTools.map((t) => {
                                const k = (t.id ? String(t.id).trim() : '') || (t.serial ? String(t.serial).trim() : '') || (t.assetNo ? String(t.assetNo).trim() : '');
                                const disp = (t.assetNo && !t.assetNo.toUpperCase().startsWith('EMD-') ? t.assetNo : '') || (t.serial && !t.serial.toUpperCase().startsWith('EMD-') ? t.serial : '') || t.assetNo || t.serial || '';
                                return [k, disp];
                              })));
                            } else {
                              setCheckedToolSerials([]);
                              setCheckedToolDisplayMap({});
                            }
                          }}
                          className="cursor-pointer w-4 h-4 text-blue-600 rounded"
                          title="Select All Visible"
                        />
                        <ResizerHandle onMouseDown={(e) => toolPickerResizer.startResize('select', e)} onDoubleClick={() => toolPickerResizer.resetColumn('select')} />
                      </th>
                      <th
                        style={{ width: toolPickerResizer.widths.serial || 140 }}
                        className="py-1 px-3 whitespace-nowrap relative overflow-hidden truncate"
                      >
                        <span>Asset No</span>
                        <ResizerHandle onMouseDown={(e) => toolPickerResizer.startResize('serial', e)} onDoubleClick={() => toolPickerResizer.resetColumn('serial')} />
                      </th>
                      <th
                        style={{ width: toolPickerResizer.widths.description || 320 }}
                        className="py-1 px-3 whitespace-nowrap relative overflow-hidden truncate"
                      >
                        <span>Description</span>
                        <ResizerHandle onMouseDown={(e) => toolPickerResizer.startResize('description', e)} onDoubleClick={() => toolPickerResizer.resetColumn('description')} />
                      </th>
                      <th
                        style={{ width: toolPickerResizer.widths.size || 80 }}
                        className="py-1 px-2 whitespace-nowrap text-center relative overflow-hidden truncate"
                      >
                        <span>Size</span>
                        <ResizerHandle onMouseDown={(e) => toolPickerResizer.startResize('size', e)} onDoubleClick={() => toolPickerResizer.resetColumn('size')} />
                      </th>
                      <th
                        style={{ width: toolPickerResizer.widths.qty || 60 }}
                        className="py-1 px-2 whitespace-nowrap text-center relative overflow-hidden truncate"
                      >
                        <span>DTQTY</span>
                        <ResizerHandle onMouseDown={(e) => toolPickerResizer.startResize('qty', e)} onDoubleClick={() => toolPickerResizer.resetColumn('qty')} />
                      </th>
                      <th
                        style={{ width: toolPickerResizer.widths.supplier || 110 }}
                        className="py-1 px-3 whitespace-nowrap relative overflow-hidden truncate"
                      >
                        <span>Supplier</span>
                        <ResizerHandle onMouseDown={(e) => toolPickerResizer.startResize('supplier', e)} onDoubleClick={() => toolPickerResizer.resetColumn('supplier')} />
                      </th>
                      <th
                        style={{ width: toolPickerResizer.widths.insDate || 105 }}
                        className="py-1 px-2 whitespace-nowrap relative overflow-hidden truncate"
                      >
                        <span>Ins_Date</span>
                        <ResizerHandle onMouseDown={(e) => toolPickerResizer.startResize('insDate', e)} onDoubleClick={() => toolPickerResizer.resetColumn('insDate')} />
                      </th>
                      <th
                        style={{ width: toolPickerResizer.widths.insNum || 140 }}
                        className="py-1 px-2 whitespace-nowrap relative overflow-hidden truncate"
                      >
                        <span>Ins_Num</span>
                        <ResizerHandle onMouseDown={(e) => toolPickerResizer.startResize('insNum', e)} onDoubleClick={() => toolPickerResizer.resetColumn('insNum')} />
                      </th>
                      <th
                        style={{ width: toolPickerResizer.widths.condition || 100 }}
                        className="py-1 px-2 whitespace-nowrap relative overflow-hidden truncate"
                      >
                        <span>Condition</span>
                        <ResizerHandle onMouseDown={(e) => toolPickerResizer.startResize('condition', e)} onDoubleClick={() => toolPickerResizer.resetColumn('condition')} />
                      </th>

                      {/* Custom Columns registered in Database Inspector */}
                      {toolPickerCustomCols.map((c) => (
                        <th
                          key={c.key}
                          style={{ width: toolPickerResizer.widths[c.key] || c.width || 130 }}
                          className="py-1 px-2 whitespace-nowrap relative bg-emerald-50/70 text-emerald-950 font-bold overflow-hidden truncate"
                        >
                          <div className="flex items-center gap-1">
                            <span className="text-emerald-600 text-[10px]">★</span>
                            <span className="truncate">{c.label}</span>
                          </div>
                          <ResizerHandle onMouseDown={(e) => toolPickerResizer.startResize(c.key, e)} onDoubleClick={() => toolPickerResizer.resetColumn(c.key)} />
                        </th>
                      ))}
                      {/* Trailing flexible filler header to absorb excess table width */}
                      <th className="p-0 border-0 pointer-events-none w-auto" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {modalAvailableTools.length === 0 ? (
                      <tr>
                        <td colSpan={10 + toolPickerCustomCols.length} className="p-8 text-center text-slate-500 font-medium">
                          <div>
                            No available tools found in yard for Category: <strong>{selectedCategory || 'All Categories'}</strong> {selectedToolSize && `(Size: ${selectedToolSize})`} {toolSearchQuery && `matching "${toolSearchQuery}"`}.
                          </div>
                          {selectedCategory && (
                            <div className="mt-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCategory('');
                                  setCategorySearchQuery('');
                                }}
                                className="text-blue-600 hover:text-blue-800 underline font-semibold text-xs cursor-pointer"
                              >
                                Search across All Categories instead
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      modalAvailableTools.map((tool) => {
                        const toolKey = (tool.id ? String(tool.id).trim() : '') || (tool.serial ? String(tool.serial).trim() : '') || (tool.assetNo ? String(tool.assetNo).trim() : '');
                        const isChecked = checkedToolSerials.includes(toolKey) || (tool.serial && checkedToolSerials.includes(tool.serial));

                        // Look up genuine inspection record for this tool
                        const toolInspections = (inspections || []).filter(
                          (ins) =>
                            (ins.serial && ins.serial.trim().toLowerCase() === tool.serial.trim().toLowerCase()) ||
                            (tool.assetNo && ins.serial && ins.serial.trim().toLowerCase() === tool.assetNo.trim().toLowerCase())
                        );
                        const latestIns = toolInspections.length > 0
                          ? [...toolInspections].sort(
                              (a, b) =>
                                new Date(b.inspectionDate || b.reportDate || b.receivedDate || '').getTime() -
                                new Date(a.inspectionDate || a.reportDate || a.receivedDate || '').getTime()
                            )[0]
                          : null;

                        const rawInsDate = latestIns?.inspectionDate || latestIns?.reportDate || latestIns?.receivedDate;
                        const insDate = rawInsDate
                          ? formatDateDD_MM_YYYY(rawInsDate)
                          : (tool.addedDate ? formatDateDD_MM_YYYY(tool.addedDate) : '—');
                        const insNum = latestIns?.reportNumber || latestIns?.woNumber || latestIns?.id || '—';
                        const condition = latestIns?.status
                          ? latestIns.status.toUpperCase()
                          : (tool.status?.toUpperCase() === 'GOOD' ? 'ACCEPTED' : (tool.status?.toUpperCase() || 'ACCEPTED'));


                         // The EXACT asset number shown in the picker table cell
                         const pickerDisplayAssetNo =
                           (tool.assetNo && !tool.assetNo.toUpperCase().startsWith('EMD-') ? tool.assetNo : '') ||
                           (tool.serial  && !tool.serial.toUpperCase().startsWith('EMD-')  ? tool.serial  : '') ||
                           tool.assetNo || tool.serial || '';

                        return (
                          <tr
                            key={toolKey}
                            onClick={() => {
                              if (isChecked) {
                                setCheckedToolSerials((prev) => prev.filter((s) => s !== toolKey && s !== tool.serial));
                                setCheckedToolDisplayMap((prev) => { const m = { ...prev }; delete m[toolKey]; return m; });
                              } else {
                                setCheckedToolSerials((prev) => [...prev, toolKey]);
                                setCheckedToolDisplayMap((prev) => ({ ...prev, [toolKey]: pickerDisplayAssetNo }));
                              }
                            }}
                            className={`cursor-pointer transition h-7 leading-none ${
                              isChecked ? 'bg-amber-100/90 font-semibold' : 'hover:bg-blue-50/60'
                            }`}
                          >
                            <td className="py-1.5 px-3 whitespace-nowrap text-center sticky left-0 bg-inherit z-10 border-r border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setCheckedToolSerials((prev) => [...prev, toolKey]);
                                    setCheckedToolDisplayMap((prev) => ({ ...prev, [toolKey]: pickerDisplayAssetNo }));
                                  } else {
                                    setCheckedToolSerials((prev) => prev.filter((s) => s !== toolKey && s !== tool.serial));
                                    setCheckedToolDisplayMap((prev) => { const m = { ...prev }; delete m[toolKey]; return m; });
                                  }
                                }}
                                className="cursor-pointer w-4 h-4 text-blue-600 rounded"
                              />
                            </td>
                            <td className="py-1 px-3 whitespace-nowrap font-mono font-bold text-slate-900 truncate" title={pickerDisplayAssetNo}>
                              {pickerDisplayAssetNo}
                            </td>
                            <td className="py-1 px-3 whitespace-nowrap font-medium text-slate-800 truncate" title={tool.desc || tool.shortDesc}>
                              {tool.desc || tool.shortDesc}
                            </td>
                            <td className="py-1 px-2 whitespace-nowrap text-center font-mono text-slate-700 truncate" title={tool.size || '—'}>{tool.size || '—'}</td>
                            <td className="py-1 px-2 whitespace-nowrap text-center font-bold truncate">{tool.qty || 1}</td>
                            <td className="py-1 px-3 whitespace-nowrap text-slate-700 truncate" title={(tool.supplier && tool.supplier.toUpperCase() !== 'EMDAD' ? tool.supplier : '') || (tool.ownership && tool.ownership.toUpperCase() !== 'EMDAD' ? tool.ownership : '') || (tool.isEmdad === false ? (tool.ownership || tool.supplier || 'Sub-Contractor') : 'EMDAD')}>
                              {(tool.supplier && tool.supplier.toUpperCase() !== 'EMDAD' ? tool.supplier : '') || (tool.ownership && tool.ownership.toUpperCase() !== 'EMDAD' ? tool.ownership : '') || (tool.isEmdad === false ? (tool.ownership || tool.supplier || 'Sub-Contractor') : 'EMDAD')}
                            </td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-700 truncate" title={insDate}>{insDate}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-blue-700 font-semibold truncate" title={insNum}>{insNum}</td>
                            <td className={`py-1 px-2 whitespace-nowrap font-bold truncate ${condition === 'ACCEPTED' ? 'text-emerald-700' : 'text-amber-700'}`} title={condition}>{condition}</td>

                            {/* Custom Column Values */}
                            {toolPickerCustomCols.map((c) => {
                              const val = (tool as any)[c.key] ?? (tool as any).customFields?.[c.key] ?? '—';
                              return (
                                <td key={c.key} className="py-1 px-2 whitespace-nowrap font-mono text-slate-800 truncate" title={String(val)}>
                                  {String(val)}
                                </td>
                              );
                            })}
                            {/* Trailing filler cell */}
                            <td className="p-0 border-0" />
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-1 flex-shrink-0">
                <span className="text-slate-700 text-[11px]">
                  Total matching items: <strong>{modalAvailableTools.length}</strong> | Selected: <strong className="text-blue-900">{checkedToolSerials.length}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsToolSelectOpen(false);
                      setCheckedToolSerials([]);
                      setCheckedToolDisplayMap({});
                      setToolSearchQuery('');
                    }}
                    className="px-3.5 py-1 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertSelectedTools}
                    disabled={checkedToolSerials.length === 0}
                    className="px-5 py-1 rounded bg-[#107c41] hover:bg-[#0c6233] disabled:opacity-50 text-white font-bold shadow-xs cursor-pointer text-xs flex items-center gap-1.5"
                  >
                    <span>Insert Selected Tools ({checkedToolSerials.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN RE-OPEN JUSTIFICATION MODAL */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border-2 border-amber-500 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-amber-500 text-slate-900 px-4 py-2.5 flex items-center justify-between font-black text-sm">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span>Admin Re-open Job Justification</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsReopenModalOpen(false);
                  setReopenJustification('');
                }}
                className="text-slate-900 hover:text-white font-bold text-base cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <p className="text-slate-700 leading-relaxed">
                Unlock Job <strong>{jobData.id}</strong>, its Checklist, and Delivery Tickets for operational corrections.
                <strong className="text-amber-900"> A formal justification is required for the database audit log.</strong>
              </p>
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Audit Justification Reason (Required, min 10 characters):
                </label>
                <textarea
                  rows={4}
                  value={reopenJustification}
                  onChange={(e) => setReopenJustification(e.target.value)}
                  placeholder="e.g. Correcting tool serial numbers on Delivery Ticket DT-26-3429 per rig request ref #1815..."
                  className="w-full border border-slate-300 rounded p-2 text-xs text-slate-800 focus:ring-1 focus:ring-amber-500 outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setIsReopenModalOpen(false);
                    setReopenJustification('');
                  }}
                  className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={reopenJustification.trim().length < 10}
                  onClick={() => {
                    const auditEntry = `\n\n[ADMIN AUDIT OVERRIDE - ${new Date().toLocaleString()} by ${user?.name || 'Admin'}]: Job and Delivery Tickets unlocked for editing/corrections. Justification: ${reopenJustification.trim()}`;
                    const updated = {
                      ...jobData,
                      notes: (jobData.notes || '') + auditEntry,
                    };
                    setJobData(updated);
                    onSaveJob(updated);
                    setAdminUnlocked(true);
                    setIsReopenModalOpen(false);
                    setReopenJustification('');
                    showToast('Workspace unlocked for administrative editing & corrections.', 'info');
                  }}
                  className="px-4 py-1 rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 font-bold shadow-xs cursor-pointer"
                >
                  Confirm &amp; Unlock Workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD DAILY FIELD LOG MODAL */}
      {isAddDailyLogOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full border border-slate-300 overflow-hidden">
            <div className="bg-[#1a3055] text-white px-4 py-2.5 flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5">
                <span>📝</span>
                <span>Add Daily Field Operations Log (DDR)</span>
              </span>
              <button
                type="button"
                onClick={() => setIsAddDailyLogOpen(false)}
                className="text-white hover:text-amber-300 text-base font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleAddDailyLog} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Log Date:</label>
                  <input
                    type="date"
                    required
                    value={newLogDate}
                    onChange={(e) => setNewLogDate(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Operational Status:</label>
                  <select
                    value={newLogStatus}
                    onChange={(e) => setNewLogStatus(e.target.value as any)}
                    className="w-full border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-800 bg-white"
                  >
                    <option value="Operational">Operational (In-Hole / Running)</option>
                    <option value="Standby">Standby (Rig Idle / Client Orders)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hole Depth / Section:</label>
                  <input
                    type="text"
                    value={newLogDepth}
                    onChange={(e) => setNewLogDepth(e.target.value)}
                    placeholder="e.g. 11,250 ft / 8-1/2&quot; hole"
                    className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Logged By:</label>
                  <input
                    type="text"
                    required
                    value={newLogEngineer}
                    onChange={(e) => setNewLogEngineer(e.target.value)}
                    placeholder="Field Engineer / Specialist"
                    className="w-full border border-slate-300 rounded px-2 py-1 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  24-Hour Operations Summary &amp; Remarks (Required):
                </label>
                <textarea
                  rows={4}
                  required
                  value={newLogActivity}
                  onChange={(e) => setNewLogActivity(e.target.value)}
                  placeholder="Describe daily operations, tool performance, BHA runs, fishing progress, or standby reasons..."
                  className="w-full border border-slate-300 rounded p-2 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddDailyLogOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer shadow-xs"
                >
                  Record Daily Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROLLOVER UNRETURNED TOOLS MODAL (CONTRACT 4700024096 ONLY) */}
      {isRolloverModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border-2 border-indigo-600 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-[#1a3055] text-white px-4 py-2.5 flex items-center justify-between font-bold text-sm flex-shrink-0">
              <div className="flex items-center gap-2">
                <span>📥</span>
                <span>Rollover Active Unreturned Tools (Contract 4700024096)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsRolloverModalOpen(false)}
                className="text-white hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs overflow-y-auto flex-1">
              <div className="bg-indigo-50 border border-indigo-200 rounded p-3 text-indigo-950 leading-relaxed">
                <span className="font-bold">🏷️ Shared Rental Pool Rollover:</span> Select the previous month's job under Contract <strong>4700024096</strong>. The system will detect all equipment still on rig (no Return Ticket stamped) and transfer them directly into current job <strong>{jobData.id}</strong> with their assigned Rig, Well, and original dispatch date.
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Previous Month's Job:</label>
                {previousPoolJobs.length === 0 ? (
                  <p className="text-slate-500 italic p-2 border border-slate-200 rounded bg-slate-50">
                    No other jobs found under Contract 4700024096.
                  </p>
                ) : (
                  <select
                    value={selectedPreviousJobId}
                    onChange={(e) => setSelectedPreviousJobId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded p-2 text-xs font-mono font-bold text-[#1a3055] focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Select a previous job...</option>
                    {previousPoolJobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.id} — Rig: {j.rig || 'Multi-Rig'} — Well: {j.well || '—'} ({j.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedPreviousJobId && (
                <div>
                  <div className="flex items-center justify-between mb-1.5 font-bold text-slate-800">
                    <span>Unreturned Active Tools Found:</span>
                    <span className="bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded font-mono">
                      {unreturnedToolsFromPreviousJob.length} Tool(s)
                    </span>
                  </div>

                  {unreturnedToolsFromPreviousJob.length === 0 ? (
                    <p className="p-4 bg-slate-50 border border-slate-200 rounded text-center text-slate-500 italic">
                      All tools from this job have already been returned to base on Return Tickets.
                    </p>
                  ) : (
                    <div className="border border-slate-200 rounded max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {unreturnedToolsFromPreviousJob.map((tl, i) => (
                        <div key={i} className="p-2 flex items-center justify-between text-xs hover:bg-slate-50">
                          <div>
                            <span className="font-mono font-bold text-blue-900 mr-2">{tl.assetNo || tl.serial}</span>
                            <span className="text-slate-700">{tl.desc || tl.shortDesc}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-semibold">
                              Rig: {tl.allocatedRig || '—'}
                            </span>
                            <span className="text-slate-500 font-mono">
                              DT: {tl.fromDT || '—'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-slate-100 px-4 py-3 flex items-center justify-between border-t border-slate-200 flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsRolloverModalOpen(false)}
                className="px-4 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRolloverFromPreviousJob}
                disabled={!selectedPreviousJobId || unreturnedToolsFromPreviousJob.length === 0}
                className="px-5 py-1.5 rounded bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white font-bold text-xs cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <span>📥 Import Active Tools into Current Checklist</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MS Access Bottom Action Footer */}
      <div className="bg-[#1a3055] text-white px-4 py-2 rounded-b-md flex flex-wrap items-center justify-between gap-3 shadow-md mt-1 no-print">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-300">Active Job:</span>
          <span className="font-mono font-bold text-amber-300">{jobData.id}</span>
          <span className="text-slate-400">&bull;</span>
          <span className="text-slate-300">Client:</span>
          <span className="font-semibold text-white">{jobData.client || '—'}</span>
          <span className="text-slate-400">&bull;</span>
          <span className="text-slate-300">Rig:</span>
          <span className="font-mono text-cyan-300">{jobData.rig || '—'}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Single Refresh action for this screen lives in the top toolbar — this bar is status-only. */}
          <span className="text-[11px] text-slate-300 font-mono bg-white/5 border border-white/10 px-2.5 py-1 rounded flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isSaving ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></span>
            <span>{isSaving ? 'Saving to Azure SQL…' : lastSavedTime ? `Synced with Azure SQL (Saved ${lastSavedTime})` : 'Synced with Azure SQL'}</span>
          </span>
        </div>
      </div>

      {adminModalKey && (
        <AdminDropdownModal
          listKey={adminModalKey}
          user={user}
          isOpen={true}
          onClose={() => setAdminModalKey(null)}
          onChanged={() => {
            setServiceCategoriesList(getDropdownOptions('jobServiceCategories'));
            setSubDivisionsList(getDropdownOptions('subDivisions'));
          }}
        />
      )}
    </div>
  );
};
