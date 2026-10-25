import React, { useState, useMemo } from 'react';
import { ContractRecord, ContractRateItem, User } from '../types';
import { useModulePermission } from '../services/permissionService';
import { 
  X, 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Check, 
  DollarSign, 
  Layers,
  ArrowUpDown,
  Filter
} from 'lucide-react';

interface ContractRatesModalProps {
  contract: ContractRecord;
  user?: User | null;
  onSave: (updatedContract: ContractRecord) => void;
  onClose: () => void;
}

export const ContractRatesModal: React.FC<ContractRatesModalProps> = ({
  contract,
  user,
  onSave,
  onClose,
}) => {
  const [rates, setRates] = useState<ContractRateItem[]>(contract.rates || []);
  const [search, setSearch] = useState('');
  const [selectedHoleSection, setSelectedHoleSection] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  
  // Modals / forms state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state for single item (Add / Edit)
  const [formData, setFormData] = useState<ContractRateItem>({
    no: '',
    contractRef: 'SCHEDULE 2',
    category: '',
    shortDesc: '',
    size: '',
    holeSection: '',
    opsRate: 0,
    standbyRate: 0,
    runCharges: null,
    monthlyCharges: null,
    redress: null,
    currency: contract.currency || 'USD',
  });

  // Unique lists for filtering
  const holeSections = useMemo(() => {
    const set = new Set<string>();
    rates.forEach((r) => {
      if (r.holeSection && r.holeSection !== 'N/A') set.add(r.holeSection);
    });
    return Array.from(set).sort();
  }, [rates]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    rates.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set).sort();
  }, [rates]);

  // Filtered rows
  const filteredRates = useMemo(() => {
    return rates.filter((r) => {
      if (selectedHoleSection !== 'ALL' && r.holeSection !== selectedHoleSection) return false;
      if (selectedCategory !== 'ALL' && r.category !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const text = `${r.no} ${r.contractRef} ${r.category} ${r.shortDesc} ${r.size} ${r.holeSection} ${r.currency}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [rates, search, selectedHoleSection, selectedCategory]);

  // Handle saving form (Add or Edit)
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category.trim() || !formData.shortDesc.trim()) {
      alert('Please provide Category and Short Description.');
      return;
    }

    let updatedRates: ContractRateItem[];
    if (editingIndex !== null) {
      updatedRates = [...rates];
      updatedRates[editingIndex] = { ...formData };
    } else {
      const nextNo = formData.no || (rates.length > 0 ? (Number(rates[rates.length - 1].no) || rates.length) + 1 : 1);
      updatedRates = [...rates, { ...formData, no: nextNo }];
    }

    setRates(updatedRates);
    setHasChanges(true);
    setIsAddOpen(false);
    setEditingIndex(null);
  };

  const handleOpenAdd = () => {
    const nextNo = rates.length > 0 ? (Number(rates[rates.length - 1].no) || rates.length) + 1 : 1;
    setFormData({
      no: nextNo,
      contractRef: rates[0]?.contractRef || 'SCHEDULE 2',
      category: '',
      shortDesc: '',
      size: '',
      holeSection: '',
      opsRate: 500,
      standbyRate: 250,
      runCharges: null,
      monthlyCharges: null,
      redress: null,
      currency: contract.currency || 'USD',
    });
    setEditingIndex(null);
    setIsAddOpen(true);
  };

  const handleOpenEdit = (index: number) => {
    setFormData({ ...rates[index] });
    setEditingIndex(index);
    setIsAddOpen(true);
  };

  const handleDelete = (index: number) => {
    if (confirm(`Remove rate line for ${rates[index].shortDesc || rates[index].category}?`)) {
      const updated = rates.filter((_, i) => i !== index);
      setRates(updated);
      setHasChanges(true);
    }
  };

  // Standby Auto-calculator
  const handleOpsRateChange = (val: number) => {
    const factor = (contract.standbyDiscountPct ?? 50) / 100;
    setFormData((prev) => ({
      ...prev,
      opsRate: val,
      standbyRate: Math.round(val * factor * 100) / 100,
    }));
  };

  // Save changes to parent state
  const handleFinalSave = () => {
    const updatedContract: ContractRecord = {
      ...contract,
      rates: rates,
    };
    onSave(updatedContract);
    setHasChanges(false);
    onClose();
  };

  const { canEdit } = useModulePermission(user, 'contracts');
  const isReadOnly = !canEdit;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto no-print">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl max-h-[96vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-slate-300">
        
        {/* CONTRACT HEADER BANNER (Exactly matching user screenshot) */}
        <div className="bg-[#0b1a30] text-white px-6 py-4 border-b border-slate-700">
          <div className="flex justify-between items-start">
            <div className="w-full text-center pr-6">
              <h2 className="text-xl sm:text-2xl font-black tracking-wider uppercase text-white drop-shadow-sm">
                {contract.client}
              </h2>
              <div className="text-sm font-bold text-slate-200 mt-1">
                Contract Description: {contract.name || contract.description || 'Provision of Fishing & Downhole tool rental services'}, CONTRACT NO: {contract.contractNo || contract.contractRef || '444558'}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10 transition cursor-pointer"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* PURPLE/NAVY ACCENT BAR */}
        <div className="bg-[#1e293b] text-white px-6 py-2.5 text-xs font-medium flex flex-wrap justify-between items-center border-b border-slate-700/60 shadow-inner">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-slate-800 text-slate-200 px-2.5 py-0.5 rounded border border-slate-700 font-mono text-[11px]">
              Currency: <strong className="text-amber-400 font-bold">{contract.currency || 'USD'}</strong>
            </span>
            <span className="text-slate-400 hidden sm:inline">•</span>
            <span className="text-slate-300 text-[11px]">
              Direct Tool OD &amp; Hole Section rate lookup schedule
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-300">
            <span>Total Items: <strong className="text-white font-mono">{rates.length}</strong></span>
            <span className="text-slate-500">•</span>
            <span>Standby Discount: <strong className="text-amber-300 font-mono">{contract.standbyDiscountPct ?? 50}%</strong></span>
          </div>
        </div>

        {/* TOOLBAR & CONTROLS */}
        <div className="bg-slate-50/90 p-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Left: Search & Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search category, tool, size, ref..."
                className="pl-8 pr-3 py-1.5 bg-white border border-[#b8c9db] rounded text-xs w-64 outline-none focus:ring-1 focus:ring-blue-500 font-medium placeholder:text-slate-400"
              />
            </div>

            {/* Hole Section Filter */}
            <div className="flex items-center gap-1.5 bg-white border border-[#b8c9db] rounded px-2.5 py-1">
              <Filter size={12} className="text-slate-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hole Section:</span>
              <select
                value={selectedHoleSection}
                onChange={(e) => setSelectedHoleSection(e.target.value)}
                className="text-xs bg-transparent outline-none font-bold text-[#1a3055] cursor-pointer"
              >
                <option value="ALL">All Sections ({rates.length})</option>
                {holeSections.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1.5 bg-white border border-[#b8c9db] rounded px-2.5 py-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs bg-transparent outline-none font-bold text-[#1a3055] cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {!isReadOnly && (
              <button
                onClick={handleOpenAdd}
                className="px-3.5 py-1.5 bg-[#1a3055] hover:bg-[#24426d] text-white font-bold rounded flex items-center gap-1.5 shadow-xs transition cursor-pointer text-xs"
              >
                <Plus size={14} /> Add Rate Line
              </button>
            )}
          </div>
        </div>

        {/* RATES TABLE CONTAINER */}
        <div className="flex-1 overflow-auto bg-white min-h-[350px]">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead className="bg-[#1a3055] text-white sticky top-0 z-10 shadow-sm text-[11px] uppercase tracking-wider select-none">
              <tr>
                <th className="py-2.5 px-3 border border-[#2d4b7a] w-12 text-center font-bold">No</th>
                <th className="py-2.5 px-3 border border-[#2d4b7a] w-28 font-bold whitespace-nowrap">Contract Ref</th>
                <th className="py-2.5 px-3 border border-[#2d4b7a] font-bold">Category (ERP Name)</th>
                <th className="py-2.5 px-3 border border-[#2d4b7a] font-bold">Tool Short Description</th>
                <th className="py-2.5 px-3 border border-[#2d4b7a] w-24 text-center font-bold whitespace-nowrap">Tool OD</th>
                <th className="py-2.5 px-3 border border-[#2d4b7a] w-28 text-center font-bold whitespace-nowrap">Hole Section</th>
                <th className="py-2.5 px-3 border border-[#2d4b7a] w-28 text-right font-bold whitespace-nowrap">Ops Rate</th>
                <th className="py-2.5 px-3 border border-[#2d4b7a] w-28 text-right font-bold whitespace-nowrap">Standby Rate</th>
                <th className="py-2.5 px-3 border border-[#2d4b7a] w-24 text-right font-bold whitespace-nowrap">Run Charge</th>
                <th className="py-2.5 px-3 border border-[#2d4b7a] w-28 text-right font-bold whitespace-nowrap">Monthly</th>
                <th className="py-2.5 px-3 border border-[#2d4b7a] w-24 text-right font-bold whitespace-nowrap">Redress</th>
                <th className="py-2.5 px-3 border border-[#2d4b7a] w-16 text-center font-bold">Curr</th>
                {!isReadOnly && <th className="py-2.5 px-3 border border-[#2d4b7a] w-20 text-center font-bold">Actions</th>}
              </tr>
              {/* Secondary Subheader */}
              <tr className="bg-slate-100 text-slate-500 font-semibold normal-case text-[10px]">
                <th className="py-1 px-3 border border-slate-200 text-center">#</th>
                <th className="py-1 px-3 border border-slate-200">Ref Code</th>
                <th className="py-1 px-3 border border-slate-200">ERP Catalog</th>
                <th className="py-1 px-3 border border-slate-200">Inventory Standard</th>
                <th className="py-1 px-3 border border-slate-200 text-center">OD Size</th>
                <th className="py-1 px-3 border border-slate-200 text-center">Section Size</th>
                <th className="py-1 px-3 border border-slate-200 text-right font-mono text-slate-600 bg-slate-100">{contract.currency}/Day</th>
                <th className="py-1 px-3 border border-slate-200 text-right font-mono text-slate-600 bg-slate-100">{contract.currency}/Day</th>
                <th className="py-1 px-3 border border-slate-200 text-right">Per Run</th>
                <th className="py-1 px-3 border border-slate-200 text-right">Fixed</th>
                <th className="py-1 px-3 border border-slate-200 text-right">Per Job</th>
                <th className="py-1 px-3 border border-slate-200 text-center">Code</th>
                {!isReadOnly && <th className="py-1 px-3 border border-slate-200 text-center">Edit / Del</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-normal">
              {filteredRates.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400 italic">
                    No rate lines found matching your filters. Click <strong>"+ Add Rate Line"</strong> to add rate items, or use <strong>DMT (Commercial &rarr; Contract Rates Schedule)</strong> for bulk Excel template download and import.
                  </td>
                </tr>
              ) : (
                filteredRates.map((r, index) => {
                  const originalIndex = rates.findIndex((item) => item === r);
                  return (
                    <tr 
                      key={index}
                      className={`hover:bg-slate-50 transition duration-75 ${
                        index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      }`}
                    >
                      {/* 1. No */}
                      <td className="py-2 px-3 border border-slate-100 text-center font-mono text-slate-500 text-[11px]">
                        {r.no}
                      </td>

                      {/* 2. Contract Ref */}
                      <td className="py-2 px-3 border border-slate-100 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                        {r.contractRef || '—'}
                      </td>

                      {/* 3. Category (ERP Name) */}
                      <td className="py-2 px-3 border border-slate-100 font-semibold text-slate-900 whitespace-nowrap">
                        {r.category}
                      </td>

                      {/* 4. EMDAD ShortDesc */}
                      <td className="py-2 px-3 border border-slate-100 text-slate-800">
                        <span className="font-medium text-[11px] text-slate-800">
                          {r.shortDesc}
                        </span>
                      </td>

                      {/* 5. Size (Tool OD) */}
                      <td className="py-2 px-3 border border-slate-100 text-center font-semibold text-slate-800 font-mono text-[11px] whitespace-nowrap">
                        {r.size || '—'}
                      </td>

                      {/* 6. Hole Section */}
                      <td className="py-2 px-3 border border-slate-100 text-center font-semibold text-slate-800 font-mono text-[11px] whitespace-nowrap">
                        {r.holeSection || '—'}
                      </td>

                      {/* 7. Ops Rate */}
                      <td className="py-2 px-3 border border-slate-100 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {r.opsRate?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* 8. Standby Rate */}
                      <td className="py-2 px-3 border border-slate-100 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {r.standbyRate?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* 9. Run Charges */}
                      <td className="py-2 px-3 border border-slate-100 text-right font-mono text-slate-600 text-[11px] whitespace-nowrap">
                        {r.runCharges != null ? r.runCharges.toLocaleString(undefined, { minimumFractionDigits: 2 }) : <span className="text-slate-300">—</span>}
                      </td>

                      {/* 10. Monthly Charges */}
                      <td className="py-2 px-3 border border-slate-100 text-right font-mono text-slate-700 text-[11px] whitespace-nowrap">
                        {r.monthlyCharges != null ? r.monthlyCharges.toLocaleString(undefined, { minimumFractionDigits: 2 }) : <span className="text-slate-300">—</span>}
                      </td>

                      {/* 11. Redress */}
                      <td className="py-2 px-3 border border-slate-100 text-right font-mono text-slate-700 text-[11px] whitespace-nowrap">
                        {r.redress != null ? r.redress.toLocaleString(undefined, { minimumFractionDigits: 2 }) : <span className="text-slate-300">—</span>}
                      </td>

                      {/* 12. Currency */}
                      <td className="py-2 px-3 border border-slate-100 text-center font-bold text-[10px] text-slate-500">
                        {r.currency || contract.currency || 'USD'}
                      </td>

                      {/* 13. Actions */}
                      {!isReadOnly && (
                        <td className="py-2 px-3 border border-slate-100 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(originalIndex)}
                              className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition cursor-pointer"
                              title="Edit line"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => handleDelete(originalIndex)}
                              className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                              title="Delete line"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MODAL FOOTER */}
        <div className="bg-slate-100 px-6 py-3 border-t border-slate-300 flex flex-wrap justify-between items-center gap-3">
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <span>
              Showing <strong>{filteredRates.length}</strong> of <strong>{rates.length}</strong> rate lines
            </span>
            {hasChanges && (
              <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-bold text-[11px] border border-amber-300 animate-pulse">
                Unsaved Changes
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-300 cursor-pointer"
            >
              {hasChanges ? 'Discard & Close' : 'Close'}
            </button>
            <button
              onClick={handleFinalSave}
              className="px-5 py-1.5 rounded bg-[#1a3055] hover:bg-[#24426d] text-white font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer transition"
            >
              <Check size={14} /> Save Contract Rates
            </button>
          </div>
        </div>

      </div>

      {/* ADD / EDIT LINE MODAL */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-black/60 z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-slate-300">
            <div className="bg-[#1a3055] text-white px-4 py-3 flex justify-between items-center">
              <h3 className="font-bold text-sm">
                {editingIndex !== null ? 'Edit Rate Schedule Line' : 'Add New Rate Schedule Line'}
              </h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-slate-300 hover:text-white font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Item No (Num)</label>
                  <input
                    type="text"
                    value={formData.no}
                    onChange={(e) => setFormData({ ...formData, no: e.target.value })}
                    placeholder="e.g. 173"
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contract Ref</label>
                  <input
                    type="text"
                    value={formData.contractRef}
                    onChange={(e) => setFormData({ ...formData, contractRef: e.target.value })}
                    placeholder="e.g. SCHEDULE 2 or A.3.6"
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category (ERP Name) *</label>
                  <input
                    type="text"
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value.toUpperCase() })}
                    placeholder="e.g. FAST REAMER"
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">EMDAD ShortDesc (Inventory Match) *</label>
                  <input
                    type="text"
                    required
                    value={formData.shortDesc}
                    onChange={(e) => setFormData({ ...formData, shortDesc: e.target.value.toUpperCase() })}
                    placeholder="e.g. FAST REAMER or HWDP"
                    className="w-full border rounded px-2.5 py-1.5 font-bold text-amber-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Size (Tool OD)</label>
                  <input
                    type="text"
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    placeholder="e.g. 12-1/4&quot;"
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hole Section</label>
                  <input
                    type="text"
                    value={formData.holeSection}
                    onChange={(e) => setFormData({ ...formData, holeSection: e.target.value })}
                    placeholder="e.g. 12-1/4&quot;"
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="AED">AED (Dh)</option>
                  </select>
                </div>
              </div>

              {/* RATES ROW */}
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Operating Day Rate ({formData.currency}) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formData.opsRate}
                      onChange={(e) => handleOpsRateChange(parseFloat(e.target.value) || 0)}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold text-slate-800 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Standby Day Rate ({formData.currency}) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formData.standbyRate}
                      onChange={(e) => setFormData({ ...formData, standbyRate: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold text-slate-800 bg-white"
                    />
                    <span className="text-[10px] text-slate-500 italic">
                      Auto-calculated at {contract.standbyDiscountPct ?? 50}% of Ops Rate
                    </span>
                  </div>
                </div>
              </div>

              {/* OPTIONAL CHARGES */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Run Charges</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.runCharges ?? ''}
                    onChange={(e) => setFormData({ ...formData, runCharges: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="0.00"
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Monthly Charges</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.monthlyCharges ?? ''}
                    onChange={(e) => setFormData({ ...formData, monthlyCharges: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="0.00"
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Redress Fee</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.redress ?? ''}
                    onChange={(e) => setFormData({ ...formData, redress: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="0.00"
                    className="w-full border rounded px-2.5 py-1.5 font-mono text-rose-700"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-sm cursor-pointer"
                >
                  {editingIndex !== null ? 'Update Line' : 'Add to Rate Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
