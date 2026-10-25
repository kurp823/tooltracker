import React, { useState, useMemo } from 'react';
import { User, ToolItem } from '../types';
import { getDropdownOptions } from '../services/dropdownService';
import { saveCustomTool } from '../services/customTools';
import { saveInventoryApi, toSqlIsoDate } from '../services/api';
import { formatDateDDMMYYYY as formatDateDD_MM_YYYY } from '../utils';
import {
  Truck,
  Plus,
  Trash2,
  CheckCircle2,
  Search,
  Building2,
  Calendar,
  DollarSign,
  AlertCircle,
} from 'lucide-react';

interface SubRentalInwardViewProps {
  user?: User | null;
  inventory?: ToolItem[];
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onSaveTool?: (tool: ToolItem) => void;
}

interface SubRentalLineDraft {
  id: string;
  assetNo: string;
  description: string;
  size: string;
  qty: number;
  standbyRate: number;
  operatingRate: number;
  runCharge: number;
  redressCharge: number;
  monthlyRate: number;
}

export const SubRentalInwardView: React.FC<SubRentalInwardViewProps> = ({
  user,
  inventory = [],
  showToast = () => {},
  onSaveTool,
}) => {
  const masterSuppliers = useMemo(() => getDropdownOptions('suppliers'), []);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [subRentalHeader, setSubRentalHeader] = useState({
    supplier: masterSuppliers[0] || 'Flow Tools',
    ticketNo: '',
    receiptDate: new Date().toISOString().split('T')[0],
    receivedBy: user?.name || 'Yard Supervisor',
    currency: 'AED' as 'AED' | 'USD',
  });

  const [subRentalLines, setSubRentalLines] = useState<SubRentalLineDraft[]>([
    {
      id: 'SR-1',
      assetNo: '',
      description: '',
      size: '',
      qty: 1,
      standbyRate: 0,
      operatingRate: 0,
      runCharge: 0,
      redressCharge: 0,
      monthlyRate: 0,
    },
  ]);

  const handleOpenModal = () => {
    setSubRentalHeader({
      supplier: masterSuppliers[0] || 'Flow Tools',
      ticketNo: '',
      receiptDate: new Date().toISOString().split('T')[0],
      receivedBy: user?.name || 'Yard Supervisor',
      currency: 'AED',
    });
    setSubRentalLines([
      {
        id: 'SR-1',
        assetNo: '',
        description: '',
        size: '',
        qty: 1,
        standbyRate: 0,
        operatingRate: 0,
        runCharge: 0,
        redressCharge: 0,
        monthlyRate: 0,
      },
    ]);
    setIsModalOpen(true);
  };

  const handleAddLine = () => {
    setSubRentalLines((prev) => [
      ...prev,
      {
        id: `SR-${prev.length + 1}`,
        assetNo: '',
        description: '',
        size: '',
        qty: 1,
        standbyRate: 0,
        operatingRate: 0,
        runCharge: 0,
        redressCharge: 0,
        monthlyRate: 0,
      },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    if (subRentalLines.length <= 1) {
      showToast('Must have at least 1 tool line item.', 'error');
      return;
    }
    setSubRentalLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateLine = (idx: number, field: keyof SubRentalLineDraft, val: any) => {
    setSubRentalLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: val } : l))
    );
  };

  const handleSaveSubRentalInward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subRentalHeader.supplier.trim()) {
      showToast('Please select a Supplier.', 'error');
      return;
    }
    if (!subRentalHeader.ticketNo.trim()) {
      showToast('Please enter the Supplier Ticket / Manifest Number.', 'error');
      return;
    }

    const validLines = subRentalLines.filter((l) => l.assetNo.trim());
    if (validLines.length === 0) {
      showToast('Please enter at least one valid Supplier Asset Number.', 'error');
      return;
    }

    for (const line of validLines) {
      const cleanAsset = line.assetNo.trim().toUpperCase();
      const newTool: ToolItem = {
        id: cleanAsset,
        serial: cleanAsset,
        assetNo: cleanAsset,
        size: line.size.trim() || '—',
        shortDesc: 'RENTAL TOOL',
        desc: line.description.trim() || `Third-Party Tool ${cleanAsset}`,
        qty: Number(line.qty) || 1,
        location: 'Emdad Base',
        status: 'Good' as any,
        ownership: 'Sub-Contractor',
        isEmdad: false,
        supplier: subRentalHeader.supplier,
        addedDate: toSqlIsoDate(subRentalHeader.receiptDate) || new Date().toISOString().split('T')[0],
        subRentalAgreementType: 'Daily Rental',
        subRentalStandbyRate: Number(line.standbyRate) || 0,
        subRentalOperatingRate: Number(line.operatingRate) || 0,
        subRentalRunCharge: Number(line.runCharge) || 0,
        subRentalRedressCharge: Number(line.redressCharge) || 0,
        subRentalMonthlyRate: Number(line.monthlyRate) || 0,
        supplierPoNumber: subRentalHeader.ticketNo.trim(),
        supplierCurrency: subRentalHeader.currency,
        rentalStartDate: toSqlIsoDate(subRentalHeader.receiptDate) || new Date().toISOString().split('T')[0],
      };

      saveCustomTool(newTool);
      if (onSaveTool) onSaveTool(newTool);
      saveInventoryApi({ ...newTool, _isExisting: false }).catch(() => {});
    }

    showToast(
      `Registered ${validLines.length} Third-Party Tool(s) from ${subRentalHeader.supplier} into Master Inventory.`,
      'success'
    );
    setIsModalOpen(false);
  };

  // Active sub-rental tools list
  const subRentalTools = useMemo(() => {
    return inventory.filter((t) => {
      const isSub = !t.isEmdad || (t.ownership && t.ownership.toUpperCase() !== 'EMDAD');
      if (!isSub) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        (t.assetNo || '').toLowerCase().includes(q) ||
        (t.desc || '').toLowerCase().includes(q) ||
        (t.supplier || '').toLowerCase().includes(q) ||
        (t.supplierPoNumber || '').toLowerCase().includes(q)
      );
    });
  }, [inventory, searchQuery]);

  return (
    <div className="space-y-4">
      {/* EXECUTIVE HEADER */}
      <div className="bg-[#1a3055] text-white rounded p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold text-base tracking-wide">
              THIRD-PARTY SUB-RENTAL INWARD
            </span>
            <span className="bg-amber-900 text-amber-200 text-[10px] font-mono px-2 py-0.5 rounded border border-amber-700">
              Vendor Rental Assets
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Receive and inward tools from third-party suppliers (Flow Tools, EPIS, Tomax) with contractual standby and operating rates.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenModal}
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded shadow-xs transition flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Receive Third-Party Tools</span>
        </button>
      </div>

      {/* SEARCH AND FLEET TABLE */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search supplier asset #, description, vendor, manifest..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="text-xs font-bold text-slate-700">
            Total Third-Party Assets in Fleet:{' '}
            <span className="text-blue-900 font-mono text-sm">{subRentalTools.length}</span>
          </div>
        </div>

        <div className="overflow-x-auto border border-[#b8c9db] rounded">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#f0f5fb] text-[#1a3055] border-b border-[#b8c9db] font-bold">
              <tr>
                <th className="p-2 w-10 text-center">#</th>
                <th className="p-2 whitespace-nowrap">SUPPLIER ASSET NO</th>
                <th className="p-2">DESCRIPTION</th>
                <th className="p-2 text-center whitespace-nowrap">SIZE</th>
                <th className="p-2">SUPPLIER</th>
                <th className="p-2 whitespace-nowrap">MANIFEST / REF</th>
                <th className="p-2 text-right whitespace-nowrap">STANDBY RATE</th>
                <th className="p-2 text-right whitespace-nowrap">OPERATING RATE</th>
                <th className="p-2 text-center whitespace-nowrap">LOCATION</th>
                <th className="p-2 text-center whitespace-nowrap">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {subRentalTools.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500 font-medium bg-slate-50">
                    No third-party sub-rental tools found. Click <strong>&quot;+ Receive Third-Party Tools&quot;</strong> to inward vendor equipment.
                  </td>
                </tr>
              ) : (
                subRentalTools.map((t, idx) => (
                  <tr key={t.id || t.serial} className="hover:bg-slate-50">
                    <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                    <td className="p-2 font-mono font-bold text-slate-900">{t.assetNo || t.serial}</td>
                    <td className="p-2 truncate max-w-xs" title={t.desc}>{t.desc}</td>
                    <td className="p-2 text-center font-mono">{t.size || '—'}</td>
                    <td className="p-2 font-semibold text-slate-800">{t.supplier || t.ownership}</td>
                    <td className="p-2 font-mono text-slate-600">{t.supplierPoNumber || '—'}</td>
                    <td className="p-2 text-right font-mono font-semibold text-slate-700">
                      {t.subRentalStandbyRate ? `${t.supplierCurrency || 'AED'} ${t.subRentalStandbyRate}` : '—'}
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-blue-800">
                      {t.subRentalOperatingRate ? `${t.supplierCurrency || 'AED'} ${t.subRentalOperatingRate}` : '—'}
                    </td>
                    <td className="p-2 text-center text-slate-700">{t.location || 'Emdad Base'}</td>
                    <td className="p-2 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        t.status === 'On Rig'
                          ? 'bg-blue-100 text-blue-800 border-blue-300'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}>
                        {t.status || 'Good'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECEIVE THIRD-PARTY TOOLS MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-md shadow-2xl border border-slate-300 w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden text-xs">
            {/* MODAL HEADER */}
            <div className="bg-[#1a3055] text-white px-4 py-2.5 flex items-center justify-between font-bold flex-shrink-0">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-400" />
                <span className="text-sm">Receive Third-Party Tools (Sub-Rental Inward)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white cursor-pointer text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveSubRentalInward} className="flex flex-col flex-1 overflow-hidden">
              {/* HEADER FIELDS */}
              <div className="p-4 bg-[#f8fafc] border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Supplier Name *</label>
                  <select
                    value={subRentalHeader.supplier}
                    onChange={(e) => setSubRentalHeader({ ...subRentalHeader, supplier: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-semibold text-slate-900"
                  >
                    {masterSuppliers.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Supplier Ticket / Manifest # *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MAN-2026-99"
                    value={subRentalHeader.ticketNo}
                    onChange={(e) => setSubRentalHeader({ ...subRentalHeader, ticketNo: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Receipt Date *</label>
                  <input
                    type="date"
                    required
                    value={subRentalHeader.receiptDate}
                    onChange={(e) => setSubRentalHeader({ ...subRentalHeader, receiptDate: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-800 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Currency</label>
                  <select
                    value={subRentalHeader.currency}
                    onChange={(e) => setSubRentalHeader({ ...subRentalHeader, currency: e.target.value as 'AED' | 'USD' })}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-bold text-slate-800"
                  >
                    <option value="AED">AED</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              {/* DETAILS GRID */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800">Rental Tool Line Items ({subRentalLines.length})</h4>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="bg-slate-100 hover:bg-slate-200 text-[#1a3055] font-bold text-xs px-2.5 py-1 rounded border border-slate-300 cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Tool Line</span>
                  </button>
                </div>

                <div className="border border-[#b8c9db] rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#f0f5fb] text-[#1a3055] font-bold border-b border-[#b8c9db]">
                      <tr>
                        <th className="p-2 w-8 text-center">#</th>
                        <th className="p-2 min-w-[130px]">Supplier Asset No *</th>
                        <th className="p-2 min-w-[180px]">Description</th>
                        <th className="p-2 w-20">Size</th>
                        <th className="p-2 w-14 text-center">Qty</th>
                        <th className="p-2 w-24 text-right">Standby /d</th>
                        <th className="p-2 w-24 text-right">Operating /d</th>
                        <th className="p-2 w-20 text-right">Run Chg</th>
                        <th className="p-2 w-20 text-right">Redress</th>
                        <th className="p-2 w-24 text-right">Monthly</th>
                        <th className="p-2 w-8 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {subRentalLines.map((line, idx) => (
                        <tr key={line.id} className="hover:bg-slate-50">
                          <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-1">
                            <input
                              type="text"
                              required
                              placeholder="e.g. FLW-818-01"
                              value={line.assetNo}
                              onChange={(e) => handleUpdateLine(idx, 'assetNo', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono font-bold text-slate-900"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              placeholder="Tool description..."
                              value={line.description}
                              onChange={(e) => handleUpdateLine(idx, 'description', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-800"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              placeholder='e.g. 8"'
                              value={line.size}
                              onChange={(e) => handleUpdateLine(idx, 'size', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-center font-mono"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              min={1}
                              value={line.qty}
                              onChange={(e) => handleUpdateLine(idx, 'qty', parseInt(e.target.value) || 1)}
                              className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-center font-bold"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              min={0}
                              value={line.standbyRate}
                              onChange={(e) => handleUpdateLine(idx, 'standbyRate', parseFloat(e.target.value) || 0)}
                              className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-right font-mono"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              min={0}
                              value={line.operatingRate}
                              onChange={(e) => handleUpdateLine(idx, 'operatingRate', parseFloat(e.target.value) || 0)}
                              className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-right font-mono font-bold text-blue-900"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              min={0}
                              value={line.runCharge}
                              onChange={(e) => handleUpdateLine(idx, 'runCharge', parseFloat(e.target.value) || 0)}
                              className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-right font-mono"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              min={0}
                              value={line.redressCharge}
                              onChange={(e) => handleUpdateLine(idx, 'redressCharge', parseFloat(e.target.value) || 0)}
                              className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-right font-mono"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              min={0}
                              value={line.monthlyRate}
                              onChange={(e) => handleUpdateLine(idx, 'monthlyRate', parseFloat(e.target.value) || 0)}
                              className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-right font-mono"
                            />
                          </td>
                          <td className="p-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* FOOTER */}
              <div className="p-3 bg-[#f0f5fb] border-t border-[#b8c9db] flex items-center justify-end gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-white hover:bg-slate-100 text-slate-700 font-bold px-3 py-1.5 rounded border border-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-1.5 rounded shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Register Sub-Rental Tools</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
