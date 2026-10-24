import React, { useMemo, useState, useEffect } from 'react';
import {
  NavModule,
  User,
  ToolItem,
  DrillingJob,
  Callout,
  DTBatch,
  RTBatch,
  MaintenanceRecord,
  InspectionRecord,
  ContractRecord,
  JobUtData,
} from '../types';
import { fetchDashboardKpis, DashboardKpis } from '../services/api';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  Layers,
  Building2,
  ArrowRight,
  PieChart as PieChartIcon,
  BarChart3,
  Sparkles,
  FileSpreadsheet,
  ExternalLink,
  ChevronRight,
  ArrowUpRight,
  Zap,
  CheckCircle2,
  ShieldCheck,
  Calendar,
  Coins,
  Globe2,
  RefreshCw,
  Clock,
} from 'lucide-react';
import {
  REVENUE_SUMMARY,
  TOP_CATEGORIES_REVENUE,
  TOP_CONTRACTS_REVENUE,
} from '../data/revenueSummary';

interface DashboardViewProps {
  user?: User | null;
  inventory: ToolItem[];
  jobs: DrillingJob[];
  callouts: Callout[];
  dtBatches: DTBatch[];
  rtBatches?: RTBatch[];
  inspections: InspectionRecord[];
  maintenance: MaintenanceRecord[];
  contracts?: ContractRecord[];
  jobUtMap?: Record<string, JobUtData>;
  dbStatus?: any;
  onRefreshSql?: () => void;
  onNavigate: (mod: NavModule) => void;
  onOpenAddAsset?: () => void;
  onOpenAddCallout?: () => void;
  onUpdateDTBatch?: (batch: DTBatch) => void;
  onUpdateRTBatch?: (batch: RTBatch) => void;
}

const PALETTE = ['#1a3055', '#2563eb', '#0d9488', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#06b6d4'];

export const getCanonicalOperator = (client?: string | null): string => {
  if (!client) return 'Other';
  const c = client.trim();
  const upper = c.toUpperCase().replace(/[_-]/g, ' ');
  if (upper.includes('ADNOC') && (upper.includes('OFFSHORE') || upper.includes('OFF SHORE'))) return 'ADNOC Offshore';
  if (upper.includes('ADNOC') && (upper.includes('ONSHORE') || upper.includes('ON SHORE'))) return 'ADNOC Onshore';
  if (upper.includes('ADNOC') && upper.includes('DRILLING')) return 'ADNOC Drilling';
  if (upper.includes('TURNWELL')) return 'Turnwell';
  if (upper.includes('CHURCHILL') || upper.includes('CHRUCHILL') || upper.includes('CORETRAX')) return 'Churchill';
  if (upper.includes('BUNDUQ')) return 'Bunduq';
  if (upper.includes('COSMO')) return 'Cosmo';
  if (upper.includes('NABORS') || upper.includes('ITS')) return 'ITS (Nabors)';
  return c;
};

export const formatDateDisplay = (dateVal?: string | null): string => {
  if (!dateVal || dateVal === '—' || dateVal === '-' || String(dateVal).toLowerCase() === 'null') return '—';
  const str = String(dateVal).trim();
  if (/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(str)) {
    return str;
  }
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }
  } catch {}
  return str;
};

const isLegalInvoice = (inv?: string | null): boolean => {
  if (!inv) return false;
  const s = String(inv).trim().toUpperCase();
  return s.startsWith('FSH') || s.startsWith('FR') || s.startsWith('WHP');
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  inventory = [],
  jobs = [],
  callouts = [],
  dtBatches = [],
  rtBatches = [],
  inspections = [],
  maintenance = [],
  contracts = [],
  jobUtMap = {},
  dbStatus,
  onRefreshSql,
  onNavigate,
  onOpenAddAsset,
  onOpenAddCallout,
}) => {
  const [dashboardMode, setDashboardMode] = useState<'operations' | 'management'>('operations');
  const [currencyMode, setCurrencyMode] = useState<'AED' | 'USD' | 'NATIVE'>('AED');
  const [categoryChartMetric, setCategoryChartMetric] = useState<'total' | 'split'>('split');
  const [serverKpis, setServerKpis] = useState<DashboardKpis | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchDashboardKpis().then((data) => {
      if (mounted && data) {
        setServerKpis(data);
      }
    });
    return () => {
      mounted = false;
    };
  }, [dbStatus?.lastChecked]);

  // Live aggregation of Jobs by Client / Operator (Top 12) from real jobs database
  const clientJobsBenchmarkData = useMemo(() => {
    const counts: Record<string, number> = {};
    const colors = [
      '#78350f', '#c2611a', '#d97706', '#b45309', '#4d7c0f',
      '#0f766e', '#0284c7', '#4338ca', '#6d28d9', '#831843',
      '#9f1239', '#881337', '#047857', '#b91c1c'
    ];

    if (jobs && jobs.length > 0) {
      jobs.forEach((j) => {
        const raw = (j.client || '').trim();
        if (!raw) return;
        const norm = getCanonicalOperator(raw).toUpperCase();
        counts[norm] = (counts[norm] || 0) + 1;
      });

      const list = Object.entries(counts)
        .map(([name, count]) => ({ name, jobs: count }))
        .sort((a, b) => b.jobs - a.jobs)
        .slice(0, 12);

      if (list.length > 0) {
        return list.map((item, idx) => ({
          ...item,
          color: colors[idx % colors.length],
        }));
      }
    }

    // Default benchmark fallback
    return [
      { name: 'ADNOC ONSHORE', jobs: 1731, color: '#78350f' },
      { name: 'ADNOC OFFSHORE', jobs: 1196, color: '#c2611a' },
      { name: 'ADNOC DRILLING', jobs: 253, color: '#d97706' },
      { name: 'ITS (NABORS)', jobs: 194, color: '#b45309' },
      { name: 'WELLBORE INTEGRITY SOLUTIONS', jobs: 119, color: '#4d7c0f' },
      { name: 'BAKER HUGHES', jobs: 46, color: '#0f766e' },
      { name: 'WEATHERFORD', jobs: 46, color: '#0284c7' },
      { name: 'CHURCHILL', jobs: 43, color: '#4338ca' },
      { name: 'TURNWELL', jobs: 32, color: '#6d28d9' },
      { name: 'BUNDUQ', jobs: 17, color: '#831843' },
      { name: 'GOSS', jobs: 13, color: '#9f1239' },
      { name: 'HALLIBURTON', jobs: 12, color: '#881337' },
    ];
  }, [jobs]);

  // Live aggregation of Jobs by Service Category (Top 15) from real jobs database
  const serviceCategoryJobsBenchmarkData = useMemo(() => {
    const counts: Record<string, number> = {};
    const colors = [
      '#78350f', '#c2611a', '#d97706', '#ca8a04', '#4d7c0f',
      '#0d9488', '#1e40af', '#3730a3', '#5b21b6', '#9d174d',
      '#155e75', '#854d0e', '#a16207', '#701a75', '#831843'
    ];

    if (jobs && jobs.length > 0) {
      jobs.forEach((j) => {
        let cat = (j.serviceType || (j as any).serviceCategory || (j as any).category || '').trim();
        if (!cat) cat = 'DOWN HOLE RENTALS';
        cat = cat.toUpperCase();
        counts[cat] = (counts[cat] || 0) + 1;
      });

      const list = Object.entries(counts)
        .map(([name, count]) => ({ name, jobs: count }))
        .sort((a, b) => b.jobs - a.jobs)
        .slice(0, 15);

      if (list.length > 0) {
        return list.map((item, idx) => ({
          ...item,
          color: colors[idx % colors.length],
        }));
      }
    }

    // Default benchmark fallback
    return [
      { name: 'DOWN HOLE RENTALS', jobs: 1193, color: '#78350f' },
      { name: 'COMPLETION RECOVERY', jobs: 543, color: '#c2611a' },
      { name: 'FISHING', jobs: 503, color: '#d97706' },
      { name: 'WHIPSTOCK', jobs: 416, color: '#ca8a04' },
      { name: 'FISHING TOOL RENTAL', jobs: 240, color: '#4d7c0f' },
      { name: 'CLEANOUT', jobs: 187, color: '#0d9488' },
      { name: 'HOLE SECTION FISHING TOOLS', jobs: 177, color: '#1e40af' },
      { name: 'WELLBORE CLEANOUT', jobs: 102, color: '#3730a3' },
      { name: 'ENGINEER RENTALS', jobs: 94, color: '#5b21b6' },
      { name: 'SINGLE COMPLETION', jobs: 76, color: '#9d174d' },
      { name: 'SECTION MILLING', jobs: 48, color: '#155e75' },
      { name: 'DUAL COMPLETION', jobs: 42, color: '#854d0e' },
      { name: 'RENTALS', jobs: 33, color: '#a16207' },
      { name: 'COMPLETION & SLOT RECOVERY', jobs: 19, color: '#701a75' },
      { name: 'THRU-TUBING FISHING', jobs: 18, color: '#831843' },
    ];
  }, [jobs]);

  // Currency formatting helper based on active currency mode
  const formatMoney = (valAED: number, valUSD: number, nativeCurrency?: 'AED' | 'USD') => {
    if (currencyMode === 'AED') {
      return `AED ${(valAED || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (currencyMode === 'USD') {
      return `$${(valUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    // Native Mode
    if (nativeCurrency === 'AED') {
      return `AED ${(valAED || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${(valUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatCompactMoney = (valAED: number, valUSD: number, nativeCurrency?: 'AED' | 'USD') => {
    const isCurrencyAED = currencyMode === 'AED' || (currencyMode === 'NATIVE' && nativeCurrency === 'AED');
    const num = isCurrencyAED ? (valAED || 0) : (valUSD || 0);
    const symbol = isCurrencyAED ? 'AED ' : '$';

    if (num >= 1_000_000) {
      return `${symbol}${(num / 1_000_000).toFixed(2)}M`;
    }
    if (num >= 1_000) {
      return `${symbol}${(num / 1_000).toFixed(1)}k`;
    }
    return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // 1. Completed jobs detection (FSH, FR, WHP prefixes)
  const completedJobIdSet = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      const hasLegal = isLegalInvoice(j.legalInvoiceNumber) || isLegalInvoice(j.invoiceNumber);
      if (hasLegal) {
        if (j.id) set.add(String(j.id).trim().toUpperCase());
        if (j.jobNumber) set.add(String(j.jobNumber).trim().toUpperCase());
      }
    });
    return set;
  }, [jobs]);

  // Returned serials lookup per job and overall
  const returnedSerialsSet = useMemo(() => {
    const set = new Set<string>();
    rtBatches.forEach((rt) => {
      (rt.toolLines || []).forEach((tl) => {
        if (tl.serial) set.add(String(tl.serial).trim().toUpperCase());
      });
    });
    return set;
  }, [rtBatches]);

  // Active jobs (excluding completed jobs with legal invoices)
  const activeJobs = useMemo(() => {
    return jobs.filter((j) => {
      const jKey = String(j.id || '').trim().toUpperCase();
      if (completedJobIdSet.has(jKey)) return false;
      const s = (j.status || '').toLowerCase().trim();
      return s !== 'completed' && s !== 'closed';
    });
  }, [jobs, completedJobIdSet]);

  const activeRigsSet = useMemo(() => {
    const set = new Set<string>();
    activeJobs.forEach((j) => {
      if (j.rig && j.rig.trim() && j.rig !== 'Rig Unassigned') {
        set.add(j.rig.trim());
      }
    });
    return set;
  }, [activeJobs]);

  const activeRigsCount = activeRigsSet.size;

  // 2. Tools on Rig Calculation (Live Feed: Dispatched on active jobs and not yet backloaded via RT)
  const { toolsOnRigCount, totalDispatchedTools, totalReturnedTools } = useMemo(() => {
    let dispatched = 0;
    let returned = 0;
    let onRig = 0;

    dtBatches.forEach((b) => {
      const isJobCompleted = b.jobId && completedJobIdSet.has(String(b.jobId).trim().toUpperCase());
      (b.toolLines || []).forEach((tl) => {
        dispatched += 1;
        const serialKey = tl.serial ? String(tl.serial).trim().toUpperCase() : '';
        const isReturned =
          isJobCompleted ||
          tl.status === 'Returned' ||
          Boolean(tl.rtBatchId) ||
          (serialKey && returnedSerialsSet.has(serialKey));

        if (isReturned) {
          returned += 1;
        } else {
          onRig += 1;
        }
      });
    });

    return {
      toolsOnRigCount: onRig,
      totalDispatchedTools: dispatched,
      totalReturnedTools: returned,
    };
  }, [dtBatches, completedJobIdSet, returnedSerialsSet]);

  // 3. Pending Signed Delivery & Receiving Tickets (Excluding completed jobs with legal invoice numbers)
  const pendingSignedDTs = useMemo(
    () =>
      dtBatches.filter((b) => {
        const isJobCompleted = b.jobId && completedJobIdSet.has(String(b.jobId).trim().toUpperCase());
        if (isJobCompleted) return false;
        return !b.isSigned && !b.signedDocUrl;
      }),
    [dtBatches, completedJobIdSet]
  );
  const activeDTsCount = useMemo(
    () =>
      dtBatches.filter((b) => {
        const isJobCompleted = b.jobId && completedJobIdSet.has(String(b.jobId).trim().toUpperCase());
        return !isJobCompleted;
      }).length,
    [dtBatches, completedJobIdSet]
  );
  const signedDTsCount = activeDTsCount - pendingSignedDTs.length;

  const pendingSignedRTs = useMemo(
    () =>
      rtBatches.filter((b) => {
        const isJobCompleted = b.jobId && completedJobIdSet.has(String(b.jobId).trim().toUpperCase());
        if (isJobCompleted) return false;
        return !b.isSigned && !b.signedDocUrl;
      }),
    [rtBatches, completedJobIdSet]
  );
  const activeRTsCount = useMemo(
    () =>
      rtBatches.filter((b) => {
        const isJobCompleted = b.jobId && completedJobIdSet.has(String(b.jobId).trim().toUpperCase());
        return !isJobCompleted;
      }).length,
    [rtBatches, completedJobIdSet]
  );
  const signedRTsCount = activeRTsCount - pendingSignedRTs.length;

  const totalTickets = activeDTsCount + activeRTsCount;
  const signedTicketsTotal = signedDTsCount + signedRTsCount;
  const compliancePercentage = totalTickets > 0 ? Math.round((signedTicketsTotal / totalTickets) * 100) : 100;

  // 4. Client Rig & Active Tools Summary for Bar Chart (Aggregated by canonical operator without duplicates)
  const clientDeploymentData = useMemo(() => {
    const map: Record<string, { client: string; rigs: Set<string>; toolsOnRig: number; activeJobs: number }> = {};
    
    // Seed standard operators
    const standardOperators = ['ADNOC Drilling', 'ADNOC Onshore', 'ADNOC Offshore', 'Turnwell'];
    standardOperators.forEach((c) => {
      map[c] = { client: c, rigs: new Set(), toolsOnRig: 0, activeJobs: 0 };
    });

    // Compute live tools on rig from DT batches
    const dtToolsByJob = new Map<string, number>();
    const dtToolsByRig = new Map<string, number>();
    dtBatches.forEach((b) => {
      const isJobCompleted = b.jobId && completedJobIdSet.has(String(b.jobId).trim().toUpperCase());
      let count = 0;
      (b.toolLines || []).forEach((tl) => {
        const serialKey = tl.serial ? String(tl.serial).trim().toUpperCase() : '';
        const isReturned =
          isJobCompleted ||
          tl.status === 'Returned' ||
          Boolean(tl.rtBatchId) ||
          (serialKey && returnedSerialsSet.has(serialKey));
        if (!isReturned) {
          count += 1;
        }
      });
      if (b.jobId) {
        const jKey = String(b.jobId).trim().toUpperCase();
        dtToolsByJob.set(jKey, (dtToolsByJob.get(jKey) || 0) + count);
      }
      if (b.rig) {
        const rKey = String(b.rig).trim().toUpperCase();
        dtToolsByRig.set(rKey, (dtToolsByRig.get(rKey) || 0) + count);
      }
    });

    // Also check inventory for tools deployed on rig
    const invToolsByRig = new Map<string, number>();
    inventory.forEach((t) => {
      if ((t.status === 'On Rig' || (t.location && t.location.toLowerCase().includes('rig'))) && t.rig) {
        const rKey = String(t.rig).trim().toUpperCase();
        invToolsByRig.set(rKey, (invToolsByRig.get(rKey) || 0) + (t.qty || 1));
      }
    });

    activeJobs.forEach((job) => {
      const canonicalClient = getCanonicalOperator(job.client);
      if (!map[canonicalClient]) {
        map[canonicalClient] = { client: canonicalClient, rigs: new Set(), toolsOnRig: 0, activeJobs: 0 };
      }
      if (job.rig && job.rig !== 'Rig Unassigned') {
        map[canonicalClient].rigs.add(job.rig.trim());
      }
      map[canonicalClient].activeJobs += 1;

      const jKey = String(job.id || '').trim().toUpperCase();
      const rKey = String(job.rig || '').trim().toUpperCase();
      const fromJob = dtToolsByJob.get(jKey) || 0;
      const fromRig = rKey ? (dtToolsByRig.get(rKey) || invToolsByRig.get(rKey) || 0) : 0;
      const toolsCount = Math.max(fromJob, fromRig, (job as any).toolsOnRig || 0);

      map[canonicalClient].toolsOnRig += toolsCount;
    });

    return Object.values(map)
      .filter((entry) => standardOperators.includes(entry.client) || entry.rigs.size > 0 || entry.toolsOnRig > 0 || entry.activeJobs > 0)
      .map((entry) => ({
        name: entry.client,
        client: entry.client,
        rigs: entry.rigs.size,
        tools: entry.toolsOnRig,
        jobs: entry.activeJobs,
      }));
  }, [activeJobs, dtBatches, returnedSerialsSet, completedJobIdSet, inventory]);

  // 5. Tool Fleet Categories Distribution (Donut Chart)
  const categoryDeploymentData = useMemo(() => {
    const counts: Record<string, number> = {};
    inventory.forEach((t) => {
      const cat = (t as any).category || t.shortDesc || 'Drilling Tool';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const list = Object.entries(counts).map(([name, value]) => ({ name, value }));
    return list.sort((a, b) => b.value - a.value).slice(0, 6);
  }, [inventory]);

  // 6. Monthly Tool Movements (Area Chart) - Computed Dynamically from Live DT and RT Batches
  const monthlyMovementsData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const countsByMonth: Record<string, { month: string; dispatched: number; returned: number; order: number }> = {};

    // Initialize 5 most recent calendar months including current
    const now = new Date();
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mName = months[d.getMonth()];
      countsByMonth[mName] = { month: mName, dispatched: 0, returned: 0, order: d.getTime() };
    }

    // Populate from actual DT dispatch dates
    dtBatches.forEach((b) => {
      const rawDate = b.dispatchDate || b.rmDate || b.deliveryDate;
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          const mName = months[d.getMonth()];
          if (countsByMonth[mName]) {
            countsByMonth[mName].dispatched += (b.toolLines || []).length;
          }
        }
      }
    });

    // Populate from actual RT dates
    rtBatches.forEach((b) => {
      if (b.rtDate) {
        const d = new Date(b.rtDate);
        if (!isNaN(d.getTime())) {
          const mName = months[d.getMonth()];
          if (countsByMonth[mName]) {
            countsByMonth[mName].returned += (b.toolLines || []).length;
          }
        }
      }
    });

    return Object.values(countsByMonth).sort((a, b) => a.order - b.order);
  }, [dtBatches, rtBatches]);

  // 7. Rig Live Operations Cards Matrix (Showing active rigs with tools actually on rig)
  const rigFleetCards = useMemo(() => {
    const rigMap: Record<
      string,
      {
        rig: string;
        well: string;
        client: string;
        jobId: string;
        mobDate: string;
        status: string;
        tools: string[];
      }
    > = {};

    // Collect tools on rig from inventory
    const invToolsByRig = new Map<string, string[]>();
    inventory.forEach((t) => {
      if ((t.status === 'On Rig' || (t.location && t.location.toLowerCase().includes('rig'))) && t.rig) {
        const rKey = String(t.rig).trim().toUpperCase();
        const serial = t.serial || t.assetNo || t.id;
        if (serial) {
          const list = invToolsByRig.get(rKey) || [];
          if (!list.includes(serial)) list.push(serial);
          invToolsByRig.set(rKey, list);
        }
      }
    });

    activeJobs.forEach((job) => {
      const rigName = job.rig || 'Rig Unassigned';
      if (rigName === 'Rig Unassigned' && !job.well) return;

      const jKey = String(job.id || '').trim().toUpperCase();
      const rKey = String(job.rig || '').trim().toUpperCase();
      const jDTs = dtBatches.filter((b) => {
        const bJKey = String(b.jobId || '').trim().toUpperCase();
        const bRKey = String(b.rig || '').trim().toUpperCase();
        return (bJKey && bJKey === jKey) || (bRKey && rKey && bRKey === rKey);
      });
      
      const activeToolsOnRig = new Set<string>();
      jDTs.forEach((b) => {
        (b.toolLines || []).forEach((t) => {
          const serialKey = t.serial ? String(t.serial).trim().toUpperCase() : '';
          const isReturned = t.status === 'Returned' || Boolean(t.rtBatchId) || (serialKey && returnedSerialsSet.has(serialKey));
          if (!isReturned && t.serial) {
            activeToolsOnRig.add(t.serial);
          }
        });
      });

      // Merge tools from inventory on this rig
      if (rKey && invToolsByRig.has(rKey)) {
        invToolsByRig.get(rKey)!.forEach((s) => activeToolsOnRig.add(s));
      }

      const toolsArray = Array.from(activeToolsOnRig);
      const hasTools = toolsArray.length > 0;

      let displayStatus = job.status || 'Active';
      if (!hasTools) {
        const sLower = displayStatus.toLowerCase();
        if (sLower === 'ongoing' || sLower === 'active' || sLower === '2_ongoing') {
          displayStatus = 'Mobilizing (0 Tools)';
        }
      } else if (displayStatus.toLowerCase() === 'open') {
        displayStatus = 'Ongoing';
      }

      rigMap[rigName] = {
        rig: rigName,
        well: job.well || 'TBD',
        client: getCanonicalOperator(job.client),
        jobId: job.id,
        mobDate: job.mobDate || '—',
        status: displayStatus,
        tools: toolsArray,
      };
    });

    return Object.values(rigMap);
  }, [activeJobs, dtBatches, returnedSerialsSet, inventory]);

  // Format Top 8 Categories for Charting with dynamic currency
  const isAED = currencyMode === 'AED' || currencyMode === 'NATIVE';
  const currencySymbol = isAED ? 'AED ' : '$';
  const currencyUnit = isAED ? 'M (AED)' : 'M ($)';

  const formatCategoryTitle = (cat: string) => {
    const s = cat.trim().toUpperCase();
    if (s.includes('JAR')) return 'Drilling Jars';
    if (s.includes('WHIPSTOCK')) return 'Whipstock Systems';
    if (s.includes('ROLLER') || s.includes('REAMER')) return 'Roller Reamers';
    if (s.includes('STABILIZER')) return 'Stabilizers';
    if (s.includes('PBL')) return 'PBL Bypass Subs';
    if (s.includes('MILL')) return 'Milling Tools';
    if (s.includes('SCRAPER')) return 'Casing Scrapers';
    if (s.includes('OTHER')) return 'Specialty Tools';
    return cat.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const topCategoriesChartData = useMemo(() => {
    return TOP_CATEGORIES_REVENUE.slice(0, 4).map((cat) => {
      const total = isAED ? cat.totalRevenueAED : cat.totalRevenueUSD;
      const oper = isAED ? cat.operRevenueAED : cat.operRevenueUSD;
      const standby = isAED ? cat.standbyRevenueAED : cat.standbyRevenueUSD;

      return {
        name: formatCategoryTitle(cat.category),
        fullName: cat.category,
        totalRevenue: total,
        operRevenue: oper,
        standbyRevenue: standby,
        totalRevenueM: Number((total / 1_000_000).toFixed(2)),
        operRevenueM: Number((oper / 1_000_000).toFixed(2)),
        standbyRevenueM: Number((standby / 1_000_000).toFixed(2)),
        operDays: cat.operDays,
        standbyDays: cat.standbyDays,
        toolsCount: cat.toolsCount || cat.toolCount,
        jobsCount: cat.jobsCount,
        valAED: cat.totalRevenueAED,
        valUSD: cat.totalRevenueUSD,
        operAED: cat.operRevenueAED,
        operUSD: cat.operRevenueUSD,
        sbAED: cat.standbyRevenueAED,
        sbUSD: cat.standbyRevenueUSD,
      };
    });
  }, [isAED]);

  // Dynamic Total Fleet Revenue based on Currency Mode
  const activeTotalFleetRevenue = isAED ? REVENUE_SUMMARY.totalRevenueAED : REVENUE_SUMMARY.totalRevenueUSD;
  const activeOperRevenue = isAED ? REVENUE_SUMMARY.totalOperRevenueAED : REVENUE_SUMMARY.totalOperRevenueUSD;
  const activeStandbyRevenue = isAED ? REVENUE_SUMMARY.totalStandbyRevenueAED : REVENUE_SUMMARY.totalStandbyRevenueUSD;

  return (
    <div className="space-y-4 w-full">
      {/* Dashboard Mode Switcher Ribbon (Operations vs Executive Management) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setDashboardMode('operations')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                dashboardMode === 'operations'
                  ? 'bg-amber-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Operations Dashboard</span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded font-bold ${
                dashboardMode === 'operations' ? 'bg-amber-800 text-amber-100' : 'bg-slate-200 text-slate-700'
              }`}>
                Live
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDashboardMode('management')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                dashboardMode === 'management'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>Executive Management Dashboard</span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded font-bold ${
                dashboardMode === 'management' ? 'bg-blue-800 text-blue-100' : 'bg-slate-200 text-slate-700'
              }`}>
                Commercial
              </span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-slate-700">
            {dashboardMode === 'operations' ? 'Field Operational Deployment Matrix' : 'Commercial Billing & Financial Governance'}
          </span>
        </div>
      </div>

      {/* 1. Primary Operational Field KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Active Rigs */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all border-t-[3px] border-t-emerald-600 flex flex-col justify-between">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex justify-between items-center">
            <span>Active Rigs Deployed</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-emerald-700">
              {serverKpis != null ? serverKpis.activeRigs : activeRigsCount}
            </span>
            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              {new Set(activeJobs.map((j) => j.client)).size} Clients
            </span>
          </div>
        </div>

        {/* Card 2: Tools On Rig */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all border-t-[3px] border-t-blue-600 flex flex-col justify-between">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Downhole Tools on Rig</span>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded">Live</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-blue-700">
              {serverKpis != null ? serverKpis.toolsOnRig : toolsOnRigCount}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              {inventory.length} Total Fleet
            </span>
          </div>
        </div>

        {/* Card 3: Pending Signed DTs */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all border-t-[3px] border-t-amber-500 flex flex-col justify-between">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex justify-between items-center">
            <span>Pending Signed DTs</span>
            {(serverKpis != null ? serverKpis.pendingDTs : pendingSignedDTs.length) > 0 && (
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-100 text-amber-900 font-extrabold uppercase">
                Action Req
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-amber-700">
              {serverKpis != null ? serverKpis.pendingDTs : pendingSignedDTs.length}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              of {activeDTsCount} Active DTs
            </span>
          </div>
        </div>

        {/* Card 4: Pending Signed RTs */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all border-t-[3px] border-t-rose-500 flex flex-col justify-between">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
            Pending Signed RTs
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-rose-700">
              {serverKpis != null ? serverKpis.pendingRTs : pendingSignedRTs.length}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              of {activeRTsCount} Active RTs
            </span>
          </div>
        </div>

        {/* Card 5: Compliance Health Gauge */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all border-t-[3px] border-t-[#1a3055] flex flex-col justify-between">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Ticket Compliance</span>
            <span className={`text-[10px] font-bold ${compliancePercentage >= 80 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {compliancePercentage >= 80 ? 'Compliant' : 'Needs Action'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-[#1a3055]">
              {compliancePercentage}%
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {signedTicketsTotal}/{totalTickets} Signed
            </span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden border border-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                compliancePercentage >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${compliancePercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* OPERATIONS DASHBOARD: SCREENSHOT 3 (JOBS BY CLIENT + JOBS BY SERVICE CATEGORY) */}
      {/* ========================================================================= */}
      {dashboardMode === 'operations' && (
        <div className="space-y-6">
          {/* SECTION 1: JOBS BY CLIENT / OPERATOR (TOP 12) */}
          <div className="bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden">
            {/* Dark Mahogany Header Banner */}
            <div className="bg-[#78350f] text-white px-4 py-2 font-black text-sm tracking-wider uppercase border-b border-[#5c270a] flex items-center justify-between">
              <span>JOBS BY CLIENT / OPERATOR (TOP 12)</span>
              <span className="text-[11px] font-mono font-medium text-amber-200/90 tracking-normal normal-case">
                Total Top 12 Jobs: {clientJobsBenchmarkData.reduce((acc, c) => acc + c.jobs, 0).toLocaleString()}
              </span>
            </div>

            {/* Content: Left Table (~35%) + Right Horizontal Bar Chart (~65%) */}
            <div className="flex flex-col xl:flex-row border-t border-slate-200 bg-white">
              {/* Left Table */}
              <div className="w-full xl:w-[38%] border-b xl:border-b-0 xl:border-r border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-300">
                      <th className="py-2 px-3 border-r border-slate-200">Client / Operator</th>
                      <th className="py-2 px-3 text-right w-24">Jobs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {clientJobsBenchmarkData.map((row, idx) => (
                      <tr
                        key={row.name}
                        className={`hover:bg-amber-50/50 transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                        }`}
                      >
                        <td className="py-1.5 px-3 font-semibold text-slate-800 border-r border-slate-200 whitespace-nowrap">
                          {row.name}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {row.jobs.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Right Horizontal Bar Chart */}
              <div className="w-full xl:w-[62%] p-3 sm:p-4 flex flex-col justify-center bg-white min-h-[380px]">
                <div className="text-center font-bold text-xs text-slate-700 mb-1">
                  Jobs by Client / Operator (Top 12)
                </div>
                <div className="h-[360px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={[...clientJobsBenchmarkData].reverse()}
                      margin={{ top: 25, right: 45, left: 160, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis
                        type="number"
                        domain={[0, 2000]}
                        ticks={[0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000]}
                        orientation="top"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={{ stroke: '#cbd5e1' }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={155}
                        tick={{ fontSize: 9.5, fill: '#334155', fontWeight: 600 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          color: '#0f172a',
                          borderRadius: '8px',
                          fontSize: '12px',
                          border: '1px solid #cbd5e1',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        }}
                        formatter={(val: any) => [`${Number(val).toLocaleString()} Jobs`, 'Volume']}
                      />
                      <Bar
                        dataKey="jobs"
                        barSize={10}
                        radius={[0, 2, 2, 0]}
                        label={{
                          position: 'right',
                          fontSize: 10,
                          fontWeight: 700,
                          fill: '#334155',
                          formatter: (val: any) => Number(val).toLocaleString(),
                        }}
                      >
                        {[...clientJobsBenchmarkData].reverse().map((entry, index) => (
                          <Cell key={`client-bar-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: JOBS BY SERVICE CATEGORY (TOP 15) */}
          <div className="bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden">
            {/* Dark Mahogany Header Banner */}
            <div className="bg-[#78350f] text-white px-4 py-2 font-black text-sm tracking-wider uppercase border-b border-[#5c270a] flex items-center justify-between">
              <span>JOBS BY SERVICE CATEGORY (TOP 15)</span>
              <span className="text-[11px] font-mono font-medium text-amber-200/90 tracking-normal normal-case">
                Total Top 15 Jobs: {serviceCategoryJobsBenchmarkData.reduce((acc, c) => acc + c.jobs, 0).toLocaleString()}
              </span>
            </div>

            {/* Content: Left Table (~35%) + Right Horizontal Bar Chart (~65%) */}
            <div className="flex flex-col xl:flex-row border-t border-slate-200 bg-white">
              {/* Left Table */}
              <div className="w-full xl:w-[38%] border-b xl:border-b-0 xl:border-r border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-300">
                      <th className="py-2 px-3 border-r border-slate-200">Service Category</th>
                      <th className="py-2 px-3 text-right w-24">Jobs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {serviceCategoryJobsBenchmarkData.map((row, idx) => (
                      <tr
                        key={row.name}
                        className={`hover:bg-amber-50/50 transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                        }`}
                      >
                        <td className="py-1.5 px-3 font-semibold text-slate-800 border-r border-slate-200 whitespace-nowrap">
                          {row.name}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {row.jobs.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Right Horizontal Bar Chart */}
              <div className="w-full xl:w-[62%] p-3 sm:p-4 flex flex-col justify-center bg-white min-h-[440px]">
                <div className="text-center font-bold text-xs text-slate-700 mb-1">
                  Jobs by Service Category (Top 15)
                </div>
                <div className="h-[420px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={[...serviceCategoryJobsBenchmarkData].reverse()}
                      margin={{ top: 25, right: 45, left: 160, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis
                        type="number"
                        domain={[0, 1400]}
                        ticks={[0, 200, 400, 600, 800, 1000, 1200, 1400]}
                        orientation="top"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={{ stroke: '#cbd5e1' }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={155}
                        tick={{ fontSize: 9.5, fill: '#334155', fontWeight: 600 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          color: '#0f172a',
                          borderRadius: '8px',
                          fontSize: '12px',
                          border: '1px solid #cbd5e1',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        }}
                        formatter={(val: any) => [`${Number(val).toLocaleString()} Jobs`, 'Volume']}
                      />
                      <Bar
                        dataKey="jobs"
                        barSize={10}
                        radius={[0, 2, 2, 0]}
                        label={{
                          position: 'right',
                          fontSize: 10,
                          fontWeight: 700,
                          fill: '#334155',
                          formatter: (val: any) => Number(val).toLocaleString(),
                        }}
                      >
                        {[...serviceCategoryJobsBenchmarkData].reverse().map((entry, index) => (
                          <Cell key={`cat-bar-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. EXECUTIVE COMMERCIAL REVENUE & TOOL CATEGORY PERFORMANCE SECTION (MANAGEMENT DASHBOARD) */}
      {/* ========================================================================= */}
      {dashboardMode === 'management' && (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        
        {/* Section Header with Navigation & Currency Mode Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                <DollarSign className="w-4 h-4" />
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900 flex items-center gap-2">
                Tool Fleet Commercial Revenue &amp; Category Analytics
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                SQL Invoicing &amp; Daily Logs Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
              Synthesized from 820,513 daily utilization records across 6,882 serialized downhole tools &amp; 28 master operator contracts.
            </p>
          </div>

          {/* Right Toolbar: Multi-Currency Toggle & CTAs */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            {/* Currency Mode Switcher (Light Segmented Control) */}
            <div className="flex items-center bg-slate-100/90 border border-slate-200 rounded-xl p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setCurrencyMode('AED')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  currencyMode === 'AED'
                    ? 'bg-white text-emerald-700 shadow-xs font-black border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View all figures in UAE Dirhams (AED)"
              >
                <span>د.إ</span>
                <span>AED</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrencyMode('USD')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  currencyMode === 'USD'
                    ? 'bg-white text-blue-700 shadow-xs font-black border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View all figures in US Dollars (USD)"
              >
                <span>$</span>
                <span>USD</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrencyMode('NATIVE')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  currencyMode === 'NATIVE'
                    ? 'bg-white text-amber-700 shadow-xs font-black border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Display native contract currencies (AED for 4700024096, USD for others)"
              >
                <Coins className="w-3 h-3 text-amber-600" />
                <span>Native</span>
              </button>
            </div>

            {/* CTAs */}
            <button
              onClick={() => onNavigate('tool-revenue-report')}
              className="px-3.5 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Full Revenue Report</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigate('categories-sizes')}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Taxonomy</span>
            </button>
          </div>
        </div>

        {/* Currency FX Rate Banner Note */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              <strong>Adnoc Drilling Contract (4700024096)</strong> is natively calculated in <strong>AED</strong>.
            </span>
          </div>
          <div className="font-mono text-slate-500">
            Fixed Peg: 1 USD = 3.6725 AED • Display Currency: <strong className="text-slate-800 uppercase">{currencyMode}</strong>
          </div>
        </div>

        {/* 4 Financial Commercial KPI Cards (Exact Executive Mockup Styling) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* KPI 1: Total Fleet Lifetime Revenue */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all">
            <div className="text-xs sm:text-sm font-semibold text-slate-500 tracking-tight">
              Total Fleet Revenue
            </div>
            <div className="mt-2 text-2xl sm:text-[26px] font-black font-sans text-slate-900 tracking-tight">
              {formatMoney(REVENUE_SUMMARY.totalRevenueAED, REVENUE_SUMMARY.totalRevenueUSD)}
            </div>
          </div>

          {/* KPI 2: Operating Revenue */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all">
            <div className="text-xs sm:text-sm font-semibold text-slate-500 tracking-tight">
              Operating Revenue
            </div>
            <div className="mt-2 text-2xl sm:text-[26px] font-black font-sans text-slate-900 tracking-tight">
              {formatMoney(REVENUE_SUMMARY.totalOperRevenueAED, REVENUE_SUMMARY.totalOperRevenueUSD)}
            </div>
          </div>

          {/* KPI 3: Standby Revenue */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all">
            <div className="text-xs sm:text-sm font-semibold text-slate-500 tracking-tight">
              Standby Revenue
            </div>
            <div className="mt-2 text-2xl sm:text-[26px] font-black font-sans text-slate-900 tracking-tight">
              {formatMoney(REVENUE_SUMMARY.totalStandbyRevenueAED, REVENUE_SUMMARY.totalStandbyRevenueUSD)}
            </div>
          </div>

          {/* KPI 4: Fleet Scope */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-xs hover:shadow-md transition-all">
            <div className="text-xs sm:text-sm font-semibold text-slate-500 tracking-tight">
              Fleet Scope
            </div>
            <div className="mt-2 text-2xl sm:text-[26px] font-black font-sans text-slate-900 tracking-tight">
              {REVENUE_SUMMARY.totalTools.toLocaleString()} Serials
            </div>
          </div>

        </div>

        {/* Commercial Charts Row (Top Earning Categories & Revenue by Master Contract) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* Chart A: Top Tool Categories Revenue Breakdown (Matching Mockup) */}
          <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Top Revenue-Generating Tool Categories
                </h3>
                
                {/* Metric Toggle */}
                <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5 text-[11px]">
                  <button
                    onClick={() => setCategoryChartMetric('split')}
                    className={`px-2.5 py-0.5 rounded-md font-semibold transition cursor-pointer ${
                      categoryChartMetric === 'split' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Ops vs Standby
                  </button>
                  <button
                    onClick={() => setCategoryChartMetric('total')}
                    className={`px-2.5 py-0.5 rounded-md font-semibold transition cursor-pointer ${
                      categoryChartMetric === 'total' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Total
                  </button>
                </div>
              </div>

              {/* Bar Chart Container with Mockup Style SVG Gradients */}
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topCategoriesChartData}
                    layout="vertical"
                    margin={{ top: 10, right: 20, left: 25, bottom: 5 }}
                    barSize={20}
                  >
                    <defs>
                      <linearGradient id="mockupOperGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#0f2b5c" />
                        <stop offset="100%" stopColor="#1e4da1" />
                      </linearGradient>
                      <linearGradient id="mockupStandbyGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#d9822b" />
                        <stop offset="100%" stopColor="#f3b34c" />
                      </linearGradient>
                      <linearGradient id="mockupTotalGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#0f2b5c" />
                        <stop offset="100%" stopColor="#2563eb" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      unit="M"
                      tickFormatter={(v) => `${currencySymbol}${v}`}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={125}
                      tick={{ fontSize: 12, fill: '#1e293b', fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white text-slate-900 p-3 rounded-xl shadow-xl border border-slate-200 text-xs font-sans space-y-1">
                              <div className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-1">{data.name}</div>
                              <div className="mt-1 text-slate-700">
                                Total:{' '}
                                <strong className="font-mono text-slate-900 font-bold">
                                  {formatMoney(data.valAED, data.valUSD)}
                                </strong>
                              </div>
                              <div className="text-slate-700">
                                Operating:{' '}
                                <span className="font-mono text-blue-700 font-semibold">
                                  {formatMoney(data.operAED, data.operUSD)} ({data.operDays.toLocaleString()} days)
                                </span>
                              </div>
                              <div className="text-slate-700">
                                Standby:{' '}
                                <span className="font-mono text-amber-700 font-semibold">
                                  {formatMoney(data.sbAED, data.sbUSD)} ({data.standbyDays.toLocaleString()} days)
                                </span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {categoryChartMetric === 'split' ? (
                      <>
                        <Bar
                          dataKey="operRevenueM"
                          name={`Operating (${currencyUnit})`}
                          stackId="a"
                          fill="url(#mockupOperGradient)"
                          radius={[10, 0, 0, 10]}
                        />
                        <Bar
                          dataKey="standbyRevenueM"
                          name={`Standby (${currencyUnit})`}
                          stackId="a"
                          fill="url(#mockupStandbyGradient)"
                          radius={[0, 10, 10, 0]}
                        />
                      </>
                    ) : (
                      <Bar
                        dataKey="totalRevenueM"
                        name={`Total Revenue (${currencyUnit})`}
                        fill="url(#mockupTotalGradient)"
                        radius={[10, 10, 10, 10]}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Drilling Jars represent <strong className="text-slate-800">31.7%</strong> of total revenue</span>
              <button
                onClick={() => onNavigate('tool-revenue-report')}
                className="text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>Full Taxonomy</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Chart B: Top Revenue Operator Contracts (Matching Mockup) */}
          <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Top Revenue Operator Contracts
                </h3>
                <span className="text-[11px] text-slate-500 font-medium">
                  Ranked by Value
                </span>
              </div>

              {/* Exact Mockup Contract Rows with Number Badges and Meters */}
              <div className="space-y-4 my-2">
                {TOP_CONTRACTS_REVENUE.slice(0, 4).map((c, idx) => {
                  const pct = ((c.totalRevenueAED / REVENUE_SUMMARY.totalRevenueAED) * 100).toFixed(1);
                  const rankBadgeClass =
                    idx === 0
                      ? 'bg-blue-100 text-blue-800'
                      : idx === 1
                      ? 'bg-slate-100 text-slate-700'
                      : idx === 2
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-teal-100 text-teal-800';

                  const barColorClass =
                    idx === 0
                      ? 'bg-[#0f2b5c]'
                      : idx === 1
                      ? 'bg-[#1e4da1]'
                      : idx === 2
                      ? 'bg-[#0d9488]'
                      : 'bg-[#0f766e]';

                  return (
                    <div key={c.contractKey || c.contract || idx} className="flex items-center justify-between gap-3 text-xs">
                      {/* Left: Rank Badge + Operator Name */}
                      <div className="flex items-center gap-2.5 min-w-[130px] sm:min-w-[150px]">
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[11px] ${rankBadgeClass}`}>
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-slate-800 truncate">
                          {c.client || 'Oilfield Operator'}
                        </span>
                      </div>

                      {/* Middle: Progress Meter */}
                      <div className="flex-1 max-w-[220px] bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColorClass}`}
                          style={{ width: `${Math.min(100, Math.max(15, Number(pct) * 3))}%` }}
                        />
                      </div>

                      {/* Right: Revenue Amount */}
                      <div className="text-right min-w-[120px] whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          {formatCompactMoney(c.totalRevenueAED, c.totalRevenueUSD, c.currency)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Primary: <strong className="text-slate-800">4700024096 (ADNOC Drilling)</strong></span>
              <button
                onClick={() => onNavigate('contracts')}
                className="text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>Manage Contracts</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>

      </div>
      )}

      {/* 3. OPERATIONAL RIG & DOWNHOLE TOOL DEPLOYMENT CHARTS ROW (MATCHING MOCKUP) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* Chart 1: Rig & Downhole Tool Fleet Distribution (Exact Mockup Styling) */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Rig &amp; Downhole Tool Fleet Distribution
              </h3>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-teal-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block"></span>
                  Active Rigs
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-blue-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
                  Tools on Rig
                </span>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={clientDeploymentData.slice(0, 5)}
                  margin={{ top: 15, right: 15, left: -20, bottom: 0 }}
                  barGap={6}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      borderRadius: '12px',
                      fontSize: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                    }}
                  />
                  <Bar
                    dataKey="rigs"
                    name="Active Rigs"
                    fill="#0d9488"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="tools"
                    name="Tools on Rig"
                    fill="#2563eb"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Live fleet tracking across active operator concessions</span>
            <span className="font-semibold text-emerald-700">{activeRigsCount} Active Rigs</span>
          </div>
        </div>

        {/* Chart 2: Tool Fleet Asset Breakdown (Donut Chart Matching Mockup) */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Tool Fleet Asset Breakdown
              </h3>
              <span className="text-xs text-slate-500 font-medium">Inventory Proportion</span>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 my-2">
              {/* Donut Chart with Centered Number '6,882' */}
              <div className="relative w-48 h-48 flex items-center justify-center shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryDeploymentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {categoryDeploymentData.map((_, index) => {
                        const colors = ['#0f2b5c', '#1e4da1', '#0d9488', '#d9822b', '#94a3b8', '#6366f1'];
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke="#ffffff" strokeWidth={2} />;
                      })}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        borderRadius: '12px',
                        fontSize: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Stat Counter */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                  <span className="text-2xl font-black font-sans text-slate-900 tracking-tight">
                    {REVENUE_SUMMARY.totalTools.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Total Tools
                  </span>
                </div>
              </div>

              {/* Exact Mockup Style 2-Column Key with Percentage Pills */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-xs w-full max-w-[280px]">
                {categoryDeploymentData.slice(0, 5).map((item, idx) => {
                  const colors = ['bg-[#0f2b5c]', 'bg-[#1e4da1]', 'bg-[#0d9488]', 'bg-[#d9822b]', 'bg-[#94a3b8]'];
                  const totalCount = categoryDeploymentData.reduce((acc, curr) => acc + curr.value, 0);
                  const pct = totalCount > 0 ? Math.round((item.value / totalCount) * 100) : 0;

                  return (
                    <div key={item.name} className="flex items-center justify-between gap-1.5 p-1 rounded-md">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colors[idx % colors.length]}`} />
                        <span className="font-semibold text-slate-800 truncate text-[11px] sm:text-xs">
                          {item.name}
                        </span>
                      </div>
                      <span className="px-1.5 py-0.2 rounded font-mono font-bold text-[10px] bg-slate-100 text-slate-700">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Primary Category: <strong className="text-slate-800">{categoryDeploymentData[0]?.name || 'Drilling Tools'}</strong></span>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>View Inventory</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
