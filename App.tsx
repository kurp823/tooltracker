import React, { useState, useEffect, useCallback } from 'react';
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
import {
  INITIAL_USER,
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
import { syncWithAzureSql, fetchLiveDatabaseData, DbConnectionStatus } from './services/api';
import { Toast, ToastNotification } from './components/Toast';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { CalloutsView } from './components/CalloutsView';
import { JobsView } from './components/JobsView';
import { DeliveryTicketsView } from './components/DeliveryTicketsView';
import { ReceivingTicketsView } from './components/ReceivingTicketsView';
import { GatePassView } from './components/GatePassView';
import { InspectionView } from './components/InspectionView';
import { MaintenanceView } from './components/MaintenanceView';
import { UtilizationView } from './components/UtilizationView';
import { ContractsView } from './components/ContractsView';
import { SettingsView } from './components/SettingsView';
import { InventoryDashboardView } from './components/InventoryDashboardView';
import { MaintenanceDashboardView } from './components/MaintenanceDashboardView';
import { BillingDashboardView } from './components/BillingDashboardView';

export const App: React.FC = () => {
  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('emdad_current_user');
    return saved ? JSON.parse(saved) : INITIAL_USER;
  });

  // Current Active Module View
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');

  // Navigation and Modal Triggers
  const [isNewCalloutOpen, setIsNewCalloutOpen] = useState(false);
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);
  const [isNewDTOpen, setIsNewDTOpen] = useState(false);
  const [selectedCalloutForJob, setSelectedCalloutForJob] = useState<Callout | null>(null);
  const [preSelectedJobIdForDT, setPreSelectedJobIdForDT] = useState<string | null>(null);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('saved');

  // Toasts
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, msg, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Primary Domain State (Loaded from localStorage if present, else initial catalogs)
  const [inventory, setInventory] = useState<ToolItem[]>(() => {
    const s = localStorage.getItem('emdad_inventory');
    return s ? JSON.parse(s) : INITIAL_INVENTORY;
  });

  const [callouts, setCallouts] = useState<Callout[]>(() => {
    const s = localStorage.getItem('emdad_callouts');
    return s ? JSON.parse(s) : INITIAL_CALLOUTS;
  });

  const [jobs, setJobs] = useState<DrillingJob[]>(() => {
    const s = localStorage.getItem('emdad_jobs');
    return s ? JSON.parse(s) : INITIAL_JOBS;
  });

  const [dtBatches, setDtBatches] = useState<DTBatch[]>(() => {
    const s = localStorage.getItem('emdad_dt_batches');
    return s ? JSON.parse(s) : INITIAL_DT_BATCHES;
  });

  const [rtBatches, setRtBatches] = useState<RTBatch[]>(() => {
    const s = localStorage.getItem('emdad_rt_batches');
    return s ? JSON.parse(s) : INITIAL_RT_BATCHES;
  });

  const [inspections, setInspections] = useState<InspectionRecord[]>(() => {
    const s = localStorage.getItem('emdad_inspections');
    return s ? JSON.parse(s) : INITIAL_INSPECTIONS;
  });

  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>(() => {
    const s = localStorage.getItem('emdad_maintenance');
    return s ? JSON.parse(s) : INITIAL_MAINTENANCE;
  });

  const [gatePasses, setGatePasses] = useState<GatePass[]>(() => {
    const s = localStorage.getItem('emdad_gate_passes');
    return s ? JSON.parse(s) : INITIAL_GATE_PASSES;
  });

  const [contracts, setContracts] = useState<ContractRecord[]>(() => {
    const s = localStorage.getItem('emdad_contracts');
    return s ? JSON.parse(s) : INITIAL_CONTRACTS;
  });

  // LocalStorage Persistence
  useEffect(() => {
    localStorage.setItem('emdad_inventory', JSON.stringify(inventory));
  }, [inventory]);
  useEffect(() => {
    localStorage.setItem('emdad_callouts', JSON.stringify(callouts));
  }, [callouts]);
  useEffect(() => {
    localStorage.setItem('emdad_jobs', JSON.stringify(jobs));
  }, [jobs]);
  useEffect(() => {
    localStorage.setItem('emdad_dt_batches', JSON.stringify(dtBatches));
  }, [dtBatches]);
  useEffect(() => {
    localStorage.setItem('emdad_rt_batches', JSON.stringify(rtBatches));
  }, [rtBatches]);
  useEffect(() => {
    localStorage.setItem('emdad_inspections', JSON.stringify(inspections));
  }, [inspections]);
  useEffect(() => {
    localStorage.setItem('emdad_maintenance', JSON.stringify(maintenance));
  }, [maintenance]);
  useEffect(() => {
    localStorage.setItem('emdad_gate_passes', JSON.stringify(gatePasses));
  }, [gatePasses]);
  useEffect(() => {
    localStorage.setItem('emdad_contracts', JSON.stringify(contracts));
  }, [contracts]);
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('emdad_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('emdad_current_user');
    }
  }, [currentUser]);

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
      setSyncStatus('syncing');
      try {
        const res = await fetchLiveDatabaseData();
        if (res.success && res.data) {
          if (res.data.inventory && res.data.inventory.length > 0) {
            setInventory(res.data.inventory);
          }
          if (res.data.jobs !== undefined) {
            setJobs(res.data.jobs);
          }
          if (res.data.dtBatches !== undefined) {
            setDtBatches(res.data.dtBatches);
          }
          if (res.data.rtBatches !== undefined) {
            setRtBatches(res.data.rtBatches);
          }
          setDbStatus({
            isConnected: true,
            source: res.source,
            lastChecked: new Date().toLocaleTimeString(),
            message: res.message,
            counts: {
              inventory: res.data.inventory?.length ?? inventory.length,
              jobs: res.data.jobs?.length ?? 0,
              dtBatches: res.data.dtBatches?.length ?? 0,
              rtBatches: res.data.rtBatches?.length ?? 0,
            },
          });
          setSyncStatus('saved');
          if (!isSilent) {
            showToast(`Azure SQL: ${res.message}`, 'success');
          }
        } else {
          setDbStatus((prev) => ({
            ...prev,
            isConnected: false,
            source: 'local-cache',
            lastChecked: new Date().toLocaleTimeString(),
            message: res.message,
            counts: {
              inventory: inventory.length,
              jobs: jobs.length,
              dtBatches: dtBatches.length,
              rtBatches: rtBatches.length,
            },
          }));
          setSyncStatus('saved');
          if (!isSilent) {
            showToast(res.message, 'info');
          }
        }
      } catch (e: any) {
        setSyncStatus('error');
        if (!isSilent) {
          showToast('Unable to reach Azure SQL endpoint.', 'error');
        }
      }
    },
    [showToast, inventory.length, jobs.length, dtBatches.length, rtBatches.length]
  );

  // Initial load check on startup
  useEffect(() => {
    handleFetchLiveSql(true);
  }, [handleFetchLiveSql]);

  // Handler to clear demo data and reflect pure SQL state
  const handleClearDemoData = useCallback(() => {
    localStorage.removeItem('emdad_jobs');
    localStorage.removeItem('emdad_dt_batches');
    localStorage.removeItem('emdad_rt_batches');
    localStorage.removeItem('emdad_callouts');
    localStorage.removeItem('emdad_inspections');
    localStorage.removeItem('emdad_maintenance');
    localStorage.removeItem('emdad_gate_passes');
    setJobs([]);
    setDtBatches([]);
    setRtBatches([]);
    setCallouts([]);
    setInspections([]);
    setMaintenance([]);
    setGatePasses([]);
    showToast('Demo records cleared. Clean production state active.', 'success');
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

  // Inventory Save
  const handleSaveInventory = (updated: ToolItem[]) => {
    setInventory(updated);
    showToast('Inventory catalog updated.', 'success');
  };

  // Callouts Actions
  const handleSaveCallout = (saved: Callout) => {
    setCallouts((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      if (exists) {
        return prev.map((c) => (c.id === saved.id ? saved : c));
      }
      return [saved, ...prev];
    });
    showToast(`Callout ${saved.id} saved successfully.`, 'success');
  };

  const handleCreateJobFromCallout = (callout: Callout) => {
    setSelectedCalloutForJob(callout);
    setIsNewJobOpen(true);
    setActiveView('jobs');
  };

  // Jobs Actions
  const handleSaveJob = (job: DrillingJob) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === job.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = job;
        return copy;
      }
      return [job, ...prev];
    });

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
    showToast(`Drilling Job ${job.id} saved successfully.`, 'success');
  };

  const handleDispatchJob = (jobId: string) => {
    setPreSelectedJobIdForDT(jobId);
    setIsNewDTOpen(true);
    setActiveView('dt');
  };

  // DT Batch Actions
  const handleSaveDTBatch = (batch: DTBatch) => {
    const finalizedBatch: DTBatch = {
      ...batch,
      isLocked: true,
      lockedBy: currentUser?.name || 'Operations',
      lockedDate: new Date().toISOString(),
    };
    setDtBatches((prev) => [finalizedBatch, ...prev]);

    // Update tool statuses in inventory to 'On Rig'
    const dispatchedSerials = batch.toolLines.map((t) => t.serial);
    setInventory((prev) =>
      prev.map((tool) => {
        if (dispatchedSerials.includes(tool.serial)) {
          return {
            ...tool,
            status: 'On Rig',
            location: 'On Rig',
            currentJobId: batch.jobId,
          };
        }
        return tool;
      })
    );

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

    showToast(`Delivery Ticket ${batch.dtNumber} issued & dispatched to rig.`, 'success');
  };

  const handleUpdateDTBatch = (
    updatedBatch: DTBatch,
    addedTools?: ToolItem[],
    removedTools?: ToolItem[]
  ) => {
    setDtBatches((prev) => prev.map((b) => (b.id === updatedBatch.id ? updatedBatch : b)));

    if (addedTools && addedTools.length > 0) {
      const addedSerials = new Set(addedTools.map((t) => t.serial));
      setInventory((prev) =>
        prev.map((t) =>
          addedSerials.has(t.serial)
            ? { ...t, status: 'On Rig', location: 'On Rig', currentJobId: updatedBatch.jobId }
            : t
        )
      );
    }

    if (removedTools && removedTools.length > 0) {
      const removedSerials = new Set(removedTools.map((t) => t.serial));
      setInventory((prev) =>
        prev.map((t) =>
          removedSerials.has(t.serial)
            ? { ...t, status: 'Good', location: 'Emdad Base', currentJobId: null }
            : t
        )
      );
    }

    showToast(`Delivery Ticket ${updatedBatch.dtNumber} updated successfully.`, 'success');
  };

  // RT Batch Actions (Backload receiving)
  const handleSaveRTBatch = (batch: RTBatch) => {
    setRtBatches((prev) => [batch, ...prev]);

    // Update DT line statuses from OnRig to Returned
    const returnedSerials = batch.toolLines.map((t) => t.serial);
    setDtBatches((prev) =>
      prev.map((dt) => {
        const updatedLines = dt.toolLines.map((line) => {
          if (returnedSerials.includes(line.serial)) {
            const rtLine = batch.toolLines.find((l) => l.serial === line.serial);
            return {
              ...line,
              status: 'Returned' as const,
              used: rtLine ? rtLine.used : false,
            };
          }
          return line;
        });
        return { ...dt, toolLines: updatedLines };
      })
    );

    // Update tool statuses & create inspection records for USED tools
    const curYr = new Date().getFullYear().toString().slice(-2);
    let nextInsSeq =
      inspections
        .map((i) => {
          const m = i.woNumber.match(/^WO-INS-\d+-(\d+)$/);
          return m ? parseInt(m[1], 10) : 0;
        })
        .reduce((max, val) => Math.max(max, val), 0) + 1;

    const usedLines = batch.toolLines.filter((l) => l.used);
    const newInspections: InspectionRecord[] = usedLines.map((line) => {
      const invItem = inventory.find((t) => t.serial === line.serial);
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
    }

    setInventory((prev) =>
      prev.map((tool) => {
        const line = batch.toolLines.find((l) => l.serial === tool.serial);
        if (!line) return tool;

        if (line.used) {
          return {
            ...tool,
            status: 'Inspection',
            location: 'Inspection Bay',
            currentJobId: null,
          };
        } else {
          return {
            ...tool,
            status: 'Good',
            location: 'Emdad Base',
            currentJobId: null,
          };
        }
      })
    );

    showToast(
      `Receiving Ticket ${batch.rtNumber} processed. ${newInspections.length} used tool(s) sent to QC Inspection Bay.`,
      'success'
    );
  };

  // Gate Pass Actions
  const handleSaveGatePass = (gp: GatePass, removedTools: ToolItem[]) => {
    setGatePasses((prev) => [gp, ...prev]);
    const removedIds = new Set(removedTools.map((t) => t.id));
    setInventory((prev) =>
      prev.map((t) => {
        if (removedIds.has(t.id)) {
          return {
            ...t,
            status: 'Removed',
            location: 'Returned to Supplier',
          };
        }
        return t;
      })
    );
    showToast(`Security Gate Pass ${gp.gpNumber} issued. Tools returned to supplier.`, 'success');
  };

  // Inspection Actions
  const handleUpdateInspection = (
    insId: string,
    updates: Partial<InspectionRecord>,
    newMaintenanceWO?: MaintenanceRecord
  ) => {
    const ins = inspections.find((i) => i.id === insId);
    if (!ins) return;

    setInspections((prev) =>
      prev.map((i) => (i.id === insId ? { ...i, ...updates } : i))
    );

    if (updates.status === 'Pass') {
      setInventory((prev) =>
        prev.map((t) =>
          t.serial === ins.serial
            ? { ...t, status: 'Good', location: 'Emdad Base' }
            : t
        )
      );
      showToast(`Tool ${ins.serial} passed QC and returned to Base ready stock.`, 'success');
    } else if (updates.status === 'Fail') {
      if (newMaintenanceWO) {
        setMaintenance((prev) => [newMaintenanceWO, ...prev]);
      }
      setInventory((prev) =>
        prev.map((t) =>
          t.serial === ins.serial
            ? { ...t, status: 'Redress', location: 'Workshop' }
            : t
        )
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
    setInventory((prev) =>
      prev.map((t) =>
        t.serial === record.serial
          ? {
              ...t,
              status: 'Redress',
              location: record.type === 'Vendor' ? `Vendor Workshop (${record.vendor || '3rd Party'})` : 'Workshop',
            }
          : t
      )
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

    setMaintenance((prev) =>
      prev.map((m) =>
        m.id === mId
          ? {
              ...m,
              type: 'Vendor',
              vendor: vendorName,
              vendorPoRef,
              vendorQuoteRef,
              estCost,
              dispatchToVendorDate: dispatchDate,
              repairScope,
              status: 'Sent to Vendor',
              stage: 'Dispatched to Vendor',
              notes: notes || m.notes,
            }
          : m
      )
    );

    setInventory((prev) =>
      prev.map((t) =>
        t.serial === mnt.serial
          ? {
              ...t,
              status: 'Repair',
              location: `Vendor Workshop (${vendorName})`,
            }
          : t
      )
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

    setMaintenance((prev) =>
      prev.map((m) =>
        m.id === mId
          ? {
              ...m,
              receivedFromVendorDate: receivedDate,
              vendorInvoiceRef,
              cost: actualCost !== null ? actualCost : m.cost,
              partsReplaced,
              status: 'Received from Vendor',
              stage: 'Received from Vendor',
              notes: notes || m.notes,
            }
          : m
      )
    );

    setInventory((prev) =>
      prev.map((t) =>
        t.serial === mnt.serial
          ? {
              ...t,
              status: 'Redress',
              location: 'Workshop QC Bay',
            }
          : t
      )
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

    setMaintenance((prev) =>
      prev.map((m) =>
        m.id === mId
          ? {
              ...m,
              status: 'Ready for QC',
              stage: 'Ready for QC',
            }
          : m
      )
    );

    setInventory((prev) =>
      prev.map((t) =>
        t.serial === mnt.serial
          ? {
              ...t,
              status: 'Inspection',
              location: 'Inspection Bay',
            }
          : t
      )
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

    setMaintenance((prev) =>
      prev.map((m) =>
        m.id === mId
          ? {
              ...m,
              status: 'Completed',
              completedDate,
              cost: cost !== null ? cost : m.cost,
              notes: notes || m.notes,
            }
          : m
      )
    );

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

      setInventory((prev) =>
        prev.map((t) =>
          t.serial === mnt.serial
            ? { ...t, status: 'Inspection', location: 'Inspection Bay' }
            : t
        )
      );

      showToast(`Maintenance WO ${mnt.woNumber} completed. Routed to Inspection Bay (${woNum}).`, 'success');
    } else {
      setInventory((prev) =>
        prev.map((t) =>
          t.serial === mnt.serial
            ? { ...t, status: 'Good', location: 'Emdad Base' }
            : t
        )
      );

      showToast(`Maintenance WO ${mnt.woNumber} completed. Tool returned to Base as Good ready stock.`, 'success');
    }
  };

  // Contract Actions
  const handleSaveContract = (c: ContractRecord) => {
    setContracts((prev) => [c, ...prev]);
    showToast(`Master contract ${c.name} saved.`, 'success');
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

  // If user not authenticated
  if (!currentUser) {
    return <LoginView onLogin={(user) => setCurrentUser(user)} />;
  }

  // Active counts for badges
  const pendingCalloutsCount = callouts.filter((c) => c.status === 'Pending').length;
  const onRigToolsCount = inventory.filter(
    (t) => (t.location === 'On Rig' || t.status === 'On Rig') && t.status !== 'Removed'
  ).length;
  const pendingInspectionsCount = inspections.filter((i) => i.status === 'Pending').length;
  const pendingMaintenanceCount = maintenance.filter((m) => m.status === 'In Progress').length;

  return (
    <div className="min-h-screen bg-[#c8d8e8] text-[#1e293b] font-sans flex flex-col antialiased selection:bg-amber-200">
      {/* Toast Notifications */}
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* Top Header */}
      <Header
        user={currentUser}
        syncStatus={syncStatus}
        dbStatus={dbStatus}
        onSync={handleManualSync}
        onRefresh={() => handleFetchLiveSql(false)}
        onLogout={() => setCurrentUser(null)}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Navigation Sidebar */}
        <Sidebar
          user={currentUser}
          activeView={activeView}
          onNavigate={(view) => {
            setActiveView(view);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          pendingCalloutsCount={pendingCalloutsCount}
          onRigToolsCount={onRigToolsCount}
          pendingInspectionsCount={pendingInspectionsCount}
          pendingMaintenanceCount={pendingMaintenanceCount}
        />

        {/* Dynamic View Canvas */}
        <main className="flex-1 p-3 md:p-5 overflow-y-auto w-full">
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
            />
          )}

          {activeView === 'inventory' && (
            <InventoryView
              user={currentUser}
              inventory={inventory}
              onSaveInventory={handleSaveInventory}
            />
          )}

          {activeView === 'callouts' && (
            <CalloutsView
              user={currentUser}
              callouts={callouts}
              inventory={inventory}
              onSaveCallout={handleSaveCallout}
              onCreateJob={handleCreateJobFromCallout}
              isNewCalloutOpen={isNewCalloutOpen}
              onCloseNewCallout={() => setIsNewCalloutOpen(false)}
              onOpenNewCallout={() => setIsNewCalloutOpen(true)}
            />
          )}

          {activeView === 'jobs' && (
            <JobsView
              user={currentUser}
              jobs={jobs}
              callouts={callouts}
              dtBatches={dtBatches}
              onSaveJob={handleSaveJob}
              onDispatchJob={handleDispatchJob}
              isNewJobModalOpen={isNewJobOpen}
              onCloseNewJobModal={() => {
                setIsNewJobOpen(false);
                setSelectedCalloutForJob(null);
              }}
              onOpenNewJobModal={() => setIsNewJobOpen(true)}
              selectedCalloutForNewJob={selectedCalloutForJob}
            />
          )}

          {activeView === 'dt' && (
            <DeliveryTicketsView
              user={currentUser}
              dtBatches={dtBatches}
              jobs={jobs}
              callouts={callouts}
              inventory={inventory}
              onSaveDTBatch={handleSaveDTBatch}
              onUpdateDTBatch={handleUpdateDTBatch}
              isNewDTOpen={isNewDTOpen}
              onCloseNewDT={() => {
                setIsNewDTOpen(false);
                setPreSelectedJobIdForDT(null);
              }}
              onOpenNewDT={() => setIsNewDTOpen(true)}
              preSelectedJobId={preSelectedJobIdForDT}
            />
          )}

          {activeView === 'rt' && (
            <ReceivingTicketsView
              user={currentUser}
              rtBatches={rtBatches}
              dtBatches={dtBatches}
              inventory={inventory}
              onSaveRTBatch={handleSaveRTBatch}
            />
          )}

          {activeView === 'gatepass' && (
            <GatePassView
              user={currentUser}
              gatePasses={gatePasses}
              inventory={inventory}
              onSaveGatePass={handleSaveGatePass}
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
            />
          )}

          {activeView === 'inspection' && (
            <InspectionView
              user={currentUser}
              inspections={inspections}
              inventory={inventory}
              maintenance={maintenance}
              onUpdateInspection={handleUpdateInspection}
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
            />
          )}

          {activeView === 'billing-dash' && (
            <BillingDashboardView
              user={currentUser}
              jobs={jobs}
              dtBatches={dtBatches}
              rtBatches={rtBatches}
              onNavigate={(mod) => setActiveView(mod)}
              onUpdateJob={handleSaveJob}
            />
          )}

          {activeView === 'utilization' && (
            <UtilizationView
              user={currentUser}
              inventory={inventory}
              jobs={jobs}
              dtBatches={dtBatches}
              rtBatches={rtBatches}
              onUpdateJob={handleSaveJob}
            />
          )}

          {activeView === 'contracts' && (
            <ContractsView
              user={currentUser}
              contracts={contracts}
              jobs={jobs}
              onSaveContract={handleSaveContract}
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
        </main>
      </div>
    </div>
  );
};
export default App;
