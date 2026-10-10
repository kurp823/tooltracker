import React, { useState, useMemo, useCallback } from 'react';
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
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onOpenToolHistory?: (serial: string) => void;
  onRefresh?: () => void;
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
  showToast: propShowToast,
  onOpenToolHistory,
  onRefresh,
}) => {
  const showToast = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
      if (propShowToast) {
        propShowToast(msg, type);
      } else {
        console.log(`[Toast ${type}]: ${msg}`);
      }
    },
    [propShowToast]
  );

  const [localIsAddOpen, setLocalIsAddOpen] = useState(false);
  const isAddModalOpen = propIsAddOpen !== undefined ? propIsAddOpen : localIsAddOpen;
  const handleOpenAddModal = onOpenAddModal || (() => setLocalIsAddOpen(true));
  const handleCloseAddModal = () => {
    setIsAddingNewCat(false);
    setIsAddingNewSize(false);
    setNewCatInput('');
    setNewSizeInput('');
    if (onCloseAddModal) {
      onCloseAddModal();
    } else {
      setLocalIsAddOpen(false);
    }
  };

  const [fleetTab, setFleetTab] = useState<'active' | 'all' | 'sub' | 'released'>('active');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedOwner, setSelectedOwner] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 48;

  const renderToolStatusBadge = (status: ToolItem['status']) => {
    switch (status) {
      case 'Good':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Available / Good
          </span>
        );
      case 'Repair':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
            Under Repair
          </span>
        );
      case 'Inspection':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
            Inspection
          </span>
        );
      case 'Redress':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-orange-50 text-orange-800 border border-orange-200">
            Redress
          </span>
        );
      case 'Removed':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
            De-inventoried
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {status}
          </span>
        );
    }
  };

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

  // Inline add state for new categories and sizes in modal
  const [isAddingNewCat, setIsAddingNewCat] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [isAddingNewSize, setIsAddingNewSize] = useState(false);
  const [newSizeInput, setNewSizeInput] = useState('');

  // Custom categories & sizes stored locally
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('emdad_custom_categories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customSizes, setCustomSizes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('emdad_custom_sizes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Compute categories from inventory + custom additions
  const categories = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((t) => {
      if (t.shortDesc) set.add(t.shortDesc.trim());
    });
    customCategories.forEach((c) => {
      if (c && c.trim()) set.add(c.trim());
    });
    return Array.from(set).sort();
  }, [inventory, customCategories]);

  // Compute tool sizes from API standards + inventory + custom additions
  const standardSizes = useMemo(() => {
    const list = new Set(TOOL_SIZES);
    inventory.forEach((t) => {
      if (t.size) list.add(t.size.trim());
    });
    customSizes.forEach((s) => {
      if (s && s.trim()) list.add(s.trim());
    });
    return Array.from(list);
  }, [inventory, customSizes]);

  const handleSaveNewCategory = () => {
    const val = newCatInput.trim().toUpperCase();
    if (!val) return;
    if (!customCategories.includes(val)) {
      const updated = [...customCategories, val];
      setCustomCategories(updated);
      try {
        localStorage.setItem('emdad_custom_categories', JSON.stringify(updated));
      } catch (e) {}
    }
    setNewType(val);
    setNewCatInput('');
    setIsAddingNewCat(false);
    showToast(`Category "${val}" added and selected.`, 'success');
  };

  const handleSaveNewSize = () => {
    let val = newSizeInput.trim();
    if (!val) return;
    if (!val.includes('"') && !val.toLowerCase().includes('mm')) {
      val = `${val}"`;
    }
    if (!customSizes.includes(val)) {
      const updated = [...customSizes, val];
      setCustomSizes(updated);
      try {
        localStorage.setItem('emdad_custom_sizes', JSON.stringify(updated));
      } catch (e) {}
    }
    setNewSize(val);
    setNewSizeInput('');
    setIsAddingNewSize(false);
    showToast(`Size "${val}" added and selected.`, 'success');
  };

  // Compute distinct owners from inventory
  const owners = useMemo(() => {
    return Array.from(
      new Set(
        inventory
          .map((t) => t.ownership?.trim() || t.supplier?.trim() || (t.isEmdad ? 'EMDAD' : 'Sub-contractor'))
          .filter(Boolean)
      )
    ).sort();
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
      if (selectedOwner !== 'ALL') {
        const toolOwner = t.ownership?.trim() || t.supplier?.trim() || (t.isEmdad ? 'EMDAD' : 'Sub-contractor');
        if (toolOwner !== selectedOwner) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const fullTxt = `${t.id} ${t.assetNo} ${t.size} ${t.shortDesc} ${t.desc} ${t.ownership} ${t.location}`.toLowerCase();
        if (!fullTxt.includes(q)) return false;
      }
      return true;
    });
  }, [inventory, fleetTab, selectedStatus, selectedCategory, selectedOwner, search]);

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

    if (!id || !newType.trim() || !newSize.trim()) {
      showToast('Please fill in tool type, size, and ID/supplier.', 'error');
      return;
    }

    const newTool: ToolItem = {
      id,
      serial: id,
      assetNo: isEmd ? newAssetNo.trim() : (newAssetNo.trim() || id),
      size: newSize.trim(),
      shortDesc: newType.trim().toUpperCase(),
      desc: newDesc.trim() || `${newSize.trim()} ${newType.trim().toUpperCase()}`,
      qty: 1,
      location: newLocation,
      status: newStatus,
      ownership,
      isEmdad: isEmd,
      supplier: ownership,
      addedDate: new Date().toISOString().split('T')[0],
    };

    const catUpper = newType.trim().toUpperCase();
    if (catUpper && !customCategories.includes(catUpper)) {
      const updatedCats = [...customCategories, catUpper];
      setCustomCategories(updatedCats);
      try {
        localStorage.setItem('emdad_custom_categories', JSON.stringify(updatedCats));
      } catch {}
    }
    const sizeClean = newSize.trim();
    if (sizeClean && !customSizes.includes(sizeClean)) {
      const updatedSizes = [...customSizes, sizeClean];
      setCustomSizes(updatedSizes);
      try {
        localStorage.setItem('emdad_custom_sizes', JSON.stringify(updatedSizes));
      } catch {}
    }

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
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="px-2.5 py-1.5 rounded bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs border border-slate-300 shadow-sm transition cursor-pointer flex items-center gap-1"
              title="Refresh live data from server"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 shadow-sm transition cursor-pointer"
          >
            📤 Export CSV
          </button>
          {user?.role !== 'Viewer' && (
            <button
              type="button"
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
                ? 'bg-white text-slate-900 border-[#b8c9db] -mb-[1px] shadow-xs'
                : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Released to Suppliers ({inventory.filter((t) => t.status === 'Removed' || t.location === 'Returned to Supplier').length})
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
              <option value="Good">Good / Ready</option>
              <option value="Repair">Under Repair</option>
              <option value="Inspection">Inspection</option>
              <option value="Redress">Redress</option>
              <option value="Removed">Removed / Released</option>
            </select>

            <select
              value={selectedOwner}
              onChange={(e) => {
                setSelectedOwner(e.target.value);
                setPage(1);
              }}
              className="bg-white border border-[#b8c9db] rounded px-2.5 py-1 text-xs font-medium outline-none"
              title="Filter assets by tool owner / supplier"
            >
              <option value="ALL">All Owners ({owners.length})</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o} ({inventory.filter((t) => (t.ownership?.trim() || t.supplier?.trim() || (t.isEmdad ? 'EMDAD' : 'Sub-contractor')) === o).length})
                </option>
              ))}
            </select>

            {(search || selectedCategory !== 'ALL' || selectedStatus !== 'ALL' || selectedOwner !== 'ALL') && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('ALL');
                  setSelectedStatus('ALL');
                  setSelectedOwner('ALL');
                  setPage(1);
                }}
                className="text-xs text-slate-600 hover:text-slate-900 font-semibold underline px-2 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Switcher */}
            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-white shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-[#1a3055] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cards View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-[#1a3055] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Table View
              </button>
            </div>

            <div className="text-xs font-bold text-slate-700">
              Showing {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length.toLocaleString()} tools
            </div>
          </div>
        </div>

        {/* View content: Cards or Table */}
        {viewMode === 'cards' ? (
          <div className="p-4 bg-slate-50/60 min-h-[300px]">
            {pagedList.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-medium bg-white rounded-xl border border-slate-200">
                No tool assets found matching the selected criteria.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {pagedList.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md p-4 transition flex flex-col justify-between"
                  >
                    <div>
                      {/* Card Top Row: Serial & Status */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <span className="font-mono font-bold text-slate-900 text-sm block">
                            {t.serial}
                          </span>
                          <span className="font-mono text-slate-500 text-[11px] block">
                            {t.assetNo ? `Asset: ${t.assetNo}` : '—'}
                          </span>
                        </div>
                        <div>{renderToolStatusBadge(t.status)}</div>
                      </div>

                      {/* Tool Category & Size */}
                      <div className="space-y-1 mb-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-900">{t.shortDesc}</span>
                          <span className="font-mono text-slate-600 font-medium">{t.size || '—'}</span>
                        </div>
                        <p className="text-xs text-slate-600 font-normal line-clamp-2 leading-relaxed" title={t.desc}>
                          {t.desc}
                        </p>
                      </div>
                    </div>

                    {/* Card Footer: Location, Ownership, Action */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs mt-2">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                          Location
                        </span>
                        <span className="font-medium text-slate-700 text-[11px]">{t.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 font-medium mr-1">
                          {t.ownership}
                        </span>
                        {onOpenToolHistory && (
                          <button
                            type="button"
                            onClick={() => onOpenToolHistory(t.serial)}
                            title="View Tool Movement History"
                            className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-300 cursor-pointer transition flex items-center gap-1 shadow-xs"
                          >
                            <span>⏱️</span>
                            <span>History</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startEditTool(t)}
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold border border-slate-300 cursor-pointer transition"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-[#1a3055] border-b border-slate-200 font-bold">
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
              <tbody className="divide-y divide-slate-200">
                {pagedList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500 font-medium">
                      No tool assets found matching the selected criteria.
                    </td>
                  </tr>
                ) : (
                  pagedList.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition">
                      <td className="px-3 py-2 font-mono font-bold text-slate-900">{t.serial}</td>
                      <td className="px-3 py-2 font-mono text-slate-500 text-[11px]">{t.assetNo || '—'}</td>
                      <td className="px-3 py-2 font-mono text-slate-700 font-medium">{t.size}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{t.shortDesc}</td>
                      <td className="px-3 py-2 text-slate-600 text-xs max-w-xs truncate font-normal" title={t.desc}>
                        {t.desc}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700">
                        {t.ownership}
                      </td>
                      <td className="px-3 py-2 text-slate-700 font-medium">{t.location}</td>
                      <td className="px-3 py-2">
                        {renderToolStatusBadge(t.status)}
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {onOpenToolHistory && (
                            <button
                              type="button"
                              onClick={() => onOpenToolHistory(t.serial)}
                              title="View Tool Movement History"
                              className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-300 cursor-pointer transition flex items-center gap-1 shadow-xs"
                            >
                              <span>⏱️</span>
                              <span>History</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => startEditTool(t)}
                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold border border-slate-300 cursor-pointer transition"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

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
                {/* Tool Category */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Tool Category / Type *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNewCat(!isAddingNewCat);
                        setNewCatInput('');
                      }}
                      className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
                    >
                      {isAddingNewCat ? '✕ Cancel' : '+ Add New Category'}
                    </button>
                  </div>

                  {!isAddingNewCat ? (
                    <select
                      required
                      value={newType}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsAddingNewCat(true);
                          setNewCatInput('');
                        } else {
                          setNewType(e.target.value);
                        }
                      }}
                      className="w-full border rounded px-2.5 py-1.5 bg-white font-medium text-slate-800 text-xs"
                    >
                      <option value="">Select category...</option>
                      <option value="__NEW__" className="font-bold text-blue-700 bg-blue-50">
                        + Add New Category...
                      </option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Enter new category name..."
                        value={newCatInput}
                        onChange={(e) => setNewCatInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveNewCategory();
                          }
                        }}
                        className="flex-1 border-2 border-blue-400 rounded px-2 py-1 uppercase font-bold text-slate-800 text-xs focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSaveNewCategory}
                        className="px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white rounded font-bold text-xs cursor-pointer shadow-xs"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>

                {/* Tool Size */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Tool Size (OD) *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNewSize(!isAddingNewSize);
                        setNewSizeInput('');
                      }}
                      className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
                    >
                      {isAddingNewSize ? '✕ Cancel' : '+ Add New Size'}
                    </button>
                  </div>

                  {!isAddingNewSize ? (
                    <select
                      required
                      value={newSize}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsAddingNewSize(true);
                          setNewSizeInput('');
                        } else {
                          setNewSize(e.target.value);
                        }
                      }}
                      className="w-full border rounded px-2.5 py-1.5 bg-white font-mono font-medium text-slate-800 text-xs"
                    >
                      <option value="">Select size...</option>
                      <option value="__NEW__" className="font-bold text-blue-700 bg-blue-50">
                        + Add New Size...
                      </option>
                      {standardSizes.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        placeholder="e.g. 7-1/4&quot; or 178mm..."
                        value={newSizeInput}
                        onChange={(e) => setNewSizeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveNewSize();
                          }
                        }}
                        className="flex-1 border-2 border-blue-400 rounded px-2 py-1 font-mono font-bold text-slate-800 text-xs focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSaveNewSize}
                        className="px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white rounded font-bold text-xs cursor-pointer shadow-xs"
                      >
                        Add
                      </button>
                    </div>
                  )}
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
