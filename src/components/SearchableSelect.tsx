import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
  count?: number | string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allOptionLabel?: string;
  allOptionValue?: string;
  searchPlaceholder?: string;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  prefixIcon?: React.ReactNode;
  maxDisplayLimit?: number;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  allOptionLabel,
  allOptionValue = '',
  searchPlaceholder = 'Type to search...',
  className = '',
  buttonClassName = '',
  dropdownClassName = '',
  prefixIcon,
  maxDisplayLimit = 150,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Determine current selected option
  const selectedOption = useMemo(() => {
    if (allOptionLabel && (value === allOptionValue || !value)) {
      return null;
    }
    return options.find((opt) => opt.value === value) || null;
  }, [options, value, allOptionLabel, allOptionValue]);

  // Filter options based on search query (multi-token support)
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const tokens = searchTerm.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return options.filter((opt) => {
      const targetStr = `${opt.label} ${opt.subLabel || ''} ${opt.value} ${opt.badge || ''}`.toLowerCase();
      return tokens.every((token) => targetStr.includes(token));
    });
  }, [options, searchTerm]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(-1);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const totalItems = (allOptionLabel ? 1 : 0) + Math.min(filteredOptions.length, maxDisplayLimit);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < totalItems ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : totalItems - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allOptionLabel && highlightedIndex === 0) {
        handleSelect(allOptionValue);
      } else {
        const offset = allOptionLabel ? 1 : 0;
        const targetOption = filteredOptions[highlightedIndex - offset];
        if (targetOption) {
          handleSelect(targetOption.value);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearchTerm('');
  };

  const isAllSelected = allOptionLabel && (value === allOptionValue || !value);

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1 text-xs rounded border transition-colors cursor-pointer text-left select-none focus:outline-none focus:ring-1 focus:ring-amber-500 ${
          disabled
            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
            : isOpen
            ? 'bg-white text-slate-900 border-amber-500 shadow-xs'
            : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {prefixIcon && <span className="shrink-0 text-slate-400">{prefixIcon}</span>}
          <div className="truncate font-medium">
            {isAllSelected ? (
              <span className="text-slate-700 font-semibold">{allOptionLabel}</span>
            ) : selectedOption ? (
              <span className="text-slate-900 font-semibold font-mono">
                {selectedOption.label}
                {selectedOption.subLabel && (
                  <span className="font-normal font-sans text-slate-500 ml-1.5">
                    {selectedOption.subLabel}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-slate-400">{placeholder}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {/* Clear Button if custom option selected */}
          {allOptionLabel && !isAllSelected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(allOptionValue);
              }}
              title="Clear selection"
              className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700 transition"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-amber-600' : ''
            }`}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute left-0 mt-1 w-full min-w-[260px] max-w-[460px] bg-white rounded-lg shadow-xl border border-slate-200/90 z-50 overflow-hidden flex flex-col text-xs animate-in fade-in-50 duration-100 ${dropdownClassName}`}
          style={{ minWidth: 'max(100%, 260px)' }}
        >
          {/* Search Input Bar */}
          <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="p-0.5 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Results Summary if filtered */}
          {searchTerm.trim() && (
            <div className="px-2.5 py-1 text-[10px] bg-slate-100 text-slate-500 font-semibold border-b border-slate-200 flex justify-between items-center">
              <span>Matches:</span>
              <span className="font-mono">{filteredOptions.length} found</span>
            </div>
          )}

          {/* Options Scrollable List */}
          <div ref={listRef} className="max-h-64 overflow-y-auto overscroll-contain py-1 divide-y divide-slate-50">
            {/* "All" Option at Top if provided */}
            {allOptionLabel && !searchTerm.trim() && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(allOptionValue)}
                className={`px-3 py-1.5 flex items-center justify-between cursor-pointer transition-colors ${
                  isAllSelected
                    ? 'bg-amber-50 text-amber-900 font-bold'
                    : highlightedIndex === 0
                    ? 'bg-slate-100 text-slate-900 font-medium'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="font-semibold text-xs">{allOptionLabel}</span>
                {isAllSelected && <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
              </div>
            )}

            {/* Filtered Options */}
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-slate-400 italic text-xs">
                No matching options found for &quot;{searchTerm}&quot;
              </div>
            ) : (
              filteredOptions.slice(0, maxDisplayLimit).map((opt, idx) => {
                const isSelected = opt.value === value;
                const itemIndex = (allOptionLabel && !searchTerm.trim() ? 1 : 0) + idx;
                const isHighlighted = itemIndex === highlightedIndex;

                return (
                  <div
                    key={opt.value}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelect(opt.value)}
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    className={`px-3 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-amber-50 text-amber-900 font-bold'
                        : isHighlighted
                        ? 'bg-slate-100 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-mono font-semibold text-xs text-slate-900 truncate">
                          {opt.label}
                        </span>
                        {opt.badge && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-medium shrink-0">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.subLabel && (
                        <span className="text-[11px] text-slate-500 truncate mt-0.5">
                          {opt.subLabel}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.count !== undefined && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {opt.count}
                        </span>
                      )}
                      {isSelected && <Check className="w-3.5 h-3.5 text-amber-600" />}
                    </div>
                  </div>
                );
              })
            )}

            {/* Overflow warning */}
            {filteredOptions.length > maxDisplayLimit && (
              <div className="p-1.5 bg-slate-50 text-slate-500 text-[10px] text-center italic border-t border-slate-200">
                Showing first {maxDisplayLimit} of {filteredOptions.length} results. Type to refine search.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
