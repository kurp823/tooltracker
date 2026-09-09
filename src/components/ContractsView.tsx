import React, { useState, useMemo } from 'react';
import { ContractRecord, DrillingJob, User } from '../types';
import { ContractRatesModal } from './ContractRatesModal';
import { 
  FileSpreadsheet, 
  Plus, 
  Search, 
  ChevronRight, 
  RefreshCw, 
  Download, 
  Database, 
  ShieldCheck, 
  Calendar, 
  DollarSign, 
  Table, 
  LayoutGrid, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  Building2
} from 'lucide-react';

interface ContractsViewProps {
  user?: User | null;
  contracts: ContractRecord[];
  jobs: DrillingJob[];
  onSaveContract: (contract: ContractRecord) => void;
  onRefresh?: () => Promise<void>;
}

export const ContractsView: React.FC<ContractsViewProps> = ({
  user,
  contracts,
  jobs,
  onSaveContract,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Active' | 'Closed'>('ALL');
  const [clientFilter, setClientFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [selectedContract, setSelectedContract] = useState<ContractRecord | null>(null);
  const [contractForRates, setContractForRates] = useState<ContractRecord | null>(null);
  const [isNewContractOpen, setIsNewContractOpen] = useState(false);

  // Form states for New Contract
  const [contractNo, setContractNo] = useState('');
  const [contractRef, setContractRef] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [name, setName] = useState('');
  const [client, setClient] = useState('ADNOC ONSHORE');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('2028-12-31');
  const [currency, setCurrency] = useState<'USD' | 'AED'>('USD');
  const [status, setStatus] = useState<'Active' | 'Closed'>('Active');
  const [contractValue, setContractValue] = useState<string>('');
  const [isUnitRate, setIsUnitRate] = useState(false);
  const [standbyDiscount, setStandbyDiscount] = useState(50);
  const [pbgNumber, setPbgNumber] = useState('');
  const [pbgValue, setPbgValue] = useState<string>('');
  const [pbgIssueDate, setPbgIssueDate] = useState('');
  const [pbgExpiryDate, setPbgExpiryDate] = useState('');
  const [pbgOpenEnded, setPbgOpenEnded] = useState(false);
  const [notes, setNotes] = useState('');

  // Extract unique clients for filtering
  const uniqueClients = useMemo(() => {
    const set = new Set<string>();
    contracts.forEach((c) => {
      if (c.client) set.add(c.client);
    });
    return Array.from(set).sort();
  }, [contracts]);

  // Filtered contracts
  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (clientFilter !== 'ALL' && c.client !== clientFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const text = `${c.id} ${c.contractNo} ${c.contractRef || ''} ${c.shortDesc || ''} ${c.name} ${c.client} ${c.currency} ${c.pbgNumber || ''} ${c.notes || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [contracts, statusFilter, clientFilter, search]);

  // Aggregate financial metrics
  const metrics = useMemo(() => {
    const total = contracts.length;
    const active = contracts.filter((c) => c.status === 'Active').length;
    const closed = contracts.filter((c) => c.status === 'Closed').length;

    let usdTotal = 0;
    let aedTotal = 0;
    let pbgAedTotal = 0;

    contracts.forEach((c) => {
      if (c.status === 'Active' && c.contractValue) {
        if (c.currency === 'USD') usdTotal += c.contractValue;
        else if (c.currency === 'AED') aedTotal += c.contractValue;
      }
      if (c.status === 'Active' && c.pbgValue) {
        pbgAedTotal += c.pbgValue;
      }
    });

    return { total, active, closed, usdTotal, aedTotal, pbgAedTotal };
  }, [contracts]);

  // Format currency helpers
  const formatMoney = (val?: number | null, curr?: string) => {
    if (val === null || val === undefined) return 'UNIT RATE';
    return `${curr === 'AED' ? 'AED' : '$'} ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPbg = (val?: number | null) => {
    if (val === null || val === undefined) return '-';
    return `AED ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'ContractID',
      'Client',
      'ContractRef',
      'Short Desc',
      'Currency',
      'StartDate',
      'EndDate',
      'Status',
      'ContractValue',
      'PBGNumber',
      'PBGValue',
      'PBGIssueDate',
      'PBGExpiryDate',
      'InvoicedToDate',
      'RateLinesCount',
      'Notes'
    ];

    const rows = filteredContracts.map((c) => [
      `"${c.id}"`,
      `"${c.client.replace(/"/g, '""')}"`,
      `"${(c.contractRef || c.contractNo).replace(/"/g, '""')}"`,
      `"${(c.shortDesc || c.name).replace(/"/g, '""')}"`,
      `"${c.currency}"`,
      `"${c.startDate || ''}"`,
      `"${c.endDate || ''}"`,
      `"${c.status}"`,
      c.contractValue !== null && c.contractValue !== undefined ? c.contractValue : 'UNIT RATE',
      `"${(c.pbgNumber || '').replace(/"/g, '""')}"`,
      c.pbgValue !== null && c.pbgValue !== undefined ? c.pbgValue : '',
      `"${c.pbgIssueDate || ''}"`,
      `"${c.pbgExpiryDate || ''}"`,
      c.invoicedToDate || '',
      c.rates?.length || 0,
      `"${(c.notes || c.description || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `tbl_Contracts_Master_Register_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractNo || !name) {
      alert('Please provide Contract Number and Name.');
      return;
    }

    const val = isUnitRate ? null : (parseFloat(contractValue) || null);
    const pbgVal = parseFloat(pbgValue) || null;

    const newC: ContractRecord = {
      id: String(contracts.length + 1),
      contractNo: contractNo.trim(),
      contractRef: (contractRef || contractNo).trim(),
      name: name.trim(),
      shortDesc: (shortDesc || name).trim(),
      client: client.trim(),
      startDate,
      endDate,
      status,
      currency,
      contractValue: val,
      standbyDiscountPct: Number(standbyDiscount) || 50,
      pbgNumber: pbgNumber.trim() || undefined,
      pbgValue: pbgVal,
      pbgIssueDate: pbgIssueDate || undefined,
      pbgExpiryDate: pbgOpenEnded ? 'OPEN ENDED' : (pbgExpiryDate || undefined),
      notes: notes.trim(),
      rates: [],
    };

    onSaveContract(newC);
    setIsNewContractOpen(false);
    
    // Reset form
    setContractNo('');
    setContractRef('');
    setShortDesc('');
    setName('');
    setContractValue('');
    setPbgNumber('');
    setPbgValue('');
    setPbgIssueDate('');
    setPbgExpiryDate('');
    setPbgOpenEnded(false);
    setNotes('');
  };

  return (
    <div className="space-y-4">
      {/* Top Banner Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded-lg p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#1a3055] text-white flex items-center justify-center shadow-xs">
              <Database size={20} className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-[#1a3055]">Commercial Contracts Master Register</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                  Live SQL: tbl_Contracts ({contracts.length} Agreements)
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Itemized commercial price books, validity windows, performance bank guarantees (PBG), and standby schedules.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="px-2.5 py-1.5 rounded border border-[#b8c9db] text-slate-700 bg-slate-50 hover:bg-slate-100 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
                title="Synchronize contracts with Azure SQL tbl_Contracts"
              >
                <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-blue-600' : 'text-slate-600'} />
                <span>{isRefreshing ? 'Syncing...' : 'Sync SQL'}</span>
              </button>
            )}

            <button
              onClick={handleExportCsv}
              className="px-2.5 py-1.5 rounded border border-[#b8c9db] text-slate-700 bg-slate-50 hover:bg-slate-100 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="Export filtered contracts to CSV"
            >
              <Download size={13} className="text-slate-600" />
              <span>Export CSV</span>
            </button>

            {user?.role !== 'Viewer' && (
              <button
                onClick={() => setIsNewContractOpen(true)}
                className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} className="text-amber-400" />
                <span>New Contract</span>
              </button>
            )}
          </div>
        </div>

        {/* Portfolio KPI Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-100">
          <div className="bg-slate-50/80 rounded-md p-2.5 border border-slate-200">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Agreements</div>
            <div className="text-sm font-bold text-[#1a3055] mt-0.5 flex items-baseline gap-2">
              <span>{metrics.total} Contracts</span>
              <span className="text-[10px] text-emerald-700 font-medium font-mono">
                ({metrics.active} Active / {metrics.closed} Closed)
              </span>
            </div>
          </div>

          <div className="bg-blue-50/60 rounded-md p-2.5 border border-blue-200">
            <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Active Portfolio (USD)</div>
            <div className="text-sm font-bold text-blue-950 mt-0.5 font-mono">
              ${(metrics.usdTotal / 1_000_000).toFixed(2)}M <span className="text-[10px] font-sans font-normal text-blue-800">USD</span>
            </div>
          </div>

          <div className="bg-amber-50/60 rounded-md p-2.5 border border-amber-200">
            <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Active Portfolio (AED)</div>
            <div className="text-sm font-bold text-amber-950 mt-0.5 font-mono">
              AED {(metrics.aedTotal / 1_000_000).toFixed(2)}M
            </div>
          </div>

          <div className="bg-purple-50/60 rounded-md p-2.5 border border-purple-200">
            <div className="text-[10px] font-bold text-purple-800 uppercase tracking-wider">Active PBG Security</div>
            <div className="text-sm font-bold text-purple-950 mt-0.5 font-mono">
              AED {(metrics.pbgAedTotal / 1_000_000).toFixed(2)}M
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters, Search, and View Switcher */}
      <div className="bg-white border border-[#b8c9db] rounded-lg p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex bg-slate-100 p-0.5 rounded border border-slate-300 text-xs font-bold">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded transition cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-white text-[#1a3055] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({contracts.length})
            </button>
            <button
              onClick={() => setStatusFilter('Active')}
              className={`px-2.5 py-1 rounded transition cursor-pointer ${
                statusFilter === 'Active'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active ({metrics.active})
            </button>
            <button
              onClick={() => setStatusFilter('Closed')}
              className={`px-2.5 py-1 rounded transition cursor-pointer ${
                statusFilter === 'Closed'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Closed ({metrics.closed})
            </button>
          </div>

          {/* Client Filter */}
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="bg-white border border-[#b8c9db] rounded px-2.5 py-1 text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Clients ({uniqueClients.length})</option>
            {uniqueClients.map((cl) => (
              <option key={cl} value={cl}>
                {cl}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contract, ref, PBG, client..."
              className="bg-white border border-[#b8c9db] rounded pl-8 pr-3 py-1 text-xs w-56 outline-none font-medium focus:ring-1 focus:ring-amber-400"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                &times;
              </button>
            )}
          </div>

          {/* View Toggle */}
          <div className="flex bg-slate-100 p-0.5 rounded border border-slate-300">
            <button
              onClick={() => setViewMode('table')}
              title="Table View (Master Register)"
              className={`p-1 rounded transition cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-[#1a3055] shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Table size={14} />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              title="Card Grid View"
              className={`p-1 rounded transition cursor-pointer ${
                viewMode === 'cards' ? 'bg-white text-[#1a3055] shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main View: Table (Master Register) or Cards */}
      {viewMode === 'table' ? (
        <div className="bg-white border border-[#b8c9db] rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#1a3055] text-white border-b border-[#2d4b7a] font-semibold text-[11px] whitespace-nowrap">
                  <th className="py-2.5 px-3 w-12 text-center">ID</th>
                  <th className="py-2.5 px-3">Client Entity</th>
                  <th className="py-2.5 px-3">Contract Ref / SAP</th>
                  <th className="py-2.5 px-3 min-w-[160px]">Short Description</th>
                  <th className="py-2.5 px-2 text-center">Curr</th>
                  <th className="py-2.5 px-3">Validity Period</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Contract Value</th>
                  <th className="py-2.5 px-3">PBG Number</th>
                  <th className="py-2.5 px-3 text-right">PBG Value</th>
                  <th className="py-2.5 px-3 text-center">PBG Expiry</th>
                  <th className="py-2.5 px-3 text-center">Price Book / Rates</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-8 text-center text-slate-500">
                      No contracts matching current filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map((c) => {
                    const rateCount = c.rates?.length || 0;
                    const isClosed = c.status === 'Closed';

                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-blue-50/50 transition ${isClosed ? 'bg-slate-50/60 opacity-80' : ''}`}
                      >
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500">
                          {c.id}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-[#1a3055] leading-tight">{c.client}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          <div>{c.contractRef || c.contractNo}</div>
                          {c.poNumber && (
                            <div className="text-[10px] text-slate-500 font-normal">{c.poNumber}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{c.shortDesc || c.name}</div>
                          {c.notes && (
                            <div className="text-[10px] text-slate-500 truncate max-w-xs">{c.notes}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                              c.currency === 'AED'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-blue-100 text-blue-900 border border-blue-300'
                            }`}
                          >
                            {c.currency}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                          <div className="text-slate-800">{c.startDate}</div>
                          <div className="text-slate-500 text-[10px]">&rarr; {c.endDate}</div>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold inline-block ${
                              c.status === 'Active'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-200 text-slate-700 border border-slate-300'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                          {c.contractValue !== null && c.contractValue !== undefined ? (
                            <span className="text-[#1a3055]">{formatMoney(c.contractValue, c.currency)}</span>
                          ) : (
                            <span className="text-[10px] font-sans font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-300">
                              UNIT RATE
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-700">
                          {c.pbgNumber && c.pbgNumber !== '-' ? (
                            <span className="font-semibold text-slate-800">{c.pbgNumber}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs whitespace-nowrap">
                          {c.pbgValue ? (
                            <span className="font-semibold text-purple-900">{formatPbg(c.pbgValue)}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {c.pbgExpiryDate === 'OPEN ENDED' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                              OPEN ENDED
                            </span>
                          ) : c.pbgExpiryDate ? (
                            <span className="font-mono text-[11px] text-slate-700">{c.pbgExpiryDate}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => setContractForRates(c)}
                            className={`px-2 py-1 rounded text-[11px] font-bold flex items-center justify-center gap-1 mx-auto transition cursor-pointer shadow-xs ${
                              rateCount > 0
                                ? 'bg-purple-700 hover:bg-purple-800 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                            }`}
                          >
                            <FileSpreadsheet size={12} />
                            <span>{rateCount > 0 ? `${rateCount} Rates` : '+ Add Rates'}</span>
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => setSelectedContract(c)}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-blue-100 text-[#1a3055] font-bold text-[11px] border border-slate-300 hover:border-blue-300 transition cursor-pointer"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center">
            <span>
              Showing <strong>{filteredContracts.length}</strong> of <strong>{contracts.length}</strong> master contracts
            </span>
            <span className="text-[11px] font-mono">Standby Default: 50% Ops Rate</span>
          </div>
        </div>
      ) : (
        /* Card Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredContracts.map((c) => {
            const linkedJobs = jobs.filter(
              (j) => j.contract === c.name || j.client === c.client || (c.contractRef && j.contract === c.contractRef)
            );
            const rateCount = c.rates?.length || 0;

            return (
              <div
                key={c.id}
                className="bg-white border border-[#b8c9db] rounded-lg overflow-hidden shadow-xs flex flex-col justify-between hover:shadow-md transition"
              >
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                          {c.client}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-400">ID #{c.id}</span>
                      </div>
                      <h3 className="text-sm font-bold text-[#1a3055] mt-1">{c.shortDesc || c.name}</h3>
                      <div className="text-xs font-mono font-semibold text-slate-600">
                        Ref: {c.contractRef || c.contractNo} {c.poNumber ? `· ${c.poNumber}` : ''}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        c.status === 'Active'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 text-slate-700 border border-slate-300'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>

                  {/* Financial & Validity Grid */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Contract Value</span>
                      <span className="font-bold text-[#1a3055] font-mono">
                        {formatMoney(c.contractValue, c.currency)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Validity Window</span>
                      <span className="font-mono text-[11px] text-slate-700 block truncate">
                        {c.startDate} ~ {c.endDate}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">PBG Value</span>
                      <span className="font-bold text-purple-900 font-mono">
                        {formatPbg(c.pbgValue)}
                      </span>
                    </div>
                  </div>

                  {/* PBG Information Row */}
                  {c.pbgNumber && c.pbgNumber !== '-' && (
                    <div className="flex items-center justify-between text-xs bg-purple-50/50 p-2 rounded border border-purple-100">
                      <div className="flex items-center gap-1.5 text-purple-950">
                        <ShieldCheck size={13} className="text-purple-700" />
                        <span className="font-bold">PBG Ref:</span>
                        <span className="font-mono text-purple-900">{c.pbgNumber}</span>
                      </div>
                      <div className="text-[10px] font-mono text-purple-800">
                        Expiry: {c.pbgExpiryDate || 'N/A'}
                      </div>
                    </div>
                  )}

                  {/* Rate Schedule / Price Book Indicator */}
                  <div className="bg-purple-50/80 border border-purple-200 rounded p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet size={15} className="text-purple-700" />
                      <div>
                        <span className="font-bold text-[#1a3055] block">Price Book &amp; Rate Schedule</span>
                        <span className="text-[10px] text-purple-900">
                          {rateCount > 0
                            ? `${rateCount} itemized tool/engineer rates configured`
                            : 'No rate sheet uploaded yet'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setContractForRates(c)}
                      className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded font-bold text-[11px] shadow-xs cursor-pointer transition flex items-center gap-1"
                    >
                      <span>{rateCount > 0 ? 'View Rates' : '+ Add Rates'}</span>
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>

                <div className="px-4 py-2.5 bg-slate-50 border-t border-[#b8c9db] flex flex-wrap justify-between items-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">
                    <strong>{linkedJobs.length}</strong> active job(s) linked
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setContractForRates(c)}
                      className="text-purple-700 hover:text-purple-900 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <FileSpreadsheet size={12} /> Rate Schedule
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={() => setSelectedContract(c)}
                      className="text-blue-700 hover:underline font-bold cursor-pointer"
                    >
                      Full Details &rarr;
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Contract Modal */}
      {isNewContractOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNewContractOpen(false);
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-amber-400" />
                <h3 className="font-bold text-sm">Add Master Contract to Azure SQL</h3>
              </div>
              <button
                onClick={() => setIsNewContractOpen(false)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="p-4 space-y-3 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Contract Number / Ref *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 4700023861"
                    value={contractNo}
                    onChange={(e) => {
                      setContractNo(e.target.value);
                      if (!contractRef) setContractRef(e.target.value);
                    }}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Client Entity *</label>
                  <select
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="ADNOC OFFSHORE">ADNOC OFFSHORE</option>
                    <option value="ADNOC ONSHORE">ADNOC ONSHORE</option>
                    <option value="ADNOC DRILLING COMPANY P.J.S.C.">ADNOC DRILLING COMPANY P.J.S.C.</option>
                    <option value="ADNOC SOUR GAS">ADNOC SOUR GAS</option>
                    <option value="TURNWELL INDUSTRIES LLC">TURNWELL INDUSTRIES LLC</option>
                    <option value="BUNDUQ COMPANY LIMITED">BUNDUQ COMPANY LIMITED</option>
                    <option value="COSMO E&P ALBAHRIYA LIMITED">COSMO E&P ALBAHRIYA LIMITED</option>
                    <option value="HALLIBURTON WORLDWIDE LIMITED">HALLIBURTON WORLDWIDE LIMITED</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Short Description *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ADNOC ONSHORE - RENTALS"
                    value={shortDesc}
                    onChange={(e) => setShortDesc(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Full Agreement Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Provision of Downhole Tool Rental Services"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-2.5 rounded border border-slate-200">
                <div>
                  <label className="block font-bold mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border rounded px-2 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border rounded px-2 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'Active' | 'Closed')}
                    className="w-full border rounded px-2 py-1 font-bold"
                  >
                    <option value="Active">Active</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              {/* Commercials */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold mb-1">Billing Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as 'USD' | 'AED')}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="AED">AED</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold">Contract Value</label>
                    <label className="flex items-center gap-1 font-normal text-[11px] text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isUnitRate}
                        onChange={(e) => setIsUnitRate(e.target.checked)}
                      />
                      Unit Rate Contract
                    </label>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    disabled={isUnitRate}
                    placeholder={isUnitRate ? 'UNIT RATE (Uncapped)' : 'e.g. 2500000.00'}
                    value={isUnitRate ? '' : contractValue}
                    onChange={(e) => setContractValue(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono disabled:bg-slate-100"
                  />
                </div>
              </div>

              {/* PBG Section */}
              <div className="p-3 bg-purple-50/60 rounded border border-purple-200 space-y-2.5">
                <div className="font-bold text-purple-950 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-purple-700" />
                  <span>Performance Bank Guarantee (PBG) Details</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">PBG Reference Number</label>
                    <input
                      type="text"
                      placeholder="e.g. ACLG1900238"
                      value={pbgNumber}
                      onChange={(e) => setPbgNumber(e.target.value)}
                      className="w-full border rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">PBG Value (AED)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 626510.69"
                      value={pbgValue}
                      onChange={(e) => setPbgValue(e.target.value)}
                      className="w-full border rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">PBG Issue Date</label>
                    <input
                      type="date"
                      value={pbgIssueDate}
                      onChange={(e) => setPbgIssueDate(e.target.value)}
                      className="w-full border rounded px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="font-semibold">PBG Expiry Date</label>
                      <label className="flex items-center gap-1 font-normal text-[10px] text-purple-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pbgOpenEnded}
                          onChange={(e) => setPbgOpenEnded(e.target.checked)}
                        />
                        Open Ended
                      </label>
                    </div>
                    <input
                      type="date"
                      disabled={pbgOpenEnded}
                      value={pbgOpenEnded ? '' : pbgExpiryDate}
                      onChange={(e) => setPbgExpiryDate(e.target.value)}
                      className="w-full border rounded px-2 py-1 font-mono disabled:bg-slate-100"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Notes / Scope Terms</label>
                <textarea
                  rows={2}
                  placeholder="Master agreement terms, SAP PO, or rig notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5"
                />
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsNewContractOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-sm cursor-pointer"
                >
                  Save to SQL &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contract Detail Modal */}
      {selectedContract && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedContract(null);
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-600 text-white font-mono text-[10px] font-bold rounded">
                    ID #{selectedContract.id}
                  </span>
                  <h3 className="font-bold text-sm">{selectedContract.shortDesc || selectedContract.name}</h3>
                </div>
                <div className="text-[11px] text-slate-300 font-mono mt-0.5">
                  Ref: {selectedContract.contractRef || selectedContract.contractNo}
                </div>
              </div>
              <button
                onClick={() => setSelectedContract(null)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Client Entity:</span>
                  <span className="font-bold text-[#1a3055]">{selectedContract.client}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Status:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold inline-block ${
                      selectedContract.status === 'Active'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {selectedContract.status}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Validity Window:</span>
                  <span className="font-mono text-slate-800">
                    {selectedContract.startDate} &rarr; {selectedContract.endDate}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Billing Currency:</span>
                  <span className="font-bold">{selectedContract.currency}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Contract Value:</span>
                  <span className="font-bold font-mono text-[#1a3055]">
                    {formatMoney(selectedContract.contractValue, selectedContract.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block">Standby Discount:</span>
                  <span className="font-bold text-amber-800">{selectedContract.standbyDiscountPct}% of Operating Rate</span>
                </div>
              </div>

              {/* PBG Breakdown */}
              <div className="p-3 bg-purple-50/80 rounded border border-purple-200 space-y-2">
                <div className="font-bold text-purple-950 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-purple-700" />
                  <span>Performance Bank Guarantee (PBG)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-purple-900 block">PBG Number:</span>
                    <span className="font-mono font-bold text-purple-950">
                      {selectedContract.pbgNumber || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-purple-900 block">PBG Value:</span>
                    <span className="font-mono font-bold text-purple-950">
                      {formatPbg(selectedContract.pbgValue)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-purple-900 block">Issue Date:</span>
                    <span className="font-mono text-purple-900">{selectedContract.pbgIssueDate || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-purple-900 block">Expiry Date:</span>
                    <span className="font-mono font-bold text-purple-900">
                      {selectedContract.pbgExpiryDate || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {selectedContract.notes && (
                <div>
                  <h4 className="font-bold text-slate-700 mb-1">Contract Notes</h4>
                  <div className="p-2.5 bg-slate-50 border rounded text-slate-700 whitespace-pre-wrap">
                    {selectedContract.notes}
                  </div>
                </div>
              )}

              {/* Price Book & Rate Schedule Action */}
              <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-1.5 text-purple-950 font-bold">
                    <FileSpreadsheet size={14} className="text-purple-700" />
                    <span>Price Book &amp; Rate Schedule</span>
                  </div>
                  <span className="bg-purple-200 text-purple-900 px-2 py-0.5 rounded font-mono font-bold text-[10px]">
                    {selectedContract.rates?.length || 0} Rate Lines Defined
                  </span>
                </div>
                <p className="text-[11px] text-purple-800 mb-2.5">
                  Itemized rates for tools, hole sections, daily operating rates, standby discounts, run charges, and redress charges.
                </p>
                <button
                  onClick={() => {
                    setContractForRates(selectedContract);
                    setSelectedContract(null);
                  }}
                  className="w-full py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition"
                >
                  <FileSpreadsheet size={13} /> Open &amp; Manage Rate Schedule &rarr;
                </button>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-[#b8c9db] flex justify-end shrink-0">
              <button
                onClick={() => setSelectedContract(null)}
                className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Rate Schedule Modal */}
      {contractForRates && (
        <ContractRatesModal
          contract={contractForRates}
          user={user}
          onSave={(updatedContract) => {
            onSaveContract(updatedContract);
            setContractForRates(null);
          }}
          onClose={() => setContractForRates(null)}
        />
      )}
    </div>
  );
};
