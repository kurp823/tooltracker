import React from 'react'
import { useLocation } from 'react-router-dom'
import { LogOut, Bell, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const PAGE_TITLES: Record<string, string> = {
  '/':                   'Dashboard',
  '/jobs':               'Jobs',
  '/inventory':          'Inventory',
  '/clients':            'Clients',
  '/contracts':          'Contracts',
  '/suppliers':          'Suppliers',
  '/users':              'Users',
  '/settings':           'Settings',
  '/delivery-tickets':   'Delivery Tickets',
  '/receiving-tickets':  'Receiving Tickets',
  '/utilization':        'Utilization',
  '/gate-pass':          'Gate Pass',
  '/tool-history':       'Tool Movement History',
  '/job-tools-list':     'Job - Tools List',
  '/inspection':         'Inspection',
  '/maintenance':        'Maintenance',
  '/invoices':           'Invoices',
}

function getTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const base = '/' + pathname.split('/')[1]
  return PAGE_TITLES[base] || 'Tool Tracker'
}

export function Header() {
  const { logout, user } = useAuth()
  const location = useLocation()

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-5 gap-4 shrink-0">
      {/* Page title */}
      <h1 className="text-base font-semibold text-gray-900 flex-1">
        {getTitle(location.pathname)}
      </h1>

      {/* Right side actions */}
      <div className="flex items-center gap-1">
        <button className="btn-ghost" title="Refresh page">
          <RefreshCw size={16} />
        </button>
        <button className="btn-ghost" title="Notifications">
          <Bell size={16} />
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button
          onClick={logout}
          className="btn-ghost text-red-600 hover:bg-red-50 hover:text-red-700"
          title="Logout"
        >
          <LogOut size={16} />
          <span className="text-xs">Logout</span>
        </button>
      </div>
    </header>
  )
}
