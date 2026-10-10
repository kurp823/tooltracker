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
  Eye,
  Coins,
} from 'lucide-react';

interface ToolRevenueReportViewProps {
  user?: User | null;
  onNavigate?: (module: string, param?: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefresh?: () => void;
}

export type AnalyticsTab = 'tools-ledger' | 'category-summary' | 'size-summary' | 'contract-summary';

export const ToolRevenueReportView: React.FC<ToolRevenueReportViewProps> = ({
  user,
  onNavigate,
  showToast,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('tools-ledger');
  const [currencyMode, setCurrencyMode] = useState<'AED' | 'USD' | 'NATIVE'>('AED');
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

  const isAED = currencyMode === 'AED' || currencyMode === 'NATIVE';
  const currencySymbol = isAED ? 'AED ' : '$';

  const formatMoney = (valAED: number, valUSD: number, nativeCurrency?: 'AED' | 'USD' | string) => {
    if (currencyMode === 'AED') {
      return `AED ${(valAED || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (currencyMode === 'USD') {
      return `$${(valUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (nativeCurrency === 'AED') {
      return `AED ${(valAED || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${(valUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatCompact = (valAED: number, valUSD: number, nativeCurrency?: 'AED' | 'USD' | string) => {
    const isCurrencyAED = currencyMode === 'AED' || (currencyMode === 'NATIVE' && nativeCurrency === 'AED');
    const num = isCurrencyAED ? (valAED || 0) : (valUSD || 0);
    const sym = isCurrencyAED ? 'AED ' : '$';

    if (num >= 1_000_000) {
      return `${sym}${(num / 1_000_000).toFixed(2)}M`;
    }
    if (num >= 1_000) {
      return `${sym}${(num / 1_000).toFixed(1)}k`;
    }
    return `${sym}${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

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
      if (sortField === 'totalRevenue') {
        aVal = isAED ? (a.totalRevenueAED || 0) : (a.totalRevenueUSD || 0);
        bVal = isAED ? (b.totalRevenueAED || 0) : (b.totalRevenueUSD || 0);
      } else if (sortField === 'operRevenue') {
        aVal = isAED ? (a.operRevenueAED || 0) : (a.operRevenueUSD || 0);
        bVal = isAED ? (b.operRevenueAED || 0) : (b.operRevenueUSD || 0);
      } else if (sortField === 'standbyRevenue') {
        aVal = isAED ? (a.standbyRevenueAED || 0) : (a.standbyRevenueUSD || 0);
        bVal = isAED ? (b.standbyRevenueAED || 0) : (b.standbyRevenueUSD || 0);
      }
      return sortAsc ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
  }, [filteredTools, sortField, sortAsc, isAED]);

  // Paginated Tools
  const paginatedTools = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTools.slice(start, start + pageSize);
  }, [sortedTools, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedTools.length / pageSize) || 1;

  // Filtered summary metrics dynamically computed based on active filters
  const filteredMetrics = useMemo(() => {
    let revAED = 0;
    let revUSD = 0;
    let operRevAED = 0;
    let operRevUSD = 0;
    let stbyRevAED = 0;
    let stbyRevUSD = 0;
    let operD = 0;
    let stbyD = 0;
    let jobs = 0;

    filteredTools.forEach((t) => {
      revAED += t.totalRevenueAED || 0;
      revUSD += t.totalRevenueUSD || 0;
      operRevAED += t.operRevenueAED || 0;
      operRevUSD += t.operRevenueUSD || 0;
      stbyRevAED += t.standbyRevenueAED || 0;
      stbyRevUSD += t.standbyRevenueUSD || 0;
      operD += t.operDays || 0;
      stbyD += t.standbyDays || 0;
      jobs += t.jobsCount || 0;
    });

    return {
      count: filteredTools.length,
      revenueAED: revAED,
      revenueUSD: revUSD,
      operRevenueAED: operRevAED,
      operRevenueUSD: operRevUSD,
      standbyRevenueAED: stbyRevAED,
      standbyRevenueUSD: stbyRevUSD,
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

  // Export to Excel / CSV
  const handleExportExcel = () => {
    const exportRows = sortedTools.map((t, idx) => ({
      'Rank': idx + 1,
      'Tool Serial': t.serial,
      'Asset Number': t.assetNo,
      'Description': t.desc,
      'Category': t.category,
      'Size': t.size,
      'Contract Currency': t.currency || 'USD',
      'Total Revenue (AED)': t.totalRevenueAED,
      'Total Revenue (USD)': t.totalRevenueUSD,
      'Operating Revenue (AED)': t.operRevenueAED,
      'Operating Revenue (USD)': t.operRevenueUSD,
      'Standby Revenue (AED)': t.standbyRevenueAED,
      'Standby Revenue (USD)': t.standbyRevenueUSD,
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
    XLSX.utils.book_append_sheet(wb, ws, 'Tool Fleet Summary');

    // Also append Category breakdown sheet
    const catRows = (rawData.categories || []).map((c: any) => ({
      'Category': c.category,
      'Total Revenue (AED)': c.totalRevenueAED,
      'Total Revenue (USD)': c.totalRevenueUSD,
      'Operating Revenue (AED)': c.operRevenueAED,
      'Operating Revenue (USD)': c.operRevenueUSD,
      'Standby Revenue (AED)': c.standbyRevenueAED,
      'Standby Revenue (USD)': c.standbyRevenueUSD,
      'Operating Days': c.operDays,
      'Standby Days': c.standbyDays,
      'Tools Count': c.toolsCount,
      'Jobs Count': c.jobsCount,
    }));
    const wsCat = XLSX.utils.json_to_sheet(catRows);
    XLSX.utils.book_append_sheet(wb, wsCat, 'Category Breakdown');

    // Also append Size breakdown sheet
    const sizeRows = (rawData.sizes || []).map((s: any) => ({
      'Size': s.size,
      'Total Revenue (AED)': s.totalRevenueAED,
      'Total Revenue (USD)': s.totalRevenueUSD,
      'Operating Revenue (AED)': s.operRevenueAED,
      'Operating Revenue (USD)': s.operRevenueUSD,
      'Standby Revenue (AED)': s.standbyRevenueAED,
      'Standby Revenue (USD)': s.standbyRevenueUSD,
      'Operating Days': s.operDays,
      'Standby Days': s.standbyDays,
      'Tools Count': s.toolsCount,
      'Jobs Count': s.jobsCount,
    }));
    const wsSize = XLSX.utils.json_to_sheet(sizeRows);
    XLSX.utils.book_append_sheet(wb, wsSize, 'Size Breakdown');

    XLSX.writeFile(wb, `EMDAD_Tool_Revenue_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);

    if (showToast) showToast('Exported Tool Revenue Report (Multi-Sheet) to Excel', 'success');
  };

  return (
    <div className="space-y-4 text-slate-800">
      {/* Top Header Card (Unified Light Enterprise Theme) */}
      <div className="bg-white rounded-2xl p-5 text-slate-800 shadow-2xs border border-slate-200/90 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Live Financial Analytics
              </span>
              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2.5 py-0.5 rounded-full font-mono">
                {summary.totalTools.toLocaleString()} Fleet Tools Tracked
              </span>
              <span className="bg-amber-50 text-amber-800 border border-amber-200 text-xs px-2.5 py-0.5 rounded-full font-mono">
                Adnoc Drilling (4700024096) in AED
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <span>Tool Fleet Revenue &amp; Utilization Report</span>
            </h1>
            <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
              Lifetime earning breakdown by tool serial, category (116 classes), size (139 dimensions), and master contracts with accurate AED / USD conversion.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Currency Mode Switcher */}
            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setCurrencyMode('AED')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  currencyMode === 'AED'
                    ? 'bg-white text-emerald-700 shadow-xs font-black border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
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
              >
                <Coins className="w-3 h-3 text-amber-600" />
                <span>Native</span>
              </button>
            </div>

            {onRefresh && (
              <button
                onClick={onRefresh}
                title="Refresh Revenue Analytics from Azure SQL / Database"
                className="bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs px-3.5 py-1.5 rounded-lg border border-slate-200 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>🔄</span>
                <span>Refresh</span>
              </button>
            )}
            <button
              onClick={handleExportExcel}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
              title="Download full analytics as Excel spreadsheet"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export to Excel</span>
            </button>
            <button
              onClick={() => window.print()}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3.5 py-1.5 rounded-lg border border-slate-200 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* 4 Primary KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-emerald-50/50 via-white to-white rounded-xl p-3.5 border border-emerald-100 hover:border-emerald-300 transition shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
              <span>Total Revenue ({currencyMode})</span>
              <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-xl font-black text-emerald-700 font-mono tracking-tight">
              {formatMoney(filteredMetrics.revenueAED, filteredMetrics.revenueUSD)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Across {filteredMetrics.count.toLocaleString()} selected tools
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50/50 via-white to-white rounded-xl p-3.5 border border-blue-100 hover:border-blue-300 transition shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
              <span>Operating Revenue</span>
              <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-xl font-black text-blue-700 font-mono tracking-tight">
              {formatMoney(filteredMetrics.operRevenueAED, filteredMetrics.operRevenueUSD)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
              {filteredMetrics.operDays.toLocaleString()} Operating Days ('1')
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-50/50 via-white to-white rounded-xl p-3.5 border border-amber-100 hover:border-amber-300 transition shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
              <span>Standby Revenue</span>
              <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-xl font-black text-amber-700 font-mono tracking-tight">
              {formatMoney(filteredMetrics.standbyRevenueAED, filteredMetrics.standbyRevenueUSD)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
              {filteredMetrics.standbyDays.toLocaleString()} Standby Days ('S')
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50/50 via-white to-white rounded-xl p-3.5 border border-purple-100 hover:border-purple-300 transition shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
              <span>Total Utilization Days</span>
              <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center">
                <Award className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-xl font-black text-purple-700 font-mono tracking-tight">
              {(filteredMetrics.operDays + filteredMetrics.standbyDays).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Total billable days on rigs
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-300 bg-white px-3 py-1.5 rounded-t-xl shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('tools-ledger')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
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
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
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
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
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
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
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
      <div className="bg-slate-50 border border-slate-300 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
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
        <div className="bg-white border border-slate-300 rounded-xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px] select-none">
                <tr>
                  <th className="p-2.5 text-center w-12">#</th>
                  <th className="p-2.5 cursor-pointer hover:bg-blue-100" onClick={() => handleSort('totalRevenue')}>
                    <div className="flex items-center gap-1">
                      <span>Tool Serial</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5">Description</th>
                  <th className="p-2.5">Category</th>
                  <th className="p-2.5">Size</th>
                  <th className="p-2.5 text-center">Rate Curr</th>
                  <th className="p-2.5 text-right cursor-pointer hover:bg-blue-100" onClick={() => handleSort('totalRevenue')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Total Rev ({currencyMode})</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5 text-right cursor-pointer hover:bg-blue-100" onClick={() => handleSort('operRevenue')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Ops Rev</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5 text-right cursor-pointer hover:bg-blue-100" onClick={() => handleSort('standbyRevenue')}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Standby Rev</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5 text-center cursor-pointer hover:bg-blue-100" onClick={() => handleSort('operDays')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Ops ('1')</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5 text-center cursor-pointer hover:bg-blue-100" onClick={() => handleSort('standbyDays')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Stby ('S')</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5 text-center cursor-pointer hover:bg-blue-100" onClick={() => handleSort('jobsCount')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Jobs</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5">Contracts</th>
                  <th className="p-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {paginatedTools.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="p-8 text-center text-slate-500 font-medium">
                      No tool records match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedTools.map((tool, idx) => {
                    const globalRank = (currentPage - 1) * pageSize + idx + 1;
                    const isToolAED = tool.currency === 'AED';

                    return (
                      <tr key={tool.serial} className="hover:bg-blue-50/60 transition h-8 leading-none">
                        <td className="py-1.5 px-2.5 text-center font-mono text-slate-400 font-bold">{globalRank}</td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap font-mono font-bold text-slate-900">
                          {tool.serial}
                        </td>
                        <td className="py-1.5 px-2.5 truncate max-w-[260px] text-slate-800" title={tool.desc}>
                          {tool.desc || '—'}
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap">
                          <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                            {tool.category || 'OTHER'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap font-mono text-slate-700 font-bold">
                          {tool.size !== 'N/A' ? tool.size : '—'}
                        </td>
                        <td className="py-1.5 px-2.5 text-center whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                              isToolAED ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {tool.currency || 'USD'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-700">
                          {formatMoney(tool.totalRevenueAED, tool.totalRevenueUSD, tool.currency)}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono text-blue-700">
                          {formatMoney(tool.operRevenueAED, tool.operRevenueUSD, tool.currency)}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono text-amber-700">
                          {formatMoney(tool.standbyRevenueAED, tool.standbyRevenueUSD, tool.currency)}
                        </td>
                        <td className="py-1.5 px-2.5 text-center font-mono font-bold text-blue-900 bg-blue-50/40">
                          {tool.operDays}
                        </td>
                        <td className="py-1.5 px-2.5 text-center font-mono font-bold text-amber-900 bg-amber-50/40">
                          {tool.standbyDays}
                        </td>
                        <td className="py-1.5 px-2.5 text-center font-mono font-bold text-slate-700">
                          {tool.jobsCount}
                        </td>
                        <td className="py-1.5 px-2.5 truncate max-w-[150px] text-slate-600 font-mono text-[11px]" title={(tool.contracts || []).join(', ')}>
                          {(tool.contracts || []).join(', ') || (tool.clients || []).join(', ') || '444558'}
                        </td>
                        <td className="py-1.5 px-2.5 text-center whitespace-nowrap">
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
                className="px-3 py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
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
              const totalFleet = isAED ? summary.totalRevenueAED : summary.totalRevenueUSD;
              const catTotal = isAED ? cat.totalRevenueAED : cat.totalRevenueUSD;
              const pctOfTotal = ((catTotal / totalFleet) * 100).toFixed(1);

              return (
                <div key={cat.category} className="bg-white border border-slate-300 rounded-xl p-3.5 shadow-2xs hover:shadow-md transition">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-100 text-blue-900 font-mono font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <h3 className="font-bold text-slate-900 text-xs truncate max-w-[180px]" title={cat.category}>
                        {cat.category}
                      </h3>
                    </div>
                    <span className="font-mono font-bold text-emerald-700 text-xs">
                      {formatMoney(cat.totalRevenueAED, cat.totalRevenueUSD)}
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
                      <span className="font-mono text-blue-700">{formatMoney(cat.operRevenueAED, cat.operRevenueUSD)} ({cat.operDays} days)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Standby Revenue ('S'):</span>
                      <span className="font-mono text-amber-700">{formatMoney(cat.standbyRevenueAED, cat.standbyRevenueUSD)} ({cat.standbyDays} days)</span>
                    </div>
                  </div>

                  {/* Visual percentage bar */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>Share of Fleet Revenue</span>
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
              const totalFleet = isAED ? summary.totalRevenueAED : summary.totalRevenueUSD;
              const szTotal = isAED ? sz.totalRevenueAED : sz.totalRevenueUSD;
              const pctOfTotal = ((szTotal / totalFleet) * 100).toFixed(1);

              return (
                <div key={sz.size} className="bg-white border border-slate-300 rounded-xl p-3 shadow-2xs hover:shadow-md transition">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
                    <span className="font-mono font-bold text-blue-900 text-sm bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {sz.size}
                    </span>
                    <span className="font-mono font-bold text-emerald-700 text-xs">
                      {formatMoney(sz.totalRevenueAED, sz.totalRevenueUSD)}
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
            {rawData.contracts.map((cnt) => {
              const isContractAED = cnt.currency === 'AED';

              return (
                <div key={cnt.contractKey} className="bg-white border border-slate-300 rounded-xl p-4 shadow-2xs hover:shadow-md transition">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-blue-950 text-sm">{cnt.client}</h3>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                            isContractAED ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {cnt.currency}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-slate-500">Contract Ref: <strong>{cnt.contract}</strong></span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-black text-emerald-700 text-base">
                        {formatMoney(cnt.totalRevenueAED, cnt.totalRevenueUSD, cnt.currency)}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{cnt.jobsCount} Jobs Invoiced</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono">
                    <div>
                      <span className="text-slate-500 text-[11px] block">Operating Revenue:</span>
                      <span className="font-bold text-blue-800">{formatMoney(cnt.operRevenueAED, cnt.operRevenueUSD, cnt.currency)}</span>
                      <span className="text-[10px] text-slate-400 block">({cnt.operDays} Ops Days)</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">Standby Revenue:</span>
                      <span className="font-bold text-amber-800">{formatMoney(cnt.standbyRevenueAED, cnt.standbyRevenueUSD, cnt.currency)}</span>
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
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-300 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-[#0c182a] to-[#142642] p-4 text-white flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-300 font-mono font-bold">TOOL FINANCIAL PROFILE</div>
                <h3 className="text-lg font-black font-mono text-white">{selectedToolDetail.serial}</h3>
              </div>
              <button
                onClick={() => setSelectedToolDetail(null)}
                className="text-white/80 hover:text-white p-1 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                <div>
                  <span className="font-bold text-slate-500">Description:</span>{' '}
                  <span className="font-semibold text-slate-900">{selectedToolDetail.desc}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
                  <div>
                    <span className="text-slate-500 font-sans">Category:</span>{' '}
                    <strong className="text-blue-900">{selectedToolDetail.category}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans">Size:</span>{' '}
                    <strong className="text-blue-900">{selectedToolDetail.size}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans">Contract Rate:</span>{' '}
                    <strong className="text-emerald-900 font-bold">{selectedToolDetail.currency || 'USD'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans">Jobs Count:</span>{' '}
                    <strong className="text-purple-900">{selectedToolDetail.jobsCount} jobs</strong>
                  </div>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] text-emerald-800 font-bold block mb-1">Total Lifetime Revenue</span>
                  <span className="text-base font-black text-emerald-700 font-mono block">
                    {formatMoney(selectedToolDetail.totalRevenueAED, selectedToolDetail.totalRevenueUSD, selectedToolDetail.currency)}
                  </span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] text-blue-800 font-bold block mb-1">Operating Revenue ('1')</span>
                  <span className="text-base font-black text-blue-700 font-mono block">
                    {formatMoney(selectedToolDetail.operRevenueAED, selectedToolDetail.operRevenueUSD, selectedToolDetail.currency)}
                  </span>
                  <span className="text-[10px] text-blue-600 font-mono font-bold block mt-0.5">
                    {selectedToolDetail.operDays} Days
                  </span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] text-amber-800 font-bold block mb-1">Standby Revenue ('S')</span>
                  <span className="text-base font-black text-amber-700 font-mono block">
                    {formatMoney(selectedToolDetail.standbyRevenueAED, selectedToolDetail.standbyRevenueUSD, selectedToolDetail.currency)}
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

              {/* Invoiced Job Line Ledger Breakdown */}
              {selectedToolDetail.lineItems && selectedToolDetail.lineItems.length > 0 && (
                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">Invoiced Job Lines ({selectedToolDetail.lineItems.length} records):</span>
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Exact Audited Ledger
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-48 border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="p-2">Job Number</th>
                          <th className="p-2">DT Number</th>
                          <th className="p-2 text-center">Standby (Days @ Rate)</th>
                          <th className="p-2 text-center">Operating (Days @ Rate)</th>
                          <th className="p-2 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {selectedToolDetail.lineItems.map((li: any, lIdx: number) => {
                          const isAEDLine = li.currency === 'AED';
                          const currSym = isAEDLine ? 'AED ' : '$';
                          return (
                            <tr key={lIdx} className="hover:bg-slate-50">
                              <td className="p-2 font-bold text-blue-900">{li.jobId}</td>
                              <td className="p-2 text-slate-600">{li.dtNumber || '—'}</td>
                              <td className="p-2 text-center text-amber-800">
                                {li.standbyDays}d @ {currSym}{li.standbyPrice}
                              </td>
                              <td className="p-2 text-center text-blue-800">
                                {li.operDays}d @ {currSym}{li.operPrice}
                              </td>
                              <td className="p-2 text-right font-bold text-emerald-800">
                                {currSym}{Number(li.lineTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                {onNavigate && (
                  <button
                    onClick={() => {
                      setSelectedToolDetail(null);
                      onNavigate('tool-history', selectedToolDetail.serial);
                    }}
                    className="bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-1"
                  >
                    <span>View Full Tool Movement Trail</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setSelectedToolDetail(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-3 py-1.5 rounded-lg border border-slate-300 cursor-pointer"
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
