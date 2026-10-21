import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { DrillingJob, Callout, DTBatch, RTBatch, User, JobLifecycleStatus } from '../types';
import {
  JobStageKey,
  STAGE_DEFINITIONS,
  ALL_STAGE_KEYS,
  resolveJobStage,
  calculateJobLifecycleMetrics,
  isLegalInvoiceNumber,
} from '../jobLifecycle';
import { JobStatusModal } from './JobStatusModal';
import { JobLifecycleStepper } from './JobLifecycleStepper';
import { JobDetailModal } from './JobDetailModal';
import { JobDossierView } from './JobDossierView';
import { JobToolsListView } from './JobToolsListView';
import { SearchableSelect } from './SearchableSelect';
import { ToolItem, ContractRecord, InspectionRecord, SubDivision } from '../types';
import { isInvalidOrPlaceholderDate } from '../utils';
import { resolveJobClient, formatStandardJobId } from '../services/api';
import { useModulePermission, ReadOnlyBanner } from '../services/permissionService';
import { useResizableColumns, ResizerHandle, useCustomColumns } from '../services/customColumnService';
import { resolveContractSubDivision } from '../services/customContracts';
import { DropdownListKey, getDropdownOptions } from '../services/dropdownService';
import { AdminDropdownModal } from './AdminDropdownModal';
import {
  Search,
  Download,
  Upload,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  Truck,
  RotateCcw,
  X,
  FileSpreadsheet,
  Layers,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle,
  Clock,
  Receipt,
  Archive,
  Activity,
  Calendar,
  ShieldCheck,
  Send,
  Settings as SettingsIcon,
} from 'lucide-react';

interface JobsViewProps {
  user?: User | null;
  jobs: DrillingJob[];
  callouts: Callout[];
  dtBatches: DTBatch[];
  rtBatches?: RTBatch[];
  inventory?: ToolItem[];
  contracts?: ContractRecord[];
  inspections?: InspectionRecord[];
  customCategories?: string[];
  customSizes?: string[];
  onSaveJob: (job: DrillingJob) => void;
  onRefresh?: () => void;
  onDispatchJob: (jobId: string) => void;
  onReceiveJob?: (jobId: string) => void;
  onBatchUpdateJobs?: (jobs: DrillingJob[]) => void;
  onSaveDTBatch?: (batch: DTBatch) => void;
  onUpdateDTBatch?: (batch: DTBatch, addedTools?: ToolItem[], removedTools?: ToolItem[]) => void;
  onDeleteDTBatch?: (dtNumber: string) => void;
  onSaveRTBatch?: (batch: RTBatch) => void;
  onUpdateRTBatch?: (batch: RTBatch) => void;
  onSaveCallout?: (callout: Callout) => void;
  onNavigateToInvoicing?: (jobId: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  isNewJobModalOpen: boolean;
  onCloseNewJobModal: () => void;
  onOpenNewJobModal: () => void;
  selectedCalloutForNewJob?: Callout | null;
  onOpenJobToolsList?: (jobId: string) => void;
  isSyncing?: boolean;
}

// Clean oilfield date formatter (strictly formats as DD-MMM-YYYY, e.g. 28-May-2023)
// Returns '—' for empty, invalid, or 1900/1970 placeholder dates
export const formatJobDate = (dateStr?: string | null): string => {
  if (!dateStr || isInvalidOrPlaceholderDate(dateStr)) return '—';
  const clean = String(dateStr).trim();
  if (clean === '' || clean === '—' || clean === '-') return '—';

  // If already DD-MMM-YYYY (4 digits year)
  const dmy4Match = clean.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (dmy4Match) {
    const yr = parseInt(dmy4Match[3], 10);
    if (yr <= 1900) return '—';
    return `${dmy4Match[1].padStart(2, '0')}-${dmy4Match[2].charAt(0).toUpperCase() + dmy4Match[2].slice(1).toLowerCase()}-${dmy4Match[3]}`;
  }

  // If DD-MMM-YY (2 digits year)
  const dmy2Match = clean.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (dmy2Match) {
    const yrNum = parseInt(dmy2Match[3], 10);
    const yr = yrNum > 50 ? `19${dmy2Match[3]}` : `20${dmy2Match[3]}`;
    if (parseInt(yr, 10) <= 1900) return '—';
    return `${dmy2Match[1].padStart(2, '0')}-${dmy2Match[2].charAt(0).toUpperCase() + dmy2Match[2].slice(1).toLowerCase()}-${yr}`;
  }

  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const yr = parseInt(isoMatch[1], 10);
    if (yr <= 1900) return '—';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIndex = parseInt(isoMatch[2], 10) - 1;
    const day = isoMatch[3].padStart(2, '0');
    if (mIndex >= 0 && mIndex < 12) {
      return `${day}-${months[mIndex]}-${yr}`;
    }
  }

  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      const yr = d.getFullYear();
      if (yr <= 1900) return '—';
      const day = String(d.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day}-${months[d.getMonth()]}-${yr}`;
    }
  } catch {}

  return '—';
};

// Parse dates into milliseconds for chronological min/max and sorting
export const parseDateToMs = (dStr?: string | null): number => {
  if (!dStr || isInvalidOrPlaceholderDate(dStr)) return 0;
  const clean = dStr.trim();
  const dmyMatch = clean.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = months.indexOf(dmyMatch[2].toLowerCase());
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    if (year <= 1900) return 0;
    if (month >= 0) {
      return new Date(year, month, day).getTime();
    }
  }
  const t = new Date(clean).getTime();
  if (isNaN(t)) return 0;
  const parsed = new Date(clean);
  if (parsed.getFullYear() <= 1900) return 0;
  return t;
};

// Start Date is always the first (earliest) Delivery Ticket date; fallback to mobDate
export const getJobStartDate = (job: DrillingJob, dtBatches?: DTBatch[]): string => {
  if (dtBatches && dtBatches.length > 0) {
    const valid = dtBatches
      .map((dt) => {
        const raw = dt.dispatchDate || dt.deliveryDate || dt.rmDate;
        return { raw, ms: parseDateToMs(raw) };
      })
      .filter((d) => d.ms > 0 && !isInvalidOrPlaceholderDate(d.raw))
      .sort((a, b) => a.ms - b.ms);
    if (valid.length > 0 && valid[0].raw && !isInvalidOrPlaceholderDate(valid[0].raw)) {
      return valid[0].raw;
    }
  }
  return !isInvalidOrPlaceholderDate(job.mobDate) ? (job.mobDate || '') : '';
};

// End Date is always the last (latest) Receiving Ticket date; fallback to demobDate
export const getJobEndDate = (job: DrillingJob, rtBatches?: RTBatch[]): string => {
  if (rtBatches && rtBatches.length > 0) {
    const valid = rtBatches
      .map((rt) => {
        const raw = rt.rtDate || rt.backloadRmDate || rt.loadingNoteDate || rt.lNoteDate || (rt as any).Date_In || (rt as any).dateIn;
        return { raw, ms: parseDateToMs(raw) };
      })
      .filter((d) => d.ms > 0 && !isInvalidOrPlaceholderDate(d.raw))
      .sort((a, b) => a.ms - b.ms);
    if (valid.length > 0 && valid[valid.length - 1].raw && !isInvalidOrPlaceholderDate(valid[valid.length - 1].raw)) {
      return valid[valid.length - 1].raw;
    }
  }
  return !isInvalidOrPlaceholderDate(job.demobDate) ? (job.demobDate || '') : '';
};

// Normalize keys to allow exact cross-matching (e.g. Job-023-00002 <-> 023-00002)
const normalizeJobKey = (str?: string): string => {
  if (!str) return '';
  const s = str
    .trim()
    .toUpperCase()
    .replace(/^JOB[-_]?/i, '');
  return s.replace(/^0(\d{2}-)/, '$1');
};

// Natural sequential sorter for Job IDs (handles Job-023-00001, Job-023-00002-1, JOB-26-00001)
const extractJobSeq = (idStr: string): number => {
  const match = idStr.match(/(\d+)[-_](\d+)(?:[-_](\d+))?/);
  if (match) {
    const part1 = parseInt(match[1], 10) || 0;
    const part2 = parseInt(match[2], 10) || 0;
    const rev = match[3] ? parseInt(match[3], 10) : 0;
    return part1 * 10000000 + part2 * 100 + rev;
  }
  const digits = idStr.match(/\d+/g);
  if (digits) {
    return parseInt(digits.join(''), 10) || 0;
  }
  return 0;
};

export const JobsView: React.FC<JobsViewProps> = ({
  user,
  jobs,
  callouts,
  dtBatches,
  rtBatches = [],
  inventory = [],
  contracts = [],
  inspections = [],
  onSaveJob,
  onRefresh,
  onDispatchJob,
  onReceiveJob,
  onBatchUpdateJobs,
  onSaveDTBatch,
  onUpdateDTBatch,
  onDeleteDTBatch,
  onSaveRTBatch,
  onUpdateRTBatch,
  onSaveCallout,
  onNavigateToInvoicing,
  showToast,
  isNewJobModalOpen,
  onCloseNewJobModal,
  onOpenNewJobModal,
  selectedCalloutForNewJob,
  onOpenJobToolsList,
  customCategories,
  customSizes,
  isSyncing,
}) => {
  const { canEdit, isReadOnly } = useModulePermission(user, 'jobs');
  const [tab, setTab] = useState<'all' | JobStageKey>('all');
  const [search, setSearch] = useState('');
  const [selectedRigFilter, setSelectedRigFilter] = useState<string>('all');
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const [selectedJobDetail, setSelectedJobDetail] = useState<DrillingJob | null>(null);
  const [dossierJob, setDossierJob] = useState<DrillingJob | null>(null);
  const [selectedToolsJobId, setSelectedToolsJobId] = useState<string | null>(null);

  // Sorting State
  const [sortField, setSortField] = useState<'id' | 'client' | 'rig' | 'startDate' | 'endDate' | 'dtTools' | 'rtTools' | 'toolsOnRig' | 'stage' | 'stageDays' | 'value'>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination State
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Dynamic Custom Columns & Excel-like Resizable Grid Columns
  const jobsCustomCols = useCustomColumns('jobs');
  const jobsResizer = useResizableColumns('jobs_grid', {
    id: 130,
    client: 150,
    project: 120,
    rig: 100,
    well: 100,
    poNumber: 120,
    startDate: 110,
    endDate: 110,
    value: 120,
    legalInvoice: 140,
    stage: 130,
    stageDays: 95,
    actions: 130,
  });

  // Status Edit Modal State
  const [editingJobStatus, setEditingJobStatus] = useState<DrillingJob | null>(null);
  const [newStatusValue, setNewStatusValue] = useState<string>('Ongoing');
  const [statusDate, setStatusDate] = useState(new Date().toISOString().split('T')[0]);
  const [statusNotes, setStatusNotes] = useState('');
  const [statusInvoiceNo, setStatusInvoiceNo] = useState('');

  // CSV Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvInputText, setCsvInputText] = useState('');
  const [csvParsedPreview, setCsvParsedPreview] = useState<DrillingJob[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Job Form States
  const [selectedCalloutId, setSelectedCalloutId] = useState<string>(
    selectedCalloutForNewJob ? selectedCalloutForNewJob.id : ''
  );
  const [newRig, setNewRig] = useState(selectedCalloutForNewJob ? selectedCalloutForNewJob.rig : '');
  const [newWell, setNewWell] = useState(selectedCalloutForNewJob ? selectedCalloutForNewJob.well : '');
  const [newClient, setNewClient] = useState(selectedCalloutForNewJob ? selectedCalloutForNewJob.client : '');
  const [newContract, setNewContract] = useState(
    selectedCalloutForNewJob ? selectedCalloutForNewJob.contract || '' : 'ADNOC Onshore'
  );
  const [newSubDivision, setNewSubDivision] = useState<SubDivision>(() => {
    return resolveContractSubDivision(selectedCalloutForNewJob?.contract || 'ADNOC Onshore') || 'RENTALS';
  });
  const [newPoNumber, setNewPoNumber] = useState(
    selectedCalloutForNewJob ? selectedCalloutForNewJob.poRef || '' : ''
  );
  const [newClientRef, setNewClientRef] = useState('');
  const [newHoleSection, setNewHoleSection] = useState('12-1/4"');
  const [newServiceType, setNewServiceType] = useState('Downhole Rental');
  const [newInvoicingType, setNewInvoicingType] = useState<'PerJob' | 'Monthly'>('PerJob');
  const [newCurrency, setNewCurrency] = useState('USD');
  const [newMobDate, setNewMobDate] = useState(new Date().toISOString().split('T')[0]);

  // Dynamic Dropdown Lists from dropdownService
  const [adminModalKey, setAdminModalKey] = useState<DropdownListKey | null>(null);
  const [divisionsList, setDivisionsList] = useState<string[]>(() => getDropdownOptions('subDivisions'));
  const [holeSectionsList, setHoleSectionsList] = useState<string[]>(() => getDropdownOptions('holeSections'));
  const [serviceTypesList, setServiceTypesList] = useState<string[]>(() => getDropdownOptions('jobServiceCategories'));
  const [rigsList, setRigsList] = useState<string[]>(() => getDropdownOptions('rigs'));
  const [wellsList, setWellsList] = useState<string[]>(() => getDropdownOptions('wells'));
  const [clientsList, setClientsList] = useState<string[]>(() => getDropdownOptions('clients'));

  // Build comprehensive rig and well lists from both the dropdown service AND every job ever recorded.
  // This ensures that any rig/well already in the database appears as a suggestion — no data loss
  // from freetext entries that weren't added to the admin list.
  const computedRigsList = React.useMemo(() => {
    const set = new Set<string>(rigsList);
    jobs.forEach((j) => {
      if (j.rig && j.rig.trim() && j.rig !== '—' && !j.rig.toLowerCase().includes('multi')) {
        set.add(j.rig.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [rigsList, jobs]);

  const computedWellsList = React.useMemo(() => {
    const set = new Set<string>(wellsList);
    jobs.forEach((j) => {
      if (j.well && j.well.trim() && j.well !== '—') {
        set.add(j.well.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [wellsList, jobs]);

  React.useEffect(() => {
    const handleDropdownUpdate = () => {
      setDivisionsList(getDropdownOptions('subDivisions'));
      setHoleSectionsList(getDropdownOptions('holeSections'));
      setServiceTypesList(getDropdownOptions('jobServiceCategories'));
      setRigsList(getDropdownOptions('rigs'));
      setWellsList(getDropdownOptions('wells'));
      setClientsList(getDropdownOptions('clients'));
    };
    window.addEventListener('dropdown_options_updated', handleDropdownUpdate);
    return () => window.removeEventListener('dropdown_options_updated', handleDropdownUpdate);
  }, []);

  // Robust DT and RT tool count indexing with cross-normalized keys (shared bucket mapping)
  const jobToolStats = useMemo(() => {
    const jobBucketMap = new Map<string, { dtCount: number; rtCount: number; dtBatches: DTBatch[]; rtBatches: RTBatch[] }>();

    const getJobBucket = (rawId?: string) => {
      if (!rawId) return null;
      const rawKey = rawId.trim().toUpperCase();
      const normKey = normalizeJobKey(rawId);
      let bucket = (normKey ? jobBucketMap.get(normKey) : null) || (rawKey ? jobBucketMap.get(rawKey) : null);
      if (!bucket) {
        bucket = { dtCount: 0, rtCount: 0, dtBatches: [], rtBatches: [] };
        if (normKey) jobBucketMap.set(normKey, bucket);
        if (rawKey) jobBucketMap.set(rawKey, bucket);
      } else {
        if (normKey && !jobBucketMap.has(normKey)) jobBucketMap.set(normKey, bucket);
        if (rawKey && !jobBucketMap.has(rawKey)) jobBucketMap.set(rawKey, bucket);
      }
      return bucket;
    };

    dtBatches.forEach((dt) => {
      const count = dt.toolLines?.length || 0;
      const bucket = getJobBucket(dt.jobId) || (dt.jobNumber ? getJobBucket(dt.jobNumber) : null);
      if (bucket) {
        bucket.dtCount += count;
        bucket.dtBatches.push(dt);
      }
    });

    rtBatches.forEach((rt) => {
      const count = rt.toolLines?.length || 0;
      const bucket = getJobBucket(rt.jobId) || (rt.jobNumber ? getJobBucket(rt.jobNumber) : null);
      if (bucket) {
        bucket.rtCount += count;
        bucket.rtBatches.push(rt);
      }
    });

    return jobBucketMap;
  }, [dtBatches, rtBatches]);

  const getJobStats = (jobId: string) => {
    const rawKey = (jobId || '').trim().toUpperCase();
    const normKey = normalizeJobKey(jobId);
    return (normKey ? jobToolStats.get(normKey) : null) || (rawKey ? jobToolStats.get(rawKey) : null) || { dtCount: 0, rtCount: 0, dtBatches: [], rtBatches: [] };
  };

  const handleSortToggle = (field: 'id' | 'client' | 'rig' | 'startDate' | 'endDate' | 'dtTools' | 'rtTools' | 'toolsOnRig' | 'stage' | 'stageDays' | 'value') => {
    setCurrentPage(1);
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filter out any dummy test jobs and resolve accurate client name & standard Job ID format
  const validJobs = useMemo(() => {
    const seen = new Set<string>();
    const unique: DrillingJob[] = [];

    jobs
      .filter((j) => j && j.id && !j.id.toUpperCase().includes('TEST') && !j.id.toUpperCase().includes('DUMMY'))
      .forEach((j) => {
        const stdId = formatStandardJobId(j.id);
        const normKey = normalizeJobKey(stdId || j.id);
        if (!normKey || seen.has(normKey)) return;
        seen.add(normKey);

        const resolvedClient = resolveJobClient(j.client, j.contract, undefined, j.rig);
        unique.push({
          ...j,
          id: stdId || j.id,
          jobNumber: stdId || j.jobNumber || j.id,
          client: resolvedClient || j.client || 'ADNOC DRILLING COMPANY P.J.S.C.',
        });
      });

    return unique;
  }, [jobs]);

  // Distinct rigs for quick filter dropdown with natural numeric collation
  const uniqueRigs = useMemo(() => {
    const map = new Map<string, string>();
    validJobs.forEach((j) => {
      const r = (j.rig || '').trim();
      if (r && r !== '—' && r !== '-' && r.toUpperCase() !== 'NULL') {
        const key = r.toUpperCase();
        if (!map.has(key)) {
          map.set(key, r);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [validJobs]);

  const rigSelectOptions = useMemo(() => {
    return uniqueRigs.map((rig) => ({
      value: rig,
      label: rig,
    }));
  }, [uniqueRigs]);

  // Distinct clients for combo filter (excluding generic placeholders) with clean collation
  const uniqueClients = useMemo(() => {
    const map = new Map<string, string>();
    validJobs.forEach((j) => {
      const c = (j.client || '').trim();
      const u = c.toUpperCase();
      if (c && u !== 'EMDAD CLIENT' && u !== 'CLIENT' && u !== 'EMDAD' && u !== 'NIL' && u !== 'NULL' && u !== '—') {
        if (!map.has(u)) {
          map.set(u, c);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
  }, [validJobs]);

  const clientSelectOptions = useMemo(() => {
    return uniqueClients.map((client) => ({
      value: client,
      label: client,
    }));
  }, [uniqueClients]);

  // Overall metric totals for ribbon across the 6 discrete lifecycle stages
  const metrics = useMemo(() => {
    const counts: Record<JobStageKey, number> = {
      '1_open': 0,
      '2_ongoing': 0,
      '3_waiting_signed_docs': 0,
      '4_submitted_billing': 0,
      '5_ses_submitted': 0,
      '6_completed': 0,
    };
    let totalToolsOnRigs = 0;
    let totalDispatched = 0;

    validJobs.forEach((j) => {
      const st = getJobStats(j.id);
      const toolsOnRig = Math.max(0, st.dtCount - st.rtCount);
      totalToolsOnRigs += toolsOnRig;
      totalDispatched += st.dtCount;

      const stage = resolveJobStage(j, st.dtCount, st.rtCount);
      counts[stage] = (counts[stage] || 0) + 1;
    });

    return {
      total: validJobs.length,
      counts,
      totalToolsOnRigs,
      totalDispatched,
    };
  }, [validJobs, jobToolStats]);

  // Filtered and Sorted Jobs
  const filteredAndSortedJobs = useMemo(() => {
    const list = validJobs.filter((j) => {
      const st = getJobStats(j.id);
      const stage = resolveJobStage(j, st.dtCount, st.rtCount);

      if (tab !== 'all' && stage !== tab) return false;

      if (selectedRigFilter !== 'all' && (j.rig || '').trim().toUpperCase() !== selectedRigFilter.toUpperCase()) {
        return false;
      }

      if (selectedClientFilter !== 'all' && (j.client || '').trim().toUpperCase() !== selectedClientFilter.toUpperCase()) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const stageDef = STAGE_DEFINITIONS[stage];
        const full = `${j.id} ${j.calloutId || ''} ${j.rig} ${j.well} ${j.client} ${j.contract || ''} ${
          j.poNumber || ''
        } ${j.legalInvoiceNumber || ''} ${j.draftInvoiceNumber || ''} ${j.status || ''} ${stageDef.label} ${stageDef.shortLabel}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'id') {
        const seqA = extractJobSeq(a.id);
        const seqB = extractJobSeq(b.id);
        if (seqA !== seqB) {
          comparison = seqA - seqB;
        } else {
          comparison = (a.id || '').localeCompare(b.id || '', undefined, { numeric: true, sensitivity: 'base' });
        }
      } else if (sortField === 'client') {
        comparison = (a.client || '').localeCompare(b.client || '');
      } else if (sortField === 'rig') {
        comparison = (a.rig || '').localeCompare(b.rig || '', undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortField === 'startDate') {
        const aSt = getJobStats(a.id);
        const bSt = getJobStats(b.id);
        const aDate = getJobStartDate(a, aSt.dtBatches);
        const bDate = getJobStartDate(b, bSt.dtBatches);
        comparison = parseDateToMs(aDate) - parseDateToMs(bDate);
      } else if (sortField === 'endDate') {
        const aSt = getJobStats(a.id);
        const bSt = getJobStats(b.id);
        const aDate = getJobEndDate(a, aSt.rtBatches);
        const bDate = getJobEndDate(b, bSt.rtBatches);
        comparison = parseDateToMs(aDate) - parseDateToMs(bDate);
      } else if (sortField === 'dtTools') {
        const aSt = getJobStats(a.id);
        const bSt = getJobStats(b.id);
        comparison = aSt.dtCount - bSt.dtCount;
      } else if (sortField === 'rtTools') {
        const aSt = getJobStats(a.id);
        const bSt = getJobStats(b.id);
        comparison = aSt.rtCount - bSt.rtCount;
      } else if (sortField === 'toolsOnRig') {
        const aSt = getJobStats(a.id);
        const bSt = getJobStats(b.id);
        const aTools = Math.max(0, aSt.dtCount - aSt.rtCount);
        const bTools = Math.max(0, bSt.dtCount - bSt.rtCount);
        comparison = aTools - bTools;
      } else if (sortField === 'stage') {
        const aSt = getJobStats(a.id);
        const bSt = getJobStats(b.id);
        const aStage = resolveJobStage(a, aSt.dtCount, aSt.rtCount);
        const bStage = resolveJobStage(b, bSt.dtCount, bSt.rtCount);
        comparison = STAGE_DEFINITIONS[aStage].stepNumber - STAGE_DEFINITIONS[bStage].stepNumber;
      } else if (sortField === 'stageDays') {
        const aSt = getJobStats(a.id);
        const bSt = getJobStats(b.id);
        const aStage = resolveJobStage(a, aSt.dtCount, aSt.rtCount);
        const bStage = resolveJobStage(b, bSt.dtCount, bSt.rtCount);
        const aMetrics = calculateJobLifecycleMetrics(a, aStage, aSt.dtBatches, aSt.rtBatches);
        const bMetrics = calculateJobLifecycleMetrics(b, bStage, bSt.dtBatches, bSt.rtBatches);
        comparison = aMetrics.currentStageDays - bMetrics.currentStageDays;
      } else if (sortField === 'value') {
        const getVal = (j: DrillingJob) => j.invoiceAmount || (typeof j.cost === 'number' ? j.cost : parseFloat(String(j.cost || '').replace(/[^0-9.-]/g, '')) || 0);
        comparison = getVal(a) - getVal(b);
      }

      // Tie-breaker: sort by ID natural sequence so order is always deterministic
      if (comparison === 0 && sortField !== 'id') {
        const seqA = extractJobSeq(a.id);
        const seqB = extractJobSeq(b.id);
        comparison = seqA - seqB;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [validJobs, tab, search, selectedRigFilter, selectedClientFilter, sortField, sortOrder, jobToolStats]);

  // Paginated jobs
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedJobs.length / (pageSize || 1)));
  const paginatedJobs = useMemo(() => {
    if (pageSize === 0) return filteredAndSortedJobs;
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedJobs.slice(start, start + pageSize);
  }, [filteredAndSortedJobs, currentPage, pageSize]);

  const handleCalloutChange = (calId: string) => {
    setSelectedCalloutId(calId);
    if (!calId) return;
    const c = callouts.find((x) => x.id === calId);
    if (c) {
      setNewRig(c.rig);
      setNewWell(c.well);
      setNewClient(c.client);
      if (c.contract) setNewContract(c.contract);
      if (c.poRef) setNewPoNumber(c.poRef);
    }
  };

  const handleCreateJobSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRig || !newWell || !newClient) {
      alert('Rig, Well, and Client are required to initiate a Drilling Job.');
      return;
    }

    const curYr = new Date().getFullYear().toString().slice(-2);
    const jobNums = jobs
      .map((j) => {
        const m = j.id.match(/\d+$/);
        return m ? parseInt(m[0], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextSeq = jobNums.length > 0 ? Math.max(...jobNums) + 1 : 1;
    const newJobId = `JOB-${curYr}-${String(nextSeq).padStart(5, '0')}`;

    const newJob: DrillingJob = {
      id: newJobId,
      calloutId: selectedCalloutId || null,
      rig: newRig.trim(),
      well: newWell.trim(),
      client: newClient.trim(),
      contract: newContract.trim(),
      subDivision: newSubDivision || resolveContractSubDivision(newContract) || 'RENTALS',
      poNumber: newPoNumber.trim(),
      clientRef: newClientRef.trim(),
      holeSection: newHoleSection,
      serviceType: newServiceType,
      invoicingType: newInvoicingType,
      currency: newCurrency,
      mobDate: newMobDate,
      status: 'Open',
      createdDate: new Date().toISOString().split('T')[0],
      createdBy: user?.name || 'Operations',
    };

    onSaveJob(newJob);
    onCloseNewJobModal();
  };

  const handleUpdateStatusSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJobStatus) return;

    const updated: DrillingJob = {
      ...editingJobStatus,
      status: newStatusValue as any,
    };

    if (statusInvoiceNo.trim()) {
      updated.legalInvoiceNumber = statusInvoiceNo.trim();
    }

    if (newStatusValue === 'Final invoiced' && !updated.legalInvoiceNumber && statusInvoiceNo.trim()) {
      updated.legalInvoiceNumber = statusInvoiceNo.trim();
    }

    if (newStatusValue === 'Completed') {
      updated.demobDate = statusDate;
    }

    if (statusNotes) {
      updated.notes = updated.notes
        ? `${updated.notes}\n[${statusDate}]: ${statusNotes}`
        : `[${statusDate}]: ${statusNotes}`;
    }

    onSaveJob(updated);
    if (selectedJobDetail?.id.toUpperCase() === updated.id.toUpperCase()) {
      setSelectedJobDetail(updated);
    }
    setEditingJobStatus(null);
  };

  const handleStageSelectChange = (job: DrillingJob, newStage: JobStageKey) => {
    // If the job already has a verified legal invoice, it is locked as completed unless overridden by Admin
    if (isLegalInvoiceNumber(job.legalInvoiceNumber)) {
      if (user?.role !== 'Admin') {
        alert(`Job ${job.id} is finalized and closed with verified Legal Invoice ${job.legalInvoiceNumber}. Its status cannot be changed.`);
        return;
      }
      const ok = window.confirm(
        `Job ${job.id} is finalized with Legal Invoice ${job.legalInvoiceNumber}.\n\nAs Admin, do you want to override and change its stage/status?`
      );
      if (!ok) return;
    }

    if (newStage === '6_completed') {
      const enteredLegal = window.prompt(
        `To mark Job ${job.id} as Completed, please enter a valid Legal Invoice or Credit Note Number (e.g. FSH-02620, CN-21023, FR-..., WHP-...):`,
        job.legalInvoiceNumber || ''
      );

      if (!enteredLegal || !isLegalInvoiceNumber(enteredLegal)) {
        alert(
          `A valid legal invoice number or credit note (e.g. FSH, CN, FR, WHP, INV, DN, EMD) is required to complete a job.\n\nWithout a verified reference, this invoice remains under approval (Stage 5).`
        );
        return;
      }

      const updatedJob: DrillingJob = {
        ...job,
        legalInvoiceNumber: enteredLegal.trim().toUpperCase(),
        status: 'Final invoiced',
        completedDate: job.completedDate || new Date().toISOString().split('T')[0],
      };
      onSaveJob(updatedJob);
      return;
    }

    let newStatus: JobLifecycleStatus = 'Open';
    const updates: Partial<DrillingJob> = {};

    switch (newStage) {
      case '1_open':
        newStatus = 'Open';
        break;
      case '2_ongoing':
        newStatus = 'Ongoing';
        break;
      case '3_waiting_signed_docs':
        newStatus = 'Waiting on Signed Docs';
        updates.waitingSignedDocsDate = job.waitingSignedDocsDate || new Date().toISOString().split('T')[0];
        break;
      case '4_submitted_billing':
        newStatus = 'Submitted to Billing Team';
        updates.submittedToBillingDate = job.submittedToBillingDate || new Date().toISOString().split('T')[0];
        break;
      case '5_ses_submitted':
        newStatus = 'SES Submitted';
        updates.sesSubmittedDate = job.sesSubmittedDate || new Date().toISOString().split('T')[0];
        break;
    }

    const updatedJob: DrillingJob = {
      ...job,
      ...updates,
      status: newStatus,
    };
    onSaveJob(updatedJob);
  };

  // CSV Parsing
  const parseCSVText = (text: string): DrillingJob[] => {
    const lines = text.split(/\r?\n/);
    const results: DrillingJob[] = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.toLowerCase().startsWith('job number') || line.toLowerCase().startsWith('job_number')) {
        continue;
      }
      const row: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          row.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      row.push(cur.trim());

      const jNum = (row[0] || '').trim();
      if (!jNum) continue;

      let invAmt: number | null = null;
      if (row[11]) {
        const p = parseFloat(row[11].replace(/,/g, '').trim());
        if (!isNaN(p)) invAmt = p;
      }

      const rawStatus = (row[6] || '').trim();
      let status: JobLifecycleStatus = 'Completed';
      const sLower = rawStatus.toLowerCase();
      if (sLower === 'ongoing' || sLower === 'active' || sLower === 'open') {
        status = 'Ongoing';
      } else if (sLower === 'invoiced' || (row[9] && row[9].trim())) {
        status = 'Final invoiced';
      } else if (sLower === 'closed') {
        status = 'Closed';
      }

      results.push({
        id: jNum,
        rig: (row[1] || '').trim() || 'RIG-EMDAD',
        well: (row[2] || '').trim() || '—',
        contract: (row[3] || '').trim(),
        client: (row[4] || '').trim() || 'ADNOC DRILLING',
        serviceType: (row[5] || '').trim() || 'Downhole Rental',
        status,
        mobDate: (row[7] || '').trim(),
        demobDate: (row[8] || '').trim(),
        legalInvoiceNumber: (row[9] || '').trim(),
        draftInvoiceNumber: (row[10] || '').trim(),
        invoiceAmount: invAmt,
        poNumber: (row[16] || '').trim(),
        cost: (row[17] || '').trim(),
        invoicingType: 'PerJob',
        currency: 'USD',
        createdBy: user?.name || 'Operations',
        createdDate: (row[7] || new Date().toISOString().split('T')[0]).trim(),
      });
    }
    return results;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvInputText(text);
      const parsed = parseCSVText(text);
      setCsvParsedPreview(parsed);
    };
    reader.readAsText(file);
  };

  const handleApplyCsv = () => {
    if (csvParsedPreview.length === 0) return;

    const jobMap = new Map<string, DrillingJob>();
    jobs.forEach((j) => {
      jobMap.set(j.id.trim().toUpperCase(), { ...j });
    });

    let updatedCount = 0;
    let newCount = 0;

    csvParsedPreview.forEach((pj) => {
      const key = pj.id.trim().toUpperCase();
      if (jobMap.has(key)) {
        const existing = jobMap.get(key)!;
        jobMap.set(key, {
          ...existing,
          ...pj,
          rig: pj.rig || existing.rig,
          well: pj.well && pj.well !== '—' ? pj.well : existing.well,
          contract: pj.contract || existing.contract,
          client: pj.client || existing.client,
          poNumber: pj.poNumber || existing.poNumber,
          legalInvoiceNumber: pj.legalInvoiceNumber || existing.legalInvoiceNumber,
          draftInvoiceNumber: pj.draftInvoiceNumber || existing.draftInvoiceNumber,
          invoiceAmount: pj.invoiceAmount !== null ? pj.invoiceAmount : existing.invoiceAmount,
        });
        updatedCount++;
      } else {
        jobMap.set(key, pj);
        newCount++;
      }
    });

    const mergedList = Array.from(jobMap.values());
    if (onBatchUpdateJobs) {
      onBatchUpdateJobs(mergedList);
    } else {
      mergedList.forEach((j) => onSaveJob(j));
    }

    setIsImportModalOpen(false);
    setCsvInputText('');
    setCsvParsedPreview([]);
    alert(`Successfully aligned jobs: ${updatedCount} updated, ${newCount} new jobs added (${mergedList.length} total).`);
  };

  const handleExportJobsCsv = () => {
    const headers = [
      'Job Number',
      'Rig',
      'Well',
      'Project Code / Contract',
      'Client',
      'Job Description / Service',
      'Lifecycle Stage #',
      'Lifecycle Stage Name',
      'Days In Current Stage',
      'Total Cycle Days',
      'Status Value',
      'Start Date (Mob)',
      'End Date (Demob)',
      'Legal Invoice No',
      'Draft Invoice No',
      'Invoiced Amount ($)',
      'PO Number',
      'DT Tools Dispatched',
      'RT Tools Returned',
      'Tools On Rig (Balance)',
      'Pending Signed DTs',
      'Pending Signed RTs',
    ];

    const rows = filteredAndSortedJobs.map((j) => {
      const st = getJobStats(j.id);
      const toolsOnRig = Math.max(0, st.dtCount - st.rtCount);
      const stage = resolveJobStage(j, st.dtCount, st.rtCount);
      const stageDef = STAGE_DEFINITIONS[stage];
      const lifecycle = calculateJobLifecycleMetrics(j, stage, st.dtBatches, st.rtBatches);

      return [
        `"${j.id}"`,
        `"${j.rig || ''}"`,
        `"${(j.well || '').replace(/"/g, '""')}"`,
        `"${j.contract || ''}"`,
        `"${(j.client || '').replace(/"/g, '""')}"`,
        `"${(j.serviceType || '').replace(/"/g, '""')}"`,
        stageDef.stepNumber,
        `"${stageDef.label}"`,
        lifecycle.currentStageDays,
        lifecycle.totalCycleDays,
        `"${j.status}"`,
        `"${formatJobDate(j.mobDate)}"`,
        `"${formatJobDate(j.demobDate)}"`,
        `"${j.legalInvoiceNumber || ''}"`,
        `"${j.draftInvoiceNumber || ''}"`,
        `"${j.invoiceAmount || 0}"`,
        `"${j.poNumber || ''}"`,
        st.dtCount,
        st.rtCount,
        toolsOnRig,
        lifecycle.pendingSignedDTCount,
        lifecycle.pendingSignedRTCount,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Emdad_Jobs_Lifecycle_Report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Enterprise badge component strictly aligned with the 6 lifecycle stages
  const renderStatusBadge = (jobOrStatus: DrillingJob | string, dtCount?: number, rtCount?: number) => {
    let stage: JobStageKey;
    if (typeof jobOrStatus === 'string') {
      const s = jobOrStatus.toLowerCase().trim();
      if (s === 'open' || s === 'draft') stage = '1_open';
      else if (s === 'ongoing' || s === 'active') stage = '2_ongoing';
      else if (s === 'completed' || s === 'job completed' || s.includes('final invoiced') || s === 'closed') stage = '6_completed';
      else if (s.includes('waiting signed docs') || s.includes('waiting docs')) stage = '3_waiting_signed_docs';
      else if (s.includes('billing') || s.includes('submitted to billing')) stage = '4_submitted_billing';
      else if (s.includes('ses') || s.includes('draft invoice') || s.includes('draft invoiced')) stage = '5_ses_submitted';
      else stage = '1_open';
    } else {
      const st = dtCount !== undefined && rtCount !== undefined ? { dtCount, rtCount } : getJobStats(jobOrStatus.id);
      stage = resolveJobStage(jobOrStatus, st.dtCount, st.rtCount);
    }

    const def = STAGE_DEFINITIONS[stage];

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border transition-all whitespace-nowrap ${def.badgeBg} ${def.badgeText} ${def.badgeBorder}`}
        title={`${def.label} — ${def.description}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${def.dotColor} ${stage === '2_ongoing' ? 'animate-pulse' : ''}`} />
        <span>{def.shortLabel}</span>
      </span>
    );
  };

  return (
    <div className="space-y-3 w-full">
      {/* Executive Command Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1a3055] text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
            <Activity className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-[#1a3055] tracking-tight">
                Drilling Jobs Management Register
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {metrics.total.toLocaleString()} Total Jobs
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Unified 6-stage operational pipeline, pending document verification, and commercial clearance.
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="h-7.5 px-3 rounded bg-white text-slate-700 border border-slate-300 font-semibold text-xs hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title="Refresh live data from server"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
              <span>Refresh</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportJobsCsv}
            className="h-7.5 px-3 rounded bg-white text-slate-700 border border-slate-300 font-semibold text-xs hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Download CSV of current jobs with aligned DT/RT counts"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export CSV</span>
          </button>

          {canEdit && (
            <button
              onClick={onOpenNewJobModal}
              className="h-7.5 px-3.5 rounded bg-[#1a3055] text-white font-semibold text-xs hover:bg-[#24426d] transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>New Drilling Job</span>
            </button>
          )}
        </div>
      </div>

      {isReadOnly && <ReadOnlyBanner role={user?.role} moduleName="Drilling Jobs Management" />}

      {/* EXECUTIVE LIFECYCLE KPI RIBBON */}
      <div className="bg-white border border-slate-200/90 rounded-lg p-2 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center flex-wrap gap-1.5 text-xs">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mr-1 hidden sm:inline">
            Lifecycle:
          </span>

          {/* All Jobs */}
          <button
            type="button"
            onClick={() => {
              setTab('all');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 ${
              tab === 'all'
                ? 'bg-[#1a3055] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>All Jobs</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              tab === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800'
            }`}>
              {metrics.total.toLocaleString()}
            </span>
          </button>

          <span className="text-slate-300 text-xs hidden md:inline">➔</span>

          {/* Stage 1: Open */}
          <button
            type="button"
            onClick={() => {
              setTab(tab === '1_open' ? 'all' : '1_open');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 ${
              tab === '1_open'
                ? 'bg-slate-800 text-white shadow-2xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>Open</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              tab === '1_open' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {metrics.counts['1_open'] || 0}
            </span>
          </button>

          <span className="text-slate-300 text-xs hidden md:inline">➔</span>

          {/* Stage 2: Ongoing */}
          <button
            type="button"
            onClick={() => {
              setTab(tab === '2_ongoing' ? 'all' : '2_ongoing');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 ${
              tab === '2_ongoing'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-blue-50/60 text-blue-900 hover:bg-blue-100 border border-blue-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>Ongoing</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
              tab === '2_ongoing' ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-800'
            }`}>
              {metrics.counts['2_ongoing'] || 0}
            </span>
          </button>

          <span className="text-slate-300 text-xs hidden md:inline">➔</span>

          {/* Stage 3: Waiting Docs */}
          <button
            type="button"
            onClick={() => {
              setTab(tab === '3_waiting_signed_docs' ? 'all' : '3_waiting_signed_docs');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 ${
              tab === '3_waiting_signed_docs'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-rose-50/60 text-rose-900 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span>Waiting Docs</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              tab === '3_waiting_signed_docs' ? 'bg-white/25 text-white' : 'bg-rose-100 text-rose-800'
            }`}>
              {metrics.counts['3_waiting_signed_docs'] || 0}
            </span>
          </button>

          <span className="text-slate-300 text-xs hidden md:inline">➔</span>

          {/* Stage 4: In Billing */}
          <button
            type="button"
            onClick={() => {
              setTab(tab === '4_submitted_billing' ? 'all' : '4_submitted_billing');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 ${
              tab === '4_submitted_billing'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-amber-50/60 text-amber-900 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>In Billing</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              tab === '4_submitted_billing' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-900'
            }`}>
              {metrics.counts['4_submitted_billing'] || 0}
            </span>
          </button>

          <span className="text-slate-300 text-xs hidden md:inline">➔</span>

          {/* Stage 5: Under SES */}
          <button
            type="button"
            onClick={() => {
              setTab(tab === '5_ses_submitted' ? 'all' : '5_ses_submitted');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 ${
              tab === '5_ses_submitted'
                ? 'bg-purple-600 text-white shadow-2xs'
                : 'bg-purple-50/60 text-purple-900 hover:bg-purple-100 border border-purple-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span>Under SES</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              tab === '5_ses_submitted' ? 'bg-white/25 text-white' : 'bg-purple-100 text-purple-800'
            }`}>
              {metrics.counts['5_ses_submitted'] || 0}
            </span>
          </button>

          <span className="text-slate-300 text-xs hidden md:inline">➔</span>

          {/* Stage 6: Completed */}
          <button
            type="button"
            onClick={() => {
              setTab(tab === '6_completed' ? 'all' : '6_completed');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 ${
              tab === '6_completed'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'bg-emerald-50/60 text-emerald-900 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span>Completed</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              tab === '6_completed' ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {(metrics.counts['6_completed'] || 0).toLocaleString()}
            </span>
          </button>
        </div>

        {/* Right side fleet metrics */}
        <div className="flex items-center gap-2 text-xs text-slate-600 shrink-0">
          <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-medium">
            Active on Rigs: <strong className="text-blue-700 font-mono font-bold">{metrics.totalToolsOnRigs}</strong> tools
          </span>
        </div>
      </div>

      {/* CONSOLIDATED EXECUTIVE TOOLBAR: Rig Combo + Client Combo + Search + Density */}
      <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex items-center flex-1 sm:max-w-xs min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search Job #, Rig, Well, Client, PO..."
              className="w-full bg-slate-50 border border-slate-300 rounded pl-8 pr-7 h-7.5 text-xs outline-none font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#1a3055] focus:ring-1 focus:ring-[#1a3055] transition"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  setCurrentPage(1);
                }}
                className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Rig Searchable Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">Rig:</span>
            <SearchableSelect
              options={rigSelectOptions}
              value={selectedRigFilter}
              onChange={(val) => {
                setSelectedRigFilter(val);
                setCurrentPage(1);
              }}
              allOptionLabel={`All Rigs (${uniqueRigs.length})`}
              allOptionValue="all"
              searchPlaceholder="Search rig (e.g. 137, HAIL)..."
              buttonClassName="h-7.5 bg-slate-50 border-slate-300 min-w-[130px] max-w-[180px]"
            />
          </div>

          {/* Client / Operator Searchable Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">Client:</span>
            <SearchableSelect
              options={clientSelectOptions}
              value={selectedClientFilter}
              onChange={(val) => {
                setSelectedClientFilter(val);
                setCurrentPage(1);
              }}
              allOptionLabel={`All Clients (${uniqueClients.length})`}
              allOptionValue="all"
              searchPlaceholder="Search client..."
              buttonClassName="h-7.5 bg-slate-50 border-slate-300 min-w-[140px] max-w-[210px]"
            />
          </div>

          {/* Active Filter Clear Tag */}
          {(tab !== 'all' || selectedRigFilter !== 'all' || selectedClientFilter !== 'all' || search.trim() !== '') && (
            <button
              onClick={() => {
                setTab('all');
                setSelectedRigFilter('all');
                setSelectedClientFilter('all');
                setSearch('');
                setCurrentPage(1);
              }}
              className="h-7.5 px-2.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
              title="Reset all active filters"
            >
              <X className="w-3 h-3 text-slate-500" />
              <span>Clear Filters</span>
            </button>
          )}
        </div>

        {/* Right Controls: Total Result Count & Density Toggle */}
        <div className="flex items-center gap-3">
          <div className="text-[11px] text-slate-500 whitespace-nowrap">
            Showing <strong className="text-slate-800">{filteredAndSortedJobs.length.toLocaleString()}</strong> jobs
          </div>

          {/* Density Switcher */}
          <div className="flex items-center border border-slate-200 rounded p-0.5 bg-slate-100 text-[11px]">
            <button
              onClick={() => setDensity('compact')}
              className={`px-2 py-0.5 rounded cursor-pointer transition font-medium ${
                density === 'compact' ? 'bg-white text-[#1a3055] shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Compact density (more rows on screen)"
            >
              Compact
            </button>
            <button
              onClick={() => setDensity('comfortable')}
              className={`px-2 py-0.5 rounded cursor-pointer transition font-medium ${
                density === 'comfortable' ? 'bg-white text-[#1a3055] shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Comfortable density"
            >
              Comfortable
            </button>
          </div>
        </div>
      </div>

      {/* Main High-Density Jobs Data Grid */}
      <div className="bg-white border border-slate-200 rounded-md shadow-xs overflow-hidden w-full">
        <div className="overflow-auto w-full max-h-[68vh] relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px] font-bold select-none uppercase tracking-wider">
              <tr>
                {/* 1. Job # */}
                <th
                  onClick={() => handleSortToggle('id')}
                  style={{ width: jobsResizer.widths.id || 130 }}
                  className="sticky left-0 z-30 bg-slate-100 px-3 py-2 cursor-pointer hover:bg-slate-200 whitespace-nowrap border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] relative"
                >
                  <div className="flex items-center gap-1">
                    <span>Job #</span>
                    {sortField === 'id' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('id', e)} />
                </th>

                {/* 2. Client */}
                <th
                  onClick={() => handleSortToggle('client')}
                  style={{ width: jobsResizer.widths.client || 150 }}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap relative"
                >
                  <div className="flex items-center gap-1">
                    <span>Client</span>
                    {sortField === 'client' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('client', e)} />
                </th>

                {/* 3. Project */}
                <th
                  style={{ width: jobsResizer.widths.project || 110 }}
                  className="px-2.5 py-2 whitespace-nowrap relative"
                >
                  <span>Project</span>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('project', e)} />
                </th>

                {/* 3b. Sub-Division (Plain unstyled column, no colors, no wrap) */}
                <th
                  style={{ width: jobsResizer.widths.subDivision || 100 }}
                  className="px-2.5 py-2 whitespace-nowrap relative"
                >
                  <span>Sub-Division</span>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('subDivision', e)} />
                </th>

                {/* 4. Rig */}
                <th
                  onClick={() => handleSortToggle('rig')}
                  style={{ width: jobsResizer.widths.rig || 100 }}
                  className="px-2.5 py-2 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap relative"
                >
                  <div className="flex items-center gap-1">
                    <span>Rig</span>
                    {sortField === 'rig' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('rig', e)} />
                </th>

                {/* 5. Well */}
                <th
                  style={{ width: jobsResizer.widths.well || 100 }}
                  className="px-2.5 py-2 whitespace-nowrap relative"
                >
                  <span>Well</span>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('well', e)} />
                </th>

                {/* 6. PO Number */}
                <th
                  style={{ width: jobsResizer.widths.poNumber || 120 }}
                  className="px-2.5 py-2 whitespace-nowrap relative"
                >
                  <span>PO Number</span>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('poNumber', e)} />
                </th>

                {/* 7. Job Start Date */}
                <th
                  onClick={() => handleSortToggle('startDate')}
                  style={{ width: jobsResizer.widths.startDate || 110 }}
                  className="px-2.5 py-2 text-center cursor-pointer hover:bg-slate-200/70 whitespace-nowrap relative"
                  title="First Delivery Ticket date (or Mob Date)"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Job Start Date</span>
                    {sortField === 'startDate' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('startDate', e)} />
                </th>

                {/* 8. Job End Date */}
                <th
                  onClick={() => handleSortToggle('endDate')}
                  style={{ width: jobsResizer.widths.endDate || 110 }}
                  className="px-2.5 py-2 text-center cursor-pointer hover:bg-slate-200/70 whitespace-nowrap relative"
                  title="Last Receiving Ticket date (or Demob Date)"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Job End Date</span>
                    {sortField === 'endDate' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('endDate', e)} />
                </th>

                {/* 9. Job Value */}
                <th
                  onClick={() => handleSortToggle('value')}
                  style={{ width: jobsResizer.widths.value || 120 }}
                  className="px-2.5 py-2 text-right cursor-pointer hover:bg-slate-200/70 whitespace-nowrap relative"
                  title="Job billing value / invoice amount"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Job Value</span>
                    {sortField === 'value' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('value', e)} />
                </th>

                {/* 10. Legal / Invoice NO */}
                <th
                  style={{ width: jobsResizer.widths.legalInvoice || 140 }}
                  className="px-2.5 py-2 whitespace-nowrap relative"
                >
                  <span>Legal / Invoice NO</span>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('legalInvoice', e)} />
                </th>

                {/* 11. Current Status */}
                <th
                  onClick={() => handleSortToggle('stage')}
                  style={{ width: jobsResizer.widths.stage || 130 }}
                  className="px-2.5 py-2 text-center cursor-pointer hover:bg-slate-200/70 whitespace-nowrap relative"
                  title="Click to sort by status"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Current Status</span>
                    {sortField === 'stage' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('stage', e)} />
                </th>

                {/* 12. Stage Aging */}
                <th
                  onClick={() => handleSortToggle('stageDays')}
                  style={{ width: jobsResizer.widths.stageDays || 95 }}
                  className="px-2.5 py-2 text-center cursor-pointer hover:bg-slate-200/70 whitespace-nowrap relative"
                  title="Recorded duration in current stage"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Stage Aging</span>
                    {sortField === 'stageDays' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('stageDays', e)} />
                </th>

                {/* Custom Columns (Live Admin Defined) */}
                {jobsCustomCols.map((c) => (
                  <th
                    key={c.key}
                    style={{ width: jobsResizer.widths[c.key] || c.width || 130 }}
                    className="px-2.5 py-2 whitespace-nowrap relative bg-indigo-50/50 text-indigo-950 font-bold border-l border-indigo-200"
                    title={`Custom Column: ${c.label}`}
                  >
                    <span>{c.label}</span>
                    <ResizerHandle onMouseDown={(e) => jobsResizer.startResize(c.key, e)} />
                  </th>
                ))}

                {/* 13. Actions */}
                <th
                  style={{ width: jobsResizer.widths.actions || 130 }}
                  className="px-3 py-2 text-right whitespace-nowrap pr-3.5 relative"
                >
                  <span>Actions</span>
                  <ResizerHandle onMouseDown={(e) => jobsResizer.startResize('actions', e)} />
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={14 + jobsCustomCols.length} className="py-12 text-center text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <FileSpreadsheet className="w-8 h-8 text-slate-300" />
                      <div className="font-semibold text-slate-700">No drilling jobs found</div>
                      <div className="text-xs text-slate-400">
                        Try resetting your search query, rig filter, or status tab.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedJobs.map((job) => {
                  const st = getJobStats(job.id);
                  const dtToolsCount = st.dtCount;
                  const rtToolsCount = st.rtCount;
                  const toolsOnRig = Math.max(0, dtToolsCount - rtToolsCount);
                  const padY = density === 'compact' ? 'py-1.5' : 'py-2.5';
                  const stage = resolveJobStage(job, dtToolsCount, rtToolsCount);
                  const lifecycleMetrics = calculateJobLifecycleMetrics(job, stage, st.dtBatches, st.rtBatches);
                  const isActive = ['1_open', '2_ongoing'].includes(stage);
                  const startDate = getJobStartDate(job, st.dtBatches);
                  const endDate = getJobEndDate(job, st.rtBatches);

                  return (
                    <tr
                      key={job.id}
                      className="hover:bg-blue-50/40 transition-colors group"
                    >
                      {/* 1. Job # */}
                      <td className={`px-3 ${padY} whitespace-nowrap align-middle sticky left-0 bg-white group-hover:bg-slate-50 z-20 w-[130px] min-w-[130px] max-w-[130px] border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]`}>
                        <button
                          onClick={() => setDossierJob(job)}
                          className="font-mono font-medium text-[#1a3055] group-hover:text-blue-700 text-xs tracking-tight transition cursor-pointer text-left select-all hover:underline"
                          title="Click to open Job File"
                        >
                          {job.id}
                        </button>
                      </td>

                      {/* 2. Client */}
                      <td className={`px-3 ${padY} align-middle text-xs text-slate-800 truncate min-w-[140px] max-w-[180px]`} title={job.client || 'ADNOC Drilling'}>
                        {job.client || 'ADNOC Drilling'}
                      </td>

                      {/* 3. Project / Contract (Single clean line, no wrap) */}
                      <td className={`px-2.5 ${padY} align-middle font-mono text-xs text-slate-700 whitespace-nowrap`} title={job.contract || '—'}>
                        {job.contract || '—'}
                      </td>

                      {/* 3b. Sub-Division (Separate plain column, no badge colors, no wrap) */}
                      <td className={`px-2.5 ${padY} align-middle text-xs font-semibold text-slate-800 whitespace-nowrap uppercase`}>
                        {job.subDivision || resolveContractSubDivision(job.contract) || '—'}
                      </td>

                      {/* 4. Rig */}
                      <td className={`px-2.5 ${padY} align-middle text-xs font-medium text-slate-900 whitespace-nowrap`}>
                        {job.rig || '—'}
                      </td>

                      {/* 5. Well */}
                      <td className={`px-2.5 ${padY} align-middle text-xs text-slate-700 whitespace-nowrap`}>
                        {job.well && job.well !== '—' && job.well !== '-' ? job.well : '—'}
                      </td>

                      {/* 6. PO Number */}
                      <td className={`px-2.5 ${padY} font-mono text-xs text-slate-700 whitespace-nowrap align-middle`}>
                        {job.poNumber ? job.poNumber : <span className="text-slate-300">—</span>}
                      </td>

                      {/* 7. Job Start Date */}
                      <td className={`px-2.5 ${padY} text-center font-mono text-xs text-slate-700 whitespace-nowrap align-middle`}>
                        {formatJobDate(startDate) === '—' ? <span className="text-slate-300">—</span> : formatJobDate(startDate)}
                      </td>

                      {/* 8. Job End Date */}
                      <td className={`px-2.5 ${padY} text-center font-mono text-xs text-slate-700 whitespace-nowrap align-middle`}>
                        {formatJobDate(endDate) === '—' ? <span className="text-slate-300">—</span> : formatJobDate(endDate)}
                      </td>

                      {/* 9. Job Value */}
                      <td className={`px-2.5 ${padY} text-right font-mono text-xs whitespace-nowrap align-middle`}>
                        {(() => {
                          const val = job.invoiceAmount || (typeof job.cost === 'number' ? job.cost : parseFloat(String(job.cost || '').replace(/[^0-9.-]/g, '')) || 0);
                          if (typeof val === 'number' && !isNaN(val) && val !== 0) {
                            const isNeg = val < 0;
                            return (
                              <span className={isNeg ? 'font-bold text-rose-600 text-xs' : 'font-medium text-slate-900 text-xs'}>
                                {isNeg
                                  ? `-$${Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              </span>
                            );
                          }
                          return <span className="text-slate-300">—</span>;
                        })()}
                      </td>

                      {/* 10. Legal / Invoice NO */}
                      <td className={`px-2.5 ${padY} font-mono text-xs whitespace-nowrap align-middle`}>
                        {job.legalInvoiceNumber && isLegalInvoiceNumber(job.legalInvoiceNumber) ? (
                          <span className="font-medium text-slate-800 text-xs" title={job.legalInvoiceNumber}>
                            {job.legalInvoiceNumber.split(',')[0].trim()}
                            {job.legalInvoiceNumber.includes(',') && ` +${job.legalInvoiceNumber.split(',').length - 1}`}
                          </span>
                        ) : job.draftInvoiceNumber || (job.legalInvoiceNumber && !isLegalInvoiceNumber(job.legalInvoiceNumber)) ? (
                          <span className="text-slate-500 text-[11px]" title="ERP Billing Document (Under Approval)">
                            ERP #{job.draftInvoiceNumber || job.legalInvoiceNumber}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* 11. Current Status (Clean text + subtle dot, no lock icons) */}
                      <td className={`px-2.5 ${padY} text-center whitespace-nowrap align-middle`}>
                        {isLegalInvoiceNumber(job.legalInvoiceNumber) || stage === '6_completed' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>Completed</span>
                          </span>
                        ) : stage === '2_ongoing' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            <span>Ongoing</span>
                          </span>
                        ) : stage === '5_ses_submitted' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-purple-700 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                            <span>Under SES</span>
                          </span>
                        ) : stage === '4_submitted_billing' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-amber-800 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span>In Billing</span>
                          </span>
                        ) : stage === '3_waiting_signed_docs' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-rose-700 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span>Waiting Docs</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            <span>Open</span>
                          </span>
                        )}
                      </td>

                      {/* 12. Stage Aging (Single clean duration line) */}
                      <td className={`px-2.5 ${padY} text-center font-mono text-xs whitespace-nowrap align-middle`}>
                        <span
                          className={stage === '3_waiting_signed_docs' && lifecycleMetrics.currentStageDays > 0 ? 'text-amber-800 font-medium' : 'text-slate-700'}
                          title={`${lifecycleMetrics.currentStageDays} days in stage: ${STAGE_DEFINITIONS[stage].label}`}
                        >
                          {lifecycleMetrics.currentStageDays}d
                        </span>
                      </td>

                      {/* Custom Columns Cells */}
                      {jobsCustomCols.map((c) => {
                        const val = (job as any)[c.key] ?? (job as any).customFields?.[c.key];
                        return (
                          <td
                            key={c.key}
                            className={`px-2.5 ${padY} text-xs text-slate-700 whitespace-nowrap align-middle border-l border-slate-100 font-mono`}
                          >
                            {val !== undefined && val !== null && String(val).trim() !== ''
                              ? String(val)
                              : <span className="text-slate-300 font-sans">—</span>}
                          </td>
                        );
                      })}

                      {/* 13. Actions */}
                      <td className={`px-3 ${padY} text-right whitespace-nowrap align-middle pr-3.5`}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDossierJob(job)}
                            className="h-6 px-2.5 rounded bg-blue-50 hover:bg-[#1a3055] hover:text-white text-blue-900 font-medium text-[11px] transition-colors border border-blue-200 cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="Open Job File (Dossier, DTs, RTs, Tools & Commercials)"
                          >
                            <span>🗂️</span>
                            <span>Job File</span>
                          </button>
                          <button
                            onClick={() => setSelectedToolsJobId(job.id)}
                            className="h-6 px-2 rounded bg-sky-50 hover:bg-sky-600 hover:text-white text-sky-800 font-medium text-[11px] transition-colors border border-sky-200 cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="Open Tools List (Dispatched vs Returned)"
                          >
                            <span>📋</span>
                            <span>Tools</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Compact Pagination Bar */}
        {filteredAndSortedJobs.length > 0 && (
          <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-slate-300 rounded px-1.5 py-0.5 bg-white font-medium outline-none text-xs"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={0}>All ({filteredAndSortedJobs.length})</option>
              </select>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">
                Showing{' '}
                <strong className="text-slate-800">
                  {pageSize === 0 ? 1 : Math.min((currentPage - 1) * pageSize + 1, filteredAndSortedJobs.length)}
                </strong>{' '}
                to{' '}
                <strong className="text-slate-800">
                  {pageSize === 0 ? filteredAndSortedJobs.length : Math.min(currentPage * pageSize, filteredAndSortedJobs.length)}
                </strong>{' '}
                of <strong className="text-slate-800">{filteredAndSortedJobs.length.toLocaleString()}</strong> jobs
              </span>
            </div>

            {pageSize > 0 && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-6 px-2 rounded bg-white border border-slate-300 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-3 h-3" />
                  <span>Prev</span>
                </button>
                <span className="px-2 font-medium text-slate-600">
                  Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-6 px-2 rounded bg-white border border-slate-300 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition cursor-pointer flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CSV Import / Synchronization Modal */}
      {isImportModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsImportModalOpen(false);
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-bold text-sm">Import &amp; Align Drilling Jobs (CSV)</h3>
                <div className="text-[11px] text-blue-200">
                  Upload complete job details spreadsheet with job numbers, rigs, wells, POs, and invoices.
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              {/* File Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 rounded-lg p-6 text-center cursor-pointer transition"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv,text/csv"
                  className="hidden"
                />
                <FileSpreadsheet className="w-8 h-8 text-[#1a3055] mx-auto mb-1.5" />
                <div className="font-bold text-[#1a3055]">
                  {csvFileName ? `Selected: ${csvFileName}` : 'Click to select or drag & drop Jobs CSV spreadsheet'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Supports columns: Job Number, Rig, Well, Project Code, Client, Status, Start Date, End Date, Legal No, Invoice No, Amount, PO #
                </div>
              </div>

              {/* Direct Paste Alternative */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Or Paste CSV Text Directly:
                </label>
                <textarea
                  rows={4}
                  value={csvInputText}
                  onChange={(e) => {
                    setCsvInputText(e.target.value);
                    const parsed = parseCSVText(e.target.value);
                    setCsvParsedPreview(parsed);
                  }}
                  placeholder="Job Number,Rig,Well,Project Code,Client,Service,Status,Start Date,End Date,Legal No,Draft No,Amount,..."
                  className="w-full border rounded p-2 font-mono text-[11px] bg-slate-50"
                />
              </div>

              {/* Parsed Preview Table */}
              {csvParsedPreview.length > 0 && (
                <div className="border rounded p-3 bg-slate-50 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-700">
                      Parsed Preview: {csvParsedPreview.length} valid jobs identified
                    </span>
                    <span className="text-[10px] text-emerald-700 font-bold">
                      Ready to merge
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto border rounded bg-white">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                        <tr>
                          <th className="p-2">Job #</th>
                          <th className="p-2">Rig / Well</th>
                          <th className="p-2">Client</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Mob Date</th>
                          <th className="p-2">PO #</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {csvParsedPreview.slice(0, 10).map((pj, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 font-mono font-bold text-slate-900">{pj.id}</td>
                            <td className="p-2">
                              {pj.rig} {pj.well && pj.well !== '—' ? `[${pj.well}]` : ''}
                            </td>
                            <td className="p-2">{pj.client}</td>
                            <td className="p-2">{renderStatusBadge(pj.status)}</td>
                            <td className="p-2 font-mono">{formatJobDate(pj.mobDate)}</td>
                            <td className="p-2 font-mono">{pj.poNumber || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvParsedPreview.length > 10 && (
                    <div className="text-slate-500 text-center text-[10px]">
                      ...and {csvParsedPreview.length - 10} more rows ready to sync.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2 flex-shrink-0 text-xs">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
              >
                Close
              </button>
              {csvParsedPreview.length > 0 && (
                <button
                  type="button"
                  onClick={handleApplyCsv}
                  className="px-4 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow cursor-pointer"
                >
                  Confirm &amp; Align Jobs &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Job Modal */}
      {isNewJobModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseNewJobModal();
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <h3 className="font-bold text-sm">Create New Drilling Job</h3>
              <button
                onClick={onCloseNewJobModal}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateJobSubmit} className="p-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Rig Identification *</label>
                    {user?.role === 'Admin' && (
                      <button
                        type="button"
                        onClick={() => setAdminModalKey('rigs')}
                        className="text-[10px] text-blue-700 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                      >
                        <SettingsIcon className="w-2.5 h-2.5" />
                        <span>Manage</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    list="job-rigs-list"
                    value={newRig}
                    onChange={(e) => setNewRig(e.target.value)}
                    placeholder="e.g. AD-33, ND-19, RIG-8"
                    required
                    className="w-full border rounded px-3 py-1.5"
                  />
                  <datalist id="job-rigs-list">
                    {computedRigsList.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Well Identifier *</label>
                    {user?.role === 'Admin' && (
                      <button
                        type="button"
                        onClick={() => setAdminModalKey('wells')}
                        className="text-[10px] text-blue-700 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                      >
                        <SettingsIcon className="w-2.5 h-2.5" />
                        <span>Manage</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    list="job-wells-list"
                    value={newWell}
                    onChange={(e) => setNewWell(e.target.value)}
                    placeholder="e.g. GH-0023, BUH-412"
                    required
                    className="w-full border rounded px-3 py-1.5"
                  />
                  <datalist id="job-wells-list">
                    {computedWellsList.map((w) => (
                      <option key={w} value={w} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Operator / Client *</label>
                    {user?.role === 'Admin' && (
                      <button
                        type="button"
                        onClick={() => setAdminModalKey('clients')}
                        className="text-[10px] text-blue-700 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                      >
                        <SettingsIcon className="w-2.5 h-2.5" />
                        <span>Manage</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    list="job-clients-list"
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    placeholder="e.g. ADNOC Onshore, ADNOC Drilling"
                    required
                    className="w-full border rounded px-3 py-1.5"
                  />
                  <datalist id="job-clients-list">
                    {clientsList.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contract / Project Code</label>
                  <input
                    type="text"
                    value={newContract}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewContract(val);
                      const resolved = resolveContractSubDivision(val);
                      if (resolved) setNewSubDivision(resolved);
                    }}
                    placeholder="e.g. 4700018368"
                    className="w-full border rounded px-3 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Sub-Division (P&amp;L Sector) *</label>
                    {user?.role === 'Admin' && (
                      <button
                        type="button"
                        onClick={() => setAdminModalKey('subDivisions')}
                        className="text-[10px] text-blue-700 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                      >
                        <SettingsIcon className="w-2.5 h-2.5" />
                        <span>Manage</span>
                      </button>
                    )}
                  </div>
                  <select
                    value={newSubDivision}
                    onChange={(e) => setNewSubDivision(e.target.value as SubDivision)}
                    className="w-full border rounded px-3 py-1.5 font-semibold text-slate-800 bg-white"
                  >
                    {divisionsList.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">PO Number</label>
                  <input
                    type="text"
                    value={newPoNumber}
                    onChange={(e) => setNewPoNumber(e.target.value)}
                    placeholder="e.g. 4200361521"
                    className="w-full border rounded px-3 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mob Date (Planned)</label>
                  <input
                    type="date"
                    value={newMobDate}
                    onChange={(e) => setNewMobDate(e.target.value)}
                    className="w-full border rounded px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Hole Section</label>
                    {user?.role === 'Admin' && (
                      <button
                        type="button"
                        onClick={() => setAdminModalKey('holeSections')}
                        className="text-[10px] text-blue-700 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                      >
                        <SettingsIcon className="w-2.5 h-2.5" />
                        <span>Manage</span>
                      </button>
                    )}
                  </div>
                  <select
                    value={newHoleSection}
                    onChange={(e) => setNewHoleSection(e.target.value)}
                    className="w-full border rounded px-3 py-1.5 bg-white"
                  >
                    {holeSectionsList.map((hs) => (
                      <option key={hs} value={hs}>{hs} Section</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Service Type</label>
                    {user?.role === 'Admin' && (
                      <button
                        type="button"
                        onClick={() => setAdminModalKey('jobServiceCategories')}
                        className="text-[10px] text-blue-700 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                      >
                        <SettingsIcon className="w-2.5 h-2.5" />
                        <span>Manage</span>
                      </button>
                    )}
                  </div>
                  <select
                    value={newServiceType}
                    onChange={(e) => setNewServiceType(e.target.value)}
                    className="w-full border rounded px-3 py-1.5 bg-white"
                  >
                    {serviceTypesList.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={onCloseNewJobModal}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-xs cursor-pointer"
                >
                  Create Job &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Operational Job Detail Modal */}
      {selectedJobDetail && (
        <JobDetailModal
          job={selectedJobDetail}
          dtBatches={getJobStats(selectedJobDetail.id).dtBatches}
          rtBatches={getJobStats(selectedJobDetail.id).rtBatches}
          canEdit={canEdit}
          formatJobDate={formatJobDate}
          renderStatusBadge={renderStatusBadge}
          onOpenStatusModal={() => setEditingJobStatus(selectedJobDetail)}
          onOpenJobToolsList={onOpenJobToolsList}
          onClose={() => setSelectedJobDetail(null)}
        />
      )}

      {/* 6-Stage Job Lifecycle Status Update Modal with Days Recording & Mandatory Verification */}
      {editingJobStatus && (
        <JobStatusModal
          job={editingJobStatus}
          user={user}
          dtBatches={getJobStats(editingJobStatus.id).dtBatches}
          rtBatches={getJobStats(editingJobStatus.id).rtBatches}
          onSave={(updatedJob) => {
            onSaveJob(updatedJob);
            if (selectedJobDetail && selectedJobDetail.id === updatedJob.id) {
              setSelectedJobDetail(updatedJob);
            }
            setEditingJobStatus(null);
          }}
          onClose={() => setEditingJobStatus(null)}
        />
      )}

      {/* Dedicated Job File Modal Window (retains Drilling Jobs scroll, filters, and focus) */}
      {dossierJob && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-1 sm:p-3 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-[#dce6f1] rounded-lg shadow-2xl border border-[#9fb6cf] w-full max-w-[1550px] max-h-[96vh] flex flex-col overflow-hidden">
            <div className="overflow-y-auto flex-1">
              <JobDossierView
                job={dossierJob}
                user={user}
                jobs={jobs}
                dtBatches={dtBatches}
                rtBatches={rtBatches || []}
                callouts={callouts}
                inventory={inventory || []}
                contracts={contracts || []}
                inspections={inspections || []}
                customCategories={customCategories}
                customSizes={customSizes}
                isSyncing={isSyncing}
                onSaveJob={(updated) => {
                  onSaveJob(updated);
                  setDossierJob(updated);
                }}
                onRefresh={onRefresh}
                onSaveDTBatch={onSaveDTBatch || (() => {})}
                onUpdateDTBatch={onUpdateDTBatch}
                onDeleteDTBatch={onDeleteDTBatch}
                onSaveRTBatch={onSaveRTBatch || (() => {})}
                onUpdateRTBatch={onUpdateRTBatch}
                onSaveCallout={onSaveCallout}
                onBackToRegister={() => setDossierJob(null)}
                onNavigateToInvoicing={onNavigateToInvoicing}
                showToast={showToast || ((msg) => alert(msg))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Job Equipment & Tools List Modal Window (retains Drilling Jobs scroll, filters, and focus) */}
      {selectedToolsJobId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#1a3055] text-white px-4 py-2.5 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">Job Equipment &amp; Tools Reconciliation</span>
                <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded text-xs font-mono font-bold">
                  {selectedToolsJobId}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedToolsJobId(null)}
                className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              >
                <span>✕ Close / Back to Register</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3 overflow-y-auto flex-1 bg-slate-50">
              <JobToolsListView
                jobs={jobs}
                dtBatches={dtBatches}
                rtBatches={rtBatches || []}
                inventory={inventory || []}
                preSelectedJobId={selectedToolsJobId}
                showToast={showToast}
              />
            </div>
          </div>
        </div>
      )}

      {adminModalKey && (
        <AdminDropdownModal
          listKey={adminModalKey}
          user={user}
          isOpen={true}
          onClose={() => setAdminModalKey(null)}
          onChanged={() => {
            setDivisionsList(getDropdownOptions('subDivisions'));
            setHoleSectionsList(getDropdownOptions('holeSections'));
            setServiceTypesList(getDropdownOptions('jobServiceCategories'));
            setRigsList(getDropdownOptions('rigs'));
            setWellsList(getDropdownOptions('wells'));
            setClientsList(getDropdownOptions('clients'));
          }}
        />
      )}
    </div>
  );
};
