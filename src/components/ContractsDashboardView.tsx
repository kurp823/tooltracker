import React, { useState, useMemo } from 'react';
import { ContractRecord, DrillingJob, NavModule, User } from '../types';
import { resolveJobClient } from '../services/api';
import * as XLSX from 'xlsx';
import {
  DollarSign,
  TrendingUp,
  Layers,
  Award,
  Search,
  Download,
  Calendar,
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  BarChart3,
  PieChart,
  FileSpreadsheet,
  Coins,
  Sparkles,
  Briefcase,
  Percent,
  Lock,
  ArrowUpRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart as RechartsPie,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';

interface ContractsDashboardViewProps {
  user?: User | null;
  contracts: ContractRecord[];
  jobs: DrillingJob[];
  onNavigate: (mod: NavModule, param?: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefresh?: () => void;
}

const USD_AED_RATE = 3.6725;
const CHART_COLORS = ['#1a3055', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#4b5563'];

export const ContractsDashboardView: React.FC<ContractsDashboardViewProps> = ({
  user,
  contracts,
  jobs,
  onNavigate,
  showToast,
  onRefresh,
}) => {
  const [currencyMode, setCurrencyMode] = useState<'AED' | 'USD' | 'NATIVE'>('AED');
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Active' | 'Completed' | 'Closed'>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedContractForJobs, setSelectedContractForJobs] = useState<any | null>(null);

  // Currency formatting helper
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

  // Build Map of Jobs grouped by Contract reference and Client
  const contractJobsMap = useMemo(() => {
    const map = new Map<string, DrillingJob[]>();
    jobs.forEach((j) => {
      const contractKey = (j.contract || '').trim().toUpperCase();
      if (contractKey) {
        if (!map.has(contractKey)) map.set(contractKey, []);
        map.get(contractKey)!.push(j);
      }
    });
    return map;
  }, [jobs]);

  // Enriched Contracts Data (reconciling contract value with legally invoiced jobs)
  const enrichedContracts = useMemo(() => {
    // 1. Process Master Contracts
    const list = contracts.map((c) => {
      const contractRefUpper = (c.contractRef || c.contractNo || c.id).trim().toUpperCase();
      const contractNoUpper = (c.contractNo || '').trim().toUpperCase();

      // Find matching jobs
      const directJobs = contractJobsMap.get(contractRefUpper) || 
                         (contractNoUpper ? contractJobsMap.get(contractNoUpper) : []) || [];

      // Filter jobs with legal invoices
      const legalJobs = directJobs.filter(
        (j) => j.legalInvoiceNumber && j.legalInvoiceNumber.trim() !== '-' && j.legalInvoiceNumber.trim() !== ''
      );

      const isNativelyAED = c.currency === 'AED' || c.contractNo === '4700024096' || c.contractRef === '4700024096';
      const nativeCurrency = isNativelyAED ? 'AED' : 'USD';

      // Sum legally invoiced amount from jobs
      const legalRevenueNative = legalJobs.reduce((sum, j) => sum + (Number(j.invoiceAmount) || 0), 0);

      // Values in USD and AED
      const legalRevenueUSD = isNativelyAED ? round2(legalRevenueNative / USD_AED_RATE) : legalRevenueNative;
      const legalRevenueAED = isNativelyAED ? legalRevenueNative : round2(legalRevenueNative * USD_AED_RATE);

      const contractValueNative = c.contractValue !== null && c.contractValue !== undefined ? Number(c.contractValue) : null;
      const contractValueUSD = contractValueNative !== null ? (isNativelyAED ? round2(contractValueNative / USD_AED_RATE) : contractValueNative) : null;
      const contractValueAED = contractValueNative !== null ? (isNativelyAED ? contractValueNative : round2(contractValueNative * USD_AED_RATE)) : null;

      const remainingBalanceNative = contractValueNative !== null ? Math.max(0, contractValueNative - legalRevenueNative) : null;
      const remainingBalanceUSD = contractValueUSD !== null ? Math.max(0, contractValueUSD - legalRevenueUSD) : null;
      const remainingBalanceAED = contractValueAED !== null ? Math.max(0, contractValueAED - legalRevenueAED) : null;

      const burnRatePct = contractValueNative && contractValueNative > 0 ? (legalRevenueNative / contractValueNative) * 100 : null;

      return {
        id: c.id,
        contractNo: c.contractNo || c.id,
        contractRef: c.contractRef || c.contractNo || c.id,
        name: c.name || c.shortDesc || c.contractNo,
        shortDesc: c.shortDesc || c.name,
        client: c.client,
        currency: nativeCurrency,
        status: c.status,
        startDate: c.startDate,
        endDate: c.endDate,
        contractValueNative,
        contractValueUSD,
        contractValueAED,
        legalRevenueNative,
        legalRevenueUSD,
        legalRevenueAED,
        remainingBalanceNative,
        remainingBalanceUSD,
        remainingBalanceAED,
        burnRatePct,
        allJobsCount: directJobs.length,
        legalJobsCount: legalJobs.length,
        legalJobs,
        pbgNumber: c.pbgNumber,
        pbgValue: c.pbgValue,
        pbgIssueDate: c.pbgIssueDate,
        pbgExpiryDate: c.pbgExpiryDate,
        isMasterAgreement: true,
      };
    });

    // 2. Discover any additional contracts present in jobs that are not in master contracts
    const masterContractRefs = new Set(contracts.map((c) => (c.contractRef || c.contractNo || c.id).trim().toUpperCase()));
    contractJobsMap.forEach((cJobs, key) => {
      if (!masterContractRefs.has(key) && key !== '') {
        const legalJobs = cJobs.filter((j) => j.legalInvoiceNumber && j.legalInvoiceNumber.trim() !== '-');
        if (legalJobs.length > 0) {
          const sampleJob = cJobs[0];
          const isNativelyAED = sampleJob.currency === 'AED' || key === '4700024096';
          const nativeCurrency = isNativelyAED ? 'AED' : 'USD';

          const legalRevenueNative = legalJobs.reduce((sum, j) => sum + (Number(j.invoiceAmount) || 0), 0);
          const legalRevenueUSD = isNativelyAED ? round2(legalRevenueNative / USD_AED_RATE) : legalRevenueNative;
          const legalRevenueAED = isNativelyAED ? legalRevenueNative : round2(legalRevenueNative * USD_AED_RATE);

          list.push({
            id: `spot-${key}`,
            contractNo: key,
            contractRef: key,
            name: `${sampleJob.client} - Callout Agreement`,
            shortDesc: key,
            client: sampleJob.client || 'ADNOC',
            currency: nativeCurrency,
            status: 'Active' as const,
            startDate: sampleJob.mobDate || null,
            endDate: sampleJob.demobDate || null,
            contractValueNative: null, // Unit Rate / Spot callout
            contractValueUSD: null,
            contractValueAED: null,
            legalRevenueNative,
            legalRevenueUSD,
            legalRevenueAED,
            remainingBalanceNative: null,
            remainingBalanceUSD: null,
            remainingBalanceAED: null,
            burnRatePct: null,
            allJobsCount: cJobs.length,
            legalJobsCount: legalJobs.length,
            legalJobs,
            pbgNumber: undefined,
            pbgValue: null,
            pbgIssueDate: null,
            pbgExpiryDate: null,
            isMasterAgreement: false,
          });
        }
      }
    });

    return list.sort((a, b) => (b.legalRevenueUSD || 0) - (a.legalRevenueUSD || 0));
  }, [contracts, contractJobsMap]);

  // Clients filter options
  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    enrichedContracts.forEach((c) => {
      if (c.client) set.add(c.client);
    });
    return Array.from(set).sort();
  }, [enrichedContracts]);

  // Filtered Contracts
  const filteredContracts = useMemo(() => {
    return enrichedContracts.filter((c) => {
      if (clientFilter !== 'ALL' && c.client !== clientFilter) return false;
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const text = `${c.contractNo} ${c.contractRef} ${c.name} ${c.client} ${c.shortDesc} ${c.currency} ${c.pbgNumber || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [enrichedContracts, clientFilter, statusFilter, search]);

  // Executive KPI Summary Metrics
  const summaryMetrics = useMemo(() => {
    let totalCeilingUSD = 0;
    let totalCeilingAED = 0;
    let totalLegalRevUSD = 0;
    let totalLegalRevAED = 0;
    let totalPbgAED = 0;
    let totalLegalJobs = 0;
    let totalJobs = 0;

    enrichedContracts.forEach((c) => {
      if (c.contractValueUSD) totalCeilingUSD += c.contractValueUSD;
      if (c.contractValueAED) totalCeilingAED += c.contractValueAED;
      totalLegalRevUSD += c.legalRevenueUSD;
      totalLegalRevAED += c.legalRevenueAED;
      totalLegalJobs += c.legalJobsCount;
      totalJobs += c.allJobsCount;
      if (c.pbgValue) totalPbgAED += Number(c.pbgValue);
    });

    const remainingCapacityUSD = Math.max(0, totalCeilingUSD - totalLegalRevUSD);
    const remainingCapacityAED = Math.max(0, totalCeilingAED - totalLegalRevAED);
    const overallBurnRate = totalCeilingUSD > 0 ? (totalLegalRevUSD / totalCeilingUSD) * 100 : 0;

    return {
      totalCeilingUSD,
      totalCeilingAED,
      totalLegalRevUSD,
      totalLegalRevAED,
      remainingCapacityUSD,
      remainingCapacityAED,
      overallBurnRate,
      totalPbgAED,
      totalLegalJobs,
      totalJobs,
      activeCount: enrichedContracts.filter((c) => c.status === 'Active').length,
      totalAgreements: enrichedContracts.length,
    };
  }, [enrichedContracts]);

  // Chart Data: Top 7 Contracts by Ceiling vs Invoiced Revenue
  const chartData = useMemo(() => {
    const isAED = currencyMode === 'AED' || currencyMode === 'NATIVE';
    return enrichedContracts.slice(0, 7).map((c) => {
      const ceiling = isAED ? (c.contractValueAED || 0) : (c.contractValueUSD || 0);
      const invoiced = isAED ? c.legalRevenueAED : c.legalRevenueUSD;
      return {
        name: c.contractRef.length > 14 ? `${c.contractRef.substring(0, 12)}..` : c.contractRef,
        fullName: c.name,
        client: c.client,
        ceilingM: Number((ceiling / 1_000_000).toFixed(2)),
        invoicedM: Number((invoiced / 1_000_000).toFixed(2)),
        burnRate: c.burnRatePct ? Number(c.burnRatePct.toFixed(1)) : 0,
        currency: c.currency,
      };
    });
  }, [enrichedContracts, currencyMode]);

  // Client Share Donut Chart Data
  const clientRevenueShare = useMemo(() => {
    const map = new Map<string, { revAED: number; revUSD: number }>();
    enrichedContracts.forEach((c) => {
      const cl = c.client || 'Other';
      if (!map.has(cl)) map.set(cl, { revAED: 0, revUSD: 0 });
      const cur = map.get(cl)!;
      cur.revAED += c.legalRevenueAED;
      cur.revUSD += c.legalRevenueUSD;
    });

    const isAED = currencyMode === 'AED' || currencyMode === 'NATIVE';
    return Array.from(map.entries())
      .map(([name, val]) => ({
        name,
        value: Number((isAED ? val.revAED : val.revUSD).toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [enrichedContracts, currencyMode]);

  // Export to Excel
  const handleExportExcel = () => {
    const exportRows = filteredContracts.map((c, idx) => ({
      'Rank': idx + 1,
      'Contract Reference': c.contractRef,
      'Contract Name / Title': c.name,
      'Client / Operator': c.client,
      'Status': c.status,
      'Contract Currency': c.currency,
      'Contract Value (AED)': c.contractValueAED || 'UNIT RATE',
      'Contract Value (USD)': c.contractValueUSD || 'UNIT RATE',
      'Legally Invoiced Revenue (AED)': c.legalRevenueAED,
      'Legally Invoiced Revenue (USD)': c.legalRevenueUSD,
      'Remaining Balance (AED)': c.remainingBalanceAED !== null ? c.remainingBalanceAED : 'N/A',
      'Remaining Balance (USD)': c.remainingBalanceUSD !== null ? c.remainingBalanceUSD : 'N/A',
      'Realization / Burn Rate (%)': c.burnRatePct !== null ? `${c.burnRatePct.toFixed(2)}%` : 'UNIT RATE',
      'Legally Invoiced Jobs': c.legalJobsCount,
      'Total Jobs Deployed': c.allJobsCount,
      'PBG Number': c.pbgNumber || '—',
      'PBG Value (AED)': c.pbgValue || '—',
      'PBG Expiry Date': c.pbgExpiryDate || '—',
      'Start Date': c.startDate || '—',
      'End Date': c.endDate || '—',
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contracts Commercial Portfolio');
    XLSX.writeFile(wb, `EMDAD_Contracts_Commercial_Dashboard_${new Date().toISOString().slice(0, 10)}.xlsx`);

    if (showToast) showToast('Exported Contracts Dashboard to Excel', 'success');
  };

  return (
    <div className="space-y-4 text-slate-800">
      {/* 1. Header Ribbon & Navigation Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600" /> Executive Contract Commercial Ledger
              </span>
              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2.5 py-0.5 rounded-full font-mono">
                {summaryMetrics.totalAgreements} Active Commercial Agreements
              </span>
              <span className="bg-amber-50 text-amber-800 border border-amber-200 text-xs px-2.5 py-0.5 rounded-full font-mono">
                Adnoc Drilling (4700024096) in AED
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <span>Contracts Commercial &amp; Revenue Realization Dashboard</span>
            </h1>
            <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
              Track contract ceiling authorization limits, cumulative legally invoiced revenue, remaining unbilled balances, and performance bank guarantees across master operator agreements.
            </p>
          </div>

          {/* Right Toolbar: Multi-Currency Toggle & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
            {/* Multi-Currency Toggle */}
            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setCurrencyMode('AED')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  currencyMode === 'AED'
                    ? 'bg-white text-emerald-700 shadow-xs font-black border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Display all figures in UAE Dirhams (AED)"
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
                title="Display all figures in US Dollars (USD)"
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
                title="Display native currency (AED for 4700024096, USD for others)"
              >
                <Coins className="w-3 h-3 text-amber-600" />
                <span>Native</span>
              </button>
            </div>

            {/* Refresh Button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                title="Refresh Contracts Portfolio from Azure SQL / Database"
                className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
              >
                <span>🔄</span>
                <span>Refresh</span>
              </button>
            )}

            {/* Switch to Master Register */}
            <button
              onClick={() => onNavigate('contracts')}
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Master Register</span>
            </button>

            {/* Export Excel */}
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Portfolio</span>
            </button>
          </div>
        </div>

        {/* Currency Peg & Audit Indicator Banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              <strong>Reconciled with Epicor ERP:</strong> Legally invoiced revenue matched directly from signed jobs with legal invoice numbers (FR, FSH, WHP).
            </span>
          </div>
          <div className="font-mono text-slate-500">
            Fixed Peg: 1 USD = 3.6725 AED • Active Currency View: <strong className="text-slate-800 uppercase">{currencyMode}</strong>
          </div>
        </div>
      </div>

      {/* 2. Top Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Total Portfolio Contract Value */}
        <div className="bg-gradient-to-br from-blue-50/50 via-white to-white rounded-xl p-4 border border-blue-100/80 hover:border-blue-300 transition-all shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold uppercase tracking-wider">
            <span>Total Contract Value</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Briefcase className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black font-mono tracking-tight text-blue-900">
              {formatMoney(summaryMetrics.totalCeilingAED, summaryMetrics.totalCeilingUSD)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 font-mono">
            <span>{summaryMetrics.activeCount} Active Agreements</span>
            <span className="font-bold text-blue-800">Master Ceiling</span>
          </div>
        </div>

        {/* KPI 2: Total Legally Invoiced Revenue */}
        <div className="bg-gradient-to-br from-emerald-50/50 via-white to-white rounded-xl p-4 border border-emerald-100/80 hover:border-emerald-300 transition-all shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold uppercase tracking-wider">
            <span>Legally Invoiced Revenue</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black font-mono tracking-tight text-emerald-700">
              {formatMoney(summaryMetrics.totalLegalRevAED, summaryMetrics.totalLegalRevUSD)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 font-mono">
            <span>{summaryMetrics.totalLegalJobs} Legal Invoiced Jobs</span>
            <span className="font-bold text-emerald-800">{summaryMetrics.overallBurnRate.toFixed(1)}% Realized</span>
          </div>
        </div>

        {/* KPI 3: Remaining Contract Runway */}
        <div className="bg-gradient-to-br from-purple-50/50 via-white to-white rounded-xl p-4 border border-purple-100/80 hover:border-purple-300 transition-all shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold uppercase tracking-wider">
            <span>Remaining Contract Runway</span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black font-mono tracking-tight text-purple-900">
              {formatMoney(summaryMetrics.remainingCapacityAED, summaryMetrics.remainingCapacityUSD)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 font-mono">
            <span>Unbilled Headroom</span>
            <span className="font-bold text-purple-800">{(100 - summaryMetrics.overallBurnRate).toFixed(1)}% Available</span>
          </div>
        </div>

        {/* KPI 4: Active PBG Guarantees Secured */}
        <div className="bg-gradient-to-br from-amber-50/50 via-white to-white rounded-xl p-4 border border-amber-100/80 hover:border-amber-300 transition-all shadow-2xs">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold uppercase tracking-wider">
            <span>Active PBG Secured</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
              <Lock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black font-mono tracking-tight text-amber-800">
              AED {summaryMetrics.totalPbgAED.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 font-mono">
            <span>Performance Guarantees</span>
            <span className="font-bold text-amber-900">Bank Endorsed</span>
          </div>
        </div>
      </div>

      {/* 3. Analytics Charts: Ceiling vs Invoiced & Client Share */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        {/* Left Chart: Contract Value vs Legally Invoiced Revenue (Grouped Bar Chart) */}
        <div className="lg:col-span-2 bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <span>Authorized Ceiling vs Invoiced Revenue (Top Agreements)</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Comparison of authorized contract ceiling vs cumulative legally billed amounts (Millions in {currencyMode === 'AED' ? 'AED' : 'USD'}).
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} angle={-20} textAnchor="end" />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(val) => `${val}M`} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const isAED = currencyMode === 'AED' || currencyMode === 'NATIVE';
                      const sym = isAED ? 'AED ' : '$';
                      return (
                        <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-xl text-xs space-y-1 font-mono">
                          <div className="font-bold text-blue-300 font-sans">{data.fullName}</div>
                          <div className="text-[11px] text-slate-400 font-sans">{data.client}</div>
                          <div className="text-blue-300">Contract Ceiling: {sym}{data.ceilingM}M</div>
                          <div className="text-emerald-400">Legally Invoiced: {sym}{data.invoicedM}M</div>
                          <div className="text-amber-300">Burn Rate: {data.burnRate}%</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="ceilingM" name={`Contract Ceiling (${currencyMode === 'AED' ? 'AED' : 'USD'})`} fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="invoicedM" name={`Invoiced Revenue (${currencyMode === 'AED' ? 'AED' : 'USD'})`} fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Chart: Client Revenue Share Donut */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <PieChart className="w-4 h-4 text-purple-600" />
              <span>Revenue by Operator Client</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Proportion of cumulative legally invoiced revenue across oil companies.
            </p>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={clientRevenueShare}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {clientRevenueShare.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const isAED = currencyMode === 'AED' || currencyMode === 'NATIVE';
                      const sym = isAED ? 'AED ' : '$';
                      return (
                        <div className="bg-slate-900 text-white p-2 rounded-lg text-xs font-mono">
                          <div className="font-bold text-slate-200">{data.name}</div>
                          <div className="text-emerald-400">{sym}{Number(data.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ fontSize: '10px' }}
                />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. Contracts Commercial Ledger Table & Filter Controls */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Table Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {/* Search Box */}
            <div className="relative min-w-[240px] flex-1 sm:flex-initial">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by contract, client, PBG..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Operator Filter */}
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-slate-700 cursor-pointer"
            >
              <option value="ALL">All Clients ({clientOptions.length})</option>
              {clientOptions.map((cl) => (
                <option key={cl} value={cl}>
                  {cl}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-slate-700 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Closed">Closed / Completed</option>
            </select>
          </div>

          <div className="text-xs text-slate-500 font-mono">
            Showing <strong>{filteredContracts.length}</strong> of <strong>{enrichedContracts.length}</strong> Agreements
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3 w-12 text-center">#</th>
                <th className="p-3">Contract Reference</th>
                <th className="p-3">Client / Operator</th>
                <th className="p-3 text-center">Currency</th>
                <th className="p-3 text-right">Contract Value</th>
                <th className="p-3 text-right">Legally Invoiced</th>
                <th className="p-3 text-right">Remaining Balance</th>
                <th className="p-3 text-center min-w-[130px]">Burn Rate</th>
                <th className="p-3 text-center">Jobs Billed</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredContracts.map((c, idx) => {
                const isAEDContract = c.currency === 'AED';
                const hasCeiling = c.contractValueUSD !== null;
                const burnRate = c.burnRatePct || 0;

                // Burn rate badge styling
                let burnBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                let progressFill = 'bg-emerald-500';
                if (burnRate > 85) {
                  burnBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
                  progressFill = 'bg-rose-500';
                } else if (burnRate > 65) {
                  burnBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
                  progressFill = 'bg-amber-500';
                }

                return (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 text-center font-mono text-slate-400">{idx + 1}</td>
                    
                    {/* Contract Reference & Name */}
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-blue-900">{c.contractRef}</span>
                        {c.status === 'Active' ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" title="Active Agreement" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" title="Closed Agreement" />
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs mt-0.5">{c.name}</div>
                      {c.pbgNumber && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          PBG: {c.pbgNumber} ({c.pbgExpiryDate})
                        </div>
                      )}
                    </td>

                    {/* Client Name */}
                    <td className="p-3">
                      <span className="font-semibold text-slate-800">{c.client}</span>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {c.startDate ? `${c.startDate} to ${c.endDate || 'Ongoing'}` : 'Callout Basis'}
                      </div>
                    </td>

                    {/* Currency */}
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase font-mono ${
                          isAEDContract ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}
                      >
                        {c.currency}
                      </span>
                    </td>

                    {/* Contract Value (Ceiling) */}
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      {hasCeiling ? (
                        formatMoney(c.contractValueAED!, c.contractValueUSD!, c.currency)
                      ) : (
                        <span className="text-[11px] text-slate-400 font-sans font-semibold">Unit Rate / Callout</span>
                      )}
                    </td>

                    {/* Legally Invoiced Revenue */}
                    <td className="p-3 text-right font-mono font-bold text-emerald-700">
                      {formatMoney(c.legalRevenueAED, c.legalRevenueUSD, c.currency)}
                    </td>

                    {/* Remaining Balance */}
                    <td className="p-3 text-right font-mono font-bold text-purple-900">
                      {c.remainingBalanceUSD !== null ? (
                        formatMoney(c.remainingBalanceAED!, c.remainingBalanceUSD!, c.currency)
                      ) : (
                        <span className="text-slate-400 font-sans text-[11px]">N/A</span>
                      )}
                    </td>

                    {/* Burn Rate with Progress Bar */}
                    <td className="p-3 text-center">
                      {hasCeiling ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className={`px-1.5 py-0.2 rounded font-bold border ${burnBadgeClass}`}>
                              {burnRate.toFixed(1)}%
                            </span>
                            <span className="text-slate-400">
                              {c.burnRatePct && c.burnRatePct > 100 ? 'Exceeded' : 'Consumed'}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${progressFill}`}
                              style={{ width: `${Math.min(100, burnRate)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px] font-mono">Spot Rate</span>
                      )}
                    </td>

                    {/* Jobs Count */}
                    <td className="p-3 text-center font-mono">
                      <span className="font-bold text-blue-900">{c.legalJobsCount}</span>
                      <span className="text-slate-400 text-[10px]"> / {c.allJobsCount}</span>
                    </td>

                    {/* Action: Open Drilldown Modal */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setSelectedContractForJobs(c)}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] border border-blue-200 transition cursor-pointer flex items-center justify-center gap-1 mx-auto"
                      >
                        <span>Jobs Ledger</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Legally Invoiced Jobs Drilldown Modal */}
      {selectedContractForJobs && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-300 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#0c182a] to-[#142642] p-4 text-white flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-300 font-mono font-bold uppercase">
                  Contract Invoicing Ledger
                </div>
                <h3 className="text-lg font-black font-mono text-white flex items-center gap-2">
                  <span>{selectedContractForJobs.contractRef}</span>
                  <span className="text-xs font-normal text-slate-300 font-sans">— {selectedContractForJobs.client}</span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedContractForJobs(null)}
                className="text-white/80 hover:text-white p-1 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Summary KPI Strip */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Contract Ceiling</span>
                <span className="font-mono font-black text-slate-900 text-sm">
                  {selectedContractForJobs.contractValueUSD !== null
                    ? formatMoney(selectedContractForJobs.contractValueAED, selectedContractForJobs.contractValueUSD, selectedContractForJobs.currency)
                    : 'Unit Rate / Callout'}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Legally Invoiced Revenue</span>
                <span className="font-mono font-black text-emerald-700 text-sm">
                  {formatMoney(selectedContractForJobs.legalRevenueAED, selectedContractForJobs.legalRevenueUSD, selectedContractForJobs.currency)}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Remaining Capacity</span>
                <span className="font-mono font-black text-purple-900 text-sm">
                  {selectedContractForJobs.remainingBalanceUSD !== null
                    ? formatMoney(selectedContractForJobs.remainingBalanceAED, selectedContractForJobs.remainingBalanceUSD, selectedContractForJobs.currency)
                    : 'N/A'}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Invoiced Jobs</span>
                <span className="font-mono font-black text-blue-900 text-sm">
                  {selectedContractForJobs.legalJobsCount} jobs
                </span>
              </div>
            </div>

            {/* Invoiced Jobs Table List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              <div className="flex items-center justify-between text-xs pb-1">
                <span className="font-bold text-slate-700">
                  Legally Invoiced Jobs under {selectedContractForJobs.contractRef}:
                </span>
                <span className="font-mono text-slate-400">
                  {selectedContractForJobs.legalJobs.length} Invoiced Records
                </span>
              </div>

              {selectedContractForJobs.legalJobs.length === 0 ? (
                <div className="text-center p-8 text-slate-400 text-xs font-mono">
                  No final invoiced jobs recorded under this agreement yet.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-100 text-slate-700 text-[11px] border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Job Number</th>
                        <th className="p-2.5">Rig / Well</th>
                        <th className="p-2.5">Legal Invoice #</th>
                        <th className="p-2.5">Draft Inv #</th>
                        <th className="p-2.5">Invoice Date</th>
                        <th className="p-2.5 text-right">Invoiced Amount</th>
                        <th className="p-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {selectedContractForJobs.legalJobs.map((j: DrillingJob, idx: number) => {
                        const isAED = selectedContractForJobs.currency === 'AED';
                        const sym = isAED ? 'AED ' : '$';
                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-blue-900">{j.id}</td>
                            <td className="p-2.5 text-slate-600 font-sans">
                              {j.rig} • {j.well}
                            </td>
                            <td className="p-2.5 font-bold text-emerald-800">{j.legalInvoiceNumber}</td>
                            <td className="p-2.5 text-slate-500">{j.draftInvoiceNumber || '—'}</td>
                            <td className="p-2.5 text-slate-500">{j.mobDate || j.demobDate || '—'}</td>
                            <td className="p-2.5 text-right font-bold text-emerald-700">
                              {sym}{Number(j.invoiceAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="p-2.5 text-center">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {j.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
              <span className="text-slate-500">
                Showing all legal invoices matching <strong>{selectedContractForJobs.contractRef}</strong>
              </span>
              <button
                onClick={() => setSelectedContractForJobs(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-1.5 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
