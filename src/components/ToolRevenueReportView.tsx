import React, { useState, useMemo } from 'react';
import { User } from '../types';
import toolRevenueJson from '../data/toolRevenueData.json';
import * as XLSX from 'xlsx';
import {
  DollarSign,
  TrendingUp,
  Layers,
  Award,
  Search,
  Download,
  Printer,
  ChevronRight,
  ChevronLeft,
  ArrowUpDown,
  Filter,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  Building2,
  Shield,
  Clock,
  Sparkles,
  BarChart3,
  PieChart,
  Eye
} from 'lucide-react';

interface ToolRevenueReportViewProps {
  user?: User | null;
  onNavigate?: (module: string, param?: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export type AnalyticsTab = 'tools-ledger' | 'category-summary' | 'size-summary' | 'contract-summary';

export const ToolRevenueReportView: React.FC<ToolRevenueReportViewProps> = ({
  user,
  onNavigate,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('tools-ledger');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedSize, setSelectedSize] = useState('ALL');
  const [selectedContract, setSelectedContract] = useState('ALL');
  const [sortField, setSortField] = useState<'totalRevenue' | 'operRevenue' | 'standbyRevenue' | 'operDays' | 'standbyDays' | 'jobsCount'>('totalRevenue');
  const [sortAsc, setSortAsc] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Tool Detail Modal
  const [selectedToolDetail, setSelectedToolDetail] = useState<any | null>(null);

  const rawData = toolRevenueJson;
  const summary = rawData.summary;

  // Filter options
  const categoryOptions = useMemo(() => {
    return rawData.categories.map((c) => c.category).filter(Boolean).sort();
  }, [rawData.categories]);

  const sizeOptions = useMemo(() => {
    return rawData.sizes.map((s) => s.size).filter(Boolean).sort();
  }, [rawData.sizes]);

  const contractOptions = useMemo(() => {
    const set = new Set<string>();
    rawData.contracts.forEach((c) => {
      if (c.contract) set.add(c.contract);
      if (c.client) set.add(c.client);
    });
    return Array.from(set).sort();
  }, [rawData.contracts]);

  // Filtered Tools List
  const filteredTools = useMemo(() => {
    return rawData.tools.filter((t) => {
      if (selectedCategory !== 'ALL' && t.category !== selectedCategory) return false;
      if (selectedSize !== 'ALL' && t.size !== selectedSize) return false;
      if (selectedContract !== 'ALL') {
        const matchesContract = (t.contracts || []).some((c: string) => c.includes(selectedContract)) ||
                                (t.clients || []).some((cl: string) => cl.includes(selectedContract));
        if (!matchesContract) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${t.serial} ${t.assetNo} ${t.desc} ${t.category} ${t.size} ${(t.clients || []).join(' ')} ${(t.contracts || []).join(' ')} ${(t.rigs || []).join(' ')}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [rawData.tools, selectedCategory, selectedSize, selectedContract, searchQuery]);

  // Sorted Tools List
  const sortedTools = useMemo(() => {
    return [...filteredTools].sort((a, b) => {
      let aVal = a[sortField] || 0;
      let bVal = b[sortField] || 0;
      return sortAsc ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
  }, [filteredTools, sortField, sortAsc]);

  // Paginated Tools
  const paginatedTools = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTools.slice(start, start + pageSize);
  }, [sortedTools, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedTools.length / pageSize) || 1;

  // Filtered summary metrics dynamically computed based on active filters
  const filteredMetrics = useMemo(() => {
    let rev = 0;
    let operRev = 0;
    let stbyRev = 0;
    let operD = 0;
    let stbyD = 0;
    let jobs = 0;

    filteredTools.forEach((t) => {
      rev += t.totalRevenue;
      operRev += t.operRevenue;
      stbyRev += t.standbyRevenue;
      operD += t.operDays;
      stbyD += t.standbyDays;
      jobs += t.jobsCount;
    });

    return {
      count: filteredTools.length,
      revenue: rev,
      operRevenue: operRev,
      standbyRevenue: stbyRev,
      operDays: operD,
      standbyDays: stbyD,
      jobsCount: jobs,
    };
  }, [filteredTools]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const formatCurrency = (val?: number | null) => {
    if (val === null || val === undefined) return '$0.00';
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Export to Excel / CSV
  const handleExportExcel = () => {
    const exportRows = sortedTools.map((t, idx) => ({
      'Rank': idx + 1,
      'Tool Serial': t.serial,
      'Asset Number': t.assetNo,
      'Description': t.desc,
      'Category': t.category,
      'Size': t.size,
      'Total Revenue (USD)': t.totalRevenue,
      'Operating Revenue (USD)': t.operRevenue,
      'Standby Revenue (USD)': t.standbyRevenue,
      'Operating Days': t.operDays,
      'Standby Days': t.standbyDays,
      'Total Rental Days': t.operDays + t.standbyDays,
      'Jobs Count': t.jobsCount,
      'Last Job ID': t.lastJobId || '—',
      'Contracts': (t.contracts || []).join(', '),
      'Clients': (t.clients || []).join(', '),
      'Rigs': (t.rigs || []).join(', '),
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tool Revenue Report');
    XLSX.writeFile(wb, `EMDAD_Tool_Revenue_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);

    if (showToast) showToast('Exported Tool Revenue Report to Excel', 'success');
  };

  return (
    <div className="space-y-4 text-slate-800">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-[#0d213a] via-[#1a3a60] to-[#0f2d4e] rounded-xl p-5 text-white shadow-md border border-slate-700/60">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Live Financial Analytics
              </span>
              <span className="bg-blue-500/20 text-blue-200 border border-blue-400/30 text-xs px-2.5 py-0.5 rounded-full font-mono">
                {summary.totalTools.toLocaleString()} Fleet Tools Tracked
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span>Tool Fleet Revenue &amp; Utilization Report</span>
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl">
              Lifetime earning breakdown by tool serial, category (303 official classes), size (358 dimensions), and contract agreements.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg transition shadow flex items-center gap-1.5 cursor-pointer"
              title="Download full analytics as Excel spreadsheet"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export to Excel</span>
            </button>
            <button
              onClick={() => window.print()}
              className="bg-white/10 hover:bg-white/20 text-white font-semibold text-xs px-3.5 py-2 rounded-lg border border-white/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Report</span>
            </button>
          </div>
        </div>

        {/* 4 Primary KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 border border-white/10">
            <div className="flex items-center justify-between text-slate-300 text-xs font-semibold mb-1">
              <span>Total Fleet Revenue</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-black text-emerald-300 font-mono">
              {formatCurrency(filteredMetrics.revenue)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Across {filteredMetrics.count.toLocaleString()} tools selected
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 border border-white/10">
            <div className="flex items-center justify-between text-slate-300 text-xs font-semibold mb-1">
              <span>Operating Revenue</span>
              <TrendingUp className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl font-black text-blue-300 font-mono">
              {formatCurrency(filteredMetrics.operRevenue)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
              {filteredMetrics.operDays.toLocaleString()} Operating Days ('1')
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 border border-white/10">
            <div className="flex items-center justify-between text-slate-300 text-xs font-semibold mb-1">
              <span>Standby Revenue</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-black text-amber-300 font-mono">
              {formatCurrency(filteredMetrics.standbyRevenue)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
              {filteredMetrics.standbyDays.toLocaleString()} Standby Days ('S')
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 border border-white/10">
            <div className="flex items-center justify-between text-slate-300 text-xs font-semibold mb-1">
              <span>Utilization Days</span>
              <Award className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xl font-black text-purple-300 font-mono">
              {(filteredMetrics.operDays + filteredMetrics.standbyDays).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Total billable days logged on rigs
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-300 bg-white px-3 py-1.5 rounded-t-lg shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('tools-ledger')}
            className={`px-3.5 py-1.5 rounded text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'tools-ledger'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Tool Revenue Ledger ({filteredTools.length.toLocaleString()})</span>
          </button>
          <button
            onClick={() => setActiveTab('category-summary')}
            className={`px-3.5 py-1.5 rounded text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'category-summary'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Category Analytics ({rawData.categories.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('size-summary')}
            className={`px-3.5 py-1.5 rounded text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'size-summary'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <PieChart className="w-3.5 h-3.5" />
            <span>Size Analytics ({rawData.sizes.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('contract-summary')}
            className={`px-3.5 py-1.5 rounded text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'contract-summary'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Contract &amp; Client Breakdown ({rawData.contracts.length})</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-50 border border-slate-300 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[300px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search serial, asset no, description, rig..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 max-w-[200px]"
          >
            <option value="ALL">All Categories ({categoryOptions.length})</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Size Filter */}
          <select
            value={selectedSize}
            onChange={(e) => {
              setSelectedSize(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 max-w-[160px]"
          >
            <option value="ALL">All Sizes ({sizeOptions.length})</option>
            {sizeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Contract Filter */}
          <select
            value={selectedContract}
            onChange={(e) => {
              setSelectedContract(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 max-w-[220px]"
          >
            <option value="ALL">All Contracts / Clients</option>
            {contractOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {(selectedCategory !== 'ALL' || selectedSize !== 'ALL' || selectedContract !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedCategory('ALL');
                setSelectedSize('ALL');
                setSelectedContract('ALL');
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="text-xs text-rose-600 hover:text-rose-800 font-bold underline cursor-pointer px-1"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Quick Row Count & Page size selector */}
        <div className="flex items-center gap-2 text-slate-600 font-mono text-[11px]">
          <span>Showing {paginatedTools.length} of {sortedTools.length} tools</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-300 rounded px-2 py-1 text-xs"
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
            <option value={200}>200 / page</option>
          </select>
        </div>
      </div>

      {/* TAB 1: TOOL REVENUE LEDGER */}
      {activeTab === 'tools-ledger' && (
        <div className="bg-white border border-slate-300 rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px] select-none">
                <tr>
                  <th className="p-2 text-center w-12">#</th>
                  <th className="p-2 cursor-pointer hover:bg-blue-100" onClick={() => handleSort('totalRevenue')}>
                    <div className="flex items-center gap-1">
                      <span>Tool Serial / Asset</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2">Description</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Size</th>
                  <th className="p-2 text-right cursor-pointer hover:bg-blue-100" onClick={() => handleSort('totalRevenue')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Total Revenue ($)</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2 text-right cursor-pointer hover:bg-blue-100" onClick={() => handleSort('operRevenue')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Ops Rev ($)</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2 text-right cursor-pointer hover:bg-blue-100" onClick={() => handleSort('standbyRevenue')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Standby Rev ($)</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2 text-center cursor-pointer hover:bg-blue-100" onClick={() => handleSort('operDays')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Ops Days ('1')</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2 text-center cursor-pointer hover:bg-blue-100" onClick={() => handleSort('standbyDays')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Stby Days ('S')</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2 text-center cursor-pointer hover:bg-blue-100" onClick={() => handleSort('jobsCount')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Jobs</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2">Contracts</th>
                  <th className="p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {paginatedTools.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="p-8 text-center text-slate-500 font-medium">
                      No tool records match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedTools.map((tool, idx) => {
                    const globalRank = (currentPage - 1) * pageSize + idx + 1;
                    return (
                      <tr key={tool.serial} className="hover:bg-blue-50/60 transition h-8 leading-none">
                        <td className="py-1.5 px-2 text-center font-mono text-slate-400 font-bold">{globalRank}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap font-mono font-bold text-slate-900">
                          {tool.serial}
                        </td>
                        <td className="py-1.5 px-2 truncate max-w-[280px] text-slate-800" title={tool.desc}>
                          {tool.desc || '—'}
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                            {tool.category || 'OTHER'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap font-mono text-slate-700 font-bold">
                          {tool.size !== 'N/A' ? tool.size : '—'}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-700">
                          {formatCurrency(tool.totalRevenue)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-blue-700">
                          {formatCurrency(tool.operRevenue)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-amber-700">
                          {formatCurrency(tool.standbyRevenue)}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-bold text-blue-900 bg-blue-50/40">
                          {tool.operDays}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-bold text-amber-900 bg-amber-50/40">
                          {tool.standbyDays}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-700">
                          {tool.jobsCount}
                        </td>
                        <td className="py-1.5 px-2 truncate max-w-[160px] text-slate-600 font-mono text-[11px]" title={(tool.contracts || []).join(', ')}>
                          {(tool.contracts || []).join(', ') || (tool.clients || []).join(', ') || '444558'}
                        </td>
                        <td className="py-1.5 px-2 text-center whitespace-nowrap">
                          <button
                            onClick={() => setSelectedToolDetail(tool)}
                            className="bg-slate-100 hover:bg-blue-100 text-blue-700 font-bold text-[11px] px-2 py-0.5 rounded border border-slate-300 cursor-pointer flex items-center gap-1 mx-auto"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Details</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
            <div className="text-slate-600 font-medium">
              Page <span className="font-bold font-mono">{currentPage}</span> of <span className="font-bold font-mono">{totalPages}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 bg-white border border-slate-300 rounded font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 bg-white border border-slate-300 rounded font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CATEGORY ANALYTICS */}
      {activeTab === 'category-summary' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {rawData.categories.slice(0, 30).map((cat, idx) => {
              const pctOfTotal = ((cat.totalRevenue / summary.totalRevenue) * 100).toFixed(1);
              return (
                <div key={cat.category} className="bg-white border border-slate-300 rounded-lg p-3 shadow-2xs hover:shadow-md transition">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-100 text-blue-900 font-mono font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <h3 className="font-bold text-slate-900 text-xs truncate max-w-[200px]" title={cat.category}>
                        {cat.category}
                      </h3>
                    </div>
                    <span className="font-mono font-bold text-emerald-700 text-xs">
                      {formatCurrency(cat.totalRevenue)}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-600">
                    <div className="flex justify-between">
                      <span>Fleet Tools Count:</span>
                      <span className="font-mono font-bold text-slate-800">{cat.toolsCount} tools</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Jobs Executed:</span>
                      <span className="font-mono font-bold text-slate-800">{cat.jobsCount} jobs</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Operating Revenue ('1'):</span>
                      <span className="font-mono text-blue-700">{formatCurrency(cat.operRevenue)} ({cat.operDays} days)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Standby Revenue ('S'):</span>
                      <span className="font-mono text-amber-700">{formatCurrency(cat.standbyRevenue)} ({cat.standbyDays} days)</span>
                    </div>
                  </div>

                  {/* Visual percentage bar */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>Share of Total Revenue</span>
                      <span className="font-mono font-bold">{pctOfTotal}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: `${Math.min(100, Number(pctOfTotal) * 2)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: SIZE ANALYTICS */}
      {activeTab === 'size-summary' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {rawData.sizes.slice(0, 40).map((sz, idx) => {
              const pctOfTotal = ((sz.totalRevenue / summary.totalRevenue) * 100).toFixed(1);
              return (
                <div key={sz.size} className="bg-white border border-slate-300 rounded-lg p-3 shadow-2xs hover:shadow-md transition">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
                    <span className="font-mono font-bold text-blue-900 text-sm bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {sz.size}
                    </span>
                    <span className="font-mono font-bold text-emerald-700 text-xs">
                      {formatCurrency(sz.totalRevenue)}
                    </span>
                  </div>
                  <div className="space-y-1 text-[11px] text-slate-600">
                    <div className="flex justify-between">
                      <span>Tools in Size:</span>
                      <span className="font-mono font-bold">{sz.toolsCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Rental Days:</span>
                      <span className="font-mono">{sz.operDays + sz.standbyDays} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Revenue Share:</span>
                      <span className="font-mono font-bold text-emerald-600">{pctOfTotal}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: CONTRACT & CLIENT BREAKDOWN */}
      {activeTab === 'contract-summary' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rawData.contracts.map((cnt, idx) => {
              return (
                <div key={cnt.contractKey} className="bg-white border border-slate-300 rounded-lg p-4 shadow-2xs hover:shadow-md transition">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                    <div>
                      <h3 className="font-bold text-blue-950 text-sm">{cnt.client}</h3>
                      <span className="font-mono text-xs text-slate-500">Contract / Project: <strong>{cnt.contract}</strong></span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-black text-emerald-700 text-base">
                        {formatCurrency(cnt.totalRevenue)}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{cnt.jobsCount} Jobs Invoiced</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded border border-slate-200 font-mono">
                    <div>
                      <span className="text-slate-500 text-[11px] block">Operating Revenue:</span>
                      <span className="font-bold text-blue-800">{formatCurrency(cnt.operRevenue)}</span>
                      <span className="text-[10px] text-slate-400 block">({cnt.operDays} Ops Days)</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">Standby Revenue:</span>
                      <span className="font-bold text-amber-800">{formatCurrency(cnt.standbyRevenue)}</span>
                      <span className="text-[10px] text-slate-400 block">({cnt.standbyDays} Stby Days)</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tool Details Modal */}
      {selectedToolDetail && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full border border-slate-300 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-[#0d213a] to-[#1a3a60] p-4 text-white flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-300 font-mono font-bold">TOOL FINANCIAL PROFILE</div>
                <h3 className="text-lg font-bold font-mono text-white">{selectedToolDetail.serial}</h3>
              </div>
              <button
                onClick={() => setSelectedToolDetail(null)}
                className="text-white/80 hover:text-white p-1 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                <div>
                  <span className="font-bold text-slate-500">Description:</span>{' '}
                  <span className="font-semibold text-slate-900">{selectedToolDetail.desc}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono">
                  <div>
                    <span className="text-slate-500 font-sans">Category:</span>{' '}
                    <strong className="text-blue-900">{selectedToolDetail.category}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans">Size:</span>{' '}
                    <strong className="text-blue-900">{selectedToolDetail.size}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans">Jobs Count:</span>{' '}
                    <strong className="text-purple-900">{selectedToolDetail.jobsCount} jobs</strong>
                  </div>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-center">
                  <span className="text-[11px] text-emerald-800 font-bold block mb-1">Total Lifetime Revenue</span>
                  <span className="text-base font-black text-emerald-700 font-mono block">
                    {formatCurrency(selectedToolDetail.totalRevenue)}
                  </span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-center">
                  <span className="text-[11px] text-blue-800 font-bold block mb-1">Operating Revenue ('1')</span>
                  <span className="text-base font-black text-blue-700 font-mono block">
                    {formatCurrency(selectedToolDetail.operRevenue)}
                  </span>
                  <span className="text-[10px] text-blue-600 font-mono font-bold block mt-0.5">
                    {selectedToolDetail.operDays} Days
                  </span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-center">
                  <span className="text-[11px] text-amber-800 font-bold block mb-1">Standby Revenue ('S')</span>
                  <span className="text-base font-black text-amber-700 font-mono block">
                    {formatCurrency(selectedToolDetail.standbyRevenue)}
                  </span>
                  <span className="text-[10px] text-amber-600 font-mono font-bold block mt-0.5">
                    {selectedToolDetail.standbyDays} Days
                  </span>
                </div>
              </div>

              {/* Associated Contracts & Rigs */}
              <div className="border-t border-slate-200 pt-3 space-y-2">
                <div>
                  <span className="font-bold text-slate-600 block mb-1">Deployed Contracts / Clients:</span>
                  <div className="flex flex-wrap gap-1">
                    {(selectedToolDetail.contracts || []).map((c: string) => (
                      <span key={c} className="bg-slate-100 text-slate-800 border border-slate-300 px-2 py-0.5 rounded text-[11px] font-mono">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="font-bold text-slate-600 block mb-1">Deployed Rig Locations:</span>
                  <div className="flex flex-wrap gap-1">
                    {(selectedToolDetail.rigs || []).map((r: string) => (
                      <span key={r} className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-mono">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                {onNavigate && (
                  <button
                    onClick={() => {
                      setSelectedToolDetail(null);
                      onNavigate('tool-history', selectedToolDetail.serial);
                    }}
                    className="bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs px-3.5 py-1.5 rounded cursor-pointer flex items-center gap-1"
                  >
                    <span>View Full Tool Movement Trail</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setSelectedToolDetail(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-3 py-1.5 rounded border border-slate-300 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
