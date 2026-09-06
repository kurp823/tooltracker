import React, { useState, useEffect } from 'react';
import { NavModule, User } from '../types';
import { MODULE_PERMISSIONS } from '../data/initialData';

interface SidebarProps {
  activeView?: NavModule;
  onNavigate?: (mod: NavModule) => void;
  pendingCalloutsCount?: number;
  onRigToolsCount?: number;
  pendingInspectionsCount?: number;
  pendingMaintenanceCount?: number;
  // Alternative signatures
  currentModule?: NavModule;
  onSelectModule?: (mod: NavModule) => void;
  user?: User | null;
  state?: {
    inventory: any[];
    callouts: any[];
    jobs: any[];
    dtBatches: any[];
    rtBatches: any[];
    inspections: any[];
    maintenance: any[];
  };
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onNavigate,
  pendingCalloutsCount = 0,
  onRigToolsCount = 0,
  pendingInspectionsCount = 0,
  pendingMaintenanceCount = 0,
  currentModule,
  onSelectModule,
  user,
}) => {
  const current = activeView || currentModule || 'dashboard';
  const handleNav = onNavigate || onSelectModule || (() => {});

  const allowed = user?.role ? MODULE_PERMISSIONS[user.role] || [] : null;

  const isAllowed = (id: NavModule) => {
    if (id === 'settings' && user?.role !== 'Admin') return false;
    if (!allowed) return true;
    return allowed.includes(id);
  };

  interface NavItem {
    id: NavModule;
    label: string;
    icon: string;
    badge?: number | null;
    badgeColor?: string;
  }

  interface NavSection {
    id: string;
    title: string;
    icon: string;
    adminOnly?: boolean;
    items: NavItem[];
  }

  const navSections: NavSection[] = [
    {
      id: 'operations',
      title: 'Operations Module',
      icon: '⚙️',
      items: [
        { id: 'dashboard', label: 'Operations Dashboard', icon: '📊' },
        {
          id: 'callouts',
          label: 'Rig Callouts',
          icon: '📞',
          badge: pendingCalloutsCount > 0 ? pendingCalloutsCount : null,
          badgeColor: 'bg-amber-400 text-amber-950',
        },
        { id: 'jobs', label: 'Drilling Jobs', icon: '⚡' },
        {
          id: 'dt',
          label: 'Delivery Tickets (DT)',
          icon: '🚚',
          badge: onRigToolsCount > 0 ? onRigToolsCount : null,
          badgeColor: 'bg-blue-300 text-blue-950',
        },
        { id: 'rt', label: 'Receiving Tickets (RT)', icon: '📥' },
        { id: 'gatepass', label: 'Security Gate Pass', icon: '🛡️' },
        { id: 'utilization', label: 'Utilization', icon: '📈' },
      ],
    },
    {
      id: 'inventory',
      title: 'Inventory Module',
      icon: '📦',
      items: [
        { id: 'inventory-dash', label: 'Inventory Dashboard', icon: '📊' },
        { id: 'inventory', label: 'Assets and Inventory', icon: '🧰' },
      ],
    },
    {
      id: 'maintenance',
      title: 'Maintenance & QC Module',
      icon: '🔬',
      items: [
        { id: 'maintenance-dash', label: 'Maintenance & QC Dashboard', icon: '📊' },
        {
          id: 'inspection',
          label: 'QC Inspection Bay',
          icon: '🔍',
          badge: pendingInspectionsCount > 0 ? pendingInspectionsCount : null,
          badgeColor: 'bg-rose-400 text-rose-950',
        },
        {
          id: 'maintenance',
          label: 'Maintenance Orders',
          icon: '🔧',
          badge: pendingMaintenanceCount > 0 ? pendingMaintenanceCount : null,
          badgeColor: 'bg-amber-300 text-amber-950',
        },
      ],
    },
    {
      id: 'billing',
      title: 'Billing & Commercial',
      icon: '💳',
      items: [
        { id: 'billing-dash', label: 'Billing Dashboard', icon: '📊' },
      ],
    },
    {
      id: 'contracts',
      title: 'Contracts Module',
      icon: '📄',
      items: [
        { id: 'contracts', label: 'Master Contracts', icon: '📑' },
      ],
    },
    {
      id: 'administration',
      title: 'Administration',
      icon: '🔒',
      adminOnly: true,
      items: [
        { id: 'settings', label: 'System & Azure SQL', icon: '⚙️' },
      ],
    },
  ];

  // Collapsible section state: by default, all collapsed except the one holding the current active view
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navSections.forEach((sec) => {
      const hasActive = sec.items.some((item) => item.id === current);
      initial[sec.id] = hasActive; // Only active section open initially
    });
    return initial;
  });

  // Keep section open when current view changes
  useEffect(() => {
    navSections.forEach((sec) => {
      if (sec.items.some((item) => item.id === current)) {
        setOpenSections((prev) => ({ ...prev, [sec.id]: true }));
      }
    });
  }, [current]);

  const toggleSection = (secId: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [secId]: !prev[secId],
    }));
  };

  return (
    <aside className="w-full md:w-64 bg-[#1a3055] text-white flex-shrink-0 flex flex-col p-3 border-r border-[#0f1d35] no-print select-none">
      {/* Brand Mini Header */}
      <div className="hidden md:block pb-3 mb-2 border-b border-white/10">
        <div className="font-extrabold text-sm text-white tracking-wide leading-tight">EMDAD LLC</div>
        <div className="text-[10px] text-amber-300 font-semibold mt-0.5">
          Well Intervention - Upstream Services
        </div>
      </div>

      {/* Grouped Navigation List (Collapsible Sections) */}
      <nav className="space-y-1.5 flex-1 overflow-y-auto pr-1">
        {navSections.map((section) => {
          if (section.adminOnly && user?.role !== 'Admin') return null;

          const visibleItems = section.items.filter((item) => isAllowed(item.id));
          if (visibleItems.length === 0) return null;

          const isOpen = Boolean(openSections[section.id]);
          const containsActive = visibleItems.some((item) => item.id === current);

          return (
            <div key={section.id} className="rounded border border-white/5 bg-black/10 overflow-hidden">
              {/* Collapsible Section Header */}
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className={`w-full px-2.5 py-1.5 flex items-center justify-between text-left transition cursor-pointer ${
                  containsActive ? 'bg-white/10 text-amber-300 font-bold' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-xs">{section.icon}</span>
                  <span className="text-[10px] font-black uppercase tracking-wider">
                    {section.title}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  {section.adminOnly && (
                    <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1 rounded font-mono font-bold">
                      Admin
                    </span>
                  )}
                  <span className="text-[9px] text-slate-400 font-mono">
                    {isOpen ? '▲' : '▼'}
                  </span>
                </div>
              </button>

              {/* Sub-items */}
              {isOpen && (
                <div className="px-1.5 py-1 space-y-0.5 bg-black/20 border-t border-white/5">
                  {visibleItems.map((item) => {
                    const isActive = current === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleNav(item.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-semibold transition cursor-pointer ${
                          isActive
                            ? 'bg-amber-400 text-[#1a3055] font-bold shadow-sm'
                            : 'text-slate-200 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-xs">{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </div>

                        {item.badge !== undefined && item.badge !== null && item.badge > 0 && (
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                              isActive ? 'bg-[#1a3055] text-white' : item.badgeColor || 'bg-white/20 text-white'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Quick Status / Environment Footer */}
      <div className="hidden md:block pt-3 mt-2 border-t border-white/10 text-[11px] text-slate-300">
        <div className="flex items-center justify-between">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-mono text-[10px]">Azure SQL Live</span>
          </span>
          <span className="text-[10px] text-slate-400 font-mono">v2.1</span>
        </div>
      </div>
    </aside>
  );
};
