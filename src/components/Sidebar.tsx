import React, { useState, useEffect } from 'react';
import { NavModule, User } from '../types';
import { MODULE_PERMISSIONS } from '../data/initialData';

interface SidebarProps {
  activeView?: NavModule;
  onNavigate?: (mod: NavModule) => void;
  pendingCalloutsCount?: number;
  pendingSignedDTsCount?: number;
  onRigToolsCount?: number;
  pendingInspectionsCount?: number;
  pendingMaintenanceCount?: number;
  currentModule?: NavModule;
  onSelectModule?: (mod: NavModule) => void;
  user?: User | null;
  onLogout?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onNavigate,
  pendingCalloutsCount = 0,
  pendingSignedDTsCount = 0,
  pendingInspectionsCount = 0,
  pendingMaintenanceCount = 0,
  currentModule,
  onSelectModule,
  user,
  onLogout,
  isCollapsed = false,
  onToggleCollapse,
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
        { id: 'jobs', label: 'Drilling Jobs', icon: '⚡' },
        { id: 'job-tools-list', label: 'Job Tools List', icon: '📋' },
        { id: 'tool-history', label: 'Tool Movement History', icon: '⏱️' },
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
        { id: 'categories-sizes', label: 'Tool Categories & Sizes', icon: '🏷️' },
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
          badgeColor: 'bg-amber-400 text-amber-950',
        },
      ],
    },
    {
      id: 'billing',
      title: 'Billing & Commercial',
      icon: '💳',
      items: [
        { id: 'billing-dash', label: 'Billing Dashboard', icon: '📊' },
        { id: 'invoicing', label: 'Invoicing', icon: '📄' },
      ],
    },
    {
      id: 'contracts',
      title: 'Contracts Module',
      icon: '📄',
      items: [
        { id: 'contracts', label: 'Master Contract Register', icon: '📋' },
      ],
    },
    {
      id: 'admin',
      title: 'Administration',
      icon: '🔒',
      adminOnly: true,
      items: [
        { id: 'data-management', label: 'System Database Inspector', icon: '🗄️' },
        { id: 'settings', label: 'Global Configurations', icon: '⚙️' },
      ],
    },
  ];

  // Accordion state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    return {
      operations: true,
      inventory: false,
      maintenance: false,
      billing: false,
      contracts: false,
      admin: false,
    };
  });

  // Auto-expand section containing active view
  useEffect(() => {
    const parentSection = navSections.find((sec) =>
      sec.items.some((item) => item.id === current)
    );
    if (parentSection && !openSections[parentSection.id]) {
      setOpenSections((prev) => ({ ...prev, [parentSection.id]: true }));
    }
  }, [current]);

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  // User initials
  const userName = user?.name || 'Ravi Parapu';
  const userRole = user?.role || 'Admin';
  const userInitial = userName.trim().charAt(0).toUpperCase() || 'U';

  return (
    <aside
      className={`${
        isCollapsed ? 'w-16' : 'w-64'
      } bg-[#0b192c] text-white flex flex-col justify-between border-r border-[#182944] no-print shrink-0 transition-all duration-300 ease-in-out select-none`}
    >
      {/* Top Header / Branding area in sidebar */}
      <div className="p-3 border-b border-[#182944] flex items-center justify-between">
        {!isCollapsed ? (
          <div>
            <div className="font-black text-xs text-white tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>EMDAD OPERATIONS</span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium">Field Equipment & Dispatch</div>
          </div>
        ) : (
          <div className="mx-auto font-black text-xs text-amber-400">EMDAD</div>
        )}

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#152741] transition cursor-pointer"
            title={isCollapsed ? 'Expand Navigation Sidebar' : 'Collapse Navigation Sidebar'}
          >
            <span className="text-xs font-mono">{isCollapsed ? '▶' : '◀'}</span>
          </button>
        )}
      </div>

      {/* Navigation Sections Area */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
        {navSections.map((section) => {
          if (section.adminOnly && user?.role !== 'Admin') return null;

          const visibleItems = section.items.filter((item) => isAllowed(item.id));
          if (visibleItems.length === 0) return null;

          const isOpen = Boolean(openSections[section.id]);
          const containsActive = visibleItems.some((item) => item.id === current);

          if (isCollapsed) {
            // Collapsed Rail View: Display only icons
            return (
              <div key={section.id} className="space-y-1 pt-1 border-t border-white/5 first:border-0 first:pt-0">
                {visibleItems.map((item) => {
                  const isActive = current === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNav(item.id)}
                      title={`${item.label} (${section.title})`}
                      className={`w-full h-10 flex items-center justify-center rounded-lg text-sm transition relative cursor-pointer ${
                        isActive
                          ? 'bg-amber-400 text-[#0b192c] font-black shadow-md'
                          : 'text-slate-300 hover:bg-[#152741] hover:text-white'
                      }`}
                    >
                      <span>{item.icon}</span>
                      {item.badge !== undefined && item.badge !== null && item.badge > 0 && (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400"></span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          }

          // Expanded Accordion View
          return (
            <div key={section.id} className="rounded-lg border border-white/5 bg-[#0f213a]/50 overflow-hidden">
              {/* Section Header */}
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className={`w-full px-2.5 py-1.5 flex items-center justify-between text-left transition cursor-pointer ${
                  containsActive
                    ? 'bg-white/5 text-amber-300 font-bold'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
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
                    <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-mono font-bold">
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
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                          isActive
                            ? 'bg-amber-400 text-[#0b192c] font-bold shadow-xs'
                            : 'text-slate-200 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className="text-xs shrink-0">{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </div>

                        {item.badge !== undefined && item.badge !== null && item.badge > 0 && (
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black shrink-0 ${
                              isActive ? 'bg-[#0b192c] text-white' : item.badgeColor || 'bg-white/20 text-white'
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

      {/* User Profile & Logout Bottom Footer */}
      <div className="p-2.5 border-t border-[#182944] bg-[#081322]">
        {!isCollapsed ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center font-bold text-[#0b192c] text-xs shrink-0 shadow-xs">
                {userInitial}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate" title={userName}>
                  {userName}
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-[#182944] text-amber-300">
                    {userRole}
                  </span>
                </div>
              </div>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-2 py-1 text-[11px] font-bold text-slate-300 hover:text-rose-300 hover:bg-rose-500/10 rounded border border-slate-700/50 hover:border-rose-500/30 transition cursor-pointer shrink-0"
                title="Sign out of system"
              >
                Sign Out
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center font-bold text-[#0b192c] text-xs shadow-xs"
              title={`${userName} (${userRole})`}
            >
              {userInitial}
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="text-[10px] text-slate-400 hover:text-rose-300 transition cursor-pointer p-1"
                title="Sign Out"
              >
                🚪
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
