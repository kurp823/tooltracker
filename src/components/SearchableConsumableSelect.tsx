import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ConsumableItem } from '../types';
import { Search, ChevronDown, Check, AlertTriangle, Package } from 'lucide-react';

interface SearchableConsumableSelectProps {
  items: ConsumableItem[];
  selectedPartNo: string;
  onSelect: (item: ConsumableItem) => void;
  disabled?: boolean;
  className?: string;
}

export const SearchableConsumableSelect: React.FC<SearchableConsumableSelectProps> = ({
  items,
  selectedPartNo,
  onSelect,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedItem = useMemo(() => {
    return items.find((i) => i.partNo === selectedPartNo);
  }, [items, selectedPartNo]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.partNo.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        i.binLocation.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full border rounded p-2 text-left bg-white transition cursor-pointer flex items-center justify-between shadow-2xs ${
          isOpen ? 'ring-2 ring-blue-500 border-blue-500' : 'border-slate-300 hover:border-slate-400'
        } ${disabled ? 'bg-slate-100 cursor-not-allowed opacity-60' : ''}`}
      >
        {selectedItem ? (
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center space-x-2">
              <span className="font-mono font-bold text-blue-900 text-xs">
                {selectedItem.partNo}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {selectedItem.category}
              </span>
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                  selectedItem.currentStock === 0
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : selectedItem.currentStock <= selectedItem.reorderLevel
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}
              >
                {selectedItem.currentStock} {selectedItem.unit} in stock
              </span>
            </div>
            <div className="text-[11px] text-slate-600 truncate mt-0.5">
              {selectedItem.description} • Bin: {selectedItem.binLocation} • AED {selectedItem.unitCostAED.toLocaleString()}
            </div>
          </div>
        ) : (
          <span className="text-slate-400 text-xs italic">Select a consumable SKU...</span>
        )}

        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in duration-100 max-h-80 flex flex-col">
          {/* Search Header */}
          <div className="p-2 border-b border-slate-200 bg-slate-50 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-4 top-4" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search part #, description, category, bin..."
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Items List */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
            {filteredItems.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-xs">
                No consumable items match "{search}".
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = item.partNo === selectedPartNo;
                const isOutOfStock = item.currentStock === 0;
                const isLowStock = item.currentStock <= item.reorderLevel;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelect(item);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`p-2.5 transition cursor-pointer flex items-start justify-between hover:bg-blue-50/60 ${
                      isSelected ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      {/* Line 1: Part Number & Badges */}
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          {item.partNo}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {item.category}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                            isOutOfStock
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : isLowStock
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          }`}
                        >
                          {isOutOfStock ? '0 Out of Stock' : `${item.currentStock} ${item.unit} available`}
                        </span>
                      </div>

                      {/* Line 2: Description & Location & Cost */}
                      <div className="text-[11px] text-slate-600 mt-1 line-clamp-2">
                        {item.description}
                      </div>

                      <div className="flex items-center space-x-3 text-[10px] text-slate-400 mt-1 font-mono">
                        <span>Bin: <strong>{item.binLocation}</strong></span>
                        <span>Unit Cost: <strong className="text-slate-700">AED {item.unitCostAED.toLocaleString()}</strong></span>
                        {item.supplier && <span>Supplier: {item.supplier}</span>}
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-600 flex-shrink-0 mt-1" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
