import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  User,
  ToolItem,
  Callout,
  DrillingJob,
  DTBatch,
  RTBatch,
  InspectionRecord,
  MaintenanceRecord,
  GatePass,
  ContractRecord,
  ViewKey,
} from './types';
import { EmdadLogo } from './constants/branding';
import {
  INITIAL_INVENTORY,
  INITIAL_CALLOUTS,
  INITIAL_JOBS,
  INITIAL_DT_BATCHES,
  INITIAL_RT_BATCHES,
  INITIAL_INSPECTIONS,
  INITIAL_MAINTENANCE,
  INITIAL_GATE_PASSES,
  INITIAL_CONTRACTS,
} from './data/initialData';
import {
  syncWithAzureSql,
  fetchLiveDatabaseData,
  fetchSecondaryModules,
  fetchAllModulesLive,
  DbConnectionStatus,
  saveCalloutApi,
  saveGatePassApi,
  saveContractApi,
  deleteContractApi,
  saveInspectionApi,
  saveMaintenanceApi,
  saveJobApi,
  saveDeliveryTicketApi,
  deleteDeliveryTicketApi,
  saveReceivingTicketApi,
  deleteReceivingTicketApi,
  saveInventoryApi,
  saveContractRatesApi,
  flushOfflineOutbox,
  fetchFromApi,
  normalizeJobKey,
} from './services/api';
import { clearCache, saveDatasetToCache } from './services/dbCache';
import {
  loadCustomTools,
  saveCustomTool,
  mergeInventoryWithCustomTools,
  syncCustomToolsToIndexedDB,
} from './services/customTools';
import {
  loadCustomJobs,
  saveCustomJob,
  saveCustomJobs,
  mergeJobsWithCustomJobs,
  syncCustomJobsToIndexedDB,
} from './services/customJobs';
import {
  loadCustomContracts,
  saveCustomContract,
  deleteCustomContract,
  saveCustomContractRates,
  mergeContractsWithCustom,
  normalizeContractKey,
} from './services/customContracts';
import {
  loadCustomCallouts,
  saveCustomCallout,
  mergeCalloutsWithCustom,
} from './services/customCallouts';
import {
  saveCustomDTBatch,
  deleteCustomDTBatch,
} from './services/customDTBatches';
import { MASTER_JOBS } from './data/masterJobs';
import { Toast, ToastNotification } from './components/Toast';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LoginView } from './components/LoginView';
import { ChangePasswordView } from './components/ChangePasswordView';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InventoryView } from './components/InventoryView';
import { CalloutsView } from './components/CalloutsView';
import { JobsView } from './components/JobsView';
import { DeliveryTicketsView } from './components/DeliveryTicketsView';
import { ReceivingTicketsView } from './components/ReceivingTicketsView';
import { GatePassView } from './components/GatePassView';
import { InspectionView } from './components/InspectionView';
import { MaintenanceView } from './components/MaintenanceView';
import { ContractsView } from './components/ContractsView';
import { ContractsDashboardView } from './components/ContractsDashboardView';
import { SettingsView } from './components/SettingsView';
import { DataManagementView, TableEntityKey } from './components/DataManagementView';
import { InventoryDashboardView } from './components/InventoryDashboardView';
import { MaintenanceDashboardView } from './components/MaintenanceDashboardView';
import { BillingDashboardView } from './components/BillingDashboardView';
import { InvoicePackageView } from './components/InvoicePackageView';
import { InvoicingView } from './components/InvoicingView';
import { JobToolsListView } from './components/JobToolsListView';
import { ToolHistoryView } from './components/ToolHistoryView';
import { CategoriesSizesView } from './components/CategoriesSizesView';

const UtilizationView = React.lazy(() =>
  import('./components/UtilizationView').then((module) => ({ default: module.UtilizationView }))
);

const ToolRevenueReportView = React.lazy(() =>
  import('./components/ToolRevenueReportView').then((module) => ({ default: module.ToolRevenueReportView }))
);

const SubContractorRentalView = React.lazy(() =>
  import('./components/SubContractorRentalView').then((module) => ({ default: module.SubContractorRentalView }))
);

const MonthlyExpensesView = React.lazy(() =>
  import('./components/MonthlyExpensesView').then((module) => ({ default: module.MonthlyExpensesView }))
);

const ConsumablesView = React.lazy(() =>
  import('./components/ConsumablesView').then((module) => ({ default: module.ConsumablesView }))
);

const POManagementView = React.lazy(() =>
  import('./components/POManagementView').then((module) => ({ default: module.POManagementView }))
);

const SubRentalInwardView = React.lazy(() =>
  import('./components/SubRentalInwardView').then((module) => ({ default: module.SubRentalInwardView }))
);


// Safe localStorage write — never lets a quota failure crash the app.
//
// NOTE (2026-09-08): with real Azure SQL data flowing in (2,643 delivery
// tickets, 2,424 receiving tickets, 5,000+ inventory rows, each DT/RT
// batch now carrying nested, Inventory-enriched toolLines), JSON-stringifying
// inventory/jobs/dtBatches/rtBatches routinely exceeds the browser's
// ~5-10MB localStorage quota. localStorage.setItem throws synchronously
// when that happens, and since these calls previously ran uncaught inside
// useEffect, that exception was crashing the entire app to a blank white
// screen on every load once live data got large enough — exactly the
// failure mode architecture-review-2026-09-06.md finding #3 warned about,
// now confirmed happening for ticket data (not just document attachments).
const safeSetLocalStorage = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Skipped saving '${key}' to local cache (likely over the browser storage quota):`, e);
  }
};

// Proactively purge legacy domain localStorage keys so that stale browser data on any device
// cannot override canonical Azure SQL data or cause cross-device desynchronization.
if (typeof window !== 'undefined') {
  try {
    const legacyKeys = [
      'emdad_inventory',
      'emdad_jobs',
      'emdad_dt_batches',
      'emdad_rt_batches',
      'emdad_callouts',
      'emdad_gate_passes',
      'emdad_inspections',
      'emdad_maintenance',
      'emdad_contracts',
    ];
    legacyKeys.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn('[Storage] Failed to purge legacy keys:', err);
  }
}

export const App: React.FC = () => {
  // Auth state - Require explicit login when opening website link
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      // Clean up legacy persistent user from localStorage so existing browsers must log in
      localStorage.removeItem('emdad_current_user');

      const explicitLogout = localStorage.getItem('emdad_logged_out');
      if (explicitLogout === 'true') return null;

      // Use sessionStorage so opening a new tab/link always starts at the Login page,
      // while page refreshes within the same tab preserve the active session.
      const saved = sessionStorage.getItem('emdad_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Valid View Set for hash and persistence matching
  const VALID_VIEWS = useMemo(() => new Set<ViewKey>([
    'dashboard',
    'jobs',
    'dt',
    'rt',
    'job-tools-list',
    'tool-history',
    'callouts',
    'gatepass',
    'utilization',
    'inventory-dash',
    'inventory',
    'categories-sizes',
    'maintenance-dash',
    'inspection',
    'maintenance',
    'billing-dash',
    'invoicing',
    'billing-package',
    'tool-revenue-report',
    'contract-dash',
    'contracts',
    'data-management',
    'settings',
  ]), []);

  // Current Active Module View - Restores from URL Hash or localStorage on browser refresh
  const [activeView, setActiveViewState] = useState<ViewKey>(() => {
    try {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash.replace(/^#\/?/, '').trim() as ViewKey;
        const validList = [
          'dashboard', 'jobs', 'dt', 'rt', 'job-tools-list', 'tool-history', 'callouts',
          'gatepass', 'utilization', 'inventory-dash', 'inventory', 'categories-sizes',
          'maintenance-dash', 'inspection', 'maintenance', 'billing-dash', 'invoicing',
          'billing-package', 'tool-revenue-report', 'subcontractor-rentals', 'monthly-expenses',
          'consumables', 'contract-dash', 'contracts', 'data-management', 'settings',
        ];
        if (hash && validList.includes(hash)) {
          return hash;
        }
        const saved = localStorage.getItem('emdad_active_view') as ViewKey;
        if (saved && validList.includes(saved)) {
          return saved;
        }
      }
    } catch {}
    return 'dashboard';
  });

  const setActiveView = useCallback((view: ViewKey) => {
    setActiveViewState(view);
    try {
      localStorage.setItem('emdad_active_view', view);
      if (typeof window !== 'undefined' && window.location.hash !== `#${view}`) {
        window.history.replaceState(null, '', `#${view}`);
      }
    } catch {}
  }, []);

  // Listen for hash changes (browser back/forward button)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').trim() as ViewKey;
      if (hash && VALID_VIEWS.has(hash)) {
        setActiveViewState(hash);
        localStorage.setItem('emdad_active_view', hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [VALID_VIEWS]);

  // Navigation and Modal Triggers
  const [isNewCalloutOpen, setIsNewCalloutOpen] = useState(false);
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);
  const [isNewDTOpen, setIsNewDTOpen] = useState(false);
  const [selectedCalloutForJob, setSelectedCalloutForJob] = useState<Callout | null>(null);
  const [preSelectedJobIdForDT, setPreSelectedJobIdForDT] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('emdad_selected_job_dt') || null;
    } catch {
      return null;
    }
  });
  const [selectedJobIdForBillingPackage, setSelectedJobIdForBillingPackage] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('emdad_selected_job_billing') || null;
    } catch {
      return null;
    }
  });
  const [preSelectedJobIdForToolsList, setPreSelectedJobIdForToolsList] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('emdad_selected_job_tools') || null;
    } catch {
      return null;
    }
  });
  const [preSelectedSerialForToolHistory, setPreSelectedSerialForToolHistory] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('emdad_selected_serial_history') || null;
    } catch {
      return null;
    }
  });

  // Persist contextual selections
  useEffect(() => {
    try {
      if (selectedJobIdForBillingPackage) {
        sessionStorage.setItem('emdad_selected_job_billing', selectedJobIdForBillingPackage);
      } else {
        sessionStorage.removeItem('emdad_selected_job_billing');
      }
    } catch {}
  }, [selectedJobIdForBillingPackage]);

  useEffect(() => {
    try {
      if (preSelectedJobIdForToolsList) {
        sessionStorage.setItem('emdad_selected_job_tools', preSelectedJobIdForToolsList);
      } else {
        sessionStorage.removeItem('emdad_selected_job_tools');
      }
    } catch {}
  }, [preSelectedJobIdForToolsList]);

  useEffect(() => {
    try {
      if (preSelectedSerialForToolHistory) {
        sessionStorage.setItem('emdad_selected_serial_history', preSelectedSerialForToolHistory);
      } else {
        sessionStorage.removeItem('emdad_selected_serial_history');
      }
    } catch {}
  }, [preSelectedSerialForToolHistory]);

  useEffect(() => {
    try {
      if (preSelectedJobIdForDT) {
        sessionStorage.setItem('emdad_selected_job_dt', preSelectedJobIdForDT);
      } else {
        sessionStorage.removeItem('emdad_selected_job_dt');
      }
    } catch {}
  }, [preSelectedJobIdForDT]);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('saved');
  // Guards: prevent overlapping fetches and enforce minimum gap between syncs
  const isSyncingRef = useRef(false);
  const lastSyncTimeRef = useRef<number>(0);
  // Consecutive silent-poll failure counter — badge only reverts after 2+ consecutive failures
  const pollFailCountRef = useRef(0);

  // Toasts
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success', duration = 3500) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => {
      // De-duplicate: remove older notification with the identical text to prevent duplicate stacking
      const deduped = prev.filter((t) => t.msg !== msg);
      // Keep up to 3 notifications visible at any time
      const trimmed = deduped.slice(-2);
      return [...trimmed, { id, msg, type }];
    });

    // Reliable auto-dismiss timer
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, [removeToast]);

  // Check if Pure SQL / Production mode is active (empty state when no live SQL data exists)
  const isPureSqlMode = typeof window !== 'undefined' && localStorage.getItem('emdad_mode') === 'production';

  // Primary Domain State
  // Directly initialized from canonical definitions and master catalogs
  // (All domain collections are synchronized live from Azure SQL and cached in IndexedDB)
  const [inventory, setInventory] = useState<ToolItem[]>(() => {
    return mergeInventoryWithCustomTools(isPureSqlMode ? [] : INITIAL_INVENTORY, loadCustomTools());
  });

  const [callouts, setCallouts] = useState<Callout[]>(() => {
    return isPureSqlMode ? [] : INITIAL_CALLOUTS;
  });

  const [jobs, setJobs] = useState<DrillingJob[]>(() => {
    return mergeJobsWithCustomJobs(MASTER_JOBS, loadCustomJobs());
  });

  const [dtBatches, setDtBatches] = useState<DTBatch[]>(() => {
    return isPureSqlMode ? [] : INITIAL_DT_BATCHES;
  });

  const [rtBatches, setRtBatches] = useState<RTBatch[]>(() => {
    return isPureSqlMode ? [] : INITIAL_RT_BATCHES;
  });

  const [inspections, setInspections] = useState<InspectionRecord[]>(() => {
    return isPureSqlMode ? [] : INITIAL_INSPECTIONS;
  });

  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>(() => {
    return isPureSqlMode ? [] : INITIAL_MAINTENANCE;
  });

  const [gatePasses, setGatePasses] = useState<GatePass[]>(() => {
    return isPureSqlMode ? [] : INITIAL_GATE_PASSES;
  });

  const [contracts, setContracts] = useState<ContractRecord[]>(() => {
    return mergeContractsWithCustom(INITIAL_CONTRACTS);
  });

  // Master Data: Tool Categories & Sizes
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem('emdad_custom_categories');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
            .map((it: any) => (typeof it === 'string' ? it : (it?.categoryName || it?.name || it?.category || String(it || ''))))
            .filter((x: string) => x && typeof x === 'string');
        }
      }
    } catch {}
    return [
      'BIT SUB', 'CARGO BASKET', 'CROSSOVER SUB', 'CUTLIP GUIDE', 'DRILL PIPE',
      'DRILLING JAR', 'FISHING JAR', 'GAUGE RING', 'GUNDRILL REAMER', 'HOLE OPENER',
      'HYD DRILLING JAR', 'MOTOR', 'OVERSHOT', 'REDRESS KIT', 'ROLLER REAMER',
      'SAFETY VALVE', 'STABILIZER', 'WHIPSTOCK', 'DOWNHOLE TOOLS', 'CONSUMABLES / SPARES',
    ];
  });

  const [customSizes, setCustomSizes] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem('emdad_custom_sizes');
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
            .map((it: any) => (typeof it === 'string' ? it : (it?.sizeString || it?.size || it?.name || String(it || ''))))
            .filter((x: string) => x && typeof x === 'string');
        }
      }
    } catch {}
    return [
      '3-1/2"', '4-3/4"', '5-3/4"', '5-7/8"', '6"', '6-1/2"', '6-3/4"',
      '8"', '8-1/8"', '8-1/2"', '8-3/8"', '8-5/16"', '9-1/2"', '11-3/4"',
      '12-1/4"', '14-3/4"', '17-1/2"', '26"',
    ];
  });

  // Master Unified Categories across all screens (Inventory, Tool Categories & Sizes, Job File, PO, etc.)
  const allMasterCategories = useMemo(() => {
    const set = new Set<string>();
    (Array.isArray(customCategories) ? customCategories : []).forEach((c) => {
      const s = typeof c === 'string' ? c.trim().toUpperCase() : (c ? String((c as any).categoryName || (c as any).name || c).trim().toUpperCase() : '');
      if (s) set.add(s);
    });
    (Array.isArray(inventory) ? inventory : []).forEach((t) => {
      if (!t) return;
      const c1 = typeof t.shortDesc === 'string' ? t.shortDesc.trim().toUpperCase() : (t.shortDesc ? String(t.shortDesc).trim().toUpperCase() : '');
      const rawCat = (t as any).category;
      const c2 = typeof rawCat === 'string' ? rawCat.trim().toUpperCase() : (rawCat ? String(rawCat?.categoryName || rawCat?.name || rawCat).trim().toUpperCase() : '');
      if (c1) set.add(c1);
      if (c2) set.add(c2);
    });
    return Array.from(set).sort();
  }, [inventory, customCategories]);

  // Master Unified Standard Sizes across all screens
  const allMasterSizes = useMemo(() => {
    const set = new Set<string>();
    (Array.isArray(customSizes) ? customSizes : []).forEach((s) => {
      const str = typeof s === 'string' ? s.trim() : (s ? String((s as any).sizeString || (s as any).name || (s as any).size || s).trim() : '');
      if (str) set.add(str);
    });
    (Array.isArray(inventory) ? inventory : []).forEach((t) => {
      if (!t) return;
      const s = typeof t.size === 'string' ? t.size.trim() : (t.size ? String(t.size).trim() : '');
      if (s && s !== '—' && s !== '-') set.add(s);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [inventory, customSizes]);

  const handleUpdateCustomCategories = (cats: string[]) => {
    setCustomCategories(cats);
    try {
      localStorage.setItem('emdad_custom_categories', JSON.stringify(cats));
    } catch {}
  };

  const handleUpdateCustomSizes = (sizesList: string[]) => {
    setCustomSizes(sizesList);
    try {
      localStorage.setItem('emdad_custom_sizes', JSON.stringify(sizesList));
    } catch {}
  };

  // LocalStorage Persistence
  //
  // NONE of the domain collections are written to localStorage anymore
  // (2026-09-08). Inventory/Jobs/DTBatches/RTBatches were already backed by
  // live Azure SQL. Callouts/Inspections/Maintenance/GatePasses/Contracts
  // are now ALSO backed by live Azure SQL (see saveCalloutApi/
  // saveGatePassApi/saveContractApi/saveInspectionApi/saveMaintenanceApi
  // calls in the handlers below, and tooltracker-full-modules-function-
  // updates.js for the server side) — every save handler pushes straight to
  // SQL so the data is visible to every user, on every device, immediately.
  // The only thing still cached locally is currentUser, purely so a
  // refresh doesn't force a re-login — that's a session convenience, not a
  // data store.
  useEffect(() => {
    if (currentUser) {
      try {
        sessionStorage.setItem('emdad_current_user', JSON.stringify(currentUser));
        localStorage.removeItem('emdad_logged_out');
      } catch (e) {}
    } else {
      try {
        sessionStorage.removeItem('emdad_current_user');
        localStorage.removeItem('emdad_current_user');
      } catch (e) {}
    }
  }, [currentUser]);

  // Proactively purge legacy test DTs (DT-26-10001 & DT-26-100001) from local session/cache
  useEffect(() => {
    ['DT-26-10000', 'DT-26-10001', 'DT-26-10002', 'DT-26-100001'].forEach((t) => {
      try {
        localStorage.removeItem(`emdad_dt_notes_${t}`);
        localStorage.removeItem(`emdad_dt_meta_${t}`);
      } catch {}
    });

    setDtBatches((prev) =>
      (Array.isArray(prev) ? prev : []).filter((b) => {
        const num = String(b?.dtNumber || '').trim().toUpperCase();
        const id = String(b?.id || '').trim().toUpperCase();
        return (
          !num.includes('10000') &&
          !id.includes('10000') &&
          !num.includes('10001') &&
          !id.includes('10001') &&
          !num.includes('10002') &&
          !id.includes('10002')
        );
      })
    );

    setCallouts((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) => {
        if (!c) return c;
        const hasDtRef = Array.isArray(c.items) && c.items.some((ci) => {
          const dt = String(ci?.dtNumber || '').trim().toUpperCase();
          return dt.includes('10000') || dt.includes('10001') || dt.includes('10002');
        });
        if (hasDtRef) {
          return {
            ...c,
            status: 'Approved',
            items: c.items.map((ci) => {
              const dt = String(ci?.dtNumber || '').trim().toUpperCase();
              if (dt.includes('10000') || dt.includes('10001') || dt.includes('10002')) {
                return { ...ci, dtNumber: undefined, status: 'Approved' };
              }
              return ci;
            }),
          };
        }
        return c;
      })
    );
  }, []);

  // Azure SQL Connection and Data State
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus>({
    isConnected: false,
    source: 'local-cache',
    lastChecked: '',
    message: 'Local Cache',
    counts: {
      inventory: inventory.length,
      jobs: jobs.length,
      dtBatches: dtBatches.length,
      rtBatches: rtBatches.length,
    },
  });

  const handleFetchLiveSql = useCallback(
    async (isSilent = false) => {
      // Skip if a sync is already in progress (prevents overlapping parallel fetches)
      if (isSyncingRef.current) return;
      // Enforce a 30-second minimum gap between background syncs
      const now = Date.now();
      if (isSilent && now - lastSyncTimeRef.current < 30_000) return;

      isSyncingRef.current = true;
      lastSyncTimeRef.current = now;
      setSyncStatus('syncing');
      const syncTimeout = setTimeout(() => {
        setSyncStatus('saved');
      }, 8000);

      try {
        const res = await fetchAllModulesLive();
        clearTimeout(syncTimeout);
        if (res.data) {
          // fetchAllModulesLive() already merges per-module fallbacks (seed data /
          // supplemental fetches) into res.data even when some OTHER module failed
          // (e.g. contracts/callouts/gatePasses/inspections/maintenance returning
          // HTTP 500 from the backend). A failure in one module must never discard
          // good data that was actually fetched for the others — previously this
          // whole block was gated on `res.success` (an all-modules-must-succeed
          // flag), which silently dropped a successfully-fetched Jobs list whenever
          // any unrelated module errored. Apply the data unconditionally; only the
          // connection badge/toast below reflects whether it was a full or partial sync.
          pollFailCountRef.current = 0;
          setIsInitializing(false);

          const cleanDtBatches = (Array.isArray(res.data.dtBatches) ? res.data.dtBatches : []).filter(
            (b: any) =>
              String(b?.dtNumber || '').trim().toUpperCase() !== 'DT-26-10001' &&
              String(b?.id || '').trim().toUpperCase() !== 'DT-26-10001' &&
              String(b?.dtNumber || '').trim().toUpperCase() !== 'DT-26-100001' &&
              String(b?.id || '').trim().toUpperCase() !== 'DT-26-100001'
          );
          console.log('[DEBUG-JOBS-FIX]', { success: res.success, jobsLen: Array.isArray(res.data.jobs) ? res.data.jobs.length : typeof res.data.jobs, source: res.source, message: res.message });
          setInventory(res.data.inventory);
          setJobs(res.data.jobs);
          setDtBatches(cleanDtBatches);
          setRtBatches(res.data.rtBatches);
          setContracts(res.data.contracts);
          setCallouts(mergeCalloutsWithCustom(res.data.callouts));
          setGatePasses(res.data.gatePasses);
          setInspections(res.data.inspections);
          setMaintenance(res.data.maintenance);

          setDbStatus({
            isConnected: res.success,
            source: (res.source as string) === 'failed' ? 'local-cache' : res.source,
            lastChecked: new Date().toLocaleTimeString(),
            message: res.message,
            counts: res.counts,
          });
          setSyncStatus('saved');
          if (!isSilent) {
            showToast(res.message, res.success ? 'success' : 'info');
          }
        } else {
          // Failure: for silent background polls, only flip the badge after 2+ consecutive failures
          // to prevent transient network hiccups from reverting a working connection
          setIsInitializing(false);
          if (isSilent) {
            pollFailCountRef.current += 1;
            if (pollFailCountRef.current >= 2) {
              setDbStatus((prev) => ({
                ...prev,
                isConnected: false,
                source: 'local-cache',
                lastChecked: new Date().toLocaleTimeString(),
                message: res.message,
              }));
            }
          } else {
            // Explicit user-triggered sync failed — always show the failure
            pollFailCountRef.current = 0;
            setDbStatus((prev) => ({
              ...prev,
              isConnected: false,
              source: 'local-cache',
              lastChecked: new Date().toLocaleTimeString(),
              message: res.message,
            }));
            showToast(res.message, 'info');
          }
          setSyncStatus('saved');
        }
      } catch (e: any) {
        clearTimeout(syncTimeout);
        setIsInitializing(false);
        setSyncStatus('saved');
        if (isSilent) {
          pollFailCountRef.current += 1;
          // Let the badge stay green through transient errors — only revert after 2+ failures
          if (pollFailCountRef.current >= 2) {
            setDbStatus((prev) => ({ ...prev, isConnected: false, source: 'local-cache', lastChecked: new Date().toLocaleTimeString(), message: 'Connection lost' }));
          }
        } else {
          pollFailCountRef.current = 0;
          showToast('Unable to reach Azure SQL endpoint.', 'error');
        }
      } finally {
        isSyncingRef.current = false;
      }
    },
    [showToast]
  );

  // Direct Live Startup: Purge any old IndexedDB cache so all views load purely live from Azure SQL
  useEffect(() => {
    clearCache().catch(() => {});
    const custom = loadCustomTools();
    const customJobs = loadCustomJobs();
    const customCallouts = loadCustomCallouts();
    if (custom.length > 0) setInventory((prev) => mergeInventoryWithCustomTools(prev, custom));
    if (customJobs.length > 0) setJobs((prev) => mergeJobsWithCustomJobs(prev, customJobs));
    if (customCallouts.length > 0) setCallouts((prev) => mergeCalloutsWithCustom(prev, customCallouts));
  }, []);

  // Non-blocking initial startup: Do NOT block user with a 2-3 minute splash screen
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  // True from app start until the first sync attempt completes — shows "CONNECTING..." badge
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isChangingPasswordOpen, setIsChangingPasswordOpen] = useState(false);
  const initialLoadUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      initialLoadUserRef.current = null;
      return;
    }
    if (initialLoadUserRef.current === currentUser.username) return;
    initialLoadUserRef.current = currentUser.username;

    // ── INSTANT WARM-UP: fire a lightweight ping to the Azure Function RIGHT NOW ──
    // Azure Functions on a Consumption plan go cold after ~5 min. The warm-up ping
    // kicks the function before the real data sync hits it, so the function is already
    // alive when fetchAllModulesLive() fires 100 ms later. No await — fire-and-forget.
    fetchFromApi('ping', {}).catch(() => {});

    // Fetch live data directly from Azure SQL upon user login (~100ms after warm-up ping)
    setTimeout(() => { handleFetchLiveSql(false); }, 100);

    // 1. Periodic background sync every 90 seconds
    const pollInterval = setInterval(() => {
      handleFetchLiveSql(true);
    }, 90000);

    // 2. Keep-Warm Pinger: fires every 90 s (well within the 5-min Azure idle window)
    const keepWarmInterval = setInterval(() => {
      fetchFromApi('ping', {}).catch(() => {});
    }, 90 * 1000);

    // 3. On window focus: sync only if last sync was > 30 seconds ago
    const handleWindowFocus = () => {
      handleFetchLiveSql(true);
    };
    window.addEventListener('focus', handleWindowFocus);

    // 4. On network reconnect ('online' event): refresh live data immediately
    const handleOnline = () => {
      handleFetchLiveSql(true);
    };
    window.addEventListener('online', handleOnline);

    // 5. Cross-tab synchronization via BroadcastChannel (throttled by the 30s guard)
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel('tooltracker_sync');
        bc.onmessage = () => {
          handleFetchLiveSql(true);
        };
      }
    } catch {}

    return () => {
      clearInterval(pollInterval);
      clearInterval(keepWarmInterval);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
      if (bc) bc.close();
    };
  }, [currentUser, handleFetchLiveSql, showToast]);

  // Handler to clear demo data and reflect pure SQL state
  const handleClearDemoData = useCallback((includeInventory = false) => {
    localStorage.setItem('emdad_mode', 'production');
    localStorage.removeItem('emdad_jobs');
    localStorage.removeItem('emdad_dt_batches');
    localStorage.removeItem('emdad_rt_batches');
    localStorage.removeItem('emdad_callouts');
    localStorage.removeItem('emdad_inspections');
    localStorage.removeItem('emdad_maintenance');
    localStorage.removeItem('emdad_gate_passes');
    localStorage.removeItem('emdad_contracts');
    setJobs([]);
    setDtBatches([]);
    setRtBatches([]);
    setCallouts([]);
    setInspections([]);
    setMaintenance([]);
    setGatePasses([]);
    setContracts([]);
    if (includeInventory) {
      localStorage.removeItem('emdad_inventory');
      setInventory([]);
    }
    showToast('Demo records cleared. Clean production SQL state active.', 'success');
  }, [showToast]);

  // Sync with Azure SQL
  const handleManualSync = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const payload = {
        inventory,
        callouts,
        jobs,
        dtBatches,
        rtBatches,
        inspections,
        maintenance,
        gatePasses,
        contracts,
      };
      await syncWithAzureSql(payload);
      setSyncStatus('saved');
      showToast('Synchronized successfully with Azure SQL Database.', 'success');
    } catch (e) {
      setSyncStatus('error');
      showToast('Azure SQL Sync notice: Local state verified.', 'info');
    }
  }, [
    inventory,
    callouts,
    jobs,
    dtBatches,
    rtBatches,
    inspections,
    maintenance,
    gatePasses,
    contracts,
    showToast,
  ]);

  // Periodic background check / save indicator
  useEffect(() => {
    const timer = setTimeout(() => {
      setSyncStatus('saved');
    }, 800);
    return () => clearTimeout(timer);
  }, [
    inventory,
    callouts,
    jobs,
    dtBatches,
    rtBatches,
    inspections,
    maintenance,
    gatePasses,
    contracts,
  ]);

  // Inventory Actions & Persistence
  const handleAddTool = (newTool: ToolItem) => {
    saveCustomTool(newTool);
    setInventory((prev) => {
      const updated = [newTool, ...prev.filter((t) => (t.id || t.serial) !== (newTool.id || newTool.serial))];
      syncCustomToolsToIndexedDB(updated);
      return updated;
    });
    saveInventoryApi({ ...newTool, _isExisting: false }).then((r) => {
      if (r.success) {
        showToast(`Asset ${newTool.assetNo || newTool.id || newTool.serial} registered and saved to Azure SQL.`, 'success');
      } else {
        showToast(r.message, 'error');
      }
    });
  };

  const handleUpdateTool = (id: string, updates: Partial<ToolItem>) => {
    setInventory((prev) => {
      const targetId = String(id).trim().toUpperCase();
      const updated = prev.map((t) => {
        const k = String(t.id || t.serial).trim().toUpperCase();
        if (k === targetId) {
          const merged = { ...t, ...updates };
          saveCustomTool(merged);
          saveInventoryApi({ ...merged, _isExisting: true }).then((r) => {
            if (r.success) {
              showToast(`Asset ${id} updated in Azure SQL.`, 'success');
            } else {
              showToast(r.message, 'error');
            }
          });
          return merged;
        }
        return t;
      });
      syncCustomToolsToIndexedDB(updated);
      return updated;
    });
  };

  const handleSaveInventory = (updated: ToolItem[]) => {
    const custom = loadCustomTools();
    const merged = mergeInventoryWithCustomTools(updated, custom);
    setInventory(merged);

    const currentMap = new Map(inventory.map((t) => [t.id || t.serial, t]));
    const changedTools = updated.filter((item) => {
      const prev = currentMap.get(item.id || item.serial);
      if (!prev) return true;
      return (
        prev.status !== item.status ||
        prev.location !== item.location ||
        prev.currentJobId !== item.currentJobId ||
        prev.assetNo !== item.assetNo ||
        prev.shortDesc !== item.shortDesc ||
        prev.size !== item.size ||
        prev.desc !== item.desc ||
        prev.ownership !== item.ownership ||
        prev.supplier !== item.supplier
      );
    });
    if (changedTools.length > 0) {
      changedTools.forEach((tool) => {
        saveCustomTool(tool);
        saveInventoryApi({ ...tool, _isExisting: true }).then((r) => {
          if (!r.success) showToast(r.message, 'error');
        });
      });
    }
    syncCustomToolsToIndexedDB(merged);
    showToast('Inventory catalog updated.', 'success');
  };

  const broadcastSync = () => {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('tooltracker_sync');
        bc.postMessage({ timestamp: Date.now() });
        bc.close();
      }
    } catch {}
  };

  const handleSaveCallout = async (saved: Callout) => {
    saveCustomCallout(saved);
    setCallouts((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev];
    });
    // Fire-and-forget: callout status updates (e.g. "Delivery Ticket - Created") are
    // supplementary metadata. A save failure MUST NOT affect or revert the DT operation
    // that triggered this callout update. Show a non-blocking warning only — never
    // block the caller or revert local state on a callout save failure.
    saveCalloutApi(saved).then((calloutSaveResult) => {
      if (!calloutSaveResult.success) {
        // Warn in console only — the callout is already saved to localStorage and
        // local state; it will sync on the next full refresh.
        console.warn('[Callout] Background save to Azure SQL failed:', calloutSaveResult.message);
        // Only show a toast if the failure is NOT a 500-series server error — those
        // are transient backend issues that self-resolve; spamming the user is unhelpful.
        if (!calloutSaveResult.message.includes('HTTP 5') && !calloutSaveResult.message.includes('500')) {
          showToast(`Callout status update delayed — will sync automatically. (${calloutSaveResult.message})`, 'info');
        }
        return;
      }
      broadcastSync();
    }).catch(() => {
      // Network error — non-fatal; callout is in localStorage and will sync later.
    });
  };

  const handleCreateJobFromCallout = (callout: Callout) => {
    setSelectedCalloutForJob(callout);
    setIsNewJobOpen(true);
    setActiveView('jobs');
  };

  const handleLinkCalloutToJob = (callout: Callout, selectedJob: DrillingJob) => {
    const updatedJob: DrillingJob = {
      ...selectedJob,
      calloutId: callout.id,
    };
    const updatedCallout: Callout = {
      ...callout,
      jobId: selectedJob.id,
      status: 'In Progress',
    };
    handleSaveJob(updatedJob);
    handleSaveCallout(updatedCallout);
    showToast(`Callout ${callout.id} successfully linked to ongoing Job ${selectedJob.id}.`, 'success');
  };

  // Jobs Actions
  const handleSaveJob = async (job: DrillingJob) => {
    saveCustomJob(job);
    setJobs((prev) => {
      const targetId = (job.id || '').trim().toUpperCase();
      const idx = prev.findIndex((j) => (j.id || '').trim().toUpperCase() === targetId);
      let updated: DrillingJob[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = job;
      } else {
        updated = [job, ...prev];
      }
      syncCustomJobsToIndexedDB(updated);
      return updated;
    });
    // Awaited (not fire-and-forget): a caller like JobDossierView's "Save Job
    // File" button can now await this and only clear its saving spinner /
    // show success once Azure SQL has genuinely confirmed the write, instead
    // of the moment the optimistic local state update happens.
    const jobSaveResult = await saveJobApi(job);
    if (!jobSaveResult.success) {
      showToast(jobSaveResult.message, 'error');
      return;
    }

    // If job is linked to a callout, update callout status
    if (job.calloutId) {
      setCallouts((prev) =>
        prev.map((c) =>
          c.id === job.calloutId
            ? { ...c, status: 'In Progress', jobId: job.id }
            : c
        )
      );
    }
    broadcastSync();
    showToast(`Drilling Job ${job.id} saved successfully.`, 'success');
  };

  const handleDispatchJob = (jobId: string) => {
    setPreSelectedJobIdForDT(jobId);
    setIsNewDTOpen(true);
    setActiveView('dt');
  };

  // DT Batch Actions
  const handleSaveDTBatch = async (batch: DTBatch) => {
    const isActuallyLocked = Boolean(
      batch.isLocked === true ||
      batch.isLocked === 1 ||
      String(batch.isLocked) === 'true' ||
      String(batch.isLocked) === '1'
    );
    const finalizedBatch: DTBatch = {
      ...batch,
      isLocked: isActuallyLocked,
      lockedBy: isActuallyLocked ? (batch.lockedBy || currentUser?.name || 'Operations') : undefined,
      lockedDate: isActuallyLocked ? (batch.lockedDate || new Date().toISOString()) : undefined,
    };
    setDtBatches((prev) => {
      const filtered = prev.filter((b) => b.id !== finalizedBatch.id && b.dtNumber !== finalizedBatch.dtNumber);
      return [finalizedBatch, ...filtered];
    });
    // Persist to localStorage immediately so that if Azure SQL sync runs before
    // saveDeliveryTicketApi completes (race condition), this DT is NOT wiped from the UI.
    saveCustomDTBatch(finalizedBatch);
    // Show success immediately after optimistic local update (no waiting for Azure SQL).
    // Azure cold starts can take 10-30s — the background save confirms or shows an error toast.
    broadcastSync();
    showToast(`Delivery Ticket ${batch.dtNumber} saved.`, 'success');
    saveDeliveryTicketApi(finalizedBatch).then((dtSaveResult) => {
      if (!dtSaveResult.success) showToast(dtSaveResult.message, 'error');
    });

    // Update tool statuses in inventory: only set to 'On Rig' if the DT is genuinely dispatched & locked!
    if (isActuallyLocked) {
      const dispatchedSerials = new Set<string>();
      (batch.toolLines || []).forEach((t) => {
        const s = (t.serial || '').trim().toUpperCase();
        const a = (t.assetNo || '').trim().toUpperCase();
        if (s) {
          dispatchedSerials.add(s);
          dispatchedSerials.add(s.replace(/^EMD-?/i, ''));
        }
        if (a) {
          dispatchedSerials.add(a);
          dispatchedSerials.add(a.replace(/^EMD-?/i, ''));
        }
      });

      const rigName = (batch.rig || '').trim();
      const rigLoc = rigName ? (rigName.toLowerCase().startsWith('rig') ? rigName : `Rig ${rigName}`) : 'On Rig';

      const updatedDispatchedTools: ToolItem[] = [];
      setInventory((prev) =>
        prev.map((tool) => {
          const s = (tool.serial || '').trim().toUpperCase();
          const a = (tool.assetNo || '').trim().toUpperCase();
          const sStrip = s.replace(/^EMD-?/i, '');
          const aStrip = a.replace(/^EMD-?/i, '');

          const isDispatched = dispatchedSerials.has(s) ||
            dispatchedSerials.has(a) ||
            dispatchedSerials.has(sStrip) ||
            dispatchedSerials.has(aStrip);

          if (isDispatched) {
            const updated: ToolItem = {
              ...tool,
              status: 'On Rig',
              location: rigLoc,
              rig: rigName,
              currentRig: rigName,
              currentJobId: batch.jobId,
            };
            updatedDispatchedTools.push(updated);
            return updated;
          }
          return tool;
        })
      );
      // Cascade to Azure SQL so all users see tool is on rig
      updatedDispatchedTools.forEach((tool) => {
        saveInventoryApi(tool);
      });
    }

    // If job has linked callout, check if all items are dispatched and mark Closed/Mobilized
    const job = jobs.find((j) => j.id === batch.jobId);
    if (job && job.calloutId) {
      setCallouts((prev) =>
        prev.map((c) =>
          c.id === job.calloutId
            ? { ...c, status: 'Closed' }
            : c
        )
      );
    }

  };

  const handleUpdateDTBatch = async (
    updatedBatch: DTBatch,
    addedTools?: ToolItem[],
    removedTools?: ToolItem[]
  ) => {
    setDtBatches((prev) => {
      return prev.map((b) => (b.id === updatedBatch.id ? updatedBatch : b));
    });
    // Keep localStorage in sync so Azure SQL re-sync doesn't wipe pending edits.
    saveCustomDTBatch(updatedBatch);

    const isLocked = Boolean(
      updatedBatch.isLocked === true ||
      updatedBatch.isLocked === 1 ||
      String(updatedBatch.isLocked) === 'true' ||
      String(updatedBatch.isLocked) === '1'
    );

    // If DT was unlocked, revert tools on this DT to 'Good' / 'Emdad Base'
    if (!isLocked) {
      const lineKeys = new Set<string>();
      (updatedBatch.toolLines || []).forEach((t) => {
        const s = (t.serial || '').trim().toUpperCase();
        const a = (t.assetNo || '').trim().toUpperCase();
        if (s) {
          lineKeys.add(s);
          lineKeys.add(s.replace(/^EMD-?/i, ''));
        }
        if (a) {
          lineKeys.add(a);
          lineKeys.add(a.replace(/^EMD-?/i, ''));
        }
      });

      const updatedTools: ToolItem[] = [];
      setInventory((prev) =>
        prev.map((tool) => {
          const s = (tool.serial || '').trim().toUpperCase();
          const a = (tool.assetNo || '').trim().toUpperCase();
          const sStrip = s.replace(/^EMD-?/i, '');
          const aStrip = a.replace(/^EMD-?/i, '');

          if (lineKeys.has(s) || lineKeys.has(a) || lineKeys.has(sStrip) || lineKeys.has(aStrip)) {
            const updated: ToolItem = {
              ...tool,
              status: 'Good',
              location: 'Emdad Base',
              rig: undefined,
              currentRig: undefined,
              currentJobId: null,
            };
            updatedTools.push(updated);
            return updated;
          }
          return tool;
        })
      );
      updatedTools.forEach((tool) => {
        saveInventoryApi(tool);
      });
    } else {
      // If DT is locked, ensure tools are marked 'On Rig'
      const lineKeys = new Set<string>();
      (updatedBatch.toolLines || []).forEach((t) => {
        const s = (t.serial || '').trim().toUpperCase();
        const a = (t.assetNo || '').trim().toUpperCase();
        if (s) {
          lineKeys.add(s);
          lineKeys.add(s.replace(/^EMD-?/i, ''));
        }
        if (a) {
          lineKeys.add(a);
          lineKeys.add(a.replace(/^EMD-?/i, ''));
        }
      });
      const rigName = (updatedBatch.rig || '').trim();
      const rigLoc = rigName ? (rigName.toLowerCase().startsWith('rig') ? rigName : `Rig ${rigName}`) : 'On Rig';

      const updatedTools: ToolItem[] = [];
      setInventory((prev) =>
        prev.map((tool) => {
          const s = (tool.serial || '').trim().toUpperCase();
          const a = (tool.assetNo || '').trim().toUpperCase();
          const sStrip = s.replace(/^EMD-?/i, '');
          const aStrip = a.replace(/^EMD-?/i, '');

          if (lineKeys.has(s) || lineKeys.has(a) || lineKeys.has(sStrip) || lineKeys.has(aStrip)) {
            const updated: ToolItem = {
              ...tool,
              status: 'On Rig',
              location: rigLoc,
              rig: rigName,
              currentRig: rigName,
              currentJobId: updatedBatch.jobId,
            };
            updatedTools.push(updated);
            return updated;
          }
          return tool;
        })
      );
      updatedTools.forEach((tool) => {
        saveInventoryApi(tool);
      });
    }

    if (addedTools && addedTools.length > 0) {
      const addedKeys = new Set<string>();
      addedTools.forEach((t) => {
        const s = (t.serial || '').trim().toUpperCase();
        const a = (t.assetNo || '').trim().toUpperCase();
        if (s) { addedKeys.add(s); addedKeys.add(s.replace(/^EMD-?/i, '')); }
        if (a) { addedKeys.add(a); addedKeys.add(a.replace(/^EMD-?/i, '')); }
      });
      const rigName = (updatedBatch.rig || '').trim();
      const rigLoc = rigName ? (rigName.toLowerCase().startsWith('rig') ? rigName : `Rig ${rigName}`) : 'On Rig';

      setInventory((prev) =>
        prev.map((t) => {
          const s = (t.serial || '').trim().toUpperCase();
          const a = (t.assetNo || '').trim().toUpperCase();
          if (addedKeys.has(s) || addedKeys.has(a) || addedKeys.has(s.replace(/^EMD-?/i, '')) || addedKeys.has(a.replace(/^EMD-?/i, ''))) {
            const updated: ToolItem = isLocked
              ? { ...t, status: 'On Rig', location: rigLoc, rig: rigName, currentRig: rigName, currentJobId: updatedBatch.jobId }
              : { ...t, status: 'Good', location: 'Emdad Base', currentJobId: null };
            saveInventoryApi(updated);
            return updated;
          }
          return t;
        })
      );
    }

    if (removedTools && removedTools.length > 0) {
      const removedKeys = new Set<string>();
      removedTools.forEach((t) => {
        const s = (t.serial || '').trim().toUpperCase();
        const a = (t.assetNo || '').trim().toUpperCase();
        if (s) { removedKeys.add(s); removedKeys.add(s.replace(/^EMD-?/i, '')); }
        if (a) { removedKeys.add(a); removedKeys.add(a.replace(/^EMD-?/i, '')); }
      });
      setInventory((prev) =>
        prev.map((t) => {
          const s = (t.serial || '').trim().toUpperCase();
          const a = (t.assetNo || '').trim().toUpperCase();
          if (removedKeys.has(s) || removedKeys.has(a) || removedKeys.has(s.replace(/^EMD-?/i, '')) || removedKeys.has(a.replace(/^EMD-?/i, ''))) {
            const updated: ToolItem = { ...t, status: 'Good', location: 'Emdad Base', currentJobId: null, currentRig: null };
            saveInventoryApi(updated);
            return updated;
          }
          return t;
        })
      );
    }

    // Optimistic feedback: show success immediately, save to Azure SQL in background.
    // Prevents 10-30s Azure cold-start delays from freezing the "Save Changes" spinner.
    broadcastSync();
    showToast(`Delivery Ticket ${updatedBatch.dtNumber} updated successfully.`, 'success');
    saveDeliveryTicketApi(updatedBatch).then((dtSaveResult) => {
      if (!dtSaveResult.success) showToast(dtSaveResult.message, 'error');
    });
  };

  const handleDeleteDTBatch = (dtNumber: string) => {
    const targetUpper = (dtNumber || '').trim().toUpperCase();
    const dt = dtBatches.find(
      (b) =>
        (b.dtNumber || '').trim().toUpperCase() === targetUpper ||
        (b.id || '').trim().toUpperCase() === targetUpper
    );

    setDtBatches((prev) =>
      prev.filter(
        (b) =>
          (b.dtNumber || '').trim().toUpperCase() !== targetUpper &&
          (b.id || '').trim().toUpperCase() !== targetUpper
      )
    );
    // Remove from local cache so it doesn't resurface after next sync.
    deleteCustomDTBatch(dtNumber);
    deleteDeliveryTicketApi(dtNumber).catch(() => {});

    // Revert tool statuses in inventory to 'Good' / 'Emdad Base'
    const lineSerials = new Set<string>();
    if (dt && dt.toolLines) {
      (dt.toolLines || []).forEach((t) => {
        const s = (t.serial || '').trim().toUpperCase();
        const a = (t.assetNo || '').trim().toUpperCase();
        if (s) {
          lineSerials.add(s);
          lineSerials.add(s.replace(/^EMD-?/i, ''));
        }
        if (a) {
          lineSerials.add(a);
          lineSerials.add(a.replace(/^EMD-?/i, ''));
        }
      });
    }

    if (lineSerials.size > 0) {
      setInventory((prev) =>
        prev.map((tool) => {
          const s = (tool.serial || '').trim().toUpperCase();
          const a = (tool.assetNo || '').trim().toUpperCase();
          const sStrip = s.replace(/^EMD-?/i, '');
          const aStrip = a.replace(/^EMD-?/i, '');
          if (lineSerials.has(s) || lineSerials.has(a) || lineSerials.has(sStrip) || lineSerials.has(aStrip)) {
            const updated: ToolItem = {
              ...tool,
              status: 'Good',
              location: 'Emdad Base',
              currentJobId: null,
              currentRig: null,
              rig: undefined,
            };
            saveInventoryApi(updated).catch(() => {});
            return updated;
          }
          return tool;
        })
      );
    }

    // Clear dtNumber in linked callouts/checklists
    setCallouts((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) => {
        if (!c) return c;
        const jId = String(c?.jobId || (c as any)?.jobNumber || '').trim().toUpperCase();
        const dtJob = String(dt?.jobId || '').trim().toUpperCase();
        const isJobMatch = dtJob ? (jId === dtJob || (jId ? normalizeJobKey(jId) === normalizeJobKey(dtJob) : false)) : false;
        const hasDt = Array.isArray(c?.items) && c.items.some(
          (ci) => String(ci?.dtNumber || '').trim().toUpperCase() === targetUpper
        );

        if (isJobMatch || hasDt) {
          return {
            ...c,
            status: 'Active',
            items: (Array.isArray(c?.items) ? c.items : []).map((ci) => {
              if (!ci) return ci;
              // Only clear dtNumber on items specifically assigned to the deleted DT.
              // Do NOT use isJobMatch here — that would wipe assignments to OTHER DTs on the same job.
              if (String(ci?.dtNumber || '').trim().toUpperCase() === targetUpper) {
                return { ...ci, dtNumber: undefined, status: 'Assigned' as const };
              }
              return ci;
            }),
          };
        }
        return c;
      })
    );

    // Clear localStorage cached notes / meta for this DT
    try {
      localStorage.removeItem(`emdad_dt_notes_${dtNumber}`);
      localStorage.removeItem(`emdad_dt_notes_${targetUpper}`);
      localStorage.removeItem(`emdad_dt_meta_${dtNumber}`);
      localStorage.removeItem(`emdad_dt_meta_${targetUpper}`);
    } catch {}

    broadcastSync();
    showToast(`Delivery Ticket ${dtNumber} deleted and tools returned to yard inventory.`, 'success');
  };

  // RT Batch Actions (Backload receiving)
  const handleSaveRTBatch = async (batch: RTBatch) => {
    // Dedup: if same RT already exists (by id or rtNumber), update in place instead of prepending a duplicate.
    setRtBatches((prev) => {
      const exists = prev.some(
        (b) =>
          (b.id && batch.id && b.id === batch.id) ||
          (b.rtNumber && batch.rtNumber && b.rtNumber === batch.rtNumber)
      );
      return exists
        ? prev.map((b) => (b.id === batch.id || b.rtNumber === batch.rtNumber ? batch : b))
        : [batch, ...prev];
    });
    // Awaited so a caller showing a saving spinner only clears it once Azure SQL
    // actually confirms the write.
    const rtSaveResult = await saveReceivingTicketApi(batch);
    if (!rtSaveResult.success) showToast(rtSaveResult.message, 'error');

    // Update DT line statuses from OnRig to Returned
    // Normalize to uppercase strings; filter out blank/undefined serials so they don't cross-match.
    const returnedSerials = new Set<string>(
      batch.toolLines
        .map((t) => (t.serial || '').trim().toUpperCase())
        .filter(Boolean)
    );
    const affectedDtBatches: DTBatch[] = [];
    setDtBatches((prev) =>
      prev.map((dt) => {
        const hasReturnedLine = dt.toolLines.some((line) =>
          returnedSerials.has((line.serial || '').trim().toUpperCase())
        );
        const updatedLines = dt.toolLines.map((line) => {
          if (returnedSerials.has((line.serial || '').trim().toUpperCase())) {
            const rtLine = batch.toolLines.find(
              (l) => (l.serial || '').trim().toUpperCase() === (line.serial || '').trim().toUpperCase()
            );
            return {
              ...line,
              status: 'Returned' as const,
              used: rtLine ? rtLine.used : false,
            };
          }
          return line;
        });
        const updatedDt = { ...dt, toolLines: updatedLines };
        if (hasReturnedLine) affectedDtBatches.push(updatedDt);
        return updatedDt;
      })
    );
    // Persist the DT tickets whose lines just flipped to Returned — otherwise
    // this status change would only live in local state until the next
    // manual Sync.
    affectedDtBatches.forEach((dt) => {
      saveDeliveryTicketApi(dt).then((r) => {
        if (!r.success) showToast(r.message, 'error');
      });
    });

    // Update tool statuses & create inspection records for USED tools
    const curYr = new Date().getFullYear().toString().slice(-2);
    let nextInsSeq =
      inspections
        .map((i) => {
          const m = i.woNumber.match(/^WO-INS-\d+-(\d+)$/);
          return m ? parseInt(m[1], 10) : 0;
        })
        .reduce((max, val) => Math.max(max, val), 0) + 1;

    const usedLines = batch.toolLines.filter(
      (l) => l.used && l.condition !== 'LIH' && l.routedTo !== 'Lost in Hole'
    );
    const newInspections: InspectionRecord[] = usedLines.map((line) => {
      const lineSerial = (line.serial || '').trim().toUpperCase();
      const invItem = inventory.find((t) => (t.serial || '').trim().toUpperCase() === lineSerial);
      const woNum = `WO-INS-${curYr}-${String(nextInsSeq++).padStart(5, '0')}`;
      return {
        id: `INS-${Date.now()}-${Math.random().toString(36).slice(-4)}`,
        woNumber: woNum,
        serial: line.serial,
        assetNo: line.assetNo || invItem?.assetNo || line.serial,
        shortDesc: line.shortDesc || invItem?.shortDesc || 'Drilling Tool',
        size: line.size || invItem?.size || '',
        fromRtId: batch.id,
        rtNumber: batch.rtNumber,
        receivedDate: batch.rtDate,
        inspector: currentUser?.name || '',
        inspectionDate: null,
        status: 'Pending',
        disposition: null,
        reportNumber: '',
        notes: line.condition || 'Received used from rig. Pending QC visual, dimensional & MPI check.',
      };
    });

    if (newInspections.length > 0) {
      setInspections((prev) => [...newInspections, ...prev]);
      newInspections.forEach((ins) => {
        saveInspectionApi(ins).then((r) => {
          if (!r.success) showToast(r.message, 'error');
        });
      });
    }

    const updatedRtTools: ToolItem[] = [];
    setInventory((prev) =>
      prev.map((tool) => {
        // Case-insensitive serial lookup so "EMD-1234" and "emd-1234" both match.
        const toolSerial = (tool.serial || '').trim().toUpperCase();
        const line = batch.toolLines.find(
          (l) => (l.serial || '').trim().toUpperCase() === toolSerial
        );
        if (!line) return tool;

        const isLih = line.condition === 'LIH' || line.routedTo === 'Lost in Hole';
        const isUsed = (line.condition === 'USED' || line.used) && !isLih;

        const updated: ToolItem = isLih
          ? {
              ...tool,
              status: 'Lost in Hole',
              location: 'Lost in Hole',
              currentJobId: null,
            }
          : isUsed
          ? {
              ...tool,
              status: 'Inspection',
              location: 'Inspection Bay',
              currentJobId: null,
            }
          : {
              ...tool,
              status: 'Good',
              location: 'Emdad Base',
              currentJobId: null,
            };
        updatedRtTools.push(updated);
        return updated;
      })
    );
    // Cascade tool status changes to Azure SQL
    updatedRtTools.forEach((tool) => {
      saveInventoryApi(tool);
    });

    const lihCount = batch.toolLines.filter(
      (l) => l.condition === 'LIH' || l.routedTo === 'Lost in Hole'
    ).length;
    showToast(
      `Receiving Ticket ${batch.rtNumber} processed. ${newInspections.length} used tool(s) sent to QC, ${lihCount} tool(s) recorded as Lost in Hole (quarantined).`,
      'success'
    );
  };

  const handleUpdateRTBatch = async (updatedBatch: RTBatch) => {
    setRtBatches((prev) => prev.map((b) => (b.id === updatedBatch.id ? updatedBatch : b)));
    // Awaited so a caller showing a saving spinner only clears it once Azure SQL
    // actually confirms the write.
    const rtUpdateResult = await saveReceivingTicketApi(updatedBatch);
    if (!rtUpdateResult.success) showToast(rtUpdateResult.message, 'error');

    // Cascade RT tool condition changes to Inventory
    // Build map with normalized uppercase keys so case variants ("EMD-1234" vs "emd-1234") resolve correctly.
    const lineMap = new Map(
      (updatedBatch.toolLines || []).map((l) => [(l.serial || '').trim().toUpperCase(), l])
    );
    const updatedTools: ToolItem[] = [];
    setInventory((prev) =>
      prev.map((tool) => {
        const line = lineMap.get((tool.serial || '').trim().toUpperCase());
        if (!line) return tool;

        const isLih = line.condition === 'LIH' || line.routedTo === 'Lost in Hole';
        const isUsed = (line.condition === 'USED' || line.used) && !isLih;

        const updated: ToolItem = isLih
          ? { ...tool, status: 'Lost in Hole', location: 'Lost in Hole', currentJobId: null }
          : isUsed
          ? { ...tool, status: 'Inspection', location: 'Inspection Bay', currentJobId: null }
          : { ...tool, status: 'Good', location: 'Emdad Base', currentJobId: null };
        updatedTools.push(updated);
        return updated;
      })
    );
    updatedTools.forEach((tool) => saveInventoryApi(tool));

    showToast(`Receiving Ticket ${updatedBatch.rtNumber} updated successfully.`, 'success');
  };

  // Gate Pass Actions
  const handleSaveGatePass = (gp: GatePass, affectedTools: ToolItem[]) => {
    setGatePasses((prev) => [gp, ...prev]);
    saveGatePassApi(gp).then((r) => {
      if (!r.success) showToast(r.message, 'error');
    });
    const affectedIds = new Set(affectedTools.map((t) => t.id));
    const isRepairDispatch = gp.gpType === 'Dispatch for Repair / Maintenance (Returnable)';

    setInventory((prev) =>
      prev.map((t) => {
        if (affectedIds.has(t.id)) {
          const updated: ToolItem = isRepairDispatch
            ? {
                ...t,
                status: 'Maintenance',
                location: `At Vendor (${gp.supplier})`,
              }
            : {
                ...t,
                status: 'Removed',
                location: 'Returned to Supplier',
              };
          saveInventoryApi(updated);
          return updated;
        }
        return t;
      })
    );

    if (isRepairDispatch) {
      showToast(`Security Gate Pass ${gp.gpNumber} issued. Tools dispatched to ${gp.supplier} for repair & maintenance (Returnable).`, 'success');
    } else {
      showToast(`Security Gate Pass ${gp.gpNumber} issued. Third-party tools returned to supplier and removed from inventory.`, 'success');
    }
  };

  // Inspection Actions
  const handleUpdateInspection = (
    insId: string,
    updates: Partial<InspectionRecord>,
    newMaintenanceWO?: MaintenanceRecord
  ) => {
    const ins = inspections.find((i) => i.id === insId);
    if (!ins) return;
    const mergedIns = { ...ins, ...updates };

    setInspections((prev) =>
      prev.map((i) => (i.id === insId ? mergedIns : i))
    );
    saveInspectionApi(mergedIns).then((r) => {
      if (!r.success) showToast(r.message, 'error');
    });

    if (updates.status === 'Pass') {
      setInventory((prev) =>
        prev.map((t) => {
          if (t.serial === ins.serial) {
            const updated: ToolItem = { ...t, status: 'Good', location: 'Emdad Base' };
            saveInventoryApi(updated);
            return updated;
          }
          return t;
        })
      );
      showToast(`Tool ${ins.serial} passed QC and returned to Base ready stock.`, 'success');
    } else if (updates.status === 'Fail') {
      if (newMaintenanceWO) {
        setMaintenance((prev) => [newMaintenanceWO, ...prev]);
        saveMaintenanceApi(newMaintenanceWO).then((r) => {
          if (!r.success) showToast(r.message, 'error');
        });
      }
      setInventory((prev) =>
        prev.map((t) => {
          if (t.serial === ins.serial) {
            const updated: ToolItem = { ...t, status: 'Redress', location: 'Workshop' };
            saveInventoryApi(updated);
            return updated;
          }
          return t;
        })
      );
      showToast(
        `Tool ${ins.serial} failed QC. Maintenance Work Order ${newMaintenanceWO?.woNumber || ''} created.`,
        'info'
      );
    }
  };

  // Maintenance Actions
  const handleSaveMaintenance = (record: MaintenanceRecord) => {
    setMaintenance((prev) => [record, ...prev]);
    saveMaintenanceApi(record).then((r) => {
      if (!r.success) showToast(r.message, 'error');
    });
    setInventory((prev) =>
      prev.map((t) => {
        if (t.serial === record.serial) {
          const updated: ToolItem = {
            ...t,
            status: 'Redress',
            location: record.type === 'Vendor' ? `Vendor Workshop (${record.vendor || '3rd Party'})` : 'Workshop',
          };
          saveInventoryApi(updated);
          return updated;
        }
        return t;
      })
    );
    showToast(`Maintenance Work Order ${record.woNumber} created.`, 'success');
  };

  const handleDispatchToVendor = (
    mId: string,
    vendorName: string,
    vendorPoRef: string,
    vendorQuoteRef: string,
    estCost: number | null,
    dispatchDate: string,
    repairScope: string,
    notes: string
  ) => {
    const mnt = maintenance.find((m) => m.id === mId);
    if (!mnt) return;
    const mergedMnt: MaintenanceRecord = {
      ...mnt,
      type: 'Vendor',
      vendor: vendorName,
      vendorPoRef,
      vendorQuoteRef,
      estCost,
      dispatchToVendorDate: dispatchDate,
      repairScope,
      status: 'Sent to Vendor',
      stage: 'Dispatched to Vendor',
      notes: notes || mnt.notes,
    };

    setMaintenance((prev) => prev.map((m) => (m.id === mId ? mergedMnt : m)));
    saveMaintenanceApi(mergedMnt).then((r) => {
      if (!r.success) showToast(r.message, 'error');
    });

    setInventory((prev) =>
      prev.map((t) => {
        if (t.serial === mnt.serial) {
          const updated: ToolItem = {
            ...t,
            status: 'Repair',
            location: `Vendor Workshop (${vendorName})`,
          };
          saveInventoryApi(updated);
          return updated;
        }
        return t;
      })
    );

    showToast(`Tool ${mnt.serial} dispatched to vendor ${vendorName} under PO ${vendorPoRef || 'N/A'}.`, 'success');
  };

  const handleReceiveFromVendor = (
    mId: string,
    receivedDate: string,
    vendorInvoiceRef: string,
    actualCost: number | null,
    partsReplaced: string,
    notes: string
  ) => {
    const mnt = maintenance.find((m) => m.id === mId);
    if (!mnt) return;
    const mergedMnt: MaintenanceRecord = {
      ...mnt,
      receivedFromVendorDate: receivedDate,
      vendorInvoiceRef,
      cost: actualCost !== null ? actualCost : mnt.cost,
      partsReplaced,
      status: 'Received from Vendor',
      stage: 'Received from Vendor',
      notes: notes || mnt.notes,
    };

    setMaintenance((prev) => prev.map((m) => (m.id === mId ? mergedMnt : m)));
    saveMaintenanceApi(mergedMnt).then((r) => {
      if (!r.success) showToast(r.message, 'error');
    });

    setInventory((prev) =>
      prev.map((t) => {
        if (t.serial === mnt.serial) {
          const updated: ToolItem = {
            ...t,
            status: 'Redress',
            location: 'Workshop QC Bay',
          };
          saveInventoryApi(updated);
          return updated;
        }
        return t;
      })
    );

    showToast(`Tool ${mnt.serial} received back from vendor. Ready for inspection.`, 'success');
  };

  const handleRouteMaintenanceToQC = (
    mId: string,
    notes?: string
  ) => {
    const mnt = maintenance.find((m) => m.id === mId);
    if (!mnt) return;

    const curYr = new Date().getFullYear().toString().slice(-2);
    let nextInsSeq =
      inspections
        .map((i) => {
          const m = i.woNumber.match(/^WO-INS-\d+-(\d+)$/);
          return m ? parseInt(m[1], 10) : 0;
        })
        .reduce((max, val) => Math.max(max, val), 0) + 1;

    const woNum = `WO-INS-${curYr}-${String(nextInsSeq).padStart(5, '0')}`;
    const newIns: InspectionRecord = {
      id: `INS-${Date.now()}-${Math.random().toString(36).slice(-4)}`,
      woNumber: woNum,
      serial: mnt.serial,
      assetNo: mnt.assetNo,
      shortDesc: mnt.shortDesc,
      size: mnt.size,
      fromRtId: null,
      rtNumber: `Post-MNT (${mnt.woNumber})`,
      receivedDate: new Date().toISOString().split('T')[0],
      inspector: currentUser?.name || '',
      inspectionDate: null,
      status: 'Pending',
      disposition: null,
      reportNumber: '',
      notes: notes || `Post-maintenance QC check for WO ${mnt.woNumber}. Vendor: ${mnt.vendor || 'In-House'}.`,
    };

    setInspections((prev) => [newIns, ...prev]);
    saveInspectionApi(newIns).then((r) => {
      if (!r.success) showToast(r.message, 'error');
    });

    const mergedMnt: MaintenanceRecord = {
      ...mnt,
      status: 'Ready for QC',
      stage: 'Ready for QC',
    };
    setMaintenance((prev) => prev.map((m) => (m.id === mId ? mergedMnt : m)));
    saveMaintenanceApi(mergedMnt).then((r) => {
      if (!r.success) showToast(r.message, 'error');
    });

    setInventory((prev) =>
      prev.map((t) => {
        if (t.serial === mnt.serial) {
          const updated: ToolItem = {
            ...t,
            status: 'Inspection',
            location: 'Inspection Bay',
          };
          saveInventoryApi(updated);
          return updated;
        }
        return t;
      })
    );

    showToast(`Tool ${mnt.serial} routed to QC Inspection Bay. Work Order ${woNum} generated.`, 'success');
  };

  const handleCompleteMaintenance = (
    mId: string,
    completedDate: string,
    cost: number | null,
    notes: string,
    destination: 'Base' | 'QC' = 'QC'
  ) => {
    const mnt = maintenance.find((m) => m.id === mId);
    if (!mnt) return;
    const mergedMnt: MaintenanceRecord = {
      ...mnt,
      status: 'Completed',
      completedDate,
      cost: cost !== null ? cost : mnt.cost,
      notes: notes || mnt.notes,
    };

    setMaintenance((prev) => prev.map((m) => (m.id === mId ? mergedMnt : m)));
    saveMaintenanceApi(mergedMnt).then((r) => {
      if (!r.success) showToast(r.message, 'error');
    });

    if (destination === 'QC') {
      const curYr = new Date().getFullYear().toString().slice(-2);
      let nextInsSeq =
        inspections
          .map((i) => {
            const m = i.woNumber.match(/^WO-INS-\d+-(\d+)$/);
            return m ? parseInt(m[1], 10) : 0;
          })
          .reduce((max, val) => Math.max(max, val), 0) + 1;

      const woNum = `WO-INS-${curYr}-${String(nextInsSeq).padStart(5, '0')}`;
      const newIns: InspectionRecord = {
        id: `INS-${Date.now()}-${Math.random().toString(36).slice(-4)}`,
        woNumber: woNum,
        serial: mnt.serial,
        assetNo: mnt.assetNo,
        shortDesc: mnt.shortDesc,
        size: mnt.size,
        fromRtId: null,
        rtNumber: `Post-MNT (${mnt.woNumber})`,
        receivedDate: completedDate,
        inspector: currentUser?.name || '',
        inspectionDate: null,
        status: 'Pending',
        disposition: null,
        reportNumber: '',
        notes: `Post-maintenance QC check for closed WO ${mnt.woNumber}.`,
      };

      setInspections((prev) => [newIns, ...prev]);
      saveInspectionApi(newIns).then((r) => {
        if (!r.success) showToast(r.message, 'error');
      });

      setInventory((prev) =>
        prev.map((t) => {
          if (t.serial === mnt.serial) {
            const updated: ToolItem = { ...t, status: 'Inspection', location: 'Inspection Bay' };
            saveInventoryApi(updated);
            return updated;
          }
          return t;
        })
      );

      showToast(`Maintenance WO ${mnt.woNumber} completed. Routed to Inspection Bay (${woNum}).`, 'success');
    } else {
      setInventory((prev) =>
        prev.map((t) => {
          if (t.serial === mnt.serial) {
            const updated: ToolItem = { ...t, status: 'Good', location: 'Emdad Base' };
            saveInventoryApi(updated);
            return updated;
          }
          return t;
        })
      );

      showToast(`Maintenance WO ${mnt.woNumber} completed. Tool returned to Base as Good ready stock.`, 'success');
    }
  };

  // Contract Actions
  const handleSaveContract = (c: ContractRecord) => {
    saveCustomContract(c);
    const updatedRates = c.rates || [];
    if (c.id) saveCustomContractRates(c.id, updatedRates);
    if (c.contractRef) saveCustomContractRates(c.contractRef, updatedRates);
    if (c.contractNo) saveCustomContractRates(c.contractNo, updatedRates);

    setContracts((prev) => {
      const idx = prev.findIndex(
        (item) => item.id === c.id || (c.contractRef && item.contractRef === c.contractRef) || (c.contractNo && item.contractNo === c.contractNo)
      );
      let next: ContractRecord[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = c;
      } else {
        next = [c, ...prev];
      }
      saveDatasetToCache({
        inventory,
        jobs,
        dtBatches,
        rtBatches,
        contracts: next,
      });
      return next;
    });

    saveContractApi(c).then((r) => {
      if (!r.success) showToast(r.message, 'error');
    });

    const rateKey = c.contractRef || c.contractNo || c.id;
    if (rateKey && updatedRates.length > 0) {
      saveContractRatesApi(rateKey, updatedRates);
    }

    showToast(`Master contract ${c.name || c.contractNo} and rate schedule saved.`, 'success');
  };

  const handleDeleteContract = (contractIdOrRef: string) => {
    deleteCustomContract(contractIdOrRef);
    const target = normalizeContractKey(contractIdOrRef);

    let foundContract: ContractRecord | undefined;
    setContracts((prev) => {
      foundContract = prev.find(
        (c) =>
          normalizeContractKey(c.id) === target ||
          normalizeContractKey(c.contractRef) === target ||
          normalizeContractKey(c.contractNo) === target
      );
      const next = prev.filter(
        (c) =>
          normalizeContractKey(c.id) !== target &&
          normalizeContractKey(c.contractRef) !== target &&
          normalizeContractKey(c.contractNo) !== target
      );
      saveDatasetToCache({
        inventory,
        jobs,
        dtBatches,
        rtBatches,
        contracts: next,
      });
      return next;
    });

    if (foundContract) {
      deleteContractApi(foundContract);
    } else {
      deleteContractApi({ id: contractIdOrRef, contractNo: contractIdOrRef, contractRef: contractIdOrRef });
    }

    showToast(`Contract ${contractIdOrRef} removed successfully.`, 'success');
  };

  // Backup & Reset
  const handleResetData = () => {
    localStorage.clear();
    setInventory(INITIAL_INVENTORY);
    setCallouts(INITIAL_CALLOUTS);
    setJobs(INITIAL_JOBS);
    setDtBatches(INITIAL_DT_BATCHES);
    setRtBatches(INITIAL_RT_BATCHES);
    setInspections(INITIAL_INSPECTIONS);
    setMaintenance(INITIAL_MAINTENANCE);
    setGatePasses(INITIAL_GATE_PASSES);
    setContracts(INITIAL_CONTRACTS);
    showToast('Database reset to initial demonstration state.', 'info');
  };

  const handleExportData = () => {
    const data = {
      inventory,
      callouts,
      jobs,
      dtBatches,
      rtBatches,
      inspections,
      maintenance,
      gatePasses,
      contracts,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emdad_drilling_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('Full JSON backup downloaded.', 'success');
  };

  const handleImportData = (jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.inventory) setInventory(parsed.inventory);
      if (parsed.callouts) setCallouts(parsed.callouts);
      if (parsed.jobs) setJobs(parsed.jobs);
      if (parsed.dtBatches) setDtBatches(parsed.dtBatches);
      if (parsed.rtBatches) setRtBatches(parsed.rtBatches);
      if (parsed.inspections) setInspections(parsed.inspections);
      if (parsed.maintenance) setMaintenance(parsed.maintenance);
      if (parsed.gatePasses) setGatePasses(parsed.gatePasses);
      if (parsed.contracts) setContracts(parsed.contracts);
      showToast('Database restored from JSON backup.', 'success');
    } catch (e) {
      showToast('Failed to parse backup JSON file.', 'error');
    }
  };

  // Completed jobs detection (legal invoice numbers starting with FSH, FR, WHP)
  const completedJobIdSet = useMemo(() => {
    const set = new Set<string>();
    (Array.isArray(jobs) ? jobs : []).forEach((j) => {
      if (!j) return;
      const isLegal = (num?: any) => {
        if (!num) return false;
        const s = String(num).trim().toUpperCase();
        return s.startsWith('FSH') || s.startsWith('FR') || s.startsWith('WHP');
      };
      if (isLegal(j.legalInvoiceNumber) || isLegal(j.invoiceNumber)) {
        if (j.id) set.add(String(j.id).trim().toUpperCase());
        if (j.jobNumber) set.add(String(j.jobNumber).trim().toUpperCase());
      }
    });
    return set;
  }, [jobs]);

  // Active counts for badges
  const pendingCalloutsCount = (Array.isArray(callouts) ? callouts : []).filter((c) => c && c.status === 'Pending').length;

  // Pending signed DTs for active jobs only
  const pendingSignedDTsCount = (Array.isArray(dtBatches) ? dtBatches : []).filter((b) => {
    if (!b) return false;
    const isJobCompleted = b.jobId && completedJobIdSet.has(String(b.jobId).trim().toUpperCase());
    return !isJobCompleted && !b.isSigned && !b.signedDocUrl;
  }).length;

  const onRigToolsCount = (Array.isArray(inventory) ? inventory : []).filter((t) => {
    if (!t) return false;
    if ((t.location !== 'On Rig' && t.status !== 'On Rig') || t.status === 'Removed') return false;
    if (t.currentJobId && completedJobIdSet.has(String(t.currentJobId).trim().toUpperCase())) return false;
    return true;
  }).length;
  const pendingInspectionsCount = inspections.filter((i) => i.status === 'Pending').length;
  const pendingMaintenanceCount = maintenance.filter((m) => m.status === 'In Progress').length;

  // If user not authenticated
  if (!currentUser) {
    return (
      <LoginView
        onLogin={(user) => {
          localStorage.removeItem('emdad_logged_out');
          setCurrentUser(user);
        }}
      />
    );
  }

  // If user must change password (first-time login mandatory setup or voluntary change)
  if (currentUser.mustChangePassword || isChangingPasswordOpen) {
    return (
      <ChangePasswordView
        user={currentUser}
        isVoluntary={!currentUser.mustChangePassword && isChangingPasswordOpen}
        onPasswordChanged={(updatedUser) => {
          setCurrentUser(updatedUser);
          setIsChangingPasswordOpen(false);
          showToast('Password updated successfully.', 'success');
        }}
        onCancel={() => {
          if (currentUser.mustChangePassword) {
            // Mandatory first-time password setup cancelled: log out
            setCurrentUser(null);
          } else {
            // Voluntary change password cancelled: return to platform
            setIsChangingPasswordOpen(false);
          }
        }}
      />
    );
  }

  // Post-login, pre-dashboard: cover the initial Azure SQL fetch with a
  // connecting screen instead of flashing "LOCAL CACHE / DEMO" while data
  // loads. The sync itself still happens the same way in the background
  // (handleFetchLiveSql) — this only changes what's on screen while it runs.
  if (isInitialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1f38] px-4">
        <div className="text-center">
          <div className="bg-white rounded-lg p-3 shadow-lg mx-auto mb-5 inline-flex items-center justify-center border border-slate-200 animate-pulse">
            <EmdadLogo className="h-10 w-auto object-contain" />
          </div>
          <div className="font-extrabold text-2xl text-white tracking-wide">EMDAD LLC</div>
          <div className="text-amber-300 text-xs font-semibold mt-1">Well Intervention - Upstream Services</div>
          <div className="flex items-center justify-center space-x-2 mt-6">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="text-slate-300 text-xs font-medium">Welcome..…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#c8d8e8] text-[#1e293b] font-sans flex flex-col antialiased selection:bg-amber-200">
      {/* Top Header */}
      <Header
        syncStatus={syncStatus}
        dbStatus={dbStatus}
        isInitializing={isInitializing}
        onSync={handleManualSync}
        onRefresh={() => handleFetchLiveSql(false)}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Navigation Sidebar */}
        <Sidebar
          user={currentUser}
          activeView={activeView}
          onNavigate={(view) => {
            if (view === 'tool-history') {
              // Reset tool history filter so opening from sidebar shows all fleet tools instead of stuck on past tool
              setPreSelectedSerialForToolHistory(null);
              try {
                sessionStorage.removeItem('emdad_selected_serial_history');
              } catch {}
            }
            setActiveView(view);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          onLogout={() => {
            try {
              sessionStorage.removeItem('emdad_current_user');
              localStorage.removeItem('emdad_current_user');
              localStorage.setItem('emdad_logged_out', 'true');
            } catch (e) {}
            setCurrentUser(null);
          }}
          onChangePassword={() => setIsChangingPasswordOpen(true)}
          pendingCalloutsCount={pendingCalloutsCount}
          pendingSignedDTsCount={pendingSignedDTsCount}
          onRigToolsCount={onRigToolsCount}
          pendingInspectionsCount={pendingInspectionsCount}
          pendingMaintenanceCount={pendingMaintenanceCount}
        />

        {/* Dynamic View Canvas */}
        <main className="flex-1 p-3 md:p-5 overflow-y-auto w-full">
          <ErrorBoundary key={activeView} onReset={() => {}}>
          {activeView === 'dashboard' && (
            <DashboardView
              user={currentUser}
              inventory={inventory}
              jobs={jobs}
              callouts={callouts}
              dtBatches={dtBatches}
              rtBatches={rtBatches}
              inspections={inspections}
              maintenance={maintenance}
              contracts={contracts}
              dbStatus={dbStatus}
              onRefreshSql={() => handleFetchLiveSql(false)}
              onNavigate={(v) => setActiveView(v)}
              onOpenAddAsset={() => setActiveView('inventory')}
              onOpenAddCallout={() => {
                setActiveView('callouts');
                setIsNewCalloutOpen(true);
              }}
            />
          )}

          {activeView === 'inventory-dash' && (
            <InventoryDashboardView
              user={currentUser}
              inventory={inventory}
              inspections={inspections}
              maintenance={maintenance}
              onNavigate={(mod) => setActiveView(mod)}
              onOpenAddAsset={() => setActiveView('inventory')}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'inventory' && (
            <InventoryView
              user={currentUser}
              inventory={inventory}
              categories={allMasterCategories}
              sizes={allMasterSizes}
              onSaveInventory={handleSaveInventory}
              onAddTool={handleAddTool}
              onUpdateTool={handleUpdateTool}
              showToast={showToast}
              onOpenToolHistory={(serial) => {
                setPreSelectedSerialForToolHistory(serial);
                setActiveView('tool-history');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'categories-sizes' && (
            <CategoriesSizesView
              user={currentUser}
              inventory={inventory}
              categories={allMasterCategories}
              sizes={allMasterSizes}
              onUpdateCategories={handleUpdateCustomCategories}
              onUpdateSizes={handleUpdateCustomSizes}
              showToast={showToast}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}


          {activeView === 'callouts' && (
            <CalloutsView
              user={currentUser}
              callouts={callouts}
              inventory={inventory}
              jobs={jobs}
              contracts={contracts}
              onSaveCallout={handleSaveCallout}
              onCreateJob={handleCreateJobFromCallout}
              onLinkCalloutToJob={handleLinkCalloutToJob}
              onDispatchJob={handleDispatchJob}
              isNewCalloutOpen={isNewCalloutOpen}
              onCloseNewCallout={() => setIsNewCalloutOpen(false)}
              onOpenNewCallout={() => setIsNewCalloutOpen(true)}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'jobs' && (
            <JobsView
              user={currentUser}
              jobs={jobs}
              callouts={callouts}
              dtBatches={dtBatches}
              rtBatches={rtBatches}
              inventory={inventory}
              contracts={contracts}
              inspections={inspections}
              customCategories={allMasterCategories}
              customSizes={allMasterSizes}
              onSaveJob={handleSaveJob}
              onDispatchJob={handleDispatchJob}
              onReceiveJob={(jobId) => {
                setActiveView('rt');
              }}
              onOpenJobToolsList={(jobId) => {
                setPreSelectedJobIdForToolsList(jobId);
                setActiveView('job-tools-list');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNavigateToInvoicing={(jobId) => {
                setSelectedJobIdForBillingPackage(jobId);
                setActiveView('invoicing');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onBatchUpdateJobs={(updatedJobs) => {
                saveCustomJobs(updatedJobs);
                syncCustomJobsToIndexedDB(updatedJobs);
                setJobs(updatedJobs);
                showToast(`Aligned and saved ${updatedJobs.length} jobs in system.`, 'success');
              }}
              onSaveDTBatch={handleSaveDTBatch}
              onUpdateDTBatch={handleUpdateDTBatch}
              onDeleteDTBatch={handleDeleteDTBatch}
              onSaveRTBatch={handleSaveRTBatch}
              onUpdateRTBatch={handleUpdateRTBatch}
              onSaveCallout={handleSaveCallout}
              showToast={showToast}
              isNewJobModalOpen={isNewJobOpen}
              onCloseNewJobModal={() => {
                setIsNewJobOpen(false);
                setSelectedCalloutForJob(null);
              }}
              onOpenNewJobModal={() => setIsNewJobOpen(true)}
              selectedCalloutForNewJob={selectedCalloutForJob}
              onRefresh={() => handleFetchLiveSql(false)}
              isSyncing={syncStatus === 'syncing'}
            />
          )}

          {activeView === 'dt' && (
            <DeliveryTicketsView
              user={currentUser}
              dtBatches={dtBatches}
              jobs={jobs}
              callouts={callouts}
              inventory={inventory}
              contracts={contracts}
              onSaveDTBatch={handleSaveDTBatch}
              onUpdateDTBatch={handleUpdateDTBatch}
              isNewDTOpen={isNewDTOpen}
              onCloseNewDT={() => {
                setIsNewDTOpen(false);
                setPreSelectedJobIdForDT(null);
              }}
              onOpenNewDT={() => setIsNewDTOpen(true)}
              preSelectedJobId={preSelectedJobIdForDT}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'rt' && (
            <ReceivingTicketsView
              user={currentUser}
              rtBatches={rtBatches}
              dtBatches={dtBatches}
              inventory={inventory}
              jobs={jobs}
              callouts={callouts}
              contracts={contracts}
              onSaveRTBatch={handleSaveRTBatch}
              onUpdateRTBatch={handleUpdateRTBatch}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'job-tools-list' && (
            <JobToolsListView
              jobs={jobs}
              dtBatches={dtBatches}
              rtBatches={rtBatches}
              inventory={inventory}
              preSelectedJobId={preSelectedJobIdForToolsList}
              onNavigate={(mod) => {
                setActiveView(mod as ViewKey);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              showToast={showToast}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'tool-history' && (
            <ToolHistoryView
              inventory={inventory}
              jobs={jobs}
              dtBatches={dtBatches}
              rtBatches={rtBatches}
              preSelectedSerial={preSelectedSerialForToolHistory}
              onSelectTool={(serial) => {
                setPreSelectedSerialForToolHistory(serial || null);
                try {
                  if (serial) {
                    sessionStorage.setItem('emdad_selected_serial_history', serial);
                  } else {
                    sessionStorage.removeItem('emdad_selected_serial_history');
                  }
                } catch {}
              }}
              onNavigate={(mod) => {
                setActiveView(mod as ViewKey);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              showToast={showToast}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'gatepass' && (
            <GatePassView
              user={currentUser}
              gatePasses={gatePasses}
              inventory={inventory}
              onSaveGatePass={handleSaveGatePass}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'maintenance-dash' && (
            <MaintenanceDashboardView
              user={currentUser}
              inspections={inspections}
              maintenance={maintenance}
              inventory={inventory}
              onNavigate={(mod) => setActiveView(mod)}
              onUpdateInspection={handleUpdateInspection}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'inspection' && (
            <InspectionView
              user={currentUser}
              inspections={inspections}
              inventory={inventory}
              maintenance={maintenance}
              onUpdateInspection={handleUpdateInspection}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'maintenance' && (
            <MaintenanceView
              user={currentUser}
              maintenance={maintenance}
              inventory={inventory}
              onSaveMaintenance={handleSaveMaintenance}
              onDispatchToVendor={handleDispatchToVendor}
              onReceiveFromVendor={handleReceiveFromVendor}
              onRouteToQC={handleRouteMaintenanceToQC}
              onCompleteMaintenance={handleCompleteMaintenance}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'billing-dash' && (
            <BillingDashboardView
              user={currentUser}
              jobs={jobs}
              dtBatches={dtBatches}
              rtBatches={rtBatches}
              onNavigate={(mod, jobId) => {
                if (jobId) {
                  setSelectedJobIdForBillingPackage(jobId);
                }
                setActiveView(mod);
              }}
              onUpdateJob={handleSaveJob}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'invoicing' && (
            <InvoicingView
              user={currentUser!}
              jobs={jobs}
              dtBatches={dtBatches}
              rtBatches={rtBatches}
              contracts={contracts}
              initialJobId={selectedJobIdForBillingPackage}
              onUpdateJob={handleSaveJob}
              onShowToast={showToast}
              onNavigate={(mod, jobId) => {
                if (jobId) setSelectedJobIdForBillingPackage(jobId);
                setActiveView(mod);
              }}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'billing-package' && (
            <InvoicePackageView
              user={currentUser}
              jobs={jobs}
              dtBatches={dtBatches}
              rtBatches={rtBatches}
              contracts={contracts}
              initialJobId={selectedJobIdForBillingPackage}
              onBackToBilling={() => setActiveView('billing-dash')}
              onUpdateJob={handleSaveJob}
              onUpdateDTBatch={handleUpdateDTBatch}
              onUpdateRTBatch={handleUpdateRTBatch}
              onShowToast={showToast}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'tool-revenue-report' && (
            <React.Suspense
              fallback={
                <div className="bg-white border border-[#b8c9db] rounded p-12 text-center text-slate-500 font-semibold shadow-sm">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Loading Tool Revenue &amp; Category Analytics Ledger...
                </div>
              }
            >
              <ToolRevenueReportView
                user={currentUser}
                showToast={showToast}
                onNavigate={(mod, serial) => {
                  if (serial) setPreSelectedSerialForToolHistory(serial);
                  setActiveView(mod as ViewKey);
                }}
                onRefresh={() => handleFetchLiveSql(false)}
              />
            </React.Suspense>
          )}

          {activeView === 'subcontractor-rentals' && (
            <React.Suspense
              fallback={
                <div className="bg-white border border-[#b8c9db] rounded p-12 text-center text-slate-500 font-semibold shadow-sm">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Loading Sub-Contractor Tool Rentals Ledger...
                </div>
              }
            >
              <SubContractorRentalView
                user={currentUser}
                jobs={jobs}
                inventory={inventory}
                showToast={showToast}
                onRefresh={() => handleFetchLiveSql(false)}
                onNavigateToJob={(jId) => {
                  setActiveView('jobs');
                }}
              />
            </React.Suspense>
          )}

          {activeView === 'monthly-expenses' && (
            <React.Suspense
              fallback={
                <div className="bg-white border border-[#b8c9db] rounded p-12 text-center text-slate-500 font-semibold shadow-sm">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Loading Monthly Expenses &amp; Sub-Division P&amp;L...
                </div>
              }
            >
              <MonthlyExpensesView
                user={currentUser}
                showToast={showToast}
                onRefresh={() => handleFetchLiveSql(false)}
              />
            </React.Suspense>
          )}

          {activeView === 'consumables' && (
            <React.Suspense
              fallback={
                <div className="bg-white border border-[#b8c9db] rounded p-12 text-center text-slate-500 font-semibold shadow-sm">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Loading Consumables Store &amp; Issuance Vouchers...
                </div>
              }
            >
              <ConsumablesView
                user={currentUser}
                jobs={jobs}
                inventory={inventory}
                showToast={showToast}
                onRefresh={() => handleFetchLiveSql(false)}
              />
            </React.Suspense>
          )}

          {activeView === 'po-management' && (
            <React.Suspense
              fallback={
                <div className="bg-white border border-[#b8c9db] rounded p-12 text-center text-slate-500 font-semibold shadow-sm">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Loading Purchase Orders &amp; Goods Inward (GRN) Hub...
                </div>
              }
            >
              <POManagementView
                user={currentUser}
                showToast={showToast}
                onNavigate={(mod) => setActiveView(mod as ViewKey)}
                categories={customCategories}
                sizes={customSizes}
                inventory={inventory}
                onSaveTool={handleAddTool}
              />
            </React.Suspense>
          )}

          {activeView === 'sub-rental-inward' && (
            <React.Suspense
              fallback={
                <div className="bg-white border border-[#b8c9db] rounded p-12 text-center text-slate-500 font-semibold shadow-sm">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Loading Sub-Rental Inward Hub...
                </div>
              }
            >
              <SubRentalInwardView
                user={currentUser}
                showToast={showToast}
                inventory={inventory}
                onSaveTool={handleAddTool}
              />
            </React.Suspense>
          )}

          {activeView === 'utilization' && (
            <React.Suspense
              fallback={
                <div className="bg-white border border-[#b8c9db] rounded p-12 text-center text-slate-500 font-semibold shadow-sm">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Loading Utilization Grid &amp; Daily Records...
                </div>
              }
            >
              <UtilizationView
                user={currentUser}
                inventory={inventory}
                jobs={jobs}
                dtBatches={dtBatches}
                rtBatches={rtBatches}
                contracts={contracts}
                onUpdateJob={handleSaveJob}
                onNavigate={(mod) => setActiveView(mod as ViewKey)}
                onRefresh={() => handleFetchLiveSql(false)}
              />
            </React.Suspense>
          )}

          {activeView === 'contract-dash' && (
            <ContractsDashboardView
              user={currentUser}
              contracts={contracts}
              jobs={jobs}
              onNavigate={(mod) => setActiveView(mod as ViewKey)}
              showToast={showToast}
              onRefresh={() => handleFetchLiveSql(false)}
            />
          )}

          {activeView === 'contracts' && (
            <ContractsView
              user={currentUser}
              contracts={contracts}
              jobs={jobs}
              onNavigate={(mod) => setActiveView(mod as ViewKey)}
              onSaveContract={handleSaveContract}
              onDeleteContract={handleDeleteContract}
              onRefresh={async () => {
                const sec = await fetchSecondaryModules();
                if (sec.contracts && sec.contracts.length > 0) {
                  setContracts((prev) => {
                    return sec.contracts!.map((c) => {
                      const existing = prev.find((p) => p.id === c.id || p.contractRef === c.contractRef || (c.contractNo && p.contractNo === c.contractNo));
                      const initial = INITIAL_CONTRACTS.find((i) => i.id === c.id || i.contractRef === c.contractRef || (c.contractNo && i.contractNo === c.contractNo));
                      const rates = (c.rates && c.rates.length > 0)
                        ? c.rates
                        : ((existing && existing.rates && existing.rates.length > 0) ? existing.rates : (initial?.rates || []));
                      return {
                        ...c,
                        rates,
                      };
                    });
                  });
                  showToast(`Synced ${sec.contracts.length} contracts from Azure SQL.`, 'success');
                } else {
                  showToast('Contracts master register up to date.', 'info');
                }
              }}
            />
          )}

          {activeView === 'data-management' && (
            <DataManagementView
              user={currentUser}
              jobs={jobs}
              inventory={inventory}
              dtBatches={dtBatches}
              rtBatches={rtBatches}
              callouts={callouts}
              gatePasses={gatePasses}
              inspections={inspections}
              maintenance={maintenance}
              contracts={contracts}
              customCategories={customCategories}
              customSizes={customSizes}
              onUpdateCustomCategories={handleUpdateCustomCategories}
              onUpdateCustomSizes={handleUpdateCustomSizes}
              onUpdateState={(tableKey: TableEntityKey, updater: (prev: any[]) => any[]) => {
                switch (tableKey) {
                  case 'jobs':
                    setJobs((prev) => {
                      const updated = updater(prev);
                      saveCustomJobs(updated);
                      syncCustomJobsToIndexedDB(updated);
                      return updated;
                    });
                    break;
                  case 'inventory':
                    setInventory((prev) => updater(prev));
                    break;
                  case 'dtBatches':
                    setDtBatches((prev) => updater(prev));
                    break;
                  case 'rtBatches':
                    setRtBatches((prev) => updater(prev));
                    break;
                  case 'callouts':
                    setCallouts((prev) => updater(prev));
                    break;
                  case 'gatePasses':
                    setGatePasses((prev) => updater(prev));
                    break;
                  case 'inspections':
                    setInspections((prev) => updater(prev));
                    break;
                  case 'maintenance':
                    setMaintenance((prev) => updater(prev));
                    break;
                  case 'contracts':
                  case 'contractRates':
                    setContracts((prev) => updater(prev));
                    break;
                  case 'tool_categories':
                    setCustomCategories((prev) => {
                      const updated = updater(prev);
                      const stringList: string[] = Array.isArray(updated)
                        ? updated
                            .map((it: any) => (typeof it === 'string' ? it : (it?.categoryName || it?.name || it?.category || String(it || ''))))
                            .filter((x: string) => x && typeof x === 'string')
                        : [];
                      handleUpdateCustomCategories(stringList);
                      return stringList;
                    });
                    break;
                  case 'tool_sizes':
                    setCustomSizes((prev) => {
                      const updated = updater(prev);
                      const stringList: string[] = Array.isArray(updated)
                        ? updated
                            .map((it: any) => (typeof it === 'string' ? it : (it?.sizeString || it?.size || it?.name || String(it || ''))))
                            .filter((x: string) => x && typeof x === 'string')
                        : [];
                      handleUpdateCustomSizes(stringList);
                      return stringList;
                    });
                    break;
                }
              }}
              showToast={showToast}
              onRefreshAllData={async () => {
                await handleFetchLiveSql(false);
              }}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              user={currentUser}
              dbStatus={dbStatus}
              onUpdateUserRole={(role) =>
                setCurrentUser((u) => (u ? { ...u, role } : null))
              }
              onResetData={handleResetData}
              onClearDemoData={handleClearDemoData}
              onFetchLiveSql={() => handleFetchLiveSql(false)}
              onExportData={handleExportData}
              onImportData={handleImportData}
              showToast={showToast}
              currentData={{
                inventory,
                callouts,
                jobs,
                dtBatches,
                rtBatches,
                inspections,
                maintenance,
                gatePasses,
                contracts,
              }}
            />
          )}
          </ErrorBoundary>
        </main>
      </div>

      {/* Toast Notifications (Floating on top of all modals and backdrops) */}
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
};
export default App;
