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
  Users,
  Briefcase,
  UserCheck,
} from 'lucide-react';
import { SearchableDropdown } from './SearchableDropdown';

interface ToolRevenueReportViewProps {
  user?: User | null;
  onNavigate?: (module: string, param?: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefresh?: () => void;
}

export type AnalyticsTab =
  | 'tools-ledger'
  | 'personnel-revenue'
  | 'category-summary'
  | 'size-summary'
  | 'contract-summary';

// Master list of historical personnel names from legacy billing lines
const KNOWN_PERSONNEL_NAMES = [
  'TOUFIK BOUSSOUAR',
  'LUKE IRONDI',
  'MOHAMED AHMED MAHMOUD',
  'SAMIR ISAYEV',
  'MOHAMED MAHER',
  'ABDALLAH ALHADDAD',
  'DAVID WASS',
  'JOSE SALOMAO',
  'JOSE SALOMAD',
  'ADEL ISSA',
  'MANEESH MANOHARAN',
  'SANOBAR HASHIM',
  'FADY OSAMA ROUSHDY ATTAALLAH',
  'ASOKAN SUMESH',
  'ABDELDJALIL TELIBA',
  'AYMAN ZAKY HUSSIEN MOHAMME',
  'ESLAM',
  'BINU SURESH',
  'MOHAB MOHSEN MOHAMED AHMED',
  'FRANKLIN FOMEKONG',
  'ABDUL AZIZ',
  'MUNEER NAZZER',
  'JESMEN JOSE',
  'JAVED KABEER',
  'AL AMEEN SALAM',
  'ADNAN DIN',
  'IMAD KASHADA',
  'DANIEL ZAMFIR',
  'AZIM RAFEEQ',
  'MOHAMED MOUSTAFA',
  'MUNEER AL MAZROUI',
  'MOSTAFA ABDELGHANY',
  'MOHAMED ELSAYED',
  'KHAYYAM HASANOV',
  'BASHIR AHMAD',
  'JITH VARGHESE',
  'PEDRO LOPZE',
  'HAZEM RIAD',
  'MOHAMED OSMAN',
  'NADEEM MALIK',
  'MOHAMED JOUINI',
  'RYAN NORIEGA',
  'AHMED KAMAL',
  'TAMER ASHOUR',
  'HUSAM ALNASER',
  'OBI EGBUJIOBI',
  'SERGEY MAKAROV',
  'MOHAMED MOHAMED SALEH',
  'AHMED KHAMIS',
  'MOHAMED BADAWY',
  'SANAD ADEL ALALI',
];

export const isPersonnelRecord = (t: { serial?: string; desc?: string }): boolean => {
  const serial = (t.serial || '').trim();
  const desc = (t.desc || '').replace(/\s+/g, ' ').toUpperCase();
  if (/^SUB-?CTR\d+/i.test(serial) || /^SUB0CTR\d+/i.test(serial)) return true;
  return KNOWN_PERSONNEL_NAMES.some((name) => desc.includes(name));
};

// Reclassify generic "OTHER DOWNHOLE TOOL" items to their actual downhole categories
export const normalizeCategory = (cat: string, desc: string): string => {
  if (cat && cat !== 'OTHER DOWNHOLE TOOL') return cat;
  const upper = (desc || '').toUpperCase();
  if (upper.includes('SWIVEL MASTER') || upper.includes('SWIVELMASTER')) return 'SWIVEL MASTER';
  if (upper.includes('DRILL PIPE')) return 'DRILL PIPE';
  if (upper.includes('REAMER') || upper.includes('GDR')) return 'ROLLER REAMER';
  if (upper.includes('TUBING')) return 'TUBING';
  if (upper.includes('TORQUE REDUCER') || upper.includes('GUARD SLEEVE') || upper.includes('GAURD SLEEVE')) {
    return 'TORQUE REDUCER CLAMPS';
  }
  if (upper.includes('BOP') || upper.includes('DIVERTER') || upper.includes('ANNULAR')) {
    return 'BOP & WELL CONTROL';
  }
  if (upper.includes('JAR')) return 'DRILLING JAR';
  if (upper.includes('WHIPSTOCK')) return 'WHIPSTOCK';
  if (upper.includes('CASING SCRAP')) return 'CASING SCRAPPER (HEAVY DUTY)';
  if (upper.includes('STABILIZER') || upper.includes('STAB')) return 'STRING STAB';
  if (upper.includes('MAGNET')) return 'DOWNHOLE MAGNET';
  if (upper.includes('MILL')) return 'JUNK MILL';
  if (upper.includes('OVERSHOT')) return 'OVERSHOT FS';
  if (upper.includes('FLOAT SUB') || upper.includes('BIT SUB')) return 'BIT SUB';
  return 'SPECIALIZED DOWNHOLE TOOL';
};

// Human-readable designations for certified field crew
export const getPersonnelDesignation = (desc: string): string => {
  const upper = desc.toUpperCase();
  if (upper.includes('TOUFIK')) return 'Senior Fishing Operations Supervisor';
  if (upper.includes('LUKE IRONDI')) return 'Field Service Engineer (Casing Exit & Mills)';
  if (upper.includes('MOHAMED AHMED MAHMOUD')) return 'Downhole Rentals Field Engineer';
  if (upper.includes('SAMIR ISAYEV')) return 'Fishing & Redress Tech Specialist';
  if (upper.includes('DAVID WASS')) return 'Whipstock Operations Specialist';
  if (upper.includes('JOSE SALOMAO') || upper.includes('JOSE SALOMAD')) return 'Lead Whipstock Specialist';
  if (upper.includes('MOHAMED MAHER')) return 'Senior Fishing Field Specialist';
  if (upper.includes('ABDALLAH ALHADDAD')) return 'Senior Drilling & Fishing Engineer';
  if (upper.includes('ADEL ISSA')) return 'Operations Field Supervisor';
  if (upper.includes('MANEESH MANOHARAN')) return 'Downhole Tools Field Technician';
  if (upper.includes('SANOBAR HASHIM')) return 'Field Service Specialist';
  if (upper.includes('FADY OSAMA')) return 'Casing Exit & Milling Specialist';
  if (upper.includes('ASOKAN SUMESH')) return 'Tool Redress & Service Tech';
  if (upper.includes('ABDELDJALIL')) return 'Fishing Operations Supervisor';
  if (upper.includes('AYMAN ZAKY')) return 'Senior Downhole Field Engineer';
  if (upper.includes('ESLAM')) return 'Rentals & Fishing Specialist';
  if (upper.includes('BINU SURESH')) return 'Certified Service Technician';
  if (upper.includes('MOHAB MOHSEN')) return 'Downhole Tool Specialist';
  if (upper.includes('FRANKLIN')) return 'Senior Fishing Specialist';
  if (upper.includes('SUBCTR') || upper.includes('SUB-CTR')) return 'Certified Specialist (Sub-Contract Crew)';
  return 'Certified Downhole Field Specialist';
};

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

  // Drilldown Detail Modal
  const [selectedToolDetail, setSelectedToolDetail] = useState<any | null>(null);

  const rawData = toolRevenueJson;
  const summary = rawData.summary;

  const isAED = currencyMode === 'AED' || currencyMode === 'NATIVE';

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

  // 1. Separate physical equipment from human field engineers
  const allPhysicalTools = useMemo(() => {
    return rawData.tools
      .filter((t) => !isPersonnelRecord(t))
      .map((t) => ({
        ...t,
        category: normalizeCategory(t.category, t.desc),
      }));
  }, [rawData.tools]);

  const allPersonnelRecords = useMemo(() => {
    return rawData.tools.filter((t) => isPersonnelRecord(t));
  }, [rawData.tools]);

  // Dynamic category options derived from physical tools
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    allPhysicalTools.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return Array.from(set).sort();
  }, [allPhysicalTools]);

  const toolCategoryDropdownOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    allPhysicalTools.forEach((t) => {
      const cat = t.category || '';
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    });
    return categoryOptions.map((c) => ({
      value: c,
      label: c,
      count: counts[c] || 0,
    }));
  }, [categoryOptions, allPhysicalTools]);

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

  // Dynamic Category Analytics recalculated strictly for physical tools
  const physicalCategories = useMemo(() => {
    const map = new Map<string, any>();
    allPhysicalTools.forEach((t) => {
      const cat = t.category || 'SPECIALIZED DOWNHOLE TOOL';
      const existing = map.get(cat) || {
        category: cat,
        toolsCount: 0,
        jobsCount: 0,
        totalRevenueAED: 0,
        totalRevenueUSD: 0,
        operRevenueAED: 0,
        operRevenueUSD: 0,
        standbyRevenueAED: 0,
        standbyRevenueUSD: 0,
        operDays: 0,
        standbyDays: 0,
      };
      existing.toolsCount++;
      existing.jobsCount += t.jobsCount || 0;
      existing.totalRevenueAED += t.totalRevenueAED || 0;
      existing.totalRevenueUSD += t.totalRevenueUSD || 0;
      existing.operRevenueAED += t.operRevenueAED || 0;
      existing.operRevenueUSD += t.operRevenueUSD || 0;
      existing.standbyRevenueAED += t.standbyRevenueAED || 0;
      existing.standbyRevenueUSD += t.standbyRevenueUSD || 0;
      existing.operDays += t.operDays || 0;
      existing.standbyDays += t.standbyDays || 0;
      map.set(cat, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.totalRevenueAED - a.totalRevenueAED);
  }, [allPhysicalTools]);

  // Filtered physical tools list
  const filteredTools = useMemo(() => {
    return allPhysicalTools.filter((t) => {
      if (selectedCategory !== 'ALL' && t.category !== selectedCategory) return false;
      if (selectedSize !== 'ALL' && t.size !== selectedSize) return false;
      if (selectedContract !== 'ALL') {
        const matchesContract =
          (t.contracts || []).some((c: string) => c.includes(selectedContract)) ||
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
  }, [allPhysicalTools, selectedCategory, selectedSize, selectedContract, searchQuery]);

  // Filtered personnel list
  const filteredPersonnel = useMemo(() => {
    return allPersonnelRecords.filter((p) => {
      if (selectedContract !== 'ALL') {
        const matchesContract =
          (p.contracts || []).some((c: string) => c.includes(selectedContract)) ||
          (p.clients || []).some((cl: string) => cl.includes(selectedContract));
        if (!matchesContract) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const role = getPersonnelDesignation(p.desc || '');
        const text = `${p.serial} ${p.desc} ${role} ${(p.clients || []).join(' ')} ${(p.contracts || []).join(' ')}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [allPersonnelRecords, selectedContract, searchQuery]);

  // Sorted Tools List
  const sortedTools = useMemo(() => {
    return [...filteredTools].sort((a, b) => {
      let aVal = a[sortField] || 0;
      let bVal = b[sortField] || 0;
      if (sortField === 'totalRevenue') {
        aVal = isAED ? a.totalRevenueAED || 0 : a.totalRevenueUSD || 0;
        bVal = isAED ? b.totalRevenueAED || 0 : b.totalRevenueUSD || 0;
      } else if (sortField === 'operRevenue') {
        aVal = isAED ? a.operRevenueAED || 0 : a.operRevenueUSD || 0;
        bVal = isAED ? b.operRevenueAED || 0 : b.operRevenueUSD || 0;
      } else if (sortField === 'standbyRevenue') {
        aVal = isAED ? a.standbyRevenueAED || 0 : a.standbyRevenueUSD || 0;
        bVal = isAED ? b.standbyRevenueAED || 0 : b.standbyRevenueUSD || 0;
      }
      return sortAsc ? (aVal > bVal ? 1 : -1) : aVal < bVal ? 1 : -1;
    });
  }, [filteredTools, sortField, sortAsc, isAED]);

  // Sorted Personnel List
  const sortedPersonnel = useMemo(() => {
    return [...filteredPersonnel].sort((a, b) => {
      let aVal = isAED ? a.totalRevenueAED || 0 : a.totalRevenueUSD || 0;
      let bVal = isAED ? b.totalRevenueAED || 0 : b.totalRevenueUSD || 0;
      if (sortField === 'operDays') {
        aVal = a.operDays || 0;
        bVal = b.operDays || 0;
      } else if (sortField === 'jobsCount') {
        aVal = a.jobsCount || 0;
        bVal = b.jobsCount || 0;
      }
      return sortAsc ? (aVal > bVal ? 1 : -1) : aVal < bVal ? 1 : -1;
    });
  }, [filteredPersonnel, sortField, sortAsc, isAED]);

  // Paginated Tools
  const paginatedTools = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTools.slice(start, start + pageSize);
  }, [sortedTools, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedTools.length / pageSize) || 1;

  // Filtered summary metrics for physical equipment
  const physicalMetrics = useMemo(() => {
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

  // Filtered summary metrics for field personnel
  const personnelMetrics = useMemo(() => {
    let revAED = 0;
    let revUSD = 0;
    let operD = 0;
    let jobs = 0;

    filteredPersonnel.forEach((p) => {
      revAED += p.totalRevenueAED || 0;
      revUSD += p.totalRevenueUSD || 0;
      operD += p.operDays || 0;
      jobs += p.jobsCount || 0;
    });

    const avgYieldAED = operD > 0 ? revAED / operD : 0;
    const avgYieldUSD = operD > 0 ? revUSD / operD : 0;

    return {
      count: filteredPersonnel.length,
      revenueAED: revAED,
      revenueUSD: revUSD,
      operDays: operD,
      jobsCount: jobs,
      avgYieldAED,
      avgYieldUSD,
    };
  }, [filteredPersonnel]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
    }
  };

  // Export to Excel / CSV with physical tools and personnel on separate sheets
  const handleExportExcel = () => {
    const exportTools = sortedTools.map((t, idx) => ({
      Rank: idx + 1,
      'Tool Serial': t.serial,
      'Asset Number': t.assetNo,
      Description: t.desc,
      Category: t.category,
      Size: t.size,
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
      Contracts: (t.contracts || []).join(', '),
      Clients: (t.clients || []).join(', '),
      Rigs: (t.rigs || []).join(', '),
    }));

    const exportPersonnel = sortedPersonnel.map((p, idx) => ({
      Rank: idx + 1,
      'Badge Number': p.serial,
      'Specialist Name': p.desc,
      Designation: getPersonnelDesignation(p.desc),
      'Total Revenue (AED)': p.totalRevenueAED,
      'Total Revenue (USD)': p.totalRevenueUSD,
      'Billed Field Days': p.operDays,
      'Jobs Mobilized': p.jobsCount,
      'Average Daily Yield (AED)': p.operDays > 0 ? (p.totalRevenueAED / p.operDays).toFixed(2) : '0',
      'Average Daily Yield (USD)': p.operDays > 0 ? (p.totalRevenueUSD / p.operDays).toFixed(2) : '0',
      'Client Operators': (p.clients || []).join(', '),
      Contracts: (p.contracts || []).join(', '),
    }));

    const wsTools = XLSX.utils.json_to_sheet(exportTools);
    const wsPersonnel = XLSX.utils.json_to_sheet(exportPersonnel);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsTools, 'Physical Fleet Revenue');
    XLSX.utils.book_append_sheet(wb, wsPersonnel, 'Field Personnel Revenue');

    const catRows = physicalCategories.map((c: any) => ({
      Category: c.category,
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

    XLSX.writeFile(wb, `Emdad_Tool_and_Personnel_Revenue_${new Date().toISOString().slice(0, 10)}.xlsx`);
    if (showToast) showToast('Exported multi-sheet revenue ledger to Excel.', 'success');
  };

  const isPersonnelTab = activeTab === 'personnel-revenue';

  return (
    <div className="space-y-4">
      {/* Top Banner & KPI Header */}
      <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
              <h1 className="text-xl font-black text-[#1a3055] tracking-tight">
                Tool Fleet &amp; Personnel Revenue Analytics
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Audited billing performance and utilization across 6,831 physical downhole tools and 51 certified field specialists.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Currency Mode Selector */}
            <div className="bg-slate-100 p-0.5 rounded-lg border border-slate-300 flex items-center text-xs font-bold">
              <button
                onClick={() => setCurrencyMode('AED')}
                className={`px-3 py-1 rounded-md transition cursor-pointer ${
                  currencyMode === 'AED'
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                AED (3.6725)
              </button>
              <button
                onClick={() => setCurrencyMode('USD')}
                className={`px-3 py-1 rounded-md transition cursor-pointer ${
                  currencyMode === 'USD'
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                USD ($)
              </button>
              <button
                onClick={() => setCurrencyMode('NATIVE')}
                className={`px-3 py-1 rounded-md transition cursor-pointer ${
                  currencyMode === 'NATIVE'
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Native
              </button>
            </div>

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

        {/* Dynamic 4 Primary KPI Summary Cards */}
        {isPersonnelTab ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-indigo-50/50 via-white to-white rounded-xl p-3.5 border border-indigo-100 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
                <span>Manpower Revenue ({currencyMode})</span>
                <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl font-black text-indigo-700 font-mono tracking-tight">
                {formatMoney(personnelMetrics.revenueAED, personnelMetrics.revenueUSD)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Across {personnelMetrics.count} certified specialists
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50/50 via-white to-white rounded-xl p-3.5 border border-blue-100 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
                <span>Certified Specialists Billed</span>
                <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl font-black text-blue-700 font-mono tracking-tight">
                {personnelMetrics.count} Engineers
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Fishing, Whipstock &amp; Rentals
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50/50 via-white to-white rounded-xl p-3.5 border border-emerald-100 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
                <span>Field Operating Days ('1')</span>
                <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Award className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl font-black text-emerald-700 font-mono tracking-tight">
                {personnelMetrics.operDays.toLocaleString()} Days
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                Across {personnelMetrics.jobsCount} mobilized jobs
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50/50 via-white to-white rounded-xl p-3.5 border border-amber-100 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
                <span>Average Daily Yield</span>
                <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl font-black text-amber-700 font-mono tracking-tight">
                {formatMoney(personnelMetrics.avgYieldAED, personnelMetrics.avgYieldUSD)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Per field operating day
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-emerald-50/50 via-white to-white rounded-xl p-3.5 border border-emerald-100 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
                <span>Physical Fleet Revenue ({currencyMode})</span>
                <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl font-black text-emerald-700 font-mono tracking-tight">
                {formatMoney(physicalMetrics.revenueAED, physicalMetrics.revenueUSD)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Across {physicalMetrics.count.toLocaleString()} downhole tools
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50/50 via-white to-white rounded-xl p-3.5 border border-blue-100 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
                <span>Operating Revenue</span>
                <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl font-black text-blue-700 font-mono tracking-tight">
                {formatMoney(physicalMetrics.operRevenueAED, physicalMetrics.operRevenueUSD)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                {physicalMetrics.operDays.toLocaleString()} Operating Days ('1')
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50/50 via-white to-white rounded-xl p-3.5 border border-amber-100 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
                <span>Standby Revenue</span>
                <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl font-black text-amber-700 font-mono tracking-tight">
                {formatMoney(physicalMetrics.standbyRevenueAED, physicalMetrics.standbyRevenueUSD)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                {physicalMetrics.standbyDays.toLocaleString()} Standby Days ('S')
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50/50 via-white to-white rounded-xl p-3.5 border border-purple-100 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
                <span>Total Utilization Days</span>
                <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Award className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl font-black text-purple-700 font-mono tracking-tight">
                {(physicalMetrics.operDays + physicalMetrics.standbyDays).toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Total billable equipment days
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-300 bg-white px-3 py-1.5 rounded-t-xl shadow-2xs">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('tools-ledger')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'tools-ledger'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>🛠️ Physical Tool Fleet Revenue ({allPhysicalTools.length.toLocaleString()})</span>
          </button>

          <button
            onClick={() => setActiveTab('personnel-revenue')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'personnel-revenue'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>👷 Field Personnel Revenue ({allPersonnelRecords.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('category-summary')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'category-summary'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>📊 Category Analytics ({physicalCategories.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('size-summary')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'size-summary'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <PieChart className="w-3.5 h-3.5" />
            <span>📐 Size Analytics ({rawData.sizes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('contract-summary')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'contract-summary'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>🏢 Contract &amp; Client Breakdown ({rawData.contracts.length})</span>
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
              placeholder={
                isPersonnelTab
                  ? 'Search specialist name, badge, role, client...'
                  : 'Search tool serial, asset no, description, rig...'
              }
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          {/* Category Filter (Physical Tools only) */}
          {!isPersonnelTab && (
            <SearchableDropdown
              value={selectedCategory}
              onChange={(val) => {
                setSelectedCategory(val);
                setCurrentPage(1);
              }}
              options={toolCategoryDropdownOptions}
              allLabel="All Categories"
              totalCount={allPhysicalTools.length}
              searchPlaceholder="Search categories..."
              dropdownWidth="w-80"
              title="Filter by Equipment Category"
            />
          )}

          {/* Size Filter (Physical Tools only) */}
          {!isPersonnelTab && (
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
          )}

          {/* Contract / Client Filter */}
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
        {!isPersonnelTab && (
          <div className="flex items-center gap-2 text-slate-600 font-mono text-[11px]">
            <span>
              Showing {paginatedTools.length} of {sortedTools.length} tools
            </span>
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
        )}
      </div>

      {/* TAB 1: PHYSICAL TOOL REVENUE LEDGER */}
      {activeTab === 'tools-ledger' && (
        <div className="bg-white border border-slate-300 rounded-xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px] select-none whitespace-nowrap">
                <tr className="whitespace-nowrap">
                  <th className="p-2.5 text-center w-12 whitespace-nowrap">#</th>
                  <th className="p-2.5 cursor-pointer hover:bg-blue-100 whitespace-nowrap" onClick={() => handleSort('totalRevenue')}>
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <span>Tool Serial</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5 whitespace-nowrap">Description</th>
                  <th className="p-2.5 whitespace-nowrap">Category</th>
                  <th className="p-2.5 whitespace-nowrap">Size</th>
                  <th className="p-2.5 text-center whitespace-nowrap">Rate Curr</th>
                  <th className="p-2.5 text-right cursor-pointer hover:bg-blue-100 whitespace-nowrap" onClick={() => handleSort('totalRevenue')}>
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                      <span>Total Rev ({currencyMode})</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5 text-right cursor-pointer hover:bg-blue-100 whitespace-nowrap" onClick={() => handleSort('operRevenue')}>
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                      <span>Ops Rev</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5 text-right cursor-pointer hover:bg-blue-100 whitespace-nowrap" onClick={() => handleSort('standbyRevenue')}>
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                      <span>Standby Rev</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5 text-center cursor-pointer hover:bg-blue-100 whitespace-nowrap" onClick={() => handleSort('operDays')}>
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <span>Ops ('1')</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5 text-center cursor-pointer hover:bg-blue-100 whitespace-nowrap" onClick={() => handleSort('standbyDays')}>
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <span>Stby ('S')</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5 text-center cursor-pointer hover:bg-blue-100 whitespace-nowrap" onClick={() => handleSort('jobsCount')}>
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <span>Jobs</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-2.5 whitespace-nowrap">Contracts</th>
                  <th className="p-2.5 text-center whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium whitespace-nowrap">
                {paginatedTools.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="p-8 text-center text-slate-500 font-medium whitespace-nowrap">
                      No tool records match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedTools.map((tool, idx) => {
                    const globalRank = (currentPage - 1) * pageSize + idx + 1;
                    const isToolAED = tool.currency === 'AED';

                    return (
                      <tr key={tool.serial} className="hover:bg-blue-50/60 transition h-8 leading-none whitespace-nowrap">
                        <td className="py-1.5 px-2.5 text-center font-mono text-slate-400 font-bold whitespace-nowrap">{globalRank}</td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap font-mono font-bold text-slate-900">
                          {tool.serial}
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap max-w-xs truncate text-slate-800" title={tool.desc}>
                          {tool.desc || '—'}
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap">
                          <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap">
                            {tool.category || 'OTHER'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap font-mono text-slate-700 font-bold">
                          {tool.size !== 'N/A' ? tool.size : '—'}
                        </td>
                        <td className="py-1.5 px-2.5 text-center whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold whitespace-nowrap ${
                              isToolAED ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {tool.currency || 'USD'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                          {formatMoney(tool.totalRevenueAED, tool.totalRevenueUSD, tool.currency)}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono text-blue-700 whitespace-nowrap">
                          {formatMoney(tool.operRevenueAED, tool.operRevenueUSD, tool.currency)}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono text-amber-700 whitespace-nowrap">
                          {formatMoney(tool.standbyRevenueAED, tool.standbyRevenueUSD, tool.currency)}
                        </td>
                        <td className="py-1.5 px-2.5 text-center font-mono font-bold text-blue-900 bg-blue-50/40 whitespace-nowrap">
                          {tool.operDays}
                        </td>
                        <td className="py-1.5 px-2.5 text-center font-mono font-bold text-amber-900 bg-amber-50/40 whitespace-nowrap">
                          {tool.standbyDays}
                        </td>
                        <td className="py-1.5 px-2.5 text-center font-mono font-bold text-slate-700 whitespace-nowrap">
                          {tool.jobsCount}
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap text-slate-600 font-mono text-[11px]" title={(tool.contracts || []).join(', ')}>
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

      {/* TAB 2: FIELD PERSONNEL & SPECIALISTS REVENUE */}
      {activeTab === 'personnel-revenue' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-300 rounded-xl shadow-2xs overflow-hidden">
            <div className="bg-[#1a3055] text-white p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs uppercase tracking-wider">
                  Certified Field Personnel &amp; Service Specialists ({sortedPersonnel.length} engineers)
                </span>
              </div>
              <span className="text-[11px] text-slate-300">
                Aggregated engineer day-rate revenue billed across drilling &amp; workover jobs
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px] select-none whitespace-nowrap">
                  <tr className="whitespace-nowrap">
                    <th className="p-2.5 text-center w-12 whitespace-nowrap">#</th>
                    <th className="p-2.5 whitespace-nowrap">Badge Number</th>
                    <th className="p-2.5 whitespace-nowrap">Engineer / Specialist Name</th>
                    <th className="p-2.5 whitespace-nowrap">Operational Designation</th>
                    <th className="p-2.5 text-right whitespace-nowrap">Total Revenue ({currencyMode})</th>
                    <th className="p-2.5 text-center whitespace-nowrap">Billed Days ('1')</th>
                    <th className="p-2.5 text-center whitespace-nowrap">Jobs Served</th>
                    <th className="p-2.5 text-right whitespace-nowrap">Avg Rate / Day</th>
                    <th className="p-2.5 whitespace-nowrap">Client Operators Served</th>
                    <th className="p-2.5 text-center whitespace-nowrap">Audit Lines</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium whitespace-nowrap">
                  {sortedPersonnel.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500 font-medium whitespace-nowrap">
                        No field personnel match your search filters.
                      </td>
                    </tr>
                  ) : (
                    sortedPersonnel.map((person, idx) => {
                      const designation = getPersonnelDesignation(person.desc || '');
                      const avgDailyRate =
                        person.operDays > 0
                          ? isAED
                            ? (person.totalRevenueAED || 0) / person.operDays
                            : (person.totalRevenueUSD || 0) / person.operDays
                          : 0;

                      return (
                        <tr key={person.serial} className="hover:bg-blue-50/60 transition h-9 leading-none whitespace-nowrap">
                          <td className="py-2 px-2.5 text-center font-mono text-slate-400 font-bold whitespace-nowrap">{idx + 1}</td>
                          <td className="py-2 px-2.5 whitespace-nowrap font-mono font-bold text-slate-900">
                            {person.serial}
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap font-bold text-blue-900">
                            {person.desc}
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap text-slate-700">
                            <span className="bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap">
                              {designation}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-bold text-emerald-700 text-xs whitespace-nowrap">
                            {formatMoney(person.totalRevenueAED, person.totalRevenueUSD)}
                          </td>
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-blue-900 bg-blue-50/40 whitespace-nowrap">
                            {person.operDays}
                          </td>
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-700 whitespace-nowrap">
                            {person.jobsCount}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                            {isAED
                              ? `AED ${Math.round(avgDailyRate).toLocaleString()}`
                              : `$${Math.round(avgDailyRate).toLocaleString()}`}
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap text-slate-600 font-mono text-[11px]" title={(person.clients || []).join(', ')}>
                            {(person.clients || []).join(', ') || 'ADNOC Onshore, Weatherford'}
                          </td>
                          <td className="py-2 px-2.5 text-center whitespace-nowrap">
                            <button
                              onClick={() => setSelectedToolDetail(person)}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] px-2.5 py-1 rounded border border-indigo-300 cursor-pointer flex items-center gap-1 mx-auto"
                            >
                              <Briefcase className="w-3 h-3" />
                              <span>Job History</span>
                            </button>
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
      )}

      {/* TAB 3: CATEGORY ANALYTICS */}
      {activeTab === 'category-summary' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {physicalCategories.slice(0, 30).map((cat, idx) => {
              const totalFleet = isAED ? physicalMetrics.revenueAED : physicalMetrics.revenueUSD;
              const catTotal = isAED ? cat.totalRevenueAED : cat.totalRevenueUSD;
              const pctOfTotal = totalFleet > 0 ? ((catTotal / totalFleet) * 100).toFixed(1) : '0';

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
                      <span className="font-mono text-blue-700">
                        {formatMoney(cat.operRevenueAED, cat.operRevenueUSD)} ({cat.operDays} days)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Standby Revenue ('S'):</span>
                      <span className="font-mono text-amber-700">
                        {formatMoney(cat.standbyRevenueAED, cat.standbyRevenueUSD)} ({cat.standbyDays} days)
                      </span>
                    </div>
                  </div>

                  {/* Visual percentage bar */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>Share of Fleet Revenue</span>
                      <span className="font-mono font-bold">{pctOfTotal}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-600 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, Number(pctOfTotal) * 2)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: SIZE ANALYTICS */}
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

      {/* TAB 5: CONTRACT & CLIENT BREAKDOWN */}
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
                      <span className="font-mono text-xs text-slate-500">
                        Contract Ref: <strong>{cnt.contract}</strong>
                      </span>
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
                      <span className="font-bold text-blue-800">
                        {formatMoney(cnt.operRevenueAED, cnt.operRevenueUSD, cnt.currency)}
                      </span>
                      <span className="text-[10px] text-slate-400 block">({cnt.operDays} Ops Days)</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">Standby Revenue:</span>
                      <span className="font-bold text-amber-800">
                        {formatMoney(cnt.standbyRevenueAED, cnt.standbyRevenueUSD, cnt.currency)}
                      </span>
                      <span className="text-[10px] text-slate-400 block">({cnt.standbyDays} Stby Days)</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tool / Specialist Details Modal */}
      {selectedToolDetail && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-300 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-[#0c182a] to-[#142642] p-4 text-white flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-300 font-mono font-bold">
                  {isPersonnelRecord(selectedToolDetail)
                    ? 'FIELD SPECIALIST / ENGINEER SERVICE PROFILE'
                    : 'TOOL FINANCIAL PROFILE'}
                </div>
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
                  <span className="font-bold text-slate-500">
                    {isPersonnelRecord(selectedToolDetail) ? 'Specialist Name:' : 'Description:'}
                  </span>{' '}
                  <span className="font-semibold text-slate-900">{selectedToolDetail.desc}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
                  <div>
                    <span className="text-slate-500 font-sans">
                      {isPersonnelRecord(selectedToolDetail) ? 'Designation:' : 'Category:'}
                    </span>{' '}
                    <strong className="text-blue-900">
                      {isPersonnelRecord(selectedToolDetail)
                        ? getPersonnelDesignation(selectedToolDetail.desc)
                        : selectedToolDetail.category}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans">
                      {isPersonnelRecord(selectedToolDetail) ? 'Badge ID:' : 'Size:'}
                    </span>{' '}
                    <strong className="text-blue-900">
                      {isPersonnelRecord(selectedToolDetail) ? selectedToolDetail.serial : selectedToolDetail.size}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans">Rate Currency:</span>{' '}
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
                    {formatMoney(
                      selectedToolDetail.totalRevenueAED,
                      selectedToolDetail.totalRevenueUSD,
                      selectedToolDetail.currency
                    )}
                  </span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] text-blue-800 font-bold block mb-1">Operating Revenue ('1')</span>
                  <span className="text-base font-black text-blue-700 font-mono block">
                    {formatMoney(
                      selectedToolDetail.operRevenueAED,
                      selectedToolDetail.operRevenueUSD,
                      selectedToolDetail.currency
                    )}
                  </span>
                  <span className="text-[10px] text-blue-600 font-mono font-bold block mt-0.5">
                    {selectedToolDetail.operDays} Days
                  </span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] text-amber-800 font-bold block mb-1">Standby Revenue ('S')</span>
                  <span className="text-base font-black text-amber-700 font-mono block">
                    {formatMoney(
                      selectedToolDetail.standbyRevenueAED,
                      selectedToolDetail.standbyRevenueUSD,
                      selectedToolDetail.currency
                    )}
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
                {!isPersonnelRecord(selectedToolDetail) && (
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
                )}
              </div>

              {/* Invoiced Job Line Ledger Breakdown */}
              {selectedToolDetail.lineItems && selectedToolDetail.lineItems.length > 0 && (
                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">
                      Invoiced Job Lines ({selectedToolDetail.lineItems.length} records):
                    </span>
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Exact Audited Ledger
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-48 border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b border-slate-200 whitespace-nowrap">
                        <tr className="whitespace-nowrap">
                          <th className="p-2 whitespace-nowrap">Job Number</th>
                          <th className="p-2 whitespace-nowrap">DT Number</th>
                          <th className="p-2 text-center whitespace-nowrap">Standby (Days @ Rate)</th>
                          <th className="p-2 text-center whitespace-nowrap">Operating (Days @ Rate)</th>
                          <th className="p-2 text-right whitespace-nowrap">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white whitespace-nowrap">
                        {selectedToolDetail.lineItems.map((li: any, lIdx: number) => {
                          const isAEDLine = li.currency === 'AED';
                          const currSym = isAEDLine ? 'AED ' : '$';
                          return (
                            <tr key={lIdx} className="hover:bg-slate-50 whitespace-nowrap">
                              <td className="p-2 font-bold text-blue-900">{li.jobId}</td>
                              <td className="p-2 text-slate-600">{li.dtNumber || '—'}</td>
                              <td className="p-2 text-center text-amber-800">
                                {li.standbyDays}d @ {currSym}
                                {li.standbyPrice}
                              </td>
                              <td className="p-2 text-center text-blue-800">
                                {li.operDays}d @ {currSym}
                                {li.operPrice}
                              </td>
                              <td className="p-2 text-right font-bold text-emerald-800">
                                {currSym}
                                {Number(li.lineTotal || 0).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
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
                {!isPersonnelRecord(selectedToolDetail) && onNavigate && (
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
