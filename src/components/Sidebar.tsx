import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, Package, Users, FileText,
  Truck, RotateCcw, ClipboardCheck, Wrench, DoorOpen,
  Receipt, Building2, BarChart3, Settings, ChevronDown,
  ChevronRight, BookOpen, Factory, Tag, History
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { UserRole } from '../types'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
  roles?: UserRole[]
  children?: NavItem[]
}

const NAV: NavItem[] = [
  { label: 'Dashboard',   to: '/',             icon: <LayoutDashboard size={18} /> },
  { label: 'Jobs',        to: '/jobs',         icon: <Briefcase size={18} />,
    roles: ['Admin','Operations','QAQC','Billing','Finance','CostController','Executive'] },
  {
    label: 'Operations', to: '#ops', icon: <Factory size={18} />,
    roles: ['Admin','Operations'],
    children: [
      { label: 'Delivery Tickets',  to: '/delivery-tickets',  icon: <Truck size={18} /> },
      { label: 'Receiving Tickets', to: '/receiving-tickets', icon: <RotateCcw size={18} /> },
      { label: 'Utilization',       to: '/utilization',       icon: <BarChart3 size={18} /> },
      { label: 'Job Tools List',    to: '/job-tools-list',    icon: <FileText size={18} /> },
      { label: 'Tool History',      to: '/tool-history',      icon: <History size={18} /> },
      { label: 'Gate Pass',         to: '/gate-pass',         icon: <DoorOpen size={18} /> },
    ],
  },
  {
    label: 'Technical', to: '#tech', icon: <Wrench size={18} />,
    roles: ['Admin','Operations','QAQC','ThirdParty'],
    children: [
      { label: 'Inspection',   to: '/inspection',   icon: <ClipboardCheck size={18} /> },
      { label: 'Maintenance',  to: '/maintenance',  icon: <Wrench size={18} /> },
    ],
  },
  {
    label: 'Finance', to: '#finance', icon: <Receipt size={18} />,
    roles: ['Admin','Billing','Finance','CostController','Executive'],
    children: [
      { label: 'Invoices',   to: '/invoices',   icon: <FileText size={18} /> },
    ],
  },
  { label: 'Inventory',  to: '/inventory',  icon: <Package size={18} />,
    roles: ['Admin','Operations'] },
  {
    label: 'Master Data', to: '#master', icon: <BookOpen size={18} />,
    roles: ['Admin','Operations','Billing'],
    children: [
      { label: 'Clients',   to: '/clients',   icon: <Building2 size={18} /> },
      { label: 'Contracts', to: '/contracts', icon: <FileText size={18} /> },
      { label: 'Suppliers', to: '/suppliers', icon: <Building2 size={18} /> },
      { label: 'Categories & Sizes', to: '/categories', icon: <Tag size={18} /> },
    ],
  },
  { label: 'Users',      to: '/users',      icon: <Users size={18} />,
    roles: ['Admin'] },
  { label: 'Settings',   to: '/settings',   icon: <Settings size={18} />,
    roles: ['Admin'] },
]

function NavGroup({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const location = useLocation()
  const { hasRole } = useAuth()
  const [open, setOpen] = useState(() =>
    item.children?.some(c => location.pathname.startsWith(c.to)) ?? false
  )

  if (item.roles && !hasRole(...item.roles)) return null

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                     text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          {item.icon}
          <span className="flex-1 text-left">{item.label}</span>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        {open && (
          <div className="ml-4 mt-0.5 border-l border-gray-200 pl-2 flex flex-col gap-0.5">
            {item.children.map(child => (
              <NavGroup key={child.to} item={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `sidebar-link ${isActive ? 'active' : ''}`
      }
      end={item.to === '/'}
    >
      {item.icon}
      {item.label}
    </NavLink>
  )
}

export function Sidebar() {
  const { user } = useAuth()

  return (
    <aside className="w-60 shrink-0 h-screen bg-white border-r border-gray-200 flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
            <Package size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">Tool Tracker</p>
            <p className="text-xs text-gray-500 leading-tight">Emdad</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5">
        {NAV.map(item => (
          <NavGroup key={item.to} item={item} />
        ))}
      </nav>

      {/* User info */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-brand-700">
              {(user?.FullName || user?.Username || 'U').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">
              {user?.FullName || user?.Username}
            </p>
            <p className="text-xs text-gray-500">{user?.Role}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
