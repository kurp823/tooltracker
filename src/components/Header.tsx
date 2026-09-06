import React from 'react';
import { User } from '../types';
import { downloadStandaloneHtml } from '../services/api';

interface HeaderProps {
  user?: User | null;
  syncStatus?: 'idle' | 'syncing' | 'saved' | 'error';
  isSyncing?: boolean;
  onSync?: () => void;
  onRefresh?: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  syncStatus,
  isSyncing,
  onSync,
  onRefresh,
  onLogout,
}) => {
  const syncing = isSyncing || syncStatus === 'syncing';
  const handleRefresh = onSync || onRefresh || (() => {});

  return (
    <header className="bg-[#1a3055] text-white px-5 py-2.5 flex items-center justify-between shadow-md border-b border-[#0f1f38] no-print sticky top-0 z-40">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-[#1a3055] text-sm shadow">
          E
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-extrabold text-sm tracking-wide text-white">EMDAD LLC</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
              🟢 LIVE AZURE SQL
            </span>
          </div>
          <div className="text-[10px] text-amber-300 font-medium">Well Intervention - Upstream Services</div>
        </div>
      </div>

      <div className="flex items-center space-x-3 text-xs">
        {syncing && (
          <div className="flex items-center space-x-1.5 bg-[#142848] px-2.5 py-1 rounded border border-[#2d5084]">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="text-[11px] font-bold text-slate-200">Syncing Azure…</span>
          </div>
        )}

        <button
          onClick={handleRefresh}
          className="px-2.5 py-1 bg-[#142848] hover:bg-[#203c66] text-slate-200 rounded border border-[#2d5084] text-[11px] font-semibold flex items-center space-x-1 transition cursor-pointer"
          title="Refresh data from Azure SQL database"
        >
          <span>🔄 Refresh</span>
        </button>

        {/* Protected Download: Admin clearance required */}
        {user?.role === 'Admin' && (
          <button
            onClick={() => {
              const ok = window.confirm(
                'Admin Clearance Required:\n\nDo you confirm exporting the complete self-contained index.html standalone package with all operational data bundled?'
              );
              if (ok) {
                downloadStandaloneHtml();
              }
            }}
            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded border border-amber-600 text-[11px] font-bold flex items-center space-x-1 shadow-xs cursor-pointer transition"
            title="Administrator Export: Download single-file index.html for deployment"
          >
            <span>💾 Download index.html</span>
          </button>
        )}

        <div className="flex items-center space-x-1.5 bg-[#24426d] px-2.5 py-1 rounded border border-[#3b5d8f]">
          <span className="text-slate-300 text-[11px]">Role:</span>
          <span className="text-white font-bold text-xs">{user?.role || 'Guest'}</span>
        </div>

        <span className="text-[11px] font-bold text-slate-300">{user?.name || 'User'}</span>

        <button
          onClick={onLogout}
          className="text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition text-[11px] cursor-pointer"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
};
