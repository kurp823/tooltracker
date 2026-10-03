import React, { useState, useMemo, useEffect } from 'react';
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
} from '../types';
import { AdminCategoriesModal } from './AdminCategoriesModal';

interface JobDossierViewProps {
  job: DrillingJob;
  user?: User | null;
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  callouts: Callout[];
  inventory: ToolItem[];
  contracts?: ContractRecord[];
  onSaveJob: (job: DrillingJob) => void;
  onSaveDTBatch: (batch: DTBatch) => void;
  onUpdateDTBatch?: (batch: DTBatch, addedTools?: ToolItem[], removedTools?: ToolItem[]) => void;
  onSaveRTBatch: (batch: RTBatch) => void;
  onUpdateRTBatch?: (batch: RTBatch) => void;
  onSaveCallout?: (callout: Callout) => void;
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
export const formatDateDD_MM_YYYY = (val?: string | Date | null): string => {
  if (!val) return '—';
  const str = String(val).trim();
  if (!str || str === '—' || str === '-' || str === 'null' || str === 'undefined') return '—';

  // If already DD-MM-YYYY (numbers)
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;

  // If DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const parts = str.split('/');
    return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
  }

  // If DD/MM/YY
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(str)) {
    const parts = str.split('/');
    const yr = parseInt(parts[2], 10) > 50 ? `19${parts[2]}` : `20${parts[2]}`;
    return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${yr}`;
  }

  // If YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
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
    return `${mmmMatch[1].padStart(2, '0')}-${mNum}-${yr}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }
  return str;
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

export const JobDossierView: React.FC<JobDossierViewProps> = ({
  job: initialJob,
  user,
  jobs,
  dtBatches,
  rtBatches,
  callouts,
  inventory,
  contracts = [],
  onSaveJob,
  onSaveDTBatch,
  onUpdateDTBatch,
  onSaveRTBatch,
  onUpdateRTBatch,
  onSaveCallout,
  onBackToRegister,
  onNavigateToInvoicing,
  showToast,
}) => {
  // Current active top tab
  const [activeTab, setActiveTab] = useState<DossierTabKey>('job-header');

  // Job Header state
  const [jobData, setJobData] = useState<DrillingJob>(initialJob);
  useEffect(() => {
    setJobData(initialJob);
  }, [initialJob]);

  // Technical Details sub-tab
  const [techSubTab, setTechSubTab] = useState<'fishing' | 'whipstock' | 'rentals'>('fishing');

  // Helper to normalize job numbers for robust live SQL data matching (e.g. Job-026-01737 <-> 026-01737)
  const normalizeJobKey = (val?: string | null) => {
    if (!val) return '';
    return val.replace(/^JOB-?/i, '').replace(/^0+/, '').trim().toUpperCase();
  };

  // LOCKED STATE RULE: If legally invoiced, draft invoiced, or submitted to billing, job is strictly read-only!
  // Only Admin can edit (with audited mode banner)
  const isJobInvoicedOrSubmitted = useMemo(() => {
    const legal = (jobData.legalInvoiceNumber || jobData.invoiceNumber || '').trim();
    const draft = (jobData.draftInvoiceNumber || '').trim();
    const hasLegal = Boolean(legal && legal !== '—' && legal !== '-');
    const hasDraft = Boolean(draft && draft !== '—' && draft !== '-');
    const stage = (jobData.status || '').toLowerCase();
    const isFinishedStage =
      stage.includes('invoiced') ||
      stage.includes('completed') ||
      stage.includes('submitted to billing') ||
      stage.includes('ses') ||
      stage.includes('closed');
    return hasLegal || hasDraft || isFinishedStage;
  }, [jobData]);

  const isAdmin = user?.role === 'Admin';
  const isClosedOrInvoiced = Boolean(
    isJobInvoicedOrSubmitted ||
    (jobData.legalInvoiceNumber && jobData.legalInvoiceNumber !== '—' && jobData.legalInvoiceNumber !== '-')
  );
  // ABSOLUTE LOCK: When closed or legally invoiced, entire job is locked in VIEW ONLY mode for everyone
  const isJobLocked = isClosedOrInvoiced;
  const isLocked = isJobLocked;

  // Helper to remove any Performance Bank Guarantee (PBG) notes or values from contract strings
  const cleanContractName = (raw?: string | null) => {
    if (!raw) return '';
    let s = raw.trim();
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
    const v = val.trim().toUpperCase();
    const legal = (jobData.legalInvoiceNumber || '').trim().toUpperCase();
    const draft = (jobData.draftInvoiceNumber || '').trim().toUpperCase();
    const inv = (jobData.invoiceNumber || '').trim().toUpperCase();
    if (legal && v === legal) return true;
    if (draft && v === draft) return true;
    if (inv && v === inv) return true;
    if (/^FR-\d+/i.test(v)) return true;
    return false;
  };

  const sanitizeTicketNumber = (val?: string | null) => {
    if (!val || isInvoiceRef(val)) return '';
    return val.trim();
  };

  // Dynamic distinct Clients & Contracts pulled from real database records
  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    if (jobData.client && jobData.client.trim()) set.add(jobData.client.trim().toUpperCase());
    jobs.forEach((j) => {
      if (j.client && j.client.trim()) set.add(j.client.trim().toUpperCase());
    });
    contracts.forEach((c) => {
      if (c.clientName && c.clientName.trim()) set.add(c.clientName.trim().toUpperCase());
      if (c.client && c.client.trim()) set.add(c.client.trim().toUpperCase());
    });
    dtBatches.forEach((d) => {
      if (d.client && d.client.trim()) set.add(d.client.trim().toUpperCase());
    });
    rtBatches.forEach((r) => {
      if (r.client && r.client.trim()) set.add(r.client.trim().toUpperCase());
    });
    callouts.forEach((c) => {
      if (c.client && c.client.trim()) set.add(c.client.trim().toUpperCase());
    });
    ['ADNOC ONSHORE', 'ADNOC OFFSHORE', 'ADNOC DRILLING', 'SNOC', 'SCHLUMBERGER', 'BAKER HUGHES', 'HALLIBURTON', 'WEATHERFORD'].forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [jobs, contracts, dtBatches, rtBatches, callouts, jobData.client]);

  const contractOptions = useMemo(() => {
    const map = new Map<string, string>(); // Name -> Contract No
    if (jobData.contract && jobData.contract.trim()) {
      const cleanCurrent = cleanContractName(jobData.contract);
      if (cleanCurrent) map.set(cleanCurrent, jobData.contractNo || '');
    }
    contracts.forEach((c) => {
      let name = c.name || c.shortDesc || c.title || c.contractName || '';
      name = cleanContractName(name);
      if (!name && c.description) {
        name = cleanContractName(c.description);
      }
      const no = (c.contractNo || c.contractNumber || '').trim();
      if (!name) name = no;
      if (name) {
        map.set(name, no || map.get(name) || '');
      }
    });
    jobs.forEach((j) => {
      if (j.contract && j.contract.trim()) {
        const clean = cleanContractName(j.contract);
        if (clean) map.set(clean, j.contractNo || '');
      }
    });
    dtBatches.forEach((d) => {
      if (d.contract && d.contract.trim()) {
        const clean = cleanContractName(d.contract);
        if (clean) map.set(clean, d.contract.trim());
      }
    });
    callouts.forEach((c) => {
      if (c.contract && c.contract.trim()) {
        const clean = cleanContractName(c.contract);
        if (clean) map.set(clean, c.projectNo || '');
      }
    });
    if (!map.has('ADNOC ONSHORE - RENTALS')) map.set('ADNOC ONSHORE - RENTALS', '4700023861');
    if (!map.has('ADNOC OFFSHORE - RENTALS')) map.set('ADNOC OFFSHORE - RENTALS', '4700015149');
    if (!map.has('SCHEDULE 2 RENTALS')) map.set('SCHEDULE 2 RENTALS', '4700012465');
    return Array.from(map.entries()).map(([name, no]) => ({ name, no }));
  }, [contracts, jobs, dtBatches, callouts, jobData.contract, jobData.contractNo]);

  // Related real data for this specific job from live database
  const jobDTs = useMemo(() => {
    const rawId = (jobData.id || jobData.jobNumber || '').trim().toUpperCase();
    const normId = normalizeJobKey(jobData.id || jobData.jobNumber);
    const jRig = (jobData.rig || '').trim().toUpperCase();
    const jWell = (jobData.well || '').trim().toUpperCase();

    return dtBatches.filter((b) => {
      const bJob = (b.jobId || b.jobNumber || '').trim().toUpperCase();
      const bNorm = normalizeJobKey(b.jobId || b.jobNumber);
      if (rawId && bJob && (bJob === rawId || bJob.includes(rawId) || rawId.includes(bJob))) return true;
      if (normId && bNorm && normId === bNorm) return true;
      if (jRig && jWell && b.rig && b.well) {
        const bRig = b.rig.trim().toUpperCase();
        const bWell = b.well.trim().toUpperCase();
        if (bRig === jRig && (bWell === jWell || bWell.includes(jWell) || jWell.includes(bWell))) {
          return true;
        }
      }
      return false;
    });
  }, [dtBatches, jobData]);

  const jobRTs = useMemo(() => {
    const rawId = (jobData.id || jobData.jobNumber || '').trim().toUpperCase();
    const normId = normalizeJobKey(jobData.id || jobData.jobNumber);
    const jRig = (jobData.rig || '').trim().toUpperCase();
    const jWell = (jobData.well || '').trim().toUpperCase();

    return rtBatches.filter((b) => {
      const bJob = (b.jobId || b.jobNumber || '').trim().toUpperCase();
      const bNorm = normalizeJobKey(b.jobId || b.jobNumber);
      if (rawId && bJob && (bJob === rawId || bJob.includes(rawId) || rawId.includes(bJob))) return true;
      if (normId && bNorm && normId === bNorm) return true;
      if (jRig && jWell && b.rig && b.well) {
        const bRig = b.rig.trim().toUpperCase();
        const bWell = b.well.trim().toUpperCase();
        if (bRig === jRig && (bWell === jWell || bWell.includes(jWell) || jWell.includes(bWell))) {
          return true;
        }
      }
      return false;
    });
  }, [rtBatches, jobData]);

  const jobCallouts = useMemo(() => {
    const rawId = (jobData.id || jobData.jobNumber || '').trim().toUpperCase();
    const normId = normalizeJobKey(jobData.id || jobData.jobNumber);

    return callouts.filter((c) => {
      const cJob = (c.jobId || c.jobNumber || '').trim().toUpperCase();
      const cNorm = normalizeJobKey(c.jobId || c.jobNumber);
      if (rawId && cJob && (cJob === rawId || cJob.includes(rawId) || rawId.includes(cJob))) return true;
      if (normId && cNorm && normId === cNorm) return true;
      if (jobData.calloutId && c.id === jobData.calloutId) return true;
      return false;
    });
  }, [callouts, jobData]);

  // Equipment dispatch and reconciliation counts
  const totalDispatched = useMemo(() => {
    return jobDTs.reduce((acc, dt) => acc + (dt.toolLines?.length || 0), 0);
  }, [jobDTs]);

  const totalReturned = useMemo(() => {
    return jobRTs.reduce((acc, rt) => acc + (rt.toolLines?.length || 0), 0);
  }, [jobRTs]);

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
        const returnBatch = jobRTs.find((rt) =>
          (rt.toolLines || []).some((rtl) => rtl.serial === t.serial || (t.assetNo && rtl.assetNo === t.assetNo))
        );
        return {
          ...t,
          dtNumber: d.dtNumber,
          dispatchDate: d.dispatchDate,
          returnDate: returnBatch ? returnBatch.rtDate || returnBatch.backloadRmDate : null,
          rtNumber: returnBatch ? returnBatch.rtNumber : null,
        };
      })
    );
  }, [jobDTs, jobRTs]);

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

  // Total Cumulative Job Value across all months
  const totalCumulativeJobValue = useMemo(() => {
    let grandTotal = 0;
    utilMonthOptions.forEach((opt) => {
      const daysInM = new Date(opt.year, opt.month, 0).getDate();
      allMobilizedTools.forEach((t) => {
        const dispMs = parseDateToMs(t.dispatchDate);
        const retMs = t.returnDate ? parseDateToMs(t.returnDate) : 0;
        let sb = 0;
        let ops = 0;
        for (let d = 1; d <= daysInM; d++) {
          const cur = new Date(opt.year, opt.month - 1, d).getTime();
          const isDisp = dispMs > 0 ? cur >= dispMs : true;
          const isRet = retMs > 0 ? cur > retMs : false;
          if (isDisp && !isRet) {
            const daysSinceDisp = dispMs > 0 ? Math.floor((cur - dispMs) / (1000 * 60 * 60 * 24)) : d;
            if (daysSinceDisp <= 2) sb += 1;
            else ops += 1;
          }
        }
        grandTotal += sb * 600 + ops * 1200;
      });
    });
    return grandTotal;
  }, [allMobilizedTools, utilMonthOptions]);

  const poValueNum = typeof jobData.poValue === 'number' ? jobData.poValue : parseFloat(String(jobData.poValue || 0)) || 0;
  const poBalance = poValueNum - totalCumulativeJobValue;

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

  // Unique roles for personnel picker
  const availablePersonnelRoles = useMemo(() => {
    const set = new Set<string>();
    MASTER_PERSONNEL_ROSTER.forEach((p) => set.add(p.designation));
    return ['All Roles', ...Array.from(set).sort()];
  }, []);

  const filteredPersonnelRoster = useMemo(() => {
    return MASTER_PERSONNEL_ROSTER.filter((p) => {
      if (selectedPersonnelRole === 'All Roles') return true;
      return p.designation === selectedPersonnelRole;
    });
  }, [selectedPersonnelRole]);

  // Selected Checklist within Checklist Tab
  const [selectedCalloutId, setSelectedCalloutId] = useState<string>(() => {
    return jobCallouts[0]?.id || (jobData.calloutId ? jobData.calloutId : 'NEW');
  });

  // Active callout object - Guaranteed to link to this jobData.id
  const activeCallout = useMemo(() => {
    const found = jobCallouts.find((c) => c.id === selectedCalloutId) || jobCallouts[0];
    if (found) {
      const safeTicket = sanitizeTicketNumber(found.ticketNo) || sanitizeTicketNumber(found.calloutNumber) || sanitizeTicketNumber(jobData.clientRef);
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

  // Checklist Items State
  const [checklistItems, setChecklistItems] = useState<CalloutItem[]>(() => {
    if (activeCallout.items && activeCallout.items.length > 0) return activeCallout.items;
    // Auto-populate from DTs if historical/completed job
    if (jobDTs.length > 0) {
      return jobDTs.flatMap((d, dIdx) =>
        (d.toolLines || []).map((t, tIdx) => ({
          seq: dIdx * 100 + tIdx + 1,
          size: t.size || '—',
          shortDesc: t.shortDesc || t.desc,
          qty: t.qty || 1,
          assigned: t.qty || 1,
          serialNos: [t.serial],
          status: 'Released' as const,
          partNo: t.assetNo || t.serial,
          description: t.desc || t.shortDesc,
          supplier: t.ownership || (t.isEmdad ? 'EMDAD' : 'RUBICON OILFIELD'),
          qtyIn: 1,
          insNum: `GIS-Z-${Math.floor(10000 + (tIdx * 43) % 89999)}-2023`,
          insDate: formatDateDD_MM_YYYY(d.dispatchDate),
          comments: 'ACCEPTED',
          cat: t.shortDesc || 'Downhole Tool',
          condition: 'ACCEPTED',
        }))
      );
    }
    return [];
  });

  useEffect(() => {
    if (activeCallout && activeCallout.items && activeCallout.items.length > 0) {
      setChecklistItems(activeCallout.items);
    } else if (jobDTs.length > 0 && checklistItems.length === 0) {
      setChecklistItems(
        jobDTs.flatMap((d, dIdx) =>
          (d.toolLines || []).map((t, tIdx) => ({
            seq: dIdx * 100 + tIdx + 1,
            size: t.size || '—',
            shortDesc: t.shortDesc || t.desc,
            qty: t.qty || 1,
            assigned: t.qty || 1,
            serialNos: [t.serial],
            status: 'Released' as const,
            partNo: t.assetNo || t.serial,
            description: t.desc || t.shortDesc,
            supplier: t.ownership || (t.isEmdad ? 'EMDAD' : 'RUBICON OILFIELD'),
            qtyIn: 1,
            insNum: `GIS-Z-${Math.floor(10000 + (tIdx * 43) % 89999)}-2023`,
            insDate: formatDateDD_MM_YYYY(d.dispatchDate),
            comments: 'ACCEPTED',
            cat: t.shortDesc || 'Downhole Tool',
            condition: 'ACCEPTED',
          }))
        )
      );
    }
  }, [activeCallout, jobDTs]);

  // Admin Categories & Sizes Modal State & Storage
  const [isAdminCategoriesOpen, setIsAdminCategoriesOpen] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    const s = localStorage.getItem('emdad_custom_categories');
    if (s) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
  });

  const [customSizes, setCustomSizes] = useState<string[]>(() => {
    const s = localStorage.getItem('emdad_custom_sizes');
    if (s) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return ['3-1/2"', '4-3/4"', '5-3/4"', '6"', '6-1/2"', '6-3/4"', '8"', '8-1/8"', '8-1/2"', '9-1/2"', '11-3/4"', '12-1/4"', '17-1/2"', '26"'];
  });

  const handleUpdateCategories = (cats: string[]) => {
    setCustomCategories(cats);
    localStorage.setItem('emdad_custom_categories', JSON.stringify(cats));
    showToast(`Tool categories updated (${cats.length} total).`, 'success');
  };

  const handleUpdateSizes = (sizes: string[]) => {
    setCustomSizes(sizes);
    localStorage.setItem('emdad_custom_sizes', JSON.stringify(sizes));
    showToast(`Tool sizes updated (${sizes.length} total).`, 'success');
  };

  // Tool Selection Modal (itemsselect) State
  const [isToolSelectOpen, setIsToolSelectOpen] = useState(false);
  const [isToolModalMaximized, setIsToolModalMaximized] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('CUTLIP GUIDE');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('CUTLIP GUIDE');
  const [selectedToolSize, setSelectedToolSize] = useState<string>('');
  const [checkedToolSerials, setCheckedToolSerials] = useState<string[]>([]);

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

  const categoryInventory = useMemo(() => {
    if (!selectedCategory) return inventory;
    return inventory.filter((t) => {
      const matchShort = (t.shortDesc || '').toUpperCase().includes(selectedCategory.toUpperCase());
      const matchDesc = (t.desc || '').toUpperCase().includes(selectedCategory.toUpperCase());
      return matchShort || matchDesc;
    });
  }, [inventory, selectedCategory]);

  const availableSizes = useMemo(() => {
    const set = new Set<string>(customSizes);
    categoryInventory.forEach((t) => {
      if (t.size) set.add(t.size.trim());
    });
    return Array.from(set).sort();
  }, [categoryInventory, customSizes]);

  const modalAvailableTools = useMemo(() => {
    return categoryInventory.filter((t) => {
      if (!selectedToolSize) return true;
      return (t.size || '').trim() === selectedToolSize.trim();
    });
  }, [categoryInventory, selectedToolSize]);

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

  // Save Job Record
  const handleSaveJobHeader = () => {
    if (isClosedOrInvoiced || isLocked) {
      showToast('Cannot save changes: this job is invoiced and locked in read-only mode.', 'error');
      return;
    }
    const updated = { ...jobData, crewMembers: assignedCrew };
    onSaveJob(updated);
    showToast(`Job ${jobData.id} records updated and saved.`, 'success');
  };

  // Update Callout Header Values
  const handleUpdateCalloutHeader = (field: string, val: string) => {
    if (isClosedOrInvoiced || isLocked) return;
    const updatedCallout: Callout = {
      ...activeCallout,
      [field]: val,
    };
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
    const newlySelectedTools = inventory.filter((t) => checkedToolSerials.includes(t.serial));
    const newItems: CalloutItem[] = newlySelectedTools.map((t, idx) => ({
      seq: checklistItems.length + idx + 1,
      size: t.size || '—',
      shortDesc: t.shortDesc || t.desc,
      qty: 1,
      assigned: 1,
      serialNos: [t.serial],
      status: 'Assigned',
      partNo: t.assetNo || t.serial,
      description: t.desc || t.shortDesc,
      supplier: t.supplier || (t.isEmdad ? 'EMDAD' : 'RUBICON OILFIELD'),
      qtyIn: 1,
      insNum: `GIS-Z-${Math.floor(10000 + Math.random() * 90000)}-2023`,
      insDate: formatDateDD_MM_YYYY(new Date().toISOString()),
      comments: 'ACCEPTED',
      cat: selectedCategory,
      condition: 'ACCEPTED',
    }));

    const updated = [...checklistItems, ...newItems];
    setChecklistItems(updated);
    setCheckedToolSerials([]);
    setIsToolSelectOpen(false);

    const calloutToSave: Callout = {
      ...activeCallout,
      jobId: jobData.id,
      jobNumber: jobData.id,
      items: updated,
    };

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

  // Delete row from checklist
  const handleDeleteChecklistRow = (seq: number) => {
    if (isClosedOrInvoiced || isLocked) return;
    const updated = checklistItems.filter((item) => item.seq !== seq);
    setChecklistItems(updated);
    const calloutToSave: Callout = {
      ...activeCallout,
      jobId: jobData.id,
      jobNumber: jobData.id,
      items: updated,
    };
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

    const curYr = new Date().getFullYear().toString().slice(-2);
    const nextDTNum = `DT-${curYr}-${String(2120 + jobDTs.length).padStart(4, '0')}`;

    const newDT: DTBatch = {
      id: `DTB-${Date.now()}`,
      dtNumber: nextDTNum,
      jobId: jobData.id,
      jobNumber: jobData.id,
      rmDate: formatDateDD_MM_YYYY(new Date().toISOString()),
      rmRef: `MR-${jobData.id.slice(-4) || '881'}`,
      dispatchDate: formatDateDD_MM_YYYY(new Date().toISOString()),
      deliveryDate: formatDateDD_MM_YYYY(new Date().toISOString()),
      rig: jobData.rig,
      well: jobData.well,
      contract: jobData.contractNo || jobData.contract,
      dispatchedBy: user?.name || 'Operations',
      recipient: `${jobData.rig} Toolpusher`,
      notes: `Generated automatically from Checklist ${activeCallout.id}.`,
      isLocked: false,
      toolLines: checklistItems.map((ci, idx) => ({
        id: idx + 1,
        itemNo: idx + 1,
        serial: ci.serialNos?.[0] || ci.partNo || `TOOL-${idx}`,
        assetNo: ci.partNo || ci.serialNos?.[0] || '',
        shortDesc: ci.cat || ci.shortDesc || 'Downhole Tool',
        desc: ci.description || ci.shortDesc || '',
        size: ci.size || '—',
        status: 'OnRig',
        ownership: ci.supplier || 'EMDAD',
        isEmdad: (ci.supplier || '').toUpperCase().includes('EMDAD'),
        qty: ci.qty || 1,
        remarks: 'Mobilized',
      })),
    };

    onSaveDTBatch(newDT);

    if (onSaveCallout) {
      onSaveCallout({
        ...activeCallout,
        status: 'Delivery Ticket - Created',
      });
    }

    setSelectedDTNumber(newDT.dtNumber);
    setActiveTab('delivery-tickets');
    showToast(`Delivery Ticket ${newDT.dtNumber} generated from Checklist with ${checklistItems.length} tool(s)!`, 'success');
  };

  // Delivery Ticket Confirmation & Lock (Ship to Rig)
  const handleConfirmAndLockDT = () => {
    if (!activeDT) return;
    const count = activeDT.toolLines?.length || 0;
    const confirmed = window.confirm(
      `Are you sure you want to confirm dispatch and lock Delivery Ticket ${activeDT.dtNumber}?\n\n` +
      `• Tools to release: ${count}\n` +
      `• Destination: Rig ${jobData.rig} / Well ${jobData.well}\n\n` +
      `This confirms equipment has been released from yard and locks this ticket against modifications.`
    );
    if (!confirmed) return;

    const updatedBatch: DTBatch = {
      ...activeDT,
      isLocked: true,
      lockedBy: user?.name || 'Operations',
      lockedDate: new Date().toISOString(),
      dispatchDate: activeDT.dispatchDate || formatDateDD_MM_YYYY(new Date().toISOString()),
    };

    if (onUpdateDTBatch) {
      onUpdateDTBatch(updatedBatch);
    } else {
      onSaveDTBatch(updatedBatch);
    }

    showToast(`Delivery Ticket ${activeDT.dtNumber} confirmed dispatched and locked. Tools mobilized to Rig ${jobData.rig}.`, 'success');
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
    if (!activeRT) {
      showToast('No active Return Ticket to receive tools into.', 'error');
      return;
    }

    const selectedLines = rgtDTToolsToReturn.filter((t) => rgtCheckedSerials.includes(t.serial));
    const newRTLines = selectedLines.map((t, idx) => ({
      itemNo: (activeRT.toolLines?.length || 0) + idx + 1,
      serial: t.serial,
      assetNo: t.assetNo,
      shortDesc: t.shortDesc,
      desc: t.desc,
      used: true,
      condition: 'USED',
      routedTo: 'Inspection Bay',
      remarks: 'USED',
    }));

    const updatedRT: RTBatch = {
      ...activeRT,
      toolLines: [...(activeRT.toolLines || []), ...newRTLines],
    };

    if (onUpdateRTBatch) {
      onUpdateRTBatch(updatedRT);
    } else {
      onSaveRTBatch(updatedRT);
    }
    setRgtCheckedSerials([]);
    showToast(`Moved ${newRTLines.length} tool(s) to RT ${activeRT.rtNumber}.`, 'success');
  };

  // Print Handlers
  const handlePrintTicket = (type: 'onshore' | 'offshore' | 'report' | 'pob') => {
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

  // Compute operational days and commercial breakdown for each tool in selected month
  const toolUtilizationRows = useMemo(() => {
    return allMobilizedTools.map((t, idx) => {
      const dispMs = parseDateToMs(t.dispatchDate);
      const retMs = t.returnDate ? parseDateToMs(t.returnDate) : 0;

      let sbCount = 0;
      let opsCount = 0;
      const dayStatuses: Record<number, string> = {};

      utilDaysList.forEach((dayNum) => {
        const curDate = new Date(selectedUtilYear, selectedUtilMonth - 1, dayNum).getTime();
        // If within operational window on rig
        const isDispatched = dispMs > 0 ? curDate >= dispMs : true;
        const isReturned = retMs > 0 ? curDate > retMs : false;

        if (isDispatched && !isReturned) {
          // Operational pattern: 2 days standby (S), followed by active drilling (1)
          const daysSinceDisp = dispMs > 0 ? Math.floor((curDate - dispMs) / (1000 * 60 * 60 * 24)) : dayNum;
          if (daysSinceDisp <= 2) {
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

      const standbyRate = 600;
      const opsRate = 1200;
      const totalStandbyRate = sbCount * standbyRate;
      const totalOpsRate = opsCount * opsRate;
      const runCharge = 0;
      const redressCharge = 0;
      const totalMonthValue = totalStandbyRate + totalOpsRate + runCharge + redressCharge;

      return {
        ...t,
        rowSeq: idx + 1,
        dayStatuses,
        sbCount,
        opsCount,
        standbyRate,
        opsRate,
        totalStandbyRate,
        totalOpsRate,
        runCharge,
        redressCharge,
        totalMonthValue,
      };
    });
  }, [allMobilizedTools, selectedUtilMonth, selectedUtilYear, utilDaysList]);

  const monthTotalSB = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.sbCount, 0), [toolUtilizationRows]);
  const monthTotalOps = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.opsCount, 0), [toolUtilizationRows]);
  const monthTotalSBRate = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.totalStandbyRate, 0), [toolUtilizationRows]);
  const monthTotalOpsRate = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.totalOpsRate, 0), [toolUtilizationRows]);
  const monthTotalRunCharge = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.runCharge, 0), [toolUtilizationRows]);
  const monthTotalRedress = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.redressCharge, 0), [toolUtilizationRows]);
  const totalToolRevenueAED = useMemo(() => toolUtilizationRows.reduce((a, r) => a + r.totalMonthValue, 0), [toolUtilizationRows]);

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

      const totalUSD = (opsCount + sbCount) * (eng.dailyRateUSD || 750);

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
          <span>Job Dossier Workspace &bull; Job No: <span className="font-mono text-amber-300">{jobData.id}</span></span>
          {jobData.legalInvoiceNumber && (
            <span className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 px-2 py-0.5 rounded text-[10px] font-mono">
              Legal Inv: {jobData.legalInvoiceNumber}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onBackToRegister && (
            <button
              onClick={onBackToRegister}
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-2.5 py-0.5 rounded cursor-pointer transition font-medium flex items-center gap-1"
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
        {/* SIMPLIFIED LOCK BANNER */}
        {isClosedOrInvoiced && (
          <div className="p-1.5 px-3 mb-3 rounded border bg-amber-50 border-amber-300 text-amber-900 text-xs flex items-center justify-between font-bold shadow-2xs">
            <div className="flex items-center gap-2">
              <span>🔒</span>
              <span>
                Locked (Invoiced){jobData.legalInvoiceNumber ? ` — Legal Invoice: ${jobData.legalInvoiceNumber}` : jobData.draftInvoiceNumber ? ` — Draft Invoice: ${jobData.draftInvoiceNumber}` : ''}
              </span>
            </div>
          </div>
        )}

        {/* Persistent Anchored Job Context Box */}
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
                <label className="w-28 font-bold text-slate-700 text-right pr-3">Service Category:</label>
                <select
                  value={jobData.serviceCategory || jobData.serviceType || 'DOWN HOLE RENTALS'}
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
                  <option value="DOWN HOLE RENTALS">DOWN HOLE RENTALS</option>
                  <option value="FISHING SERVICES">FISHING SERVICES</option>
                  <option value="WHIPSTOCK SERVICES">WHIPSTOCK SERVICES</option>
                  <option value="CASING EXIT SERVICES">CASING EXIT SERVICES</option>
                  <option value="THRU TUBING SERVICES">THRU TUBING SERVICES</option>
                  <option value="MILLING & WORKOVER">MILLING &amp; WORKOVER</option>
                  <option value="WELLBORE CLEANOUT">WELLBORE CLEANOUT</option>
                  <option value="DRILLING TOOLS">DRILLING TOOLS</option>
                  <option value='"DUAL COMPLETION"'>"DUAL COMPLETION"</option>
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

            {/* Right Column: Client, Contract, Contract No, Save Button */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center flex-1">
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
                {!isLocked && (
                  <button
                    type="button"
                    onClick={handleSaveJobHeader}
                    className="bg-[#386cb0] hover:bg-[#2c568f] text-white font-bold text-xs px-3.5 py-1 rounded shadow-sm transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>💾</span>
                    <span>Save Record</span>
                  </button>
                )}
              </div>

              <div className="flex items-center">
                <label className="w-28 font-bold text-slate-700 text-right pr-3">Contract:</label>
                <select
                  value={cleanContractName(jobData.contract) || ''}
                  disabled={isLocked}
                  onChange={(e) => {
                    const chosen = e.target.value;
                    const found = contractOptions.find((co) => co.name === chosen);
                    setJobData({
                      ...jobData,
                      contract: chosen,
                      contractNo: found?.no || jobData.contractNo || '',
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
                  onChange={(e) => setJobData({ ...jobData, contractNo: e.target.value })}
                  className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-mono font-bold text-slate-800 w-64 shadow-2xs focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
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
                  <span className="font-mono font-bold text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs">
                    {totalCumulativeJobValue.toLocaleString()} AED
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

        {/* TAB 1: JOB HEADER & NOTES */}
        {activeTab === 'job-header' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notes &amp; Operational Log:</label>
              <textarea
                rows={12}
                value={jobData.notes || ''}
                disabled={isLocked}
                onChange={(e) => setJobData({ ...jobData, notes: e.target.value })}
                placeholder="Enter job notes, instructions, well history, and operational remarks here..."
                className="w-full bg-white border border-[#9fb6cf] rounded p-3 text-xs text-slate-800 leading-relaxed font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
              />
            </div>
            {!isLocked && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveJobHeader}
                  className="bg-[#386cb0] hover:bg-[#2c568f] text-white font-bold text-xs px-4 py-1.5 rounded shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>💾</span>
                  <span>Save Job Notes</span>
                </button>
              </div>
            )}
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
                <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px]">
                  <tr>
                    <th className="py-1 px-2 whitespace-nowrap text-center w-12">Seq</th>
                    <th className="py-1 px-2 whitespace-nowrap">Badge #</th>
                    <th className="py-1 px-2 whitespace-nowrap">Engineer / Supervisor Name</th>
                    <th className="py-1 px-2 whitespace-nowrap">Role / Designation</th>
                    <th className="py-1 px-2 whitespace-nowrap font-mono">Mob Date</th>
                    <th className="py-1 px-2 whitespace-nowrap font-mono">Demob Date</th>
                    <th className="py-1 px-2 whitespace-nowrap">Rig Pass / Cert</th>
                    <th className="py-1 px-2 whitespace-nowrap font-mono">H2S Expiry</th>
                    <th className="py-1 px-2 whitespace-nowrap text-center">Status</th>
                    {!isClosedOrInvoiced && !isLocked && <th className="py-1 px-2 whitespace-nowrap text-center w-16">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {assignedCrew.length === 0 ? (
                    <tr>
                      <td colSpan={isClosedOrInvoiced || isLocked ? 9 : 10} className="p-6 text-center text-slate-500 font-medium">
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
                    {activeCallout.status || defaultChecklistStatus}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!isClosedOrInvoiced && !isLocked && (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsToolSelectOpen(true)}
                        className="bg-[#107c41] hover:bg-[#0c6233] text-white font-bold text-xs px-3 py-1 rounded-full shadow-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <span>➕</span>
                        <span>Select Tools</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleGenerateDTFromChecklist}
                        className="bg-blue-800 hover:bg-blue-900 text-white font-bold text-xs px-3.5 py-1 rounded shadow-xs transition cursor-pointer flex items-center gap-1.5"
                        title="Transfer reserved checklist tools directly into a new Delivery Ticket"
                      >
                        <span>🚚</span>
                        <span>Generate DT from Checklist</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => handlePrintTicket('report')}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs px-2.5 py-1 rounded transition cursor-pointer"
                  >
                    PRINT REPORT
                  </button>
                </div>
              </div>

              {/* Checklist Field Grid - Editable inputs for new checklist header */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-white p-2 rounded border border-slate-200">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-slate-600 w-16">Callout No:</span>
                  <input
                    type="text"
                    value={activeCallout.id || ''}
                    disabled={isClosedOrInvoiced || isLocked}
                    onChange={(e) => handleUpdateCalloutHeader('id', e.target.value)}
                    className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-blue-900 w-28 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-slate-600 w-16">Req Date:</span>
                  <input
                    type="text"
                    value={activeCallout.reqDate || ''}
                    disabled={isClosedOrInvoiced || isLocked}
                    placeholder="DD-MM-YYYY"
                    onChange={(e) => handleUpdateCalloutHeader('reqDate', e.target.value)}
                    className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono w-28 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-slate-600 w-16">Project No:</span>
                  <input
                    type="text"
                    value={activeCallout.projectNo || jobData.contractNo || ''}
                    disabled={isClosedOrInvoiced || isLocked}
                    onChange={(e) => handleUpdateCalloutHeader('projectNo', e.target.value)}
                    className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono w-28 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-slate-600 w-16">PO Number:</span>
                  <input
                    type="text"
                    value={activeCallout.poNumber || jobData.poNumber || ''}
                    disabled={isClosedOrInvoiced || isLocked}
                    onChange={(e) => handleUpdateCalloutHeader('poNumber', e.target.value)}
                    className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono w-28 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-slate-600 w-16">Rig / Well:</span>
                  <span className="font-bold text-slate-800 font-mono">{jobData.rig} / {jobData.well}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-slate-600 w-16">Email Ref:</span>
                  <input
                    type="text"
                    value={activeCallout.emailRef || ''}
                    disabled={isClosedOrInvoiced || isLocked}
                    placeholder="Client authorization / email"
                    onChange={(e) => handleUpdateCalloutHeader('emailRef', e.target.value)}
                    className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs w-36 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-slate-600 w-16">Status:</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                    automatedChecklistStatus.includes('Closed')
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : automatedChecklistStatus.includes('Dispatched')
                      ? 'bg-purple-100 text-purple-900 border-purple-300'
                      : automatedChecklistStatus.includes('Delivery Ticket')
                      ? 'bg-blue-100 text-blue-900 border-blue-300'
                      : automatedChecklistStatus.includes('In Progress')
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-slate-100 text-slate-800 border-slate-300'
                  }`}>
                    {automatedChecklistStatus}
                  </span>
                </div>
              </div>
            </div>

            {/* Checklist Table */}
            <div className="border border-[#b8cce0] rounded overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px]">
                  <tr>
                    <th className="p-1.5 text-center w-12">ItemNo</th>
                    <th className="p-1.5">PartNo / Serial</th>
                    <th className="p-1.5">Description</th>
                    <th className="p-1.5 text-center w-14">DTQTY</th>
                    <th className="p-1.5">Supplier</th>
                    <th className="p-1.5 text-center w-14">QTYIN</th>
                    <th className="p-1.5">INS_NUM</th>
                    <th className="p-1.5">INS_DATE</th>
                    <th className="p-1.5">Comments</th>
                    <th className="p-1.5">Category</th>
                    {!isClosedOrInvoiced && !isLocked && <th className="p-1.5 text-center w-16">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {checklistItems.length === 0 ? (
                    <tr>
                      <td colSpan={isClosedOrInvoiced || isLocked ? 10 : 11} className="p-6 text-center text-slate-500 font-medium">
                        No tools in checklist.
                        {!isClosedOrInvoiced && !isLocked && (
                          <span> Click <strong>&quot;Select Tools&quot;</strong> above to pick available tools from yard inventory.</span>
                        )}
                      </td>
                    </tr>
                  ) : (
                    checklistItems.map((item, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 h-7 leading-none">
                        <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{i + 1}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{item.partNo || item.serialNos?.[0] || '—'}</td>
                        <td className="py-1 px-2 whitespace-nowrap truncate max-w-[320px] font-medium text-slate-800" title={item.description || item.shortDesc}>{item.description || item.shortDesc}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-center font-bold">{item.qty || 1}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-medium text-slate-700">{item.supplier || 'EMDAD'}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-center font-bold">{item.qtyIn || 1}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-blue-700">{item.insNum || 'GIS-Z-01480-2023'}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">{formatDateDD_MM_YYYY(item.insDate)}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-bold text-emerald-700">{item.comments || 'ACCEPTED'}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-[11px] text-slate-600">{item.cat || item.shortDesc}</td>
                        {!isClosedOrInvoiced && !isLocked && (
                          <td className="py-1 px-2 whitespace-nowrap text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteChecklistRow(item.seq)}
                              className="text-red-600 hover:text-red-800 font-bold text-[11px] hover:underline cursor-pointer"
                              title="Delete row and return tool to inventory"
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
          </div>
        )}

        {/* TAB 5: DELIVERY TICKET HEADER / RENTAL TICKET */}
        {activeTab === 'delivery-tickets' && (
          <div className="space-y-3">
            {/* Header: Clean Dropdown for DT selection instead of multi-row badges */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-300 pb-2 gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Select Delivery Ticket:</label>
                {jobDTs.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">No delivery tickets yet.</span>
                ) : (
                  <select
                    value={selectedDTNumber}
                    onChange={(e) => setSelectedDTNumber(e.target.value)}
                    className="bg-white border border-[#9fb6cf] rounded px-3 py-1 text-xs font-mono font-bold text-[#1a3055] shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500 min-w-[240px]"
                  >
                    {jobDTs.map((dt) => (
                      <option key={dt.dtNumber} value={dt.dtNumber}>
                        {dt.dtNumber} — {dt.toolLines?.length || 0} tool(s) ({formatDateDD_MM_YYYY(dt.dispatchDate)})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeDT && (
                  activeDT.isLocked || isClosedOrInvoiced ? (
                    <span className="bg-purple-100 text-purple-900 border border-purple-300 font-bold text-xs px-3 py-1 rounded flex items-center gap-1 shadow-2xs">
                      <span>🔒</span>
                      <span>Dispatched &amp; Locked (Shipped to Rig)</span>
                    </span>
                  ) : (
                    !isClosedOrInvoiced && !isLocked && (
                      <button
                        type="button"
                        onClick={handleConfirmAndLockDT}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3.5 py-1 rounded shadow-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <span>🚚</span>
                        <span>Confirm Dispatch &amp; Lock DT (Ship to Rig)</span>
                      </button>
                    )
                  )
                )}
                <button
                  type="button"
                  onClick={() => handlePrintTicket('onshore')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-2.5 py-1 rounded border border-slate-300 cursor-pointer"
                >
                  Print Onshore Ticket
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintTicket('offshore')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-2.5 py-1 rounded border border-slate-300 cursor-pointer"
                >
                  Print Offshore Ticket
                </button>
              </div>
            </div>

            {/* Rental Ticket Form / Details */}
            {activeDT ? (
              <div className="space-y-3">
                <div className="bg-[#f0f5fb] border border-[#b8cce0] rounded p-3 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                    <h3 className="font-bold text-blue-900 text-sm">Rental Ticket / Delivery Manifest</h3>
                    <span className="text-xs font-mono">
                      Ticket No : <strong className="text-red-600 font-bold text-base">{activeDT.dtNumber}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <span className="font-bold text-slate-600">Customer:</span>{' '}
                      <span className="font-bold">{jobData.client}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-600">Project No:</span>{' '}
                      <span className="font-mono">{jobData.contractNo || '444558'}</span>
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
                      <span className="font-mono font-bold">{formatDateDD_MM_YYYY(activeDT.dispatchDate)}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-600">RM Ref / Manifest:</span>{' '}
                      <span className="font-mono">{activeDT.rmRef || 'MR-881'}</span>
                    </div>
                  </div>
                </div>

                {/* Mobilized Tools Table */}
                <div className="border border-[#b8cce0] rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px]">
                      <tr>
                        <th className="p-1.5 text-center w-12">ItemNo</th>
                        <th className="p-1.5">PartNo / Serial</th>
                        <th className="p-1.5">Description</th>
                        <th className="p-1.5 text-center w-14">DTQTY</th>
                        <th className="p-1.5">DATEOUT</th>
                        <th className="p-1.5">Job Number</th>
                        <th className="p-1.5">RGT_No</th>
                        <th className="p-1.5">Date_In</th>
                        <th className="p-1.5">Supplier</th>
                        <th className="p-1.5">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeDT.toolLines?.map((t, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/50 h-7 leading-none">
                          <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{idx + 1}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{t.serial || t.assetNo}</td>
                          <td className="py-1 px-2 whitespace-nowrap truncate max-w-[340px] font-medium text-slate-800" title={t.desc || t.shortDesc}>{t.desc || t.shortDesc}</td>
                          <td className="py-1 px-2 whitespace-nowrap text-center font-bold">{t.qty || 1}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">{formatDateDD_MM_YYYY(activeDT.dispatchDate)}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono text-blue-700">{jobData.id}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono text-slate-500">{t.rtBatchId || '—'}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono text-slate-500">—</td>
                          <td className="py-1 px-2 whitespace-nowrap text-slate-700">{t.ownership || 'EMDAD'}</td>
                          <td className="py-1 px-2 whitespace-nowrap text-slate-600 text-[11px]">{t.shortDesc || 'Downhole Tool'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Logistics fields - Balanced 3-column layout without 'Ready to Go' */}
                <div className="bg-[#f8fafc] border border-slate-300 rounded p-3 text-xs grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Column 1: Dispatch Authority */}
                  <div className="space-y-1.5 bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
                    <div className="font-bold text-slate-700 border-b pb-1 text-[11px] uppercase tracking-wider text-blue-900">
                      1. Dispatch Authority
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-600">Prepared By:</span>
                      <input
                        type="text"
                        defaultValue={activeDT.dispatchedBy || 'Operations'}
                        disabled={isLocked}
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-40 text-xs disabled:bg-slate-100"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-600">Designation:</span>
                      <input
                        type="text"
                        defaultValue="WORKSHOP COORDINATOR"
                        disabled={isLocked}
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-40 text-xs disabled:bg-slate-100"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-600">Dispatch Date:</span>
                      <span className="font-mono font-bold text-slate-800 text-xs">{formatDateDD_MM_YYYY(activeDT.dispatchDate)}</span>
                    </div>
                  </div>

                  {/* Column 2: Logistics & Destination */}
                  <div className="space-y-1.5 bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
                    <div className="font-bold text-slate-700 border-b pb-1 text-[11px] uppercase tracking-wider text-blue-900">
                      2. Destination &amp; Marine Logistics
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-600">Delivered To:</span>
                      <input
                        type="text"
                        defaultValue="ESNAD JETTY"
                        disabled={isLocked}
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-40 text-xs disabled:bg-slate-100"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-600">Vessel / Boat:</span>
                      <input
                        type="text"
                        defaultValue="ZAKHER STAR"
                        disabled={isLocked}
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-40 text-xs disabled:bg-slate-100"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-600">Transport:</span>
                      <input
                        type="text"
                        defaultValue="EMDAD"
                        disabled={isLocked}
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-40 text-xs disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  {/* Column 3: Road Haulage & Driver */}
                  <div className="space-y-1.5 bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
                    <div className="font-bold text-slate-700 border-b pb-1 text-[11px] uppercase tracking-wider text-blue-900">
                      3. Haulage &amp; Driver Details
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-600">Vehicle No:</span>
                      <input
                        type="text"
                        defaultValue="54912"
                        disabled={isLocked}
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-40 text-xs disabled:bg-slate-100 font-mono"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-600">Driver Name:</span>
                      <input
                        type="text"
                        defaultValue="LUQMAN KHAN"
                        disabled={isLocked}
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-40 text-xs disabled:bg-slate-100"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-600">Contact No:</span>
                      <input
                        type="text"
                        defaultValue="+971565256707"
                        disabled={isLocked}
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-40 text-xs font-mono disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 font-medium">
                No Delivery Tickets issued yet for Job {jobData.id}.
              </div>
            )}
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
                  <span className="text-xs text-slate-400 italic">No return tickets for this job yet.</span>
                ) : (
                  <select
                    value={selectedRTNumber}
                    onChange={(e) => setSelectedRTNumber(e.target.value)}
                    className="bg-white border border-[#9fb6cf] rounded px-3 py-1 text-xs font-mono font-bold text-[#1a3055] shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500 min-w-[240px]"
                  >
                    {jobRTs.map((rt) => (
                      <option key={rt.rtNumber} value={rt.rtNumber}>
                        {rt.rtNumber} — {rt.toolLines?.length || 0} tool(s) ({formatDateDD_MM_YYYY(rt.rtDate)})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePrintTicket('onshore')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-2.5 py-1 rounded border border-slate-300 cursor-pointer"
                >
                  Onshore ticket
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintTicket('offshore')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-2.5 py-1 rounded border border-slate-300 cursor-pointer"
                >
                  Offshore ticket
                </button>
              </div>
            </div>

            {activeRT ? (
              <div className="bg-[#f0f5fb] border border-[#b8cce0] rounded p-3 text-xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="font-bold text-blue-900 text-sm">RETURN TICKET</h3>
                  <span className="text-xs font-mono">
                    TicketNo: <strong className="text-red-600 font-bold text-base">{activeRT.rtNumber || '—'}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div>
                    <span className="font-bold text-slate-600">Customer:</span>{' '}
                    <span className="font-bold text-slate-900">{jobData.client}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Contract / Project:</span>{' '}
                    <span className="font-mono">{jobData.contractNo || cleanContractName(jobData.contract) || '—'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Rig / Well:</span>{' '}
                    <span className="font-mono font-bold text-blue-900">{jobData.rig} / {jobData.well}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Date:</span>{' '}
                    <span className="font-mono font-bold">{activeRT.rtDate ? formatDateDD_MM_YYYY(activeRT.rtDate) : '—'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">Shipped Via:</span>{' '}
                    <span>{activeRT.carrier || 'EMDAD'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">L/Note Date:</span>{' '}
                    <span className="font-mono">{activeRT.loadingNoteDate ? formatDateDD_MM_YYYY(activeRT.loadingNoteDate) : '—'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-600">L/Note No:</span>{' '}
                    <span className="font-mono font-bold">{activeRT.loadingNoteNo || activeRT.lNoteNo || '—'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 font-medium bg-slate-50 border border-slate-200 rounded">
                No Return Tickets issued yet for Job {jobData.id}.
              </div>
            )}

            {/* Upper Table: Tools in active RT */}
            <div className="border border-[#b8cce0] rounded overflow-hidden">
              <div className="bg-slate-100 px-3 py-1 border-b border-slate-200 font-bold text-xs text-slate-700 flex justify-between">
                <span>Received Tools in Return Ticket</span>
                <span className="text-emerald-700">Total Returned: {activeRT?.toolLines?.length || 0} tools</span>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px]">
                  <tr>
                    <th className="p-1.5 text-center w-12">ItemNo</th>
                    <th className="p-1.5">PartNo / Serial</th>
                    <th className="p-1.5">Description</th>
                    <th className="p-1.5 text-center">RGT_No</th>
                    <th className="p-1.5">Date_In</th>
                    <th className="p-1.5">Comments (Condition)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {!activeRT || !activeRT.toolLines || activeRT.toolLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-500">
                        No returned tools added to this ticket yet.
                      </td>
                    </tr>
                  ) : (
                    activeRT.toolLines.map((t, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/50 h-7 leading-none">
                        <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{idx + 1}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{t.serial || t.assetNo}</td>
                        <td className="py-1 px-2 whitespace-nowrap truncate max-w-[340px] font-medium text-slate-800" title={t.desc || t.shortDesc}>{t.desc || t.shortDesc}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-center font-mono font-bold text-blue-800">{activeRT.rtNumber}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">{activeRT.rtDate ? formatDateDD_MM_YYYY(activeRT.rtDate) : '—'}</td>
                        <td className="py-1 px-2 whitespace-nowrap">
                          <select
                            defaultValue={t.used ? 'USED' : 'NOT USED'}
                            disabled={isClosedOrInvoiced || isLocked}
                            className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-slate-800 cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
                          >
                            <option value="USED">USED</option>
                            <option value="NOT USED">NOT USED</option>
                            <option value="DAMAGED">DAMAGED</option>
                            <option value="LOST IN HOLE">LOST IN HOLE (LIH)</option>
                          </select>
                        </td>
                      </tr>
                    ))
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

                  {!isClosedOrInvoiced && !isLocked && (
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

                {/* Lower DT Table: Tools from the selected DT */}
                <div className="border border-amber-200 rounded overflow-hidden bg-white">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-amber-100/70 text-amber-950 font-bold text-[11px]">
                      <tr>
                        <th className="p-1.5 text-center w-12">TicketNo</th>
                        <th className="p-1.5 text-center w-12">ItemNo</th>
                        <th className="p-1.5">PartNo / Serial</th>
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
                          const isChecked = rgtCheckedSerials.includes(t.serial);
                          return (
                            <tr key={idx} className={`h-7 leading-none ${isChecked ? 'bg-amber-100/80 font-semibold' : 'hover:bg-slate-50'}`}>
                              <td className="py-1 px-2 whitespace-nowrap text-center font-mono text-slate-600">{rgtSearchDTNo}</td>
                              <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{idx + 1}</td>
                              <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{t.serial}</td>
                              <td className="py-1 px-2 whitespace-nowrap truncate max-w-[340px] font-medium text-slate-800" title={t.desc || t.shortDesc}>{t.desc || t.shortDesc}</td>
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

              <div className="flex items-center gap-2">
                <span className="text-slate-600 text-xs">
                  Mobilized Tools in Month: <strong className="font-mono text-blue-900">{toolUtilizationRows.length}</strong>
                </span>
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
              <div className="bg-[#1a3055] text-white px-3 py-1.5 rounded-t font-bold text-xs flex items-center justify-between">
                <span>Downhole Tool Fleet Utilization &bull; {MONTH_NAMES[selectedUtilMonth - 1]} {selectedUtilYear}</span>
                <span className="text-emerald-400 font-mono text-[11px]">
                  Total Tool Revenue: {totalToolRevenueAED.toLocaleString()} AED
                </span>
              </div>
              <div className="border border-slate-300 rounded-b overflow-x-auto bg-white shadow-inner">
                <table className="w-full text-left text-[11px] border-collapse min-w-[2400px]">
                  <thead className="bg-[#e9f0f8] text-[#1a3055] font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-1.5 text-center w-9 min-w-[36px]">#</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[110px]">DT NO</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[95px]">DEL DATE</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[130px]">ASSET / SERIAL</th>
                      <th className="p-1.5 whitespace-nowrap min-w-[240px]">DESCRIPTION</th>
                      <th className="p-1.5 text-center w-12 min-w-[48px]">QTY</th>
                      <th className="p-1.5 text-center whitespace-nowrap min-w-[90px]">STATUS</th>
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
                      <th className="p-1.5 text-right bg-amber-100 text-amber-950 font-bold pr-3 whitespace-nowrap min-w-[160px]">TOTAL VALUE FOR MONTH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {toolUtilizationRows.length === 0 ? (
                      <tr>
                        <td colSpan={utilDaysList.length + 16} className="p-8 text-center text-slate-500 font-medium">
                          No mobilized tools found for Job {jobData.id} in {MONTH_NAMES[selectedUtilMonth - 1]} {selectedUtilYear}.
                        </td>
                      </tr>
                    ) : (
                      toolUtilizationRows.map((row) => (
                        <tr key={row.rowSeq} className="hover:bg-blue-50/50 h-7 leading-none">
                          <td className="p-1 text-center font-mono text-slate-500">{row.rowSeq}</td>
                          <td className="p-1 font-mono text-blue-700 font-bold whitespace-nowrap">{row.dtNumber}</td>
                          <td className="p-1 font-mono whitespace-nowrap text-[10px]">{formatDateDD_MM_YYYY(row.dispatchDate)}</td>
                          <td className="p-1 font-mono font-bold whitespace-nowrap">{row.serial || row.assetNo}</td>
                          <td className="p-1 truncate max-w-[240px]" title={row.desc || row.shortDesc}>{row.desc || row.shortDesc}</td>
                          <td className="p-1 text-center font-bold">{row.qty || 1}</td>
                          <td className="p-1 text-center whitespace-nowrap">
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                              {row.status || 'On Rig'}
                            </span>
                          </td>
                          {utilDaysList.map((day) => {
                            const val = row.dayStatuses[day];
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
                          <td className="p-1 text-center font-bold text-blue-800 bg-blue-50/40">{row.sbCount}</td>
                          <td className="p-1 text-center font-bold text-emerald-800 bg-emerald-50/40">{row.opsCount}</td>
                          <td className="p-1 text-right font-mono text-slate-700">{row.standbyRate.toLocaleString()}</td>
                          <td className="p-1 text-right font-mono text-slate-700">{row.opsRate.toLocaleString()}</td>
                          <td className="p-1 text-right font-mono font-bold text-blue-900 bg-blue-50/30">{row.totalStandbyRate.toLocaleString()}</td>
                          <td className="p-1 text-right font-mono font-bold text-emerald-900 bg-emerald-50/30">{row.totalOpsRate.toLocaleString()}</td>
                          <td className="p-1 text-right font-mono text-slate-600">{row.runCharge.toLocaleString()}</td>
                          <td className="p-1 text-right font-mono text-slate-600">{row.redressCharge.toLocaleString()}</td>
                          <td className="p-1 text-right font-mono font-bold pr-2 text-slate-900 bg-amber-50/50">{row.totalMonthValue.toLocaleString()} AED</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {toolUtilizationRows.length > 0 && (
                    <tfoot className="bg-[#e9f0f8] font-bold text-[#1a3055] border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={7} className="p-1.5 text-right uppercase">Fleet Totals:</td>
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
                        <td className="p-1.5 text-right font-mono text-base text-slate-900 pr-2">
                          {totalToolRevenueAED.toLocaleString()} AED
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
                <span className="text-amber-300 font-mono text-base font-extrabold">{totalCumulativeJobValue.toLocaleString()} AED</span>
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
              <button
                type="button"
                onClick={() => setIsPersonnelSelectOpen(false)}
                className="text-white hover:text-amber-300 font-bold text-base cursor-pointer px-1"
              >
                &times;
              </button>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredPersonnelRoster.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500 font-medium">
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
                            <td className="py-1 px-2 whitespace-nowrap truncate max-w-[240px] text-slate-700" title={p.designation}>{p.designation}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-blue-700">{p.rigPassNo}</td>
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

      {/* ITEMSSELECT TOOL PICKER MODAL */}
      {isToolSelectOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div
            className={`bg-[#dce6f1] border-2 border-[#1a3055] rounded-md shadow-2xl flex flex-col overflow-hidden transition-all duration-150 ${
              isToolModalMaximized
                ? 'w-[98vw] h-[95vh] max-w-none max-h-none'
                : 'w-full max-w-5xl h-[640px] max-h-[92vh]'
            }`}
            style={{ fontFamily: "'Calibri', 'Arial Nova', 'Segoe UI', Arial, sans-serif", fontSize: '9pt' }}
          >
            <div className="bg-[#1a3055] text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold flex-shrink-0">
              <div className="flex items-center gap-2">
                <span>itemsselect &bull; Tool Assignment Picker</span>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsAdminCategoriesOpen(true)}
                    className="text-xs bg-amber-400 hover:bg-amber-300 text-slate-900 px-2 py-0.5 rounded font-bold cursor-pointer transition flex items-center gap-1"
                  >
                    <span>⚙️</span>
                    <span>Manage Categories &amp; Sizes</span>
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
                  onClick={() => setIsToolSelectOpen(false)}
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
                          placeholder="Type category..."
                          className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-800 w-56 sm:w-64 shadow-2xs cursor-text focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                        {categorySearchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setCategorySearchQuery('');
                              setIsCategoryDropdownOpen(true);
                            }}
                            className="absolute right-2 text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Dropdown Options */}
                      {isCategoryDropdownOpen && (
                        <div className="absolute left-0 top-full mt-1 w-72 max-h-60 overflow-y-auto bg-white border-2 border-[#1a3055] rounded shadow-2xl z-50 text-xs divide-y divide-slate-100">
                          <div className="bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 flex justify-between items-center sticky top-0 border-b border-slate-200">
                            <span>Matching Categories ({filteredCategories.length})</span>
                            <button
                              type="button"
                              onClick={() => setIsCategoryDropdownOpen(false)}
                              className="text-slate-500 hover:text-red-600 font-bold px-1"
                            >
                              ✕
                            </button>
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
                      className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-800 w-36 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">All Sizes</option>
                      {availableSizes.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 font-medium">
                  Available in Category: <strong className="text-slate-900">{modalAvailableTools.length}</strong>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded px-2.5 py-1 text-[11px] text-blue-900 leading-tight flex-shrink-0">
                Type in the category box above to filter downhole tools. Select with checkbox and click <strong>&quot;Insert Selected Tools&quot;</strong> to reserve tools for Job {jobData.id}.
              </div>

              {/* Tools Table */}
              <div className="flex-1 min-h-0 bg-white border border-[#9fb6cf] rounded overflow-auto shadow-inner">
                <table className="w-full text-left border-collapse text-[11.5px] min-w-[850px]">
                  <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#9fb6cf] font-bold text-[11px] sticky top-0 z-10 shadow-2xs">
                    <tr>
                      <th className="py-1 px-3 whitespace-nowrap min-w-[130px]">PartNo / Serial</th>
                      <th className="py-1 px-3 whitespace-nowrap min-w-[340px]">Description</th>
                      <th className="py-1 px-2 whitespace-nowrap text-center w-16">DTQTY</th>
                      <th className="py-1 px-3 whitespace-nowrap min-w-[120px]">Supplier</th>
                      <th className="py-1 px-2 whitespace-nowrap min-w-[95px]">Ins_Date</th>
                      <th className="py-1 px-2 whitespace-nowrap min-w-[130px]">Ins_Num</th>
                      <th className="py-1 px-2 whitespace-nowrap min-w-[100px]">Condition</th>
                      <th className="py-1 px-2 whitespace-nowrap text-center w-16">select [✓]</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {modalAvailableTools.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">
                          No available tools found in yard for Category: <strong>{selectedCategory}</strong> {selectedToolSize && `(Size: ${selectedToolSize})`}.
                        </td>
                      </tr>
                    ) : (
                      modalAvailableTools.map((tool) => {
                        const isChecked = checkedToolSerials.includes(tool.serial);
                        return (
                          <tr
                            key={tool.serial}
                            onClick={() => {
                              if (isChecked) {
                                setCheckedToolSerials((prev) => prev.filter((s) => s !== tool.serial));
                              } else {
                                setCheckedToolSerials((prev) => [...prev, tool.serial]);
                              }
                            }}
                            className={`cursor-pointer transition h-7 leading-none ${
                              isChecked ? 'bg-amber-100/80 font-semibold' : 'hover:bg-blue-50/60'
                            }`}
                          >
                            <td className="py-1 px-3 whitespace-nowrap font-mono font-bold text-slate-900">{tool.assetNo || tool.serial}</td>
                            <td className="py-1 px-3 whitespace-nowrap font-medium text-slate-800" title={tool.desc || tool.shortDesc}>
                              {tool.desc || tool.shortDesc}
                            </td>
                            <td className="py-1 px-2 whitespace-nowrap text-center font-bold">{tool.qty || 1}</td>
                            <td className="py-1 px-3 whitespace-nowrap text-slate-700">{tool.supplier || (tool.isEmdad ? 'EMDAD' : 'Sub-Contractor')}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">31-03-2023</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-blue-700">GIS-Z-01073-2023</td>
                            <td className="py-1 px-2 whitespace-nowrap font-bold text-emerald-700">ACCEPTED</td>
                            <td className="py-1 px-2 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setCheckedToolSerials((prev) => [...prev, tool.serial]);
                                  } else {
                                    setCheckedToolSerials((prev) => prev.filter((s) => s !== tool.serial));
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

              {/* Footer */}
              <div className="flex items-center justify-between pt-1 flex-shrink-0">
                <span className="text-slate-700 text-[11px]">
                  Total matching items: <strong>{modalAvailableTools.length}</strong> | Selected: <strong className="text-blue-900">{checkedToolSerials.length}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsToolSelectOpen(false)}
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

      {/* ADMIN TOOL CATEGORIES & SIZES MODAL */}
      <AdminCategoriesModal
        isOpen={isAdminCategoriesOpen}
        onClose={() => setIsAdminCategoriesOpen(false)}
        categories={customCategories}
        onUpdateCategories={handleUpdateCategories}
        sizes={customSizes}
        onUpdateSizes={handleUpdateSizes}
        isAdmin={isAdmin}
      />
    </div>
  );
};
