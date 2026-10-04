import React, { useState } from 'react';
import { User, UserRole, NavModule } from '../types';
import { MODULE_PERMISSIONS, WRITE_PERMISSIONS } from '../data/initialData';
import { downloadStandaloneHtml, testAzureConnection, DbConnectionStatus } from '../services/api';

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

const ALL_MODULES: { id: NavModule; label: string; group: string; icon: string }[] = [
  // Operations
  { id: 'dashboard', label: 'Operations Dashboard', group: 'Operations', icon: '📊' },
  { id: 'jobs', label: 'Drilling Jobs & Job File', group: 'Operations', icon: '⚡' },
  { id: 'callouts', label: 'Rig Callouts', group: 'Operations', icon: '📞' },
  { id: 'dt', label: 'Delivery Tickets (DT)', group: 'Operations', icon: '🚚' },
  { id: 'rt', label: 'Receiving Tickets (RT)', group: 'Operations', icon: '📥' },
  { id: 'job-tools-list', label: 'Job Tools List', group: 'Operations', icon: '📋' },
  { id: 'tool-history', label: 'Tool Movement History', group: 'Operations', icon: '⏱️' },
  { id: 'gatepass', label: 'Security Gate Pass', group: 'Operations', icon: '🛡️' },
  { id: 'utilization', label: 'Utilization & Daily Sheet', group: 'Operations', icon: '📈' },

  // Inventory
  { id: 'inventory-dash', label: 'Inventory Dashboard', group: 'Inventory', icon: '📊' },
  { id: 'inventory', label: 'Assets and Inventory', group: 'Inventory', icon: '🧰' },
  { id: 'categories-sizes', label: 'Tool Categories & Sizes Master', group: 'Inventory', icon: '🏷️' },

  // Maintenance & QC
  { id: 'maintenance-dash', label: 'Maintenance & QC Dashboard', group: 'Maintenance & QC', icon: '📊' },
  { id: 'inspection', label: 'QC Inspection Bay', group: 'Maintenance & QC', icon: '🔍' },
  { id: 'maintenance', label: 'Maintenance Work Orders', group: 'Maintenance & QC', icon: '🛠️' },

  // Finance & Contracts
  { id: 'billing-dash', label: 'Billing Dashboard', group: 'Finance & Invoicing', icon: '💳' },
  { id: 'invoicing', label: 'Invoicing Screen (Audit & Ledger)', group: 'Finance & Invoicing', icon: '📄' },
  { id: 'contracts', label: 'Master Contracts & Price Book', group: 'Finance & Invoicing', icon: '📑' },

  // System
  { id: 'settings', label: 'System & Azure SQL Settings', group: 'System & Admin', icon: '⚙️' },
  { id: 'data-management', label: 'Data Management Tool (DMT)', group: 'System & Admin', icon: '🗄️' },
];

const FUNCTION_PERMISSIONS: { id: NavModule; label: string; desc: string }[] = [
  { id: 'jobs', label: 'Jobs & Job File Management', desc: 'Create, modify drilling jobs, checklists, assign tools & re-open' },
  { id: 'dt', label: 'Delivery Tickets Dispatch', desc: 'Create, sign, issue and ship delivery tickets to rigs' },
  { id: 'rt', label: 'Receiving Tickets & Backloads', desc: 'Process backloads, inspect conditions (USED, NOT USED, LIH)' },
  { id: 'callouts', label: 'Callouts Authorization', desc: 'Create, modify and approve rig callouts' },
  { id: 'gatepass', label: 'Security Gate Pass Issuance', desc: 'Issue 3rd-party tool return & maintenance gate passes' },
  { id: 'inventory', label: 'Asset Fleet Catalog', desc: 'Add new tools, update serials, change ownership & scrap tools' },
  { id: 'categories-sizes', label: 'Tool Categories & Sizes Master', desc: 'Add, rename, and delete standardized categories & sizes' },
  { id: 'inspection', label: 'QC Inspection Certification', desc: 'Perform MPI/visual inspections and sign off inspection reports' },
  { id: 'maintenance', label: 'Maintenance Work Orders', desc: 'Create work orders, perform redressing, and close maintenance' },
  { id: 'utilization', label: 'Fleet & Engineer Utilization', desc: 'Log daily standby/operational charges and engineer rates' },
  { id: 'contracts', label: 'Contract Price Schedules', desc: 'Update ADNOC contract terms, rental rates and BHA items' },
  { id: 'settings', label: 'System Configuration & SQL', desc: 'Modify Azure SQL parameters, API keys and reset operational data' },
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

  // Role-Based Access Control (RBAC) Matrix State
  const [selectedRoleForMatrix, setSelectedRoleForMatrix] = useState<UserRole>('Operations');

  const [rolePermissions, setRolePermissions] = useState<Record<UserRole, NavModule[]>>(() => {
    try {
      const saved = localStorage.getItem('emdad_role_permissions');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { ...MODULE_PERMISSIONS };
  });

  const [writePermissions, setWritePermissions] = useState<Record<UserRole, NavModule[]>>(() => {
    try {
      const saved = localStorage.getItem('emdad_write_permissions');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { ...WRITE_PERMISSIONS };
  });

  const handleToggleScreen = (role: UserRole, modId: NavModule) => {
    if (role === 'Admin') return; // Admin has full access
    const currentList = rolePermissions[role] || [];
    const updated = currentList.includes(modId)
      ? currentList.filter((m) => m !== modId)
      : [...currentList, modId];
    setRolePermissions({ ...rolePermissions, [role]: updated });
  };

  const handleToggleFunction = (role: UserRole, funcId: NavModule) => {
    if (role === 'Admin') return; // Admin has full access
    const currentList = writePermissions[role] || [];
    const updated = currentList.includes(funcId)
      ? currentList.filter((m) => m !== funcId)
      : [...currentList, funcId];
    setWritePermissions({ ...writePermissions, [role]: updated });
  };

  const handleSavePermissions = () => {
    localStorage.setItem('emdad_role_permissions', JSON.stringify(rolePermissions));
    localStorage.setItem('emdad_write_permissions', JSON.stringify(writePermissions));
    window.dispatchEvent(new Event('permissions_updated'));
    showToast('Role permissions matrix saved successfully!', 'success');
  };

  const handleResetPermissions = () => {
    if (!window.confirm('Reset all role permissions to factory defaults?')) return;
    localStorage.removeItem('emdad_role_permissions');
    localStorage.removeItem('emdad_write_permissions');
    setRolePermissions({ ...MODULE_PERMISSIONS });
    setWritePermissions({ ...WRITE_PERMISSIONS });
    window.dispatchEvent(new Event('permissions_updated'));
    showToast('Role permissions reset to factory defaults.', 'info');
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
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded border border-emerald-300">
              🟢 Connected to Azure SQL ({dbStatus.counts.jobs} Jobs, {dbStatus.counts.inventory} Tools)
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

      {/* Role-Based Access Control (RBAC) & Screen / Function Permissions Matrix */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm space-y-4">
        <div className="border-b pb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[#1a3055] flex items-center gap-1.5">
              <span>🛡️</span>
              <span>Role-Based Access Control (RBAC) &amp; Permissions Matrix</span>
            </h3>
            <div className="text-[11px] text-slate-500">
              Configure which screens (view access) and operational functions (create/edit/delete access) are granted to each user role.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetPermissions}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold text-slate-700 text-xs cursor-pointer transition"
            >
              🔄 Reset to Defaults
            </button>
            <button
              type="button"
              onClick={handleSavePermissions}
              className="px-3.5 py-1 rounded bg-[#107c41] hover:bg-[#0c6233] text-white font-bold text-xs cursor-pointer transition shadow-xs flex items-center gap-1"
            >
              <span>💾</span>
              <span>Save Permissions Matrix</span>
            </button>
          </div>
        </div>

        {/* Role Selector Tabs */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Select Role to Configure:</label>
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

        {/* Permission Controls for Selected Role */}
        <div className="bg-slate-50/70 border border-slate-200 rounded p-3 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <div>
              <span className="text-xs font-bold text-slate-900">
                Editing Permissions for: <strong className="text-blue-900">{selectedRoleForMatrix}</strong>
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
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const allModIds = ALL_MODULES.map((m) => m.id);
                    setRolePermissions({ ...rolePermissions, [selectedRoleForMatrix]: allModIds });
                  }}
                  className="text-blue-700 hover:text-blue-900 font-semibold cursor-pointer underline text-[11px]"
                >
                  Select All Screens
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => {
                    setRolePermissions({ ...rolePermissions, [selectedRoleForMatrix]: [] });
                  }}
                  className="text-slate-600 hover:text-slate-800 font-semibold cursor-pointer underline text-[11px]"
                >
                  Clear All Screens
                </button>
              </div>
            )}
          </div>

          {/* Section 1: Screen & View Navigation Access */}
          <div>
            <h4 className="text-xs font-bold text-[#1a3055] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>🖥️</span>
              <span>Screen &amp; Navigation Module Access (Sidebar Visibility)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {['Operations', 'Inventory', 'Maintenance & QC', 'Finance & Invoicing', 'System & Admin'].map((grp) => {
                const groupModules = ALL_MODULES.filter((m) => m.group === grp);
                return (
                  <div key={grp} className="bg-white border border-slate-200 rounded p-2.5 shadow-2xs space-y-2">
                    <div className="text-[11px] font-bold text-slate-700 border-b pb-1 flex items-center justify-between">
                      <span>{grp}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{groupModules.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {groupModules.map((m) => {
                        const isGranted =
                          selectedRoleForMatrix === 'Admin' ||
                          (rolePermissions[selectedRoleForMatrix] || []).includes(m.id);
                        const isDisabled = selectedRoleForMatrix === 'Admin' || (m.id === 'settings' && selectedRoleForMatrix !== 'Admin');

                        return (
                          <label
                            key={m.id}
                            className={`flex items-start gap-2 text-xs cursor-pointer p-1 rounded transition ${
                              isGranted ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isGranted}
                              disabled={isDisabled}
                              onChange={() => handleToggleScreen(selectedRoleForMatrix, m.id)}
                              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                            />
                            <div className="leading-tight">
                              <span className="font-semibold text-slate-800 flex items-center gap-1">
                                <span>{m.icon}</span>
                                <span>{m.label}</span>
                              </span>
                              {m.id === 'categories-sizes' && (
                                <span className="block text-[10px] text-amber-800 font-mono">Master category &amp; size setup</span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Function & Action Write Access */}
          <div>
            <h4 className="text-xs font-bold text-[#1a3055] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>✍️</span>
              <span>Function &amp; Operational Action Permissions (Create / Edit / Delete)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {FUNCTION_PERMISSIONS.map((f) => {
                const isGranted =
                  selectedRoleForMatrix === 'Admin' ||
                  (writePermissions[selectedRoleForMatrix] || []).includes(f.id);
                const isDisabled = selectedRoleForMatrix === 'Admin';

                return (
                  <label
                    key={f.id}
                    className={`flex items-start gap-2.5 p-2 bg-white border border-slate-200 rounded text-xs cursor-pointer shadow-2xs transition ${
                      isGranted ? 'border-emerald-300 bg-emerald-50/30' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isGranted}
                      disabled={isDisabled}
                      onChange={() => handleToggleFunction(selectedRoleForMatrix, f.id)}
                      className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
                    />
                    <div>
                      <span className="font-bold text-slate-800 block">{f.label}</span>
                      <span className="text-[11px] text-slate-500 block leading-tight">{f.desc}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
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
