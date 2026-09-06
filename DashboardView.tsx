import React, { useMemo } from 'react';
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
  onNavigate: (mod: NavModule) => void;
  onOpenAddAsset?: () => void;
  onOpenAddCallout?: () => void;
  onUpdateDTBatch?: (batch: DTBatch) => void;
  onUpdateRTBatch?: (batch: RTBatch) => void;
}

const PALETTE = ['#1a3055', '#2563eb', '#0d9488', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  inventory,
  jobs,
  callouts,
  dtBatches,
  rtBatches = [],
  inspections,
  maintenance,
  contracts = [],
  jobUtMap = {},
  onNavigate,
  onOpenAddAsset,
  onOpenAddCallout,
}) => {
  // 1. Active Jobs & Active Rigs Count
  const activeJobs = useMemo(
    () => jobs.filter((j) => ['Open', 'Ongoing', 'Active'].includes(j.status)),
    [jobs]
  );

  const activeRigsSet = useMemo(() => {
    const set = new Set<string>();
    activeJobs.forEach((j) => {
      if (j.rig && j.rig.trim()) set.add(j.rig.trim());
    });
    return set;
  }, [activeJobs]);

  const activeRigsCount = activeRigsSet.size;

  // 2. Tools on Rig Calculation
  const totalDispatchedTools = useMemo(() => {
    return dtBatches.reduce((acc, b) => acc + b.toolLines.length, 0);
  }, [dtBatches]);

  const totalReturnedTools = useMemo(() => {
    return rtBatches.reduce((acc, b) => acc + b.toolLines.length, 0);
  }, [rtBatches]);

  const toolsOnRigCount = Math.max(0, totalDispatchedTools - totalReturnedTools);

  // 3. Pending Signed Delivery & Receiving Tickets
  const pendingSignedDTs = useMemo(
    () => dtBatches.filter((b) => !b.isSigned && !b.signedDocUrl),
    [dtBatches]
  );
  const signedDTsCount = dtBatches.length - pendingSignedDTs.length;

  const pendingSignedRTs = useMemo(
    () => rtBatches.filter((b) => !b.isSigned && !b.signedDocUrl),
    [rtBatches]
  );
  const signedRTsCount = rtBatches.length - pendingSignedRTs.length;

  const totalTickets = dtBatches.length + rtBatches.length;
  const signedTicketsTotal = signedDTsCount + signedRTsCount;
  const compliancePercentage = totalTickets > 0 ? Math.round((signedTicketsTotal / totalTickets) * 100) : 100;

  // 4. Client Rig & Active Tools Summary for Bar Chart
  const clientDeploymentData = useMemo(() => {
    const map: Record<string, { client: string; rigs: Set<string>; toolsOnRig: number; activeJobs: number }> = {};
    
    // Seed common clients
    ['ADNOC Drilling', 'ADNOC Onshore', 'ADNOC Offshore', 'Turnwell'].forEach((c) => {
      map[c] = { client: c, rigs: new Set(), toolsOnRig: 0, activeJobs: 0 };
    });

    activeJobs.forEach((job) => {
      const c = job.client || 'Other';
      if (!map[c]) {
        map[c] = { client: c, rigs: new Set(), toolsOnRig: 0, activeJobs: 0 };
      }
      if (job.rig) map[c].rigs.add(job.rig);
      map[c].activeJobs += 1;

      // Calculate tools on rig for this job
      const jDTs = dtBatches.filter((b) => b.jobId === job.id);
      const jRTs = rtBatches.filter((b) => b.jobId === job.id);
      const disp = jDTs.reduce((s, b) => s + b.toolLines.length, 0);
      const ret = jRTs.reduce((s, b) => s + b.toolLines.length, 0);
      map[c].toolsOnRig += Math.max(0, disp - ret);
    });

    return Object.values(map).map((entry) => ({
      name: entry.client.replace('ADNOC ', 'ADNOC-'),
      client: entry.client,
      rigs: entry.rigs.size,
      tools: entry.toolsOnRig,
      jobs: entry.activeJobs,
    }));
  }, [activeJobs, dtBatches, rtBatches]);

  // 5. Tool Fleet Categories Distribution (Donut Chart)
  const categoryDeploymentData = useMemo(() => {
    const counts: Record<string, number> = {};
    inventory.forEach((t) => {
      const cat = t.category || t.shortDesc || 'Drilling Tool';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const list = Object.entries(counts).map(([name, value]) => ({ name, value }));
    return list.sort((a, b) => b.value - a.value).slice(0, 6);
  }, [inventory]);

  // 6. Monthly Tool Movements (Area Chart)
  const monthlyMovementsData = useMemo(() => {
    const monthMap: Record<string, { month: string; dispatched: number; returned: number }> = {
      'May': { month: 'May', dispatched: 6, returned: 4 },
      'Jun': { month: 'Jun', dispatched: 9, returned: 7 },
      'Jul': { month: 'Jul', dispatched: 12, returned: 10 },
      'Aug': { month: 'Aug', dispatched: 14, returned: 8 },
      'Sep': { month: 'Sep', dispatched: dtBatches.length * 3, returned: rtBatches.length * 2 },
    };

    return Object.values(monthMap);
  }, [dtBatches, rtBatches]);

  // 7. Rig Live Operations Cards Matrix
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

    activeJobs.forEach((job) => {
      const rigName = job.rig || 'Rig Unassigned';
      const jDTs = dtBatches.filter((b) => b.jobId === job.id);
      const toolsList: string[] = [];
      jDTs.forEach((b) => b.toolLines.forEach((t) => toolsList.push(t.serial)));

      rigMap[rigName] = {
        rig: rigName,
        well: job.well || 'TBD',
        client: job.client || 'ADNOC',
        jobId: job.id,
        mobDate: job.mobDate || '2026-08-18',
        status: job.status,
        tools: toolsList,
      };
    });

    return Object.values(rigMap);
  }, [activeJobs, dtBatches]);

  return (
    <div className="space-y-4 w-full">
      {/* Top Banner Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-semibold tracking-wide uppercase">
            Operations &amp; Rig Fleet Command
          </div>
          <h1 className="text-lg font-extrabold text-[#1a3055] tracking-tight">
            Downhole Tool Operations &amp; Rig Intelligence
          </h1>
          <div className="text-xs text-slate-600 mt-0.5">
            Real-time rig deployment analytics, fleet velocity, operator breakdown, and ticket compliance monitoring.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenAddCallout && user?.role !== 'Viewer' && (
            <button
              onClick={onOpenAddCallout}
              className="px-3 py-1.5 rounded bg-[#1a3055] text-white hover:bg-[#24426d] font-bold text-xs shadow-sm transition cursor-pointer flex items-center gap-1.5"
            >
              <span>+</span> Rig Callout
            </button>
          )}
          <button
            onClick={() => onNavigate('jobs')}
            className="px-3 py-1.5 rounded bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold text-xs shadow-sm transition cursor-pointer"
          >
            Drilling Jobs &rarr;
          </button>
        </div>
      </div>

      {/* 5 Primary Operational KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Active Rigs */}
        <div className="bg-white border border-[#b8c9db] rounded p-3.5 shadow-sm border-t-[3px] border-t-emerald-600">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex justify-between items-center">
            <span>Active Rigs Deployed</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-emerald-700">
              {activeRigsCount}
            </span>
            <span className="text-[11px] font-bold text-slate-500">
              Across {new Set(activeJobs.map((j) => j.client)).size} Clients
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 truncate">
            Rigs: {Array.from(activeRigsSet).join(', ') || 'None'}
          </div>
        </div>

        {/* Card 2: Tools On Rig */}
        <div className="bg-white border border-[#b8c9db] rounded p-3.5 shadow-sm border-t-[3px] border-t-blue-600">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
            Downhole Tools on Rig
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-blue-700">
              {toolsOnRigCount}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              {inventory.length} Total Fleet
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {totalDispatchedTools} Dispatched &bull; {totalReturnedTools} Backloaded
          </div>
        </div>

        {/* Card 3: Pending Signed DTs */}
        <div className="bg-white border border-[#b8c9db] rounded p-3.5 shadow-sm border-t-[3px] border-t-amber-500">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex justify-between items-center">
            <span>Pending Signed DTs</span>
            {pendingSignedDTs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-100 text-amber-900 font-bold">
                Action
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-amber-700">
              {pendingSignedDTs.length}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              of {dtBatches.length} Total DTs
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {signedDTsCount} Signed &amp; Attached
          </div>
        </div>

        {/* Card 4: Pending Signed RTs */}
        <div className="bg-white border border-[#b8c9db] rounded p-3.5 shadow-sm border-t-[3px] border-t-rose-500">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
            Pending Signed RTs
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-rose-700">
              {pendingSignedRTs.length}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              of {rtBatches.length} Total RTs
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {signedRTsCount} Signed &amp; Attached
          </div>
        </div>

        {/* Card 5: Compliance Health Gauge */}
        <div className="bg-white border border-[#b8c9db] rounded p-3.5 shadow-sm border-t-[3px] border-t-[#1a3055]">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
            Ticket Compliance Rate
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-[#1a3055]">
              {compliancePercentage}%
            </span>
            <span className={`text-[11px] font-bold ${compliancePercentage >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {compliancePercentage >= 80 ? 'Compliant' : 'Needs Follow-up'}
            </span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                compliancePercentage >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${compliancePercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Modern Smart Visual Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 1: Rig & Tools by Operator Client */}
        <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm lg:col-span-2">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-xs font-bold text-[#1a3055] uppercase tracking-wide">
                Rig &amp; Downhole Tool Fleet Distribution by Operator
              </h3>
              <p className="text-[11px] text-slate-500">
                Active deployed rigs and downhole tool units across key operating contracts.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
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
                    backgroundColor: '#1a3055',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: '11px',
                    border: 'none',
                  }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="tools" name="Tools on Rig" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rigs" name="Active Rigs" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Tool Category Deployment (Donut Chart) */}
        <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm">
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
                    backgroundColor: '#1a3055',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: '11px',
                    border: 'none',
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

      {/* Second Row: Monthly Fleet Velocity & Live Rig Operational Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 3: Monthly Movements (DT Dispatches vs RT Returns) */}
        <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm lg:col-span-1">
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
                    backgroundColor: '#1a3055',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: '11px',
                    border: 'none',
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

        {/* Live Active Rig Deployments Matrix (Replaces static jobs table with dynamic executive rig cards) */}
        <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm lg:col-span-2">
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
                  className="border border-[#b8c9db] rounded-md p-3 bg-gradient-to-br from-slate-50 to-white hover:border-[#1a3055] transition shadow-2xs"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span className="font-extrabold text-sm text-[#1a3055] font-mono">
                          Rig {rc.rig}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-700 mt-0.5">
                        Well: <span className="text-[#1a3055]">{rc.well}</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
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
                      <span className="font-mono text-slate-600">{rc.mobDate}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Tools on Rig</span>
                      <span className="font-mono font-bold text-blue-700">{rc.tools.length} Tools</span>
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
