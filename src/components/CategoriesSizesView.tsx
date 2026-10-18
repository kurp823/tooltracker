import React, { useState, useMemo } from 'react';
import { ToolItem, User, NavModule } from '../types';
import { useModulePermission } from '../services/permissionService';
import {
  DropdownListKey,
  DROPDOWN_DEFINITIONS,
  getDropdownOptions,
  addDropdownOption,
  updateDropdownOption,
  deleteDropdownOption,
  resetDropdownList,
  getAllDropdownDefinitions,
} from '../services/dropdownService';
import { Plus, Trash2, Edit2, Check, X, Tag, FolderPlus, Search, Layers, Box, Sliders, RefreshCw, Shield } from 'lucide-react';

interface CategoriesSizesViewProps {
  user?: User | null;
  inventory: ToolItem[];
  categories: string[];
  onUpdateCategories: (categories: string[]) => void;
  sizes: string[];
  onUpdateSizes: (sizes: string[]) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefresh?: () => void;
}

export const CategoriesSizesView: React.FC<CategoriesSizesViewProps> = ({
  user,
  inventory,
  categories,
  onUpdateCategories,
  sizes,
  onUpdateSizes,
  showToast,
  onRefresh,
}) => {
  const { canEdit } = useModulePermission(user, 'categories-sizes');

  // Master View Tabs
  const [mainTab, setMainTab] = useState<'categories_sizes' | 'all_dropdowns'>('categories_sizes');

  // Dropdown Manager State
  const [selectedDropdownKey, setSelectedDropdownKey] = useState<DropdownListKey>('suppliers');
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [newDropdownOption, setNewDropdownOption] = useState('');
  const [editingDropdownIdx, setEditingDropdownIdx] = useState<number | null>(null);
  const [editingDropdownVal, setEditingDropdownVal] = useState('');
  const [dropdownOptions, setDropdownOptions] = useState<string[]>(() => getDropdownOptions('suppliers'));

  const handleSelectDropdownKey = (key: DropdownListKey) => {
    setSelectedDropdownKey(key);
    setDropdownOptions(getDropdownOptions(key));
    setDropdownSearch('');
    setNewDropdownOption('');
    setEditingDropdownIdx(null);
  };

  const handleAddDropdownOption = (e: React.FormEvent) => {
    e.preventDefault();
    const result = addDropdownOption(selectedDropdownKey, newDropdownOption);
    if (result.success) {
      setDropdownOptions(result.options);
      setNewDropdownOption('');
      showToast(result.message, 'success');
    } else {
      showToast(result.message, 'error');
    }
  };

  const handleSaveDropdownEdit = (idx: number, oldVal: string) => {
    const result = updateDropdownOption(selectedDropdownKey, oldVal, editingDropdownVal);
    if (result.success) {
      setDropdownOptions(result.options);
      setEditingDropdownIdx(null);
      showToast(result.message, 'success');
    } else {
      showToast(result.message, 'error');
    }
  };

  const handleDeleteDropdownOption = (val: string) => {
    const def = DROPDOWN_DEFINITIONS[selectedDropdownKey];
    if (window.confirm(`Are you sure you want to delete "${val}" from ${def.label}?`)) {
      const result = deleteDropdownOption(selectedDropdownKey, val);
      if (result.success) {
        setDropdownOptions(result.options);
        showToast(result.message, 'info');
      } else {
        showToast(result.message, 'error');
      }
    }
  };

  const handleResetDropdownList = () => {
    const def = DROPDOWN_DEFINITIONS[selectedDropdownKey];
    if (window.confirm(`Reset "${def.label}" to system default options?`)) {
      const reset = resetDropdownList(selectedDropdownKey);
      setDropdownOptions(reset);
      showToast(`Reset "${def.label}" to defaults.`, 'success');
    }
  };
  // Category state
  const [catSearch, setCatSearch] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [editingCatIdx, setEditingCatIdx] = useState<number | null>(null);
  const [editingCatVal, setEditingCatVal] = useState('');

  // Size state
  const [sizeSearch, setSizeSearch] = useState('');
  const [newSizeName, setNewSizeName] = useState('');
  const [editingSizeIdx, setEditingSizeIdx] = useState<number | null>(null);
  const [editingSizeVal, setEditingSizeVal] = useState('');

  // Inventory count maps
  const catCountMap = useMemo(() => {
    const map = new Map<string, number>();
    inventory.forEach((t) => {
      const c = (t.shortDesc || '').trim().toUpperCase();
      if (c) map.set(c, (map.get(c) || 0) + 1);
    });
    return map;
  }, [inventory]);

  const sizeCountMap = useMemo(() => {
    const map = new Map<string, number>();
    inventory.forEach((t) => {
      const s = (t.size || '').trim();
      if (s) map.set(s, (map.get(s) || 0) + 1);
    });
    return map;
  }, [inventory]);

  // Filtered lists
  const filteredCategories = useMemo(() => {
    if (!catSearch.trim()) return categories;
    return categories.filter((c) => c.toLowerCase().includes(catSearch.toLowerCase().trim()));
  }, [categories, catSearch]);

  const filteredSizes = useMemo(() => {
    if (!sizeSearch.trim()) return sizes;
    return sizes.filter((s) => s.toLowerCase().includes(sizeSearch.toLowerCase().trim()));
  }, [sizes, sizeSearch]);

  // Category handlers
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatName.trim().toUpperCase();
    if (!trimmed) return;
    if (categories.some((c) => c.toUpperCase() === trimmed)) {
      showToast(`Category "${trimmed}" already exists.`, 'error');
      return;
    }
    const updated = [...categories, trimmed].sort();
    onUpdateCategories(updated);
    setNewCatName('');
    showToast(`Added category "${trimmed}" successfully.`, 'success');
  };

  const handleSaveCatEdit = (idx: number) => {
    const trimmed = editingCatVal.trim().toUpperCase();
    if (!trimmed) return;
    const updated = [...categories];
    const oldName = updated[idx];
    updated[idx] = trimmed;
    onUpdateCategories(updated.sort());
    setEditingCatIdx(null);
    showToast(`Renamed "${oldName}" to "${trimmed}".`, 'success');
  };

  const handleDeleteCategory = (cat: string) => {
    const inUse = catCountMap.get(cat.toUpperCase()) || 0;
    if (inUse > 0) {
      if (!window.confirm(`Warning: "${cat}" is used by ${inUse} tool(s) in active inventory. Are you sure you want to delete it?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Delete category "${cat}"?`)) return;
    }
    const updated = categories.filter((c) => c !== cat);
    onUpdateCategories(updated);
    showToast(`Category "${cat}" removed.`, 'info');
  };

  // Size handlers
  const handleAddSize = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSizeName.trim();
    if (!trimmed) return;
    if (sizes.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      showToast(`Size "${trimmed}" already exists.`, 'error');
      return;
    }
    const updated = [...sizes, trimmed];
    onUpdateSizes(updated);
    setNewSizeName('');
    showToast(`Added size "${trimmed}" successfully.`, 'success');
  };

  const handleSaveSizeEdit = (idx: number) => {
    const trimmed = editingSizeVal.trim();
    if (!trimmed) return;
    const updated = [...sizes];
    const oldSize = updated[idx];
    updated[idx] = trimmed;
    onUpdateSizes(updated);
    setEditingSizeIdx(null);
    showToast(`Renamed size "${oldSize}" to "${trimmed}".`, 'success');
  };

  const handleDeleteSize = (size: string) => {
    const inUse = sizeCountMap.get(size) || 0;
    if (inUse > 0) {
      if (!window.confirm(`Warning: Size "${size}" is assigned to ${inUse} tool(s) in inventory. Are you sure you want to delete it?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Delete tool size "${size}"?`)) return;
    }
    const updated = sizes.filter((s) => s !== size);
    onUpdateSizes(updated);
    showToast(`Size "${size}" removed.`, 'info');
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-4 sm:p-6">
      {/* Header bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-900 rounded-lg border border-blue-200">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>Tool Categories &amp; Sizes Master</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Master Data
              </span>
            </h1>
            <p className="text-xs text-slate-500">
              Manage standardized downhole tool categories and sizes used across Tool Selection, Checklists, Delivery Tickets, and Asset Catalog.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh Categories & Sizes from Azure SQL / Database"
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          )}
          <div className="bg-blue-50 border border-blue-200 rounded px-3 py-1.5 font-medium text-blue-900">
            Categories: <strong className="font-bold">{categories.length}</strong>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded px-3 py-1.5 font-medium text-emerald-900">
            Sizes: <strong className="font-bold">{sizes.length}</strong>
          </div>
        </div>
      </div>

      {/* Primary Master Data Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          type="button"
          onClick={() => setMainTab('categories_sizes')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition ${
            mainTab === 'categories_sizes'
              ? 'border-blue-700 text-blue-900 bg-blue-50/60'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🏷️</span>
          <span>Tool Categories &amp; Standard Sizes</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('all_dropdowns')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition ${
            mainTab === 'all_dropdowns'
              ? 'border-blue-700 text-blue-900 bg-blue-50/60'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4 text-blue-700" />
          <span>All Master Dropdown Registers &amp; Lookups</span>
          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-mono font-bold">
            {getAllDropdownDefinitions().length} Registers
          </span>
        </button>
      </div>

      {/* TAB 1: TOOL CATEGORIES & SIZES */}
      {mainTab === 'categories_sizes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PANEL 1: TOOL CATEGORIES */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden flex flex-col h-[650px]">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-blue-800" />
              <h2 className="font-bold text-slate-900 text-sm">Tool Categories</h2>
            </div>
            <span className="text-xs text-slate-500">
              Showing <strong>{filteredCategories.length}</strong> of {categories.length}
            </span>
          </div>

          <div className="p-3 border-b border-slate-200 bg-white space-y-2">
            {!canEdit && (
              <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs font-semibold flex items-center gap-1.5">
                <span>🔒</span>
                <span>View-Only Mode: Administrative clearance required to modify master categories.</span>
              </div>
            )}

            {/* Add Category Form */}
            {canEdit && (
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="New Category Name (e.g. STABILIZER, ROLLER REAMER, MOTOR)"
                  className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-xs font-bold uppercase focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={!newCatName.trim()}
                  className="bg-[#107c41] hover:bg-[#0c6233] disabled:opacity-50 text-white font-bold text-xs px-3.5 py-1.5 rounded shadow-xs cursor-pointer flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Category</span>
                </button>
              </form>
            )}

            {/* Search filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                placeholder="Filter categories..."
                className="w-full pl-8 pr-3 py-1 text-xs border border-slate-200 rounded bg-slate-50/50 outline-none focus:bg-white focus:border-blue-400"
              />
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#e9f0f8] text-[#1a3055] font-bold border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-2 px-3 w-12 text-center">#</th>
                  <th className="py-2 px-3">Category Name</th>
                  <th className="py-2 px-3 text-center w-28">In Stock Tools</th>
                  <th className="py-2 px-3 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400">
                      No matching categories found.
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map((cat, idx) => {
                    const count = catCountMap.get(cat.toUpperCase()) || 0;
                    return (
                      <tr key={cat} className="hover:bg-blue-50/50 h-10">
                        <td className="py-2 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-bold text-slate-800">
                          {editingCatIdx === idx ? (
                            <input
                              type="text"
                              value={editingCatVal}
                              onChange={(e) => setEditingCatVal(e.target.value)}
                              className="border border-blue-500 rounded px-2 py-1 text-xs font-bold uppercase w-full outline-none"
                              autoFocus
                            />
                          ) : (
                            <span>{cat}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-mono">
                          {count > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-900 border border-blue-200">
                              {count} tool{count > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">0</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {!canEdit ? (
                            <span className="text-slate-400 text-xs">—</span>
                          ) : editingCatIdx === idx ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveCatEdit(idx)}
                                className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
                                title="Save"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCatIdx(null)}
                                className="text-slate-500 hover:text-slate-700 p-1 cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCatIdx(idx);
                                  setEditingCatVal(cat);
                                }}
                                className="text-blue-700 hover:text-blue-900 p-1 cursor-pointer"
                                title="Edit Category"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(cat)}
                                className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                                title="Delete Category"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* PANEL 2: TOOL SIZES */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden flex flex-col h-[650px]">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-emerald-800" />
              <h2 className="font-bold text-slate-900 text-sm">Standard Tool Sizes</h2>
            </div>
            <span className="text-xs text-slate-500">
              Showing <strong>{filteredSizes.length}</strong> of {sizes.length}
            </span>
          </div>

          <div className="p-3 border-b border-slate-200 bg-white space-y-2">
            {!canEdit && (
              <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs font-semibold flex items-center gap-1.5">
                <span>🔒</span>
                <span>View-Only Mode: Administrative clearance required to modify standard tool sizes.</span>
              </div>
            )}

            {/* Add Size Form */}
            {canEdit && (
              <form onSubmit={handleAddSize} className="flex gap-2">
                <input
                  type="text"
                  value={newSizeName}
                  onChange={(e) => setNewSizeName(e.target.value)}
                  placeholder="New Tool Size (e.g. 8-1/2&quot;, 12-1/4&quot;, 17-1/2&quot;, 26&quot;)"
                  className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={!newSizeName.trim()}
                  className="bg-[#107c41] hover:bg-[#0c6233] disabled:opacity-50 text-white font-bold text-xs px-3.5 py-1.5 rounded shadow-xs cursor-pointer flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Size</span>
                </button>
              </form>
            )}

            {/* Search filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={sizeSearch}
                onChange={(e) => setSizeSearch(e.target.value)}
                placeholder="Filter sizes..."
                className="w-full pl-8 pr-3 py-1 text-xs border border-slate-200 rounded bg-slate-50/50 outline-none focus:bg-white focus:border-blue-400"
              />
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#e9f0f8] text-[#1a3055] font-bold border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-2 px-3 w-12 text-center">#</th>
                  <th className="py-2 px-3">Size Specification</th>
                  <th className="py-2 px-3 text-center w-28">In Stock Tools</th>
                  <th className="py-2 px-3 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSizes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400">
                      No matching sizes found.
                    </td>
                  </tr>
                ) : (
                  filteredSizes.map((s, idx) => {
                    const count = sizeCountMap.get(s) || 0;
                    return (
                      <tr key={s} className="hover:bg-blue-50/50 h-10">
                        <td className="py-2 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-800">
                          {editingSizeIdx === idx ? (
                            <input
                              type="text"
                              value={editingSizeVal}
                              onChange={(e) => setEditingSizeVal(e.target.value)}
                              className="border border-blue-500 rounded px-2 py-1 text-xs font-mono font-bold w-full outline-none"
                              autoFocus
                            />
                          ) : (
                            <span>{s}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-mono">
                          {count > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200">
                              {count} tool{count > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">0</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {!canEdit ? (
                            <span className="text-slate-400 text-xs">—</span>
                          ) : editingSizeIdx === idx ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveSizeEdit(idx)}
                                className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
                                title="Save"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingSizeIdx(null)}
                                className="text-slate-500 hover:text-slate-700 p-1 cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSizeIdx(idx);
                                  setEditingSizeVal(s);
                                }}
                                className="text-blue-700 hover:text-blue-900 p-1 cursor-pointer"
                                title="Edit Size"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSize(s)}
                                className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                                title="Delete Size"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* TAB 2: ALL MASTER DROPDOWN REGISTERS & LOOKUPS */}
      {mainTab === 'all_dropdowns' && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden flex flex-col md:flex-row h-[720px]">
          {/* Left Column: Dropdown List Selector */}
          <div className="w-full md:w-80 border-r border-slate-200 flex flex-col bg-slate-50">
            <div className="p-3 border-b border-slate-200 bg-white">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-blue-700" />
                <span>System Dropdown Registers</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">Select any dropdown register to manage options</p>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {(['Commercial & Financial', 'Operations & Rig', 'Inventory & Fleet', 'Maintenance & QC', 'Consumables & Store'] as const).map((group) => {
                const defsInGroup = getAllDropdownDefinitions().filter((d) => d.group === group);
                return (
                  <div key={group} className="space-y-1">
                    <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {group}
                    </div>
                    {defsInGroup.map((d) => {
                      const isSelected = selectedDropdownKey === d.key;
                      const optCount = getDropdownOptions(d.key).length;
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => handleSelectDropdownKey(d.key)}
                          className={`w-full text-left px-2.5 py-2 rounded text-xs transition cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-blue-700 text-white font-bold shadow-xs'
                              : 'text-slate-700 hover:bg-slate-200/80 font-medium'
                          }`}
                        >
                          <span className="truncate pr-2">{d.label}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {optCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Options Management */}
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {(() => {
              const activeDef = DROPDOWN_DEFINITIONS[selectedDropdownKey];
              const filteredOpts = dropdownOptions.filter((o) =>
                o.toLowerCase().includes(dropdownSearch.toLowerCase().trim())
              );
              return (
                <>
                  <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded uppercase">
                          {activeDef.group}
                        </span>
                        <h2 className="font-bold text-slate-900 text-base">{activeDef.label}</h2>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{activeDef.description}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={handleResetDropdownList}
                          className="px-2.5 py-1 text-slate-500 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                          title="Restore default options"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Reset Defaults</span>
                        </button>
                      )}
                      <div className="px-2.5 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded text-xs font-bold font-mono">
                        {dropdownOptions.length} Options
                      </div>
                    </div>
                  </div>

                  {/* Add New Option Form */}
                  {canEdit && (
                    <div className="p-3 bg-slate-50/50 border-b border-slate-200">
                      <form onSubmit={handleAddDropdownOption} className="flex gap-2">
                        <input
                          type="text"
                          value={newDropdownOption}
                          onChange={(e) => setNewDropdownOption(e.target.value)}
                          placeholder={`Add new option to ${activeDef.label}...`}
                          className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-xs font-medium outline-none bg-white focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="submit"
                          className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Option</span>
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Search bar inside list */}
                  <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-3 text-xs">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        value={dropdownSearch}
                        onChange={(e) => setDropdownSearch(e.target.value)}
                        placeholder={`Search within ${activeDef.label}...`}
                        className="w-full pl-8 pr-2 py-1 text-xs border border-slate-300 rounded bg-white outline-none"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Showing {filteredOpts.length} of {dropdownOptions.length}
                    </span>
                  </div>

                  {/* Options Table */}
                  <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30">
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                          <tr>
                            <th className="p-2.5 w-12 text-center text-slate-400 font-mono">#</th>
                            <th className="p-2.5">Option Label / Value</th>
                            {canEdit && <th className="p-2.5 text-right w-24">Actions</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredOpts.length === 0 ? (
                            <tr>
                              <td colSpan={canEdit ? 3 : 2} className="p-6 text-center text-slate-400 font-medium">
                                No matching options found.
                              </td>
                            </tr>
                          ) : (
                            filteredOpts.map((opt, idx) => {
                              const isEditing = editingDropdownIdx === idx;
                              return (
                                <tr key={`${opt}-${idx}`} className="hover:bg-slate-50/80 transition">
                                  <td className="p-2.5 text-center text-slate-400 font-mono text-[11px]">
                                    {idx + 1}
                                  </td>
                                  <td className="p-2.5">
                                    {isEditing ? (
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="text"
                                          autoFocus
                                          value={editingDropdownVal}
                                          onChange={(e) => setEditingDropdownVal(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              handleSaveDropdownEdit(idx, opt);
                                            } else if (e.key === 'Escape') {
                                              setEditingDropdownIdx(null);
                                            }
                                          }}
                                          className="border-2 border-blue-500 rounded px-2 py-1 text-xs font-bold text-slate-900 outline-none flex-1 max-w-md"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleSaveDropdownEdit(idx, opt)}
                                          className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                          title="Save (Enter)"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingDropdownIdx(null)}
                                          className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer"
                                          title="Cancel (Esc)"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="font-semibold text-slate-800">{opt}</span>
                                    )}
                                  </td>
                                  {canEdit && (
                                    <td className="p-2.5 text-right whitespace-nowrap">
                                      {!isEditing && (
                                        <div className="flex items-center justify-end gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingDropdownIdx(idx);
                                              setEditingDropdownVal(opt);
                                            }}
                                            className="text-blue-700 hover:text-blue-900 p-1 rounded hover:bg-blue-50 cursor-pointer"
                                            title="Edit / Rename Option"
                                          >
                                            <Edit2 className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteDropdownOption(opt)}
                                            className="text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50 cursor-pointer"
                                            title="Delete Option"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
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
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
