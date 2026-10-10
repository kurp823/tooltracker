import React, { useState, useEffect } from 'react';
import { NavModule, User, UserRole } from '../types';
import { MODULE_PERMISSIONS, WRITE_PERMISSIONS } from '../data/initialData';

/**
 * Loads current role permissions from localStorage or defaults
 */
export function getRolePermissions(): Record<UserRole, NavModule[]> {
  try {
    const saved = localStorage.getItem('emdad_role_permissions');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Auto-migrate legacy cache if Handler was missing invoicing or billing-dash
      if (parsed.Handler && (!parsed.Handler.includes('invoicing') || !parsed.Handler.includes('billing-dash'))) {
        parsed.Handler = Array.from(new Set([...parsed.Handler, 'billing-dash', 'invoicing', 'tool-revenue-report', 'contracts', 'contract-dash']));
        localStorage.setItem('emdad_role_permissions', JSON.stringify(parsed));
      }
      return parsed;
    }
  } catch (e) {}
  return MODULE_PERMISSIONS;
}

/**
 * Loads current write / edit permissions from localStorage or defaults
 */
export function getWritePermissions(): Record<UserRole, NavModule[]> {
  try {
    const saved = localStorage.getItem('emdad_write_permissions');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return WRITE_PERMISSIONS;
}

/**
 * Checks if a user can view a given module (is it visible to their role?)
 */
export function canViewModule(user: User | null | undefined, module: NavModule): boolean {
  if (!user) return false;
  if (user.role === 'Admin') return true;
  if (module === 'settings' && user.role !== 'Admin') return false;
  const rolePerms = getRolePermissions();
  const allowed = rolePerms[user.role] || MODULE_PERMISSIONS[user.role] || [];
  return allowed.includes(module);
}

/**
 * Checks if a user has edit/action clearance for a given module
 */
export function canEditModule(user: User | null | undefined, module: NavModule): boolean {
  if (!user) return false;
  if (user.role === 'Admin') return true;
  if (module === 'settings' && user.role !== 'Admin') return false;
  const writePerms = getWritePermissions();
  const allowed = writePerms[user.role] || WRITE_PERMISSIONS[user.role] || [];
  return allowed.includes(module);
}

/**
 * React Hook that monitors live RBAC changes and returns view & edit capabilities
 */
export function useModulePermission(user: User | null | undefined, module: NavModule) {
  const [canEdit, setCanEdit] = useState<boolean>(() => canEditModule(user, module));
  const [canView, setCanView] = useState<boolean>(() => canViewModule(user, module));

  useEffect(() => {
    const update = () => {
      setCanEdit(canEditModule(user, module));
      setCanView(canViewModule(user, module));
    };
    update();
    window.addEventListener('permissions_updated', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('permissions_updated', update);
      window.removeEventListener('storage', update);
    };
  }, [user?.role, module]);

  return { canView, canEdit, isReadOnly: !canEdit };
}

interface ReadOnlyBannerProps {
  role?: string;
  moduleName?: string;
}

export const ReadOnlyBanner: React.FC<ReadOnlyBannerProps> = ({ role = 'User', moduleName = 'this module' }) => {
  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-md text-xs font-medium flex items-center justify-between mb-3 shadow-2xs">
      <div className="flex items-center space-x-2">
        <span className="text-amber-600 font-bold">🔒 View-Only Mode:</span>
        <span>
          Your role (<strong className="font-semibold">{role}</strong>) has read clearance for {moduleName}. Creation, modification, and deletion are restricted by Admin.
        </span>
      </div>
      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-amber-200/70 text-amber-950 rounded">
        Read Only
      </span>
    </div>
  );
};
