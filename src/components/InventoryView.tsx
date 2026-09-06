import React, { useState, useMemo } from 'react';
import { ToolItem, User } from '../types';
import { TOOL_SIZES } from '../data/initialData';

interface InventoryViewProps {
  user?: User | null;
  inventory: ToolItem[];
  onSaveInventory?: (updated: ToolItem[]) => void;
  onAddTool?: (tool: ToolItem) => void;
  onUpdateTool?: (id: string, updates: Partial<ToolItem>) => void;
  isAddModalOpen?: boolean;
  onCloseAddModal?: () => void;
  onOpenAddModal?: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  user,
  inventory,
  onSaveInventory,
  onAddTool,
  onUpdateTool,
  isAddModalOpen: propIsAddOpen,
  onCloseAddModal,
  onOpenAddModal,
}) => {
  const [localIsAddOpen, setLocalIsAddOpen] = useState(false);
  const isAddModalOpen = propIsAddOpen !== undefined ? propIsAddOpen : localIsAddOpen;
  const handleOpenAddModal = onOpenAddModal || (() => setLocalIsAddOpen(true));
  const handleCloseAddModal = onCloseAddModal || (() => setLocalIsAddOpen(false));
  const [fleetTab, setFleetTab] = useState<'active' | 'all' | 'sub' | 'released'>('active');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<ToolItem['status']>('Good');
  const [editLocation, setEditLocation] = useState('Emdad Base');

  // Form states for Add Tool
  const [newOwnershipType, setNewOwnershipType] = useState<'emdad' | 'sub'>('emdad');
  const [newSerial, setNewSerial] = useState('');
  const [newAssetNo, setNewAssetNo] = useState('');
  const [newType, setNewType] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newLocation, setNewLocation] = useState('Emdad Base');
  const [newStatus, setNewStatus] = useState<ToolItem['status']>('Good');

  // Compute categories from inventory
  const categories = useMemo(() => {
    return Array.from(new Set(inventory.map((t) => t.shortDesc).filter(Boolean))).sort();
  }, [inventory]);

  // Compute next EMDAD ID
  const nextEmdadId = useMemo(() => {
    const emdNumbers = inventory
      .filter((t) => t.isEmdad && t.id.startsWith('EMD-'))
      .map((t) => parseInt(t.id.replace('EMD-', ''), 10))
      .filter((n) => !isNaN(n));
    const maxNum = emdNumbers.length > 0 ? Math.max(...emdNumbers) : 1000;
    return `EMD-${maxNum + 1}`;
  }, [inventory]);

  // Filtered inventory
  const filtered = useMemo(() => {
    return inventory.filter((t) => {
      // Tab filter
      if (fleetTab === 'active' && (t.status === 'Removed' || t.location === 'Returned to Supplier')) {
        if (selectedStatus === 'ALL') return false;
      }
      if (fleetTab === 'released' && t.status !== 'Removed' && t.location !== 'Returned to Supplier') {
        return false;
      }
      if (fleetTab === 'sub' && t.isEmdad) {
        return false;
      }

      if (selectedStatus !== 'ALL' && t.status !== selectedStatus) return false;
      if (selectedCategory !== 'ALL' && t.shortDesc !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const fullTxt = `${t.id} ${t.assetNo} ${t.size} ${t.shortDesc} ${t.desc} ${t.ownership} ${t.location}`.toLowerCase();
        if (!fullTxt.includes(q)) return false;
      }
      return true;
    });
  }, [inventory, fleetTab, selectedStatus, selectedCategory, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedList = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExportCSV = () => {
    if (inventory.length === 0) return;
    const headers = ['SystemID', 'AssetNo', 'Size', 'ShortDesc', 'Description', 'Ownership', 'Location', 'Status'];
    const rows = inventory.map((t) => [
      `"${t.id}"`,
      `"${t.assetNo || ''}"`,
      `"${t.size}"`,
      `"${(t.shortDesc || '').replace(/"/g, '""')}"`,
      `"${(t.desc || '').replace(/"/g, '""')}"`,
      `"${t.ownership}"`,
      `"${t.location}"`,
      `"${t.status}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EMDAD_Tools_Fleet_${inventory.length}_Assets.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateAssetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isEmd = newOwnershipType === 'emdad';
    const id = isEmd ? nextEmdadId : newSerial.trim();
    const ownership = isEmd ? 'EMDAD' : newSupplier.trim();

    if (!id || !newType || !newSize) {
      alert('Please fill in tool type, size, and ID/supplier.');
      return;
    }

    const newTool: ToolItem = {
      id,
      serial: id,
      assetNo: isEmd ? newAssetNo.trim() : (newAssetNo.trim() || id),
      size: newSize,
      shortDesc: newType,
      desc: newDesc.trim() || `${newSize} ${newType}`,
      qty: 1,
      location: newLocation,
      status: newStatus,
      ownership,
      isEmdad: isEmd,
      supplier: ownership,
      addedDate: new Date().toISOString().split('T')[0],
    };

    if (onAddTool) {
      onAddTool(newTool);
    } else if (onSaveInventory) {
      onSaveInventory([newTool, ...inventory]);
    }
    handleCloseAddModal();
    // Reset
    setNewSerial('');
    setNewAssetNo('');
    setNewType('');
    setNewDesc('');
    setNewSize('');
    setNewSupplier('');
  };

  const startEditTool = (t: ToolItem) => {
    setEditingToolId(t.id);
    setEditStatus(t.status);
    setEditLocation(t.location);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingToolId) return;
    if (onUpdateTool) {
      onUpdateTool(editingToolId, { status: editStatus, location: editLocation });
    } else if (onSaveInventory) {
      onSaveInventory(
        inventory.map((t) =>
          t.id === editingToolId ? { ...t, status: editStatus, location: editLocation } : t
        )
      );
    }
    setEditingToolId(null);
  };

  return (
    <div className="space-y-4">
      {/* Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-medium">Assets &amp; Inventory Management</div>
          <h1 className="text-base font-bold text-[#1a3055]">Assets and Inventory Catalog</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 shadow-sm transition cursor-pointer"
          >
            📤 Export CSV
          </button>
          {user?.role !== 'Viewer' && (
            <button
              onClick={handleOpenAddModal}
              className="px-3 py-1.5 rounded bg-[#ffd875] text-[#4a2e00] font-bold text-xs border border-[#c8860d] hover:brightness-105 shadow-sm transition cursor-pointer"
            >
              + New Asset
            </button>
          )}
        </div>
      </div>

      {/* Filter and Table Card */}
      <div className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-sm">
        {/* Quick Fleet Filter Tabs */}
        <div className="bg-[#edf3f8] px-3 pt-2 border-b border-[#b8c9db] flex flex-wrap gap-1.5 text-xs">
          <button
            onClick={() => {
              setFleetTab('active');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-t font-bold transition cursor-pointer border-t border-x ${
              fleetTab === 'active'
                ? 'bg-white text-[#1a3055] border-[#b8c9db] -mb-[1px] shadow-xs'
                : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Active Fleet Tools ({inventory.filter((t) => t.status !== 'Removed' && t.location !== 'Returned to Supplier').length})
          </button>
          <button
            onClick={() => {
              setFleetTab('all');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-t font-bold transition cursor-pointer border-t border-x ${
              fleetTab === 'all'
                ? 'bg-white text-[#1a3055] border-[#b8c9db] -mb-[1px] shadow-xs'
                : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            All Inventory Assets ({inventory.length})
          </button>
          <button
            onClick={() => {
              setFleetTab('sub');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-t font-bold transition cursor-pointer border-t border-x ${
              fleetTab === 'sub'
                ? 'bg-white text-[#1a3055] border-[#b8c9db] -mb-[1px] shadow-xs'
                : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Sub-Contractor Tools ({inventory.filter((t) => !t.isEmdad).length})
          </button>
          <button
            onClick={() => {
              setFleetTab('released');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-t font-bold transition cursor-pointer border-t border-x ${
              fleetTab === 'released'
                ? 'bg-white text-amber-900 border-[#b8c9db] -mb-[1px] shadow-xs'
                : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            🚪 Released to Suppliers ({inventory.filter((t) => t.status === 'Removed' || t.location === 'Returned to Supplier').length})
          </button>
        </div>

        <div className="p-3 bg-[#dbe6f1] border-b border-[#b8c9db] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search serial #, asset name, description, size..."
              className="bg-white border border-[#b8c9db] rounded px-3 py-1 text-xs w-72 outline-none font-medium focus:ring-1 focus:ring-amber-400"
            />
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="bg-white border border-[#b8c9db] rounded px-2.5 py-1 text-xs font-medium outline-none"
            >
              <option value="ALL">All Categories ({inventory.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="bg-white border border-[#b8c9db] rounded px-2.5 py-1 text-xs font-medium outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="Good">🟢 Good</option>
              <option value="Repair">🔴 Repair</option>
              <option value="Inspection">🟡 Inspection</option>
              <option value="Redress">🟠 Redress</option>
              <option value="Removed">⚪ Removed</option>
            </select>

            {(search || selectedCategory !== 'ALL' || selectedStatus !== 'ALL') && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('ALL');
                  setSelectedStatus('ALL');
                  setPage(1);
                }}
                className="text-xs text-slate-600 hover:text-slate-900 font-semibold underline px-2 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <div className="text-xs font-bold text-slate-700">
            Showing {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length.toLocaleString()} tools
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold">
              <tr>
                <th className="px-3 py-2">Serial #</th>
                <th className="px-3 py-2">Asset No</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Tool Type</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {pagedList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 font-medium">
                    No tool assets found matching the selected criteria.
                  </td>
                </tr>
              ) : (
                pagedList.map((t) => (
                  <tr key={t.id} className="hover:bg-[#e4eef8] transition">
                    <td className="px-3 py-2 font-mono font-bold text-amber-900">{t.serial}</td>
                    <td className="px-3 py-2 font-mono text-slate-500 text-[10px]">{t.assetNo || '—'}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{t.size}</td>
                    <td className="px-3 py-2 font-bold text-[#1a3055]">{t.shortDesc}</td>
                    <td className="px-3 py-2 text-slate-600 text-[10px] max-w-xs truncate" title={t.desc}>
                      {t.desc}
                    </td>
                    <td
                      className={`px-3 py-2 font-bold ${
                        t.isEmdad ? 'text-amber-800' : 'text-slate-600'
                      }`}
                    >
                      {t.ownership}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{t.location}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.status === 'Good'
                            ? 'bg-emerald-100 text-emerald-800'
                            : t.status === 'Repair'
                            ? 'bg-rose-100 text-rose-800'
                            : t.status === 'Inspection'
                            ? 'bg-amber-100 text-amber-800'
                            : t.status === 'Redress'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => startEditTool(t)}
                        className="text-blue-700 hover:underline font-bold text-[11px] cursor-pointer"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="px-4 py-3 bg-[#f8fafc] border-t border-[#b8c9db] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-600 font-medium">
            Page <strong className="text-slate-900">{currentPage}</strong> of{' '}
            <strong>{totalPages}</strong> ({filtered.length.toLocaleString()} tools)
          </div>
          <div className="flex items-center space-x-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="px-2.5 py-1 rounded border bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              &larr; Prev
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              className="px-2.5 py-1 rounded border bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Add New Tool Modal */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseAddModal();
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="px-4 py-3 bg-[#5b7fa6] text-white flex justify-between items-center">
              <h3 className="font-bold text-sm">Register New Tool Asset</h3>
              <button
                onClick={onCloseAddModal}
                className="text-white hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateAssetSubmit} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1 text-slate-700">Ownership Type</label>
                <div className="flex space-x-4">
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="ownershipType"
                      checked={newOwnershipType === 'emdad'}
                      onChange={() => setNewOwnershipType('emdad')}
                    />
                    <span className="font-bold text-amber-900">EMDAD Owned (Auto-assign {nextEmdadId})</span>
                  </label>
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="ownershipType"
                      checked={newOwnershipType === 'sub'}
                      onChange={() => setNewOwnershipType('sub')}
                    />
                    <span className="font-bold text-slate-700">Sub-Contractor Tool</span>
                  </label>
                </div>
              </div>

              {newOwnershipType === 'sub' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold mb-1">Supplier / Vendor *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MOTORMAX, SALTIRE"
                      value={newSupplier}
                      onChange={(e) => setNewSupplier(e.target.value)}
                      className="w-full border rounded px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Their Serial / ID *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 351, EOE1076"
                      value={newSerial}
                      onChange={(e) => setNewSerial(e.target.value)}
                      className="w-full border rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold mb-1">System ID</label>
                    <input
                      type="text"
                      disabled
                      value={nextEmdadId}
                      className="w-full border rounded px-2.5 py-1.5 bg-slate-100 font-mono font-bold text-amber-900"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Asset No (ERP Ref) *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. DJ650-003, FS434-01"
                      value={newAssetNo}
                      onChange={(e) => setNewAssetNo(e.target.value)}
                      className="w-full border rounded px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Tool Category / Type *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HYD DRILLING JAR, SHOCK TOOL"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                    list="cat-suggestions"
                  />
                  <datalist id="cat-suggestions">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block font-bold mb-1">Tool Size *</label>
                  <select
                    required
                    value={newSize}
                    onChange={(e) => setNewSize(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  >
                    <option value="">Select size...</option>
                    {TOOL_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Full Technical Description</label>
                <textarea
                  rows={2}
                  placeholder="e.g. 6-1/2 OD DRILLING JAR ASSY (HQ650), 4-1/2 IF PIN x BOX"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Initial Location</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Initial Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as ToolItem['status'])}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="Good">Good</option>
                    <option value="Repair">Repair</option>
                    <option value="Inspection">Inspection</option>
                    <option value="Redress">Redress</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-sm cursor-pointer"
                >
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Tool Modal */}
      {editingToolId && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingToolId(null);
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 bg-[#5b7fa6] text-white flex justify-between items-center">
              <h3 className="font-bold text-sm">Update Asset: {editingToolId}</h3>
              <button
                onClick={() => setEditingToolId(null)}
                className="text-white hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Operational Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ToolItem['status'])}
                  className="w-full border rounded px-2.5 py-1.5 font-bold"
                >
                  <option value="Good">Good</option>
                  <option value="Repair">Repair</option>
                  <option value="Inspection">Inspection</option>
                  <option value="Redress">Redress</option>
                  <option value="Removed">Removed</option>
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1">Physical Location</label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5"
                />
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingToolId(null)}
                  className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-sm cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
