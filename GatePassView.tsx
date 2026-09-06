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

  // Sub-contractor tools at base
  const subConToolsAtBase = useMemo(() => {
    return inventory.filter(
      (t) =>
        !t.isEmdad &&
        t.status !== 'Removed' &&
        ['Emdad Base', 'Base', 'Our Base'].includes(t.location)
    );
  }, [inventory]);

  // Suppliers available
  const availableSuppliers = useMemo(() => {
    return Array.from(new Set(subConToolsAtBase.map((t) => t.ownership).filter(Boolean))).sort();
  }, [subConToolsAtBase]);

  // Tools for selected supplier
  const toolsForSupplier = useMemo(() => {
    if (!selectedSupplier) return [];
    return subConToolsAtBase.filter((t) => t.ownership === selectedSupplier);
  }, [subConToolsAtBase, selectedSupplier]);

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
                <th className="px-2 py-2 w-8 text-center"></th>
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
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">
                    No security gate passes issued yet.
                  </td>
                </tr>
              ) : (
                filteredGatePasses.map((gp) => {
                  const isOpen = Boolean(openGPKeys[gp.id]);

                  return (
                    <React.Fragment key={gp.id}>
                      <tr
                        className={`transition cursor-pointer ${
                          isOpen ? 'bg-[#edf4fb]' : 'hover:bg-[#f3f7fb]'
                        }`}
                        onClick={() =>
                          setOpenGPKeys((prev) => ({
                            ...prev,
                            [gp.id]: !prev[gp.id],
                          }))
                        }
                      >
                        <td className="px-2 py-2 text-center text-slate-400 font-bold">
                          {isOpen ? '▲' : '▼'}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-amber-900">{gp.gpNumber}</td>
                        <td className="px-3 py-2 font-bold text-[#1a3055]">{gp.supplier}</td>
                        <td className="px-3 py-2 font-mono">{formatDateDDMMYY(gp.gpDate)}</td>
                        <td className="px-3 py-2 font-mono font-bold text-center">{gp.toolLines.length}</td>
                        <td className="px-3 py-2">{gp.preparedBy}</td>
                        <td className="px-3 py-2">{gp.authorizedBy || '—'}</td>
                        <td className="px-3 py-2 text-center space-x-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedGPDetail(gp)}
                            className="text-blue-700 hover:underline font-bold text-[11px] cursor-pointer"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handlePrintGP(gp)}
                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-bold border border-slate-300 cursor-pointer"
                          >
                            🖨 Print
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={8} className="p-4 border-t border-b border-slate-200">
                            <div className="space-y-2">
                              <div className="font-bold text-[#1a3055] text-xs">
                                Returned Tools to {gp.supplier} under {gp.gpNumber}
                              </div>
                              <div className="border border-[#b8c9db] rounded overflow-hidden bg-white">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead className="bg-[#eef3f9] text-[#1a3055] font-bold border-b border-[#b8c9db]">
                                    <tr>
                                      <th className="px-3 py-1.5 w-10">#</th>
                                      <th className="px-3 py-1.5">Serial / ID</th>
                                      <th className="px-3 py-1.5">Size</th>
                                      <th className="px-3 py-1.5">Tool Category</th>
                                      <th className="px-3 py-1.5">Owner Vendor</th>
                                      <th className="px-3 py-1.5 text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200">
                                    {gp.toolLines.map((t, i) => (
                                      <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-3 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                                        <td className="px-3 py-1.5 font-mono font-bold text-amber-900">{t.serial}</td>
                                        <td className="px-3 py-1.5 font-mono">{t.size}</td>
                                        <td className="px-3 py-1.5 font-semibold text-slate-800">{t.shortDesc}</td>
                                        <td className="px-3 py-1.5 text-slate-600 font-bold">{t.ownership}</td>
                                        <td className="px-3 py-1.5 text-center">
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                            Returned &amp; De-inventoried
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {gp.notes && (
                                <div className="text-[11px] text-slate-600 p-2 bg-slate-100 rounded border border-slate-200">
                                  <strong>Gate Pass Remarks:</strong> {gp.notes}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Select Sub-Contractor Supplier *</label>
                  <select
                    required
                    value={selectedSupplier}
                    onChange={(e) => {
                      setSelectedSupplier(e.target.value);
                      setCheckedToolIds([]);
                    }}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="">— Select supplier —</option>
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
                <label className="block font-bold mb-1">Remarks &amp; Reason for Return</label>
                <textarea
                  rows={2}
                  placeholder="e.g. End of rental campaign; return to supplier yard."
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
                  className="px-4 py-1.5 rounded bg-rose-700 text-white font-bold hover:bg-rose-800 shadow-sm cursor-pointer"
                >
                  Confirm &amp; Remove from Fleet &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GP Detail Modal */}
      {selectedGPDetail && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedGPDetail(null);
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-bold text-sm">Gate Pass: {selectedGPDetail.gpNumber}</h3>
                <div className="text-[11px] text-slate-300">
                  {selectedGPDetail.supplier} &bull; Date {selectedGPDetail.gpDate}
                </div>
              </div>
              <button
                onClick={() => setSelectedGPDetail(null)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Supplier:</span>
                  <span className="font-bold text-[#1a3055]">{selectedGPDetail.supplier}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Release Date:</span>
                  <span>{selectedGPDetail.gpDate}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Prepared By:</span>
                  <span>{selectedGPDetail.preparedBy}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Authorized By:</span>
                  <span>{selectedGPDetail.authorizedBy || '—'}</span>
                </div>
              </div>

              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-[#24476b] border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-2.5 py-1.5 w-10">#</th>
                      <th className="px-2.5 py-1.5">Supplier Serial</th>
                      <th className="px-2.5 py-1.5">Size</th>
                      <th className="px-2.5 py-1.5">Tool Category</th>
                      <th className="px-2.5 py-1.5">Condition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedGPDetail.toolLines.map((t, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-2.5 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                        <td className="px-2.5 py-1.5 font-mono font-bold text-amber-900">{t.serial}</td>
                        <td className="px-2.5 py-1.5 font-mono">{t.size}</td>
                        <td className="px-2.5 py-1.5 font-semibold text-[#1a3055]">{t.shortDesc}</td>
                        <td className="px-2.5 py-1.5 text-slate-600">{t.condition || 'Good'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-[#b8c9db] flex justify-between items-center flex-shrink-0 text-xs">
              <button
                onClick={() => handlePrintGP(selectedGPDetail)}
                className="px-3 py-1.5 rounded bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 cursor-pointer"
              >
                🖨 Print Gate Pass
              </button>
              <button
                onClick={() => setSelectedGPDetail(null)}
                className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] cursor-pointer"
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
