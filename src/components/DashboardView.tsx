import React, { useMemo, useState } from 'react';
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
  const [currencyMode, setCurrencyMode] = useState<'AED' | 'USD' | 'NATIVE'>('AED');
  const [categoryChartMetric, setCategoryChartMetric] = useState<'total' | 'split'>('split');

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

  const topCategoriesChartData = useMemo(() => {
    return TOP_CATEGORIES_REVENUE.slice(0, 8).map((cat) => {
      const total = isAED ? cat.totalRevenueAED : cat.totalRevenueUSD;
      const oper = isAED ? cat.operRevenueAED : cat.operRevenueUSD;
      const standby = isAED ? cat.standbyRevenueAED : cat.standbyRevenueUSD;

      return {
        name: cat.category.length > 15 ? `${cat.category.substring(0, 13)}...` : cat.category,
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
              {activeRigsCount}
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
              {toolsOnRigCount}
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
            {pendingSignedDTs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-100 text-amber-900 font-extrabold uppercase">
                Action Req
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-amber-700">
              {pendingSignedDTs.length}
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
              {pendingSignedRTs.length}
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

      {/* 2. EXECUTIVE COMMERCIAL REVENUE & TOOL CATEGORY PERFORMANCE SECTION (UNIFIED LIGHT ENTERPRISE DESIGN) */}
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

        {/* 4 Financial Commercial KPI Cards (Clean Light Theme) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          
          {/* KPI 1: Total Fleet Lifetime Revenue */}
          <div className="bg-gradient-to-br from-emerald-50/50 via-white to-white rounded-xl p-4 border border-emerald-100/80 hover:border-emerald-300 transition-all shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold uppercase tracking-wider">
              <span>Total Fleet Revenue</span>
              <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2 text-2xl sm:text-[25px] font-black font-mono text-emerald-700 tracking-tight">
              {formatMoney(REVENUE_SUMMARY.totalRevenueAED, REVENUE_SUMMARY.totalRevenueUSD)}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between font-medium">
              <span>All Contracts &amp; Invoices</span>
              <span className="font-mono text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">100% Invoiced</span>
            </div>
          </div>

          {/* KPI 2: Operating Revenue */}
          <div className="bg-gradient-to-br from-blue-50/50 via-white to-white rounded-xl p-4 border border-blue-100/80 hover:border-blue-300 transition-all shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold uppercase tracking-wider">
              <span>Operating Revenue</span>
              <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2 text-2xl sm:text-[25px] font-black font-mono text-blue-700 tracking-tight">
              {formatMoney(REVENUE_SUMMARY.totalOperRevenueAED, REVENUE_SUMMARY.totalOperRevenueUSD)}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between font-medium">
              <span>{REVENUE_SUMMARY.totalOperDays.toLocaleString()} Ops Days ('1')</span>
              <span className="font-mono text-blue-700 font-bold">
                {((activeOperRevenue / activeTotalFleetRevenue) * 100).toFixed(1)}% Share
              </span>
            </div>
          </div>

          {/* KPI 3: Standby Revenue */}
          <div className="bg-gradient-to-br from-amber-50/50 via-white to-white rounded-xl p-4 border border-amber-100/80 hover:border-amber-300 transition-all shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold uppercase tracking-wider">
              <span>Standby Revenue</span>
              <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2 text-2xl sm:text-[25px] font-black font-mono text-amber-700 tracking-tight">
              {formatMoney(REVENUE_SUMMARY.totalStandbyRevenueAED, REVENUE_SUMMARY.totalStandbyRevenueUSD)}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between font-medium">
              <span>{REVENUE_SUMMARY.totalStandbyDays.toLocaleString()} SB Days ('S')</span>
              <span className="font-mono text-amber-700 font-bold">
                {((activeStandbyRevenue / activeTotalFleetRevenue) * 100).toFixed(1)}% Share
              </span>
            </div>
          </div>

          {/* KPI 4: Fleet Taxonomy Scope */}
          <div className="bg-gradient-to-br from-indigo-50/50 via-white to-white rounded-xl p-4 border border-indigo-100/80 hover:border-indigo-300 transition-all shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold uppercase tracking-wider">
              <span>Fleet Scope</span>
              <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2 text-2xl sm:text-[25px] font-black font-mono text-indigo-900 tracking-tight">
              {REVENUE_SUMMARY.totalTools.toLocaleString()} Serials
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between font-medium">
              <span>{REVENUE_SUMMARY.totalCategories} Categories</span>
              <span className="font-mono text-indigo-700 font-bold">{REVENUE_SUMMARY.totalSizes} Sizes</span>
            </div>
          </div>

        </div>

        {/* Commercial Charts Row (Top Earning Categories & Revenue by Master Contract) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* Chart A: Top Tool Categories Revenue Breakdown */}
          <div className="lg:col-span-7 bg-slate-50/50 border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                    Top Revenue-Generating Tool Categories
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Cumulative commercial yield across top downhole tool families ({currencySymbol}).
                  </p>
                </div>
                
                {/* Metric Toggle */}
                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-[10px] shadow-2xs">
                  <button
                    onClick={() => setCategoryChartMetric('split')}
                    className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                      categoryChartMetric === 'split' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Ops vs Standby
                  </button>
                  <button
                    onClick={() => setCategoryChartMetric('total')}
                    className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                      categoryChartMetric === 'total' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Total Yield ({currencyUnit})
                  </button>
                </div>
              </div>

              {/* Bar Chart Container */}
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topCategoriesChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 25, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      unit="M"
                      tickFormatter={(v) => `${currencySymbol}${v}`}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={105}
                      tick={{ fontSize: 10, fill: '#1e293b', fontWeight: 600 }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white text-slate-900 p-3 rounded-xl shadow-xl border border-slate-200 text-xs font-sans space-y-1">
                              <div className="font-bold text-blue-900 text-sm border-b border-slate-100 pb-1">{data.fullName}</div>
                              <div className="mt-1 text-slate-700">
                                Total Revenue:{' '}
                                <strong className="font-mono text-emerald-700 font-bold">
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
                              <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500 flex justify-between gap-4 font-medium">
                                <span>{data.toolsCount} Serialized Units</span>
                                <span>{data.jobsCount} Historical Jobs</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {categoryChartMetric === 'split' ? (
                      <>
                        <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '6px' }} />
                        <Bar
                          dataKey="standbyRevenueM"
                          name={`Standby (${currencyUnit})`}
                          stackId="a"
                          fill="#f59e0b"
                          radius={[0, 0, 0, 0]}
                        />
                        <Bar
                          dataKey="operRevenueM"
                          name={`Operating (${currencyUnit})`}
                          stackId="a"
                          fill="#2563eb"
                          radius={[0, 4, 4, 0]}
                        />
                      </>
                    ) : (
                      <Bar
                        dataKey="totalRevenueM"
                        name={`Total Revenue (${currencyUnit})`}
                        fill="#059669"
                        radius={[0, 4, 4, 0]}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quick Category Summary Footer */}
            <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
              <span>
                Drilling Jars represent <strong>31.7%</strong> ({formatCompactMoney(10634447.96, 2895695.06)}) of total commercial revenue.
              </span>
              <button
                onClick={() => onNavigate('tool-revenue-report')}
                className="text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>Full Taxonomy Breakdown</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Chart B: Revenue by Master Operator Contract */}
          <div className="lg:col-span-5 bg-slate-50/50 border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between shadow-2xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  Top Revenue Operator Contracts
                </h3>
                <span className="text-[10px] text-slate-600 font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  28 Contracts
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-2">
                Contract revenue concentration with native currency attribution.
              </p>

              {/* Ranked Contracts List with Progress Meters */}
              <div className="space-y-2.5 my-2">
                {TOP_CONTRACTS_REVENUE.slice(0, 4).map((c, idx) => {
                  const pct = ((c.totalRevenueAED / REVENUE_SUMMARY.totalRevenueAED) * 100).toFixed(1);
                  const isContractAED = c.currency === 'AED';

                  return (
                    <div key={c.contractKey || c.contract || idx} className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs hover:border-slate-300 transition text-xs">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 truncate max-w-[180px]">
                              {c.client}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                                isContractAED
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {c.currency} Rate
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            Ref: {c.contract} • {c.toolsCount || c.toolCount} Tools • {c.jobsCount} Jobs
                          </span>
                        </div>
                        <div className="text-right whitespace-nowrap">
                          <span className="font-mono font-black text-emerald-700 block text-xs">
                            {formatCompactMoney(c.totalRevenueAED, c.totalRevenueUSD, c.currency)}
                          </span>
                          <span className="text-[10px] text-slate-500 font-semibold">{pct}% fleet share</span>
                        </div>
                      </div>
                      
                      {/* Share progress bar */}
                      <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden border border-slate-200">
                        <div
                          className="h-full bg-gradient-to-r from-blue-600 via-teal-500 to-emerald-600 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(5, Number(pct)))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Contract Footer Link */}
            <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
              <span>
                Contract 4700024096 is primary (<strong>AED 19.71M</strong>).
              </span>
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

      {/* 3. OPERATIONAL RIG & DOWNHOLE TOOL DEPLOYMENT CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 1: Rig & Tools by Operator Client */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs lg:col-span-2">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-xs font-bold text-[#1a3055] uppercase tracking-wide">
                Rig &amp; Downhole Tool Fleet Distribution by Operator
              </h3>
              <p className="text-[11px] text-slate-500">
                Active deployed rigs and downhole tool units across key operating contracts.
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              Live Feed
            </span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientDeploymentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    borderRadius: '8px',
                    fontSize: '11px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                  }}
                  itemStyle={{ color: '#0f172a' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="tools" name="Tools on Rig" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rigs" name="Active Rigs" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Tool Category Deployment (Donut Chart) */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-xs font-bold text-[#1a3055] uppercase tracking-wide">
                Tool Fleet Asset Breakdown
              </h3>
              <p className="text-[11px] text-slate-500">
                Inventory proportion by equipment category.
              </p>
            </div>
          </div>
          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryDeploymentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {categoryDeploymentData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    borderRadius: '8px',
                    fontSize: '11px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                  }}
                />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. FLEET VELOCITY & LIVE RIG OPERATIONAL CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 3: Monthly Movements (DT Dispatches vs RT Returns) */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs lg:col-span-1">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h3 className="text-xs font-bold text-[#1a3055] uppercase tracking-wide">
                Monthly Tool Fleet Velocity
              </h3>
              <p className="text-[11px] text-slate-500">
                Dispatches (DT) vs Returns (RT) volume.
              </p>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyMovementsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorDT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorRT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    borderRadius: '8px',
                    fontSize: '11px',
                    border: '1px solid #e2e8f0',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="dispatched"
                  name="Dispatched (DT)"
                  stroke="#2563eb"
                  fillOpacity={1}
                  fill="url(#colorDT)"
                />
                <Area
                  type="monotone"
                  dataKey="returned"
                  name="Returned (RT)"
                  stroke="#0d9488"
                  fillOpacity={1}
                  fill="url(#colorRT)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Active Rig Deployments Matrix */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs lg:col-span-2">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-xs font-bold text-[#1a3055] uppercase tracking-wide">
                Live Active Rig Deployment Matrix
              </h3>
              <p className="text-[11px] text-slate-500">
                Real-time drilling rig status, assigned wellbores, and on-site tool allocation.
              </p>
            </div>
            <button
              onClick={() => onNavigate('jobs')}
              className="text-xs text-blue-700 font-bold hover:underline cursor-pointer"
            >
              All Jobs &rarr;
            </button>
          </div>

          {rigFleetCards.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No active drilling rigs deployed currently.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rigFleetCards.map((rc) => (
                <div
                  key={rc.rig}
                  className="border border-slate-200 rounded-xl p-3.5 bg-gradient-to-br from-slate-50/70 to-white hover:border-[#1a3055] hover:shadow-xs transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            rc.tools.length > 0 ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                        />
                        <span className="font-black text-sm text-[#1a3055] font-mono">
                          Rig {rc.rig}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-700 mt-0.5">
                        Well: <span className="text-[#1a3055] font-bold">{rc.well}</span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        rc.tools.length > 0
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {rc.status}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px] py-2 border-y border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Client</span>
                      <span className="font-semibold text-slate-800">{rc.client}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Job Ref</span>
                      <span className="font-mono font-bold text-amber-900">{rc.jobId}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Mob Date</span>
                      <span className="font-mono text-slate-600">{formatDateDisplay(rc.mobDate)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Tools on Rig</span>
                      <span
                        className={`font-mono font-bold ${
                          rc.tools.length > 0 ? 'text-blue-700' : 'text-slate-500'
                        }`}
                      >
                        {rc.tools.length} Tools
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex justify-between items-center">
                    <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                      {rc.tools.length > 0 ? `Serials: ${rc.tools.slice(0, 3).join(', ')}${rc.tools.length > 3 ? '...' : ''}` : 'No active DT tools'}
                    </div>
                    <button
                      onClick={() => onNavigate('jobs')}
                      className="text-[11px] font-bold text-blue-700 hover:underline cursor-pointer"
                    >
                      Manage Job &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
