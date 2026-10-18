import React, { useState, useMemo, useEffect } from 'react';
import { MonthlyExpenseRecord, MonthlyExpenseRow, SubDivision, User } from '../types';
import {
  getMonthlyExpenseRecords,
  saveMonthExpenseRecord,
  cloneFromPreviousMonth,
  FROZEN_SEP_2026,
} from '../services/monthlyExpenseService';
import { calculateSubContractorTotals } from './../services/subContractorRentalService';
import {
  Search,
  Lock,
  Unlock,
  Copy,
  Plus,
  Save,
  Download,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  Shield,
  FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface MonthlyExpensesViewProps {
  user?: User | null;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefresh?: () => void;
}

export const MonthlyExpensesView: React.FC<MonthlyExpensesViewProps> = ({
  user,
  showToast,
  onRefresh,
}) => {
  const [allRecords, setAllRecords] = useState<Record<string, MonthlyExpenseRecord>>(getMonthlyExpenseRecords());
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-10');
  const [activeRecord, setActiveRecord] = useState<MonthlyExpenseRecord>(() => {
    return allRecords['2026-10'] || allRecords['2026-09'] || FROZEN_SEP_2026;
  });

  // Track unsaved local edits
  const [editedRows, setEditedRows] = useState<MonthlyExpenseRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync when active record or records change
  useEffect(() => {
    const records = getMonthlyExpenseRecords();
    setAllRecords(records);
    const target = records[selectedPeriod] || FROZEN_SEP_2026;
    setActiveRecord(target);
    setEditedRows(target.rows || []);
    setHasChanges(false);
  }, [selectedPeriod]);

  // Listen to external updates
  useEffect(() => {
    const handleUpdate = () => {
      const records = getMonthlyExpenseRecords();
      setAllRecords(records);
      const target = records[selectedPeriod] || FROZEN_SEP_2026;
      setActiveRecord(target);
      if (!hasChanges) {
        setEditedRows(target.rows || []);
      }
    };
    window.addEventListener('monthly_expenses_updated', handleUpdate);
    return () => window.removeEventListener('monthly_expenses_updated', handleUpdate);
  }, [selectedPeriod, hasChanges]);

  const isFrozen = activeRecord.isFrozen || activeRecord.status === 'LOCKED';

  // Handle cell edit for Fishing, Whipstock, or Rentals
  const handleCellChange = (code: string, field: 'fishing' | 'whipstock' | 'rentals' | 'sector' | 'usefulLifeMonths', value: any) => {
    if (isFrozen) return;

    setEditedRows((prev) => {
      return prev.map((row) => {
        if (row.code === code) {
          const updated = { ...row, [field]: value };
          if (field === 'fishing' || field === 'whipstock' || field === 'rentals') {
            const f = field === 'fishing' ? (parseFloat(value) || 0) : (row.fishing || 0);
            const w = field === 'whipstock' ? (parseFloat(value) || 0) : (row.whipstock || 0);
            const r = field === 'rentals' ? (parseFloat(value) || 0) : (row.rentals || 0);
            updated.total = Number((f + w + r).toFixed(2));
          }
          return updated;
        }
        return row;
      });
    });
    setHasChanges(true);
  };

  // Auto-sync Sub-Rental Equipment line from SubContractorRentalService
  const handleSyncSubRentals = () => {
    if (isFrozen) return;
    const totals = calculateSubContractorTotals(selectedPeriod);
    setEditedRows((prev) => {
      return prev.map((row) => {
        if (row.code === 'CC-103') {
          const fishing = totals.divisionSplit.FISHING;
          const whipstock = totals.divisionSplit.WHIPSTOCK;
          const rentals = totals.divisionSplit.RENTALS;
          return {
            ...row,
            fishing,
            whipstock,
            rentals,
            total: fishing + whipstock + rentals,
          };
        }
        return row;
      });
    });
    setHasChanges(true);
    if (showToast) showToast('Synced Lease Rental-Equipment from sub-contractor ledger.', 'info');
  };

  // Save changes
  const handleSave = () => {
    if (isFrozen) return;
    const updatedRecord: MonthlyExpenseRecord = {
      ...activeRecord,
      rows: editedRows,
    };
    saveMonthExpenseRecord(updatedRecord);
    setHasChanges(false);
    if (showToast) showToast(`Saved expense entries for ${activeRecord.monthName} ${activeRecord.year}.`, 'success');
  };

  // Clone from Previous Month
  const handleClonePrevious = () => {
    if (isFrozen) return;
    if (window.confirm(`Clone all overhead and recurring expenses from September 2026 into ${activeRecord.monthName} ${activeRecord.year}?`)) {
      const cloned = cloneFromPreviousMonth(selectedPeriod, '2026-09');
      setActiveRecord(cloned);
      setEditedRows(cloned.rows);
      setHasChanges(false);
      if (showToast) showToast(`Cloned previous month values into ${activeRecord.monthName} ${activeRecord.year}.`, 'success');
    }
  };

  // Totals calculations
  const summaryTotals = useMemo(() => {
    let fishing = 0;
    let whipstock = 0;
    let rentals = 0;
    editedRows.forEach((r) => {
      fishing += r.fishing || 0;
      whipstock += r.whipstock || 0;
      rentals += r.rentals || 0;
    });
    return {
      fishing: Number(fishing.toFixed(2)),
      whipstock: Number(whipstock.toFixed(2)),
      rentals: Number(rentals.toFixed(2)),
      grandTotal: Number((fishing + whipstock + rentals).toFixed(2)),
    };
  }, [editedRows]);

  // Export to Excel
  const handleExportExcel = () => {
    const data = editedRows.map((r) => ({
      'Cost Code': r.code,
      'Description': r.name,
      'Category': r.category,
      'Fishing (AED)': r.fishing || 0,
      'Whipstock (AED)': r.whipstock || 0,
      'Rentals (AED)': r.rentals || 0,
      'Total (AED)': r.total || 0,
      'Depreciation Sector': r.sector || '—',
      'Useful Life (Months)': r.usefulLifeMonths || '—',
    }));

    // Add summary row
    data.push({
      'Cost Code': 'TOTAL',
      'Description': 'Grand Total Monthly Costs',
      'Category': 'ALL',
      'Fishing (AED)': summaryTotals.fishing,
      'Whipstock (AED)': summaryTotals.whipstock,
      'Rentals (AED)': summaryTotals.rentals,
      'Total (AED)': summaryTotals.grandTotal,
      'Depreciation Sector': '—',
      'Useful Life (Months)': '—',
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${activeRecord.periodKey} Expenses`);
    XLSX.writeFile(wb, `Monthly_Expenses_${activeRecord.periodKey}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-[#132847] to-slate-900 border border-slate-700 rounded-lg p-4 text-white shadow-md">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="bg-emerald-600 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                Finance Allocation • GAP A
              </span>
              <h1 className="text-xl font-bold tracking-tight">Monthly Expense Grid &amp; Sub-Division P&amp;L</h1>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Direct and indirect cost allocation across <strong>Fishing</strong>, <strong>Whipstock</strong>, and <strong>Rentals</strong>. Jan–Sep '26 is frozen; Oct '26+ is live.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-semibold flex items-center space-x-1 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>

            {!isFrozen && (
              <>
                <button
                  onClick={handleSyncSubRentals}
                  className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 rounded text-xs font-bold flex items-center space-x-1 shadow transition cursor-pointer"
                  title="Auto-pull Lease Rental-Equipment from sub-contractor ledger"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Pull Sub-Rentals</span>
                </button>
                <button
                  onClick={handleClonePrevious}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-500 rounded text-xs font-bold flex items-center space-x-1 shadow transition cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Clone Sep '26</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges}
                  className={`px-3.5 py-1.5 rounded text-xs font-bold flex items-center space-x-1 shadow transition cursor-pointer ${
                    hasChanges ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>Save Entries</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Period Selector & Status Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-700/80">
          <div className="flex items-center space-x-3">
            <span className="text-xs text-slate-300 font-bold">Reporting Period:</span>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-xs font-bold font-mono text-white cursor-pointer focus:ring-1 focus:ring-blue-400"
            >
              <option value="2026-09">2026-09 (September 2026 — Frozen)</option>
              <option value="2026-10">2026-10 (October 2026 — Live Draft)</option>
              <option value="2026-11">2026-11 (November 2026 — Open)</option>
            </select>

            {isFrozen ? (
              <span className="flex items-center space-x-1 px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold">
                <Lock className="w-3.5 h-3.5" />
                <span>Frozen Period (Read Only — Matches Excel)</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                <Unlock className="w-3.5 h-3.5" />
                <span>Live Period (Editable)</span>
              </span>
            )}
          </div>

          <div className="text-xs text-slate-400">
            {hasChanges && <span className="text-amber-400 font-bold mr-2">● Unsaved edits present</span>}
            Grand Total: <strong className="text-white font-mono text-sm">AED {summaryTotals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
          </div>
        </div>
      </div>

      {/* Sub-Division Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-[#b8c9db] rounded-lg p-3 shadow-xs border-l-4 border-l-rose-500">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Fishing Operations</div>
          <div className="text-xl font-extrabold text-slate-900 font-mono mt-1">
            AED {summaryTotals.fishing.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Share: {summaryTotals.grandTotal > 0 ? ((summaryTotals.fishing / summaryTotals.grandTotal) * 100).toFixed(1) : 0}% of monthly cost
          </div>
        </div>

        <div className="bg-white border border-[#b8c9db] rounded-lg p-3 shadow-xs border-l-4 border-l-purple-500">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Whipstock Operations</div>
          <div className="text-xl font-extrabold text-slate-900 font-mono mt-1">
            AED {summaryTotals.whipstock.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Share: {summaryTotals.grandTotal > 0 ? ((summaryTotals.whipstock / summaryTotals.grandTotal) * 100).toFixed(1) : 0}% of monthly cost
          </div>
        </div>

        <div className="bg-white border border-[#b8c9db] rounded-lg p-3 shadow-xs border-l-4 border-l-blue-500">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Downhole Tool Rentals</div>
          <div className="text-xl font-extrabold text-slate-900 font-mono mt-1">
            AED {summaryTotals.rentals.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Share: {summaryTotals.grandTotal > 0 ? ((summaryTotals.rentals / summaryTotals.grandTotal) * 100).toFixed(1) : 0}% of monthly cost
          </div>
        </div>
      </div>

      {/* Main Expense Grid */}
      <div className="bg-white border border-[#b8c9db] rounded-lg shadow-xs overflow-hidden">
        <div className="p-3 bg-[#eef4fb] border-b border-[#b8c9db] flex justify-between items-center text-xs">
          <div className="font-bold text-[#1a3055] flex items-center gap-2">
            <span>Sub-Division Wise Cost Capture Grid</span>
            <span className="text-slate-500 font-normal">({activeRecord.monthName} {activeRecord.year})</span>
          </div>
          <div className="text-[11px] text-slate-500">
            * All figures in AED. Blank cost codes are intentionally omitted/dormant.
          </div>
        </div>

        <div className="overflow-x-auto max-h-[calc(100vh-380px)]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#f8fafc] text-slate-700 border-b border-[#b8c9db] sticky top-0 z-10 shadow-2xs font-bold text-[11px]">
              <tr>
                <th className="p-2.5 border-r border-slate-200 w-24">Code</th>
                <th className="p-2.5 border-r border-slate-200">Cost Code &amp; Description</th>
                <th className="p-2.5 border-r border-slate-200 w-28 text-center">Category</th>
                <th className="p-2.5 border-r border-slate-200 w-36 text-right bg-rose-50/50 text-rose-900">
                  Fishing (AED)
                </th>
                <th className="p-2.5 border-r border-slate-200 w-36 text-right bg-purple-50/50 text-purple-900">
                  Whipstock (AED)
                </th>
                <th className="p-2.5 border-r border-slate-200 w-36 text-right bg-blue-50/50 text-blue-900">
                  Rentals (AED)
                </th>
                <th className="p-2.5 border-r border-slate-200 w-36 text-right bg-slate-100 font-extrabold text-slate-900">
                  Total (Auto)
                </th>
                <th className="p-2.5 w-44">Depreciation Rules</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {editedRows.map((r) => {
                const isTrueUpRow = r.sourceType === 'TRUE_UP';
                const isDepRow = r.sourceType === 'DEPRECIATION_AUTO';

                return (
                  <tr
                    key={r.code}
                    className={`hover:bg-blue-50/30 transition ${
                      isTrueUpRow ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="p-2.5 border-r border-slate-200 font-mono font-bold text-slate-600">
                      {r.code}
                    </td>

                    <td className="p-2.5 border-r border-slate-200">
                      <div className="font-bold text-slate-800">{r.name}</div>
                      {isTrueUpRow && (
                        <div className="text-[10px] text-amber-800 font-medium mt-0.5">
                          Dedicated variance true-up line for late supplier invoices (keeps frozen periods untouched).
                        </div>
                      )}
                      {r.code === 'CC-103' && (
                        <div className="text-[10px] text-blue-700 font-medium mt-0.5">
                          Linked to Sub-Contractor Tool Rentals (42% of total costs).
                        </div>
                      )}
                    </td>

                    <td className="p-2.5 border-r border-slate-200 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {r.category}
                      </span>
                    </td>

                    {/* Fishing Input */}
                    <td className="p-1.5 border-r border-slate-200 text-right bg-rose-50/20">
                      {isFrozen ? (
                        <span className="font-mono font-bold text-slate-800">
                          {r.fishing ? r.fishing.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                        </span>
                      ) : (
                        <input
                          type="number"
                          value={r.fishing || ''}
                          onChange={(e) => handleCellChange(r.code, 'fishing', e.target.value)}
                          placeholder="0.00"
                          className="w-full text-right font-mono font-bold px-2 py-1 border border-slate-300 rounded text-slate-900 bg-white focus:ring-1 focus:ring-rose-500"
                        />
                      )}
                    </td>

                    {/* Whipstock Input */}
                    <td className="p-1.5 border-r border-slate-200 text-right bg-purple-50/20">
                      {isFrozen ? (
                        <span className="font-mono font-bold text-slate-800">
                          {r.whipstock ? r.whipstock.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                        </span>
                      ) : (
                        <input
                          type="number"
                          value={r.whipstock || ''}
                          onChange={(e) => handleCellChange(r.code, 'whipstock', e.target.value)}
                          placeholder="0.00"
                          className="w-full text-right font-mono font-bold px-2 py-1 border border-slate-300 rounded text-slate-900 bg-white focus:ring-1 focus:ring-purple-500"
                        />
                      )}
                    </td>

                    {/* Rentals Input */}
                    <td className="p-1.5 border-r border-slate-200 text-right bg-blue-50/20">
                      {isFrozen ? (
                        <span className="font-mono font-bold text-slate-800">
                          {r.rentals ? r.rentals.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                        </span>
                      ) : (
                        <input
                          type="number"
                          value={r.rentals || ''}
                          onChange={(e) => handleCellChange(r.code, 'rentals', e.target.value)}
                          placeholder="0.00"
                          className="w-full text-right font-mono font-bold px-2 py-1 border border-slate-300 rounded text-slate-900 bg-white focus:ring-1 focus:ring-blue-500"
                        />
                      )}
                    </td>

                    {/* Row Total (Auto-calculated) */}
                    <td className="p-2.5 border-r border-slate-200 text-right font-mono font-extrabold text-slate-900 bg-slate-50">
                      AED {(r.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Depreciation Sector & Useful Life (Manual Input) */}
                    <td className="p-2 border-slate-200 text-xs">
                      {isDepRow ? (
                        <div className="flex items-center space-x-1.5">
                          <select
                            value={r.sector || 'P&M'}
                            disabled={isFrozen}
                            onChange={(e) => handleCellChange(r.code, 'sector', e.target.value)}
                            className="text-[10px] border border-slate-300 rounded px-1.5 py-0.5 bg-white font-semibold text-slate-700"
                          >
                            <option value="P&M">P&amp;M</option>
                            <option value="Vehicles">Vehicles</option>
                            <option value="Comp & Printers">Comp/Print</option>
                            <option value="IP Rights">IP Rights</option>
                          </select>
                          <input
                            type="number"
                            value={r.usefulLifeMonths || 60}
                            disabled={isFrozen}
                            onChange={(e) => handleCellChange(r.code, 'usefulLifeMonths', parseInt(e.target.value, 10))}
                            className="w-12 text-center text-[10px] font-mono border border-slate-300 rounded px-1 py-0.5"
                            title="Useful Life in Months"
                          />
                          <span className="text-[10px] text-slate-400">mo</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-mono text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Grand Total Row */}
            <tfoot className="bg-[#e2edf8] border-t-2 border-slate-400 font-extrabold text-slate-900">
              <tr>
                <td colSpan={3} className="p-3 text-right uppercase tracking-wider text-xs">
                  Grand Total Allocated Cost:
                </td>
                <td className="p-3 text-right font-mono text-xs text-rose-900 bg-rose-100/50">
                  AED {summaryTotals.fishing.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="p-3 text-right font-mono text-xs text-purple-900 bg-purple-100/50">
                  AED {summaryTotals.whipstock.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="p-3 text-right font-mono text-xs text-blue-900 bg-blue-100/50">
                  AED {summaryTotals.rentals.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="p-3 text-right font-mono text-sm text-slate-900 bg-slate-200">
                  AED {summaryTotals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="p-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
