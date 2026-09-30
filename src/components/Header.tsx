import React from 'react';
import { DbConnectionStatus } from '../services/api';

interface HeaderProps {
  syncStatus?: 'idle' | 'syncing' | 'saved' | 'error';
  isSyncing?: boolean;
  dbStatus?: DbConnectionStatus;
  onSync?: () => void;
  onRefresh?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  syncStatus,
  isSyncing,
  dbStatus,
  onSync,
  onRefresh,
  isSidebarCollapsed,
  onToggleSidebar,
}) => {
  const syncing = isSyncing || syncStatus === 'syncing';
  const handleRefresh = onRefresh || onSync || (() => {});

  return (
    <header className="bg-[#0b192c] text-white px-4 py-2.5 flex items-center justify-between shadow-md border-b border-[#182944] no-print sticky top-0 z-40 transition-colors">
      <div className="flex items-center space-x-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg bg-[#14263f] hover:bg-[#1f375a] text-slate-300 hover:text-white border border-[#233d63] transition cursor-pointer flex items-center justify-center"
            title={isSidebarCollapsed ? 'Expand Navigation Sidebar' : 'Collapse Navigation Sidebar'}
          >
            <span className="text-xs font-bold font-mono">
              {isSidebarCollapsed ? '▶' : '◀'}
            </span>
          </button>
        )}

        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-[#0b192c] text-sm shadow">
          E
        </div>

        <div>
          <div className="flex items-center space-x-2">
            <span className="font-extrabold text-sm tracking-wide text-white">EMDAD LLC</span>
            {dbStatus?.isConnected ? (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1"
                title={dbStatus.message || 'Connected to live Azure SQL'}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>AZURE SQL LIVE ({dbStatus.counts.jobs} Jobs · {dbStatus.counts.inventory} Tools)</span>
              </span>
            ) : (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center space-x-1"
                title="Demo/Local cache active. Refresh or configure SQL endpoint in Settings to pull live database rows."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                <span>LOCAL CACHE / DEMO</span>
              </span>
            )}
          </div>
          <div className="text-[10px] text-amber-300/90 font-medium">Well Intervention - Upstream Services</div>
        </div>
      </div>

      <div className="flex items-center space-x-2.5 text-xs">
        {syncing && (
          <div className="flex items-center space-x-1.5 bg-[#12233c] px-2.5 py-1 rounded-md border border-[#233f67]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="text-[11px] font-medium text-slate-200">Syncing Azure…</span>
          </div>
        )}

        <button
          onClick={handleRefresh}
          className="px-3 py-1 bg-[#14263f] hover:bg-[#1f375a] text-slate-200 hover:text-white rounded-md border border-[#25426b] text-[11px] font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
          title="Refresh data from Azure SQL database"
        >
          <span>🔄</span>
          <span>Refresh</span>
        </button>
      </div>
    </header>
  );
};
