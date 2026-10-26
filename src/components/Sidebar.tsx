import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, Package, Users, FileText,
  Truck, RotateCcw, ClipboardCheck, Wrench, DoorOpen,
  Receipt, Building2, BarChart3, Settings, ChevronDown, Upload,
  ChevronRight, BookOpen, Factory, Tag, History, Boxes,
  ShoppingCart, PackagePlus, Database, LogOut, KeyRound,
  Gauge, ClipboardList, Coins, FileSpreadsheet, HardHat, PackageSearch
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { UserRole } from '../types'

/**
 * Operations-platform sidebar: deep navy shell, amber active state and the
 * grouped modules used in the previous app. Workshop Handling is deliberately
 * absent — Delivery/Receiving Tickets live under Operations, and Rig Callouts
 * was retired when tbl_Callouts was replaced by tbl_JobTools.
 */
interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
  roles?: UserRole[]
  /** Not built yet — shown but inert, so the map matches the old app. */
  pending?: boolean
}

interface NavModule {
  module: string
  icon: React.ReactNode
  roles?: UserRole[]
  adminBadge?: boolean
  items: NavItem[]
}

const ICON = 14

const MODULES: NavModule[] = [
  {
    module: 'Operations Module',
    icon: <Factory size={ICON} />,
    roles: ['Admin', 'Operations', 'QAQC', 'Billing', 'Finance', 'CostController', 'Executive'],
    items: [
      { label: 'Operations Dashboard',   to: '/',                   icon: <LayoutDashboard size={ICON} /> },
      { label: 'Drilling Jobs',          to: '/jobs',               icon: <Briefcase size={ICON} /> },
      { label: 'Job Tools List',         to: '/job-tools-list',     icon: <ClipboardList size={ICON} /> },
      { label: 'Tool Movement History',  to: '/tool-history',       icon: <History size={ICON} /> },
      { label: 'Delivery Tickets',       to: '/delivery-tickets',   icon: <Truck size={ICON} /> },
      { label: 'Receiving Tickets',      to: '/receiving-tickets',  icon: <RotateCcw size={ICON} /> },
      { label: 'Utilization',            to: '/utilization',        icon: <BarChart3 size={ICON} /> },
      { label: 'Security Gate Pass',     to: '/gate-pass',          icon: <DoorOpen size={ICON} /> },
    ],
  },
  {
    module: 'Inventory Module',
    icon: <Boxes size={ICON} />,
    roles: ['Admin', 'Operations'],
    items: [
      { label: 'Inventory Dashboard',       to: '/inventory-dashboard', icon: <Gauge size={ICON} />, pending: true },
      { label: 'Assets and Inventory',      to: '/inventory',           icon: <Package size={ICON} /> },
      { label: 'Not in Inventory',          to: '/missing-tools',       icon: <PackageSearch size={ICON} /> },
      { label: 'Tool Categories & Sizes',   to: '/categories',          icon: <Tag size={ICON} /> },
      { label: 'PO & Goods Inward (GRN)',   to: '/po-grn',              icon: <ShoppingCart size={ICON} />, pending: true },
      { label: 'Third-Party Rental Inward', to: '/sub-rental-inward',   icon: <PackagePlus size={ICON} />, pending: true },
      { label: 'Consumables & Store (SIV)', to: '/consumables',         icon: <Boxes size={ICON} />, pending: true },
    ],
  },
  {
    module: 'Maintenance & QC Module',
    icon: <HardHat size={ICON} />,
    roles: ['Admin', 'Operations', 'QAQC', 'ThirdParty'],
    items: [
      { label: 'Maintenance & QC Dashboard', to: '/maintenance-dashboard', icon: <Gauge size={ICON} />, pending: true },
      { label: 'QC Inspection Bay',          to: '/inspection',            icon: <ClipboardCheck size={ICON} /> },
      { label: 'Maintenance Orders',         to: '/maintenance',           icon: <Wrench size={ICON} /> },
    ],
  },
  {
    module: 'Billing & Cost Control',
    icon: <Receipt size={ICON} />,
    roles: ['Admin', 'Billing', 'Finance', 'CostController', 'Executive'],
    items: [
      { label: 'Billing Dashboard',              to: '/billing-dashboard', icon: <Gauge size={ICON} />, pending: true },
      { label: 'Invoicing',                      to: '/invoices',          icon: <FileText size={ICON} /> },
      { label: 'Tool Revenue & Utilization',     to: '/tool-revenue',      icon: <Coins size={ICON} />, pending: true },
      { label: 'Sub-Contractor Rentals',         to: '/sub-rentals',       icon: <Building2 size={ICON} />, pending: true },
      { label: 'Monthly Expense Grid & P&L',     to: '/monthly-expenses',  icon: <FileSpreadsheet size={ICON} />, pending: true },
    ],
  },
  {
    module: 'Contracts Module',
    icon: <BookOpen size={ICON} />,
    roles: ['Admin', 'Billing', 'Finance'],
    items: [
      { label: 'Contracts Dashboard',     to: '/contracts-dashboard', icon: <Gauge size={ICON} />, pending: true },
      { label: 'Master Contract Register', to: '/contracts',          icon: <FileText size={ICON} /> },
      { label: 'Clients',                  to: '/clients',            icon: <Building2 size={ICON} /> },
      { label: 'Suppliers',                to: '/suppliers',          icon: <Building2 size={ICON} /> },
    ],
  },
  {
    module: 'Administration',
    icon: <Settings size={ICON} />,
    roles: ['Admin'],
    adminBadge: true,
    items: [
      { label: 'System Database Inspector', to: '/db-inspector', icon: <Database size={ICON} />, pending: true },
      { label: 'Users',                     to: '/users',        icon: <Users size={ICON} /> },
      { label: 'Data Import',               to: '/data-import',  icon: <Upload size={ICON} /> },
      { label: 'Global Configurations',     to: '/settings',     icon: <Settings size={ICON} /> },
    ],
  },
]

function Module({ mod }: { mod: NavModule }) {
  const location = useLocation()
  const { hasRole } = useAuth()
  const containsActive = mod.items.some(
    i => i.to === location.pathname || (i.to !== '/' && location.pathname.startsWith(i.to))
  )
  const [open, setOpen] = useState(containsActive)

  if (mod.roles && !hasRole(...mod.roles)) return null

  return (
    <div className="mb-0.5">
      <button className="sidebar-group" onClick={() => setOpen(o => !o)}>
        <span className="text-accent-500">{mod.icon}</span>
        <span className="flex-1 text-left">{mod.module}</span>
        {mod.adminBadge && (
          <span className="px-1.5 py-px rounded bg-accent-500 text-navy-950 text-[9px] font-bold tracking-normal">
            Admin
          </span>
        )}
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>

      {open && (
        <div className="pb-1">
          {mod.items.map(item =>
            item.pending ? (
              <div
                key={item.to}
                className="sidebar-link text-slate-500 cursor-not-allowed"
                title="Not built yet"
              >
                <span className="opacity-60">{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                <span className="text-[9px] uppercase tracking-wide text-slate-500">soon</span>
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </NavLink>
            )
          )}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="w-[210px] shrink-0 bg-navy-900 flex flex-col border-r border-navy-950">
      {/* Brand — one compact row; the strap lines cost 100px and said nothing. */}
      <div className="px-2.5 h-[34px] border-b border-navy-800 flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-white flex items-center justify-center shrink-0">
          <Package size={13} className="text-brand-700" />
        </div>
        <div className="text-white font-bold text-[13px] leading-none truncate">EMDAD LLC</div>
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0" title="Operations Platform" />
      </div>

      {/* Modules */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-1 py-1 dark-scroll">
        {MODULES.map(m => <Module key={m.module} mod={m} />)}
      </nav>

      {/* User */}
      <div className="px-2.5 py-1.5 border-t border-navy-800 flex items-center gap-2 shrink-0">
        <div className="w-6 h-6 rounded-full bg-accent-500 text-navy-950 flex items-center justify-center text-[11px] font-bold shrink-0">
          {(user?.FullName || user?.Username || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-white text-xs font-medium truncate">{user?.FullName || user?.Username}</div>
          <div className="text-slate-400 text-[10px]">{user?.Role}</div>
        </div>
        <NavLink to="/change-password" className="text-slate-400 hover:text-accent-500" title="Change password">
          <KeyRound size={14} />
        </NavLink>
        <button onClick={logout} className="text-slate-400 hover:text-red-400" title="Sign out">
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  )
}
