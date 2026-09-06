import React, { useState, useMemo } from 'react';
import { InspectionRecord, MaintenanceRecord, ToolItem, NavModule, User } from '../types';
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
  CartesianGrid,
} from 'recharts';

interface MaintenanceDashboardViewProps {
  user?: User | null;
  inspections: InspectionRecord[];
  maintenance: MaintenanceRecord[];
  inventory: ToolItem[];
  onNavigate: (mod: NavModule) => void;
  onUpdateInspection?: (id: string, updates: Partial<InspectionRecord>) => void;
  onUpdateMaintenance?: (id: string, updates: Partial<MaintenanceRecord>) => void;
}

const QC_COLORS = ['#0d9488', '#f59e0b', '#ef4444', '#64748b'];

export const MaintenanceDashboardView: React.FC<MaintenanceDashboardViewProps> = ({
  user,
  inspections,
  maintenance,
  inventory,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'qc' | 'workshop' | 'vendors'>('all');
  const [search, setSearch] = useState('');

  // 1. QC Inspections Metrics
  const underInspectionCount = useMemo(
    () => inspections.filter((i) => i.status === 'Pending').length,
    [inspections]
  );

  const pendingInspectionReports = useMemo(
    () =>
      inspections.filter(
        (i) => i.status === 'Pending' && !i.hasReport && !i.reportNumber && !i.reportDocUrl
      ).length,
    [inspections]
  );

  // 2. Workshop Maintenance Metrics
  const inRepairCount = useMemo(
    () => maintenance.filter((m) => m.status !== 'Completed' && m.status !== 'Closed').length,
    [maintenance]
  );

  const pendingMaintenanceReports = useMemo(
    () =>
      maintenance.filter(
        (m) =>
          m.status !== 'Closed' &&
          !m.hasReport &&
          !m.reportDocUrl &&
          !m.completedDate
      ).length,
    [maintenance]
  );

  // 3. 3rd Party Vendor Repairs & Pending CoC
  const thirdPartyRepairs = useMemo(
    () => maintenance.filter((m) => m.type === 'Vendor' || m.type === 'ThirdParty'),
    [maintenance]
  );

  const pendingThirdPartyCoC = useMemo(
    () =>
      thirdPartyRepairs.filter(
        (m) =>
          m.status !== 'Closed' &&
          !m.hasThirdPartyCoc &&
          !m.thirdPartyCocRef &&
          !m.thirdPartyCocDocUrl
      ).length,
    [thirdPartyRepairs]
  );

  // 4. Pending QC Approvals
  const pendingQcApprovals = useMemo(() => {
    const fromInspections = inspections.filter(
      (i) => (i.status === 'Complete' || i.status === 'Pass') && !i.qcApproved
    ).length;
    const fromMaintenance = maintenance.filter(
      (m) => m.status === 'Ready for QC' || m.stage === 'Ready for QC'
    ).length;
    return fromInspections + fromMaintenance;
  }, [inspections, maintenance]);

  // Charts: QC Inspection Status Breakdown
  const qcStatusChartData = useMemo(() => {
    const passed = inspections.filter((i) => i.status === 'Pass').length;
    const pending = inspections.filter((i) => i.status === 'Pending').length;
    const failed = inspections.filter((i) => i.status === 'Fail').length;
    return [
      { name: 'Passed', value: passed || 1 },
      { name: 'Pending NDT', value: pending || 2 },
      { name: 'Failed / Rework', value: failed || 1 },
    ];
  }, [inspections]);

  // Charts: Maintenance Orders by Facility / Vendor
  const vendorVolumeData = useMemo(() => {
    const counts: Record<string, number> = {
      'Base Workshop': 0,
      'Noor Islam': 0,
      'Rainbow': 0,
      'Other Vendor': 0,
    };

    maintenance.forEach((m) => {
      const v = m.vendor || m.facility || 'Base Workshop';
      if (v.includes('Noor')) counts['Noor Islam'] += 1;
      else if (v.includes('Rainbow')) counts['Rainbow'] += 1;
      else if (v.includes('Base') || m.type === 'Internal') counts['Base Workshop'] += 1;
      else counts['Other Vendor'] += 1;
    });

    return Object.entries(counts).map(([name, orders]) => ({ name, orders }));
  }, [maintenance]);

  // Clean sorted inspections & maintenance
  const sortedInspections = useMemo(() => {
    return [...inspections].sort((a, b) => b.woNumber.localeCompare(a.woNumber));
  }, [inspections]);

  const sortedMaintenance = useMemo(() => {
    return [...maintenance].sort((a, b) => b.woNumber.localeCompare(a.woNumber));
  }, [maintenance]);

  return (
    <div className="space-y-4 w-full">
      {/* Top Header Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-semibold tracking-wide uppercase">
            Quality Assurance, Workshop &amp; Vendor Management
          </div>
          <h1 className="text-lg font-extrabold text-[#1a3055] tracking-tight">
            Maintenance &amp; QC Technical Dashboard
          </h1>
          <div className="text-xs text-slate-600 mt-0.5">
            Non-destructive testing (NDT), repair orders, machine shop vendor tracking, and Certificate of Conformance (CoC).
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigate('inspection')}
            className="px-3 py-1.5 rounded bg-[#1a3055] text-white hover:bg-[#24426d] font-bold text-xs shadow-sm transition cursor-pointer"
          >
            QC Inspection Bay &rarr;
          </button>
          <button
            onClick={() => onNavigate('maintenance')}
            className="px-3 py-1.5 rounded bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold text-xs shadow-sm transition cursor-pointer"
          >
            Maintenance Orders &rarr;
          </button>
        </div>
      </div>

      {/* 4 Primary KPI Technical Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: QC Inspection Bay */}
        <div className="bg-white border border-[#b8c9db] rounded p-3.5 shadow-sm border-t-[3px] border-t-rose-500">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex justify-between items-center">
            <span>QC Inspection Bay</span>
            <span className="text-[10px] text-rose-600 font-bold">Under Inspection</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-rose-700">
              {underInspectionCount}
            </span>
            <span className="text-[11px] font-bold text-slate-500">
              {pendingInspectionReports} Pending Reports
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            NDT, Visual &amp; Dimensional Verification
          </div>
        </div>

        {/* Card 2: Workshop Maintenance */}
        <div className="bg-white border border-[#b8c9db] rounded p-3.5 shadow-sm border-t-[3px] border-t-amber-500">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex justify-between items-center">
            <span>Workshop Maintenance</span>
            <span className="text-[10px] text-amber-600 font-bold">In Repair / Redress</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-amber-700">
              {inRepairCount}
            </span>
            <span className="text-[11px] font-bold text-slate-500">
              {pendingMaintenanceReports} Pending Reports
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Internal Workshop &amp; Redress Orders
          </div>
        </div>

        {/* Card 3: 3rd Party Vendor Repairs */}
        <div className="bg-white border border-[#b8c9db] rounded p-3.5 shadow-sm border-t-[3px] border-t-blue-600">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex justify-between items-center">
            <span>3rd Party Vendor Repairs</span>
            <span className="text-[10px] text-blue-600 font-bold">Machine Shops</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-blue-700">
              {thirdPartyRepairs.length}
            </span>
            <span className="text-[11px] font-bold text-rose-600">
              {pendingThirdPartyCoC} Pending CoC
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Noor Islam, Rainbow &amp; Specialized Vendors
          </div>
        </div>

        {/* Card 4: Pending QC Approvals */}
        <div className="bg-white border border-[#b8c9db] rounded p-3.5 shadow-sm border-t-[3px] border-t-purple-600">
          <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex justify-between items-center">
            <span>Pending QC Approvals</span>
            <span className="text-[10px] text-purple-600 font-bold">Awaiting Sign-off</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold font-mono text-purple-700">
              {pendingQcApprovals}
            </span>
            <span className="text-[11px] font-bold text-purple-600">
              Final Release
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Inspector Sign-off &amp; Serviceability Stamp
          </div>
        </div>
      </div>

      {/* Smart Technical Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 1: Maintenance Orders by Vendor / Machine Shop */}
        <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm lg:col-span-2">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-xs font-bold text-[#1a3055] uppercase tracking-wide">
                Repair Work Orders by Facility / Vendor
              </h3>
              <p className="text-[11px] text-slate-500">
                Volume of active maintenance orders distributed between internal workshop and 3rd-party machine shops.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
              Live Work Orders
            </span>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vendorVolumeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a3055',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: '11px',
                    border: 'none',
                  }}
                />
                <Bar dataKey="orders" name="Work Orders" fill="#1a3055" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: QC Inspection Pass/Fail/Pending Distribution */}
        <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-xs font-bold text-[#1a3055] uppercase tracking-wide">
                QC Inspection Dispositions
              </h3>
              <p className="text-[11px] text-slate-500">
                NDT and dimensional results status.
              </p>
            </div>
          </div>
          <div className="h-60 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={qcStatusChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {qcStatusChartData.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={QC_COLORS[idx % QC_COLORS.length]} />
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
                  wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Full-Width Dual Technical Management Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Table 1: QC Inspections & Reports */}
        <div className="bg-white border border-[#b8c9db] rounded shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 bg-[#dbe6f1] border-b border-[#b8c9db] flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-bold text-[#1a3055] uppercase tracking-wide">
                QC Inspections &amp; Report Status
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#1a3055] text-white">
                {inspections.length}
              </span>
            </div>
            <button
              onClick={() => onNavigate('inspection')}
              className="text-xs text-blue-700 font-bold hover:underline cursor-pointer"
            >
              Bay View &rarr;
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold">
                <tr>
                  <th className="px-3 py-2">WO #</th>
                  <th className="px-3 py-2">Serial</th>
                  <th className="px-3 py-2">Size / Tool</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Report / CoC</th>
                  <th className="px-3 py-2 text-center">QC Sign-off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {sortedInspections.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No inspection orders found.
                    </td>
                  </tr>
                ) : (
                  sortedInspections.map((ins) => {
                    const hasReport = Boolean(ins.hasReport || ins.reportNumber || ins.reportDocUrl);
                    return (
                      <tr key={ins.id} className="hover:bg-[#e4eef8] transition">
                        <td className="px-3 py-2.5 font-mono font-bold text-[#1a3055]">
                          {ins.woNumber}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-amber-900">
                          {ins.serial}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-mono font-semibold">{ins.size}</span>{' '}
                          <span className="text-slate-600">{ins.shortDesc}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              ins.status === 'Pass'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ins.status === 'Fail'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {ins.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {hasReport ? (
                            <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                              <span>✓</span> {ins.reportNumber || 'Report Attached'}
                            </span>
                          ) : (
                            <span className="text-rose-600 font-bold text-[10px] bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                              Pending Report
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {ins.qcApproved ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Approved
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Third-Party Machine Shops & CoC Tracking */}
        <div className="bg-white border border-[#b8c9db] rounded shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 bg-[#dbe6f1] border-b border-[#b8c9db] flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-bold text-[#1a3055] uppercase tracking-wide">
                Third-Party Machine Shops &amp; CoC Tracking
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-700 text-white">
                {thirdPartyRepairs.length}
              </span>
            </div>
            <button
              onClick={() => onNavigate('maintenance')}
              className="text-xs text-blue-700 font-bold hover:underline cursor-pointer"
            >
              All Orders &rarr;
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold">
                <tr>
                  <th className="px-3 py-2">WO #</th>
                  <th className="px-3 py-2">Serial</th>
                  <th className="px-3 py-2">Vendor Machine Shop</th>
                  <th className="px-3 py-2">Repair Scope</th>
                  <th className="px-3 py-2">CoC Ticket</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {sortedMaintenance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No repair work orders found.
                    </td>
                  </tr>
                ) : (
                  sortedMaintenance.map((m) => {
                    const hasCoc = Boolean(
                      m.hasThirdPartyCoc || m.thirdPartyCocRef || m.thirdPartyCocDocUrl
                    );
                    return (
                      <tr key={m.id} className="hover:bg-[#e4eef8] transition">
                        <td className="px-3 py-2.5 font-mono font-bold text-[#1a3055]">
                          {m.woNumber}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-amber-900">
                          {m.serial}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-800">
                          {m.vendor || m.facility || 'Base Workshop'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 max-w-[200px] truncate" title={m.scope || m.reason}>
                          {m.scope || m.reason || 'General Redress & Inspection'}
                        </td>
                        <td className="px-3 py-2.5">
                          {hasCoc ? (
                            <span className="text-emerald-700 font-bold text-[11px] flex items-center gap-1">
                              <span>✓</span> {m.thirdPartyCocRef || 'CoC Attached'}
                            </span>
                          ) : m.type === 'Vendor' || m.type === 'ThirdParty' ? (
                            <span className="text-rose-600 font-bold text-[10px] bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                              Pending CoC
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              m.status === 'Completed' || m.status === 'Closed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.status === 'In Progress'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
