import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import {
  Boxes,
  Gauge,
  Wrench,
  ShieldCheck,
  Truck,
  Layers,
  Activity,
  HardHat,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  Filter,
  Search,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { ToolItem, MaintenanceRecord, InspectionRecord, NavModule, User } from '../types';

interface InventoryDashboardViewProps {
  user?: User | null;
  inventory: ToolItem[];
  inspections: InspectionRecord[];
  maintenance: MaintenanceRecord[];
  onNavigate: (mod: NavModule) => void;
  onOpenAddAsset?: () => void;
}

type DashboardViewTab = 'analytics' | 'rigs' | 'pipeline' | 'categories';

export const InventoryDashboardView: React.FC<InventoryDashboardViewProps> = ({
  user,
  inventory,
  inspections,
  maintenance,
  onNavigate,
  onOpenAddAsset,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardViewTab>('analytics');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedSizeFilter, setSelectedSizeFilter] = useState('ALL');

  const activeInv = useMemo(
    () => inventory.filter((t) => t.status !== 'Removed'),
    [inventory]
  );

  // 1. Total Tools
  const totalTools = activeInv.length;

  // 2. Tools on Rig
  const toolsInRig = useMemo(() => {
    return activeInv.filter(
      (t) => (t.location || '').toLowerCase().includes('rig') || t.status === 'On Rig'
    );
  }, [activeInv]);

  // 3. Tools under Inspection
  const toolsUnderInspection = useMemo(() => {
    const inspectionSerials = new Set(
      inspections.filter((i) => i.status === 'Pending').map((i) => i.serial)
    );
    return activeInv.filter(
      (t) =>
        t.status === 'Inspection' ||
        (t.location || '').toLowerCase().includes('inspection') ||
        (t.location || '').toLowerCase().includes('bay') ||
        inspectionSerials.has(t.serial)
    );
  }, [activeInv, inspections]);

  // 4. Tools under Maintenance / Workshop
  const toolsUnderMaintenance = useMemo(() => {
    const maintSerials = new Set(
      maintenance
        .filter((m) => m.status !== 'Completed' && m.status !== 'Closed')
        .map((m) => m.serial)
    );
    return activeInv.filter(
      (t) =>
        ['Repair', 'Redress'].includes(t.status) ||
        (t.location || '').toLowerCase().includes('workshop') ||
        maintSerials.has(t.serial)
    );
  }, [activeInv, maintenance]);

  // 5. Sub-contractor / Cross-Rental Tools
  const subContractorTools = useMemo(() => {
    return activeInv.filter(
      (t) => !t.isEmdad || (t.ownership && t.ownership.toUpperCase() !== 'EMDAD')
    );
  }, [activeInv]);

  // 6. Tools Outside Emdad (Vendor machine shops)
  const toolsOutsideEmdad = useMemo(() => {
    const vendorMaintSerials = new Set(
      maintenance
        .filter(
          (m) =>
            (m.type === 'Vendor' || m.type === 'ThirdParty') &&
            m.status !== 'Completed' &&
            m.status !== 'Closed' &&
            m.stage !== 'Received from Vendor'
        )
        .map((m) => m.serial)
    );

    return activeInv.filter(
      (t) =>
        vendorMaintSerials.has(t.serial) ||
        (t.location || '').toLowerCase().includes('machine shop') ||
        (t.location || '').toLowerCase().includes('vendor') ||
        (t.location || '').toLowerCase().includes('3rd party')
    );
  }, [activeInv, maintenance]);

  // Tools Ready at Base
  const readyAtBase = useMemo(() => {
    return activeInv.filter(
      (t) =>
        t.status === 'Good' &&
        ['Emdad Base', 'Base', 'Our Base'].includes(t.location)
    );
  }, [activeInv]);

  // Readiness percentages
  const fleetReadinessPct = totalTools > 0 ? Math.round((readyAtBase.length / totalTools) * 100) : 0;
  const onRigPct = totalTools > 0 ? Math.round((toolsInRig.length / totalTools) * 100) : 0;
  const qcPct = totalTools > 0 ? Math.round((toolsUnderInspection.length / totalTools) * 100) : 0;
  const maintPct = totalTools > 0 ? Math.round((toolsUnderMaintenance.length / totalTools) * 100) : 0;

  // Chart Data 1: Fleet Status Donut
  const statusDonutData = useMemo(() => [
    { name: 'Ready at Base', value: readyAtBase.length, color: '#10b981' },
    { name: 'Active on Rig', value: toolsInRig.length, color: '#2563eb' },
    { name: 'QC Inspection', value: toolsUnderInspection.length, color: '#f43f5e' },
    { name: 'Workshop Redress', value: toolsUnderMaintenance.length, color: '#f59e0b' },
    { name: 'Outside Machine Shop', value: toolsOutsideEmdad.length, color: '#0284c7' },
  ], [readyAtBase, toolsInRig, toolsUnderInspection, toolsUnderMaintenance, toolsOutsideEmdad]);

  // Ownership breakdown
  const ownershipMap = useMemo(() => {
    const map: Record<string, number> = {};
    activeInv.forEach((t) => {
      const o = t.ownership || (t.isEmdad ? 'EMDAD' : '3rd Party');
      map[o] = (map[o] || 0) + 1;
    });
    return map;
  }, [activeInv]);

  // Ownership Donut Data
  const ownershipChartData = useMemo(() => {
    return Object.entries(ownershipMap).map(([owner, count], idx) => {
      const colors = ['#1a3055', '#7c3aed', '#0284c7', '#d97706', '#059669', '#dc2626'];
      return {
        name: owner,
        value: count,
        color: colors[idx % colors.length],
      };
    });
  }, [ownershipMap]);

  // Category breakdown
  const categoryStats = useMemo(() => {
    const map: Record<string, { total: number; ready: number; onRig: number; qc: number; repair: number }> = {};
    activeInv.forEach((t) => {
      const cat = t.shortDesc || 'Other Equipment';
      if (!map[cat]) {
        map[cat] = { total: 0, ready: 0, onRig: 0, qc: 0, repair: 0 };
      }
      map[cat].total++;
      if (t.status === 'Good') map[cat].ready++;
      else if (t.status === 'On Rig') map[cat].onRig++;
      else if (t.status === 'Inspection') map[cat].qc++;
      else map[cat].repair++;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [activeInv]);

  // Chart Data 2: Top 7 Categories Bar Chart
  const topCategoriesChartData = useMemo(() => {
    return categoryStats.slice(0, 8).map(([cat, stats]) => ({
      name: cat.length > 14 ? `${cat.slice(0, 12)}..` : cat,
      fullName: cat,
      ready: stats.ready,
      onRig: stats.onRig,
      inService: stats.qc + stats.repair,
      total: stats.total,
    }));
  }, [categoryStats]);

  // Size spectrum breakdown
  const sizeStats = useMemo(() => {
    const map: Record<string, number> = {};
    activeInv.forEach((t) => {
      const sz = t.size || 'N/A';
      map[sz] = (map[sz] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [activeInv]);

  // Chart Data 3: Size Spectrum Area Chart
  const sizeChartData = useMemo(() => {
    return sizeStats.slice(0, 10).map(([size, count]) => ({
      size,
      count,
    }));
  }, [sizeStats]);

  // Rig Deployment Matrix
  const rigDeployments = useMemo(() => {
    const rigs = [
      { name: 'Rig 84 (ADNOC Offshore)', field: 'Upper Zakum', type: 'Offshore Jackup', tools: 8, dtRef: 'DT-03161', status: 'Drilling 8-1/2" Section' },
      { name: 'Rig 102 (ADNOC Onshore)', field: 'Bab Field', type: 'Deep Gas Land Rig', tools: 6, dtRef: 'DT-03162', status: 'Casing 12-1/4" Section' },
      { name: 'Rig 155 (Island Drilling)', field: 'Al Dhabbiya', type: 'Island Modular Rig', tools: 5, dtRef: 'DT-03163', status: 'BHA Tripping' },
      { name: 'Rig 201 (Exploration)', field: 'Shah Field HPHT', type: 'High Pressure Gas', tools: 3, dtRef: 'DT-03164', status: 'Logging & Coring' },
      { name: 'Rig 67 (Workover)', field: 'Asab Field', type: 'Heavy Workover', tools: 2, dtRef: 'DT-03165', status: 'Fishing Operation' },
    ];
    return rigs;
  }, []);

  // Filtered categories for Portfolio view
  const filteredCategoryCards = useMemo(() => {
    return categoryStats.filter(([cat]) => {
      const matchSearch = searchFilter === '' || cat.toLowerCase().includes(searchFilter.toLowerCase());
      return matchSearch;
    });
  }, [categoryStats, searchFilter]);

  // Custom Dark Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0f1e36] text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs">
          <p className="font-bold text-amber-400 mb-1.5">{label || payload[0]?.name}</p>
          {payload.map((entry: any, index: number) => (
            <p key={`tooltip-${index}`} className="flex items-center justify-between gap-4 text-slate-200 font-mono py-0.5">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-bold">{entry.value}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* 1. Executive Operations Header */}
      <div className="bg-gradient-to-r from-[#0f1e36] via-[#1a3055] to-[#24426d] text-white rounded-lg p-4 shadow-md border border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Fleet Telemetry Live
              </span>
              <span className="text-slate-400 text-xs">&bull;</span>
              <span className="text-[11px] font-mono text-slate-300">
                Base: Mussafah Industrial Hub &bull; Abu Dhabi
              </span>
            </div>
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              <Boxes className="w-5 h-5 text-amber-400" />
              Downhole Assets &amp; Inventory Command Center
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl">
              Real-time operational readiness, downhole fleet run-life, rig site deployments, and certified workshop turnover.
            </p>
          </div>

          {/* Action Hub */}
          <div className="flex flex-wrap items-center gap-2.5">
            {onOpenAddAsset && user?.role !== 'Viewer' && (
              <button
                onClick={onOpenAddAsset}
                className="px-3.5 py-1.5 rounded-md bg-[#ffd875] text-[#3a2500] font-bold text-xs hover:bg-[#ffe399] transition shadow cursor-pointer flex items-center gap-1.5"
              >
                <span>+</span> Add New Asset
              </button>
            )}
            <button
              onClick={() => onNavigate('inventory')}
              className="px-3.5 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition cursor-pointer flex items-center gap-1.5"
            >
              <span>Browse Catalog</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* View Mode Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-white/10 text-xs">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-1.5 rounded font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'analytics'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Visual Fleet Analytics
          </button>
          <button
            onClick={() => setActiveTab('rigs')}
            className={`px-3 py-1.5 rounded font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'rigs'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            Rig Deployments ({toolsInRig.length} Tools)
          </button>
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-3 py-1.5 rounded font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'pipeline'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Maintenance &amp; QC Pipeline ({toolsUnderMaintenance.length + toolsUnderInspection.length})
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-3 py-1.5 rounded font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'categories'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Category Catalog Matrix ({categoryStats.length} Groups)
          </button>
        </div>
      </div>

      {/* 2. Executive KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Assets */}
        <div className="bg-white border border-[#b8c9db] rounded-lg p-3.5 shadow-2xs relative overflow-hidden group hover:border-[#1a3055] transition">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span>Total Fleet</span>
            <Boxes className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-1 text-2xl font-black font-mono text-[#1a3055]">
            {totalTools.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Active Assets</span>
            <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1 rounded">100% Tracked</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#1a3055]" />
        </div>

        {/* Ready at Base */}
        <div className="bg-white border border-[#b8c9db] rounded-lg p-3.5 shadow-2xs relative overflow-hidden group hover:border-emerald-600 transition">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            <span>Ready at Base</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1 text-2xl font-black font-mono text-emerald-700">
            {readyAtBase.length.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Operational Ready</span>
            <span className="font-mono font-bold text-emerald-700">{fleetReadinessPct}%</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </div>

        {/* Active on Rig */}
        <div className="bg-white border border-[#b8c9db] rounded-lg p-3.5 shadow-2xs relative overflow-hidden group hover:border-blue-600 transition">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-blue-700">
            <span>Active on Rig</span>
            <Truck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-1 text-2xl font-black font-mono text-blue-700">
            {toolsInRig.length.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Deployed Utilization</span>
            <span className="font-mono font-bold text-blue-700">{onRigPct}%</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600" />
        </div>

        {/* QC & Inspection */}
        <div className="bg-white border border-[#b8c9db] rounded-lg p-3.5 shadow-2xs relative overflow-hidden group hover:border-rose-600 transition">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-rose-700">
            <span>QC Inspection</span>
            <ShieldCheck className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-1 text-2xl font-black font-mono text-rose-700">
            {toolsUnderInspection.length.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>NDT &amp; Calibration</span>
            <span className="font-mono font-bold text-rose-700">{qcPct}%</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-500" />
        </div>

        {/* In Workshop / Redress */}
        <div className="bg-white border border-[#b8c9db] rounded-lg p-3.5 shadow-2xs relative overflow-hidden group hover:border-amber-600 transition">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-amber-700">
            <span>In Workshop</span>
            <Wrench className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-1 text-2xl font-black font-mono text-amber-700">
            {toolsUnderMaintenance.length.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Redress &amp; Turnaround</span>
            <span className="font-mono font-bold text-amber-700">{maintPct}%</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
        </div>

        {/* Sub-Contractor Cross Rentals */}
        <div className="bg-white border border-[#b8c9db] rounded-lg p-3.5 shadow-2xs relative overflow-hidden group hover:border-purple-600 transition">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-purple-700">
            <span>Cross-Rentals</span>
            <Building2 className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-1 text-2xl font-black font-mono text-purple-700">
            {subContractorTools.length.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>3rd Party Vendors</span>
            <span className="font-mono font-bold text-purple-700">
              {Math.round((subContractorTools.length / totalTools) * 100)}%
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600" />
        </div>
      </div>

      {/* 3. TAB 1: VISUAL FLEET ANALYTICS (Charts & Visual Telemetry) */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          {/* Main Visual Row: Donut Chart & Category Stacked Bar Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Donut Chart: Fleet Operational Status */}
            <div className="lg:col-span-5 bg-white border border-[#b8c9db] rounded-lg p-4 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div>
                    <h2 className="text-sm font-bold text-[#1a3055]">
                      Fleet Operational Status Distribution
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Real-time breakdown of asset readiness and deployment
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-100 text-emerald-900 border border-emerald-300">
                    {fleetReadinessPct}% Available
                  </span>
                </div>

                {/* Donut Chart Visual */}
                <div className="h-64 w-full relative mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusDonutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={95}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {statusDonutData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Center Stat Readout */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-black font-mono text-[#1a3055]">
                      {totalTools}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Total Assets
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Breakdown Legend */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                {statusDonutData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-1.5 rounded bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-[11px] font-medium text-slate-700">{item.name}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-900 text-[11px]">
                      {item.value} ({Math.round((item.value / totalTools) * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stacked Bar Chart: Top Asset Categories */}
            <div className="lg:col-span-7 bg-white border border-[#b8c9db] rounded-lg p-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <h2 className="text-sm font-bold text-[#1a3055]">
                    Top Equipment Families &amp; Availability Matrix
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Ready vs. Rig vs. In-Service distribution across high-volume categories
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('categories')}
                  className="text-xs font-bold text-blue-700 hover:text-blue-900 cursor-pointer flex items-center gap-1"
                >
                  View All ({categoryStats.length}) &rarr;
                </button>
              </div>

              {/* Stacked Bar Chart Visual */}
              <div className="h-72 w-full mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCategoriesChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: '#475569' }}
                      angle={-15}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#475569' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Bar dataKey="ready" name="Ready at Base" fill="#10b981" stackId="stack" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="onRig" name="Active on Rig" fill="#2563eb" stackId="stack" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="inService" name="QC & Redress" fill="#f59e0b" stackId="stack" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Secondary Visual Row: Outer Diameter (OD) Spectrum & Fleet Ownership */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Size Spectrum Area Chart */}
            <div className="lg:col-span-7 bg-white border border-[#b8c9db] rounded-lg p-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <h2 className="text-sm font-bold text-[#1a3055]">
                    Wellbore Hole Section Outer Diameter (OD) Distribution
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Physical sizing range across 3-1/2" slimhole to 36" conductor hole sections
                  </p>
                </div>
                <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {sizeStats.length} Diameters Tracked
                </span>
              </div>

              <div className="h-56 w-full mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sizeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sizeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="size" tick={{ fontSize: 10, fill: '#475569' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#475569' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Tools in OD"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#sizeGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Fleet Ownership & Sourcing Allocation */}
            <div className="lg:col-span-5 bg-white border border-[#b8c9db] rounded-lg p-4 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div>
                    <h2 className="text-sm font-bold text-[#1a3055]">
                      Capital Fleet vs. Sub-Contractor Sourcing
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Emdad owned assets vs. specialized cross-rentals
                    </p>
                  </div>
                </div>

                <div className="h-44 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={ownershipChartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        innerRadius={35}
                        dataKey="value"
                      >
                        {ownershipChartData.map((entry, index) => (
                          <Cell key={`owner-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Vendor Badges */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                {Object.entries(ownershipMap).map(([owner, count]) => (
                  <div
                    key={owner}
                    className={`p-2 rounded border flex items-center justify-between ${
                      owner === 'EMDAD'
                        ? 'bg-blue-50/80 border-blue-200 text-blue-950 font-bold'
                        : 'bg-purple-50/70 border-purple-200 text-purple-950'
                    }`}
                  >
                    <span className="truncate pr-1">{owner}</span>
                    <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded shadow-2xs border border-slate-200">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB 2: RIG DEPLOYMENT MATRIX */}
      {activeTab === 'rigs' && (
        <div className="bg-white border border-[#b8c9db] rounded-lg p-4 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-[#1a3055] flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                Active Rig Deployment Matrix &amp; Wellbore Sites
              </h2>
              <p className="text-xs text-slate-500">
                Current asset placement on ADNOC offshore jackups, island pads, and onshore exploration rigs
              </p>
            </div>
            <span className="px-2.5 py-1 rounded bg-blue-100 text-blue-900 font-bold font-mono text-xs">
              {toolsInRig.length} Tools Deployed
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {rigDeployments.map((rig) => (
              <div
                key={rig.name}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-blue-700 hover:shadow-md transition space-y-2.5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-[#1a3055] text-xs leading-snug">
                      {rig.name}
                    </h3>
                    <div className="text-[11px] text-slate-500 font-medium">
                      Field: {rig.field} &bull; {rig.type}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-blue-100 text-blue-900 border border-blue-300">
                    {rig.tools} Tools
                  </span>
                </div>

                <div className="bg-white p-2 rounded border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between text-slate-600 text-[11px]">
                    <span>Current Well Operation:</span>
                    <strong className="text-emerald-700">{rig.status}</strong>
                  </div>
                  <div className="flex justify-between text-slate-600 text-[11px]">
                    <span>Latest Mobilization Ticket:</span>
                    <strong className="font-mono text-amber-900">{rig.dtRef}</strong>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="text-slate-500">Run-Life Health: 100% Good</span>
                  <button
                    onClick={() => onNavigate('inventory')}
                    className="font-bold text-blue-700 hover:text-blue-900 cursor-pointer flex items-center gap-1"
                  >
                    View Rig BHA &rarr;
                  </button>
                </div>
              </div>
            ))}

            {/* Central Mussafah Base Depot Card */}
            <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-lg space-y-2.5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-emerald-950 text-xs leading-snug">
                    Emdad Mussafah Central Yard
                  </h3>
                  <div className="text-[11px] text-emerald-800 font-medium">
                    Central Storage, QC Bays, Redress Workshops
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-200 text-emerald-900 border border-emerald-300">
                  {readyAtBase.length} Ready
                </span>
              </div>

              <div className="bg-white p-2 rounded border border-emerald-200 text-xs space-y-1">
                <div className="flex justify-between text-slate-600 text-[11px]">
                  <span>Operational Fleet Status:</span>
                  <strong className="text-emerald-700">{fleetReadinessPct}% Mobilization Ready</strong>
                </div>
                <div className="flex justify-between text-slate-600 text-[11px]">
                  <span>In-House Redress Capacity:</span>
                  <strong className="text-blue-700">Full Certified Workshop</strong>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-[11px]">
                <span className="text-emerald-800 font-medium">Certified API Spec 7-1</span>
                <button
                  onClick={() => onNavigate('inventory')}
                  className="font-bold text-emerald-800 hover:text-emerald-950 cursor-pointer"
                >
                  Manage Base Inventory &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB 3: MAINTENANCE & QC CHEVRON PIPELINE */}
      {activeTab === 'pipeline' && (
        <div className="bg-white border border-[#b8c9db] rounded-lg p-4 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-[#1a3055] flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-600" />
                Workshop Redress &amp; QC Certification Pipeline
              </h2>
              <p className="text-xs text-slate-500">
                End-to-end turnaround cycle from rig return to certified mobilization green tag
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate('inspections')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-bold transition"
              >
                Go to Inspections &rarr;
              </button>
              <button
                onClick={() => onNavigate('maintenance')}
                className="px-2.5 py-1 bg-[#1a3055] hover:bg-[#24426d] text-white rounded text-xs font-bold transition"
              >
                Go to Maintenance &rarr;
              </button>
            </div>
          </div>

          {/* 5-Stage Pipeline Graphic */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Stage 1 */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 relative">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>01. Inbound</span>
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="font-bold text-[#1a3055] text-xs">
                Rig Return &amp; Wash Bay
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Decontamination, high-pressure steam wash, serial verification.
              </p>
              <div className="pt-1 flex items-center justify-between text-xs font-mono font-bold text-slate-700">
                <span>Active:</span>
                <span className="bg-slate-200 px-2 py-0.5 rounded">4 Tools</span>
              </div>
            </div>

            {/* Stage 2 */}
            <div className="p-3 bg-rose-50/50 border border-rose-200 rounded-lg space-y-2 relative">
              <div className="flex items-center justify-between text-xs font-bold text-rose-700">
                <span>02. NDT Inspection</span>
                <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
              </div>
              <div className="font-bold text-rose-950 text-xs">
                MPI &amp; Ultrasonic Testing
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Magnaflux thread inspection, ultrasonic crack detection, hardbanding check.
              </p>
              <div className="pt-1 flex items-center justify-between text-xs font-mono font-bold text-rose-800">
                <span>Under QC:</span>
                <span className="bg-rose-100 px-2 py-0.5 rounded">{toolsUnderInspection.length} Tools</span>
              </div>
            </div>

            {/* Stage 3 */}
            <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg space-y-2 relative">
              <div className="flex items-center justify-between text-xs font-bold text-amber-700">
                <span>03. Workshop</span>
                <Wrench className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="font-bold text-amber-950 text-xs">
                Redress &amp; Machining
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Seal kits replacement, thread re-cut, breakout unit torque calibration.
              </p>
              <div className="pt-1 flex items-center justify-between text-xs font-mono font-bold text-amber-800">
                <span>In Redress:</span>
                <span className="bg-amber-100 px-2 py-0.5 rounded">{toolsUnderMaintenance.length} Tools</span>
              </div>
            </div>

            {/* Stage 4 */}
            <div className="p-3 bg-sky-50/50 border border-sky-200 rounded-lg space-y-2 relative">
              <div className="flex items-center justify-between text-xs font-bold text-sky-700">
                <span>04. Pressure Test</span>
                <Gauge className="w-3.5 h-3.5 text-sky-600" />
              </div>
              <div className="font-bold text-sky-950 text-xs">
                Hydrostatic &amp; API Load
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                10,000 PSI hydrostatic shell testing and API certified load proofing.
              </p>
              <div className="pt-1 flex items-center justify-between text-xs font-mono font-bold text-sky-800">
                <span>Testing:</span>
                <span className="bg-sky-100 px-2 py-0.5 rounded">3 Tools</span>
              </div>
            </div>

            {/* Stage 5 */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-300 rounded-lg space-y-2 relative">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-700">
                <span>05. Certified Ready</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="font-bold text-emerald-950 text-xs">
                Green Tag Mobilization
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Thread protectors installed, coated with rust inhibitor, racked in Yard.
              </p>
              <div className="pt-1 flex items-center justify-between text-xs font-mono font-bold text-emerald-800">
                <span>Ready Stock:</span>
                <span className="bg-emerald-200 px-2 py-0.5 rounded">{readyAtBase.length} Tools</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. TAB 4: CATEGORY CATALOG MATRIX */}
      {activeTab === 'categories' && (
        <div className="bg-white border border-[#b8c9db] rounded-lg p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-sm font-bold text-[#1a3055]">
                Downhole Tool Category Portfolios
              </h2>
              <p className="text-xs text-slate-500">
                Dedicated asset pools categorized by tool functionality with instant filtering
              </p>
            </div>

            {/* Quick Search inside categories */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter categories..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-8 pr-3 py-1 text-xs border border-slate-300 rounded bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 w-48"
                />
              </div>
              <button
                onClick={() => onNavigate('inventory')}
                className="px-3 py-1 bg-[#1a3055] text-white rounded text-xs font-bold hover:bg-[#24426d] transition cursor-pointer"
              >
                Open Full Catalog &rarr;
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredCategoryCards.map(([cat, stats]) => {
              const readyPct = Math.round((stats.ready / stats.total) * 100);
              return (
                <div
                  key={cat}
                  onClick={() => onNavigate('inventory')}
                  className="p-3 bg-gradient-to-b from-white to-slate-50/70 border border-slate-200 rounded-lg hover:border-[#1a3055] hover:shadow-md transition cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <h3 className="font-bold text-[#1a3055] text-xs group-hover:text-blue-700 leading-snug line-clamp-1">
                        {cat}
                      </h3>
                      <span className="text-base font-black font-mono text-[#1a3055] ml-2">
                        {stats.total}
                      </span>
                    </div>

                    {/* Mini availability bar */}
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden flex mt-2">
                      <div style={{ width: `${(stats.ready / stats.total) * 100}%` }} className="bg-emerald-500" />
                      <div style={{ width: `${(stats.onRig / stats.total) * 100}%` }} className="bg-blue-500" />
                      <div style={{ width: `${((stats.qc + stats.repair) / stats.total) * 100}%` }} className="bg-amber-500" />
                    </div>

                    <div className="mt-2.5 text-[11px] text-slate-600 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Ready at Base:</span>
                        <strong className="text-emerald-700 font-mono">{stats.ready}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Deployed on Rig:</span>
                        <strong className="text-blue-700 font-mono">{stats.onRig}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">QC &amp; Redress:</span>
                        <strong className="text-amber-700 font-mono">{stats.qc + stats.repair}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] font-bold text-blue-700 flex items-center justify-between group-hover:text-blue-900">
                    <span>{readyPct}% Available</span>
                    <span className="flex items-center gap-0.5">Explore Assets &rarr;</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
