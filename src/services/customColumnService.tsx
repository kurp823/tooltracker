import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom Column Definition Schema
 */
export interface CustomColumnDef {
  id: string; // Unique slug e.g. "bha_number"
  key: string;
  label: string; // Header display text e.g. "BHA Number"
  modelKey: string; // Model identifier e.g. "jobs", "dossier_checklist", "inventory"
  type: 'string' | 'number' | 'date' | 'select' | 'boolean';
  width: number; // Width in px e.g. 140
  visible: boolean;
  required?: boolean;
  options?: string[]; // Options for select type e.g. ["A", "B"]
  defaultValue?: any;
  createdDate?: string;
  createdBy?: string;
}

const STORAGE_CUSTOM_COLUMNS_KEY = 'emdad_custom_columns_master';
const STORAGE_COL_WIDTHS_PREFIX = 'emdad_table_widths_';

/**
 * Universal Hook for Excel-like Drag-to-Resize Table Columns
 */
export function useResizableColumns(tableId: string, initialWidths: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_COL_WIDTHS_PREFIX}${tableId}`);
      if (saved) {
        return { ...initialWidths, ...JSON.parse(saved) };
      }
    } catch (e) {}
    return initialWidths;
  });

  const widthsRef = useRef(widths);
  useEffect(() => {
    widthsRef.current = widths;
  }, [widths]);

  const resizingRef = useRef<{ colKey: string; startX: number; startWidth: number } | null>(null);

  const startResize = useCallback((colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const currentWidth = widthsRef.current[colKey] || initialWidths[colKey] || 120;
    resizingRef.current = {
      colKey,
      startX: e.clientX,
      startWidth: currentWidth,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const active = resizingRef.current;
      if (!active) return;
      const deltaX = moveEvent.clientX - active.startX;
      const newWidth = Math.max(40, active.startWidth + deltaX);
      setWidths((prev) => ({
        ...prev,
        [active.colKey]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      const active = resizingRef.current;
      if (active) {
        setWidths((latest) => {
          try {
            localStorage.setItem(`${STORAGE_COL_WIDTHS_PREFIX}${tableId}`, JSON.stringify(latest));
          } catch (e) {}
          return latest;
        });
      }
      resizingRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [initialWidths, tableId]);

  const resetWidths = useCallback(() => {
    setWidths(initialWidths);
    try {
      localStorage.removeItem(`${STORAGE_COL_WIDTHS_PREFIX}${tableId}`);
    } catch (e) {}
  }, [initialWidths, tableId]);

  const resetColumn = useCallback((colKey: string) => {
    setWidths((prev) => {
      const next = { ...prev, [colKey]: initialWidths[colKey] || 120 };
      try {
        localStorage.setItem(`${STORAGE_COL_WIDTHS_PREFIX}${tableId}`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }, [initialWidths, tableId]);

  return { widths, startResize, resetWidths, resetColumn };
}

/**
 * Excel-Style Resize Divider Handle Component
 */
export const ResizerHandle: React.FC<{
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
}> = ({ onMouseDown, onDoubleClick }) => {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
      title="Click and drag to resize column. Double-click to reset width."
      className="absolute top-0 right-0 w-3.5 h-full cursor-col-resize select-none group flex items-center justify-center z-20 hover:bg-amber-400/40 transition-colors"
      style={{ transform: 'translateX(50%)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-[1.5px] h-full bg-slate-300 group-hover:bg-amber-600 transition-colors group-hover:w-[2.5px]" />
    </div>
  );
};

/**
 * Load Custom Columns for a given model (or all models)
 */
export function getCustomColumns(modelKey?: string): CustomColumnDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_COLUMNS_KEY);
    if (raw) {
      const parsed: CustomColumnDef[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (!modelKey) return parsed;
        return parsed.filter((c) => c.modelKey === modelKey);
      }
    }
  } catch (e) {}
  return [];
}

/**
 * Save Custom Columns locally and broadcast to other components
 */
export function saveCustomColumns(cols: CustomColumnDef[]): void {
  try {
    localStorage.setItem(STORAGE_CUSTOM_COLUMNS_KEY, JSON.stringify(cols));
    window.dispatchEvent(new CustomEvent('custom_columns_updated', { detail: cols }));
  } catch (e) {}
}

/**
 * Hook to listen to custom columns for a specific model live
 */
export function useCustomColumns(modelKey: string) {
  const [columns, setColumns] = useState<CustomColumnDef[]>(() => getCustomColumns(modelKey));

  useEffect(() => {
    const handleUpdate = () => {
      setColumns(getCustomColumns(modelKey));
    };

    window.addEventListener('custom_columns_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('custom_columns_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [modelKey]);

  return columns;
}
