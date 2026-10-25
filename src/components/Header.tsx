import React from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw, Database } from 'lucide-react'

/** Module → breadcrumb, screen → title, matching the previous app's chrome. */
const PAGES: Record<string, { crumb: string; title: string }> = {
  '/':                  { crumb: 'Operations Module',        title: 'Operations Dashboard' },
  '/jobs':              { crumb: 'Operations Module',        title: 'Drilling Jobs' },
  '/job-tools-list':    { crumb: 'Operations Module',        title: 'Job Tools List' },
  '/tool-history':      { crumb: 'Operations Module',        title: 'Tool Movement History' },
  '/delivery-tickets':  { crumb: 'Operations Module',        title: 'Delivery Tickets' },
  '/receiving-tickets': { crumb: 'Operations Module',        title: 'Receiving Tickets' },
  '/utilization':       { crumb: 'Operations Module',        title: 'Utilization' },
  '/gate-pass':         { crumb: 'Operations Module',        title: 'Security Gate Pass' },
  '/inventory':         { crumb: 'Assets & Inventory Management', title: 'Assets and Inventory Catalog' },
  '/categories':        { crumb: 'Inventory Module',         title: 'Tool Categories & Sizes' },
  '/inspection':        { crumb: 'Maintenance & QC Module',  title: 'QC Inspection Bay' },
  '/maintenance':       { crumb: 'Maintenance & QC Module',  title: 'Maintenance Orders' },
  '/invoices':          { crumb: 'Billing & Cost Control',   title: 'Invoicing' },
  '/contracts':         { crumb: 'Contracts Module',         title: 'Master Contract Register' },
  '/clients':           { crumb: 'Contracts Module',         title: 'Clients' },
  '/suppliers':         { crumb: 'Contracts Module',         title: 'Suppliers' },
  '/users':             { crumb: 'Administration',           title: 'User Management' },
  '/settings':          { crumb: 'Administration',           title: 'Global Configurations' },
}

function resolve(pathname: string) {
  if (PAGES[pathname]) return PAGES[pathname]
  const base = '/' + pathname.split('/')[1]
  return PAGES[base] || { crumb: 'Operations Platform', title: 'Tool Tracker' }
}

export function Header() {
  const location = useLocation()
  const { crumb, title } = resolve(location.pathname)

  return (
    <header className="bg-white border-b border-gray-300 px-5 py-2.5 flex items-center gap-4 shrink-0">
      <div className="min-w-0 flex-1">
        <div className="page-crumb">{crumb}</div>
        <h1 className="page-title truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded bg-brand-50 border border-brand-200 text-brand-800 text-[11px] font-semibold">
          <Database size={12} /> Azure SQL
        </span>
        <button
          className="btn-mini"
          onClick={() => window.location.reload()}
          title="Reload this screen"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
    </header>
  )
}
