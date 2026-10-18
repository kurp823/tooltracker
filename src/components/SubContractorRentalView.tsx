import React, { useState, useMemo, useEffect } from 'react';
import { SubContractorRental, SubDivision, DrillingJob, ToolItem, User } from '../types';
import {
  getSubContractorRentals,
  upsertSubContractorRental,
  deleteSubContractorRental,
  calculateSubContractorTotals,
} from '../services/subContractorRentalService';
import { resolveContractSubDivision } from '../services/customContracts';
import {
  Search,
  Filter,
  Plus,
  Edit2,
  Trash2,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  FileText,
  Download,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface SubContractorRentalViewProps {
  user?: User | null;
  jobs?: DrillingJob[];
  inventory?: ToolItem[];
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefresh?: () => void;
  onNavigateToJob?: (jobId: string) => void;
}

export const SubContractorRentalView: React.FC<SubContractorRentalViewProps> = ({
  user,
  jobs = [],
  inventory = [],
  showToast,
  onRefresh,
  onNavigateToJob,
}) => {
  const [rentals, setRentals] = useState<SubContractorRental[]>(getSubContractorRentals());
  const [search, setSearch] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<SubContractorRental | null>(null);

  // Form Fields
  const [supplierName, setSupplierName] = useState('Motormax Drilling Technologies');
  const [rentalAgreementNo, setRentalAgreementNo] = useState('');
  const [jobId, setJobId] = useState('');
  const [toolDesc, setToolDesc] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [rentalType, setRentalType] = useState<'Daily' | 'Monthly' | 'Lumpsum'>('Daily');
  const [rateAmount, setRateAmount] = useState<number>(2500);
  const [standbyRate, setStandbyRate] = useState<number>(1000);
  const [startDate, setStartDate] = useState(new Date().toISOString().substring(0, 10));
  const [endDate, setEndDate] = useState('');
  const [operatingDays, setOperatingDays] = useState<number>(10);
  const [standbyDays, setStandbyDays] = useState<number>(2);
  const [poReference, setPoReference] = useState('');
  const [division, setDivision] = useState<SubDivision>('RENTALS');
  const [clientCode, setClientCode] = useState('ADNOC Onshore');
  const [rig, setRig] = useState('');
  const [well, setWell] = useState('');
  const [contractRef, setContractRef] = useState('');
  const [notes, setNotes] = useState('');

  // Stage 2 (Supplier Invoice)
  const [invoiceRef, setInvoiceRef] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState<string>('');
  const [status, setStatus] = useState<'ACCRUED' | 'INVOICE_RECEIVED' | 'PAID' | 'DISPUTED'>('ACCRUED');

  const refreshList = () => {
    setRentals(getSubContractorRentals());
    if (onRefresh) onRefresh();
  };

  useEffect(() => {
    const handleUpdate = () => setRentals(getSubContractorRentals());
    window.addEventListener('subcontractor_rentals_updated', handleUpdate);
    return () => window.removeEventListener('subcontractor_rentals_updated', handleUpdate);
  }, []);

  // When selecting a Job in the modal, auto-fill rig, well, client, contract, and subDivision
  const handleJobSelect = (selectedId: string) => {
    setJobId(selectedId);
    const matchedJob = jobs.find((j) => j.id.trim().toUpperCase() === selectedId.trim().toUpperCase());
    if (matchedJob) {
      setRig(matchedJob.rig || '');
      setWell(matchedJob.well || '');
      setClientCode(matchedJob.client || 'ADNOC');
      const cRef = matchedJob.contractNo || matchedJob.contract || '';
      setContractRef(cRef);
      const autoDiv = matchedJob.subDivision || resolveContractSubDivision(cRef) || 'RENTALS';
      setDivision(autoDiv);
    }
  };

  const handleOpenAddModal = () => {
    setEditingRental(null);
    setSupplierName('Motormax Drilling Technologies');
    setRentalAgreementNo(`SRA-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    setJobId(jobs[0]?.id || 'JOB-026-01798');
    handleJobSelect(jobs[0]?.id || 'JOB-026-01798');
    setToolDesc('');
    setSerialNo('');
    setRentalType('Daily');
    setRateAmount(2500);
    setStandbyRate(1000);
    setStartDate(new Date().toISOString().substring(0, 10));
    setEndDate('');
    setOperatingDays(1);
    setStandbyDays(0);
    setPoReference('');
    setNotes('');
    setInvoiceRef('');
    setInvoiceDate('');
    setInvoiceAmount('');
    setStatus('ACCRUED');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (rental: SubContractorRental) => {
    setEditingRental(rental);
    setSupplierName(rental.supplierName);
    setRentalAgreementNo(rental.rentalAgreementNo);
    setJobId(rental.jobId);
    setToolDesc(rental.toolDesc);
    setSerialNo(rental.serialNo);
    setRentalType(rental.rentalType);
    setRateAmount(rental.rateAmount);
    setStandbyRate(rental.standbyRate);
    setStartDate(rental.startDate);
    setEndDate(rental.endDate || '');
    setOperatingDays(rental.operatingDays);
    setStandbyDays(rental.standbyDays);
    setPoReference(rental.poReference);
    setDivision(rental.division);
    setClientCode(rental.clientCode);
    setRig(rental.rig || '');
    setWell(rental.well || '');
    setContractRef(rental.contractRef || '');
    setNotes(rental.notes || '');
    setInvoiceRef(rental.invoiceRef || '');
    setInvoiceDate(rental.invoiceDate || '');
    setInvoiceAmount(rental.invoiceAmount !== undefined ? String(rental.invoiceAmount) : '');
    setStatus(rental.status);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rentalAgreementNo.trim() || !jobId.trim() || !toolDesc.trim()) {
      if (showToast) showToast('Please complete all required fields.', 'error');
      return;
    }

    // Auto-calculate accrued
    let totalAccrued = 0;
    if (rentalType === 'Daily') {
      totalAccrued = (operatingDays * rateAmount) + (standbyDays * standbyRate);
    } else {
      totalAccrued = rateAmount;
    }

    const accrualMonth = startDate.substring(0, 7);
    const parsedInvAmt = invoiceAmount !== '' ? parseFloat(invoiceAmount) : undefined;

    const rentalRecord: SubContractorRental = {
      rentalId: editingRental ? editingRental.rentalId : `SRA-${Date.now()}`,
      jobId,
      supplierName,
      rentalAgreementNo,
      toolDesc,
      serialNo,
      rentalType,
      rateAmount: Number(rateAmount),
      standbyRate: Number(standbyRate),
      startDate,
      endDate: endDate || undefined,
      operatingDays: Number(operatingDays),
      standbyDays: Number(standbyDays),
      totalAccrued: Number(totalAccrued.toFixed(2)),
      poReference,
      invoiceRef: invoiceRef.trim() || undefined,
      invoiceDate: invoiceDate.trim() || undefined,
      invoiceAmount: parsedInvAmt,
      division,
      clientCode,
      rig,
      well,
      contractRef,
      accrualMonth,
      status: parsedInvAmt !== undefined && status === 'ACCRUED' ? 'INVOICE_RECEIVED' : status,
      notes,
      createdAt: editingRental ? editingRental.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    upsertSubContractorRental(rentalRecord);
    setIsModalOpen(false);
    refreshList();
    if (showToast) showToast(`Sub-contractor rental ${rentalAgreementNo} saved successfully.`, 'success');
  };

  const handleDelete = (id: string, ref: string) => {
    if (window.confirm(`Are you sure you want to delete rental agreement ${ref}?`)) {
      deleteSubContractorRental(id);
      refreshList();
      if (showToast) showToast(`Rental agreement ${ref} removed.`, 'info');
    }
  };

  // Filtered List
  const filteredRentals = useMemo(() => {
    return rentals.filter((r) => {
      if (selectedDivision !== 'ALL' && r.division !== selectedDivision) return false;
      if (selectedStatus !== 'ALL' && r.status !== selectedStatus) return false;
      if (selectedSupplier !== 'ALL' && r.supplierName !== selectedSupplier) return false;
      if (selectedMonth !== 'ALL' && r.accrualMonth !== selectedMonth) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          r.rentalAgreementNo.toLowerCase().includes(q) ||
          r.jobId.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q) ||
          r.toolDesc.toLowerCase().includes(q) ||
          r.serialNo.toLowerCase().includes(q) ||
          r.poReference.toLowerCase().includes(q) ||
          (r.rig && r.rig.toLowerCase().includes(q)) ||
          (r.invoiceRef && r.invoiceRef.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [rentals, selectedDivision, selectedStatus, selectedSupplier, selectedMonth, search]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalAccrued = filteredRentals.reduce((sum, r) => sum + (r.totalAccrued || 0), 0);
    const totalInvoiced = filteredRentals.reduce((sum, r) => sum + (r.invoiceAmount || 0), 0);
    const totalVariance = filteredRentals.reduce((sum, r) => sum + (r.variance || 0), 0);
    const pendingInvoices = filteredRentals.filter((r) => r.status === 'ACCRUED').length;
    const priorPeriodCount = filteredRentals.filter((r) => r.isPriorPeriodTrueUp).length;

    return {
      totalAccrued,
      totalInvoiced,
      totalVariance,
      pendingInvoices,
      priorPeriodCount,
    };
  }, [filteredRentals]);

  // 1-Click Sync/Import third-party tools assigned to active jobs
  const handleSyncFromJobTools = () => {
    let importedCount = 0;
    const currentList = getSubContractorRentals();

    // 1. Scan tools in inventory that are third-party / leased
    const leasedTools = (inventory || []).filter(
      (t) =>
        !t.isEmdad ||
        (t.ownership && t.ownership.toUpperCase() !== 'EMDAD') ||
        (t.supplier && t.supplier.trim() !== '')
    );

    leasedTools.forEach((tool) => {
      // Find active job if tool is assigned
      const linkedJob = jobs.find(
        (j) =>
          tool.currentJobId &&
          (j.id.trim().toUpperCase() === tool.currentJobId.trim().toUpperCase() ||
           j.jobNumber?.trim().toUpperCase() === tool.currentJobId.trim().toUpperCase())
      );

      // Check if already in rentals
      const exists = currentList.some(
        (r) =>
          r.serialNo?.trim().toUpperCase() === tool.serial?.trim().toUpperCase() &&
          r.jobId?.trim().toUpperCase() === (tool.currentJobId || linkedJob?.id || 'ACTIVE-RENTAL').trim().toUpperCase()
      );

      if (!exists) {
        const supplier = tool.supplier || tool.ownership || 'Third-Party Supplier';
        const jobDivision = linkedJob?.subDivision || resolveContractSubDivision(linkedJob?.contract || tool.contract || '') || 'RENTALS';
        const rate = tool.subRentalDailyRate || tool.subRentalOperatingRate || 2500;
        const sbRate = tool.subRentalStandbyRate || 1000;
        const opDays = 15;
        const sbDays = 2;
        const total = (opDays * rate) + (sbDays * sbRate);

        const newRec: SubContractorRental = {
          id: `SRA-SYNC-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`.toUpperCase(),
          jobId: tool.currentJobId || linkedJob?.id || 'ACTIVE-RENTAL',
          supplierName: supplier,
          rentalAgreementNo: `SRA-AUTO-${tool.serial}`,
          toolDesc: tool.shortDesc || tool.desc || 'Downhole Rented Tool',
          serialNo: tool.serial,
          rentalType: tool.subRentalAgreementType || 'Daily',
          rateAmount: rate,
          standbyRate: sbRate,
          startDate: tool.rentalStartDate || linkedJob?.mobDate || '2026-10-01',
          endDate: tool.rentalEndDate || linkedJob?.demobDate || '',
          operatingDays: opDays,
          standbyDays: sbDays,
          accrualMonth: '2026-10',
          totalAccrued: total,
          poReference: tool.supplierPoNumber || '',
          division: jobDivision,
          clientCode: linkedJob?.client || 'ADNOC Onshore',
          rig: linkedJob?.rig || tool.rig || '',
          well: linkedJob?.well || tool.well || '',
          contractRef: linkedJob?.contract || tool.contract || '',
          status: 'ACCRUED',
          notes: `Auto-imported from Job Tools inventory (Owner: ${tool.ownership || 'N/A'})`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        upsertSubContractorRental(newRec);
        importedCount++;
      }
    });

    // Also check jobs with subRentalCosts map
    jobs.forEach((job) => {
      if (job.subRentalCosts) {
        Object.entries(job.subRentalCosts).forEach(([toolKey, costObj]) => {
          const exists = currentList.some(
            (r) =>
              r.serialNo?.trim().toUpperCase() === toolKey.trim().toUpperCase() &&
              r.jobId?.trim().toUpperCase() === job.id.trim().toUpperCase()
          );

          if (!exists) {
            const opDays = costObj.subOpsDays || 10;
            const sbDays = costObj.subSbDays || 2;
            const rate = 2500;
            const sbRate = 1000;
            const total = (opDays * rate) + (sbDays * sbRate);

            const newRec: SubContractorRental = {
              id: `SRA-JOB-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`.toUpperCase(),
              jobId: job.id,
              supplierName: costObj.supplier || 'Sub-Contractor',
              rentalAgreementNo: `SRA-JOB-${toolKey}`,
              toolDesc: `Job Sub-Rented Tool (${toolKey})`,
              serialNo: toolKey,
              rentalType: 'Daily',
              rateAmount: rate,
              standbyRate: sbRate,
              startDate: job.mobDate || '2026-10-01',
              endDate: job.demobDate || '',
              operatingDays: opDays,
              standbyDays: sbDays,
              accrualMonth: '2026-10',
              totalAccrued: total,
              division: job.subDivision || resolveContractSubDivision(job.contract || '') || 'RENTALS',
              clientCode: job.client || 'ADNOC Onshore',
              rig: job.rig || '',
              well: job.well || '',
              contractRef: job.contract || '',
              status: 'ACCRUED',
              notes: `Auto-imported from Job ${job.id} sub-rental tracking`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            upsertSubContractorRental(newRec);
            importedCount++;
          }
        });
      }
    });

    if (importedCount > 0) {
      refreshList();
      if (showToast) {
        showToast(`Successfully imported ${importedCount} third-party rented tools from Jobs!`, 'success');
      } else {
        alert(`Successfully imported ${importedCount} third-party rented tools from Jobs!`);
      }
    } else {
      if (showToast) {
        showToast('All third-party tools from active jobs are already tracked in the ledger.', 'info');
      } else {
        alert('All third-party tools from active jobs are already tracked in the ledger.');
      }
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const rows = filteredRentals.map((r) => ({
      'Rental Agreement': r.rentalAgreementNo,
      'Supplier': r.supplierName,
      'Job ID': r.jobId,
      'Sub-Division': r.division,
      'Client': r.clientCode,
      'Rig': r.rig || '—',
      'Well': r.well || '—',
      'Tool Description': r.toolDesc,
      'Serial No': r.serialNo,
      'Rental Type': r.rentalType,
      'Oper Rate (AED)': r.rateAmount,
      'Standby Rate (AED)': r.standbyRate,
      'Oper Days': r.operatingDays,
      'Standby Days': r.standbyDays,
      'Accrual Month': r.accrualMonth,
      'Total Accrued (AED)': r.totalAccrued,
      'PO Ref': r.poReference,
      'Supplier Invoice': r.invoiceRef || 'Pending',
      'Invoice Date': r.invoiceDate || '—',
      'Invoice Amount (AED)': r.invoiceAmount || 0,
      'Variance (AED)': r.variance || 0,
      'Prior Period True-Up': r.isPriorPeriodTrueUp ? 'YES' : 'NO',
      'Status': r.status,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sub-Contractor Rentals');
    XLSX.writeFile(wb, `SubContractor_Rentals_${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  const supplierList = useMemo(() => {
    const set = new Set<string>();
    rentals.forEach((r) => set.add(r.supplierName));
    return Array.from(set).sort();
  }, [rentals]);

  const monthList = useMemo(() => {
    const set = new Set<string>();
    rentals.forEach((r) => {
      if (r.accrualMonth) set.add(r.accrualMonth);
    });
    return Array.from(set).sort().reverse();
  }, [rentals]);

  return (
    <div className="space-y-4">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border border-slate-700 rounded-lg p-4 text-white shadow-md">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="bg-blue-600 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                Cost Capture • GAP E
              </span>
              <h1 className="text-xl font-bold tracking-tight">Sub-Contractor Tool Rentals (Lease Rental-Equipment)</h1>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Third-party rental ledger (Motormax, Epis, Coretrax, Weatherford). Tracks 2-stage accruals, supplier invoice true-up, and auto-rolls into Sub-Division P&amp;L.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleSyncFromJobTools}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 rounded text-xs font-bold flex items-center space-x-1.5 shadow-sm transition cursor-pointer text-white"
              title="Auto-scan and import 3rd party rented tools currently assigned to Drilling Jobs"
            >
              <span>⚡</span>
              <span>Sync from Job Tools</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-semibold flex items-center space-x-1 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
            <button
              onClick={handleOpenAddModal}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold flex items-center space-x-1 shadow transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Sub-Rental</span>
            </button>
          </div>
        </div>

        {/* Key KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-3 border-t border-slate-700/80">
          <div className="bg-slate-800/80 rounded p-2.5 border border-slate-700">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Accrued</div>
            <div className="text-base font-extrabold text-blue-400 font-mono mt-0.5">
              AED {metrics.totalAccrued.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-slate-800/80 rounded p-2.5 border border-slate-700">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Invoiced</div>
            <div className="text-base font-extrabold text-emerald-400 font-mono mt-0.5">
              AED {metrics.totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-slate-800/80 rounded p-2.5 border border-slate-700">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Net Variance</div>
            <div className={`text-base font-extrabold font-mono mt-0.5 ${metrics.totalVariance > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {metrics.totalVariance > 0 ? `+AED ${metrics.totalVariance.toLocaleString()}` : `AED ${metrics.totalVariance.toLocaleString()}`}
            </div>
          </div>
          <div className="bg-slate-800/80 rounded p-2.5 border border-slate-700">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pending Invoices</div>
            <div className="text-base font-extrabold text-amber-400 font-mono mt-0.5 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>{metrics.pendingInvoices}</span>
            </div>
          </div>
          <div className="bg-slate-800/80 rounded p-2.5 border border-slate-700">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Prior Period True-Ups</div>
            <div className="text-base font-extrabold text-purple-300 font-mono mt-0.5 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-purple-400" />
              <span>{metrics.priorPeriodCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#b8c9db] rounded-lg p-3 shadow-xs flex flex-wrap items-center gap-3 text-xs">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agreement #, Job ID, supplier, tool serial, rig, PO..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="font-bold text-slate-600">Division:</span>
          <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1.5 bg-white font-medium text-slate-800 cursor-pointer"
          >
            <option value="ALL">All Divisions</option>
            <option value="FISHING">FISHING</option>
            <option value="WHIPSTOCK">WHIPSTOCK</option>
            <option value="RENTALS">RENTALS</option>
          </select>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="font-bold text-slate-600">Supplier:</span>
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1.5 bg-white font-medium text-slate-800 cursor-pointer max-w-[150px] truncate"
          >
            <option value="ALL">All Suppliers</option>
            {supplierList.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="font-bold text-slate-600">Month:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1.5 bg-white font-mono font-medium text-slate-800 cursor-pointer"
          >
            <option value="ALL">All Months</option>
            {monthList.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="font-bold text-slate-600">Status:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1.5 bg-white font-medium text-slate-800 cursor-pointer"
          >
            <option value="ALL">All Status</option>
            <option value="ACCRUED">ACCRUED (Invoice Pending)</option>
            <option value="INVOICE_RECEIVED">INVOICE_RECEIVED</option>
            <option value="PAID">PAID</option>
            <option value="DISPUTED">DISPUTED</option>
          </select>
        </div>
      </div>

      {/* Main Rentals Table */}
      <div className="bg-white border border-[#b8c9db] rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-320px)]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#eef4fb] text-[#1a3055] border-b border-[#b8c9db] sticky top-0 z-10 shadow-2xs font-bold text-[11px]">
              <tr>
                <th className="p-2.5 border-r border-slate-200">Agreement &amp; Supplier</th>
                <th className="p-2.5 border-r border-slate-200">Job Reference</th>
                <th className="p-2.5 border-r border-slate-200">Sub-Division</th>
                <th className="p-2.5 border-r border-slate-200">Tool &amp; Serial</th>
                <th className="p-2.5 border-r border-slate-200 text-right">Days (Op/Stby)</th>
                <th className="p-2.5 border-r border-slate-200 text-right">Accrued (AED)</th>
                <th className="p-2.5 border-r border-slate-200">Supplier Invoice</th>
                <th className="p-2.5 border-r border-slate-200 text-right">Invoice (AED)</th>
                <th className="p-2.5 border-r border-slate-200 text-right">Variance</th>
                <th className="p-2.5 border-r border-slate-200 text-center">Status</th>
                <th className="p-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRentals.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500 font-medium">
                    No sub-contractor rentals match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRentals.map((r) => {
                  const divisionBadgeColor =
                    r.division === 'FISHING'
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : r.division === 'WHIPSTOCK'
                      ? 'bg-purple-100 text-purple-800 border-purple-300'
                      : 'bg-blue-100 text-blue-800 border-blue-300';

                  return (
                    <tr key={r.rentalId} className="hover:bg-blue-50/40 transition">
                      <td className="p-2.5 border-r border-slate-200">
                        <div className="font-bold text-slate-900 font-mono">{r.rentalAgreementNo}</div>
                        <div className="text-[11px] text-slate-600 font-medium truncate max-w-[180px]">{r.supplierName}</div>
                        {r.poReference && (
                          <div className="text-[10px] text-slate-400 font-mono">PO: {r.poReference}</div>
                        )}
                      </td>

                      <td className="p-2.5 border-r border-slate-200">
                        <div className="font-bold text-blue-700 font-mono flex items-center gap-1">
                          <span>{r.jobId}</span>
                          {onNavigateToJob && (
                            <button
                              onClick={() => onNavigateToJob(r.jobId)}
                              className="text-blue-500 hover:text-blue-800 cursor-pointer"
                              title="Open Job Dossier"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {r.rig ? `Rig: ${r.rig}` : ''} {r.well ? `| ${r.well}` : ''}
                        </div>
                        <div className="text-[10px] text-slate-400">{r.clientCode}</div>
                      </td>

                      <td className="p-2.5 border-r border-slate-200">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${divisionBadgeColor}`}>
                          {r.division}
                        </span>
                      </td>

                      <td className="p-2.5 border-r border-slate-200">
                        <div className="font-medium text-slate-900 truncate max-w-[200px]" title={r.toolDesc}>
                          {r.toolDesc}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 font-bold">
                          S/N: {r.serialNo || '—'}
                        </div>
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                        <div>
                          <strong className="text-slate-800">{r.operatingDays}</strong> op / <span className="text-slate-500">{r.standbyDays}</span> stby
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {r.startDate} {r.endDate ? `to ${r.endDate}` : '(ongoing)'}
                        </div>
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                        AED {r.totalAccrued.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="p-2.5 border-r border-slate-200">
                        {r.invoiceRef ? (
                          <div>
                            <div className="font-mono font-bold text-slate-800">{r.invoiceRef}</div>
                            <div className="text-[10px] text-slate-500">{r.invoiceDate}</div>
                            {r.isPriorPeriodTrueUp && (
                              <span className="inline-block mt-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded px-1 text-[9px] font-bold">
                                Prior Period True-Up
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic font-mono">Pending Invoice</span>
                        )}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                        {r.invoiceAmount !== undefined ? (
                          <strong className="text-emerald-700">
                            AED {r.invoiceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </strong>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                        {r.variance !== undefined && r.variance !== 0 ? (
                          <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${r.variance > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {r.variance > 0 ? `+${r.variance.toLocaleString()}` : r.variance.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-slate-400">0.00</span>
                        )}
                      </td>

                      <td className="p-2.5 border-r border-slate-200 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : r.status === 'INVOICE_RECEIVED'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : r.status === 'DISPUTED'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>

                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleOpenEditModal(r)}
                            className="p-1 text-slate-600 hover:text-blue-700 hover:bg-slate-100 rounded cursor-pointer"
                            title="Edit / True-up invoice"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(r.rentalId, r.rentalAgreementNo)}
                            className="p-1 text-slate-400 hover:text-rose-700 hover:bg-slate-100 rounded cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Add / Edit Sub-Contractor Rental */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="bg-[#1a3055] text-white px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-sm">
                {editingRental ? `Edit Sub-Contractor Rental — ${editingRental.rentalAgreementNo}` : 'New Sub-Contractor Tool Rental'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-300 hover:text-white cursor-pointer font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-4 space-y-3 text-xs max-h-[80vh] overflow-y-auto">
              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-blue-900 text-[11px]">
                <strong>Division Auto-Link:</strong> Selecting a Job ID automatically links Rig, Well, Client, Contract, and Sub-Division (Fishing / Whipstock / Rentals).
              </div>

              {/* Row 1: Supplier & Agreement */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Sub-Contractor / Supplier *</label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="e.g. Motormax, Epis, Coretrax, Weatherford"
                    required
                    className="w-full border rounded px-2.5 py-1.5 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rental Agreement # *</label>
                  <input
                    type="text"
                    value={rentalAgreementNo}
                    onChange={(e) => setRentalAgreementNo(e.target.value)}
                    placeholder="e.g. SRA-2026-081"
                    required
                    className="w-full border rounded px-2.5 py-1.5 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Row 2: Job Select & Auto-filled Division */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Linked Drilling Job ID *</label>
                  <select
                    value={jobId}
                    onChange={(e) => handleJobSelect(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono font-bold text-blue-900 bg-white cursor-pointer"
                  >
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.id} ({j.client} • {j.rig})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Sub-Division (P&amp;L Sector) *</label>
                  <select
                    value={division}
                    onChange={(e) => setDivision(e.target.value as SubDivision)}
                    className="w-full border rounded px-2.5 py-1.5 font-bold text-slate-800 bg-white"
                  >
                    <option value="FISHING">FISHING</option>
                    <option value="WHIPSTOCK">WHIPSTOCK</option>
                    <option value="RENTALS">RENTALS (Downhole Tool Rentals)</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Tool Description & Serial */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tool Description *</label>
                  <input
                    type="text"
                    value={toolDesc}
                    onChange={(e) => setToolDesc(e.target.value)}
                    placeholder="e.g. 8-1/2&quot; Motor, Fishing Bumper Sub, Whipstock"
                    required
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Serial / Model #</label>
                  <input
                    type="text"
                    value={serialNo}
                    onChange={(e) => setSerialNo(e.target.value)}
                    placeholder="e.g. MM-85-1102"
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>

              {/* Row 4: Rates & Types */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-2.5 rounded border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rental Type</label>
                  <select
                    value={rentalType}
                    onChange={(e) => setRentalType(e.target.value as any)}
                    className="w-full border rounded px-2 py-1 bg-white font-medium"
                  >
                    <option value="Daily">Daily Rate</option>
                    <option value="Monthly">Monthly Rate</option>
                    <option value="Lumpsum">Lumpsum Job Charge</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Operating Rate (AED)</label>
                  <input
                    type="number"
                    value={rateAmount}
                    onChange={(e) => setRateAmount(parseFloat(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Standby Rate (AED)</label>
                  <input
                    type="number"
                    value={standbyRate}
                    onChange={(e) => setStandbyRate(parseFloat(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Row 5: Dates & Days */}
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="w-full border rounded px-2 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">End Date (or Open)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border rounded px-2 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Oper Days</label>
                  <input
                    type="number"
                    value={operatingDays}
                    onChange={(e) => setOperatingDays(parseInt(e.target.value, 10) || 0)}
                    className="w-full border rounded px-2 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Standby Days</label>
                  <input
                    type="number"
                    value={standbyDays}
                    onChange={(e) => setStandbyDays(parseInt(e.target.value, 10) || 0)}
                    className="w-full border rounded px-2 py-1 font-mono"
                  />
                </div>
              </div>

              {/* Row 6: PO & Rig */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">PO Reference</label>
                  <input
                    type="text"
                    value={poReference}
                    onChange={(e) => setPoReference(e.target.value)}
                    placeholder="e.g. PO-MMX-2026-044"
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rig / Well</label>
                  <input
                    type="text"
                    value={`${rig} ${well ? `• ${well}` : ''}`}
                    readOnly
                    className="w-full border rounded px-2.5 py-1.5 bg-slate-100 font-medium text-slate-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Total Accrued (Stage 1)</label>
                  <div className="p-1.5 bg-blue-50 border border-blue-200 rounded font-mono font-bold text-blue-900 text-center">
                    AED {((operatingDays * rateAmount) + (standbyDays * standbyRate)).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Stage 2 Section: Supplier Invoice & True-Up */}
              <div className="border-t border-slate-300 pt-3 mt-2">
                <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Stage 2: Supplier Invoice &amp; True-Up (When Invoice Arrives)
                </h3>
                <div className="grid grid-cols-4 gap-2 bg-emerald-50/50 p-2.5 rounded border border-emerald-200">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Supplier Inv #</label>
                    <input
                      type="text"
                      value={invoiceRef}
                      onChange={(e) => setInvoiceRef(e.target.value)}
                      placeholder="e.g. INV-9921"
                      className="w-full border rounded px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Invoice Date</label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="w-full border rounded px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Invoice Amount (AED)</label>
                    <input
                      type="number"
                      value={invoiceAmount}
                      onChange={(e) => setInvoiceAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full border rounded px-2 py-1 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="w-full border rounded px-2 py-1 bg-white font-medium"
                    >
                      <option value="ACCRUED">ACCRUED</option>
                      <option value="INVOICE_RECEIVED">INVOICE_RECEIVED</option>
                      <option value="PAID">PAID</option>
                      <option value="DISPUTED">DISPUTED</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Audit Remarks</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes, variance explanation, or true-up remarks..."
                  className="w-full border rounded px-2.5 py-1 text-xs"
                />
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-blue-600 text-white font-bold hover:bg-blue-700 shadow cursor-pointer"
                >
                  Save Sub-Rental Agreement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
