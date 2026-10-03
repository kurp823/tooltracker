import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Shield, FolderPlus, Tag } from 'lucide-react';

interface AdminCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  onUpdateCategories: (categories: string[]) => void;
  sizes: string[];
  onUpdateSizes: (sizes: string[]) => void;
  isAdmin?: boolean;
}

export const AdminCategoriesModal: React.FC<AdminCategoriesModalProps> = ({
  isOpen,
  onClose,
  categories,
  onUpdateCategories,
  sizes,
  onUpdateSizes,
  isAdmin = true,
}) => {
  const [activeTab, setActiveTab] = useState<'categories' | 'sizes'>('categories');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryIdx, setEditingCategoryIdx] = useState<number | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState('');

  const [newSizeName, setNewSizeName] = useState('');
  const [editingSizeIdx, setEditingSizeIdx] = useState<number | null>(null);
  const [editingSizeValue, setEditingSizeValue] = useState('');

  if (!isOpen) return null;

  // Category Actions
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim().toUpperCase();
    if (!trimmed) return;
    if (categories.some((c) => c.toUpperCase() === trimmed)) {
      alert(`Category "${trimmed}" already exists.`);
      return;
    }
    const updated = [...categories, trimmed].sort();
    onUpdateCategories(updated);
    setNewCategoryName('');
  };

  const handleSaveCategoryEdit = (idx: number) => {
    const trimmed = editingCategoryValue.trim().toUpperCase();
    if (!trimmed) return;
    const updated = [...categories];
    updated[idx] = trimmed;
    onUpdateCategories(updated.sort());
    setEditingCategoryIdx(null);
  };

  const handleDeleteCategory = (cat: string) => {
    if (window.confirm(`Are you sure you want to delete category "${cat}"?`)) {
      const updated = categories.filter((c) => c !== cat);
      onUpdateCategories(updated);
    }
  };

  // Size Actions
  const handleAddSize = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSizeName.trim();
    if (!trimmed) return;
    if (sizes.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      alert(`Tool Size "${trimmed}" already exists.`);
      return;
    }
    const updated = [...sizes, trimmed];
    onUpdateSizes(updated);
    setNewSizeName('');
  };

  const handleSaveSizeEdit = (idx: number) => {
    const trimmed = editingSizeValue.trim();
    if (!trimmed) return;
    const updated = [...sizes];
    updated[idx] = trimmed;
    onUpdateSizes(updated);
    setEditingSizeIdx(null);
  };

  const handleDeleteSize = (size: string) => {
    if (window.confirm(`Are you sure you want to delete size "${size}"?`)) {
      const updated = sizes.filter((s) => s !== size);
      onUpdateSizes(updated);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
      <div
        className="bg-[#dce6f1] border-2 border-[#1a3055] rounded-md shadow-2xl w-full max-w-2xl h-[560px] max-h-[92vh] flex flex-col overflow-hidden"
        style={{ fontFamily: "'Calibri', 'Arial Nova', 'Segoe UI', Arial, sans-serif", fontSize: '9pt' }}
      >
        {/* Modal Window Header */}
        <div className="bg-[#1a3055] text-white px-3 py-2 flex items-center justify-between text-xs font-bold flex-shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <span>Admin Management &bull; Tool Categories &amp; Sizes Master</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-amber-300 font-bold text-base cursor-pointer px-1"
          >
            &times;
          </button>
        </div>

        {/* Sub-tab strip */}
        <div className="bg-slate-200 border-b border-[#9fb6cf] flex items-center gap-1 px-3 pt-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`px-3 py-1.5 text-xs font-bold rounded-t border-t border-x transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'categories'
                ? 'bg-white border-[#9fb6cf] text-[#1a3055] shadow-xs'
                : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FolderPlus className="w-3.5 h-3.5 text-blue-700" />
            <span>Tool Categories ({categories.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sizes')}
            className={`px-3 py-1.5 text-xs font-bold rounded-t border-t border-x transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sizes'
                ? 'bg-white border-[#9fb6cf] text-[#1a3055] shadow-xs'
                : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Tag className="w-3.5 h-3.5 text-emerald-700" />
            <span>Tool Sizes ({sizes.length})</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-3 flex-1 flex flex-col min-h-0 space-y-3 bg-white">
          {activeTab === 'categories' && (
            <>
              {/* Add Category Form */}
              <form onSubmit={handleAddCategory} className="flex items-center gap-2 bg-slate-50 p-2 border border-slate-200 rounded">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Enter new Category Name (e.g. STABILIZER, ROLLER REAMER, MWD)"
                  className="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-800 uppercase focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={!newCategoryName.trim()}
                  className="bg-[#107c41] hover:bg-[#0c6233] disabled:opacity-50 text-white font-bold text-xs px-3 py-1 rounded shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Category</span>
                </button>
              </form>

              {/* Categories List */}
              <div className="flex-1 min-h-0 border border-slate-200 rounded overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-slate-200 font-bold text-[11px] sticky top-0">
                    <tr>
                      <th className="py-1 px-3 w-12 text-center">#</th>
                      <th className="py-1 px-3">Category Name</th>
                      <th className="py-1 px-3 text-right w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {categories.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-slate-400">
                          No categories defined yet.
                        </td>
                      </tr>
                    ) : (
                      categories.map((cat, idx) => (
                        <tr key={cat} className="hover:bg-blue-50/50 h-8">
                          <td className="py-1 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                          <td className="py-1 px-3 font-bold text-slate-800">
                            {editingCategoryIdx === idx ? (
                              <input
                                type="text"
                                value={editingCategoryValue}
                                onChange={(e) => setEditingCategoryValue(e.target.value)}
                                className="border border-blue-500 rounded px-2 py-0.5 text-xs font-bold uppercase w-full outline-none"
                                autoFocus
                              />
                            ) : (
                              <span>{cat}</span>
                            )}
                          </td>
                          <td className="py-1 px-3 text-right">
                            {editingCategoryIdx === idx ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveCategoryEdit(idx)}
                                  className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
                                  title="Save"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCategoryIdx(null)}
                                  className="text-slate-500 hover:text-slate-700 p-1 cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCategoryIdx(idx);
                                    setEditingCategoryValue(cat);
                                  }}
                                  className="text-blue-700 hover:text-blue-900 p-1 cursor-pointer"
                                  title="Edit Category Name"
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
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'sizes' && (
            <>
              {/* Add Size Form */}
              <form onSubmit={handleAddSize} className="flex items-center gap-2 bg-slate-50 p-2 border border-slate-200 rounded">
                <input
                  type="text"
                  value={newSizeName}
                  onChange={(e) => setNewSizeName(e.target.value)}
                  placeholder="Enter new Tool Size (e.g. 8-1/2&quot;, 12-1/4&quot;, 17-1/2&quot;, 26&quot;)"
                  className="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={!newSizeName.trim()}
                  className="bg-[#107c41] hover:bg-[#0c6233] disabled:opacity-50 text-white font-bold text-xs px-3 py-1 rounded shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Size</span>
                </button>
              </form>

              {/* Sizes List */}
              <div className="flex-1 min-h-0 border border-slate-200 rounded overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-slate-200 font-bold text-[11px] sticky top-0">
                    <tr>
                      <th className="py-1 px-3 w-12 text-center">#</th>
                      <th className="py-1 px-3">Tool Size</th>
                      <th className="py-1 px-3 text-right w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sizes.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-slate-400">
                          No tool sizes defined yet.
                        </td>
                      </tr>
                    ) : (
                      sizes.map((s, idx) => (
                        <tr key={s} className="hover:bg-blue-50/50 h-8">
                          <td className="py-1 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                          <td className="py-1 px-3 font-mono font-bold text-slate-800">
                            {editingSizeIdx === idx ? (
                              <input
                                type="text"
                                value={editingSizeValue}
                                onChange={(e) => setEditingSizeValue(e.target.value)}
                                className="border border-blue-500 rounded px-2 py-0.5 text-xs font-mono font-bold w-full outline-none"
                                autoFocus
                              />
                            ) : (
                              <span>{s}</span>
                            )}
                          </td>
                          <td className="py-1 px-3 text-right">
                            {editingSizeIdx === idx ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveSizeEdit(idx)}
                                  className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
                                  title="Save"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingSizeIdx(null)}
                                  className="text-slate-500 hover:text-slate-700 p-1 cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSizeIdx(idx);
                                    setEditingSizeValue(s);
                                  }}
                                  className="text-blue-700 hover:text-blue-900 p-1 cursor-pointer"
                                  title="Edit Tool Size"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSize(s)}
                                  className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                                  title="Delete Tool Size"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Footer Notice & Close Button */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 flex-shrink-0">
            <span className="text-[11px] text-slate-500">
              Changes made here immediately update tool selection filters across all job checklists and dossiers.
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1 rounded bg-[#1a3055] text-white font-bold hover:bg-[#264478] cursor-pointer text-xs"
            >
              Done &amp; Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
