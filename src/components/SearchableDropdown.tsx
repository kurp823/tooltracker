import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';

export interface SearchableDropdownOption {
  value: string;
  label: string;
  count?: number;
}

interface SearchableDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: (string | SearchableDropdownOption)[];
  placeholder?: string;
  searchPlaceholder?: string;
  allLabel?: string;
  totalCount?: number;
  className?: string;
  dropdownWidth?: string; // e.g. 'w-72', 'w-80'
  title?: string;
}

export const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select option',
  searchPlaceholder = 'Search options...',
  allLabel = 'All Categories',
  totalCount,
  className = '',
  dropdownWidth = 'w-72',
  title = 'Click to filter',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Normalize options to object form
  const normalizedOptions: SearchableDropdownOption[] = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt };
      }
      return opt;
    });
  }, [options]);

  // Click outside and escape key handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      // Auto-focus search input when opened
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Filtered options based on search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter((opt) =>
      opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q)
    );
  }, [normalizedOptions, searchQuery]);

  // Active label display
  const currentLabel = useMemo(() => {
    if (value === 'ALL' || !value) {
      return totalCount !== undefined ? `${allLabel} (${totalCount})` : allLabel;
    }
    const found = normalizedOptions.find((o) => o.value === value);
    return found ? found.label : value;
  }, [value, normalizedOptions, allLabel, totalCount]);

  const isFiltered = value !== 'ALL' && Boolean(value);

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setSearchQuery('');
        }}
        title={title}
        className={`bg-white border ${
          isFiltered
            ? 'border-blue-600 ring-1 ring-blue-500 bg-blue-50/40 text-blue-900 font-bold'
            : 'border-[#b8c9db] text-slate-800 font-medium hover:bg-slate-50'
        } rounded px-2.5 py-1 text-xs outline-none flex items-center justify-between gap-2 cursor-pointer shadow-2xs transition max-w-[280px] min-w-[160px]`}
      >
        <span className="truncate">{currentLabel}</span>
        <div className="flex items-center gap-1 flex-shrink-0 text-slate-400">
          {isFiltered && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange('ALL');
              }}
              className="hover:text-rose-600 hover:bg-rose-50 rounded p-0.5 cursor-pointer"
              title="Clear selection"
            >
              <X className="w-3 h-3 text-rose-500" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Floating Searchable Popover Menu */}
      {isOpen && (
        <div
          className={`absolute top-full left-0 mt-1 ${dropdownWidth} bg-white border border-[#9fb6cf] rounded-lg shadow-2xl z-50 p-2 text-xs flex flex-col max-h-80 animate-in fade-in zoom-in-95 duration-100`}
          style={{ fontFamily: "'Calibri', 'Arial Nova', 'Segoe UI', Arial, sans-serif" }}
        >
          {/* Search Box */}
          <div className="relative mb-1.5 flex-shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-7 pr-7 py-1 bg-slate-50 border border-slate-300 rounded text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 font-medium outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options List - Bounded Height & Scrollable */}
          <div className="overflow-y-auto max-h-56 divide-y divide-slate-100 pr-1">
            {/* 'ALL' option */}
            <button
              type="button"
              onClick={() => {
                onChange('ALL');
                setIsOpen(false);
              }}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between transition cursor-pointer ${
                value === 'ALL' || !value
                  ? 'bg-blue-100 font-bold text-blue-900'
                  : 'hover:bg-slate-100 text-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                {(value === 'ALL' || !value) && <Check className="w-3.5 h-3.5 text-blue-700 flex-shrink-0" />}
                <span className="truncate">{allLabel}</span>
              </div>
              {totalCount !== undefined && (
                <span className="text-[10px] font-mono text-slate-400 font-bold ml-1">{totalCount}</span>
              )}
            </button>

            {/* Empty search results state */}
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-slate-400 text-[11px]">
                No items matching &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between transition cursor-pointer ${
                      isSelected
                        ? 'bg-blue-100 font-bold text-blue-900'
                        : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate pr-2">
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-700 flex-shrink-0" />}
                      <span className="truncate" title={opt.label}>
                        {opt.label}
                      </span>
                    </div>
                    {opt.count !== undefined && (
                      <span className="text-[10px] font-mono text-slate-400 font-bold ml-1 flex-shrink-0">
                        {opt.count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer info */}
          <div className="pt-1.5 mt-1 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 flex-shrink-0">
            <span>Showing {filteredOptions.length} of {normalizedOptions.length}</span>
            <span>ESC to close</span>
          </div>
        </div>
      )}
    </div>
  );
};
