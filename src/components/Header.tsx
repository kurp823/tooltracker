import React from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import type { DashboardStats } from '../types'

/*
 * The old app's top bar: dark navy across the whole window with the EMDAD
 * logo on a white tile, the company name, a live-database badge that says
 * how many jobs and tools it is looking at, and Refresh on the right.
 * The sidebar sits underneath it instead of running the full height.
 */
export function Header({ collapsed = false, onToggleSidebar }: { collapsed?: boolean; onToggleSidebar?: () => void }) {
  useLocation() // re-render on navigation so the badge stays current
  const { data: s, error } = useFetch<DashboardStats>('/dashboard/stats')
  const live = !!s && !error

  return (
    <header className="bg-[#0b192c] text-white px-4 h-[50px] flex items-center justify-between shadow-md border-b border-[#182944] shrink-0 z-40">
      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg bg-[#14263f] hover:bg-[#1f375a] text-slate-300 hover:text-white border border-[#233d63] transition"
            title={collapsed ? 'Show menu' : 'Hide menu'}
          >
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        )}
        <div className="bg-white px-2 py-1 rounded shadow flex items-center justify-center">
          <img src="/emdad-logo.png" alt="EMDAD" className="h-6 w-auto object-contain" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm tracking-wide">EMDAD LLC</span>
            {live ? (
              <span className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    title="Connected to the live Azure SQL database">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                AZURE SQL LIVE ({s!.totalJobs.toLocaleString()} Jobs · {s!.totalInventory.toLocaleString()} Tools)
              </span>
            ) : (
              <span className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {error ? 'DATABASE NOT REACHABLE' : 'CONNECTING…'}
              </span>
            )}
          </div>
          <div className="text-[10px] text-amber-300/90 font-medium leading-tight">Well Intervention - Upstream Services</div>
        </div>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="px-3 py-1 bg-[#14263f] hover:bg-[#1f375a] text-slate-200 hover:text-white rounded-md border border-[#25426b] text-[11px] font-semibold flex items-center gap-1.5 transition"
        title="Reload this screen from the database"
      >
        <RefreshCw size={12} /> Refresh
      </button>
    </header>
  )
}
