import React, { useState, useMemo } from 'react';
import { InspectionRecord, MaintenanceRecord, ToolItem, User } from '../types';

interface InspectionViewProps {
  user?: User | null;
  inspections: InspectionRecord[];
  inventory: ToolItem[];
  maintenance: MaintenanceRecord[];
  onUpdateInspection: (
    insId: string,
    updates: Partial<InspectionRecord>,
    newMaintenanceWO?: MaintenanceRecord
  ) => void;
}

export const InspectionView: React.FC<InspectionViewProps> = ({
  user,
  inspections,
  inventory,
  maintenance,
  onUpdateInspection,
}) => {
  const [tab, setTab] = useState<'pending' | 'complete'>('pending');
  const [search, setSearch] = useState('');
  const [editingInspection, setEditingInspection] = useState<InspectionRecord | null>(null);

  // Form State
  const [inspectorName, setInspectorName] = useState(user?.name || 'QC Inspector');
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [result, setResult] = useState<'Pass' | 'Fail'>('Pass');
  const [disposition, setDisposition] = useState<'Return to Base' | 'Repair' | 'Redress' | 'Scrap'>('Return to Base');
  const [reportNumber, setReportNumber] = useState('');
  const [notes, setNotes] = useState('');

  const filteredInspections = useMemo(() => {
    return inspections.filter((i) => {
      const isPending = i.status === 'Pending';
      if (tab === 'pending' && !isPending) return false;
      if (tab === 'complete' && isPending) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const full = `${i.woNumber} ${i.serial} ${i.shortDesc} ${i.rtNumber || ''} ${i.inspector || ''}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [inspections, tab, search]);

  const openUpdateModal = (ins: InspectionRecord) => {
    setEditingInspection(ins);
    setInspectorName(user?.name || 'QC Inspector');
    setInspectionDate(new Date().toISOString().split('T')[0]);
    setResult(ins.status === 'Fail' ? 'Fail' : 'Pass');
    setDisposition(ins.disposition as any || 'Return to Base');
    setReportNumber(ins.reportNumber || `RPT-${Date.now().toString().slice(-6)}`);
    setNotes(ins.notes || '');
  };

  const handleSaveInspectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInspection) return;

    let newMntWO: MaintenanceRecord | undefined;

    if (result === 'Fail') {
      const curYr = new Date().getFullYear().toString().slice(-2);
      const mntNums = maintenance
        .map((m) => {
          const match = m.woNumber.match(/^WO-MNT-\d+-(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((n) => !isNaN(n));
      const nextSeq = mntNums.length > 0 ? Math.max(...mntNums) + 1 : 1;
      const mntId = `MNT-${curYr}-${String(nextSeq).padStart(5, '0')}`;
      const woNum = `WO-MNT-${curYr}-${String(nextSeq).padStart(5, '0')}`;

      newMntWO = {
        id: mntId,
        woNumber: woNum,
        serial: editingInspection.serial,
        assetNo: editingInspection.assetNo,
        shortDesc: editingInspection.shortDesc,
        size: editingInspection.size,
        fromInspectionId: editingInspection.id,
        issue: `Failed QC Inspection — Disposition: ${disposition}. Notes: ${notes || 'None'}`,
        type: 'InHouse',
        vendor: '',
        assignedTo: 'Nihas',
        startDate: inspectionDate,
        estCompleteDate: null,
        completedDate: null,
        status: 'In Progress',
        cost: null,
        notes,
      };
    }

    onUpdateInspection(
      editingInspection.id,
      {
        inspector: inspectorName.trim() || user?.name || 'QC Inspector',
        inspectionDate,
        status: result === 'Pass' ? 'Pass' : 'Fail',
        disposition: result === 'Pass' ? 'Return to Base' : disposition,
        reportNumber: reportNumber.trim(),
        notes: notes.trim(),
      },
      newMntWO
    );

    setEditingInspection(null);
  };

  return (
    <div className="space-y-4">
      {/* Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-medium">Quality Assurance</div>
          <h1 className="text-base font-bold text-[#1a3055]">QC Inspection Bay</h1>
        </div>
        <div className="text-slate-500 text-xs font-bold">
          {inspections.filter((i) => i.status === 'Pending').length} Pending Inspection(s)
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-white rounded border border-[#b8c9db] p-0.5">
          <button
            onClick={() => setTab('pending')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'pending' ? 'bg-[#1a3055] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⏳ Pending QC ({inspections.filter((i) => i.status === 'Pending').length})
          </button>
          <button
            onClick={() => setTab('complete')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'complete' ? 'bg-[#1a3055] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ✅ Completed ({inspections.filter((i) => i.status !== 'Pending').length})
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search WO #, serial, category, report..."
          className="bg-white border border-[#b8c9db] rounded px-3 py-1 text-xs w-64 outline-none font-medium focus:ring-1 focus:ring-amber-400"
        />
      </div>

      {/* Inspection Table */}
      <div className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold">
              <tr>
                <th className="px-3 py-2">WO Number</th>
                <th className="px-3 py-2">Serial</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Tool Type</th>
                <th className="px-3 py-2">From RT</th>
                <th className="px-3 py-2">Received Date</th>
                <th className="px-3 py-2">Inspector</th>
                <th className="px-3 py-2">QC Result</th>
                <th className="px-3 py-2">Disposition</th>
                {user?.role !== 'Viewer' && <th className="px-3 py-2 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {filteredInspections.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500 font-medium">
                    No inspection records in this view.
                  </td>
                </tr>
              ) : (
                filteredInspections.map((i) => (
                  <tr key={i.id} className="hover:bg-[#e4eef8] transition">
                    <td className="px-3 py-2 font-mono font-bold text-amber-900">{i.woNumber}</td>
                    <td className="px-3 py-2 font-mono font-bold text-blue-700">{i.serial}</td>
                    <td className="px-3 py-2 font-mono">{i.size}</td>
                    <td className="px-3 py-2 font-semibold text-[#1a3055]">{i.shortDesc}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{i.rtNumber || '—'}</td>
                    <td className="px-3 py-2 font-mono">{i.receivedDate}</td>
                    <td className="px-3 py-2">{i.inspector || '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          i.status === 'Pass'
                            ? 'bg-emerald-100 text-emerald-800'
                            : i.status === 'Fail'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {i.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{i.disposition || '—'}</td>
                    {user?.role !== 'Viewer' && (
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => openUpdateModal(i)}
                          className="px-2.5 py-1 rounded bg-[#ffd875] text-[#4a2e00] font-bold text-[10px] hover:brightness-105 cursor-pointer"
                        >
                          Update QC
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Update Inspection Modal */}
      {editingInspection && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingInspection(null);
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm">Update Inspection: {editingInspection.woNumber}</h3>
                <div className="text-[11px] text-slate-300">
                  {editingInspection.serial} &bull; {editingInspection.size} {editingInspection.shortDesc}
                </div>
              </div>
              <button
                onClick={() => setEditingInspection(null)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveInspectionSubmit} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Inspector Name *</label>
                  <input
                    type="text"
                    required
                    value={inspectorName}
                    onChange={(e) => setInspectorName(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Inspection Date</label>
                  <input
                    type="date"
                    value={inspectionDate}
                    onChange={(e) => setInspectionDate(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">QC Result *</label>
                  <select
                    value={result}
                    onChange={(e) => {
                      const res = e.target.value as 'Pass' | 'Fail';
                      setResult(res);
                      if (res === 'Pass') setDisposition('Return to Base');
                      else setDisposition('Repair');
                    }}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="Pass">Pass (Return to Base as Good)</option>
                    <option value="Fail">Fail (Send to Workshop)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">Disposition Action</label>
                  <select
                    disabled={result === 'Pass'}
                    value={disposition}
                    onChange={(e) => setDisposition(e.target.value as any)}
                    className="w-full border rounded px-2.5 py-1.5 font-bold disabled:bg-slate-100"
                  >
                    {result === 'Pass' ? (
                      <option value="Return to Base">Return to Base as Good</option>
                    ) : (
                      <>
                        <option value="Repair">Send for Repair</option>
                        <option value="Redress">Send for Redress Overhaul</option>
                        <option value="Scrap">Scrap / Decommission</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Auto-Generated Report Number</label>
                <input
                  type="text"
                  value={reportNumber}
                  onChange={(e) => setReportNumber(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Inspection Findings &amp; Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Dimensions verified to API spec 7-1, MPI magnetic particle inspection clean."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5"
                />
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingInspection(null)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-sm cursor-pointer"
                >
                  Save QC Record &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
