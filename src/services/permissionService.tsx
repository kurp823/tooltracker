import React, { useState, useEffect } from 'react';
import { NavModule, User, UserRole } from '../types';
import { MODULE_PERMISSIONS, WRITE_PERMISSIONS, USERS } from '../data/initialData';

export interface UserPermissionOverride {
  visible: NavModule[];
  editable: NavModule[];
}

export type UserPermissionsMap = Record<string, UserPermissionOverride>;

/**
 * Loads list of all registered system users from localStorage or default USERS
 */
export function getSystemUsers(): User[] {
  try {
    const saved = localStorage.getItem('emdad_system_users');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return USERS;
}

/**
 * Saves updated system users to localStorage and dispatches sync event
 */
export function saveSystemUsers(users: User[]): void {
  localStorage.setItem('emdad_system_users', JSON.stringify(users));
  window.dispatchEvent(new Event('users_updated'));
}

/**
 * Loads per-user permission overrides from localStorage
 */
export function getUserPermissions(): UserPermissionsMap {
  try {
    const saved = localStorage.getItem('emdad_user_permissions');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return {};
}

/**
 * Saves per-user permission overrides to localStorage and dispatches sync event
 */
export function saveUserPermissions(perms: UserPermissionsMap): void {
  localStorage.setItem('emdad_user_permissions', JSON.stringify(perms));
  window.dispatchEvent(new Event('permissions_updated'));
}

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
 * Calculates effective permissions for a user: checks per-user overrides first,
 * then falls back to role default permissions.
 */
export function getUserEffectivePermissions(user: User | null | undefined): {
  visible: NavModule[];
  editable: NavModule[];
  isCustom: boolean;
} {
  if (!user) {
    return { visible: [], editable: [], isCustom: false };
  }

  // Admin has unconditional read and write access
  if (user.role === 'Admin') {
    const allModules: NavModule[] = [
      'dashboard', 'jobs', 'dt', 'rt', 'callouts', 'gatepass', 'job-tools-list', 'tool-history', 'utilization',
      'inventory-dash', 'inventory', 'categories-sizes', 'maintenance-dash', 'inspection', 'maintenance',
      'billing-dash', 'invoicing', 'billing-package', 'tool-revenue-report', 'contract-dash', 'contracts',
      'data-management', 'settings'
    ];
    return { visible: allModules, editable: allModules, isCustom: false };
  }

  const userPerms = getUserPermissions();
  const usernameKey = (user.username || '').toLowerCase();
  const idKey = String(user.id);
  const override = userPerms[usernameKey] || userPerms[idKey];

  if (override && (Array.isArray(override.visible) || Array.isArray(override.editable))) {
    return {
      visible: override.visible || [],
      editable: override.editable || [],
      isCustom: true,
    };
  }

  const rolePerms = getRolePermissions();
  const writePerms = getWritePermissions();
  const visible = rolePerms[user.role] || MODULE_PERMISSIONS[user.role] || [];
  const editable = writePerms[user.role] || WRITE_PERMISSIONS[user.role] || [];

  return {
    visible,
    editable,
    isCustom: false,
  };
}

/**
 * Checks if a user can view a given module (is it visible in menu/screen access?)
 */
export function canViewModule(user: User | null | undefined, module: NavModule): boolean {
  if (!user) return false;
  if ((user.role as string) === 'Admin') return true;
  if (module === 'settings') return false; // Settings restricted strictly to Admin role
  const { visible } = getUserEffectivePermissions(user);
  return visible.includes(module);
}

/**
 * Checks if a user has edit/action clearance for a given module
 */
export function canEditModule(user: User | null | undefined, module: NavModule): boolean {
  if (!user) return false;
  if ((user.role as string) === 'Admin') return true;
  if (module === 'settings') return false;
  const { editable } = getUserEffectivePermissions(user);
  return editable.includes(module);
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
  }, [user?.id, user?.username, user?.role, module]);

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
