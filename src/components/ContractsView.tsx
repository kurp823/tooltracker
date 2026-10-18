import React, { useState, useMemo } from 'react';
import { ContractRecord, DrillingJob, User, NavModule } from '../types';
import { ContractRatesModal } from './ContractRatesModal';
import { useModulePermission, ReadOnlyBanner } from '../services/permissionService';
import { useResizableColumns, ResizerHandle, useCustomColumns } from '../services/customColumnService';
import * as XLSX from 'xlsx';
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
  Building2,
  Eye,
  Edit3,
  Trash2
} from 'lucide-react';

interface ContractsViewProps {
  user?: User | null;
  contracts: ContractRecord[];
  jobs: DrillingJob[];
  onSaveContract: (contract: ContractRecord) => void;
  onDeleteContract?: (contractIdOrRef: string) => void;
  onRefresh?: () => Promise<void>;
  onNavigate?: (mod: NavModule) => void;
}

export const ContractsView: React.FC<ContractsViewProps> = ({
  user,
  contracts,
  jobs,
  onSaveContract,
  onDeleteContract,
  onRefresh,
  onNavigate,
}) => {
  const { canEdit, isReadOnly } = useModulePermission(user, 'contracts');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Active' | 'Closed'>('ALL');
  const [clientFilter, setClientFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [selectedContract, setSelectedContract] = useState<ContractRecord | null>(null);
  const [detailActiveTab, setDetailActiveTab] = useState<'overview' | 'rates'>('overview');
  const [contractForRates, setContractForRates] = useState<ContractRecord | null>(null);
  const [isNewContractOpen, setIsNewContractOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<ContractRecord | null>(null);
  const [contractToDelete, setContractToDelete] = useState<ContractRecord | null>(null);

  // Dynamic Custom Columns & Excel-like Resizable Grid Columns
  const contractsCustomCols = useCustomColumns('contracts');
  const contractsResizer = useResizableColumns('contracts_grid', {
    id: 50,
    client: 160,
    contractRef: 140,
    shortDesc: 220,
    currency: 65,
    validity: 150,
    status: 80,
    contractValue: 130,
    pbgNumber: 115,
    pbgValue: 115,
    pbgExpiry: 105,
    rates: 110,
    actions: 145,
  });

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
    const exportRows = filteredContracts.map((c) => ({
      id: c.id,
      client: c.client,
      contractRef: c.contractRef || c.contractNo || '',
      shortDesc: c.shortDesc || c.name || '',
      currency: c.currency || 'USD',
      startDate: c.startDate || '',
      endDate: c.endDate || '',
      status: c.status || 'Active',
      contractValue: c.contractValue !== null && c.contractValue !== undefined ? c.contractValue : '',
      pbgNumber: c.pbgNumber && c.pbgNumber !== '-' ? c.pbgNumber : '',
      pbgValue: c.pbgValue !== null && c.pbgValue !== undefined ? c.pbgValue : '',
      pbgIssueDate: c.pbgIssueDate || '',
      pbgExpiryDate: c.pbgExpiryDate || '',
      poNumber: c.poNumber || '',
      invoicedToDate: c.invoicedToDate || 0,
      notes: c.notes || c.description || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 12 }, // id
      { wch: 28 }, // client
      { wch: 18 }, // contractRef
      { wch: 32 }, // shortDesc
      { wch: 10 }, // currency
      { wch: 14 }, // startDate
      { wch: 14 }, // endDate
      { wch: 12 }, // status
      { wch: 18 }, // contractValue
      { wch: 18 }, // pbgNumber
      { wch: 16 }, // pbgValue
      { wch: 14 }, // pbgIssueDate
      { wch: 16 }, // pbgExpiryDate
      { wch: 16 }, // poNumber
      { wch: 16 }, // invoicedToDate
      { wch: 45 }, // notes
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contracts_Master');
    const dateStamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `tbl_Contracts_Master_Register_${dateStamp}.xlsx`);
  };

  const openNewContractModal = () => {
    setEditingContract(null);
    setContractNo('');
    setContractRef('');
    setShortDesc('');
    setName('');
    setClient('ADNOC ONSHORE');
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate('2028-12-31');
    setCurrency('USD');
    setStatus('Active');
    setContractValue('');
    setIsUnitRate(false);
    setStandbyDiscount(50);
    setPbgNumber('');
    setPbgValue('');
    setPbgIssueDate('');
    setPbgExpiryDate('');
    setPbgOpenEnded(false);
    setNotes('');
    setIsNewContractOpen(true);
  };

  const openEditContractModal = (c: ContractRecord) => {
    setEditingContract(c);
    setContractNo(c.contractNo || c.contractRef || '');
    setContractRef(c.contractRef || c.contractNo || '');
    setShortDesc(c.shortDesc || c.name || '');
    setName(c.name || c.shortDesc || '');
    setClient(c.client || 'ADNOC ONSHORE');
    setStartDate(c.startDate || new Date().toISOString().slice(0, 10));
    setEndDate(c.endDate || '2028-12-31');
    setCurrency((c.currency as 'USD' | 'AED') || 'USD');
    setStatus((c.status as 'Active' | 'Closed') || 'Active');
    setIsUnitRate(c.contractValue === null || c.contractValue === undefined);
    setContractValue(c.contractValue !== null && c.contractValue !== undefined ? String(c.contractValue) : '');
    setStandbyDiscount(c.standbyDiscountPct ?? 50);
    setPbgNumber(c.pbgNumber && c.pbgNumber !== '-' ? c.pbgNumber : '');
    setPbgValue(c.pbgValue !== null && c.pbgValue !== undefined ? String(c.pbgValue) : '');
    setPbgIssueDate(c.pbgIssueDate || '');
    const isOpen = c.pbgExpiryDate === 'OPEN ENDED';
    setPbgOpenEnded(isOpen);
    setPbgExpiryDate(isOpen ? '' : (c.pbgExpiryDate || ''));
    setNotes(c.notes || c.description || '');
    setIsNewContractOpen(true);
  };

  const handleSaveContractForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractNo || !name) {
      alert('Please provide Contract Number and Name.');
      return;
    }

    const val = isUnitRate ? null : (parseFloat(contractValue) || null);
    const pbgVal = parseFloat(pbgValue) || null;

    if (editingContract) {
      const updated: ContractRecord = {
        ...editingContract,
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
        rates: editingContract.rates || [],
      };
      onSaveContract(updated);
      if (selectedContract && (selectedContract.id === editingContract.id || selectedContract.contractRef === editingContract.contractRef)) {
        setSelectedContract(updated);
      }
    } else {
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
    }

    setIsNewContractOpen(false);
    setEditingContract(null);
  };

  const handleConfirmDelete = () => {
    if (!contractToDelete) return;
    const targetKey = contractToDelete.id || contractToDelete.contractRef || contractToDelete.contractNo;
    if (onDeleteContract) {
      onDeleteContract(targetKey);
    }
    if (selectedContract && (selectedContract.id === contractToDelete.id || selectedContract.contractRef === contractToDelete.contractRef)) {
      setSelectedContract(null);
    }
    setContractToDelete(null);
  };

  return (
    <div className="space-y-4">
      {isReadOnly && <ReadOnlyBanner role={user?.role} moduleName="Commercial Contracts & Price Books" />}

      {/* Top Banner Ribbon - Clean Executive Styling */}
      <div className="bg-white border border-[#b8c9db] rounded-lg p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#1a3055] text-white flex items-center justify-center shadow-xs">
              <Database size={20} className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-[#1a3055]">Commercial Contracts Master Register</h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live SQL: tbl_Contracts ({contracts.length} Agreements)
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Itemized commercial price books, validity windows, performance bank guarantees (PBG), and standby schedules.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onNavigate && (
              <button
                onClick={() => onNavigate('contract-dash')}
                className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-[#1a3055] font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer border border-slate-300 shadow-2xs"
                title="View Contracts Commercial & Revenue Analytics Dashboard"
              >
                <span>📊 Contracts Dashboard</span>
              </button>
            )}

            {onRefresh && (
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="px-2.5 py-1.5 rounded border border-[#b8c9db] text-slate-700 bg-slate-50 hover:bg-slate-100 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
                title="Synchronize contracts with Azure SQL tbl_Contracts"
              >
                <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-slate-700' : 'text-slate-600'} />
                <span>{isRefreshing ? 'Syncing...' : 'Sync SQL'}</span>
              </button>
            )}

            <button
              onClick={handleExportCsv}
              className="px-2.5 py-1.5 rounded border border-[#b8c9db] text-slate-700 bg-slate-50 hover:bg-slate-100 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="Export filtered contracts to Excel"
            >
              <Download size={13} className="text-slate-600" />
              <span>Export Excel</span>
            </button>

            {canEdit && (
              <button
                onClick={openNewContractModal}
                className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-semibold text-xs hover:bg-[#24426d] shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} className="text-amber-400" />
                <span>New Contract</span>
              </button>
            )}
          </div>
        </div>

        {/* Portfolio KPI Badges - Clean Executive Styling without garish colors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-100">
          <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Agreements</div>
            <div className="text-sm font-bold text-[#1a3055] mt-0.5 flex items-baseline gap-2">
              <span>{metrics.total} Contracts</span>
              <span className="text-[10px] text-slate-500 font-medium font-mono">
                ({metrics.active} Active / {metrics.closed} Closed)
              </span>
            </div>
          </div>

          <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Portfolio (USD)</div>
            <div className="text-sm font-bold text-[#1a3055] mt-0.5 font-mono">
              ${(metrics.usdTotal / 1_000_000).toFixed(2)}M <span className="text-[10px] font-sans font-normal text-slate-500">USD</span>
            </div>
          </div>

          <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Portfolio (AED)</div>
            <div className="text-sm font-bold text-[#1a3055] mt-0.5 font-mono">
              AED {(metrics.aedTotal / 1_000_000).toFixed(2)}M
            </div>
          </div>

          <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active PBG Security</div>
            <div className="text-sm font-bold text-[#1a3055] mt-0.5 font-mono">
              AED {(metrics.pbgAedTotal / 1_000_000).toFixed(2)}M
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters, Search, and View Switcher */}
      <div className="bg-white border border-[#b8c9db] rounded-lg p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs - Clean Neutral Segments */}
          <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded transition cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-[#1a3055] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({contracts.length})
            </button>
            <button
              onClick={() => setStatusFilter('Active')}
              className={`px-2.5 py-1 rounded transition cursor-pointer ${
                statusFilter === 'Active'
                  ? 'bg-[#1a3055] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active ({metrics.active})
            </button>
            <button
              onClick={() => setStatusFilter('Closed')}
              className={`px-2.5 py-1 rounded transition cursor-pointer ${
                statusFilter === 'Closed'
                  ? 'bg-[#1a3055] text-white shadow-2xs'
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
            className="bg-white border border-[#b8c9db] rounded px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-blue-500"
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
                <tr className="bg-[#1a3055] text-white border-b border-[#2d4b7a] font-semibold text-[11px] whitespace-nowrap select-none">
                  <th style={{ width: contractsResizer.widths.id || 60 }} className="py-2.5 px-3 text-center relative">
                    <span>ID</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('id', e)} />
                  </th>
                  <th style={{ width: contractsResizer.widths.client || 160 }} className="py-2.5 px-3 relative">
                    <span>Client Entity</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('client', e)} />
                  </th>
                  <th style={{ width: contractsResizer.widths.contractRef || 150 }} className="py-2.5 px-3 relative">
                    <span>Contract Ref / SAP</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('contractRef', e)} />
                  </th>
                  <th style={{ width: contractsResizer.widths.shortDesc || 200 }} className="py-2.5 px-3 relative">
                    <span>Short Description</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('shortDesc', e)} />
                  </th>
                  <th style={{ width: contractsResizer.widths.currency || 65 }} className="py-2.5 px-2 text-center relative">
                    <span>Curr</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('currency', e)} />
                  </th>
                  <th style={{ width: contractsResizer.widths.validity || 140 }} className="py-2.5 px-3 relative">
                    <span>Validity Period</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('validity', e)} />
                  </th>
                  <th style={{ width: contractsResizer.widths.status || 80 }} className="py-2.5 px-2 text-center relative">
                    <span>Status</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('status', e)} />
                  </th>
                  <th style={{ width: contractsResizer.widths.contractValue || 130 }} className="py-2.5 px-3 text-right relative">
                    <span>Contract Value</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('contractValue', e)} />
                  </th>
                  <th style={{ width: contractsResizer.widths.pbgNumber || 110 }} className="py-2.5 px-3 relative">
                    <span>PBG Number</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('pbgNumber', e)} />
                  </th>
                  <th style={{ width: contractsResizer.widths.pbgValue || 110 }} className="py-2.5 px-3 text-right relative">
                    <span>PBG Value</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('pbgValue', e)} />
                  </th>
                  <th style={{ width: contractsResizer.widths.pbgExpiry || 100 }} className="py-2.5 px-3 text-center relative">
                    <span>PBG Expiry</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('pbgExpiry', e)} />
                  </th>
                  {contractsCustomCols.map((c) => (
                    <th
                      key={c.key}
                      style={{ width: contractsResizer.widths[c.key] || c.width || 120 }}
                      className="py-2.5 px-3 relative bg-[#244275] text-amber-200 font-bold border-l border-[#3a5d99]"
                      title={`Custom Column: ${c.label}`}
                    >
                      <span>{c.label}</span>
                      <ResizerHandle onMouseDown={(e) => contractsResizer.startResize(c.key, e)} />
                    </th>
                  ))}
                  <th style={{ width: contractsResizer.widths.rates || 110 }} className="py-2.5 px-3 text-center relative">
                    <span>Rate Schedule</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('rates', e)} />
                  </th>
                  <th style={{ width: contractsResizer.widths.actions || 145 }} className="py-2.5 px-3 text-center relative">
                    <span>Actions</span>
                    <ResizerHandle onMouseDown={(e) => contractsResizer.startResize('actions', e)} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={13 + contractsCustomCols.length} className="py-8 text-center text-slate-500">
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
                        className={`hover:bg-slate-50/80 transition ${isClosed ? 'bg-slate-50/50 opacity-80' : ''}`}
                      >
                        <td className="py-2.5 px-3 text-center align-middle font-mono font-semibold text-slate-500">
                          {c.id}
                        </td>
                        <td className="py-2.5 px-3 text-left align-middle">
                          <div className="font-bold text-[#1a3055] leading-tight">{c.client}</div>
                        </td>
                        <td className="py-2.5 px-3 text-left align-middle font-mono font-semibold text-slate-800">
                          <div>{c.contractRef || c.contractNo}</div>
                          {c.poNumber && (
                            <div className="text-[10px] text-slate-500 font-normal">{c.poNumber}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-left align-middle">
                          <div className="font-semibold text-slate-900">{c.shortDesc || c.name}</div>
                          {c.notes && (
                            <div className="text-[10px] text-slate-500 truncate max-w-xs">{c.notes}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center align-middle font-semibold">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                            {c.currency}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-left align-middle font-mono text-[11px] whitespace-nowrap">
                          <div className="text-slate-800 font-medium">{c.startDate}</div>
                          <div className="text-slate-400 text-[10px]">&rarr; {c.endDate}</div>
                        </td>
                        <td className="py-2.5 px-2 text-center align-middle">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 border border-slate-200">
                            <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                            {c.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right align-middle font-mono font-bold whitespace-nowrap">
                          {c.contractValue !== null && c.contractValue !== undefined ? (
                            <span className="text-[#1a3055]">{formatMoney(c.contractValue, c.currency)}</span>
                          ) : (
                            <span className="text-[10px] font-sans font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                              UNIT RATE
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-left align-middle font-mono text-xs text-slate-700">
                          {c.pbgNumber && c.pbgNumber !== '-' ? (
                            <span className="font-semibold text-slate-800">{c.pbgNumber}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right align-middle font-mono text-xs whitespace-nowrap">
                          {c.pbgValue ? (
                            <span className="font-semibold text-slate-800">{formatPbg(c.pbgValue)}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center align-middle whitespace-nowrap">
                          {c.pbgExpiryDate === 'OPEN ENDED' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              OPEN ENDED
                            </span>
                          ) : c.pbgExpiryDate ? (
                            <span className="font-mono text-[11px] text-slate-700">{c.pbgExpiryDate}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        {contractsCustomCols.map((col) => {
                          const val = (c as any)[col.key] ?? (c as any).customFields?.[col.key];
                          return (
                            <td key={col.key} className="py-2.5 px-3 text-xs text-slate-700 font-mono border-l border-slate-100 whitespace-nowrap align-middle">
                              {val !== undefined && val !== null && String(val).trim() !== ''
                                ? String(val)
                                : <span className="text-slate-300 font-sans">—</span>}
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-3 text-center align-middle whitespace-nowrap">
                          {rateCount > 0 ? (
                            <button
                              onClick={() => {
                                setSelectedContract(c);
                                setDetailActiveTab('rates');
                              }}
                              className="px-2.5 py-1 rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 mx-auto transition cursor-pointer bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs"
                              title="View itemized rates schedule"
                            >
                              <FileSpreadsheet size={13} className="text-slate-600" />
                              <span>View Rates</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedContract(c);
                                setDetailActiveTab('rates');
                              }}
                              className="px-2.5 py-1 rounded text-[11px] font-semibold flex items-center justify-center gap-1 mx-auto transition cursor-pointer bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 shadow-2xs"
                              title="Add rates to this contract"
                            >
                              <Plus size={12} className="text-slate-400" />
                              <span>Add Rates</span>
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center align-middle whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedContract(c);
                                setDetailActiveTab('overview');
                              }}
                              className="px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 text-[#1a3055] font-semibold text-[11px] border border-slate-300 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="View contract details"
                            >
                              <Eye size={12} className="text-slate-600" />
                              <span>View</span>
                            </button>

                            {canEdit && (
                              <button
                                onClick={() => openEditContractModal(c)}
                                className="px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-[#1a3055] font-semibold text-[11px] border border-slate-300 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                title="Edit contract details"
                              >
                                <Edit3 size={12} className="text-slate-600" />
                                <span>Edit</span>
                              </button>
                            )}

                            {canEdit && (
                              <button
                                onClick={() => setContractToDelete(c)}
                                className="p-1 rounded bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-300 hover:border-rose-300 transition cursor-pointer shadow-2xs"
                                title={`Delete contract ${c.contractRef || c.contractNo}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
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
        /* Card Grid View - Clean Neutral Styling */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredContracts.map((c) => {
            const linkedJobs = jobs.filter(
              (j) => j.contract === c.name || j.client === c.client || (c.contractRef && j.contract === c.contractRef)
            );
            const rateCount = c.rates?.length || 0;

            return (
              <div
                key={c.id}
                className="bg-white border border-[#b8c9db] rounded-lg overflow-hidden shadow-2xs flex flex-col justify-between hover:shadow-sm transition"
              >
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-slate-100 text-[#1a3055] border border-slate-200 text-[10px] font-semibold rounded">
                          {c.client}
                        </span>
                        <span className="text-xs font-mono font-semibold text-slate-400">ID #{c.id}</span>
                      </div>
                      <h3 className="text-sm font-bold text-[#1a3055] mt-1">{c.shortDesc || c.name}</h3>
                      <div className="text-xs font-mono font-medium text-slate-600">
                        Ref: {c.contractRef || c.contractNo} {c.poNumber ? `· ${c.poNumber}` : ''}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                      {c.status}
                    </span>
                  </div>

                  {/* Financial & Validity Grid */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Contract Value</span>
                      <span className="font-bold text-[#1a3055] font-mono">
                        {formatMoney(c.contractValue, c.currency)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Validity Window</span>
                      <span className="font-mono text-[11px] text-slate-700 block truncate">
                        {c.startDate} ~ {c.endDate}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">PBG Value</span>
                      <span className="font-semibold text-slate-800 font-mono">
                        {formatPbg(c.pbgValue)}
                      </span>
                    </div>
                  </div>

                  {/* PBG Information Row */}
                  {c.pbgNumber && c.pbgNumber !== '-' && (
                    <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded border border-slate-200">
                      <div className="flex items-center gap-1.5 text-slate-800">
                        <ShieldCheck size={13} className="text-slate-600" />
                        <span className="font-semibold">PBG Ref:</span>
                        <span className="font-mono text-slate-900">{c.pbgNumber}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        Expiry: {c.pbgExpiryDate || 'N/A'}
                      </div>
                    </div>
                  )}

                  {/* Rate Schedule / Price Book Indicator */}
                  <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet size={15} className="text-slate-600" />
                      <div>
                        <span className="font-semibold text-[#1a3055] block">Price Book &amp; Rate Schedule</span>
                        <span className="text-[10px] text-slate-500">
                          {rateCount > 0 ? 'Itemized tool/engineer rates configured' : 'No rate sheet uploaded yet'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setContractForRates(c)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded font-semibold text-[11px] shadow-2xs cursor-pointer transition flex items-center gap-1"
                    >
                      <span>{rateCount > 0 ? 'View Rates' : '+ Add Rates'}</span>
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>

                <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-between items-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">
                    <strong>{linkedJobs.length}</strong> active job(s) linked
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedContract(c);
                        setDetailActiveTab('rates');
                      }}
                      className="text-slate-700 hover:text-slate-900 font-semibold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <FileSpreadsheet size={12} /> View Rates
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={() => {
                        setSelectedContract(c);
                        setDetailActiveTab('overview');
                      }}
                      className="text-[#1a3055] hover:underline font-semibold cursor-pointer"
                    >
                      View Details
                    </button>
                    {canEdit && (
                      <>
                        <span className="text-slate-300">|</span>
                        <button
                          onClick={() => openEditContractModal(c)}
                          className="text-slate-700 hover:text-slate-900 font-semibold hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <Edit3 size={12} /> Edit
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          onClick={() => setContractToDelete(c)}
                          className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </>
                    )}
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
                <h3 className="font-bold text-sm">
                  {editingContract ? 'Edit Master Contract' : 'Add Master Contract to Azure SQL'}
                </h3>
              </div>
              <button
                onClick={() => setIsNewContractOpen(false)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveContractForm} className="p-4 space-y-3 text-xs overflow-y-auto">
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
              <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-2.5">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-[#1a3055]" />
                  <span>Performance Bank Guarantee (PBG) Details</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700">PBG Reference Number</label>
                    <input
                      type="text"
                      placeholder="e.g. ACLG1900238"
                      value={pbgNumber}
                      onChange={(e) => setPbgNumber(e.target.value)}
                      className="w-full border rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700">PBG Value (AED)</label>
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
                    <label className="block font-semibold mb-1 text-slate-700">PBG Issue Date</label>
                    <input
                      type="date"
                      value={pbgIssueDate}
                      onChange={(e) => setPbgIssueDate(e.target.value)}
                      className="w-full border rounded px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="font-semibold text-slate-700">PBG Expiry Date</label>
                      <label className="flex items-center gap-1 font-normal text-[10px] text-slate-600 cursor-pointer">
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
                  className="px-4 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow-sm cursor-pointer"
                >
                  {editingContract ? 'Update Contract' : 'Save to SQL →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contract Detail Modal with Built-in Rate Schedule */}
      {selectedContract && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4 no-print overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedContract(null);
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col border border-slate-300">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-[#1a3055] text-white flex justify-between items-center shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-white/15 border border-white/20 text-white font-mono text-[10px] font-bold rounded">
                    ID #{selectedContract.id}
                  </span>
                  <h3 className="font-bold text-sm tracking-wide text-white">
                    {selectedContract.shortDesc || selectedContract.name}
                  </h3>
                </div>
                <div className="text-[11px] text-slate-300 font-mono mt-0.5 flex items-center gap-2">
                  <span>Client: <strong className="text-white">{selectedContract.client}</strong></span>
                  <span>•</span>
                  <span>Ref: {selectedContract.contractRef || selectedContract.contractNo}</span>
                  {selectedContract.poNumber && <span>• PO: {selectedContract.poNumber}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <>
                    <button
                      onClick={() => {
                        const c = selectedContract;
                        setSelectedContract(null);
                        openEditContractModal(c);
                      }}
                      className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                      title="Edit Contract Details"
                    >
                      <Edit3 size={12} /> Edit
                    </button>
                    {onDeleteContract && (
                      <button
                        onClick={() => {
                          const c = selectedContract;
                          setSelectedContract(null);
                          setContractToDelete(c);
                        }}
                        className="px-2.5 py-1 bg-rose-600/80 hover:bg-rose-700 text-white rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                        title="Delete Contract"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => setSelectedContract(null)}
                  className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer px-1.5 ml-1"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Modal Navigation Tabs: Overview vs Rate Schedule */}
            <div className="bg-slate-100 border-b border-slate-200 px-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDetailActiveTab('overview')}
                  className={`px-3 py-2 text-xs font-bold transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
                    detailActiveTab === 'overview'
                      ? 'border-[#1a3055] text-[#1a3055] bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Eye size={13} />
                  <span>Contract Overview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailActiveTab('rates')}
                  className={`px-3 py-2 text-xs font-bold transition border-b-2 cursor-pointer flex items-center gap-1.5 ${
                    detailActiveTab === 'rates'
                      ? 'border-[#1a3055] text-[#1a3055] bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileSpreadsheet size={13} className="text-[#1a3055]" />
                  <span>Itemized Rates Schedule</span>
                </button>
              </div>

              {detailActiveTab === 'rates' && canEdit && (
                <button
                  onClick={() => {
                    const c = selectedContract;
                    setSelectedContract(null);
                    setContractForRates(c);
                  }}
                  className="px-2.5 py-1 bg-[#1a3055] hover:bg-[#24426d] text-white rounded font-bold text-[11px] shadow-2xs transition flex items-center gap-1 cursor-pointer"
                  title="Open full editor to paste from Excel or modify lines"
                >
                  <FileSpreadsheet size={12} />
                  <span>Edit Rate Schedule</span>
                </button>
              )}
            </div>

            {/* Tab 1: Overview */}
            {detailActiveTab === 'overview' && (
              <div className="p-5 space-y-4 text-xs overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded border border-slate-200">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Client Entity</span>
                    <span className="font-bold text-[#1a3055] text-sm">{selectedContract.client}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Contract Status</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 mt-0.5 ${
                        selectedContract.status === 'Active'
                          ? 'bg-slate-100 text-slate-800 border border-slate-300'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${selectedContract.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                      {selectedContract.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Validity Window</span>
                    <span className="font-mono text-slate-800 font-medium">
                      {selectedContract.startDate} &rarr; {selectedContract.endDate}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Billing Currency</span>
                    <span className="font-bold text-slate-900 font-mono">{selectedContract.currency}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Contract Value</span>
                    <span className="font-bold font-mono text-[#1a3055] text-sm">
                      {formatMoney(selectedContract.contractValue, selectedContract.currency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Standby Discount</span>
                    <span className="font-bold text-slate-800 font-mono">{selectedContract.standbyDiscountPct}% of Ops Rate</span>
                  </div>
                </div>

                {/* PBG Breakdown */}
                <div className="p-3.5 bg-slate-50 rounded border border-slate-200 space-y-2.5">
                  <div className="font-bold text-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-[#1a3055]" />
                      <span>Performance Bank Guarantee (PBG)</span>
                    </div>
                    {selectedContract.pbgExpiryDate && (
                      <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-200 px-2 py-0.5 rounded border border-slate-300">
                        Expiry: {selectedContract.pbgExpiryDate}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block">PBG Number</span>
                      <span className="font-mono font-bold text-slate-900">
                        {selectedContract.pbgNumber || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block">PBG Security Value</span>
                      <span className="font-mono font-bold text-slate-900">
                        {formatPbg(selectedContract.pbgValue)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block">Issue Date</span>
                      <span className="font-mono text-slate-700">{selectedContract.pbgIssueDate || '-'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 block">Expiry Date</span>
                      <span className="font-mono text-slate-700">
                        {selectedContract.pbgExpiryDate || '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedContract.notes && (
                  <div>
                    <h4 className="font-bold text-slate-700 mb-1 uppercase tracking-wider text-[10px]">Contract Notes &amp; Scope Terms</h4>
                    <div className="p-3 bg-slate-50 border rounded text-slate-700 whitespace-pre-wrap leading-relaxed text-xs">
                      {selectedContract.notes}
                    </div>
                  </div>
                )}

                {/* Rates Schedule Callout */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet size={16} className="text-[#1a3055]" />
                    <div>
                      <span className="font-bold text-[#1a3055] block">
                        Rate Schedule
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Operating &amp; standby rates, hole sections, redress and run charges
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setDetailActiveTab('rates')}
                    className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded font-bold text-xs flex items-center gap-1 cursor-pointer transition shadow-2xs"
                  >
                    <span>View Rate Schedule</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Embedded Itemized Rate Schedule */}
            {detailActiveTab === 'rates' && (
              <div className="flex-1 flex flex-col overflow-hidden bg-white">
                <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs flex flex-wrap justify-between items-center gap-2">
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="font-semibold text-slate-800">
                      Rates for {selectedContract.shortDesc || selectedContract.name}
                    </span>
                    <span>•</span>
                    <span>Currency: <strong className="font-mono text-slate-900">{selectedContract.currency}</strong></span>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => {
                        const c = selectedContract;
                        setSelectedContract(null);
                        setContractForRates(c);
                      }}
                      className="text-[#1a3055] hover:text-[#24426d] font-bold hover:underline cursor-pointer flex items-center gap-1 text-[11px]"
                    >
                      <Plus size={12} /> Add / Edit in Full Editor &rarr;
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-auto max-h-[55vh]">
                  {(!selectedContract.rates || selectedContract.rates.length === 0) ? (
                    <div className="py-12 text-center text-slate-400 italic text-xs">
                      No rate lines defined for this contract. Click "Edit Rate Schedule" to add or paste lines.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse font-sans">
                      <thead className="bg-[#1a3055] text-white sticky top-0 z-10 text-[11px] select-none">
                        <tr>
                          <th className="py-2 px-3 border border-[#2d4b7a] w-12 text-center font-bold">#</th>
                          <th className="py-2 px-3 border border-[#2d4b7a] font-bold">Category</th>
                          <th className="py-2 px-3 border border-[#2d4b7a] font-bold">Tool Description</th>
                          <th className="py-2 px-3 border border-[#2d4b7a] text-center font-bold whitespace-nowrap">Size / OD</th>
                          <th className="py-2 px-3 border border-[#2d4b7a] text-center font-bold whitespace-nowrap">Hole Section</th>
                          <th className="py-2 px-3 border border-[#2d4b7a] text-right font-bold whitespace-nowrap">Ops Rate ({selectedContract.currency})</th>
                          <th className="py-2 px-3 border border-[#2d4b7a] text-right font-bold whitespace-nowrap">Standby Rate</th>
                          <th className="py-2 px-3 border border-[#2d4b7a] text-right font-bold whitespace-nowrap">Run Charge</th>
                          <th className="py-2 px-3 border border-[#2d4b7a] text-right font-bold whitespace-nowrap">Redress</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {selectedContract.rates.map((r, i) => (
                          <tr
                            key={i}
                            className={`hover:bg-slate-50 transition duration-75 ${
                              i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                            }`}
                          >
                            <td className="py-1.5 px-3 border border-slate-100 text-center font-mono text-slate-400 text-[11px]">
                              {r.no || i + 1}
                            </td>
                            <td className="py-1.5 px-3 border border-slate-100 font-semibold text-slate-900 whitespace-nowrap">
                              {r.category}
                            </td>
                            <td className="py-1.5 px-3 border border-slate-100 text-slate-800">
                              {r.shortDesc}
                            </td>
                            <td className="py-1.5 px-3 border border-slate-100 text-center font-mono text-slate-700 whitespace-nowrap">
                              {r.size || '—'}
                            </td>
                            <td className="py-1.5 px-3 border border-slate-100 text-center font-mono text-slate-700 whitespace-nowrap">
                              {r.holeSection || '—'}
                            </td>
                            <td className="py-1.5 px-3 border border-slate-100 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                              {r.opsRate?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-1.5 px-3 border border-slate-100 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                              {r.standbyRate?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-1.5 px-3 border border-slate-100 text-right font-mono text-slate-600 text-[11px] whitespace-nowrap">
                              {r.runCharges != null ? r.runCharges.toLocaleString(undefined, { minimumFractionDigits: 2 }) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-1.5 px-3 border border-slate-100 text-right font-mono text-slate-600 text-[11px] whitespace-nowrap">
                              {r.redress != null ? r.redress.toLocaleString(undefined, { minimumFractionDigits: 2 }) : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-[#b8c9db] flex justify-between items-center shrink-0">
              <span className="text-slate-500 text-[11px]">
                Master Contract #{selectedContract.id} • {selectedContract.status}
              </span>
              <button
                onClick={() => setSelectedContract(null)}
                className="px-4 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] cursor-pointer text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Contract Confirmation Modal */}
      {contractToDelete && (
        <div
          className="fixed inset-0 bg-black/60 z-60 flex items-center justify-center p-4 no-print animate-in fade-in duration-100"
          onClick={(e) => {
            if (e.target === e.currentTarget) setContractToDelete(null);
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-3.5 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 size={16} />
                <h3 className="font-bold text-sm">Delete Master Contract</h3>
              </div>
              <button
                onClick={() => setContractToDelete(null)}
                className="text-white/80 hover:text-white text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-5 text-xs text-slate-700 space-y-3">
              <p>
                Are you sure you want to permanently delete contract{' '}
                <strong className="text-slate-900 font-mono">
                  {contractToDelete.contractRef || contractToDelete.contractNo}
                </strong>
                {contractToDelete.shortDesc && (
                  <>
                    {' '}(<strong className="text-slate-900">{contractToDelete.shortDesc}</strong>)
                  </>
                )}
                ?
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded p-3 text-slate-600 text-[11px] space-y-1">
                <div>• Client: <strong>{contractToDelete.client}</strong></div>
                <div>• Status: <strong>{contractToDelete.status}</strong></div>
                {contractToDelete.rates && (
                  <div>• Itemized Rates: <strong>{contractToDelete.rates.length} lines</strong></div>
                )}
              </div>
              <p className="text-rose-600 font-medium text-[11px]">
                This will archive and delete the contract from Azure SQL and your local workspace. All synced devices will reflect this removal.
              </p>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setContractToDelete(null)}
                className="px-3.5 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                <span>Confirm Delete</span>
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
