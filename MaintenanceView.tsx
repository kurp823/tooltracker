import React, { useState, useMemo } from 'react';
import { MaintenanceRecord, ToolItem, User } from '../types';

interface MaintenanceViewProps {
  user?: User | null;
  maintenance: MaintenanceRecord[];
  inventory: ToolItem[];
  onSaveMaintenance: (record: MaintenanceRecord) => void;
  onDispatchToVendor?: (
    mId: string,
    vendorName: string,
    vendorPoRef: string,
    vendorQuoteRef: string,
    estCost: number | null,
    dispatchDate: string,
    repairScope: string,
    notes: string
  ) => void;
  onReceiveFromVendor?: (
    mId: string,
    receivedDate: string,
    vendorInvoiceRef: string,
    actualCost: number | null,
    partsReplaced: string,
    notes: string
  ) => void;
  onRouteToQC?: (mId: string, notes?: string) => void;
  onCompleteMaintenance: (
    mId: string,
    completedDate: string,
    cost: number | null,
    notes: string,
    destination?: 'Base' | 'QC'
  ) => void;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  user,
  maintenance,
  inventory,
  onSaveMaintenance,
  onDispatchToVendor,
  onReceiveFromVendor,
  onRouteToQC,
  onCompleteMaintenance,
}) => {
  const [tab, setTab] = useState<'active' | 'vendor' | 'ready_qc' | 'completed'>('active');
  const [search, setSearch] = useState('');
  const [isNewMntOpen, setIsNewMntOpen] = useState(false);

  // Modals
  const [dispatchModalRecord, setDispatchModalRecord] = useState<MaintenanceRecord | null>(null);
  const [receiveModalRecord, setReceiveModalRecord] = useState<MaintenanceRecord | null>(null);
  const [completeModalRecord, setCompleteModalRecord] = useState<MaintenanceRecord | null>(null);

  // New Mnt Form
  const [selectedToolId, setSelectedToolId] = useState('');
  const [newType, setNewType] = useState<'InHouse' | 'Vendor'>('InHouse');
  const [newVendor, setNewVendor] = useState('');
  const [newVendorPo, setNewVendorPo] = useState('');
  const [newVendorQuote, setNewVendorQuote] = useState('');
  const [newAssignedTo, setNewAssignedTo] = useState('Nihas');
  const [newIssue, setNewIssue] = useState('');
  const [newRepairScope, setNewRepairScope] = useState('');
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEstDate, setNewEstDate] = useState('');
  const [newEstCost, setNewEstCost] = useState<number | ''>('');

  // Dispatch to Vendor Form
  const [dispVendor, setDispVendor] = useState('');
  const [dispPoRef, setDispPoRef] = useState('');
  const [dispQuoteRef, setDispQuoteRef] = useState('');
  const [dispEstCost, setDispEstCost] = useState<number | ''>('');
  const [dispDate, setDispDate] = useState(new Date().toISOString().split('T')[0]);
  const [dispScope, setDispScope] = useState('');
  const [dispNotes, setDispNotes] = useState('');

  // Receive from Vendor Form
  const [recDate, setRecDate] = useState(new Date().toISOString().split('T')[0]);
  const [recInvoiceRef, setRecInvoiceRef] = useState('');
  const [recActualCost, setRecActualCost] = useState<number | ''>('');
  const [recParts, setRecParts] = useState('');
  const [recNotes, setRecNotes] = useState('');

  // Complete Form
  const [completeDate, setCompleteDate] = useState(new Date().toISOString().split('T')[0]);
  const [completeCost, setCompleteCost] = useState<number | ''>('');
  const [completeDestination, setCompleteDestination] = useState<'Base' | 'QC'>('QC');
  const [completeNotes, setCompleteNotes] = useState('');

  const nextWoNumber = useMemo(() => {
    const curYr = new Date().getFullYear().toString().slice(-2);
    const mntNums = maintenance
      .map((m) => {
        const match = m.woNumber.match(/^WO-MNT-\d+-(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextSeq = mntNums.length > 0 ? Math.max(...mntNums) + 1 : 1;
    return `WO-MNT-${curYr}-${String(nextSeq).padStart(5, '0')}`;
  }, [maintenance]);

  const [sortField, setSortField] = useState<'woNumber' | 'serial' | 'date' | 'cost'>('woNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const extractWOSeq = (woStr: string) => {
    const m = woStr.match(/\d+$/);
    return m ? parseInt(m[0], 10) : 0;
  };

  const handleSortToggle = (field: 'woNumber' | 'serial' | 'date' | 'cost') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredMaintenance = useMemo(() => {
    const list = maintenance.filter((m) => {
      if (tab === 'active' && m.status === 'Completed') return false;
      if (tab === 'vendor' && (m.type !== 'Vendor' || m.status === 'Completed')) return false;
      if (tab === 'ready_qc' && m.status !== 'Ready for QC') return false;
      if (tab === 'completed' && m.status !== 'Completed') return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const full = `${m.woNumber} ${m.serial} ${m.shortDesc} ${m.issue} ${m.vendor || ''} ${m.vendorPoRef || ''} ${m.assignedTo}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      let diff = 0;
      if (sortField === 'woNumber') {
        diff = extractWOSeq(a.woNumber) - extractWOSeq(b.woNumber);
      } else if (sortField === 'serial') {
        diff = a.serial.localeCompare(b.serial);
      } else if (sortField === 'date') {
        diff = (a.startDate || '').localeCompare(b.startDate || '');
      } else if (sortField === 'cost') {
        const costA = a.actualCost || a.estimatedCost || 0;
        const costB = b.actualCost || b.estimatedCost || 0;
        diff = costA - costB;
      }
      return sortOrder === 'desc' ? -diff : diff;
    });
  }, [maintenance, tab, search, sortField, sortOrder]);

  const handleCreateMntSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedToolId) {
      alert('Please select a tool.');
      return;
    }
    const tool = inventory.find((t) => t.id === selectedToolId);
    if (!tool) return;

    const curYr = new Date().getFullYear().toString().slice(-2);
    const mntNums = maintenance
      .map((m) => {
        const match = m.woNumber.match(/^WO-MNT-\d+-(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextSeq = mntNums.length > 0 ? Math.max(...mntNums) + 1 : 1;
    const mntId = `MNT-${curYr}-${String(nextSeq).padStart(5, '0')}`;

    const newMnt: MaintenanceRecord = {
      id: mntId,
      woNumber: nextWoNumber,
      serial: tool.serial,
      assetNo: tool.assetNo || tool.serial,
      shortDesc: tool.shortDesc,
      size: tool.size,
      fromInspectionId: null,
      issue: newIssue.trim() || 'General maintenance and redress',
      type: newType,
      vendor: newType === 'Vendor' ? newVendor.trim() : '',
      vendorPoRef: newType === 'Vendor' ? newVendorPo.trim() : undefined,
      vendorQuoteRef: newType === 'Vendor' ? newVendorQuote.trim() : undefined,
      repairScope: newRepairScope.trim() || undefined,
      assignedTo: newAssignedTo.trim() || 'Workshop Team',
      startDate: newStartDate,
      dispatchToVendorDate: newType === 'Vendor' ? newStartDate : null,
      estCompleteDate: newEstDate || null,
      completedDate: null,
      status: newType === 'Vendor' ? 'Sent to Vendor' : 'In Progress',
      stage: newType === 'Vendor' ? 'Dispatched to Vendor' : 'Workshop',
      cost: null,
      estCost: newEstCost === '' ? null : Number(newEstCost),
      notes: '',
    };

    onSaveMaintenance(newMnt);
    setIsNewMntOpen(false);
    setSelectedToolId('');
    setNewIssue('');
    setNewRepairScope('');
    setNewVendor('');
    setNewVendorPo('');
    setNewVendorQuote('');
    setNewEstCost('');
  };

  const openDispatchModal = (m: MaintenanceRecord) => {
    setDispatchModalRecord(m);
    setDispVendor(m.vendor || 'MOTORMAX');
    setDispPoRef(m.vendorPoRef || `PO-REP-${Date.now().toString().slice(-5)}`);
    setDispQuoteRef(m.vendorQuoteRef || '');
    setDispEstCost(m.estCost || 1200);
    setDispDate(new Date().toISOString().split('T')[0]);
    setDispScope(m.repairScope || m.issue || 'Third-party overhaul, seal replacement & pressure testing');
    setDispNotes(m.notes || '');
  };

  const handleDispatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchModalRecord) return;
    if (onDispatchToVendor) {
      onDispatchToVendor(
        dispatchModalRecord.id,
        dispVendor.trim(),
        dispPoRef.trim(),
        dispQuoteRef.trim(),
        dispEstCost === '' ? null : Number(dispEstCost),
        dispDate,
        dispScope.trim(),
        dispNotes.trim()
      );
    }
    setDispatchModalRecord(null);
  };

  const openReceiveModal = (m: MaintenanceRecord) => {
    setReceiveModalRecord(m);
    setRecDate(new Date().toISOString().split('T')[0]);
    setRecInvoiceRef(m.vendorInvoiceRef || `INV-${m.vendor ? m.vendor.slice(0, 3).toUpperCase() : 'VND'}-${Date.now().toString().slice(-4)}`);
    setRecActualCost(m.cost || m.estCost || 1200);
    setRecParts(m.partsReplaced || 'Complete seal kit, washpipe, mandrel hardfacing');
    setRecNotes(m.notes || 'Received back from vendor repair facility. Pressure tested & certified.');
  };

  const handleReceiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveModalRecord) return;
    if (onReceiveFromVendor) {
      onReceiveFromVendor(
        receiveModalRecord.id,
        recDate,
        recInvoiceRef.trim(),
        recActualCost === '' ? null : Number(recActualCost),
        recParts.trim(),
        recNotes.trim()
      );
    }
    setReceiveModalRecord(null);
  };

  const openCompleteModal = (m: MaintenanceRecord) => {
    setCompleteModalRecord(m);
    setCompleteDate(new Date().toISOString().split('T')[0]);
    setCompleteCost(m.cost !== null && m.cost !== undefined ? m.cost : (m.estCost || 0));
    setCompleteDestination('QC');
    setCompleteNotes(m.notes || 'Maintenance/redress completed. Ready for QC inspection sign-off.');
  };

  const handleCompleteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeModalRecord) return;
    onCompleteMaintenance(
      completeModalRecord.id,
      completeDate,
      completeCost === '' ? null : Number(completeCost),
      completeNotes.trim(),
      completeDestination
    );
    setCompleteModalRecord(null);
  };

  return (
    <div className="space-y-4">
      {/* Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div>
          <div className="text-[11px] text-slate-500 font-medium">Workshop &amp; Vendor Services</div>
          <h1 className="text-base font-bold text-[#1a3055]">Maintenance, Redress &amp; 3rd Party Repairs</h1>
        </div>
        {user?.role !== 'Viewer' && (
          <button
            onClick={() => setIsNewMntOpen(true)}
            className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] shadow-xs transition cursor-pointer"
          >
            + New Maintenance Order
          </button>
        )}
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-white rounded border border-[#b8c9db] p-0.5">
          <button
            onClick={() => setTab('active')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'active' ? 'bg-[#1a3055] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active Orders ({maintenance.filter((m) => m.status !== 'Completed').length})
          </button>
          <button
            onClick={() => setTab('vendor')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'vendor' ? 'bg-[#1a3055] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🏢 3rd Party Vendor ({maintenance.filter((m) => m.type === 'Vendor' && m.status !== 'Completed').length})
          </button>
          <button
            onClick={() => setTab('ready_qc')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'ready_qc' ? 'bg-[#1a3055] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🔍 Ready for QC ({maintenance.filter((m) => m.status === 'Ready for QC').length})
          </button>
          <button
            onClick={() => setTab('completed')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'completed' ? 'bg-[#1a3055] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Completed ({maintenance.filter((m) => m.status === 'Completed').length})
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search WO #, serial, issue, vendor, PO #..."
          className="bg-white border border-[#b8c9db] rounded px-3 py-1 text-xs w-72 outline-none font-medium focus:ring-1 focus:ring-amber-400"
        />
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-[#1a3055] text-white font-bold uppercase tracking-wider text-[10px] select-none">
              <tr>
                <th
                  onClick={() => handleSortToggle('woNumber')}
                  className="px-3 py-2 cursor-pointer hover:bg-[#24426d]"
                >
                  WO Number {sortField === 'woNumber' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('serial')}
                  className="px-3 py-2 cursor-pointer hover:bg-[#24426d]"
                >
                  Serial / Asset {sortField === 'serial' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3 py-2">Size &amp; Type</th>
                <th className="px-3 py-2">Work Scope / Issue</th>
                <th className="px-3 py-2">Channel / Vendor</th>
                <th className="px-3 py-2">PO / Quote Ref</th>
                <th
                  onClick={() => handleSortToggle('date')}
                  className="px-3 py-2 cursor-pointer hover:bg-[#24426d]"
                >
                  Dates {sortField === 'date' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3 py-2">Status</th>
                <th
                  onClick={() => handleSortToggle('cost')}
                  className="px-3 py-2 text-right cursor-pointer hover:bg-[#24426d]"
                >
                  Cost (AED) {sortField === 'cost' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                {user?.role !== 'Viewer' && <th className="px-3 py-2 text-center">Actions &amp; Workflow</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {filteredMaintenance.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500 font-medium">
                    No maintenance records found.
                  </td>
                </tr>
              ) : (
                filteredMaintenance.map((m) => {
                  const isSentToVendor = m.status === 'Sent to Vendor';
                  const isRecFromVendor = m.status === 'Received from Vendor';
                  const isReadyForQC = m.status === 'Ready for QC';
                  const isCompleted = m.status === 'Completed';

                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono font-bold text-[#1a3055] whitespace-nowrap">
                        {m.woNumber}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">
                        {m.serial}
                        {m.assetNo && m.assetNo !== m.serial && (
                          <div className="text-[10px] text-slate-500">{m.assetNo}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-800">{m.shortDesc}</div>
                        <div className="text-[10px] text-slate-500">{m.size}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-700 max-w-xs">
                        <div className="line-clamp-2">{m.issue}</div>
                        {m.repairScope && (
                          <div className="text-[10px] text-slate-500 italic mt-0.5">Scope: {m.repairScope}</div>
                        )}
                        {m.partsReplaced && (
                          <div className="text-[10px] text-emerald-700 mt-0.5 font-medium">Parts: {m.partsReplaced}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {m.type === 'Vendor' ? (
                          <div>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              🏢 {m.vendor || '3rd Party'}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            ⚙ In-House
                          </span>
                        )}
                        <div className="text-[10px] text-slate-500 mt-0.5">{m.assignedTo}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                        {m.vendorPoRef ? (
                          <div>
                            <div className="font-semibold text-slate-800">{m.vendorPoRef}</div>
                            {m.vendorInvoiceRef && (
                              <div className="text-[10px] text-emerald-600 font-bold">Inv: {m.vendorInvoiceRef}</div>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-600 whitespace-nowrap">
                        <div>Start: {m.startDate}</div>
                        {m.dispatchToVendorDate && (
                          <div className="text-amber-700 font-medium">Disp: {m.dispatchToVendorDate}</div>
                        )}
                        {m.receivedFromVendorDate && (
                          <div className="text-emerald-700 font-medium">Rec: {m.receivedFromVendorDate}</div>
                        )}
                        {m.completedDate && (
                          <div className="text-slate-800 font-semibold">Done: {m.completedDate}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            isCompleted
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isReadyForQC
                              ? 'bg-purple-100 text-purple-800 border border-purple-300'
                              : isSentToVendor
                              ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                              : isRecFromVendor
                              ? 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-300'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-right font-bold text-slate-700 whitespace-nowrap">
                        {m.cost !== null && m.cost !== undefined ? (
                          <span>{m.cost.toLocaleString()}</span>
                        ) : m.estCost ? (
                          <span className="text-slate-400 font-normal">Est: {m.estCost.toLocaleString()}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      {user?.role !== 'Viewer' && (
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {!isCompleted ? (
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {/* If In Progress and can send to vendor */}
                              {m.type === 'InHouse' && (
                                <button
                                  onClick={() => openDispatchModal(m)}
                                  className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] shadow-xs cursor-pointer"
                                  title="Send tool to 3rd party repair vendor"
                                >
                                  🏢 Send to Vendor
                                </button>
                              )}

                              {/* If Sent to Vendor, option to Receive back */}
                              {isSentToVendor && (
                                <button
                                  onClick={() => openReceiveModal(m)}
                                  className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-[10px] shadow-xs cursor-pointer"
                                  title="Receive repaired tool back from vendor"
                                >
                                  📥 Receive from Vendor
                                </button>
                              )}

                              {/* Route to QC button */}
                              {!isReadyForQC && (
                                <button
                                  onClick={() => onRouteToQC && onRouteToQC(m.id)}
                                  className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white font-bold text-[10px] shadow-xs cursor-pointer"
                                  title="Create QC Inspection Work Order in Inspection Bay"
                                >
                                  🔍 Route to QC
                                </button>
                              )}

                              {/* Complete WO */}
                              <button
                                onClick={() => openCompleteModal(m)}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-xs cursor-pointer"
                              >
                                ✓ Complete WO
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] font-semibold">Closed</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New Maintenance Order */}
      {isNewMntOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-xl w-full border border-slate-300 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="bg-[#1a3055] text-white px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Create Maintenance &amp; Repair Order</h3>
                <div className="text-[11px] text-slate-300 font-mono">WO: {nextWoNumber}</div>
              </div>
              <button
                onClick={() => setIsNewMntOpen(false)}
                className="text-slate-300 hover:text-white font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMntSubmit} className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Select Tool for Maintenance <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedToolId}
                  onChange={(e) => setSelectedToolId(e.target.value)}
                  required
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-medium outline-none"
                >
                  <option value="">-- Choose Tool Serial / Asset --</option>
                  {inventory
                    .filter((t) => t.status !== 'Removed')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.serial} — {t.shortDesc} ({t.size}) [{t.status} @ {t.location}]
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Service Channel</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-medium outline-none"
                  >
                    <option value="InHouse">In-House Base Workshop</option>
                    <option value="Vendor">3rd Party Repair Vendor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Assigned Technician</label>
                  <input
                    type="text"
                    value={newAssignedTo}
                    onChange={(e) => setNewAssignedTo(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-medium outline-none"
                  />
                </div>
              </div>

              {newType === 'Vendor' && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-2">
                  <div className="font-bold text-[11px] text-amber-900">Third-Party Vendor Details</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Vendor Name</label>
                      <input
                        type="text"
                        value={newVendor}
                        onChange={(e) => setNewVendor(e.target.value)}
                        placeholder="e.g. MOTORMAX, Machine Shop"
                        required={newType === 'Vendor'}
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Repair PO Reference</label>
                      <input
                        type="text"
                        value={newVendorPo}
                        onChange={(e) => setNewVendorPo(e.target.value)}
                        placeholder="e.g. PO-REP-2601"
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Quotation Ref / Est AED</label>
                      <input
                        type="number"
                        value={newEstCost}
                        onChange={(e) => setNewEstCost(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="AED Cost"
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Issue / Defect Identified</label>
                <textarea
                  value={newIssue}
                  onChange={(e) => setNewIssue(e.target.value)}
                  rows={2}
                  placeholder="Describe failure, wear, MPI crack, or required overhaul scope..."
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-medium outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-medium outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Estimated Ready Date</label>
                  <input
                    type="date"
                    value={newEstDate}
                    onChange={(e) => setNewEstDate(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-medium outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewMntOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow-xs cursor-pointer"
                >
                  Issue Maintenance Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Dispatch to 3rd Party Vendor */}
      {dispatchModalRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full border border-slate-300 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-amber-600 text-white px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Dispatch Tool to 3rd Party Repair Vendor</h3>
                <div className="text-[11px] text-amber-100">
                  {dispatchModalRecord.woNumber} — Serial: {dispatchModalRecord.serial} ({dispatchModalRecord.shortDesc})
                </div>
              </div>
              <button
                onClick={() => setDispatchModalRecord(null)}
                className="text-white hover:text-amber-200 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDispatchSubmit} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Vendor Facility / Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={dispVendor}
                    onChange={(e) => setDispVendor(e.target.value)}
                    required
                    placeholder="e.g. MOTORMAX, Machine Shop"
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Vendor PO Reference</label>
                  <input
                    type="text"
                    value={dispPoRef}
                    onChange={(e) => setDispPoRef(e.target.value)}
                    placeholder="PO Number"
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Quotation Ref</label>
                  <input
                    type="text"
                    value={dispQuoteRef}
                    onChange={(e) => setDispQuoteRef(e.target.value)}
                    placeholder="Quote #"
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Estimated Cost (AED)</label>
                  <input
                    type="number"
                    value={dispEstCost}
                    onChange={(e) => setDispEstCost(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="AED"
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Dispatch Date</label>
                  <input
                    type="date"
                    value={dispDate}
                    onChange={(e) => setDispDate(e.target.value)}
                    required
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Scope of Work to be Performed</label>
                <textarea
                  value={dispScope}
                  onChange={(e) => setDispScope(e.target.value)}
                  rows={2}
                  placeholder="Specify turning, hardbanding, seal redress, dimensional re-machining..."
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDispatchModalRecord(null)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-amber-600 text-white font-bold hover:bg-amber-700 shadow-xs cursor-pointer"
                >
                  Confirm Dispatch to Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Receive from Vendor */}
      {receiveModalRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full border border-slate-300 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-cyan-700 text-white px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Receive Tool from Vendor Facility</h3>
                <div className="text-[11px] text-cyan-100">
                  {receiveModalRecord.woNumber} — {receiveModalRecord.vendor} ({receiveModalRecord.serial})
                </div>
              </div>
              <button
                onClick={() => setReceiveModalRecord(null)}
                className="text-white hover:text-cyan-200 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReceiveSubmit} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Received Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={recDate}
                    onChange={(e) => setRecDate(e.target.value)}
                    required
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Vendor Invoice / DN Ref</label>
                  <input
                    type="text"
                    value={recInvoiceRef}
                    onChange={(e) => setRecInvoiceRef(e.target.value)}
                    placeholder="Invoice #"
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Actual Cost (AED)</label>
                  <input
                    type="number"
                    value={recActualCost}
                    onChange={(e) => setRecActualCost(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="AED"
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Parts Replaced / Work Completed</label>
                <input
                  type="text"
                  value={recParts}
                  onChange={(e) => setRecParts(e.target.value)}
                  placeholder="e.g. Viton seal pack, wash pipe, springs, hardbanding"
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Workshop Receiving Notes</label>
                <textarea
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  rows={2}
                  placeholder="Condition upon receipt, certificate of conformities, pressure test charts..."
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReceiveModalRecord(null)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-cyan-700 text-white font-bold hover:bg-cyan-800 shadow-xs cursor-pointer"
                >
                  Confirm Return to Workshop
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Complete Maintenance WO */}
      {completeModalRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full border border-slate-300 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-emerald-700 text-white px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Complete Maintenance Order</h3>
                <div className="text-[11px] text-emerald-100">
                  {completeModalRecord.woNumber} — Serial: {completeModalRecord.serial}
                </div>
              </div>
              <button
                onClick={() => setCompleteModalRecord(null)}
                className="text-white hover:text-emerald-200 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCompleteSubmit} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Completion Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={completeDate}
                    onChange={(e) => setCompleteDate(e.target.value)}
                    required
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Final Total Cost (AED)</label>
                  <input
                    type="number"
                    value={completeCost}
                    onChange={(e) => setCompleteCost(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0"
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Post-Maintenance Routing</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`border rounded p-2.5 flex items-center gap-2 cursor-pointer transition ${completeDestination === 'QC' ? 'border-purple-600 bg-purple-50' : 'border-slate-300'}`}>
                    <input
                      type="radio"
                      name="dest"
                      checked={completeDestination === 'QC'}
                      onChange={() => setCompleteDestination('QC')}
                    />
                    <div>
                      <div className="font-bold text-purple-900">Route to QC Inspection</div>
                      <div className="text-[10px] text-slate-500">Requires QC certification before use</div>
                    </div>
                  </label>

                  <label className={`border rounded p-2.5 flex items-center gap-2 cursor-pointer transition ${completeDestination === 'Base' ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300'}`}>
                    <input
                      type="radio"
                      name="dest"
                      checked={completeDestination === 'Base'}
                      onChange={() => setCompleteDestination('Base')}
                    />
                    <div>
                      <div className="font-bold text-emerald-900">Return to Base Ready</div>
                      <div className="text-[10px] text-slate-500">Mark Good in inventory stock</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Completion Sign-off Notes</label>
                <textarea
                  value={completeNotes}
                  onChange={(e) => setCompleteNotes(e.target.value)}
                  rows={2}
                  placeholder="Final pressure test results, torque specs verified..."
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCompleteModalRecord(null)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-700 text-white font-bold hover:bg-emerald-800 shadow-xs cursor-pointer"
                >
                  Finalize &amp; Close WO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
