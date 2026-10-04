import React, { useState, useMemo } from 'react';
import { GatePass, GatePassLine, ToolItem, User } from '../types';
import { formatDateDDMMYY } from '../utils';

interface GatePassViewProps {
  user?: User | null;
  gatePasses: GatePass[];
  inventory: ToolItem[];
  onSaveGatePass: (gp: GatePass, removedTools: ToolItem[]) => void;
}

export const GatePassView: React.FC<GatePassViewProps> = ({
  user,
  gatePasses,
  inventory,
  onSaveGatePass,
}) => {
  const [search, setSearch] = useState('');
  const [selectedGPDetail, setSelectedGPDetail] = useState<GatePass | null>(null);
  const [isNewGPOpen, setIsNewGPOpen] = useState(false);

  // Collapsible state (Request #7: default display is collapsed)
  const [openGPKeys, setOpenGPKeys] = useState<Record<string, boolean>>({});

  // Form State
  const [gpType, setGpType] = useState<'Return Third-Party Tool (Permanent)' | 'Dispatch for Repair / Maintenance (Returnable)'>('Return Third-Party Tool (Permanent)');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [newGpNumber, setNewGpNumber] = useState('');
  const [newGpDate, setNewGpDate] = useState(new Date().toISOString().split('T')[0]);
  const [newAuthorizedBy, setNewAuthorizedBy] = useState(user?.name || 'Yard Supervisor');
  const [newNotes, setNewNotes] = useState('');
  const [checkedToolIds, setCheckedToolIds] = useState<string[]>([]);

  // Next GP Number
  const nextGpNumber = useMemo(() => {
    const curYr = new Date().getFullYear().toString().slice(-2);
    const gpNums = gatePasses
      .map((g) => {
        const m = g.gpNumber.match(/^GP-\d+-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextSeq = gpNums.length > 0 ? Math.max(...gpNums) + 1 : 1;
    return `GP-${curYr}-${String(nextSeq).padStart(5, '0')}`;
  }, [gatePasses]);

  // Tools at base for the selected GP type
  const availableToolsForGP = useMemo(() => {
    if (gpType === 'Return Third-Party Tool (Permanent)') {
      // 3rd party tools at base to return permanently
      return inventory.filter(
        (t) =>
          !t.isEmdad &&
          t.status !== 'Removed' &&
          t.status !== 'Lost in Hole' &&
          t.status !== 'LIH' &&
          ['Emdad Base', 'Base', 'Our Base', 'Mussafah Yard', 'Yard'].includes(t.location)
      );
    } else {
      // Tools at base being sent for repair or maintenance (Returnable)
      return inventory.filter(
        (t) =>
          t.status !== 'Removed' &&
          t.status !== 'On Rig' &&
          t.status !== 'Lost in Hole' &&
          t.status !== 'LIH' &&
          ['Emdad Base', 'Base', 'Our Base', 'Mussafah Yard', 'Yard', 'Workshop'].includes(t.location)
      );
    }
  }, [inventory, gpType]);

  // Sub-contractor tools at base count
  const subConToolsAtBase = useMemo(() => {
    return inventory.filter(
      (t) =>
        !t.isEmdad &&
        t.status !== 'Removed' &&
        t.status !== 'Lost in Hole' &&
        t.status !== 'LIH' &&
        ['Emdad Base', 'Base', 'Our Base', 'Mussafah Yard', 'Yard'].includes(t.location)
    );
  }, [inventory]);

  // Suppliers / Vendors available
  const availableSuppliers = useMemo(() => {
    if (gpType === 'Return Third-Party Tool (Permanent)') {
      const set = new Set(availableToolsForGP.map((t) => t.ownership).filter(Boolean));
      return Array.from(set).sort();
    } else {
      return [
        'EMDAD Central Machine Shop',
        'National Oilwell Varco (NOV)',
        'Smith International / SLB',
        'Baker Hughes Machine Shop',
        'Weatherford Workshop',
        'Al Ghaith Oilfield Services',
        'Specialized Oilfield Workshop',
      ];
    }
  }, [availableToolsForGP, gpType]);

  // Tools for selected supplier/vendor
  const toolsForSupplier = useMemo(() => {
    if (!selectedSupplier) return [];
    if (gpType === 'Return Third-Party Tool (Permanent)') {
      return availableToolsForGP.filter((t) => t.ownership === selectedSupplier);
    } else {
      return availableToolsForGP;
    }
  }, [availableToolsForGP, selectedSupplier, gpType]);

  const [sortField, setSortField] = useState<'gpNumber' | 'supplier' | 'date'>('gpNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const extractGPSeq = (gpStr: string) => {
    const m = gpStr.match(/\d+$/);
    return m ? parseInt(m[0], 10) : 0;
  };

  const handleSortToggle = (field: 'gpNumber' | 'supplier' | 'date') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredGatePasses = useMemo(() => {
    let list = gatePasses;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = gatePasses.filter((g) =>
        `${g.gpNumber} ${g.supplier} ${g.preparedBy} ${g.authorizedBy || ''}`.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let diff = 0;
      if (sortField === 'gpNumber') {
        diff = extractGPSeq(a.gpNumber) - extractGPSeq(b.gpNumber);
      } else if (sortField === 'supplier') {
        diff = (a.supplier || '').localeCompare(b.supplier || '');
      } else if (sortField === 'date') {
        diff = (a.gpDate || '').localeCompare(b.gpDate || '');
      }
      return sortOrder === 'desc' ? -diff : diff;
    });
  }, [gatePasses, search, sortField, sortOrder]);

  const handleCreateGPSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) {
      alert('Please select a supplier.');
      return;
    }
    if (checkedToolIds.length === 0) {
      alert('Please check at least one tool to return.');
      return;
    }

    const removedTools = checkedToolIds
      .map((id) => inventory.find((t) => t.id === id))
      .filter((t): t is ToolItem => Boolean(t));

    const lines: GatePassLine[] = removedTools.map((t) => ({
      serial: t.serial,
      assetNo: t.assetNo || t.serial,
      shortDesc: t.shortDesc,
      size: t.size,
      qty: 1,
      condition: 'Good',
    }));

    const newGP: GatePass = {
      id: `GP-${Date.now()}`,
      gpNumber: newGpNumber.trim() || nextGpNumber,
      gpType: gpType,
      supplier: selectedSupplier,
      gpDate: newGpDate,
      preparedBy: user?.name || 'Operations',
      authorizedBy: newAuthorizedBy.trim(),
      notes: newNotes.trim(),
      toolLines: lines,
    };

    onSaveGatePass(newGP, removedTools);
    setIsNewGPOpen(false);
    setSelectedSupplier('');
    setCheckedToolIds([]);
  };

  const handlePrintGP = (gp: GatePass) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Please allow popups to print Gate Passes.');
      return;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Security Gate Pass - ${gp.gpNumber}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; padding: 24px; color: #1e293b; }
  .hdr { display: flex; justify-content: space-between; border-bottom: 2px solid #f59e0b; padding-bottom: 12px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
  .box { border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 10px; background: #f8fafc; }
  .lbl { font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 2px; }
  .val { font-size: 12px; font-weight: bold; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: bold; }
  .sig { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 36px; padding-top: 10px; }
  .sig-box { border-top: 1px solid #0f172a; padding-top: 6px; font-size: 10px; }
</style>
</head>
<body>
  <div class="hdr">
    <div>
      <h1 style="font-size: 18px; margin: 0 0 2px; color: #1a3055;">EMDAD SERVICES LLC</h1>
      <div style="color: #64748b; font-size: 10px;">Yard Security &amp; Perimeter Gate Pass</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 20px; font-weight: 900; color: #d97706; font-family: monospace;">${gp.gpNumber}</div>
      <div style="font-size: 10px; font-weight: bold; color: #64748b;">GATE PASS (GP)</div>
    </div>
  </div>

  <div class="grid">
    <div class="box"><div class="lbl">Sub-Contractor / Supplier</div><div class="val">${gp.supplier}</div></div>
    <div class="box"><div class="lbl">Gate Pass Release Date</div><div class="val">${formatDateDDMMYY(gp.gpDate)}</div></div>
    <div class="box"><div class="lbl">Prepared By (EMDAD Base)</div><div class="val">${gp.preparedBy}</div></div>
    <div class="box"><div class="lbl">Authorized By</div><div class="val">${gp.authorizedBy || '—'}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 30px;">#</th>
        <th>Supplier Serial / ID</th>
        <th>Size</th>
        <th>Tool Description</th>
        <th style="width: 50px; text-align: center;">Qty</th>
        <th>Condition</th>
      </tr>
    </thead>
    <tbody>
      ${gp.toolLines
        .map(
          (t, i) => `<tr>
        <td>${i + 1}</td>
        <td style="font-family: monospace; font-weight: bold;">${t.serial}</td>
        <td style="font-family: monospace;">${t.size}</td>
        <td>${t.shortDesc}</td>
        <td style="text-align: center;">${t.qty}</td>
        <td>${t.condition || 'Good'}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  ${
    gp.notes
      ? `<div style="background: #fffbeb; border: 1px solid #fde68a; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 16px;"><strong>Remarks:</strong> ${gp.notes}</div>`
      : ''
  }

  <div class="sig">
    <div class="sig-box">Prepared By (EMDAD Base)<br/><br/><strong>${gp.preparedBy}</strong></div>
    <div class="sig-box">Authorized By (Operations)<br/><br/><strong>${gp.authorizedBy || '_______________________'}</strong></div>
    <div class="sig-box">Received By (${gp.supplier})<br/><br/>_______________________</div>
  </div>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  return (
    <div className="space-y-4">
      {/* Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-medium">Yard Security &amp; Perimeter</div>
          <h1 className="text-base font-bold text-[#1a3055]">Security Gate Pass Verification</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user?.role !== 'Viewer' && (
            <button
              onClick={() => {
                setNewGpNumber(nextGpNumber);
                setCheckedToolIds([]);
                setIsNewGPOpen(true);
              }}
              className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] shadow-sm transition cursor-pointer"
            >
              + New Gate Pass
            </button>
          )}
        </div>
      </div>

      {/* Info notice */}
      <div className="p-3 bg-amber-50 border border-amber-300 rounded text-xs text-amber-900 flex items-center justify-between">
        <div>
          <strong>Note:</strong> Sub-contractor tools returned via Security Gate Pass are permanently
          removed from active inventory to ensure accuracy of fleet numbers.
        </div>
        <div className="font-bold">
          {subConToolsAtBase.length} Sub-Con Tool(s) at Base
        </div>
      </div>

      {/* Toolbar: Expand/Collapse All & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const all: Record<string, boolean> = {};
              filteredGatePasses.forEach((gp) => {
                all[gp.id] = true;
              });
              setOpenGPKeys(all);
            }}
            className="px-2.5 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
          >
            ▼ Expand All
          </button>
          <button
            type="button"
            onClick={() => setOpenGPKeys({})}
            className="px-2.5 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
          >
            ▲ Collapse All
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search GP #, supplier, authorized by..."
          className="bg-white border border-[#b8c9db] rounded px-3 py-1 text-xs w-64 outline-none font-medium focus:ring-1 focus:ring-amber-400"
        />
      </div>

      {/* Gate Pass Table (Default Collapsed with Expandable Tool Manifests) */}
      <div className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold select-none">
              <tr>
                <th
                  onClick={() => handleSortToggle('gpNumber')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                >
                  GP Number {sortField === 'gpNumber' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('supplier')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                >
                  Supplier / Vendor {sortField === 'supplier' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('date')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                >
                  Date {sortField === 'date' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3 py-2 text-center">Tools Returned</th>
                <th className="px-3 py-2">Prepared By</th>
                <th className="px-3 py-2">Authorized By</th>
                <th className="px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {filteredGatePasses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 font-medium">
                    No security gate passes issued yet.
                  </td>
                </tr>
              ) : (
                filteredGatePasses.map((gp) => {
                  return (
                    <tr
                      key={gp.id}
                      className="hover:bg-blue-50/40 transition cursor-pointer"
                      onClick={() => setSelectedGPDetail(gp)}
                      title="Click to view full Gate Pass window and released tools"
                    >
                      <td className="px-3 py-2 font-mono font-bold text-slate-900 hover:text-blue-700 transition">
                        <button
                          type="button"
                          onClick={() => setSelectedGPDetail(gp)}
                          className="font-mono font-bold text-slate-900 hover:text-blue-700 underline decoration-slate-300 cursor-pointer"
                        >
                          {gp.gpNumber}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-900">{gp.supplier}</td>
                      <td className="px-3 py-2 font-mono text-slate-700">{formatDateDDMMYY(gp.gpDate)}</td>
                      <td className="px-3 py-2 font-mono font-bold text-center">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold border border-slate-200">
                          {gp.toolLines?.length || 0}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{gp.preparedBy}</td>
                      <td className="px-3 py-2 text-slate-700">{gp.authorizedBy || '—'}</td>
                      <td className="px-3 py-2 text-center space-x-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedGPDetail(gp)}
                          className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[11px] border border-blue-200 cursor-pointer transition shadow-2xs"
                          title="Open full gate pass details window"
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintGP(gp)}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-medium border border-slate-300 cursor-pointer transition"
                        >
                          Print
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

      {/* New Gate Pass Modal */}
      {isNewGPOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNewGPOpen(false);
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-bold text-sm">Issue Security Gate Pass</h3>
                <div className="text-[11px] text-slate-300">
                  Select sub-contractor supplier to return physical rental tools
                </div>
              </div>
              <button
                onClick={() => setIsNewGPOpen(false)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateGPSubmit} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1 text-slate-800">Gate Pass Purpose / Type *</label>
                <select
                  value={gpType}
                  onChange={(e) => {
                    const chosen = e.target.value as any;
                    setGpType(chosen);
                    setSelectedSupplier('');
                    setCheckedToolIds([]);
                  }}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-bold text-xs bg-slate-50 text-slate-900 shadow-2xs focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Return Third-Party Tool (Permanent)">
                    1. Return Third-Party Tool to Supplier (Permanent Outbound - Removes from Fleet)
                  </option>
                  <option value="Dispatch for Repair / Maintenance (Returnable)">
                    2. Dispatch Tools to Third Party for Repair &amp; Maintenance (Returnable Outbound)
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">
                    {gpType === 'Return Third-Party Tool (Permanent)' ? 'Select Sub-Contractor Supplier *' : 'Select Workshop / Service Vendor *'}
                  </label>
                  <select
                    required
                    value={selectedSupplier}
                    onChange={(e) => {
                      setSelectedSupplier(e.target.value);
                      setCheckedToolIds([]);
                    }}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="">— {gpType === 'Return Third-Party Tool (Permanent)' ? 'Select supplier' : 'Select vendor / machine shop'} —</option>
                    {availableSuppliers.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">Gate Pass Number *</label>
                  <input
                    type="text"
                    required
                    value={newGpNumber || nextGpNumber}
                    onChange={(e) => setNewGpNumber(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono font-bold text-amber-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Gate Pass Release Date</label>
                  <input
                    type="date"
                    value={newGpDate}
                    onChange={(e) => setNewGpDate(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Authorized By</label>
                  <input
                    type="text"
                    value={newAuthorizedBy}
                    onChange={(e) => setNewAuthorizedBy(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
              </div>

              {/* Tools list for selected supplier */}
              <div className="space-y-2 border-t pt-3">
                <div className="font-bold text-slate-700">
                  Select Tools to Return ({toolsForSupplier.length} available)
                </div>

                {toolsForSupplier.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded border border-slate-200 text-center text-slate-400">
                    {selectedSupplier
                      ? `No tools from ${selectedSupplier} currently stored at base.`
                      : 'Please choose a supplier above.'}
                  </div>
                ) : (
                  <div className="border border-[#b8c9db] rounded overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold">
                        <tr>
                          <th className="px-2.5 py-1.5 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={
                                toolsForSupplier.length > 0 &&
                                toolsForSupplier.every((t) => checkedToolIds.includes(t.id))
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCheckedToolIds(toolsForSupplier.map((t) => t.id));
                                } else {
                                  setCheckedToolIds([]);
                                }
                              }}
                            />
                          </th>
                          <th className="px-2.5 py-1.5">Supplier Serial</th>
                          <th className="px-2.5 py-1.5">Size</th>
                          <th className="px-2.5 py-1.5">Tool Category</th>
                          <th className="px-2.5 py-1.5">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {toolsForSupplier.map((t) => {
                          const isChecked = checkedToolIds.includes(t.id);
                          return (
                            <tr key={t.id} className="hover:bg-slate-50">
                              <td className="px-2.5 py-1.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setCheckedToolIds(checkedToolIds.filter((id) => id !== t.id));
                                    } else {
                                      setCheckedToolIds([...checkedToolIds, t.id]);
                                    }
                                  }}
                                />
                              </td>
                              <td className="px-2.5 py-1.5 font-mono font-bold text-amber-900">{t.serial}</td>
                              <td className="px-2.5 py-1.5 font-mono">{t.size}</td>
                              <td className="px-2.5 py-1.5 font-bold text-[#1a3055]">{t.shortDesc}</td>
                              <td className="px-2.5 py-1.5 text-slate-600 max-w-xs truncate">{t.desc}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold mb-1">
                  {gpType === 'Return Third-Party Tool (Permanent)' ? 'Remarks & Reason for Return' : 'Scope of Work & Repair Instructions'}
                </label>
                <textarea
                  rows={2}
                  placeholder={
                    gpType === 'Return Third-Party Tool (Permanent)'
                      ? 'e.g. End of rental campaign; return to supplier yard.'
                      : 'e.g. Redress seals, hardbanding re-application, magnetic particle inspection, calibrate...'
                  }
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5"
                />
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsNewGPOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 rounded text-white font-bold shadow-sm cursor-pointer ${
                    gpType === 'Return Third-Party Tool (Permanent)'
                      ? 'bg-rose-700 hover:bg-rose-800'
                      : 'bg-blue-700 hover:bg-blue-800'
                  }`}
                >
                  {gpType === 'Return Third-Party Tool (Permanent)'
                    ? 'Confirm & Remove from Fleet →'
                    : 'Confirm & Dispatch for Repair (Returnable) →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GP Detail Window (Full Detail Modal matching Delivery Tickets) */}
      {selectedGPDetail && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedGPDetail(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-3.5 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base tracking-wide text-white">
                    Security Gate Pass: <span className="text-amber-400 font-mono">{selectedGPDetail.gpNumber}</span>
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                    ✓ Released &amp; Dispatched
                  </span>
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  Supplier <span className="font-bold text-white">{selectedGPDetail.supplier}</span> &bull; Release Date <span className="font-mono text-white">{formatDateDDMMYY(selectedGPDetail.gpDate)}</span> &bull; Prepared by <span className="font-medium text-white">{selectedGPDetail.preparedBy}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintGP(selectedGPDetail)}
                  className="px-2.5 py-1 rounded text-xs font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 cursor-pointer transition"
                  title="Print Security Gate Pass"
                >
                  Print Gate Pass
                </button>
                <button
                  onClick={() => setSelectedGPDetail(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 text-xl font-bold transition cursor-pointer"
                  title="Close Window (Esc)"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Metadata Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Gate Pass #</span>
                  <span className="font-bold text-[#1a3055] text-xs font-mono">{selectedGPDetail.gpNumber}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Supplier / Vendor</span>
                  <span className="font-bold text-slate-900 text-xs">{selectedGPDetail.supplier}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Release Date</span>
                  <span className="font-mono text-slate-700 text-xs">{formatDateDDMMYY(selectedGPDetail.gpDate)}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Prepared By</span>
                  <span className="font-medium text-slate-800 text-xs">{selectedGPDetail.preparedBy}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Authorized By</span>
                  <span className="font-medium text-slate-800 text-xs">{selectedGPDetail.authorizedBy || '—'}</span>
                </div>
              </div>

              {/* Tools Manifest */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-[#1a3055]">
                    Released Rental Tools ({selectedGPDetail.toolLines?.length || 0} Tools)
                  </h4>
                  <div className="text-[11px] text-slate-500">
                    Destination: <strong className="text-slate-800">{selectedGPDetail.supplier} Facility</strong> &bull; Status: <strong className="text-rose-700">De-inventoried</strong>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-[#1a3055] font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 w-12 text-center">#</th>
                        <th className="px-3 py-2">Supplier Serial / ID</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">Tool Category / Description</th>
                        <th className="px-3 py-2">Condition Upon Return</th>
                        <th className="px-3 py-2 text-center">Disposition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedGPDetail.toolLines.map((t, i) => (
                        <tr key={i} className="hover:bg-slate-50/80">
                          <td className="px-3 py-2 text-center text-slate-400 font-mono">{i + 1}</td>
                          <td className="px-3 py-2 font-mono font-bold text-slate-900">{t.serial}</td>
                          <td className="px-3 py-2 font-mono font-medium">{t.size}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{t.shortDesc}</td>
                          <td className="px-3 py-2 text-slate-600">{t.condition || 'Good Condition'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Returned &amp; Released
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Remarks / Authorization Notice */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                <span className="font-bold text-slate-700 block">Gate Security Authorization Signoff:</span>
                <p className="text-slate-600 font-normal leading-relaxed">
                  These rental tools have been verified, released through the security checkpoint, and dispatched back to {selectedGPDetail.supplier}. No company liability remains upon physical release.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center flex-shrink-0 text-xs">
              <button
                type="button"
                onClick={() => handlePrintGP(selectedGPDetail)}
                className="px-3 py-1.5 rounded bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 cursor-pointer transition"
              >
                Print Gate Pass
              </button>
              <button
                type="button"
                onClick={() => setSelectedGPDetail(null)}
                className="px-4 py-1.5 rounded bg-slate-700 text-white font-bold hover:bg-slate-800 cursor-pointer transition"
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
