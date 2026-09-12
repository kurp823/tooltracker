import React, { useState, useMemo, useRef } from 'react';
import { DrillingJob, Callout, DTBatch, RTBatch, User, JobLifecycleStatus } from '../types';
import {
  JobStageKey,
  STAGE_DEFINITIONS,
  ALL_STAGE_KEYS,
  resolveJobStage,
  calculateJobLifecycleMetrics,
} from '../jobLifecycle';
import { JobStatusModal } from './JobStatusModal';
import { JobLifecycleStepper } from './JobLifecycleStepper';
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
} from 'lucide-react';

interface JobsViewProps {
  user?: User | null;
  jobs: DrillingJob[];
  callouts: Callout[];
  dtBatches: DTBatch[];
  rtBatches?: RTBatch[];
  onSaveJob: (job: DrillingJob) => void;
  onDispatchJob: (jobId: string) => void;
  onReceiveJob?: (jobId: string) => void;
  onBatchUpdateJobs?: (jobs: DrillingJob[]) => void;
  isNewJobModalOpen: boolean;
  onCloseNewJobModal: () => void;
  onOpenNewJobModal: () => void;
  selectedCalloutForNewJob?: Callout | null;
}

// Clean oilfield date formatter (handles ISO strings like 2023-09-09T00:00:00.000Z, YYYY-MM-DD, or DD-MMM-YY)
export const formatJobDate = (dateStr?: string | null): string => {
  if (!dateStr || dateStr.trim() === '' || dateStr.trim() === '—' || dateStr.trim() === '-') return '—';
  const clean = dateStr.trim();
  if (/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(clean)) return clean;

  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const yr = isoMatch[1].slice(-2);
    const mIndex = parseInt(isoMatch[2], 10) - 1;
    const day = isoMatch[3];
    if (mIndex >= 0 && mIndex < 12) {
      return `${day}-${months[mIndex]}-${yr}`;
    }
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const yr = String(d.getFullYear()).slice(-2);
      return `${day}-${months[d.getMonth()]}-${yr}`;
    }
  } catch {}

  return clean.split('T')[0];
};

// Normalize keys to allow cross-matching between Job-023-00002-1, Job-023-00002, and 023-00002
const normalizeJobKey = (str?: string): string => {
  if (!str) return '';
  return str
    .trim()
    .toUpperCase()
    .replace(/^JOB[-_]?/i, '')
    .replace(/[-_]1$/i, '')
    .replace(/[-_]01$/i, '');
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
  onSaveJob,
  onDispatchJob,
  onReceiveJob,
  onBatchUpdateJobs,
  isNewJobModalOpen,
  onCloseNewJobModal,
  onOpenNewJobModal,
  selectedCalloutForNewJob,
}) => {
  const [tab, setTab] = useState<'all' | JobStageKey>('all');
  const [search, setSearch] = useState('');
  const [selectedRigFilter, setSelectedRigFilter] = useState<string>('all');
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const [selectedJobDetail, setSelectedJobDetail] = useState<DrillingJob | null>(null);

  // Sorting State
  const [sortField, setSortField] = useState<'id' | 'client' | 'rig' | 'mobDate' | 'dtTools' | 'rtTools' | 'toolsOnRig' | 'stage' | 'stageDays'>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination State
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

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
  const [newPoNumber, setNewPoNumber] = useState(
    selectedCalloutForNewJob ? selectedCalloutForNewJob.poRef || '' : ''
  );
  const [newClientRef, setNewClientRef] = useState('');
  const [newHoleSection, setNewHoleSection] = useState('12-1/4"');
  const [newServiceType, setNewServiceType] = useState('Downhole Rental');
  const [newInvoicingType, setNewInvoicingType] = useState<'PerJob' | 'Monthly'>('PerJob');
  const [newCurrency, setNewCurrency] = useState('USD');
  const [newMobDate, setNewMobDate] = useState(new Date().toISOString().split('T')[0]);

  // Robust DT and RT tool count indexing with cross-normalized keys
  const jobToolStats = useMemo(() => {
    const stats = new Map<string, { dtCount: number; rtCount: number; dtBatches: DTBatch[]; rtBatches: RTBatch[] }>();

    const getBucket = (rawId?: string) => {
      const key = (rawId || '').trim().toUpperCase();
      if (!key) return null;
      if (!stats.has(key)) {
        stats.set(key, { dtCount: 0, rtCount: 0, dtBatches: [], rtBatches: [] });
      }
      return stats.get(key)!;
    };

    dtBatches.forEach((dt) => {
      const count = dt.toolLines?.length || 0;
      const exact1 = getBucket(dt.jobId);
      const exact2 = dt.jobNumber ? getBucket(dt.jobNumber) : null;
      const norm1 = getBucket(normalizeJobKey(dt.jobId));
      const norm2 = dt.jobNumber ? getBucket(normalizeJobKey(dt.jobNumber)) : null;

      const registered = new Set<any>();
      [exact1, exact2, norm1, norm2].forEach((b) => {
        if (b && !registered.has(b)) {
          registered.add(b);
          b.dtCount += count;
          b.dtBatches.push(dt);
        }
      });
    });

    rtBatches.forEach((rt) => {
      const count = rt.toolLines?.length || 0;
      const exact1 = getBucket(rt.jobId);
      const exact2 = rt.jobNumber ? getBucket(rt.jobNumber) : null;
      const norm1 = getBucket(normalizeJobKey(rt.jobId));
      const norm2 = rt.jobNumber ? getBucket(normalizeJobKey(rt.jobNumber)) : null;

      const registered = new Set<any>();
      [exact1, exact2, norm1, norm2].forEach((b) => {
        if (b && !registered.has(b)) {
          registered.add(b);
          b.rtCount += count;
          b.rtBatches.push(rt);
        }
      });
    });

    return stats;
  }, [dtBatches, rtBatches]);

  const getJobStats = (jobId: string) => {
    const rawKey = (jobId || '').trim().toUpperCase();
    const normKey = normalizeJobKey(jobId);
    return jobToolStats.get(rawKey) || jobToolStats.get(normKey) || { dtCount: 0, rtCount: 0, dtBatches: [], rtBatches: [] };
  };

  const handleSortToggle = (field: 'id' | 'client' | 'rig' | 'mobDate' | 'dtTools' | 'rtTools' | 'toolsOnRig' | 'stage' | 'stageDays') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Distinct rigs for quick filter dropdown
  const uniqueRigs = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      if (j.rig && j.rig.trim()) set.add(j.rig.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

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

    jobs.forEach((j) => {
      const st = getJobStats(j.id);
      const toolsOnRig = Math.max(0, st.dtCount - st.rtCount);
      totalToolsOnRigs += toolsOnRig;
      totalDispatched += st.dtCount;

      const stage = resolveJobStage(j, st.dtCount, st.rtCount);
      counts[stage] = (counts[stage] || 0) + 1;
    });

    return {
      total: jobs.length,
      counts,
      totalToolsOnRigs,
      totalDispatched,
    };
  }, [jobs, jobToolStats]);

  // Filtered and Sorted Jobs
  const filteredAndSortedJobs = useMemo(() => {
    const list = jobs.filter((j) => {
      const st = getJobStats(j.id);
      const stage = resolveJobStage(j, st.dtCount, st.rtCount);

      if (tab !== 'all' && stage !== tab) return false;

      if (selectedRigFilter !== 'all' && (j.rig || '').trim().toUpperCase() !== selectedRigFilter.toUpperCase()) {
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
        comparison = extractJobSeq(a.id) - extractJobSeq(b.id);
      } else if (sortField === 'client') {
        comparison = (a.client || '').localeCompare(b.client || '');
      } else if (sortField === 'rig') {
        comparison = (a.rig || '').localeCompare(b.rig || '');
      } else if (sortField === 'mobDate') {
        comparison = (a.mobDate || '').localeCompare(b.mobDate || '');
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
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [jobs, tab, search, selectedRigFilter, sortField, sortOrder, jobToolStats]);

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
      else if (s.includes('waiting signed docs') || s === 'completed' || s === 'job completed') stage = '3_waiting_signed_docs';
      else if (s.includes('billing') || s.includes('submitted to billing')) stage = '4_submitted_billing';
      else if (s.includes('ses') || s.includes('draft invoice') || s.includes('draft invoiced')) stage = '5_ses_submitted';
      else if (s.includes('final invoiced') || s === 'invoiced') stage = '6_completed';
      else stage = '1_open';
    } else {
      const st = dtCount !== undefined && rtCount !== undefined ? { dtCount, rtCount } : getJobStats(jobOrStatus.id);
      stage = resolveJobStage(jobOrStatus, st.dtCount, st.rtCount);
    }

    const def = STAGE_DEFINITIONS[stage];

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border transition-all shadow-2xs whitespace-nowrap ${def.badgeBg} ${def.badgeText} ${def.badgeBorder}`}
        title={`Stage ${def.stepNumber}: ${def.label} — ${def.description}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${def.dotColor} ${stage === '2_ongoing' ? 'animate-pulse' : ''}`} />
        <span className="font-mono text-[10px] opacity-80 font-bold">{def.stepNumber}.</span>
        <span>{def.shortLabel}</span>
      </span>
    );
  };

  return (
    <div className="space-y-2.5 w-full">
      {/* Enterprise Ribbon & Metric Strip */}
      <div className="bg-white border border-slate-200 rounded-md p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-[#1a3055] text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
            <Activity className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-[#1a3055] tracking-tight">
                Drilling Jobs Management
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                Master Register
              </span>
            </div>
            <div className="text-xs text-slate-500">
              Active rig operations, downhole tool balance on rigs (DT vs RT), and work order tracking.
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportJobsCsv}
            className="h-8 px-3 rounded bg-white text-slate-700 border border-slate-300 font-semibold text-xs hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Download CSV of current jobs with aligned DT/RT counts"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export CSV</span>
          </button>

          {user?.role !== 'Viewer' && (
            <button
              type="button"
              onClick={() => {
                setCsvInputText('');
                setCsvParsedPreview([]);
                setCsvFileName('');
                setIsImportModalOpen(true);
              }}
              className="h-8 px-3 rounded bg-emerald-700 text-white font-semibold text-xs hover:bg-emerald-800 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title="Upload and synchronize Jobs CSV"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-100" />
              <span>Import / Sync CSV</span>
            </button>
          )}

          {user?.role !== 'Viewer' && (
            <button
              onClick={onOpenNewJobModal}
              className="h-8 px-3.5 rounded bg-[#1a3055] text-white font-semibold text-xs hover:bg-[#24426d] transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>New Drilling Job</span>
            </button>
          )}
        </div>
      </div>

      {/* Operational KPI Micro-cards aligned with the 6 lifecycle stages */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <div className="bg-white border border-slate-200 rounded-md p-2 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">1. Open</div>
            <div className="text-sm font-extrabold text-slate-800 font-mono">{(metrics.counts['1_open'] || 0).toLocaleString()}</div>
            <div className="text-[9px] text-slate-400">No DT generated</div>
          </div>
          <Clock className="w-4 h-4 text-slate-400" />
        </div>

        <div className="bg-white border border-blue-200 bg-blue-50/20 rounded-md p-2 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-blue-700">2. Ongoing</div>
            <div className="text-sm font-extrabold text-blue-800 font-mono">{(metrics.counts['2_ongoing'] || 0).toLocaleString()}</div>
            <div className="text-[9px] text-blue-600">Tools on site</div>
          </div>
          <Truck className="w-4 h-4 text-blue-500" />
        </div>

        <div className="bg-white border border-amber-200 bg-amber-50/20 rounded-md p-2 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-amber-800">Tools On Rig</div>
            <div className="text-sm font-extrabold text-amber-900 font-mono">{metrics.totalToolsOnRigs.toLocaleString()}</div>
            <div className="text-[9px] text-amber-700">Field tool balance</div>
          </div>
          <Activity className="w-4 h-4 text-amber-600" />
        </div>

        <div className="bg-white border border-amber-300 bg-amber-50/40 rounded-md p-2 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-amber-900">3. Waiting Docs</div>
            <div className="text-sm font-extrabold text-amber-900 font-mono">{(metrics.counts['3_waiting_signed_docs'] || 0).toLocaleString()}</div>
            <div className="text-[9px] text-amber-700">Pending signed DT/RT</div>
          </div>
          <Clock className="w-4 h-4 text-amber-600" />
        </div>

        <div className="bg-white border border-indigo-200 bg-indigo-50/20 rounded-md p-2 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-indigo-700">4. In Billing</div>
            <div className="text-sm font-extrabold text-indigo-900 font-mono">{(metrics.counts['4_submitted_billing'] || 0).toLocaleString()}</div>
            <div className="text-[9px] text-indigo-600">Docs submitted</div>
          </div>
          <Send className="w-4 h-4 text-indigo-600" />
        </div>

        <div className="bg-white border border-purple-200 bg-purple-50/20 rounded-md p-2 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-purple-700">5. SES Submitted</div>
            <div className="text-sm font-extrabold text-purple-900 font-mono">{(metrics.counts['5_ses_submitted'] || 0).toLocaleString()}</div>
            <div className="text-[9px] text-purple-600">Draft / SES in review</div>
          </div>
          <Receipt className="w-4 h-4 text-purple-600" />
        </div>

        <div className="bg-white border border-emerald-200 bg-emerald-50/20 rounded-md p-2 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-emerald-700">6. Completed</div>
            <div className="text-sm font-extrabold text-emerald-900 font-mono">{(metrics.counts['6_completed'] || 0).toLocaleString()}</div>
            <div className="text-[9px] text-emerald-600">Legal invoiced</div>
          </div>
          <CheckCircle className="w-4 h-4 text-emerald-600" />
        </div>
      </div>

      {/* Control Toolbar: 6-Stage Filter Tabs + Rig Filter + Search + Density Toggle */}
      <div className="bg-white border border-slate-200 rounded-md p-2 shadow-xs flex flex-wrap items-center justify-between gap-2">
        {/* Segmented Filter Tabs */}
        <div className="flex bg-slate-100/90 rounded p-0.5 overflow-x-auto gap-0.5 border border-slate-200/80 max-w-full">
          <button
            onClick={() => {
              setTab('all');
              setCurrentPage(1);
            }}
            className={`h-7 px-2.5 rounded text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              tab === 'all'
                ? 'bg-white text-[#1a3055] shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>All Jobs</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${tab === 'all' ? 'bg-[#1a3055] text-white' : 'bg-slate-200 text-slate-600'}`}>
              {metrics.total}
            </span>
          </button>

          <button
            onClick={() => {
              setTab('1_open');
              setCurrentPage(1);
            }}
            className={`h-7 px-2.5 rounded text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              tab === '1_open'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>1. Open</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${tab === '1_open' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {metrics.counts['1_open'] || 0}
            </span>
          </button>

          <button
            onClick={() => {
              setTab('2_ongoing');
              setCurrentPage(1);
            }}
            className={`h-7 px-2.5 rounded text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              tab === '2_ongoing'
                ? 'bg-white text-blue-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>2. Ongoing</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${tab === '2_ongoing' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {metrics.counts['2_ongoing'] || 0}
            </span>
          </button>

          <button
            onClick={() => {
              setTab('3_waiting_signed_docs');
              setCurrentPage(1);
            }}
            className={`h-7 px-2.5 rounded text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              tab === '3_waiting_signed_docs'
                ? 'bg-white text-amber-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>3. Waiting Docs</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${tab === '3_waiting_signed_docs' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {metrics.counts['3_waiting_signed_docs'] || 0}
            </span>
          </button>

          <button
            onClick={() => {
              setTab('4_submitted_billing');
              setCurrentPage(1);
            }}
            className={`h-7 px-2.5 rounded text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              tab === '4_submitted_billing'
                ? 'bg-white text-indigo-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            <span>4. In Billing</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${tab === '4_submitted_billing' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {metrics.counts['4_submitted_billing'] || 0}
            </span>
          </button>

          <button
            onClick={() => {
              setTab('5_ses_submitted');
              setCurrentPage(1);
            }}
            className={`h-7 px-2.5 rounded text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              tab === '5_ses_submitted'
                ? 'bg-white text-purple-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span>5. SES Submitted</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${tab === '5_ses_submitted' ? 'bg-purple-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {metrics.counts['5_ses_submitted'] || 0}
            </span>
          </button>

          <button
            onClick={() => {
              setTab('6_completed');
              setCurrentPage(1);
            }}
            className={`h-7 px-2.5 rounded text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              tab === '6_completed'
                ? 'bg-white text-emerald-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            <span>6. Completed</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${tab === '6_completed' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {metrics.counts['6_completed'] || 0}
            </span>
          </button>
        </div>

        {/* Right Controls: Rig Selector, Search, Density Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Rig Filter Dropdown */}
          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2 h-7 text-xs">
            <Filter className="w-3 h-3 text-slate-400" />
            <select
              value={selectedRigFilter}
              onChange={(e) => {
                setSelectedRigFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-700 outline-none font-medium cursor-pointer text-xs pr-1"
            >
              <option value="all">All Rigs ({uniqueRigs.length})</option>
              {uniqueRigs.map((rig) => (
                <option key={rig} value={rig}>
                  Rig: {rig}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Filter Job #, Rig, Well, Client, PO..."
              className="bg-white border border-slate-300 rounded pl-7 pr-6 h-7 text-xs w-56 sm:w-64 outline-none font-medium text-slate-800 placeholder:text-slate-400 focus:border-[#1a3055] focus:ring-1 focus:ring-[#1a3055] transition"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  setCurrentPage(1);
                }}
                className="absolute right-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Density Switcher */}
          <div className="flex items-center border border-slate-200 rounded p-0.5 bg-slate-50 text-[11px]">
            <button
              onClick={() => setDensity('compact')}
              className={`px-2 py-0.5 rounded cursor-pointer transition font-medium ${
                density === 'compact' ? 'bg-white text-[#1a3055] shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Compact rows for high-density tabular view"
            >
              Compact
            </button>
            <button
              onClick={() => setDensity('comfortable')}
              className={`px-2 py-0.5 rounded cursor-pointer transition font-medium ${
                density === 'comfortable' ? 'bg-white text-[#1a3055] shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Comfortable spacing"
            >
              Comfortable
            </button>
          </div>
        </div>
      </div>

      {/* Main High-Density Jobs Data Grid */}
      <div className="bg-white border border-slate-200 rounded-md shadow-xs overflow-hidden w-full">
        <div className="overflow-x-auto w-full max-h-[68vh] relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs text-slate-700 border-b border-slate-200 text-[11px] font-bold select-none uppercase tracking-wider">
              <tr>
                <th
                  onClick={() => handleSortToggle('id')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap min-w-[125px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Job #</span>
                    {sortField === 'id' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>

                <th className="px-2.5 py-2 text-center whitespace-nowrap w-20">
                  Callout
                </th>

                <th
                  onClick={() => handleSortToggle('client')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap min-w-[180px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Client / Project</span>
                    {sortField === 'client' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSortToggle('rig')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap min-w-[170px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Rig / Well</span>
                    {sortField === 'rig' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>

                <th className="px-2.5 py-2 whitespace-nowrap min-w-[110px]">
                  PO Number
                </th>

                <th
                  onClick={() => handleSortToggle('mobDate')}
                  className="px-2.5 py-2 text-center cursor-pointer hover:bg-slate-200/70 whitespace-nowrap w-24"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Mob Date</span>
                    {sortField === 'mobDate' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSortToggle('dtTools')}
                  className="px-2 py-2 text-center cursor-pointer hover:bg-slate-200/70 whitespace-nowrap w-20 bg-blue-50/40"
                  title="Total tools dispatched on Delivery Tickets"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>DT Tools</span>
                    {sortField === 'dtTools' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-blue-700" /> : <ArrowUp className="w-3 h-3 text-blue-700" />
                    ) : null}
                  </div>
                </th>

                <th
                  onClick={() => handleSortToggle('rtTools')}
                  className="px-2 py-2 text-center cursor-pointer hover:bg-slate-200/70 whitespace-nowrap w-20 bg-emerald-50/40"
                  title="Total tools returned on Receiving Tickets"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>RT Tools</span>
                    {sortField === 'rtTools' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-emerald-700" /> : <ArrowUp className="w-3 h-3 text-emerald-700" />
                    ) : null}
                  </div>
                </th>

                <th
                  onClick={() => handleSortToggle('toolsOnRig')}
                  className="px-2 py-2 text-center cursor-pointer hover:bg-slate-200/70 whitespace-nowrap w-24 bg-amber-50/50"
                  title="Net downhole tool balance actively on rig (DT minus RT)"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Tools on Rig</span>
                    {sortField === 'toolsOnRig' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-amber-900" /> : <ArrowUp className="w-3 h-3 text-amber-900" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSortToggle('stage')}
                  className="px-2.5 py-2 text-center cursor-pointer hover:bg-slate-200/70 whitespace-nowrap min-w-[140px]"
                  title="Click to sort by the 6 standard lifecycle stages"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Lifecycle Stage</span>
                    {sortField === 'stage' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() => handleSortToggle('stageDays')}
                  className="px-2.5 py-2 text-center cursor-pointer hover:bg-slate-200/70 whitespace-nowrap min-w-[105px]"
                  title="Recorded duration in current stage & total cycle time"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Stage Aging</span>
                    {sortField === 'stageDays' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-[#1a3055]" /> : <ArrowUp className="w-3 h-3 text-[#1a3055]" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                    )}
                  </div>
                </th>

                <th className="px-2.5 py-2 whitespace-nowrap min-w-[125px]">
                  Legal Invoice NO
                </th>

                <th className="px-3 py-2 text-right whitespace-nowrap w-28 pr-3.5">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-500 font-medium">
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

                  return (
                    <tr
                      key={job.id}
                      className="hover:bg-blue-50/40 transition-colors group"
                    >
                      {/* Job # - Strict whitespace-nowrap, never wraps */}
                      <td className={`px-3 ${padY} whitespace-nowrap align-middle`}>
                        <button
                          onClick={() => setSelectedJobDetail(job)}
                          className="font-mono font-bold text-slate-900 group-hover:text-blue-700 text-xs tracking-tight transition cursor-pointer text-left select-all"
                          title="Click to view complete job details and tool ledger"
                        >
                          {job.id}
                        </button>
                      </td>

                      {/* Callout Ref */}
                      <td className={`px-2.5 ${padY} text-center font-mono text-[11px] text-slate-500 whitespace-nowrap align-middle`}>
                        {job.calloutId ? (
                          <span className="text-slate-700 font-medium">{job.calloutId}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Client / Project Code (Stacked hierarchy) */}
                      <td className={`px-3 ${padY} align-middle`}>
                        <div className="flex flex-col min-w-0 max-w-[210px]">
                          <span
                            className="font-semibold text-slate-900 text-xs truncate leading-tight"
                            title={job.client || 'ADNOC Drilling'}
                          >
                            {job.client || 'ADNOC Drilling'}
                          </span>
                          {job.contract && (
                            <span
                              className="text-[10px] font-mono text-slate-500 truncate leading-tight mt-0.5"
                              title={`Project / Contract Code: ${job.contract}`}
                            >
                              Code: {job.contract}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Rig / Well (Clean pill + well tag, no trailing pipes) */}
                      <td className={`px-3 ${padY} whitespace-nowrap align-middle`}>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-[11px] px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200/80 font-mono tracking-tight">
                            {job.rig || 'Rig Unassigned'}
                          </span>
                          {job.well && job.well !== '—' && job.well !== '-' && (
                            <span className="text-slate-600 font-mono text-[11px]">
                              {job.well}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* PO Number */}
                      <td className={`px-2.5 ${padY} font-mono text-[11px] text-slate-600 whitespace-nowrap align-middle`}>
                        {job.poNumber ? (
                          <span className="font-medium text-slate-800">{job.poNumber}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Mob Date (Clean formatted, never wraps) */}
                      <td className={`px-2.5 ${padY} text-center font-mono text-[11px] text-slate-600 whitespace-nowrap align-middle`}>
                        {formatJobDate(job.mobDate)}
                      </td>

                      {/* DT Tools Count */}
                      <td className={`px-2 ${padY} font-mono text-center text-xs whitespace-nowrap align-middle bg-blue-50/20`}>
                        {dtToolsCount > 0 ? (
                          <span className="font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            {dtToolsCount}
                          </span>
                        ) : (
                          <span className="text-slate-300 font-normal">0</span>
                        )}
                      </td>

                      {/* RT Tools Count */}
                      <td className={`px-2 ${padY} font-mono text-center text-xs whitespace-nowrap align-middle bg-emerald-50/20`}>
                        {rtToolsCount > 0 ? (
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            {rtToolsCount}
                          </span>
                        ) : (
                          <span className="text-slate-300 font-normal">0</span>
                        )}
                      </td>

                      {/* Tools on Rig (Balance) */}
                      <td className={`px-2 ${padY} text-center text-xs whitespace-nowrap align-middle bg-amber-50/30`}>
                        {toolsOnRig > 0 ? (
                          <span className="font-mono font-extrabold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 shadow-2xs inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                            {toolsOnRig}
                          </span>
                        ) : (
                          <span className="font-mono text-slate-300 text-xs">0</span>
                        )}
                      </td>

                      {/* 6-Stage Lifecycle Badge (Clickable to advance) */}
                      <td className={`px-2.5 ${padY} text-center whitespace-nowrap align-middle`}>
                        <button
                          type="button"
                          onClick={() => setEditingJobStatus(job)}
                          className="hover:scale-105 transition cursor-pointer text-left focus:outline-none"
                          title="Click to update or advance lifecycle stage"
                        >
                          {renderStatusBadge(job, dtToolsCount, rtToolsCount)}
                        </button>
                      </td>

                      {/* Stage Aging & Cycle Duration */}
                      <td className={`px-2.5 ${padY} text-center font-mono whitespace-nowrap align-middle`}>
                        <div className="flex flex-col items-center leading-tight">
                          <span
                            className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                              stage === '3_waiting_signed_docs' && lifecycleMetrics.currentStageDays > 3
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                                : 'text-slate-800'
                            }`}
                            title={`${lifecycleMetrics.currentStageDays} days in stage: ${STAGE_DEFINITIONS[stage].label}`}
                          >
                            {lifecycleMetrics.currentStageDays}d <span className="text-[10px] font-normal text-slate-500">in stage</span>
                          </span>
                          <span className="text-[9px] text-slate-400 font-sans">
                            {lifecycleMetrics.totalCycleDays}d total
                          </span>
                        </div>
                      </td>

                      {/* Legal Invoice NO */}
                      <td className={`px-2.5 ${padY} font-mono text-[11px] whitespace-nowrap align-middle`}>
                        {job.legalInvoiceNumber ? (
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-teal-900 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-300 text-[10px] shadow-2xs">
                              {job.legalInvoiceNumber.split(',')[0].trim()}
                            </span>
                            {job.legalInvoiceNumber.includes(',') && (
                              <span className="text-[10px] text-slate-400 font-sans">
                                +{job.legalInvoiceNumber.split(',').length - 1}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className={`px-3 ${padY} text-right whitespace-nowrap align-middle pr-3.5`}>
                        <div className="flex items-center justify-end gap-1">
                          {user?.role !== 'Viewer' && (
                            <button
                              onClick={() => setEditingJobStatus(job)}
                              className="h-6 px-1.5 rounded bg-[#1a3055] hover:bg-[#24426d] text-white font-semibold text-[10px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="Update / Advance Job Stage"
                            >
                              <ShieldCheck className="w-3 h-3 text-amber-400" />
                              <span>Stage</span>
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedJobDetail(job)}
                            className="h-6 px-1.5 rounded bg-slate-100 hover:bg-[#1a3055] hover:text-white text-[#1a3055] font-semibold text-[10px] transition-colors border border-slate-200 cursor-pointer flex items-center gap-1"
                            title="View Job Details, Tickets &amp; Tool Ledger"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>
                          {isActive && user?.role !== 'Viewer' && (
                            <button
                              onClick={() => onDispatchJob(job.id)}
                              className="h-6 px-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="Create Delivery Ticket (DT)"
                            >
                              <Truck className="w-3 h-3" />
                              <span>DT</span>
                            </button>
                          )}
                          {toolsOnRig > 0 && onReceiveJob && user?.role !== 'Viewer' && (
                            <button
                              onClick={() => onReceiveJob(job.id)}
                              className="h-6 px-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[10px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="Create Receiving Ticket (RT)"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>RT</span>
                            </button>
                          )}
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
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Link to Callout Request (Optional)
                </label>
                <select
                  value={selectedCalloutId}
                  onChange={(e) => handleCalloutChange(e.target.value)}
                  className="w-full border rounded px-3 py-1.5 font-mono"
                >
                  <option value="">-- No Direct Callout Link (Standalone Job) --</option>
                  {callouts
                    .filter((c) => !c.jobId || c.id === selectedCalloutId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} &bull; {c.client} &bull; {c.rig} / {c.well}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rig Identification *</label>
                  <input
                    type="text"
                    value={newRig}
                    onChange={(e) => setNewRig(e.target.value)}
                    placeholder="e.g. AD-33, ND-19, RIG-8"
                    required
                    className="w-full border rounded px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Well Identifier *</label>
                  <input
                    type="text"
                    value={newWell}
                    onChange={(e) => setNewWell(e.target.value)}
                    placeholder="e.g. GH-0023, BUH-412"
                    required
                    className="w-full border rounded px-3 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Operator / Client *</label>
                  <input
                    type="text"
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    placeholder="e.g. ADNOC Onshore, ADNOC Drilling"
                    required
                    className="w-full border rounded px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contract / Project Code</label>
                  <input
                    type="text"
                    value={newContract}
                    onChange={(e) => setNewContract(e.target.value)}
                    placeholder="e.g. 4700015149"
                    className="w-full border rounded px-3 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mob Date (Planned)</label>
                  <input
                    type="date"
                    value={newMobDate}
                    onChange={(e) => setNewMobDate(e.target.value)}
                    className="w-full border rounded px-3 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hole Section</label>
                  <select
                    value={newHoleSection}
                    onChange={(e) => setNewHoleSection(e.target.value)}
                    className="w-full border rounded px-3 py-1.5"
                  >
                    <option value="26&quot;">26&quot; Section</option>
                    <option value="17-1/2&quot;">17-1/2&quot; Section</option>
                    <option value="12-1/4&quot;">12-1/4&quot; Section</option>
                    <option value="8-1/2&quot;">8-1/2&quot; Section</option>
                    <option value="6&quot;">6&quot; Section</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Service Type</label>
                  <select
                    value={newServiceType}
                    onChange={(e) => setNewServiceType(e.target.value)}
                    className="w-full border rounded px-3 py-1.5"
                  >
                    <option value="Downhole Rental">Downhole Rental</option>
                    <option value="Fishing Service">Fishing Service</option>
                    <option value="Whipstock Operations">Whipstock Operations</option>
                    <option value="Workover / Milling">Workover / Milling</option>
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
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedJobDetail(null);
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-sm">Job: {selectedJobDetail.id}</h3>
                  {renderStatusBadge(selectedJobDetail.status)}
                </div>
                <div className="text-[11px] text-slate-300">
                  {selectedJobDetail.rig} / {selectedJobDetail.well} &bull; {selectedJobDetail.client}
                </div>
              </div>
              <button
                onClick={() => setSelectedJobDetail(null)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              {/* Parameter Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Client:</span>
                  <span className="font-bold text-[#1a3055]">{selectedJobDetail.client}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Contract:</span>
                  <span>{selectedJobDetail.contract || '—'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">PO Number:</span>
                  <span className="font-mono">{selectedJobDetail.poNumber || '—'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Mob Date:</span>
                  <span className="font-mono">{formatJobDate(selectedJobDetail.mobDate)}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Demob Date:</span>
                  <span className="font-mono">{formatJobDate(selectedJobDetail.demobDate)}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Service Type:</span>
                  <span>{selectedJobDetail.serviceType || 'Downhole Rental'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Invoiced Amount ($):</span>
                  <span className="font-mono font-bold text-emerald-800">
                    {selectedJobDetail.invoiceAmount ? `$${Number(selectedJobDetail.invoiceAmount).toLocaleString()}` : '—'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Legal Invoice NO:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {selectedJobDetail.legalInvoiceNumber || 'Pending'}
                  </span>
                </div>
              </div>

              {/* 6-Stage Job Lifecycle Pipeline & Aging Stepper */}
              {(() => {
                const st = getJobStats(selectedJobDetail.id);
                return (
                  <JobLifecycleStepper
                    job={selectedJobDetail}
                    dtBatches={st.dtBatches}
                    rtBatches={st.rtBatches}
                    canEdit={user?.role !== 'Viewer'}
                    onOpenStatusModal={() => {
                      setEditingJobStatus(selectedJobDetail);
                    }}
                  />
                );
              })()}

              {/* Tool Summary Balance Box */}
              {(() => {
                const st = getJobStats(selectedJobDetail.id);
                const toolsOnRig = Math.max(0, st.dtCount - st.rtCount);
                return (
                  <div className="grid grid-cols-3 gap-3 p-3 bg-slate-100/70 rounded border border-slate-200 text-center">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Total Dispatched</div>
                      <div className="text-base font-extrabold text-blue-700 font-mono">{st.dtCount} tools</div>
                      <div className="text-[10px] text-slate-500">{st.dtBatches.length} Delivery Tickets</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Total Returned</div>
                      <div className="text-base font-extrabold text-emerald-700 font-mono">{st.rtCount} tools</div>
                      <div className="text-[10px] text-slate-500">{st.rtBatches.length} Receiving Tickets</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Balance On Rig</div>
                      <div className={`text-base font-extrabold font-mono ${toolsOnRig > 0 ? 'text-amber-900' : 'text-slate-500'}`}>
                        {toolsOnRig} tools
                      </div>
                      <div className="text-[10px] text-slate-500">Active rental balance</div>
                    </div>
                  </div>
                );
              })()}

              {/* Delivery Tickets Linked */}
              <div>
                <h4 className="font-bold text-slate-700 mb-1.5">
                  Dispatched Delivery Tickets (DTs)
                </h4>
                {(() => {
                  const st = getJobStats(selectedJobDetail.id);
                  if (st.dtBatches.length === 0) {
                    return (
                      <div className="p-4 bg-slate-50 rounded border border-slate-200 text-center text-slate-400">
                        No delivery tickets dispatched for this job yet.
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {st.dtBatches.map((b) => (
                        <div key={b.id} className="border border-slate-200 rounded p-2.5 bg-slate-50">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-mono font-bold text-slate-900">{b.dtNumber}</span>
                            <span className="text-slate-500 text-[10px]">
                              Date: <strong>{formatJobDate(b.rmDate || b.deliveryDate)}</strong> &bull; Total Tools:{' '}
                              <strong>{b.toolLines?.length || 0}</strong>
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 font-mono">
                            {(b.toolLines || []).map((t) => `${t.serial} (${t.shortDesc})`).join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Backloaded Receiving Tickets Linked */}
              <div>
                <h4 className="font-bold text-slate-700 mb-1.5">
                  Backloaded Receiving Tickets (RTs)
                </h4>
                {(() => {
                  const st = getJobStats(selectedJobDetail.id);
                  if (st.rtBatches.length === 0) {
                    return (
                      <div className="p-4 bg-slate-50 rounded border border-slate-200 text-center text-slate-400">
                        No tools backloaded via Receiving Tickets yet.
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {st.rtBatches.map((b) => (
                        <div key={b.id} className="border border-slate-200 rounded p-2.5 bg-emerald-50/40">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-mono font-bold text-emerald-900">{b.rtNumber}</span>
                            <span className="text-slate-500 text-[10px]">
                              Received: <strong>{formatJobDate(b.rtDate)}</strong> &bull; Returned Tools:{' '}
                              <strong>{b.toolLines?.length || 0}</strong>
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 font-mono">
                            {(b.toolLines || []).map((t) => `${t.serial} (${t.shortDesc})`).join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2 flex-shrink-0 text-xs">
              <button
                onClick={() => setSelectedJobDetail(null)}
                className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
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
    </div>
  );
};
