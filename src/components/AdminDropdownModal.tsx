import React, { useState, useEffect } from 'react';
import {
  DropdownListKey,
  DROPDOWN_DEFINITIONS,
  getDropdownOptions,
  addDropdownOption,
  updateDropdownOption,
  deleteDropdownOption,
  resetDropdownList,
} from '../services/dropdownService';
import { Plus, Trash2, Edit2, Check, X, Shield, RefreshCw, Search } from 'lucide-react';

interface AdminDropdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  dropdownKey?: DropdownListKey;
  listKey?: DropdownListKey;
  isAdmin?: boolean;
  user?: { role?: string } | null;
  onUpdated?: (options: string[]) => void;
  onChanged?: (options: string[]) => void;
}

export const AdminDropdownModal: React.FC<AdminDropdownModalProps> = ({
  isOpen,
  onClose,
  dropdownKey: propDropdownKey,
  listKey: propListKey,
  isAdmin: propIsAdmin,
  user,
  onUpdated,
  onChanged,
}) => {
  const dropdownKey = (propDropdownKey || propListKey) as DropdownListKey;
  const isAdmin = propIsAdmin !== undefined ? propIsAdmin : (user?.role === 'Admin');
  const notifyUpdated = (opts: string[]) => {
    onUpdated?.(opts);
    onChanged?.(opts);
  };

  const def = dropdownKey ? DROPDOWN_DEFINITIONS[dropdownKey] : undefined;
  const [options, setOptions] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [newOptionName, setNewOptionName] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [toastMsg, setToastMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    if (isOpen && dropdownKey) {
      setOptions(getDropdownOptions(dropdownKey));
      setSearch('');
      setNewOptionName('');
      setEditingIdx(null);
      setToastMsg(null);
    }
  }, [isOpen, dropdownKey]);

  if (!isOpen || !def) return null;

  const showFeedback = (text: string, isError = false) => {
    setToastMsg({ text, isError });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showFeedback('Only Administrators can add dropdown options.', true);
      return;
    }
    const result = addDropdownOption(dropdownKey, newOptionName);
    if (result.success) {
      setOptions(result.options);
      setNewOptionName('');
      showFeedback(result.message);
      notifyUpdated(result.options);
    } else {
      showFeedback(result.message, true);
    }
  };

  const handleSaveEdit = (idx: number, oldVal: string) => {
    if (!isAdmin) {
      showFeedback('Only Administrators can edit dropdown options.', true);
      return;
    }
    const result = updateDropdownOption(dropdownKey, oldVal, editingValue);
    if (result.success) {
      setOptions(result.options);
      setEditingIdx(null);
      showFeedback(result.message);
      notifyUpdated(result.options);
    } else {
      showFeedback(result.message, true);
    }
  };

  const handleDelete = (val: string) => {
    if (!isAdmin) {
      showFeedback('Only Administrators can delete dropdown options.', true);
      return;
    }
    if (window.confirm(`Are you sure you want to delete option "${val}" from ${def.label}?`)) {
      const result = deleteDropdownOption(dropdownKey, val);
      if (result.success) {
        setOptions(result.options);
        showFeedback(result.message);
        notifyUpdated(result.options);
      } else {
        showFeedback(result.message, true);
      }
    }
  };

  const handleReset = () => {
    if (!isAdmin) return;
    if (window.confirm(`Reset "${def.label}" to system default options? Any custom entries will be restored to defaults.`)) {
      const reset = resetDropdownList(dropdownKey);
      setOptions(reset);
      showFeedback('Reset to default options successfully.');
      notifyUpdated(reset);
    }
  };

  const filtered = options.filter((o) => o.toLowerCase().includes(search.toLowerCase().trim()));

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
      <div className="bg-[#f0f4f8] border-2 border-[#1a3055] rounded-lg shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#1a3055] text-white px-4 py-3 flex items-center justify-between border-b border-blue-950">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold tracking-tight">Admin Dropdown Manager: {def.label}</h2>
              <p className="text-[10px] text-blue-200">{def.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white font-bold text-lg cursor-pointer px-1.5 py-0.5 rounded hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {/* Toast Feedback */}
        {toastMsg && (
          <div
            className={`px-4 py-1.5 text-xs font-bold text-center border-b ${
              toastMsg.isError ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
            }`}
          >
            {toastMsg.text}
          </div>
        )}

        {/* Add New Option Form */}
        {isAdmin && (
          <div className="p-3 bg-white border-b border-slate-200">
            <form onSubmit={handleAdd} className="flex gap-2">
              <input
                type="text"
                value={newOptionName}
                onChange={(e) => setNewOptionName(e.target.value)}
                placeholder={`Type new option to add to ${def.label}...`}
                className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-xs font-medium outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 focus:bg-white"
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

        {/* Search Bar & Counter */}
        <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter options..."
              className="w-full pl-8 pr-2 py-1 text-xs border border-slate-300 rounded bg-white outline-none"
            />
          </div>
          <div className="text-[11px] text-slate-500 font-semibold">
            Total Options: <strong className="text-slate-800">{options.length}</strong>
          </div>
        </div>

        {/* Options List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 bg-slate-50">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400 font-semibold">
              No matching options found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isEditing = editingIdx === idx;
              return (
                <div
                  key={`${item}-${idx}`}
                  className="flex items-center justify-between p-2 bg-white rounded border border-slate-200 hover:border-slate-300 transition text-xs shadow-2xs"
                >
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 mr-2">
                      <input
                        type="text"
                        autoFocus
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveEdit(idx, item);
                          } else if (e.key === 'Escape') {
                            setEditingIdx(null);
                          }
                        }}
                        className="flex-1 border-2 border-blue-500 rounded px-2 py-1 text-xs font-bold text-slate-800 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(idx, item)}
                        className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                        title="Save Changes"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingIdx(null)}
                        className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                      <span>{item}</span>
                    </div>
                  )}

                  {!isEditing && isAdmin && (
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIdx(idx);
                          setEditingValue(item);
                        }}
                        className="p-1 text-slate-400 hover:text-blue-700 rounded hover:bg-blue-50 cursor-pointer"
                        title="Edit / Rename Option"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="p-1 text-slate-400 hover:text-rose-700 rounded hover:bg-rose-50 cursor-pointer"
                        title="Delete Option"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs">
          {isAdmin ? (
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] text-slate-500 hover:text-rose-700 flex items-center gap-1 font-semibold cursor-pointer"
              title="Reset options to original factory defaults"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Defaults</span>
            </button>
          ) : (
            <span className="text-[11px] text-slate-400">View-only mode</span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded font-bold text-xs cursor-pointer shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
