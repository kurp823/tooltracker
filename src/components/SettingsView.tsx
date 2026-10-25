import React, { useState } from 'react';
import { User, UserRole, NavModule } from '../types';
import { MODULE_PERMISSIONS, WRITE_PERMISSIONS } from '../data/initialData';
import { downloadStandaloneHtml, testAzureConnection, DbConnectionStatus } from '../services/api';
import {
  getSystemUsers,
  saveSystemUsers,
  getUserPermissions,
  saveUserPermissions,
  getRolePermissions,
  getWritePermissions,
  UserPermissionsMap,
  UserPermissionOverride,
} from '../services/permissionService';

interface SettingsViewProps {
  user?: User | null;
  onUpdateUserRole: (role: User['role']) => void;
  onResetData: () => void;
  onExportData: () => void;
  onImportData: (json: string) => void;
  onClearDemoData?: (includeInventory?: boolean) => void;
  onFetchLiveSql?: () => void;
  dbStatus?: DbConnectionStatus;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  currentData: any;
}

const ALL_ROLES: UserRole[] = ['Admin', 'Operations', 'Handler', 'QC', 'Inspector', 'Accounts', 'Viewer'];

const ALL_MODULES: { id: NavModule; label: string; group: string; icon: string; desc: string; canHaveWriteAccess: boolean }[] = [
  // Operations
  { id: 'dashboard', label: 'Operations Dashboard', group: 'Operations', icon: '📊', desc: 'KPI summaries, active rig map & high-level operations status', canHaveWriteAccess: false },
  { id: 'jobs', label: 'Drilling Jobs & Job File', group: 'Operations', icon: '⚡', desc: 'Create & edit drilling jobs, crew assignment, daily logs & status', canHaveWriteAccess: true },
  { id: 'utilization', label: 'Fleet Utilization Matrix', group: 'Operations', icon: '📅', desc: 'Log daily tool cell utilization, standby & ops charges, export Excel', canHaveWriteAccess: true },
  { id: 'job-tools-list', label: 'Job Tools List', group: 'Operations', icon: '📋', desc: 'Rig mobilized inventory tracking & cross-job tool manifest', canHaveWriteAccess: false },
  { id: 'tool-history', label: 'Tool Movement History', group: 'Operations', icon: '⏱️', desc: 'Audit trail of tool movements across jobs, rigs & base bays', canHaveWriteAccess: false },
  { id: 'callouts', label: 'Rig Callouts', group: 'Operations', icon: '📞', desc: 'Create, modify and authorize rig mobilizations and tool callouts', canHaveWriteAccess: true },
  { id: 'dt', label: 'Delivery Tickets (DT)', group: 'Operations', icon: '🚚', desc: 'Issue delivery tickets, dispatch rental tools and seal manifests', canHaveWriteAccess: true },
  { id: 'rt', label: 'Receiving Tickets (RT)', group: 'Operations', icon: '📥', desc: 'Process backloads, inspect receiving conditions & route to bays', canHaveWriteAccess: true },
  { id: 'gatepass', label: 'Security Gate Pass', group: 'Operations', icon: '🛡️', desc: 'Issue security gate passes for 3rd-party transfers and yard dispatch', canHaveWriteAccess: true },

  // Inventory
  { id: 'inventory-dash', label: 'Inventory Dashboard', group: 'Inventory', icon: '📊', desc: 'Tool counts, ownership distribution and availability metrics', canHaveWriteAccess: false },
  { id: 'inventory', label: 'Assets and Inventory', group: 'Inventory', icon: '🧰', desc: 'Fleet assets catalog, add tools, edit serials & manage suppliers', canHaveWriteAccess: true },
  { id: 'categories-sizes', label: 'Tool Categories & Sizes Master', group: 'Inventory', icon: '🏷️', desc: 'Master setup for tool types, categories and standardized sizes', canHaveWriteAccess: true },

  // Maintenance & QC
  { id: 'maintenance-dash', label: 'Maintenance & QC Dashboard', group: 'Maintenance & QC', icon: '📊', desc: 'Workshop performance metrics & open work order tracking', canHaveWriteAccess: false },
  { id: 'inspection', label: 'QC Inspection Bay', group: 'Maintenance & QC', icon: '🔍', desc: 'MPI inspections, condition reports & certification sign-offs', canHaveWriteAccess: true },
  { id: 'maintenance', label: 'Maintenance Work Orders', group: 'Maintenance & QC', icon: '🛠️', desc: 'Redress orders, repair scheduling & workshop work orders', canHaveWriteAccess: true },

  // Finance & Invoicing
  { id: 'billing-dash', label: 'Billing Dashboard', group: 'Finance & Invoicing', icon: '💳', desc: 'Commercial revenue pipeline, job billing states & financial totals', canHaveWriteAccess: true },
  { id: 'invoicing', label: 'Invoicing Screen (Audit & Ledger)', group: 'Finance & Invoicing', icon: '📄', desc: 'Draft tax invoices, legal invoice numbers, calculation sheets & exhibits', canHaveWriteAccess: true },
  { id: 'tool-revenue-report', label: 'Tool Revenue & Utilization Report', group: 'Finance & Invoicing', icon: '💰', desc: 'Commercial revenue and utilization reports per tool serial', canHaveWriteAccess: false },

  // Contracts
  { id: 'contract-dash', label: 'Contracts Dashboard', group: 'Contracts', icon: '📊', desc: 'Contract analytics, commercial commitments & expiration tracking', canHaveWriteAccess: false },
  { id: 'contracts', label: 'Master Contracts & Price Book', group: 'Contracts', icon: '📋', desc: 'ADNOC contract registers, price lists & rental rate schedules', canHaveWriteAccess: true },

  // System & Admin
  { id: 'data-management', label: 'Data Management Tool (DMT)', group: 'System & Admin', icon: '🗄️', desc: 'Raw database tables, inline inspection & administrative data fixes', canHaveWriteAccess: true },
  { id: 'settings', label: 'System & Azure SQL Settings', group: 'System & Admin', icon: '⚙️', desc: 'Azure SQL parameters, API keys & RBAC matrix (Admin only)', canHaveWriteAccess: true },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  onUpdateUserRole,
  onResetData,
  onExportData,
  onImportData,
  onClearDemoData,
  onFetchLiveSql,
  dbStatus,
  showToast,
  currentData,
}) => {
  const [azureEndpoint, setAzureEndpoint] = useState<string>(() => {
    const saved = localStorage.getItem('azure_api_endpoint');
    if (saved && !saved.includes('emdad-drilling-api') && saved.trim()) return saved.trim();
    return 'https://tooltracker-api-dyath8gehaavcdah.westeurope-01.azurewebsites.net/api/ToolTracker';
  });
  const [azureApiKey, setAzureApiKey] = useState<string>(() => {
    const saved = localStorage.getItem('azure_api_key');
    if (saved && !saved.includes('ak_live_emdad_drilling') && saved.trim()) return saved.trim();
    return 'XCOETTV_A-BHeNPUSFSpChSOv9DAJcZOzrz1NvOlROofAzFu2tbo_Q==';
  });
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [importJsonText, setImportJsonText] = useState('');

  // Access Control View Mode: 'users' (User-Specific Matrix) or 'roles' (Role Template Defaults)
  const [matrixMode, setMatrixMode] = useState<'users' | 'roles'>('users');

  // Registered Users State
  const [users, setUsers] = useState<User[]>(() => getSystemUsers());
  const [selectedUserId, setSelectedUserId] = useState<number>(() => {
    const all = getSystemUsers();
    // Default to first non-admin user (e.g. Azim in Operations/Handler) so admin immediately sees user granting
    const nonAdmin = all.find((u) => u.role !== 'Admin');
    return nonAdmin ? nonAdmin.id : (all[0]?.id || 1);
  });
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('All');

  // New User Creation Modal State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('Handler');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserMustChangePassword, setNewUserMustChangePassword] = useState(true);

  // Per-User Permissions Overrides Map
  const [userPermissions, setUserPermissions] = useState<UserPermissionsMap>(() => getUserPermissions());

  // Role Default Templates
  const [selectedRoleForMatrix, setSelectedRoleForMatrix] = useState<UserRole>('Operations');
  const [rolePermissions, setRolePermissions] = useState<Record<UserRole, NavModule[]>>(() => getRolePermissions());
  const [writePermissions, setWritePermissions] = useState<Record<UserRole, NavModule[]>>(() => getWritePermissions());

  // Currently selected user object
  const selectedUser = users.find((u) => u.id === selectedUserId) || users[0];
  const selectedUserKey = selectedUser ? (selectedUser.username || '').toLowerCase() : '';

  // Determine if selected user has custom overrides
  const userOverride = selectedUser ? (userPermissions[selectedUserKey] || userPermissions[String(selectedUser.id)]) : undefined;
  const hasCustomOverride = Boolean(
    userOverride && (Array.isArray(userOverride.visible) || Array.isArray(userOverride.editable))
  );

  // Effective visible and editable permissions for the currently selected user
  const effectiveUserVisible: NavModule[] = selectedUser?.role === 'Admin'
    ? ALL_MODULES.map((m) => m.id)
    : (hasCustomOverride && userOverride
        ? userOverride.visible || []
        : (rolePermissions[selectedUser?.role || 'Viewer'] || MODULE_PERMISSIONS[selectedUser?.role || 'Viewer'] || []));

  const effectiveUserEditable: NavModule[] = selectedUser?.role === 'Admin'
    ? ALL_MODULES.filter((m) => m.canHaveWriteAccess).map((m) => m.id)
    : (hasCustomOverride && userOverride
        ? userOverride.editable || []
        : (writePermissions[selectedUser?.role || 'Viewer'] || WRITE_PERMISSIONS[selectedUser?.role || 'Viewer'] || []));

  // Update permissions for currently selected user
  const applyUserPermissionsChange = (newVisible: NavModule[], newEditable: NavModule[]) => {
    if (!selectedUser || selectedUser.role === 'Admin') return;
    const updatedMap: UserPermissionsMap = {
      ...userPermissions,
      [selectedUserKey]: {
        visible: newVisible,
        editable: newEditable,
      },
    };
    setUserPermissions(updatedMap);
    saveUserPermissions(updatedMap);
  };

  const handleToggleUserScreen = (modId: NavModule) => {
    if (!selectedUser || selectedUser.role === 'Admin') return;
    const currentVis = [...effectiveUserVisible];
    let nextVis: NavModule[];
    let nextEdit = [...effectiveUserEditable];

    if (currentVis.includes(modId)) {
      nextVis = currentVis.filter((m) => m !== modId);
      nextEdit = nextEdit.filter((m) => m !== modId); // If screen is hidden, remove edit
    } else {
      nextVis = [...currentVis, modId];
    }
    applyUserPermissionsChange(nextVis, nextEdit);
  };

  const handleToggleUserFunction = (funcId: NavModule) => {
    if (!selectedUser || selectedUser.role === 'Admin') return;
    let nextVis = [...effectiveUserVisible];
    let nextEdit: NavModule[];
    const currentEdit = [...effectiveUserEditable];

    if (currentEdit.includes(funcId)) {
      nextEdit = currentEdit.filter((m) => m !== funcId);
    } else {
      nextEdit = [...currentEdit, funcId];
      if (!nextVis.includes(funcId)) {
        nextVis.push(funcId); // If granting edit, automatically ensure screen is visible
      }
    }
    applyUserPermissionsChange(nextVis, nextEdit);
  };

  const handleUserSelectAllVisible = () => {
    if (!selectedUser || selectedUser.role === 'Admin') return;
    const allModIds = ALL_MODULES.map((m) => m.id);
    applyUserPermissionsChange(allModIds, [...effectiveUserEditable]);
    showToast(`All screens marked visible for ${selectedUser.name}.`, 'info');
  };

  const handleUserHideAllScreens = () => {
    if (!selectedUser || selectedUser.role === 'Admin') return;
    applyUserPermissionsChange([], []);
    showToast(`All screens hidden for ${selectedUser.name}.`, 'info');
  };

  const handleUserGrantAllEdit = () => {
    if (!selectedUser || selectedUser.role === 'Admin') return;
    const allModIds = ALL_MODULES.map((m) => m.id);
    const allEditable = ALL_MODULES.filter((m) => m.canHaveWriteAccess && m.id !== 'settings').map((m) => m.id);
    applyUserPermissionsChange(allModIds, allEditable);
    showToast(`All functional edit rights granted to ${selectedUser.name}.`, 'success');
  };

  const handleUserSetAllViewOnly = () => {
    if (!selectedUser || selectedUser.role === 'Admin') return;
    applyUserPermissionsChange([...effectiveUserVisible], []);
    showToast(`Edit rights cleared. ${selectedUser.name} is now view-only for visible screens.`, 'info');
  };

  const handleUserResetToRoleDefaults = () => {
    if (!selectedUser) return;
    if (!window.confirm(`Reset ${selectedUser.name}'s permissions to inherit default permissions for role '${selectedUser.role}'?`)) return;
    const updatedMap = { ...userPermissions };
    delete updatedMap[selectedUserKey];
    delete updatedMap[String(selectedUser.id)];
    setUserPermissions(updatedMap);
    saveUserPermissions(updatedMap);
    showToast(`Reset ${selectedUser.name}'s access to inherit ${selectedUser.role} role defaults.`, 'info');
  };

  const handleSaveSelectedUser = () => {
    if (!selectedUser) return;
    // Persist current effective state
    applyUserPermissionsChange([...effectiveUserVisible], [...effectiveUserEditable]);
    showToast(`Permissions successfully saved and applied for ${selectedUser.name} (${selectedUser.role})!`, 'success');
  };

  const handleChangeSelectedUserRole = (newRole: UserRole) => {
    if (!selectedUser) return;
    const updatedUsers = users.map((u) => (u.id === selectedUser.id ? { ...u, role: newRole } : u));
    setUsers(updatedUsers);
    saveSystemUsers(updatedUsers);
    if (user && user.id === selectedUser.id) {
      onUpdateUserRole(newRole);
    }
    showToast(`Updated ${selectedUser.name}'s base role to ${newRole}.`, 'success');
  };

  const handleToggleMustChangePassword = () => {
    if (!selectedUser) return;
    const currentVal = Boolean(selectedUser.mustChangePassword);
    const updatedUsers = users.map((u) =>
      u.id === selectedUser.id ? { ...u, mustChangePassword: !currentVal } : u
    );
    setUsers(updatedUsers);
    saveSystemUsers(updatedUsers);
    showToast(
      !currentVal
        ? `User @${selectedUser.username} will be prompted to change their password on next login.`
        : `Cancelled password change requirement for @${selectedUser.username}.`,
      'info'
    );
  };

  const handleAddNewUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserUsername.trim()) {
      showToast('User name and username are required.', 'error');
      return;
    }
    const cleanUsername = newUserUsername.trim().toLowerCase();
    if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      showToast(`Username '@${cleanUsername}' already exists. Please choose a different handle.`, 'error');
      return;
    }
    const nextId = Math.max(...users.map((u) => u.id), 0) + 1;
    const createdUser: User = {
      id: nextId,
      name: newUserName.trim(),
      username: cleanUsername,
      role: newUserRole,
      pass: newUserPassword.trim() || `${cleanUsername}@2026`,
      mustChangePassword: newUserMustChangePassword,
    };
    const updatedUsers = [...users, createdUser];
    setUsers(updatedUsers);
    saveSystemUsers(updatedUsers);
    setSelectedUserId(nextId);
    setShowAddUserModal(false);
    setNewUserName('');
    setNewUserUsername('');
    setNewUserPassword('');
    setNewUserMustChangePassword(true);
    showToast(`User '${createdUser.name}' registered! (First-time password change: ${newUserMustChangePassword ? 'Required' : 'Optional'})`, 'success');
  };

  // Role Default Templates Handlers
  const handleToggleRoleScreen = (role: UserRole, modId: NavModule) => {
    if (role === 'Admin') return;
    const currentList = rolePermissions[role] || [];
    const updated = currentList.includes(modId)
      ? currentList.filter((m) => m !== modId)
      : [...currentList, modId];
    setRolePermissions({ ...rolePermissions, [role]: updated });
  };

  const handleToggleRoleFunction = (role: UserRole, funcId: NavModule) => {
    if (role === 'Admin') return;
    const currentList = writePermissions[role] || [];
    const updated = currentList.includes(funcId)
      ? currentList.filter((m) => m !== funcId)
      : [...currentList, funcId];
    setWritePermissions({ ...writePermissions, [role]: updated });
  };

  const handleSaveRoleTemplates = () => {
    localStorage.setItem('emdad_role_permissions', JSON.stringify(rolePermissions));
    localStorage.setItem('emdad_write_permissions', JSON.stringify(writePermissions));
    window.dispatchEvent(new Event('permissions_updated'));
    showToast('Role default permissions templates saved successfully!', 'success');
  };

  const handleResetAllRoleTemplates = () => {
    if (!window.confirm('Reset all role template defaults to factory definitions?')) return;
    localStorage.removeItem('emdad_role_permissions');
    localStorage.removeItem('emdad_write_permissions');
    setRolePermissions({ ...MODULE_PERMISSIONS });
    setWritePermissions({ ...WRITE_PERMISSIONS });
    window.dispatchEvent(new Event('permissions_updated'));
    showToast('Role permissions templates reset to factory defaults.', 'info');
  };

  // Strict Admin RBAC Protection
  if (user?.role !== 'Admin') {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white border border-rose-200 rounded p-6 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-2xl font-bold mx-auto mb-3">
          🔒
        </div>
        <h2 className="text-base font-bold text-slate-800">Administrative Clearance Required</h2>
        <p className="text-xs text-slate-600 mt-2 max-w-md mx-auto">
          System configuration, confidential Azure SQL database credentials, API secret keys, and deployment exports are restricted strictly to users with the <strong>Admin</strong> role.
        </p>
        <div className="mt-4 inline-block px-3 py-1 bg-slate-100 rounded text-xs font-mono text-slate-700 border border-slate-300">
          Current Role: <strong>{user?.role || 'Guest'}</strong> (Access Restricted)
        </div>
      </div>
    );
  }

  const handleSaveAzureConfig = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('azure_api_endpoint', azureEndpoint.trim());
    if (azureApiKey) {
      localStorage.setItem('azure_api_key', azureApiKey.trim());
    } else {
      localStorage.removeItem('azure_api_key');
    }
    showToast('Azure SQL connection settings saved to local configuration.', 'success');
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testAzureConnection();
      if (result.ok) {
        setTestResult(`Success: ${result.message}`);
        showToast(result.message, 'success');
      } else {
        setTestResult(`Failed: ${result.message}`);
        showToast(`Connection notice: ${result.message}`, 'info');
      }
    } catch (err: any) {
      setTestResult(`Error: ${err?.message || 'Network error'}`);
      showToast('Connection test encountered an error.', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleDownloadStandalone = () => {
    const ok = window.confirm(
      'Admin Clearance Confirmation:\n\nDo you want to export the complete standalone index.html with live operational records?'
    );
    if (!ok) return;
    downloadStandaloneHtml(currentData);
    showToast('Standalone single-file HTML generated & downloaded!', 'success');
  };

  const handleImportSubmit = () => {
    if (!importJsonText.trim()) return;
    try {
      JSON.parse(importJsonText);
      onImportData(importJsonText);
      setImportJsonText('');
    } catch (err) {
      showToast('Invalid JSON file format.', 'error');
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-medium">System Configuration</div>
          <h1 className="text-base font-bold text-[#1a3055]">Settings &amp; Azure SQL Integration</h1>
        </div>
        <div className="flex items-center space-x-2">
          {dbStatus?.isConnected ? (
            <span
              className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded border border-emerald-300"
              title="Connected to live Azure SQL database"
            >
              🟢 Connected to Azure SQL
            </span>
          ) : (
            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded border border-amber-300">
              🟡 Local Cache Active
            </span>
          )}
        </div>
      </div>

      {/* Standalone Single File Generator Card */}
      <div className="bg-gradient-to-r from-[#1a3055] to-[#24476b] text-white rounded p-4 shadow-sm border border-[#1a3055]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-amber-400 text-xs font-bold uppercase tracking-wider">
              Deployment &amp; Single-File Distribution
            </div>
            <h2 className="text-base font-bold mt-0.5">Export Standalone Single HTML Web App</h2>
            <p className="text-xs text-slate-200 mt-1 max-w-xl">
              Bundles the entire application into a zero-dependency self-contained HTML file. You can upload
              this file directly to GitHub Pages, Azure Static Web Apps, or run it offline with local persistence.
            </p>
          </div>
          <button
            onClick={handleDownloadStandalone}
            className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-[#1a3055] font-bold text-xs rounded shadow-md transition cursor-pointer"
          >
            ⚡ Export &amp; Download HTML File
          </button>
        </div>
      </div>

      {/* Azure SQL Server Infrastructure */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm space-y-3">
        <div className="border-b pb-2 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-[#1a3055]">Azure SQL Server Infrastructure</h3>
            <div className="text-[11px] text-slate-500">
              Direct connection parameters for Azure SQL Server (tooltracking-sqlserver) and database (ToolTrackingDB)
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {onFetchLiveSql && (
              <button
                type="button"
                onClick={async () => {
                  setTestResult('Connecting to Azure SQL and downloading live tables...');
                  await onFetchLiveSql();
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded shadow text-xs flex items-center space-x-1.5 cursor-pointer"
              >
                <span>🔄</span>
                <span>Pull Live SQL Data (5000+ Tools)</span>
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSaveAzureConfig} className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <span className="text-[11px] font-bold text-slate-600">Quick Presets:</span>
            <button
              type="button"
              onClick={() => {
                setAzureEndpoint('/data-api/rest');
                setAzureApiKey('');
                localStorage.setItem('azure_api_endpoint', '/data-api/rest');
                localStorage.removeItem('azure_api_key');
                showToast('Endpoint set to Azure Static Web App Database (/data-api/rest)', 'success');
              }}
              className="px-2 py-0.5 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-300 rounded text-[11px] font-semibold cursor-pointer"
            >
              Option 1: Static Web App Database (/data-api/rest)
            </button>
            <button
              type="button"
              onClick={() => {
                const fnUrl = 'https://tooltracker-api-dyath8gehaavcdah.westeurope-01.azurewebsites.net/api/ToolTracker';
                const fnKey = 'XCOETTV_A-BHeNPUSFSpChSOv9DAJcZOzrz1NvOlROofAzFu2tbo_Q==';
                setAzureEndpoint(fnUrl);
                setAzureApiKey(fnKey);
                localStorage.setItem('azure_api_endpoint', fnUrl);
                localStorage.setItem('azure_api_key', fnKey);
                showToast('Endpoint and API Key configured for Azure Function backend!', 'success');
              }}
              className="px-2 py-0.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-300 rounded text-[11px] font-semibold cursor-pointer"
            >
              Option 2: Azure Function Backend
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold mb-1">
                Azure API / Gateway Endpoint
                <span className="font-normal text-slate-500 ml-1">
                  (Default: <code>/data-api/rest</code> or Azure Function URL)
                </span>
              </label>
              <input
                type="text"
                value={azureEndpoint}
                onChange={(e) => setAzureEndpoint(e.target.value)}
                placeholder="/data-api/rest"
                className="w-full border rounded px-2.5 py-1.5 font-mono"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-bold">Azure API Key (Optional)</label>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-[10px] text-amber-700 hover:text-amber-900 font-bold cursor-pointer"
                >
                  {showKey ? '🔒 Hide Key' : '👁️ Show Key'}
                </button>
              </div>
              <input
                type={showKey ? 'text' : 'password'}
                value={azureApiKey}
                onChange={(e) => setAzureApiKey(e.target.value)}
                placeholder="Leave blank for Static Web Apps Database Connection"
                className="w-full border rounded px-2.5 py-1.5 font-mono"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-700 font-mono text-[11px] space-y-1">
            <div><strong>Host (Azure SQL Server):</strong> tooltracking-sqlserver.database.windows.net</div>
            <div><strong>Production DB:</strong> ToolTrackingDB</div>
            <div><strong>Hosting:</strong> Azure Static Web App (tooltracker-app)</div>
            <div><strong>Data Source Protocol:</strong> Azure Static Web Apps Linked Database (<code>/data-api/rest</code>) or Azure Function REST</div>
          </div>

          {testResult && (
            <div className={`p-2.5 rounded text-xs font-mono border ${testResult.startsWith('Success') ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-amber-50 text-amber-800 border-amber-300'}`}>
              {testResult}
            </div>
          )}

          <div className="flex flex-wrap justify-between items-center gap-2 pt-1">
            <div className="flex flex-wrap gap-2">
              {onClearDemoData && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const ok = window.confirm(
                        'Clear Demo Records Confirmation:\n\nThis will remove the default mock Jobs, Delivery Tickets, Return Tickets, and Callouts from local cache so the app displays the pure empty/real state from your Azure SQL database.\n\nDo you want to proceed?'
                      );
                      if (ok) onClearDemoData(false);
                    }}
                    className="px-3 py-1.5 rounded bg-rose-50 hover:bg-rose-100 border border-rose-300 font-bold text-rose-700 cursor-pointer text-xs"
                  >
                    🗑️ Clear Demo Data (Show Pure SQL State)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ok = window.confirm(
                        'Clear ALL Data (Including Demo Inventory):\n\nThis will empty ALL tables (Jobs, Delivery Tickets, RTs, and Inventory tools) from local storage. The inventory will only display rows fetched live from your Azure SQL database.\n\nDo you want to proceed?'
                      );
                      if (ok) onClearDemoData(true);
                    }}
                    className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-semibold text-slate-700 cursor-pointer text-xs"
                  >
                    Reset Inventory to Empty (Pure SQL)
                  </button>
                </>
              )}
            </div>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold text-slate-700 cursor-pointer disabled:opacity-50"
              >
                {isTesting ? 'Testing Connection...' : '🔌 Test Connection'}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] cursor-pointer"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* User Role Switching */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm space-y-3">
        <div className="border-b pb-2">
          <h3 className="text-sm font-bold text-[#1a3055]">User Profile &amp; Role Management</h3>
          <div className="text-[11px] text-slate-500">
            Switch active user clearance to test role-based access control across all 7 operational roles
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="font-medium text-slate-700">Active Test Role:</div>
          {ALL_ROLES.map((r) => (
            <button
              key={r}
              onClick={() => {
                onUpdateUserRole(r);
                showToast(`Switched active user role to ${r}`, 'info');
              }}
              className={`px-3 py-1.5 rounded font-bold transition cursor-pointer flex items-center gap-1 ${
                user?.role === r
                  ? 'bg-[#1a3055] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              <span>{r === 'Admin' ? '👑' : r === 'Operations' ? '⚙️' : r === 'QC' || r === 'Inspector' ? '🔬' : r === 'Accounts' ? '💳' : '👤'}</span>
              <span>{r}</span>
            </button>
          ))}
        </div>
      </div>

      {/* User-Based Access Control (RBAC) & Screen / Function Permissions Matrix */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm space-y-4">
        {/* Header with Mode Switch */}
        <div className="border-b pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🛡️</span>
              <h3 className="text-sm font-bold text-[#1a3055]">User-Based Access Control &amp; Permissions Matrix</h3>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Grant and configure screen visibility (View) and operational functions (Edit &amp; Save) per individual user.
              Operations team members can be granted tailored access to other categories like Inventory, Invoicing, QC, or Contracts.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mode Switcher */}
            <div className="bg-slate-100 p-0.5 rounded border border-slate-300 flex items-center text-xs">
              <button
                type="button"
                onClick={() => setMatrixMode('users')}
                className={`px-3 py-1 rounded font-bold cursor-pointer transition flex items-center gap-1.5 ${
                  matrixMode === 'users'
                    ? 'bg-[#1a3055] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>👤</span>
                <span>Grant by User (Name &amp; Role)</span>
              </button>
              <button
                type="button"
                onClick={() => setMatrixMode('roles')}
                className={`px-3 py-1 rounded font-bold cursor-pointer transition flex items-center gap-1.5 ${
                  matrixMode === 'roles'
                    ? 'bg-[#1a3055] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🛡️</span>
                <span>Role Default Templates</span>
              </button>
            </div>

            {matrixMode === 'users' ? (
              <button
                type="button"
                onClick={handleSaveSelectedUser}
                className="px-3 py-1 rounded bg-[#107c41] hover:bg-[#0c6233] text-white font-bold text-xs cursor-pointer transition shadow-xs flex items-center gap-1"
              >
                <span>💾</span>
                <span>Save Permissions</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveRoleTemplates}
                className="px-3 py-1 rounded bg-[#107c41] hover:bg-[#0c6233] text-white font-bold text-xs cursor-pointer transition shadow-xs flex items-center gap-1"
              >
                <span>💾</span>
                <span>Save Role Templates</span>
              </button>
            )}
          </div>
        </div>

        {/* ================= USER-SPECIFIC MATRIX MODE ================= */}
        {matrixMode === 'users' && (
          <div className="space-y-4">
            {/* User Search & Role Filter Header */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-md border border-slate-200">
              <div className="flex-1 flex flex-wrap items-center gap-2">
                {/* Search Bar */}
                <div className="relative min-w-[220px] flex-1 max-w-xs">
                  <span className="absolute inset-y-0 left-2.5 flex items-center text-slate-400 text-xs pointer-events-none">🔍</span>
                  <input
                    type="text"
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    placeholder="Search by user name or role..."
                    className="w-full bg-white border border-slate-300 rounded pl-7 pr-2.5 py-1 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {userSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setUserSearchTerm('')}
                      className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  {[
                    { key: 'All', label: `All (${users.length})` },
                    { key: 'Operations', label: `Operations & Handlers (${users.filter((u) => u.role === 'Operations' || u.role === 'Handler').length})` },
                    { key: 'QC', label: `QC & Inspection (${users.filter((u) => u.role === 'QC' || u.role === 'Inspector').length})` },
                    { key: 'Accounts', label: `Accounts (${users.filter((u) => u.role === 'Accounts').length})` },
                    { key: 'Admin', label: `Admin (${users.filter((u) => u.role === 'Admin').length})` },
                  ].map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setUserRoleFilter(filter.key)}
                      className={`px-2 py-0.5 rounded cursor-pointer font-semibold transition ${
                        userRoleFilter === filter.key
                          ? 'bg-[#1a3055] text-white shadow-2xs'
                          : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add User Button */}
              <button
                type="button"
                onClick={() => setShowAddUserModal(true)}
                className="px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs cursor-pointer transition shadow-2xs flex items-center justify-center gap-1 shrink-0"
              >
                <span>➕</span>
                <span>Add User</span>
              </button>
            </div>

            {/* Add User Modal */}
            {showAddUserModal && (
              <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between border-b border-blue-200 pb-1.5">
                  <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <span>➕</span>
                    <span>Register New Team Member</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="text-xs text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                  >
                    ✕ Cancel
                  </button>
                </div>
                <form onSubmit={handleAddNewUserSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Prasoonan Nair"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Username Handle *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. prasoonan"
                      value={newUserUsername}
                      onChange={(e) => setNewUserUsername(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Base Role *</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-semibold"
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Password</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Default: username@2026"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 font-mono"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1 rounded bg-[#107c41] hover:bg-[#0c6233] text-white font-bold cursor-pointer shrink-0"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  <div className="sm:col-span-2 md:col-span-4 flex items-center gap-2 pt-1 text-[11px] text-slate-700 bg-white/70 p-2 rounded border border-blue-100">
                    <input
                      type="checkbox"
                      id="newUserMustChangePassword"
                      checked={newUserMustChangePassword}
                      onChange={(e) => setNewUserMustChangePassword(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                    />
                    <label htmlFor="newUserMustChangePassword" className="cursor-pointer font-semibold text-blue-950 flex items-center gap-1.5">
                      <span>🔑</span>
                      <span>Require user to choose and set their own private password on first login</span>
                    </label>
                  </div>
                </form>
              </div>
            )}

            {/* User Cards Grid Selector */}
            <div>
              <div className="text-[11px] font-bold text-slate-600 mb-1.5 flex items-center justify-between">
                <span>Select User to Configure Screen &amp; Edit Permissions:</span>
                <span className="font-normal text-slate-500">
                  Showing {users.filter((u) => {
                    const match = u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                      u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                      u.role.toLowerCase().includes(userSearchTerm.toLowerCase());
                    if (!match) return false;
                    if (userRoleFilter === 'All') return true;
                    if (userRoleFilter === 'Operations') return u.role === 'Operations' || u.role === 'Handler';
                    if (userRoleFilter === 'QC') return u.role === 'QC' || u.role === 'Inspector';
                    if (userRoleFilter === 'Accounts') return u.role === 'Accounts';
                    if (userRoleFilter === 'Admin') return u.role === 'Admin';
                    return u.role === userRoleFilter;
                  }).length} users
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 max-h-56 overflow-y-auto p-1 border border-slate-200 rounded-lg bg-slate-50/50">
                {users
                  .filter((u) => {
                    const match =
                      u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                      u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                      u.role.toLowerCase().includes(userSearchTerm.toLowerCase());
                    if (!match) return false;
                    if (userRoleFilter === 'All') return true;
                    if (userRoleFilter === 'Operations') return u.role === 'Operations' || u.role === 'Handler';
                    if (userRoleFilter === 'QC') return u.role === 'QC' || u.role === 'Inspector';
                    if (userRoleFilter === 'Accounts') return u.role === 'Accounts';
                    if (userRoleFilter === 'Admin') return u.role === 'Admin';
                    return u.role === userRoleFilter;
                  })
                  .map((u) => {
                    const isSelected = selectedUser?.id === u.id;
                    const uKey = (u.username || '').toLowerCase();
                    const uOverride = userPermissions[uKey] || userPermissions[String(u.id)];
                    const isCustom = Boolean(uOverride && (Array.isArray(uOverride.visible) || Array.isArray(uOverride.editable)));

                    const roleBadgeColor =
                      u.role === 'Admin'
                        ? 'bg-purple-100 text-purple-800 border-purple-300'
                        : u.role === 'Operations' || u.role === 'Handler'
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : u.role === 'QC' || u.role === 'Inspector'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : u.role === 'Accounts'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-slate-100 text-slate-700 border-slate-300';

                    const avatarColor =
                      u.role === 'Admin'
                        ? 'bg-purple-600 text-white'
                        : u.role === 'Operations' || u.role === 'Handler'
                        ? 'bg-[#1a3055] text-white'
                        : u.role === 'QC' || u.role === 'Inspector'
                        ? 'bg-amber-600 text-white'
                        : u.role === 'Accounts'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-500 text-white';

                    const initials = u.name
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setSelectedUserId(u.id)}
                        className={`text-left p-2 rounded-lg border transition cursor-pointer relative flex flex-col justify-between ${
                          isSelected
                            ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-400/40 shadow-xs'
                            : 'bg-white hover:bg-slate-100/80 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${avatarColor}`}>
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs text-slate-900 truncate" title={u.name}>
                              {u.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              @{u.username}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${roleBadgeColor}`}>
                            {u.role}
                          </span>
                          {u.role === 'Admin' ? (
                            <span className="text-[9px] font-mono text-purple-700 font-bold">Full Access</span>
                          ) : isCustom ? (
                            <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1 rounded border border-emerald-200" title="Custom per-user access active">
                              ⚡ Custom
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono text-slate-400" title="Inheriting base role defaults">
                              🛡️ Defaults
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Selected User Access Configuration Card */}
            {selectedUser && (
              <div className="bg-slate-50/70 border border-slate-200 rounded-lg p-3.5 space-y-4">
                {/* User Summary & Quick Action Bar */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#1a3055] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                      {selectedUser.name
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{selectedUser.name}</span>
                        <span className="text-xs text-slate-400 font-mono">@{selectedUser.username}</span>

                        {/* Base Role Selector Dropdown */}
                        <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-slate-300 text-xs">
                          <span className="text-slate-500 font-medium text-[11px]">Base Role:</span>
                          <select
                            value={selectedUser.role}
                            onChange={(e) => handleChangeSelectedUserRole(e.target.value as UserRole)}
                            className="font-bold text-blue-900 bg-transparent border-0 cursor-pointer text-xs focus:ring-0 p-0"
                          >
                            {ALL_ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>

                        {/* Status Badge */}
                        {selectedUser.role === 'Admin' ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
                            👑 Superuser (Admin) &mdash; Unconditional Full Access
                          </span>
                        ) : hasCustomOverride ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                            <span>⚡</span>
                            <span>Custom Access Overrides Active ({effectiveUserVisible.length} screens, {effectiveUserEditable.length} can edit)</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-200 text-slate-700 border border-slate-300 flex items-center gap-1">
                            <span>🛡️</span>
                            <span>Inheriting Standard {selectedUser.role} Role Defaults ({effectiveUserVisible.length} screens)</span>
                          </span>
                        )}

                        {/* Password Change Status & Force Toggle */}
                        <button
                          type="button"
                          onClick={handleToggleMustChangePassword}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                            selectedUser.mustChangePassword
                              ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                          }`}
                          title="Click to toggle mandatory password change on this user's next login"
                        >
                          <span>🔑</span>
                          <span>{selectedUser.mustChangePassword ? '✓ Force Password Change Active' : 'Require Password Change'}</span>
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-500 mt-1">
                        {selectedUser.role === 'Admin'
                          ? 'Admins automatically have clearance to view and edit all operational modules.'
                          : hasCustomOverride
                          ? 'User-specific permissions are overriding base role defaults. You can grant extra cross-category access to this user without affecting others.'
                          : `Currently using standard defaults for role '${selectedUser.role}'. Toggle any checkbox below to grant extra screens or edit clearance to this user.`}
                      </div>
                    </div>
                  </div>

                  {/* Bulk Actions for Selected User */}
                  {selectedUser.role !== 'Admin' && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs shrink-0">
                      <button
                        type="button"
                        onClick={handleUserSelectAllVisible}
                        className="px-2.5 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold text-[11px] cursor-pointer transition"
                        title="Grant visibility to all screens"
                      >
                        👁️ Show All
                      </button>
                      <button
                        type="button"
                        onClick={handleUserHideAllScreens}
                        className="px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] cursor-pointer transition"
                        title="Hide all screens for this user"
                      >
                        🚫 Hide All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={handleUserGrantAllEdit}
                        className="px-2.5 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-[11px] cursor-pointer transition"
                        title="Grant edit & save access to all functional modules"
                      >
                        ✏️ Grant All Edit
                      </button>
                      <button
                        type="button"
                        onClick={handleUserSetAllViewOnly}
                        className="px-2.5 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] cursor-pointer transition"
                        title="Remove edit access while keeping visible screens read-only"
                      >
                        🔒 Set All View-Only
                      </button>
                      {hasCustomOverride && (
                        <>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={handleUserResetToRoleDefaults}
                            className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-[11px] cursor-pointer transition"
                            title="Remove custom overrides and restore role default permissions"
                          >
                            ↺ Reset to Role Defaults
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Module Cards Grid for Selected User */}
                <div className="space-y-3">
                  {['Operations', 'Inventory', 'Maintenance & QC', 'Finance & Invoicing', 'Contracts', 'System & Admin'].map((grp) => {
                    const groupModules = ALL_MODULES.filter((m) => m.group === grp);
                    if (groupModules.length === 0) return null;

                    const activeInGrp = groupModules.filter((m) => effectiveUserVisible.includes(m.id)).length;
                    const editInGrp = groupModules.filter((m) => effectiveUserEditable.includes(m.id)).length;

                    return (
                      <div key={grp} className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
                        <div className="bg-[#12233c] text-white px-3 py-2 flex items-center justify-between">
                          <div className="font-bold text-xs tracking-wide flex items-center gap-2">
                            <span>
                              {grp === 'Operations' ? '⚙️' : grp === 'Inventory' ? '📦' : grp === 'Maintenance & QC' ? '🔬' : grp === 'Finance & Invoicing' ? '💳' : grp === 'Contracts' ? '📄' : '🔒'}
                            </span>
                            <span>{grp} Module</span>
                          </div>
                          <div className="text-[10px] text-slate-300 font-mono">
                            {activeInGrp} of {groupModules.length} visible ({editInGrp} can edit)
                          </div>
                        </div>

                        <div className="divide-y divide-slate-100">
                          {groupModules.map((m) => {
                            const isVisible =
                              selectedUser.role === 'Admin' ||
                              effectiveUserVisible.includes(m.id);

                            const canEdit =
                              selectedUser.role === 'Admin' ||
                              effectiveUserEditable.includes(m.id);

                            const isAdmin = selectedUser.role === 'Admin';
                            const isSettingsRestricted = m.id === 'settings' && !isAdmin;

                            return (
                              <div
                                key={m.id}
                                className={`p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs transition ${
                                  !isVisible
                                    ? 'bg-slate-50/60 opacity-60'
                                    : canEdit
                                    ? 'bg-emerald-50/20 hover:bg-emerald-50/40'
                                    : 'bg-blue-50/20 hover:bg-blue-50/40'
                                }`}
                              >
                                {/* Module Info */}
                                <div className="flex-1 min-w-[220px]">
                                  <div className="flex items-center gap-2">
                                    <span className="text-base">{m.icon}</span>
                                    <span className="font-bold text-slate-900">{m.label}</span>

                                    {/* Status Badge */}
                                    {!isVisible ? (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-200 text-slate-600">
                                        🚫 Hidden
                                      </span>
                                    ) : canEdit ? (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                        ✅ Can Edit &amp; Save
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                        👁️ View Only
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5 pl-6">
                                    {m.desc}
                                  </div>
                                </div>

                                {/* Controls: Visibility and Edit Access Checkboxes */}
                                <div className="flex items-center gap-5 shrink-0 pl-6 md:pl-0">
                                  {/* Visibility Checkbox */}
                                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isVisible}
                                      disabled={isAdmin || isSettingsRestricted}
                                      onChange={() => handleToggleUserScreen(m.id)}
                                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                                    />
                                    <span className={isVisible ? 'text-blue-900 font-bold' : 'text-slate-400'}>
                                      👁️ Visible in Menu
                                    </span>
                                  </label>

                                  {/* Edit / Write Checkbox */}
                                  {m.canHaveWriteAccess ? (
                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={canEdit}
                                        disabled={isAdmin || isSettingsRestricted}
                                        onChange={() => handleToggleUserFunction(m.id)}
                                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
                                      />
                                      <span className={canEdit ? 'text-emerald-900 font-bold' : 'text-slate-500'}>
                                        ✏️ Can Edit &amp; Save
                                      </span>
                                    </label>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 italic">
                                      Read-Only Screen
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= ROLE DEFAULT TEMPLATES MODE ================= */}
        {matrixMode === 'roles' && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-900">
              <strong>Role Defaults Template:</strong> These settings determine the fallback baseline permissions for any new or existing user assigned to each role who does not have custom per-user overrides.
            </div>

            {/* Role Tabs */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Select Role Template to Edit:</label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_ROLES.map((r) => {
                  const isSelected = selectedRoleForMatrix === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelectedRoleForMatrix(r)}
                      className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-[#1a3055] text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                      }`}
                    >
                      <span>{r === 'Admin' ? '👑' : r === 'Operations' ? '⚙️' : r === 'QC' || r === 'Inspector' ? '🔬' : r === 'Accounts' ? '💳' : '👤'}</span>
                      <span>{r}</span>
                      {r === 'Admin' && <span className="text-[10px] bg-amber-400 text-slate-900 px-1 rounded font-mono">Full</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Role Matrix Content */}
            <div className="bg-slate-50/70 border border-slate-200 rounded p-3 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                <div>
                  <span className="text-xs font-bold text-slate-900">
                    Editing Role Template for: <strong className="text-blue-900">{selectedRoleForMatrix}</strong>
                  </span>
                  {selectedRoleForMatrix === 'Admin' ? (
                    <span className="text-xs text-amber-900 ml-2 font-semibold">
                      (Superuser clearance &mdash; Admin has unconditional read &amp; write access to all modules)
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 ml-2 font-mono">
                      ({(rolePermissions[selectedRoleForMatrix] || []).length} screens, {(writePermissions[selectedRoleForMatrix] || []).length} functions active)
                    </span>
                  )}
                </div>

                {selectedRoleForMatrix !== 'Admin' && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        const allModIds = ALL_MODULES.map((m) => m.id);
                        setRolePermissions({ ...rolePermissions, [selectedRoleForMatrix]: allModIds });
                      }}
                      className="px-2 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold text-[11px] cursor-pointer"
                    >
                      👁️ Show All Screens
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRolePermissions({ ...rolePermissions, [selectedRoleForMatrix]: [] });
                      }}
                      className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] cursor-pointer"
                    >
                      🚫 Hide All Screens
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allEditable = ALL_MODULES.filter((m) => m.canHaveWriteAccess && m.id !== 'settings').map((m) => m.id);
                        setWritePermissions({ ...writePermissions, [selectedRoleForMatrix]: allEditable });
                      }}
                      className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-[11px] cursor-pointer"
                    >
                      ✏️ Grant All Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWritePermissions({ ...writePermissions, [selectedRoleForMatrix]: [] });
                      }}
                      className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] cursor-pointer"
                    >
                      🔒 Set All View-Only
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleResetAllRoleTemplates}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-[11px] cursor-pointer"
                    >
                      ↺ Factory Defaults
                    </button>
                  </div>
                )}
              </div>

              {/* Module Cards for Role Template */}
              <div className="space-y-3">
                {['Operations', 'Inventory', 'Maintenance & QC', 'Finance & Invoicing', 'Contracts', 'System & Admin'].map((grp) => {
                  const groupModules = ALL_MODULES.filter((m) => m.group === grp);
                  if (groupModules.length === 0) return null;

                  return (
                    <div key={grp} className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
                      <div className="bg-[#12233c] text-white px-3 py-2 flex items-center justify-between">
                        <div className="font-bold text-xs tracking-wide flex items-center gap-2">
                          <span>{grp === 'Operations' ? '⚙️' : grp === 'Inventory' ? '📦' : grp === 'Maintenance & QC' ? '🔬' : grp === 'Finance & Invoicing' ? '💳' : grp === 'Contracts' ? '📄' : '🔒'}</span>
                          <span>{grp} Module Template</span>
                        </div>
                        <div className="text-[10px] text-slate-300 font-mono">
                          {groupModules.length} screen{groupModules.length > 1 ? 's' : ''}
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {groupModules.map((m) => {
                          const isVisible =
                            selectedRoleForMatrix === 'Admin' ||
                            (rolePermissions[selectedRoleForMatrix] || []).includes(m.id);

                          const canEdit =
                            selectedRoleForMatrix === 'Admin' ||
                            (writePermissions[selectedRoleForMatrix] || []).includes(m.id);

                          const isAdmin = selectedRoleForMatrix === 'Admin';
                          const isSettingsRestricted = m.id === 'settings' && !isAdmin;

                          return (
                            <div
                              key={m.id}
                              className={`p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs transition ${
                                !isVisible
                                  ? 'bg-slate-50/60 opacity-60'
                                  : canEdit
                                  ? 'bg-emerald-50/20 hover:bg-emerald-50/40'
                                  : 'bg-blue-50/20 hover:bg-blue-50/40'
                              }`}
                            >
                              <div className="flex-1 min-w-[220px]">
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{m.icon}</span>
                                  <span className="font-bold text-slate-900">{m.label}</span>
                                  {!isVisible ? (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-200 text-slate-600">
                                      🚫 Hidden
                                    </span>
                                  ) : canEdit ? (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      ✅ Can Edit
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                      👁️ View Only
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 pl-6">
                                  {m.desc}
                                </div>
                              </div>

                              <div className="flex items-center gap-4 shrink-0 pl-6 md:pl-0">
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isVisible}
                                    disabled={isAdmin || isSettingsRestricted}
                                    onChange={() => handleToggleRoleScreen(selectedRoleForMatrix, m.id)}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                                  />
                                  <span className={isVisible ? 'text-blue-900 font-bold' : 'text-slate-400'}>
                                    👁️ Visible in Menu
                                  </span>
                                </label>

                                {m.canHaveWriteAccess ? (
                                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={canEdit}
                                      disabled={isAdmin || isSettingsRestricted}
                                      onChange={() => handleToggleRoleFunction(selectedRoleForMatrix, m.id)}
                                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
                                    />
                                    <span className={canEdit ? 'text-emerald-900 font-bold' : 'text-slate-500'}>
                                      ✏️ Can Edit &amp; Save
                                    </span>
                                  </label>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">
                                    Read-Only Dashboard
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Data Backup & Restore */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm space-y-3">
        <div className="border-b pb-2">
          <h3 className="text-sm font-bold text-[#1a3055]">Data Backup, Migration &amp; Reset</h3>
          <div className="text-[11px] text-slate-500">
            Export all operational records to JSON or restore initial demonstration catalog
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button
            onClick={onExportData}
            className="px-3 py-1.5 rounded bg-blue-700 text-white font-bold hover:bg-blue-800 cursor-pointer"
          >
            💾 Export Full JSON Backup
          </button>
          <button
            onClick={() => {
              if (window.confirm('Reset all operational data to initial demo state?')) {
                onResetData();
              }
            }}
            className="px-3 py-1.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-bold hover:bg-rose-200 cursor-pointer"
          >
            ⚠️ Reset All Data to Initial Demo State
          </button>
        </div>

        <div className="pt-2 space-y-2 text-xs">
          <label className="block font-bold">Import JSON Data</label>
          <textarea
            rows={3}
            placeholder="Paste exported JSON payload here..."
            value={importJsonText}
            onChange={(e) => setImportJsonText(e.target.value)}
            className="w-full border rounded px-2.5 py-1.5 font-mono text-[11px]"
          />
          {importJsonText.trim() && (
            <button
              onClick={handleImportSubmit}
              className="px-3 py-1.5 rounded bg-emerald-700 text-white font-bold hover:bg-emerald-800 cursor-pointer"
            >
              Restore from JSON Payload
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
