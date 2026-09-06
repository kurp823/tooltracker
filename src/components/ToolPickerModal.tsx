import React, { useState, useEffect } from 'react';
import { ToolItem } from '../types';

interface ToolPickerModalProps {
  category: string;
  size: string;
  inventory: ToolItem[];
  excludeIds: string[];
  maxSelect: number;
  preSelectedIds?: string[];
  onConfirm: (selectedTools: ToolItem[]) => void;
  onClose: () => void;
}

export const ToolPickerModal: React.FC<ToolPickerModalProps> = ({
  category,
  size,
  inventory,
  excludeIds,
  maxSelect,
  preSelectedIds = [],
  onConfirm,
  onClose,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(preSelectedIds);

  const norm = (s: string) => (s || '').trim().toUpperCase();
  const normSize = (s: string) => (s || '').trim().toLowerCase().replace(/["″]+\s*$/, '');

  const candidates = inventory.filter(
    (t) =>
      norm(t.shortDesc) === norm(category) &&
      normSize(t.size) === normSize(size)
  );

  const toggleTool = (tool: ToolItem, isAvailable: boolean) => {
    if (!isAvailable && !selectedIds.includes(tool.id)) return;

    if (selectedIds.includes(tool.id)) {
      setSelectedIds(selectedIds.filter((id) => id !== tool.id));
    } else {
      if (selectedIds.length >= maxSelect) return;
      setSelectedIds([...selectedIds, tool.id]);
    }
  };

  const handleSave = () => {
    const tools = selectedIds
      .map((id) => inventory.find((t) => t.id === id))
      .filter((t): t is ToolItem => Boolean(t));
    onConfirm(tools);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="font-bold text-sm">Select Physical Tools</h3>
            <div className="text-[11px] text-slate-300">
              {category} &bull; Size {size} &bull; Select up to {maxSelect} unit(s)
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-amber-300 font-bold text-lg leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 text-xs">
          {candidates.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium bg-slate-50 rounded border border-slate-200">
              ⚠️ No tools found in inventory matching <strong>{category}</strong> with size{' '}
              <strong>{size}</strong>.
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#b8c9db] rounded">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold">
                  <tr>
                    <th className="px-3 py-2 w-10 text-center">Select</th>
                    <th className="px-3 py-2">Serial / System ID</th>
                    <th className="px-3 py-2">Asset No</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Ownership</th>
                    <th className="px-3 py-2">Location / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {candidates.map((t) => {
                    const isExcluded = excludeIds.includes(t.id) && !preSelectedIds.includes(t.id);
                    const isGood = t.status === 'Good';
                    const isAtBase = ['Emdad Base', 'Base', 'Our Base'].includes(t.location);
                    const isAvailable = (isGood && isAtBase && !isExcluded) || selectedIds.includes(t.id);
                    const isChecked = selectedIds.includes(t.id);
                    const reachedMax = selectedIds.length >= maxSelect && !isChecked;

                    let statusBadge = (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Ready at Base
                      </span>
                    );
                    if (isExcluded) {
                      statusBadge = (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                          Reserved
                        </span>
                      );
                    } else if (!isGood) {
                      statusBadge = (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          {t.status}
                        </span>
                      );
                    } else if (!isAtBase) {
                      statusBadge = (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                          {t.location}
                        </span>
                      );
                    }

                    return (
                      <tr
                        key={t.id}
                        onClick={() => toggleTool(t, isAvailable)}
                        className={`transition cursor-pointer ${
                          isChecked
                            ? 'bg-amber-50/80 font-medium'
                            : isAvailable
                            ? 'hover:bg-[#e4eef8]'
                            : 'opacity-50 bg-slate-50 cursor-not-allowed'
                        }`}
                      >
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isAvailable || reachedMax}
                            onChange={() => toggleTool(t, isAvailable)}
                            className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-amber-900">{t.serial}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{t.assetNo || '—'}</td>
                        <td className="px-3 py-2 text-slate-700 max-w-xs truncate" title={t.desc}>
                          {t.desc}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-600">{t.ownership}</td>
                        <td className="px-3 py-2">{statusBadge}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-[#b8c9db] flex justify-between items-center flex-shrink-0 text-xs">
          <div className="font-bold text-slate-600">
            Selected: <span className="font-mono text-amber-800 text-sm">{selectedIds.length}</span> of{' '}
            <span className="font-mono">{maxSelect}</span> needed
          </div>
          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={candidates.length === 0}
              className="px-4 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              Confirm Selection &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
