import React, { useState } from 'react';
import { User } from '../types';
import { downloadStandaloneHtml, testAzureConnection, DbConnectionStatus } from '../services/api';

interface SettingsViewProps {
  user?: User | null;
  onUpdateUserRole: (role: User['role']) => void;
  onResetData: () => void;
  onExportData: () => void;
  onImportData: (json: string) => void;
  onClearDemoData?: () => void;
  onFetchLiveSql?: () => void;
  dbStatus?: DbConnectionStatus;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  currentData: any;
}

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
  const [azureEndpoint, setAzureEndpoint] = useState(
    localStorage.getItem('azure_api_endpoint') || '/data-api/rest'
  );
  const [azureApiKey, setAzureApiKey] = useState(
    localStorage.getItem('azure_api_key') || ''
  );
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [importJsonText, setImportJsonText] = useState('');

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
                onClick={onFetchLiveSql}
                className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-300 rounded text-[11px] font-bold cursor-pointer"
              >
                🔄 Fetch Live SQL Data
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSaveAzureConfig} className="space-y-3 text-xs">
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
            <div><strong>Host:</strong> tooltracking-sqlserver.database.windows.net</div>
            <div><strong>Production DB:</strong> ToolTrackingDB</div>
            <div><strong>Test / Pilot DB:</strong> ToolTrackingDB_PILOT</div>
            <div><strong>Hosting:</strong> Azure Static Web App (tooltracker-app)</div>
          </div>

          {testResult && (
            <div className={`p-2.5 rounded text-xs font-mono border ${testResult.startsWith('Success') ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-amber-50 text-amber-800 border-amber-300'}`}>
              {testResult}
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <div className="space-x-2">
              {onClearDemoData && (
                <button
                  type="button"
                  onClick={() => {
                    const ok = window.confirm(
                      'Clear Demo Records Confirmation:\n\nThis will remove the default mock Jobs, Delivery Tickets, and Callouts from local cache so the app displays the pure empty/real state from your Azure SQL database.\n\nDo you want to proceed?'
                    );
                    if (ok) onClearDemoData();
                  }}
                  className="px-3 py-1.5 rounded bg-rose-50 hover:bg-rose-100 border border-rose-300 font-bold text-rose-700 cursor-pointer text-xs"
                >
                  🗑️ Clear Demo Data (Show Pure SQL State)
                </button>
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
            Switch permissions to test role-based access control (Admin, Coordinator, Inspector, Viewer)
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="font-medium text-slate-700">Current Role:</div>
          {(['Admin', 'Operations', 'Inspector', 'Viewer'] as const).map((r) => (
            <button
              key={r}
              onClick={() => {
                onUpdateUserRole(r);
                showToast(`Switched active user role to ${r}`, 'info');
              }}
              className={`px-3 py-1.5 rounded font-bold transition cursor-pointer ${
                user?.role === r
                  ? 'bg-[#1a3055] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              {r}
            </button>
          ))}
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
