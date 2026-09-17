import React, { useState, useMemo, useRef } from 'react';
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
    .replace(/[-_]0?1$/i, '');
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
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const [selectedJobDetail, setSelectedJobDetail] = useState<DrillingJob | null>(null);

  // Sorting State
  const [sortField, setSortField] = useState<'id' | 'client' | 'rig' | 'mobDate' | 'dtTools' | 'rtTools' | 'toolsOnRig' | 'stage' | 'stageDays' | 'value'>('id');
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

  const handleSortToggle = (field: 'id' | 'client' | 'rig' | 'mobDate' | 'dtTools' | 'rtTools' | 'toolsOnRig' | 'stage' | 'stageDays' | 'value') => {
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

  // Distinct clients for combo filter
  const uniqueClients = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      if (j.client && j.client.trim()) set.add(j.client.trim());
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
      } else if (sortField === 'value') {
        const getVal = (j: DrillingJob) => j.invoiceAmount || (typeof j.cost === 'number' ? j.cost : parseFloat(String(j.cost || '').replace(/[^0-9.-]/g, '')) || 0);
        comparison = getVal(a) - getVal(b);
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

  const handleStageSelectChange = (job: DrillingJob, newStage: JobStageKey) => {
    // If the job already has a verified legal invoice, it is locked as completed
    if (isLegalInvoiceNumber(job.legalInvoiceNumber)) {
      alert(`Job ${job.id} is finalized and closed with verified Legal Invoice ${job.legalInvoiceNumber}. Its status cannot be changed.`);
      return;
    }

    if (newStage === '6_completed') {
      const enteredLegal = window.prompt(
        `To mark Job ${job.id} as Completed, please enter a valid Legal Invoice Number (must start with FSH, FR, or WHP):`,
        job.legalInvoiceNumber || ''
      );

      if (!enteredLegal || !isLegalInvoiceNumber(enteredLegal)) {
        alert(
          `A legal invoice number starting with FSH, FR, or WHP is strictly required to complete a job.\n\nWithout an FSH, FR, or WHP prefix, this invoice remains under approval (Stage 5).`
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
          <button
            type="button"
            onClick={handleExportJobsCsv}
            className="h-7.5 px-3 rounded bg-white text-slate-700 border border-slate-300 font-semibold text-xs hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
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
              className="h-7.5 px-3 rounded bg-emerald-700 text-white font-semibold text-xs hover:bg-emerald-800 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title="Upload and synchronize Jobs CSV"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-100" />
              <span>Import / Sync CSV</span>
            </button>
          )}

          {user?.role !== 'Viewer' && (
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

      {/* MASTER LIFECYCLE COMMAND CARD: Unified Card with 6 Sub-Cards to Display Pending Stages & Combo Selector */}
      <div className="bg-gradient-to-br from-[#0e1d35] via-[#132644] to-[#1a3359] text-white rounded-xl p-3.5 border border-[#213f6e] shadow-md relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-80 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Master Card Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3 pb-2.5 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-xs uppercase tracking-wider text-slate-200">
              Operational &amp; Commercial Lifecycle Pipeline
            </span>
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              (Select a stage sub-card or use combo dropdown)
            </span>
          </div>

          {/* Combo Selector for Stage */}
          <div className="flex items-center gap-2">
            <label htmlFor="stage-combo-select" className="text-[11px] font-medium text-slate-300 whitespace-nowrap">
              Stage Combo:
            </label>
            <select
              id="stage-combo-select"
              value={tab}
              onChange={(e) => {
                setTab(e.target.value as any);
                setCurrentPage(1);
              }}
              className="bg-[#1b345b] text-white border border-[#345990] rounded px-2.5 py-1 text-xs font-semibold outline-none cursor-pointer hover:bg-[#22406d] transition focus:ring-1 focus:ring-amber-400"
            >
              <option value="all">All Stages ({metrics.total.toLocaleString()} Jobs)</option>
              <option value="1_open">1. Open — No DT Generated ({metrics.counts['1_open'] || 0})</option>
              <option value="2_ongoing">2. Ongoing — Tools On Rig ({metrics.counts['2_ongoing'] || 0})</option>
              <option value="3_waiting_signed_docs">3. Waiting Docs — Pending Signed DT/RT ({metrics.counts['3_waiting_signed_docs'] || 0})</option>
              <option value="4_submitted_billing">4. In Billing — Commercial Queue ({metrics.counts['4_submitted_billing'] || 0})</option>
              <option value="5_ses_submitted">5. SES Submitted — Portal Review ({metrics.counts['5_ses_submitted'] || 0})</option>
              <option value="6_completed">6. Completed — Invoiced &amp; Closed ({metrics.counts['6_completed'] || 0})</option>
            </select>

            {tab !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setTab('all');
                  setCurrentPage(1);
                }}
                className="text-[11px] px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-slate-200 font-semibold transition cursor-pointer"
                title="Reset stage filter to view all jobs"
              >
                Reset (Show All)
              </button>
            )}
          </div>
        </div>

        {/* 6 High-Tech Sub-Cards: Clickable Stage Tiles with Pending Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 relative z-10">
          {/* Sub-Card 1: Open */}
          <button
            type="button"
            onClick={() => {
              setTab(tab === '1_open' ? 'all' : '1_open');
              setCurrentPage(1);
            }}
            className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer relative overflow-hidden group ${
              tab === '1_open'
                ? 'bg-slate-800/90 border-amber-400 ring-2 ring-amber-400/50 shadow-md'
                : 'bg-[#152a4a]/80 border-[#234370]/70 hover:bg-[#1a345c] hover:border-slate-400/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-300">Open Status</span>
              <span className="w-2 h-2 rounded-full bg-slate-400" />
            </div>
            <div className="text-[11px] font-bold text-slate-200 leading-tight">Open</div>
            <div className="text-xl font-extrabold text-white font-mono mt-0.5">
              {(metrics.counts['1_open'] || 0).toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
              <span>No DT generated</span>
              {tab === '1_open' && <span className="text-[9px] text-amber-400 font-bold">ACTIVE</span>}
            </div>
          </button>

          {/* Sub-Card 2: Ongoing */}
          <button
            type="button"
            onClick={() => {
              setTab(tab === '2_ongoing' ? 'all' : '2_ongoing');
              setCurrentPage(1);
            }}
            className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer relative overflow-hidden group ${
              tab === '2_ongoing'
                ? 'bg-blue-900/80 border-blue-400 ring-2 ring-blue-400/50 shadow-md'
                : 'bg-[#152a4a]/80 border-[#234370]/70 hover:bg-[#1a345c] hover:border-blue-400/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-blue-300">Active Field</span>
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            </div>
            <div className="text-[11px] font-bold text-blue-200 leading-tight">Ongoing</div>
            <div className="text-xl font-extrabold text-blue-100 font-mono mt-0.5">
              {(metrics.counts['2_ongoing'] || 0).toLocaleString()}
            </div>
            <div className="text-[10px] text-blue-300/80 mt-1 flex items-center justify-between">
              <span>Tools on site</span>
              {tab === '2_ongoing' && <span className="text-[9px] text-blue-300 font-bold">ACTIVE</span>}
            </div>
          </button>

          {/* Sub-Card 3: Waiting Docs */}
          <button
            type="button"
            onClick={() => {
              setTab(tab === '3_waiting_signed_docs' ? 'all' : '3_waiting_signed_docs');
              setCurrentPage(1);
            }}
            className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer relative overflow-hidden group ${
              tab === '3_waiting_signed_docs'
                ? 'bg-amber-950/80 border-amber-400 ring-2 ring-amber-400/60 shadow-md'
                : 'bg-[#1b2b46]/90 border-amber-500/40 hover:bg-[#203454] hover:border-amber-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-amber-300">Documentation</span>
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            </div>
            <div className="text-[11px] font-bold text-amber-200 leading-tight">Waiting Docs</div>
            <div className="text-xl font-extrabold text-amber-300 font-mono mt-0.5">
              {(metrics.counts['3_waiting_signed_docs'] || 0).toLocaleString()}
            </div>
            <div className="text-[10px] text-amber-300/90 mt-1 flex items-center justify-between">
              <span>Awaiting signed docs</span>
              {tab === '3_waiting_signed_docs' && <span className="text-[9px] text-amber-400 font-bold">ACTIVE</span>}
            </div>
          </button>

          {/* Sub-Card 4: In Billing */}
          <button
            type="button"
            onClick={() => {
              setTab(tab === '4_submitted_billing' ? 'all' : '4_submitted_billing');
              setCurrentPage(1);
            }}
            className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer relative overflow-hidden group ${
              tab === '4_submitted_billing'
                ? 'bg-indigo-950/80 border-indigo-400 ring-2 ring-indigo-400/50 shadow-md'
                : 'bg-[#152a4a]/80 border-[#234370]/70 hover:bg-[#1a345c] hover:border-indigo-400/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-indigo-300">Finance Queue</span>
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
            </div>
            <div className="text-[11px] font-bold text-indigo-200 leading-tight">In Billing</div>
            <div className="text-xl font-extrabold text-indigo-100 font-mono mt-0.5">
              {(metrics.counts['4_submitted_billing'] || 0).toLocaleString()}
            </div>
            <div className="text-[10px] text-indigo-300/80 mt-1 flex items-center justify-between">
              <span>Submitted tickets</span>
              {tab === '4_submitted_billing' && <span className="text-[9px] text-indigo-300 font-bold">ACTIVE</span>}
            </div>
          </button>

          {/* Sub-Card 5: SES Submitted */}
          <button
            type="button"
            onClick={() => {
              setTab(tab === '5_ses_submitted' ? 'all' : '5_ses_submitted');
              setCurrentPage(1);
            }}
            className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer relative overflow-hidden group ${
              tab === '5_ses_submitted'
                ? 'bg-purple-950/80 border-purple-400 ring-2 ring-purple-400/50 shadow-md'
                : 'bg-[#1b2546]/90 border-purple-500/40 hover:bg-[#213054] hover:border-purple-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-purple-300">Approval Stage</span>
              <span className="w-2 h-2 rounded-full bg-purple-400" />
            </div>
            <div className="text-[11px] font-bold text-purple-200 leading-tight">Under Approval</div>
            <div className="text-xl font-extrabold text-purple-200 font-mono mt-0.5">
              {(metrics.counts['5_ses_submitted'] || 0).toLocaleString()}
            </div>
            <div className="text-[10px] text-purple-300/80 mt-1 flex items-center justify-between">
              <span>ERP / SES Review</span>
              {tab === '5_ses_submitted' && <span className="text-[9px] text-purple-300 font-bold">ACTIVE</span>}
            </div>
          </button>

          {/* Sub-Card 6: Completed */}
          <button
            type="button"
            onClick={() => {
              setTab(tab === '6_completed' ? 'all' : '6_completed');
              setCurrentPage(1);
            }}
            className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer relative overflow-hidden group ${
              tab === '6_completed'
                ? 'bg-emerald-950/80 border-emerald-400 ring-2 ring-emerald-400/50 shadow-md'
                : 'bg-[#152a4a]/80 border-[#234370]/70 hover:bg-[#1a345c] hover:border-emerald-400/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-emerald-300">Final Invoiced</span>
              <CheckCircle className="w-3 h-3 text-emerald-400" />
            </div>
            <div className="text-[11px] font-bold text-emerald-200 leading-tight">Completed</div>
            <div className="text-xl font-extrabold text-emerald-100 font-mono mt-0.5">
              {(metrics.counts['6_completed'] || 0).toLocaleString()}
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-1 flex items-center justify-between">
              <span>FSH / FR / WHP</span>
              {tab === '6_completed' && <span className="text-[9px] text-emerald-300 font-bold">ACTIVE</span>}
            </div>
          </button>
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

          {/* Rig Combo Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded px-2 h-7.5 text-xs">
            <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">Rig:</span>
            <select
              value={selectedRigFilter}
              onChange={(e) => {
                setSelectedRigFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-800 font-medium outline-none cursor-pointer pr-1"
            >
              <option value="all">All Rigs ({uniqueRigs.length})</option>
              {uniqueRigs.map((rig) => (
                <option key={rig} value={rig}>
                  {rig}
                </option>
              ))}
            </select>
          </div>

          {/* Client / Operator Combo Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded px-2 h-7.5 text-xs">
            <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">Client:</span>
            <select
              value={selectedClientFilter}
              onChange={(e) => {
                setSelectedClientFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-800 font-medium outline-none cursor-pointer pr-1 max-w-[140px] truncate"
            >
              <option value="all">All Clients ({uniqueClients.length})</option>
              {uniqueClients.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
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
        <div className="overflow-x-auto w-full max-h-[68vh] relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs text-slate-700 border-b border-slate-200 text-[11px] font-bold select-none uppercase tracking-wider">
              <tr>
                <th
                  onClick={() => handleSortToggle('id')}
                  className="sticky left-0 z-20 bg-slate-100 px-3 py-2 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap min-w-[125px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]"
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
                  onClick={() => handleSortToggle('stage')}
                  className="px-2.5 py-2 text-center cursor-pointer hover:bg-slate-200/70 whitespace-nowrap min-w-[140px]"
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

                <th
                  onClick={() => handleSortToggle('value')}
                  className="px-2.5 py-2 text-right cursor-pointer hover:bg-slate-200/70 whitespace-nowrap min-w-[105px]"
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
                  <td colSpan={10} className="py-12 text-center text-slate-500 font-medium">
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
                      {/* Job # - Strict whitespace-nowrap, sticky left anchor */}
                      <td className={`px-3 ${padY} whitespace-nowrap align-middle sticky left-0 bg-white group-hover:bg-blue-50/70 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]`}>
                        <button
                          onClick={() => setSelectedJobDetail(job)}
                          className="font-mono font-bold text-slate-900 group-hover:text-blue-700 text-xs tracking-tight transition cursor-pointer text-left select-all"
                          title="Click to view complete job details and tool ledger"
                        >
                          {job.id}
                        </button>
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

                      {/* Rig / Well (Rig in bold, Well without bold) */}
                      <td className={`px-3 ${padY} whitespace-nowrap align-middle`}>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-xs tracking-tight">
                            {job.rig || 'Rig Unassigned'}
                          </span>
                          {job.well && job.well !== '—' && job.well !== '-' && (
                            <span className="text-slate-500 font-normal text-xs">
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

                      {/* Current Status Dropdown in all lines (disabled for jobs with legal invoice) */}
                      <td className={`px-2.5 ${padY} text-center whitespace-nowrap align-middle`}>
                        {isLegalInvoiceNumber(job.legalInvoiceNumber) ? (
                          <div className="inline-flex items-center justify-center gap-1">
                            <select
                              disabled
                              value="6_completed"
                              className="h-6.5 px-2 text-[11px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-300 opacity-90 cursor-not-allowed select-none"
                              title={`Completed & Locked with verified Legal Invoice: ${job.legalInvoiceNumber}`}
                            >
                              <option value="6_completed">✓ Completed</option>
                            </select>
                            <span className="text-slate-500 font-mono text-[10px]" title="Locked with legal invoice">🔒</span>
                          </div>
                        ) : (
                          <select
                            value={stage}
                            onChange={(e) => handleStageSelectChange(job, e.target.value as JobStageKey)}
                            className={`h-6.5 px-2 text-[11px] font-bold rounded border transition cursor-pointer outline-none focus:ring-1 focus:ring-[#1a3055] ${
                              stage === '1_open'
                                ? 'bg-slate-50 text-slate-700 border-slate-300'
                                : stage === '2_ongoing'
                                ? 'bg-blue-50 text-blue-900 border-blue-300'
                                : stage === '3_waiting_signed_docs'
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : stage === '4_submitted_billing'
                                ? 'bg-indigo-50 text-indigo-900 border-indigo-300'
                                : stage === '5_ses_submitted'
                                ? 'bg-purple-50 text-purple-900 border-purple-300'
                                : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                            }`}
                            title="Select to advance or change job status"
                          >
                            <option value="1_open">1. Open</option>
                            <option value="2_ongoing">2. Ongoing</option>
                            <option value="3_waiting_signed_docs">3. Waiting Docs</option>
                            <option value="4_submitted_billing">4. In Billing</option>
                            <option value="5_ses_submitted">5. Under Approval</option>
                            <option value="6_completed">6. Completed</option>
                          </select>
                        )}
                      </td>

                      {/* Stage Aging & Cycle Duration */}
                      <td className={`px-2.5 ${padY} text-center font-mono whitespace-nowrap align-middle`}>
                        <div className="flex flex-col items-center leading-tight">
                          <span
                            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                              stage === '3_waiting_signed_docs' && lifecycleMetrics.currentStageDays <= 30 && lifecycleMetrics.currentStageDays > 0
                                ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                : 'text-slate-700'
                            }`}
                            title={`${lifecycleMetrics.currentStageDays} days in status: ${STAGE_DEFINITIONS[stage].label}`}
                          >
                            {lifecycleMetrics.currentStageDays}d
                          </span>
                          <span className="text-[9px] text-slate-400 font-sans">
                            {lifecycleMetrics.totalCycleDays}d total
                          </span>
                        </div>
                      </td>

                      {/* Job Value / Amount */}
                      <td className={`px-2.5 ${padY} text-right font-mono whitespace-nowrap align-middle`}>
                        {(() => {
                          const val = job.invoiceAmount || (typeof job.cost === 'number' ? job.cost : parseFloat(String(job.cost || '').replace(/[^0-9.-]/g, '')) || 0);
                          return val > 0 ? (
                            <span className="font-bold text-slate-900 text-xs">
                              ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[11px]">—</span>
                          );
                        })()}
                      </td>

                      {/* Legal Invoice NO (Strictly displays FSH/FR/WHP; non-matching ERP invoices labeled under approval) */}
                      <td className={`px-2.5 ${padY} font-mono text-[11px] whitespace-nowrap align-middle`}>
                        {job.legalInvoiceNumber && isLegalInvoiceNumber(job.legalInvoiceNumber) ? (
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-slate-800 text-[11px]">
                              {job.legalInvoiceNumber.split(',')[0].trim()}
                            </span>
                            {job.legalInvoiceNumber.includes(',') && (
                              <span className="text-[10px] text-slate-400 font-sans">
                                +{job.legalInvoiceNumber.split(',').length - 1}
                              </span>
                            )}
                          </div>
                        ) : job.draftInvoiceNumber || (job.legalInvoiceNumber && !isLegalInvoiceNumber(job.legalInvoiceNumber)) ? (
                          <span className="text-slate-500 text-[10px]" title="ERP Billing Document (Under Approval)">
                            ERP #{job.draftInvoiceNumber || job.legalInvoiceNumber}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Actions (Stage advance disabled for completed jobs) */}
                      <td className={`px-3 ${padY} text-right whitespace-nowrap align-middle pr-3.5`}>
                        <div className="flex items-center justify-end gap-1">
                          {user?.role !== 'Viewer' && stage !== '6_completed' && (
                            <button
                              onClick={() => setEditingJobStatus(job)}
                              className="h-6 px-1.5 rounded bg-[#1a3055] hover:bg-[#24426d] text-white font-semibold text-[10px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="Update / Advance Job Status"
                            >
                              <ShieldCheck className="w-3 h-3 text-amber-400" />
                              <span>Status</span>
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedJobDetail(job)}
                            className="h-6 px-1.5 rounded bg-slate-100 hover:bg-[#1a3055] hover:text-white text-[#1a3055] font-semibold text-[10px] transition-colors border border-slate-200 cursor-pointer flex items-center gap-1"
                            title="View Job Details, Tickets & Tool Ledger"
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
        <JobDetailModal
          job={selectedJobDetail}
          dtBatches={getJobStats(selectedJobDetail.id).dtBatches}
          rtBatches={getJobStats(selectedJobDetail.id).rtBatches}
          canEdit={user?.role !== 'Viewer'}
          formatJobDate={formatJobDate}
          renderStatusBadge={renderStatusBadge}
          onOpenStatusModal={() => setEditingJobStatus(selectedJobDetail)}
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
    </div>
  );
};
