import React, { useState, useMemo, useEffect } from 'react';
import {
  DrillingJob,
  DTBatch,
  RTBatch,
  Callout,
  CalloutItem,
  ToolItem,
  User,
  ContractRecord,
  JobCrewMember,
} from '../types';
import { formatDateDDMMYYYY } from '../utils';

interface JobDossierViewProps {
  job: DrillingJob;
  user?: User | null;
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  callouts: Callout[];
  inventory: ToolItem[];
  contracts?: ContractRecord[];
  onSaveJob: (job: DrillingJob) => void;
  onSaveDTBatch: (batch: DTBatch) => void;
  onUpdateDTBatch?: (batch: DTBatch, addedTools?: ToolItem[], removedTools?: ToolItem[]) => void;
  onSaveRTBatch: (batch: RTBatch) => void;
  onUpdateRTBatch?: (batch: RTBatch) => void;
  onSaveCallout?: (callout: Callout) => void;
  onBackToRegister?: () => void;
  onNavigateToInvoicing?: (jobId: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type DossierTabKey =
  | 'job-header'
  | 'technical-details'
  | 'manpower'
  | 'checklist'
  | 'delivery-tickets'
  | 'return-tickets'
  | 'utilization';

// Company roster of certified field engineers & supervisors
const MASTER_PERSONNEL_ROSTER: Omit<JobCrewMember, 'operatingDays' | 'standbyDays' | 'totalChargeUSD'>[] = [
  {
    id: 'ENG-01',
    badgeNo: 'EMD-4102',
    name: 'Ahmed Al-Mansoor',
    designation: 'Lead Fishing Engineer',
    mobDate: '15-May-23',
    demobDate: '28-May-23',
    dailyRateUSD: 850,
    rigPassNo: 'RP-88421',
    h2sExpiry: '12-Dec-2025',
    status: 'Mobilized (On Rig)',
    contactNo: '+971501122334',
  },
  {
    id: 'ENG-02',
    badgeNo: 'EMD-3841',
    name: 'Rajesh Sharma',
    designation: 'Whipstock Specialist',
    mobDate: '18-May-23',
    demobDate: '26-May-23',
    dailyRateUSD: 750,
    rigPassNo: 'RP-90112',
    h2sExpiry: '15-Jan-2026',
    status: 'Mobilized (On Rig)',
    contactNo: '+971502233445',
  },
  {
    id: 'ENG-03',
    badgeNo: 'EMD-5012',
    name: 'Mohamed Tariq',
    designation: 'Field Tool Supervisor',
    mobDate: '15-May-23',
    demobDate: undefined,
    dailyRateUSD: 700,
    rigPassNo: 'RP-77231',
    h2sExpiry: '20-Nov-2025',
    status: 'Mobilized (On Rig)',
    contactNo: '+971503344556',
  },
  {
    id: 'ENG-04',
    badgeNo: 'EMD-2914',
    name: 'David Miller',
    designation: 'Senior Downhole Rental Tech',
    mobDate: '16-May-23',
    demobDate: undefined,
    dailyRateUSD: 650,
    rigPassNo: 'RP-65492',
    h2sExpiry: '05-May-2026',
    status: 'Standby',
    contactNo: '+971504455667',
  },
  {
    id: 'ENG-05',
    badgeNo: 'EMD-4890',
    name: 'Sultan Al-Zaabi',
    designation: 'Directional & Milling Engineer',
    mobDate: '17-May-23',
    demobDate: '27-May-23',
    dailyRateUSD: 800,
    rigPassNo: 'RP-99120',
    h2sExpiry: '18-Aug-2025',
    status: 'Standby',
    contactNo: '+971505566778',
  },
  {
    id: 'ENG-06',
    badgeNo: 'EMD-3301',
    name: 'Johnathan Vance',
    designation: 'Lead BHA Specialist',
    mobDate: '15-May-23',
    demobDate: undefined,
    dailyRateUSD: 850,
    rigPassNo: 'RP-54129',
    h2sExpiry: '30-Oct-2026',
    status: 'Mobilized (On Rig)',
    contactNo: '+971506677889',
  },
  {
    id: 'ENG-07',
    badgeNo: 'EMD-5120',
    name: 'Khaled Bin Rashid',
    designation: 'Rig Tool Coordinator',
    mobDate: '15-May-23',
    demobDate: '28-May-23',
    dailyRateUSD: 600,
    rigPassNo: 'RP-71203',
    h2sExpiry: '14-Jul-2025',
    status: 'Demobilized',
    contactNo: '+971507788990',
  },
];

export const JobDossierView: React.FC<JobDossierViewProps> = ({
  job: initialJob,
  user,
  jobs,
  dtBatches,
  rtBatches,
  callouts,
  inventory,
  contracts = [],
  onSaveJob,
  onSaveDTBatch,
  onUpdateDTBatch,
  onSaveRTBatch,
  onUpdateRTBatch,
  onSaveCallout,
  onBackToRegister,
  onNavigateToInvoicing,
  showToast,
}) => {
  // Current active top tab
  const [activeTab, setActiveTab] = useState<DossierTabKey>('job-header');

  // Job Header state
  const [jobData, setJobData] = useState<DrillingJob>(initialJob);
  useEffect(() => {
    setJobData(initialJob);
  }, [initialJob]);

  // Technical Details sub-tab
  const [techSubTab, setTechSubTab] = useState<'fishing' | 'whipstock' | 'rentals'>('fishing');

  // Related data for this specific job
  const jobKeyRaw = (jobData.id || jobData.jobNumber || '').trim().toUpperCase();
  const jobDTs = useMemo(() => {
    return dtBatches.filter((b) => {
      const bRaw = (b.jobId || b.jobNumber || '').trim().toUpperCase();
      return bRaw === jobKeyRaw || (bRaw && bRaw.includes(jobKeyRaw));
    });
  }, [dtBatches, jobKeyRaw]);

  const jobRTs = useMemo(() => {
    return rtBatches.filter((b) => {
      const bRaw = (b.jobId || b.jobNumber || '').trim().toUpperCase();
      return bRaw === jobKeyRaw || (bRaw && bRaw.includes(jobKeyRaw));
    });
  }, [rtBatches, jobKeyRaw]);

  const jobCallouts = useMemo(() => {
    return callouts.filter((c) => {
      const cRaw = (c.jobId || '').trim().toUpperCase();
      return cRaw === jobKeyRaw || c.id === jobData.calloutId;
    });
  }, [callouts, jobKeyRaw, jobData.calloutId]);

  // Manpower / Crew State
  const [assignedCrew, setAssignedCrew] = useState<JobCrewMember[]>(() => {
    if (jobData.crewMembers && jobData.crewMembers.length > 0) {
      return jobData.crewMembers;
    }
    // Default initial crew for this job
    return [
      {
        id: 'CREW-1',
        badgeNo: 'EMD-4102',
        name: 'Ahmed Al-Mansoor',
        designation: 'Lead Fishing Engineer',
        mobDate: jobData.mobDate || '15-May-2023',
        demobDate: jobData.demobDate || '28-May-2023',
        dailyRateUSD: 850,
        operatingDays: 10,
        standbyDays: 4,
        totalChargeUSD: 14 * 850,
        rigPassNo: 'RP-88421',
        h2sExpiry: '12-Dec-2025',
        status: 'Mobilized (On Rig)',
        contactNo: '+971501122334',
      },
      {
        id: 'CREW-2',
        badgeNo: 'EMD-3841',
        name: 'Rajesh Sharma',
        designation: 'Whipstock Specialist',
        mobDate: jobData.mobDate || '18-May-2023',
        demobDate: jobData.demobDate || '26-May-2023',
        dailyRateUSD: 750,
        operatingDays: 7,
        standbyDays: 2,
        totalChargeUSD: 9 * 750,
        rigPassNo: 'RP-90112',
        h2sExpiry: '15-Jan-2026',
        status: 'Mobilized (On Rig)',
        contactNo: '+971502233445',
      },
    ];
  });

  // Manpower Picker Modal State
  const [isPersonnelSelectOpen, setIsPersonnelSelectOpen] = useState(false);
  const [selectedPersonnelRole, setSelectedPersonnelRole] = useState<string>('All Roles');
  const [checkedPersonnelBadges, setCheckedPersonnelBadges] = useState<string[]>([]);

  // Unique roles for personnel picker
  const availablePersonnelRoles = useMemo(() => {
    const set = new Set<string>();
    MASTER_PERSONNEL_ROSTER.forEach((p) => set.add(p.designation));
    return ['All Roles', ...Array.from(set).sort()];
  }, []);

  const filteredPersonnelRoster = useMemo(() => {
    return MASTER_PERSONNEL_ROSTER.filter((p) => {
      if (selectedPersonnelRole === 'All Roles') return true;
      return p.designation === selectedPersonnelRole;
    });
  }, [selectedPersonnelRole]);

  // Selected Checklist within Checklist Tab
  const [selectedCalloutId, setSelectedCalloutId] = useState<string>(() => {
    return jobCallouts[0]?.id || 'NEW';
  });

  // Active callout object
  const activeCallout = useMemo(() => {
    return (
      jobCallouts.find((c) => c.id === selectedCalloutId) ||
      jobCallouts[0] || {
        id: `CAL-${new Date().getFullYear().toString().slice(-2)}-${String(jobCallouts.length + 1).padStart(4, '0')}`,
        ticketNo: '2266',
        rig: jobData.rig || '',
        well: jobData.well || '',
        client: jobData.client || '',
        contract: jobData.contract || '',
        poNumber: jobData.poNumber || '',
        projectNo: jobData.contractNo || jobData.contract || '4700012465',
        reqDate: formatDateDDMMYYYY(new Date().toISOString()),
        status: 'Checklist - Opened',
        createdDate: new Date().toISOString().split('T')[0],
        emailRef: '',
        items: [],
      }
    );
  }, [jobCallouts, selectedCalloutId, jobData]);

  // Checklist Items State
  const [checklistItems, setChecklistItems] = useState<CalloutItem[]>(() => activeCallout.items || []);
  useEffect(() => {
    setChecklistItems(activeCallout.items || []);
  }, [activeCallout]);

  // Tool Selection Modal (itemsselect) State
  const [isToolSelectOpen, setIsToolSelectOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('CUTLIP GUIDE');
  const [selectedToolSize, setSelectedToolSize] = useState<string>('');
  const [checkedToolSerials, setCheckedToolSerials] = useState<string[]>([]);

  // Unique categories in inventory
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((t) => {
      if (t.shortDesc) set.add(t.shortDesc.trim());
      else if (t.desc) set.add(t.desc.split(' ')[0]);
    });
    ['CUTLIP GUIDE', 'HYD DRILLING JAR', 'FISHING JAR', 'CROSSOVER SUB', 'OVERSHOT', 'BIT SUB', 'CARGO BASKET', 'GUNDRILL REAMER', 'SAFETY VALVE'].forEach(c => set.add(c));
    return Array.from(set).sort();
  }, [inventory]);

  const categoryInventory = useMemo(() => {
    if (!selectedCategory) return inventory;
    return inventory.filter((t) => {
      const matchShort = (t.shortDesc || '').toUpperCase().includes(selectedCategory.toUpperCase());
      const matchDesc = (t.desc || '').toUpperCase().includes(selectedCategory.toUpperCase());
      return matchShort || matchDesc;
    });
  }, [inventory, selectedCategory]);

  const availableSizes = useMemo(() => {
    const set = new Set<string>();
    categoryInventory.forEach((t) => {
      if (t.size) set.add(t.size.trim());
    });
    if (set.size === 0) {
      ['5-3/4"', '6-3/4"', '8"', '8-1/8"', '9-1/2"', '11-3/4"'].forEach(s => set.add(s));
    }
    return Array.from(set).sort();
  }, [categoryInventory]);

  const modalAvailableTools = useMemo(() => {
    return categoryInventory.filter((t) => {
      if (!selectedToolSize) return true;
      return (t.size || '').trim() === selectedToolSize.trim();
    });
  }, [categoryInventory, selectedToolSize]);

  // Selected DT for DT Tab
  const [selectedDTNumber, setSelectedDTNumber] = useState<string>(() => {
    return jobDTs[0]?.dtNumber || '';
  });
  useEffect(() => {
    if (!selectedDTNumber && jobDTs.length > 0) {
      setSelectedDTNumber(jobDTs[0].dtNumber);
    }
  }, [jobDTs, selectedDTNumber]);

  const activeDT = useMemo(() => {
    return jobDTs.find((d) => d.dtNumber === selectedDTNumber) || jobDTs[0] || null;
  }, [jobDTs, selectedDTNumber]);

  // Selected RT for RT Tab
  const [selectedRTNumber, setSelectedRTNumber] = useState<string>(() => {
    return jobRTs[0]?.rtNumber || '';
  });
  useEffect(() => {
    if (!selectedRTNumber && jobRTs.length > 0) {
      setSelectedRTNumber(jobRTs[0].rtNumber);
    }
  }, [jobRTs, selectedRTNumber]);

  const activeRT = useMemo(() => {
    return jobRTs.find((r) => r.rtNumber === selectedRTNumber) || jobRTs[0] || null;
  }, [jobRTs, selectedRTNumber]);

  // RGT Lower Table: Selected DT for tool backload
  const [rgtSearchDTNo, setRgtSearchDTNo] = useState<string>(() => {
    return jobDTs[0]?.dtNumber || '';
  });
  const [rgtCheckedSerials, setRgtCheckedSerials] = useState<string[]>([]);

  const rgtDTToolsToReturn = useMemo(() => {
    if (!rgtSearchDTNo) return [];
    const targetDT = jobDTs.find((d) => d.dtNumber === rgtSearchDTNo);
    if (!targetDT) return [];
    return targetDT.toolLines || [];
  }, [jobDTs, rgtSearchDTNo]);

  // Save Job Record
  const handleSaveJobHeader = () => {
    const updated = { ...jobData, crewMembers: assignedCrew };
    onSaveJob(updated);
    showToast(`Job ${jobData.id} records updated and saved.`, 'success');
  };

  // Insert Personnel from Modal
  const handleInsertSelectedPersonnel = () => {
    const selectedPersons = MASTER_PERSONNEL_ROSTER.filter((p) => checkedPersonnelBadges.includes(p.badgeNo));
    const newMembers: JobCrewMember[] = selectedPersons.map((p, idx) => ({
      id: `CREW-${Date.now()}-${idx}`,
      badgeNo: p.badgeNo,
      name: p.name,
      designation: p.designation,
      mobDate: jobData.mobDate || formatDateDDMMYYYY(new Date().toISOString()),
      demobDate: undefined,
      dailyRateUSD: p.dailyRateUSD,
      operatingDays: 7,
      standbyDays: 0,
      totalChargeUSD: 7 * p.dailyRateUSD,
      rigPassNo: p.rigPassNo,
      h2sExpiry: p.h2sExpiry,
      status: 'Mobilized (On Rig)',
      contactNo: p.contactNo,
    }));

    const updatedCrew = [...assignedCrew, ...newMembers];
    setAssignedCrew(updatedCrew);
    setCheckedPersonnelBadges([]);
    setIsPersonnelSelectOpen(false);

    const updatedJob = { ...jobData, crewMembers: updatedCrew };
    setJobData(updatedJob);
    onSaveJob(updatedJob);

    showToast(`Assigned ${newMembers.length} certified engineer(s) to Rig ${jobData.rig}.`, 'success');
  };

  // Delete Crew Member
  const handleDeleteCrewMember = (id: string) => {
    const updated = assignedCrew.filter((c) => c.id !== id);
    setAssignedCrew(updated);
    const updatedJob = { ...jobData, crewMembers: updated };
    setJobData(updatedJob);
    onSaveJob(updatedJob);
    showToast('Crew member removed from this job.', 'info');
  };

  // Insert tools from modal to checklist
  const handleInsertSelectedTools = () => {
    const newlySelectedTools = inventory.filter((t) => checkedToolSerials.includes(t.serial));
    const newItems: CalloutItem[] = newlySelectedTools.map((t, idx) => ({
      seq: checklistItems.length + idx + 1,
      size: t.size || '—',
      shortDesc: t.shortDesc || t.desc,
      qty: 1,
      assigned: 1,
      serialNos: [t.serial],
      status: 'Assigned',
      partNo: t.assetNo || t.serial,
      description: t.desc || t.shortDesc,
      supplier: t.supplier || (t.isEmdad ? 'EMDAD' : 'RUBICON OILFIELD'),
      qtyIn: 1,
      insNum: `GIS-Z-${Math.floor(10000 + Math.random() * 90000)}-2023`,
      insDate: '09-May-23',
      comments: 'ACCEPTED',
      cat: selectedCategory,
      condition: 'ACCEPTED',
    }));

    const updated = [...checklistItems, ...newItems];
    setChecklistItems(updated);
    setCheckedToolSerials([]);
    setIsToolSelectOpen(false);

    if (onSaveCallout) {
      onSaveCallout({
        ...activeCallout,
        items: updated,
      });
    }
    showToast(`Inserted ${newItems.length} tool(s) into Checklist. Reserved for Job ${jobData.id}.`, 'success');
  };

  // Delete row from checklist
  const handleDeleteChecklistRow = (seq: number) => {
    const updated = checklistItems.filter((item) => item.seq !== seq);
    setChecklistItems(updated);
    if (onSaveCallout) {
      onSaveCallout({
        ...activeCallout,
        items: updated,
      });
    }
    showToast('Row removed from checklist and released back to yard availability.', 'info');
  };

  // AUTOMATED LIFECYCLE BRIDGE: Generate Delivery Ticket (DT) from Checklist
  const handleGenerateDTFromChecklist = () => {
    if (checklistItems.length === 0) {
      showToast('No tools in checklist to generate Delivery Ticket from.', 'error');
      return;
    }

    const curYr = new Date().getFullYear().toString().slice(-2);
    const nextDTNum = `DT-${curYr}-${String(2120 + jobDTs.length).padStart(4, '0')}`;

    const newDT: DTBatch = {
      id: `DTB-${Date.now()}`,
      dtNumber: nextDTNum,
      jobId: jobData.id,
      jobNumber: jobData.id,
      rmDate: formatDateDDMMYYYY(new Date().toISOString()),
      rmRef: `MR-${jobData.id.slice(-4) || '881'}`,
      dispatchDate: formatDateDDMMYYYY(new Date().toISOString()),
      deliveryDate: formatDateDDMMYYYY(new Date().toISOString()),
      rig: jobData.rig,
      well: jobData.well,
      contract: jobData.contractNo || jobData.contract,
      dispatchedBy: user?.name || 'Operations',
      recipient: `${jobData.rig} Toolpusher`,
      notes: `Generated automatically from Checklist ${activeCallout.id}.`,
      isLocked: false,
      toolLines: checklistItems.map((ci, idx) => ({
        id: idx + 1,
        itemNo: idx + 1,
        serial: ci.serialNos?.[0] || ci.partNo || `TOOL-${idx}`,
        assetNo: ci.partNo || ci.serialNos?.[0] || '',
        shortDesc: ci.cat || ci.shortDesc || 'Downhole Tool',
        desc: ci.description || ci.shortDesc || '',
        size: ci.size || '—',
        status: 'OnRig',
        ownership: ci.supplier || 'EMDAD',
        isEmdad: (ci.supplier || '').toUpperCase().includes('EMDAD'),
        qty: ci.qty || 1,
        remarks: 'Mobilized',
      })),
    };

    onSaveDTBatch(newDT);

    // Update checklist status to Delivery Ticket - Created
    if (onSaveCallout) {
      onSaveCallout({
        ...activeCallout,
        status: 'Delivery Ticket - Created',
      });
    }

    // Switch to Delivery Tickets tab to review logistics
    setSelectedDTNumber(newDT.dtNumber);
    setActiveTab('delivery-tickets');

    showToast(`Delivery Ticket ${newDT.dtNumber} generated from Checklist with ${checklistItems.length} tool(s)!`, 'success');
  };

  // Transfer checked tools from Lower DT to Upper RT
  const handleMoveToolsToRT = () => {
    if (rgtCheckedSerials.length === 0) {
      showToast('Please check at least one tool to return.', 'error');
      return;
    }
    if (!activeRT) {
      showToast('No active Return Ticket to receive tools into.', 'error');
      return;
    }

    const selectedLines = rgtDTToolsToReturn.filter((t) => rgtCheckedSerials.includes(t.serial));
    const newRTLines = selectedLines.map((t, idx) => ({
      itemNo: (activeRT.toolLines?.length || 0) + idx + 1,
      serial: t.serial,
      assetNo: t.assetNo,
      shortDesc: t.shortDesc,
      desc: t.desc,
      used: true,
      condition: 'USED',
      routedTo: 'Inspection Bay',
      remarks: 'USED',
    }));

    const updatedRT: RTBatch = {
      ...activeRT,
      toolLines: [...(activeRT.toolLines || []), ...newRTLines],
    };

    if (onUpdateRTBatch) {
      onUpdateRTBatch(updatedRT);
    } else {
      onSaveRTBatch(updatedRT);
    }
    setRgtCheckedSerials([]);
    showToast(`Moved ${newRTLines.length} tool(s) to RT ${activeRT.rtNumber}.`, 'success');
  };

  // Reconciled tool counts
  const totalDispatched = jobDTs.reduce((acc, dt) => acc + (dt.toolLines?.length || 0), 0);
  const totalReturned = jobRTs.reduce((acc, rt) => acc + (rt.toolLines?.length || 0), 0);
  const activeOnRig = Math.max(0, totalDispatched - totalReturned);

  // Print Handlers
  const handlePrintTicket = (type: 'onshore' | 'offshore' | 'report' | 'pob') => {
    window.print();
  };

  return (
    <div
      className="access-dossier bg-[#dce6f1] min-h-screen text-slate-800 p-2 sm:p-4 select-none"
      style={{ fontFamily: "'Calibri', 'Arial Nova', 'Segoe UI', Arial, sans-serif", fontSize: '9pt' }}
    >
      <style>{`
        .access-dossier, .access-dossier * {
          font-family: 'Calibri', 'Arial Nova', 'Segoe UI', Arial, sans-serif;
        }
        .access-dossier input, .access-dossier select, .access-dossier textarea, .access-dossier td, .access-dossier th {
          font-size: 9pt;
        }
      `}</style>
      {/* Top Access Window Bar */}
      <div className="bg-[#1a3055] text-white px-3 py-1.5 rounded-t-md flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2 text-xs font-bold tracking-wide">
          <span>Job Dossier Workspace &bull; Job No: <span className="font-mono text-amber-300">{jobData.id}</span></span>
        </div>
        <div className="flex items-center gap-2">
          {/* Bridge to Dedicated Invoicing Screen in Billing Module */}
          <button
            type="button"
            onClick={() => {
              if (onNavigateToInvoicing) {
                onNavigateToInvoicing(jobData.id);
              } else {
                showToast(`Job ${jobData.id} passed to Billing & Commercial Invoicing module.`, 'info');
              }
            }}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-0.5 rounded shadow-xs cursor-pointer transition flex items-center gap-1.5"
            title="Open Job in dedicated Billing & Commercial Invoicing module"
          >
            <span>💳</span>
            <span>Open in Invoicing Screen &rarr;</span>
          </button>

          {onBackToRegister && (
            <button
              onClick={onBackToRegister}
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-2.5 py-0.5 rounded cursor-pointer transition font-medium flex items-center gap-1"
            >
              <span>&larr;</span> Back to Register
            </button>
          )}
        </div>
      </div>

      {/* MS Access Tab Strip */}
      <div className="bg-slate-200 border-x border-b border-[#9fb6cf] flex items-center gap-0.5 px-2 pt-1.5 overflow-x-auto shadow-2xs">
        {[
          { key: 'job-header', label: 'Job Header' },
          { key: 'technical-details', label: 'Technical Details' },
          { key: 'manpower', label: 'Manpower / Crew' },
          { key: 'checklist', label: 'Checklistheader' },
          { key: 'delivery-tickets', label: 'Delivery Ticket Header' },
          { key: 'return-tickets', label: 'RTHeader / RGT' },
          { key: 'utilization', label: 'Utilization' },
        ].map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as DossierTabKey)}
              className={`px-3 py-1.5 text-xs font-bold rounded-t-md border-t border-x transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                isActive
                  ? 'bg-white border-[#9fb6cf] text-[#1a3055] shadow-sm font-extrabold relative -bottom-[1px] z-10'
                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-amber-500' : 'bg-slate-400'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Form Body */}
      <div className="bg-white border-x border-b border-[#9fb6cf] p-4 rounded-b-md shadow-md min-h-[620px] relative">
        {/* Persistent Anchored Job Context Box */}
        <div className="bg-[#f0f4f9] border border-[#b8cce0] rounded-md p-3 mb-4 shadow-2xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-xs">
            {/* Left Column: Job No, Job Description, Rig, Well, Field */}
            <div className="space-y-1.5">
              <div className="flex items-center">
                <label className="w-28 font-bold text-slate-700 text-right pr-3">Job No:</label>
                <input
                  type="text"
                  value={jobData.id || ''}
                  onChange={(e) => setJobData({ ...jobData, id: e.target.value, jobNumber: e.target.value })}
                  className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-mono font-bold text-slate-900 w-48 shadow-2xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center">
                <label className="w-28 font-bold text-slate-700 text-right pr-3">Job Description:</label>
                <select
                  value={jobData.jobDescription || jobData.serviceType || 'DOWN HOLE RENTALS'}
                  onChange={(e) => setJobData({ ...jobData, jobDescription: e.target.value, serviceType: e.target.value })}
                  className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-bold text-slate-800 w-64 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                >
                  <option value="DOWN HOLE RENTALS">DOWN HOLE RENTALS</option>
                  <option value='"DUAL COMPLETION"'>"DUAL COMPLETION"</option>
                  <option value="FISHING SERVICES">FISHING SERVICES</option>
                  <option value="WHIPSTOCK SERVICES">WHIPSTOCK SERVICES</option>
                </select>
              </div>

              <div className="flex items-center">
                <label className="w-28 font-bold text-slate-700 text-right pr-3">Rig:</label>
                <input
                  type="text"
                  value={jobData.rig || ''}
                  onChange={(e) => setJobData({ ...jobData, rig: e.target.value })}
                  className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-bold text-slate-800 w-48 shadow-2xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center">
                <label className="w-28 font-bold text-slate-700 text-right pr-3">Well:</label>
                <input
                  type="text"
                  value={jobData.well || ''}
                  onChange={(e) => setJobData({ ...jobData, well: e.target.value })}
                  className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-bold text-slate-800 w-48 shadow-2xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center">
                <label className="w-28 font-bold text-slate-700 text-right pr-3">Field:</label>
                <input
                  type="text"
                  value={jobData.field || 'ASAB'}
                  onChange={(e) => setJobData({ ...jobData, field: e.target.value })}
                  className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-medium text-slate-800 w-48 shadow-2xs focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Right Column: Client, Contract, Contract No, Save Button */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center flex-1">
                  <label className="w-28 font-bold text-slate-700 text-right pr-3">Client:</label>
                  <select
                    value={jobData.client || 'ADNOC ONSHORE'}
                    onChange={(e) => setJobData({ ...jobData, client: e.target.value })}
                    className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-bold text-slate-800 w-64 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="ADNOC ONSHORE">ADNOC ONSHORE</option>
                    <option value="ADNOC OFFSHORE">ADNOC OFFSHORE</option>
                    <option value="ADNOC DRILLING">ADNOC DRILLING</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleSaveJobHeader}
                  className="bg-[#386cb0] hover:bg-[#2c568f] text-white font-bold text-xs px-3.5 py-1 rounded shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>💾</span>
                  <span>Save Record</span>
                </button>
              </div>

              <div className="flex items-center">
                <label className="w-28 font-bold text-slate-700 text-right pr-3">Contract:</label>
                <select
                  value={jobData.contract || 'ADNOC ONSHORE - RENTALS'}
                  onChange={(e) => setJobData({ ...jobData, contract: e.target.value })}
                  className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-medium text-slate-800 w-64 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ADNOC ONSHORE - RENTALS">ADNOC ONSHORE - RENTALS</option>
                  <option value="ADNOC OFFSHORE - RENTALS">ADNOC OFFSHORE - RENTALS</option>
                  <option value="SCHEDULE 2 RENTALS">SCHEDULE 2 RENTALS</option>
                </select>
              </div>

              <div className="flex items-center">
                <label className="w-28 font-bold text-slate-700 text-right pr-3">Contract No:</label>
                <input
                  type="text"
                  value={jobData.contractNo || jobData.contract || '4700023861'}
                  onChange={(e) => setJobData({ ...jobData, contractNo: e.target.value })}
                  className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-mono font-bold text-slate-800 w-64 shadow-2xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Status / Fleet indicators */}
              <div className="flex items-center gap-2 pt-1 pl-28 flex-wrap">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                  Dispatched Tools: {totalDispatched}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Returned: {totalReturned}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                  Active Tools: {activeOnRig}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-900 border border-purple-300">
                  Crew on Rig: {assignedCrew.filter(c => c.status.includes('Rig')).length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* TAB 1: JOB HEADER & NOTES */}
        {activeTab === 'job-header' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notes &amp; Operational Log:</label>
              <textarea
                rows={12}
                value={jobData.notes || ''}
                onChange={(e) => setJobData({ ...jobData, notes: e.target.value })}
                placeholder="Enter job notes, instructions, well history, and operational remarks here..."
                className="w-full bg-white border border-[#9fb6cf] rounded p-3 text-xs text-slate-800 leading-relaxed font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveJobHeader}
                className="bg-[#386cb0] hover:bg-[#2c568f] text-white font-bold text-xs px-4 py-1.5 rounded shadow-sm transition cursor-pointer flex items-center gap-1.5"
              >
                <span>💾</span>
                <span>Save Job Notes</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: TECHNICAL DETAILS */}
        {activeTab === 'technical-details' && (
          <div className="space-y-3">
            <div className="flex border-b border-slate-300 gap-1 pb-1">
              {[
                { key: 'fishing', label: 'Fishing' },
                { key: 'whipstock', label: 'Whipstock' },
                { key: 'rentals', label: 'Rentals' },
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setTechSubTab(s.key as any)}
                  className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
                    techSubTab === s.key
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Sub-Tab 1: Fishing */}
            {techSubTab === 'fishing' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center">
                    <label className="w-24 font-bold text-slate-700">Casing:</label>
                    <input
                      type="text"
                      value={jobData.technicalDetails?.casing || ''}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: { ...jobData.technicalDetails, casing: e.target.value },
                        })
                      }
                      placeholder='e.g. 9-5/8"'
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-48 shadow-2xs"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="w-24 font-bold text-slate-700">Csg ppf:</label>
                    <input
                      type="text"
                      value={jobData.technicalDetails?.csgPpf || ''}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: { ...jobData.technicalDetails, csgPpf: e.target.value },
                        })
                      }
                      placeholder="e.g. 47#"
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-48 shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Scope of Work:</label>
                  <textarea
                    rows={8}
                    value={jobData.technicalDetails?.scopeOfWork || ''}
                    onChange={(e) =>
                      setJobData({
                        ...jobData,
                        technicalDetails: { ...jobData.technicalDetails, scopeOfWork: e.target.value },
                      })
                    }
                    placeholder="Enter fishing scope of work, fish specifications, depth, and target fish description..."
                    className="w-full bg-white border border-[#9fb6cf] rounded p-2.5 text-xs text-slate-800 font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Sub-Tab 2: Whipstock */}
            {techSubTab === 'whipstock' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center">
                    <label className="w-28 font-bold text-slate-700">Casing:</label>
                    <input
                      type="text"
                      value={jobData.technicalDetails?.casing || ''}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: { ...jobData.technicalDetails, casing: e.target.value },
                        })
                      }
                      placeholder='e.g. 7"'
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-48 shadow-2xs"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="w-28 font-bold text-slate-700">Csg ppf:</label>
                    <input
                      type="text"
                      value={jobData.technicalDetails?.csgPpf || ''}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: { ...jobData.technicalDetails, csgPpf: e.target.value },
                        })
                      }
                      placeholder="e.g. 29#"
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-48 shadow-2xs"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="w-28 font-bold text-slate-700">Inclination:</label>
                    <input
                      type="text"
                      value={jobData.technicalDetails?.inclination || ''}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: { ...jobData.technicalDetails, inclination: e.target.value },
                        })
                      }
                      placeholder="e.g. 45 deg"
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-48 shadow-2xs"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="w-28 font-bold text-slate-700">Whipstock Type:</label>
                    <select
                      value={jobData.technicalDetails?.whipstockType || 'RETRIEVABLE'}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: {
                            ...jobData.technicalDetails,
                            whipstockType: e.target.value as any,
                          },
                        })
                      }
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs font-bold w-48 shadow-2xs cursor-pointer"
                    >
                      <option value="RETRIEVABLE">1) RETRIEVABLE</option>
                      <option value="PERMANENT">2) PERMANENT</option>
                    </select>
                  </div>
                  <div className="flex items-center">
                    <label className="w-28 font-bold text-slate-700">Setting Depth:</label>
                    <input
                      type="text"
                      value={jobData.technicalDetails?.settingDepth || ''}
                      onChange={(e) =>
                        setJobData({
                          ...jobData,
                          technicalDetails: { ...jobData.technicalDetails, settingDepth: e.target.value },
                        })
                      }
                      placeholder="e.g. 11,250 ft"
                      className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-48 shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Scope of Work:</label>
                  <textarea
                    rows={7}
                    value={jobData.technicalDetails?.scopeOfWork || ''}
                    onChange={(e) =>
                      setJobData({
                        ...jobData,
                        technicalDetails: { ...jobData.technicalDetails, scopeOfWork: e.target.value },
                      })
                    }
                    placeholder="Enter whipstock window milling, anchor setting, and orientation parameters..."
                    className="w-full bg-white border border-[#9fb6cf] rounded p-2.5 text-xs text-slate-800 font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Sub-Tab 3: Rentals */}
            {techSubTab === 'rentals' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[1, 2, 3, 4, 5, 6].map((num) => {
                    const hsKey = `holeSection${num}` as keyof NonNullable<DrillingJob['technicalDetails']>;
                    const csgKey = `casing${num}` as keyof NonNullable<DrillingJob['technicalDetails']>;
                    return (
                      <div key={num} className="flex items-center gap-2">
                        <label className="w-28 font-bold text-slate-700">Hole Section-{num}:</label>
                        <input
                          type="text"
                          value={(jobData.technicalDetails as any)?.[hsKey] || ''}
                          onChange={(e) =>
                            setJobData({
                              ...jobData,
                              technicalDetails: {
                                ...jobData.technicalDetails,
                                [hsKey]: e.target.value,
                              },
                            })
                          }
                          placeholder='e.g. 12-1/4"'
                          className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-28 shadow-2xs"
                        />
                        <label className="font-bold text-slate-600 pl-2">Casing:</label>
                        <input
                          type="text"
                          value={(jobData.technicalDetails as any)?.[csgKey] || ''}
                          onChange={(e) =>
                            setJobData({
                              ...jobData,
                              technicalDetails: {
                                ...jobData.technicalDetails,
                                [csgKey]: e.target.value,
                              },
                            })
                          }
                          placeholder='e.g. 9-5/8"'
                          className="bg-white border border-[#9fb6cf] rounded px-2 py-0.5 text-xs w-28 shadow-2xs"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Scope of work:</label>
                  <textarea
                    rows={6}
                    value={jobData.technicalDetails?.scopeOfWork || ''}
                    onChange={(e) =>
                      setJobData({
                        ...jobData,
                        technicalDetails: { ...jobData.technicalDetails, scopeOfWork: e.target.value },
                      })
                    }
                    placeholder="Enter rental tools scope of work, stabilizer placement, jar requirements..."
                    className="w-full bg-white border border-[#9fb6cf] rounded p-2.5 text-xs text-slate-800 font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveJobHeader}
                className="bg-[#386cb0] hover:bg-[#2c568f] text-white font-bold text-xs px-4 py-1.5 rounded shadow-sm transition cursor-pointer flex items-center gap-1.5"
              >
                <span>💾</span>
                <span>Save Technical Details</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: MANPOWER / CREW (NEW DEDICATED SCREEN) */}
        {activeTab === 'manpower' && (
          <div className="space-y-3">
            <div className="bg-[#f8fafc] border border-[#b8cce0] rounded p-3 text-xs flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div>
                <h3 className="font-bold text-[#1a3055] text-sm">Field Engineers &amp; Rig Crew Assignment</h3>
                <div className="text-slate-500 text-[11px]">
                  Mobilize certified fishing engineers, whipstock specialists, and rig tool supervisors for Rig <strong>{jobData.rig}</strong>.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPersonnelSelectOpen(true)}
                  className="bg-[#107c41] hover:bg-[#0c6233] text-white font-bold text-xs px-3.5 py-1.5 rounded-full shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>➕</span>
                  <span>Select Personnel / Crew</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintTicket('pob')}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs px-3 py-1.5 rounded transition cursor-pointer"
                >
                  Print POB / Manifest
                </button>
              </div>
            </div>

            {/* Crew Members Table */}
            <div className="border border-[#b8cce0] rounded overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px]">
                  <tr>
                    <th className="p-1.5 text-center w-12">Seq</th>
                    <th className="p-1.5">Badge #</th>
                    <th className="p-1.5">Engineer / Supervisor Name</th>
                    <th className="p-1.5">Role / Designation</th>
                    <th className="p-1.5 font-mono">Mob Date</th>
                    <th className="p-1.5 font-mono">Demob Date</th>
                    <th className="p-1.5 text-center">Ops Days</th>
                    <th className="p-1.5 text-center">Stdby</th>
                    <th className="p-1.5 text-right font-mono">Day Rate ($)</th>
                    <th className="p-1.5 text-right font-mono">Total ($)</th>
                    <th className="p-1.5">Rig Pass / Cert</th>
                    <th className="p-1.5 text-center">Status</th>
                    <th className="p-1.5 text-center w-20">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {assignedCrew.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="p-6 text-center text-slate-500 font-medium">
                        No field engineers assigned to this job yet. Click <strong>&quot;Select Personnel / Crew&quot;</strong> above to assign certified crew members.
                      </td>
                    </tr>
                  ) : (
                    assignedCrew.map((c, idx) => (
                      <tr key={c.id || idx} className="hover:bg-blue-50/50 h-7 leading-none">
                        <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{idx + 1}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{c.badgeNo}</td>
                        <td className="py-1 px-2 whitespace-nowrap truncate max-w-[180px] font-bold text-blue-900" title={c.name}>{c.name}</td>
                        <td className="py-1 px-2 whitespace-nowrap truncate max-w-[200px] text-slate-700" title={c.designation}>{c.designation}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px]">{c.mobDate || '15-May-2023'}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-500">{c.demobDate || '— (Active)'}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-emerald-800">{c.operatingDays || 0}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-blue-800">{c.standbyDays || 0}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-right font-mono text-slate-800">${c.dailyRateUSD.toFixed(2)}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-right font-mono font-bold text-slate-900">${(c.totalChargeUSD || ((c.operatingDays + c.standbyDays) * c.dailyRateUSD)).toLocaleString()}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-blue-700">{c.rigPassNo || 'RP-88421'}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.status.includes('Rig')
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="py-1 px-2 whitespace-nowrap text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteCrewMember(c.id)}
                            className="text-red-600 hover:text-red-800 font-bold text-[11px] hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Crew Billing Summary Bar */}
            <div className="bg-[#1a3055] text-white p-2.5 rounded flex items-center justify-between text-xs font-medium">
              <div>
                Total Assigned Personnel: <strong className="text-amber-400 font-mono font-bold">{assignedCrew.length} Engineers</strong>
              </div>
              <div>
                Active on Rig: <strong className="text-emerald-400 font-mono font-bold">{assignedCrew.filter(c => c.status.includes('Rig')).length}</strong>
              </div>
              <div>
                Total Crew Billing Accrual:{' '}
                <strong className="text-white font-mono font-bold text-sm">
                  ${assignedCrew.reduce((acc, c) => acc + (c.totalChargeUSD || ((c.operatingDays + c.standbyDays) * c.dailyRateUSD)), 0).toLocaleString()} USD
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CHECKLISTHEADER / TOOLS CHECK LIST */}
        {activeTab === 'checklist' && (
          <div className="space-y-3">
            <div className="bg-[#f8fafc] border border-[#b8cce0] rounded p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-bold text-[#1a3055]">Tools Check List</h2>
                  <span className="text-xs text-slate-500 font-mono">
                    Ticket No: <strong className="text-red-600 font-bold text-sm">{activeCallout.ticketNo || '2266'}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
                    {activeCallout.status || 'Checklist - Opened'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsToolSelectOpen(true)}
                    className="bg-[#107c41] hover:bg-[#0c6233] text-white font-bold text-xs px-3 py-1 rounded-full shadow-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>➕</span>
                    <span>Select Tools</span>
                  </button>

                  {/* AUTOMATED BRIDGE: Generate Delivery Ticket (DT) directly from Checklist */}
                  <button
                    type="button"
                    onClick={handleGenerateDTFromChecklist}
                    className="bg-blue-800 hover:bg-blue-900 text-white font-bold text-xs px-3.5 py-1 rounded shadow-xs transition cursor-pointer flex items-center gap-1.5"
                    title="Transfer reserved checklist tools directly into a new Delivery Ticket"
                  >
                    <span>🚚</span>
                    <span>Generate DT from Checklist</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrintTicket('report')}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs px-2.5 py-1 rounded transition cursor-pointer"
                  >
                    PRINT REPORT
                  </button>
                </div>
              </div>

              {/* Checklist Field Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="font-bold text-slate-600">Req Date:</span>{' '}
                  <span className="font-mono">{activeCallout.reqDate || '03-Oct-26'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600">Callout No:</span>{' '}
                  <span className="font-mono font-bold text-blue-800">{activeCallout.id}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600">Project No:</span>{' '}
                  <span className="font-mono">{activeCallout.projectNo || jobData.contractNo || '4700012465'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600">PO Number:</span>{' '}
                  <span className="font-mono">{jobData.poNumber || '—'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600">Rig:</span>{' '}
                  <span className="font-bold">{jobData.rig}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600">Well:</span>{' '}
                  <span>{jobData.well}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600">Email Ref:</span>{' '}
                  <span>{activeCallout.emailRef || 'ADNOC Request'}</span>
                </div>
              </div>
            </div>

            {/* Checklist Table */}
            <div className="border border-[#b8cce0] rounded overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px]">
                  <tr>
                    <th className="p-1.5 text-center w-12">ItemNo</th>
                    <th className="p-1.5">PartNo</th>
                    <th className="p-1.5">Description</th>
                    <th className="p-1.5 text-center w-14">DTQTY</th>
                    <th className="p-1.5">Supplier</th>
                    <th className="p-1.5 text-center w-14">QTYIN</th>
                    <th className="p-1.5">INS_NUM</th>
                    <th className="p-1.5">INS_DATE</th>
                    <th className="p-1.5">Comments</th>
                    <th className="p-1.5">Category</th>
                    <th className="p-1.5 text-center w-16">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {checklistItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-slate-500 font-medium">
                        No tools in checklist. Click <strong>&quot;Select Tools&quot;</strong> above to pick available tools from yard inventory.
                      </td>
                    </tr>
                  ) : (
                    checklistItems.map((item, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 h-7 leading-none">
                        <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{i + 1}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{item.partNo || item.serialNos?.[0] || '—'}</td>
                        <td className="py-1 px-2 whitespace-nowrap truncate max-w-[320px] font-medium text-slate-800" title={item.description || item.shortDesc}>{item.description || item.shortDesc}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-center font-bold">{item.qty || 1}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-medium text-slate-700">{item.supplier || 'EMDAD'}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-center font-bold">{item.qtyIn || 1}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-blue-700">{item.insNum || 'GIS-Z-01480-2023'}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">{item.insDate || '09-May-23'}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-bold text-emerald-700">{item.comments || 'ACCEPTED'}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-[11px] text-slate-600">{item.cat || item.shortDesc}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteChecklistRow(item.seq)}
                            className="text-red-600 hover:text-red-800 font-bold text-[11px] hover:underline cursor-pointer"
                            title="Delete row and return tool to inventory"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: DELIVERY TICKET HEADER / RENTAL TICKET */}
        {activeTab === 'delivery-tickets' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-300 pb-2">
              <div className="flex items-center gap-1 overflow-x-auto">
                <span className="text-xs font-bold text-slate-600 mr-2">Dispatched Tickets:</span>
                {jobDTs.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">No delivery tickets yet.</span>
                ) : (
                  jobDTs.map((dt) => (
                    <button
                      key={dt.dtNumber}
                      type="button"
                      onClick={() => setSelectedDTNumber(dt.dtNumber)}
                      className={`px-3 py-1 text-xs font-mono font-bold rounded transition cursor-pointer ${
                        selectedDTNumber === dt.dtNumber
                          ? 'bg-blue-800 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {dt.dtNumber} ({dt.toolLines?.length || 0} tools)
                    </button>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintTicket('onshore')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-2.5 py-1 rounded border border-slate-300"
                >
                  Print Onshore Ticket
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintTicket('offshore')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-2.5 py-1 rounded border border-slate-300"
                >
                  Print Offshore Ticket
                </button>
              </div>
            </div>

            {/* Rental Ticket Form / Details */}
            {activeDT ? (
              <div className="space-y-3">
                <div className="bg-[#f0f5fb] border border-[#b8cce0] rounded p-3 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                    <h3 className="font-bold text-blue-900 text-sm">Rental Ticket / Delivery Manifest</h3>
                    <span className="text-xs font-mono">
                      Ticket No : <strong className="text-red-600 font-bold text-base">{activeDT.dtNumber}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <span className="font-bold text-slate-600">Customer:</span>{' '}
                      <span className="font-bold">{jobData.client}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-600">Project No:</span>{' '}
                      <span className="font-mono">{jobData.contractNo || '444558'}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-600">Purpose:</span>{' '}
                      <span>{jobData.jobDescription || 'Fishing'}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-600">Rig:</span>{' '}
                      <span className="font-bold">{jobData.rig}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-600">Job Number:</span>{' '}
                      <span className="font-mono font-bold text-blue-800">{jobData.id}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-600">Well:</span>{' '}
                      <span>{jobData.well}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-600">DateShipped:</span>{' '}
                      <span className="font-mono">{activeDT.dispatchDate || '25-Aug-23'}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-600">RM Ref / Manifest:</span>{' '}
                      <span className="font-mono">{activeDT.rmRef || 'MR'}</span>
                    </div>
                  </div>
                </div>

                {/* Mobilized Tools Table */}
                <div className="border border-[#b8cce0] rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px]">
                      <tr>
                        <th className="p-1.5 text-center w-12">ItemNo</th>
                        <th className="p-1.5">PartNo</th>
                        <th className="p-1.5">Description</th>
                        <th className="p-1.5 text-center w-14">DTQTY</th>
                        <th className="p-1.5">DATEOUT</th>
                        <th className="p-1.5">Job Number</th>
                        <th className="p-1.5">RGT_No</th>
                        <th className="p-1.5">Date_In</th>
                        <th className="p-1.5">Supplier</th>
                        <th className="p-1.5">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeDT.toolLines?.map((t, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/50 h-7 leading-none">
                          <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{idx + 1}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{t.serial || t.assetNo}</td>
                          <td className="py-1 px-2 whitespace-nowrap truncate max-w-[340px] font-medium text-slate-800" title={t.desc || t.shortDesc}>{t.desc || t.shortDesc}</td>
                          <td className="py-1 px-2 whitespace-nowrap text-center font-bold">{t.qty || 1}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">{activeDT.dispatchDate || '25-Aug-23'}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono text-blue-700">{jobData.id}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono text-slate-500">{t.rtBatchId || '—'}</td>
                          <td className="py-1 px-2 whitespace-nowrap font-mono text-slate-500">—</td>
                          <td className="py-1 px-2 whitespace-nowrap text-slate-700">{t.ownership || 'EMDAD'}</td>
                          <td className="py-1 px-2 whitespace-nowrap text-slate-600 text-[11px]">{t.shortDesc || 'Downhole Tool'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Logistics fields */}
                <div className="bg-[#f8fafc] border border-slate-300 rounded p-3 text-xs grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <div>
                      <span className="font-bold text-slate-700">Prepared By:</span>{' '}
                      <input
                        type="text"
                        defaultValue={activeDT.dispatchedBy || 'RAGHUNATH'}
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-40 ml-1 text-xs"
                      />
                    </div>
                    <div>
                      <span className="font-bold text-slate-700">Designation:</span>{' '}
                      <span className="font-mono text-slate-600">WORKSHOP COORDINATOR</span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <input type="checkbox" defaultChecked id="readyToGo" className="rounded" />
                      <label htmlFor="readyToGo" className="font-bold text-blue-900 cursor-pointer">
                        Ready to Go
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div>
                      <span className="font-bold text-slate-700">Delivered To:</span>{' '}
                      <input
                        type="text"
                        defaultValue="ESNAD JETTY"
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-44 ml-1 text-xs"
                      />
                    </div>
                    <div>
                      <span className="font-bold text-slate-700">Vessel:</span>{' '}
                      <input
                        type="text"
                        defaultValue="ZAKHER STAR"
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-44 ml-1 text-xs"
                      />
                    </div>
                    <div>
                      <span className="font-bold text-slate-700">Transport:</span>{' '}
                      <input
                        type="text"
                        defaultValue="EMDAD"
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-44 ml-1 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div>
                      <span className="font-bold text-slate-700">Vehicle No:</span>{' '}
                      <input
                        type="text"
                        defaultValue="54912"
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-36 ml-1 text-xs"
                      />
                    </div>
                    <div>
                      <span className="font-bold text-slate-700">Driver Name:</span>{' '}
                      <input
                        type="text"
                        defaultValue="LUQMAN KHAN"
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-36 ml-1 text-xs"
                      />
                    </div>
                    <div>
                      <span className="font-bold text-slate-700">Contact No:</span>{' '}
                      <input
                        type="text"
                        defaultValue="+971565256707"
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 w-36 ml-1 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 font-medium">
                No Delivery Tickets issued yet for Job {jobData.id}.
              </div>
            )}
          </div>
        )}

        {/* TAB 6: RETURN GOODS TICKET (RGT / RT) */}
        {activeTab === 'return-tickets' && (
          <div className="space-y-3">
            <div className="bg-[#f0f5fb] border border-[#b8cce0] rounded p-3 text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="font-bold text-blue-900 text-sm">RETURN GOODS TICKET</h3>
                <span className="text-xs font-mono">
                  TicketNo: <strong className="text-red-600 font-bold text-base">{activeRT?.rtNumber || '1555'}</strong>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePrintTicket('onshore')}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-2.5 py-1 rounded border border-slate-300"
                  >
                    Onshore ticket
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintTicket('offshore')}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs px-2.5 py-1 rounded border border-slate-300"
                  >
                    Offshore ticket
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="font-bold text-slate-600">Date:</span>{' '}
                  <span className="font-mono">{activeRT?.rtDate || '26-Aug-23'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600">Shipped Via:</span>{' '}
                  <span>EMDAD</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600">L/Note Date:</span>{' '}
                  <span className="font-mono">24-Aug-23</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600">L/Note No:</span>{' '}
                  <span className="font-mono">144781</span>
                </div>
              </div>
            </div>

            {/* Upper Table: Tools in active RT */}
            <div className="border border-[#b8cce0] rounded overflow-hidden">
              <div className="bg-slate-100 px-3 py-1 border-b border-slate-200 font-bold text-xs text-slate-700 flex justify-between">
                <span>Received Tools in Return Ticket</span>
                <span className="text-emerald-700">Total Returned: {activeRT?.toolLines?.length || 0} tools</span>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#b8cce0] font-bold text-[11px]">
                  <tr>
                    <th className="p-1.5 text-center w-12">ItemNo</th>
                    <th className="p-1.5">PartNo</th>
                    <th className="p-1.5">Description</th>
                    <th className="p-1.5 text-center">RGT_No</th>
                    <th className="p-1.5">Date_In</th>
                    <th className="p-1.5">Comments (Condition)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(!activeRT || !activeRT.toolLines || activeRT.toolLines.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-500">
                        No returned tools added to this ticket yet. Select tools from the lower DT section below and click &quot;Enter / Move to RT&quot;.
                      </td>
                    </tr>
                  ) : (
                    activeRT.toolLines.map((t, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/50 h-7 leading-none">
                        <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{idx + 1}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{t.serial || t.assetNo}</td>
                        <td className="py-1 px-2 whitespace-nowrap truncate max-w-[340px] font-medium text-slate-800" title={t.desc || t.shortDesc}>{t.desc || t.shortDesc}</td>
                        <td className="py-1 px-2 whitespace-nowrap text-center font-mono font-bold text-blue-800">{activeRT.rtNumber}</td>
                        <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">{activeRT.rtDate || '24-Aug-23'}</td>
                        <td className="py-1 px-2 whitespace-nowrap">
                          <select
                            defaultValue={t.used ? 'USED' : 'NOT USED'}
                            className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-slate-800 cursor-pointer"
                          >
                            <option value="USED">USED</option>
                            <option value="NOT USED">NOT USED</option>
                            <option value="DAMAGED">DAMAGED</option>
                            <option value="LOST IN HOLE">LOST IN HOLE (LIH)</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Lower Section: Search DT No & Select Tools to Move to RT */}
            <div className="bg-[#fffbeb] border border-[#fde68a] rounded p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-amber-900">Search DT No:</span>
                  <select
                    value={rgtSearchDTNo}
                    onChange={(e) => setRgtSearchDTNo(e.target.value)}
                    className="bg-white border border-amber-300 rounded px-2 py-0.5 text-xs font-mono font-bold text-slate-800 cursor-pointer"
                  >
                    {jobDTs.map((d) => (
                      <option key={d.dtNumber} value={d.dtNumber}>
                        {d.dtNumber} ({d.toolLines?.length || 0} tools dispatched)
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-amber-800">
                    &larr; Select DT dispatched to this rig to pick backloaded tools
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleMoveToolsToRT}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1 rounded shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>⬇️</span>
                  <span>Enter / Move to RT Details</span>
                </button>
              </div>

              {/* Lower DT Table: Tools from the selected DT */}
              <div className="border border-amber-200 rounded overflow-hidden bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-amber-100/70 text-amber-950 font-bold text-[11px]">
                    <tr>
                      <th className="p-1.5 text-center w-12">TicketNo</th>
                      <th className="p-1.5 text-center w-12">ItemNo</th>
                      <th className="p-1.5">PartNo / Serial</th>
                      <th className="p-1.5">Description</th>
                      <th className="p-1.5 text-center w-14">DTQTY</th>
                      <th className="p-1.5 text-center w-16">Ret_ [✓]</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {rgtDTToolsToReturn.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-slate-500">
                          No tools available for return in selected DT.
                        </td>
                      </tr>
                    ) : (
                      rgtDTToolsToReturn.map((t, idx) => {
                        const isChecked = rgtCheckedSerials.includes(t.serial);
                        return (
                          <tr key={idx} className={`h-7 leading-none ${isChecked ? 'bg-amber-100/80 font-semibold' : 'hover:bg-slate-50'}`}>
                            <td className="py-1 px-2 whitespace-nowrap text-center font-mono text-slate-600">{rgtSearchDTNo}</td>
                            <td className="py-1 px-2 whitespace-nowrap text-center font-bold text-slate-600">{idx + 1}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{t.serial}</td>
                            <td className="py-1 px-2 whitespace-nowrap truncate max-w-[340px] font-medium text-slate-800" title={t.desc || t.shortDesc}>{t.desc || t.shortDesc}</td>
                            <td className="py-1 px-2 whitespace-nowrap text-center font-bold">{t.qty || 1}</td>
                            <td className="py-1 px-2 whitespace-nowrap text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setRgtCheckedSerials((prev) => [...prev, t.serial]);
                                  } else {
                                    setRgtCheckedSerials((prev) => prev.filter((s) => s !== t.serial));
                                  }
                                }}
                                className="cursor-pointer"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: UTILIZATION */}
        {activeTab === 'utilization' && (
          <div className="space-y-3">
            <div className="bg-[#1a3055] text-white p-3 rounded text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <span className="text-slate-300">RIG / WELL:</span>{' '}
                <strong className="text-amber-400 font-mono">{jobData.rig} / {jobData.well}</strong>
              </div>
              <div>
                <span className="text-slate-300">CLIENT:</span>{' '}
                <strong className="text-white">{jobData.client}</strong>
              </div>
              <div>
                <span className="text-slate-300">CONTRACT:</span>{' '}
                <strong className="text-white">{jobData.contractNo || jobData.contract}</strong>
              </div>
              <div>
                <span className="text-slate-300">TOTAL BILLING ACCRUAL:</span>{' '}
                <strong className="text-emerald-400 font-mono">
                  ${(
                    208750 / 3.6725 +
                    assignedCrew.reduce((acc, c) => acc + (c.totalChargeUSD || ((c.operatingDays + c.standbyDays) * c.dailyRateUSD)), 0)
                  ).toLocaleString('en-US', { maximumFractionDigits: 0 })} USD
                </strong>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs py-1">
              <div className="flex items-center gap-2">
                <span className="font-bold">Year: 2026</span>
                <span className="font-bold">Month: September</span>
                <span className="text-slate-500 ml-4 font-mono text-[11px]">(Legend: 1 = Ops, S = Standby)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="bg-emerald-700 text-white font-bold text-xs px-3 py-1 rounded"
                >
                  ✓ Signed Log Attached
                </button>
                <button
                  type="button"
                  className="bg-slate-200 text-slate-800 font-bold text-xs px-3 py-1 rounded"
                >
                  Export XLSX
                </button>
              </div>
            </div>

            {/* Calendar Table Preview */}
            <div className="border border-slate-300 rounded overflow-x-auto">
              <table className="w-full text-left text-[11px] border-collapse min-w-[900px]">
                <thead className="bg-slate-800 text-white font-bold">
                  <tr>
                    <th className="p-1 text-center w-8">#</th>
                    <th className="p-1">DT NO</th>
                    <th className="p-1">DEL DATE</th>
                    <th className="p-1">ASSET NUMBER</th>
                    <th className="p-1">DESCRIPTION</th>
                    <th className="p-1 text-center">QTY</th>
                    <th className="p-1 text-center">STATUS</th>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((d) => (
                      <th key={d} className="p-1 text-center w-6">{d}</th>
                    ))}
                    <th className="p-1 text-center bg-blue-900">SB DAYS</th>
                    <th className="p-1 text-center bg-emerald-900">OPS DAYS</th>
                    <th className="p-1 text-right bg-slate-900 pr-2">TOTAL (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {jobDTs.flatMap((d) => d.toolLines || []).slice(0, 8).map((t, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/50">
                      <td className="p-1 text-center font-mono">{idx + 1}</td>
                      <td className="p-1 font-mono text-blue-700">{jobDTs[0]?.dtNumber || 'DT-85161'}</td>
                      <td className="p-1 font-mono">{formatDateDDMMYYYY(jobDTs[0]?.dispatchDate) || '01/09/2026'}</td>
                      <td className="p-1 font-mono font-bold">{t.serial}</td>
                      <td className="p-1 truncate max-w-[200px]">{t.desc || t.shortDesc}</td>
                      <td className="p-1 text-center font-bold">1</td>
                      <td className="p-1 text-center">
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                          On Rig
                        </span>
                      </td>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((day) => (
                        <td key={day} className="p-1 text-center font-mono font-bold text-slate-700">
                          {day <= 3 ? 'S' : day <= 10 ? '1' : ''}
                        </td>
                      ))}
                      <td className="p-1 text-center font-bold text-blue-800">3</td>
                      <td className="p-1 text-center font-bold text-emerald-800">7</td>
                      <td className="p-1 text-right font-mono font-bold pr-2">10,950</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* PERSONNELSELECT MODAL (Matches MS Access itemsselect exactly) */}
      {isPersonnelSelectOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div
            className="bg-[#dce6f1] border-2 border-[#1a3055] rounded-md shadow-2xl w-full max-w-4xl h-[620px] max-h-[92vh] flex flex-col overflow-hidden"
            style={{ fontFamily: "'Calibri', 'Arial Nova', 'Segoe UI', Arial, sans-serif", fontSize: '9pt' }}
          >
            <div className="bg-[#1a3055] text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold flex-shrink-0">
              <div className="flex items-center gap-2">
                <span>personnelselect &bull; Field Crew Assignment Picker</span>
              </div>
              <button
                type="button"
                onClick={() => setIsPersonnelSelectOpen(false)}
                className="text-white hover:text-amber-300 font-bold text-base cursor-pointer px-1"
              >
                &times;
              </button>
            </div>

            <div className="p-3 flex-1 flex flex-col min-h-0 space-y-2.5">
              <div className="bg-white border border-[#9fb6cf] rounded p-2 flex flex-wrap items-center justify-between gap-3 shadow-2xs flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <label className="font-extrabold text-slate-800 uppercase tracking-tight text-[11px]">ROLE / DESIGNATION :</label>
                  <select
                    value={selectedPersonnelRole}
                    onChange={(e) => setSelectedPersonnelRole(e.target.value)}
                    className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-800 w-64 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                  >
                    {availablePersonnelRoles.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div className="text-[11px] text-slate-600 font-medium">
                  Available in Role: <strong className="text-slate-900">{filteredPersonnelRoster.length}</strong>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded px-2.5 py-1 text-[11px] text-blue-900 leading-tight flex-shrink-0">
                Based on role selection, available certified engineers and supervisors show below. Select with checkbox and click <strong>&quot;Insert Selected Personnel&quot;</strong> to mobilize personnel to Rig {jobData.rig} for Job {jobData.id}.
              </div>

              {/* Personnel Table - Fixed height container with scrolling so window never jumps */}
              <div className="flex-1 min-h-0 bg-white border border-[#9fb6cf] rounded overflow-y-auto shadow-inner">
                <table className="w-full text-left border-collapse text-[11.5px]">
                  <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#9fb6cf] font-bold text-[11px] sticky top-0 z-10 shadow-2xs">
                    <tr>
                      <th className="py-1 px-2 whitespace-nowrap">Badge #</th>
                      <th className="py-1 px-2 whitespace-nowrap">Engineer Name</th>
                      <th className="py-1 px-2 whitespace-nowrap">Designation</th>
                      <th className="py-1 px-2 whitespace-nowrap">Rig Pass #</th>
                      <th className="py-1 px-2 whitespace-nowrap font-mono">H2S Expiry</th>
                      <th className="py-1 px-2 whitespace-nowrap font-mono text-right">Daily Rate ($)</th>
                      <th className="py-1 px-2 whitespace-nowrap text-center">Status</th>
                      <th className="py-1 px-2 whitespace-nowrap text-center w-14">select [✓]</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredPersonnelRoster.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">
                          No personnel found for role: <strong>{selectedPersonnelRole}</strong>.
                        </td>
                      </tr>
                    ) : (
                      filteredPersonnelRoster.map((p) => {
                        const isChecked = checkedPersonnelBadges.includes(p.badgeNo);
                        return (
                          <tr
                            key={p.badgeNo}
                            onClick={() => {
                              if (isChecked) {
                                setCheckedPersonnelBadges((prev) => prev.filter((b) => b !== p.badgeNo));
                              } else {
                                setCheckedPersonnelBadges((prev) => [...prev, p.badgeNo]);
                              }
                            }}
                            className={`cursor-pointer transition h-7 leading-none ${
                              isChecked ? 'bg-amber-100/80 font-semibold' : 'hover:bg-blue-50/60'
                            }`}
                          >
                            <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{p.badgeNo}</td>
                            <td className="py-1 px-2 whitespace-nowrap truncate max-w-[200px] font-bold text-blue-900" title={p.name}>{p.name}</td>
                            <td className="py-1 px-2 whitespace-nowrap truncate max-w-[240px] text-slate-700" title={p.designation}>{p.designation}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-blue-700">{p.rigPassNo}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">{p.h2sExpiry}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-right font-bold text-slate-900">${p.dailyRateUSD.toFixed(2)}</td>
                            <td className="py-1 px-2 whitespace-nowrap text-center">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                {p.status}
                              </span>
                            </td>
                            <td className="py-1 px-2 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setCheckedPersonnelBadges((prev) => [...prev, p.badgeNo]);
                                  } else {
                                    setCheckedPersonnelBadges((prev) => prev.filter((b) => b !== p.badgeNo));
                                  }
                                }}
                                className="cursor-pointer"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer - Single clean Insert Button */}
              <div className="flex items-center justify-between pt-1 flex-shrink-0">
                <span className="text-slate-600 text-[11px]">
                  Total certified personnel: <strong>{filteredPersonnelRoster.length}</strong> | Selected: <strong className="text-blue-900">{checkedPersonnelBadges.length}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPersonnelSelectOpen(false)}
                    className="px-3.5 py-1 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertSelectedPersonnel}
                    disabled={checkedPersonnelBadges.length === 0}
                    className="px-5 py-1 rounded bg-[#107c41] hover:bg-[#0c6233] disabled:opacity-50 text-white font-bold shadow-xs cursor-pointer text-xs flex items-center gap-1.5"
                  >
                    <span>Insert Selected Personnel ({checkedPersonnelBadges.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ITEMSSELECT TOOL PICKER MODAL */}
      {isToolSelectOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div
            className="bg-[#dce6f1] border-2 border-[#1a3055] rounded-md shadow-2xl w-full max-w-4xl h-[620px] max-h-[92vh] flex flex-col overflow-hidden"
            style={{ fontFamily: "'Calibri', 'Arial Nova', 'Segoe UI', Arial, sans-serif", fontSize: '9pt' }}
          >
            <div className="bg-[#1a3055] text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold flex-shrink-0">
              <div className="flex items-center gap-2">
                <span>itemsselect &bull; Tool Assignment Picker</span>
              </div>
              <button
                type="button"
                onClick={() => setIsToolSelectOpen(false)}
                className="text-white hover:text-amber-300 font-bold text-base cursor-pointer px-1"
              >
                &times;
              </button>
            </div>

            <div className="p-3 flex-1 flex flex-col min-h-0 space-y-2.5">
              {/* Category & Size Selection - Single line filter, duplicate insert button removed */}
              <div className="bg-white border border-[#9fb6cf] rounded p-2 flex flex-wrap items-center justify-between gap-3 shadow-2xs flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <label className="font-extrabold text-slate-800 uppercase tracking-tight text-[11px]">CATEGORY :</label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => {
                        setSelectedCategory(e.target.value);
                        setSelectedToolSize('');
                      }}
                      className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-slate-800 w-56 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                    >
                      {availableCategories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="font-extrabold text-slate-800 uppercase tracking-tight text-[11px]">TOOL SIZE :</label>
                    <select
                      value={selectedToolSize}
                      onChange={(e) => setSelectedToolSize(e.target.value)}
                      className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-slate-800 w-36 shadow-2xs cursor-pointer focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">All Sizes</option>
                      {availableSizes.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 font-medium">
                  Available in Category: <strong className="text-slate-900">{modalAvailableTools.length}</strong>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded px-2.5 py-1 text-[11px] text-blue-900 leading-tight flex-shrink-0">
                Based on category selection, the size shows in second dropdown against available stock. Select with checkbox and click <strong>&quot;Insert Selected Tools&quot;</strong> to reserve tools for Job {jobData.id}.
              </div>

              {/* Tools Table - Fixed height container with scrolling so window height never changes */}
              <div className="flex-1 min-h-0 bg-white border border-[#9fb6cf] rounded overflow-y-auto shadow-inner">
                <table className="w-full text-left border-collapse text-[11.5px]">
                  <thead className="bg-[#e9f0f8] text-[#1a3055] border-b border-[#9fb6cf] font-bold text-[11px] sticky top-0 z-10 shadow-2xs">
                    <tr>
                      <th className="py-1 px-2 whitespace-nowrap">PartNo</th>
                      <th className="py-1 px-2 whitespace-nowrap">Description</th>
                      <th className="py-1 px-2 whitespace-nowrap text-center w-14">DTQTY</th>
                      <th className="py-1 px-2 whitespace-nowrap">Supplier</th>
                      <th className="py-1 px-2 whitespace-nowrap">Ins_Date</th>
                      <th className="py-1 px-2 whitespace-nowrap">Ins_Num</th>
                      <th className="py-1 px-2 whitespace-nowrap">Condition</th>
                      <th className="py-1 px-2 whitespace-nowrap text-center w-14">select [✓]</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {modalAvailableTools.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">
                          No available tools found in yard for Category: <strong>{selectedCategory}</strong> {selectedToolSize && `(Size: ${selectedToolSize})`}.
                        </td>
                      </tr>
                    ) : (
                      modalAvailableTools.map((tool) => {
                        const isChecked = checkedToolSerials.includes(tool.serial);
                        return (
                          <tr
                            key={tool.serial}
                            onClick={() => {
                              if (isChecked) {
                                setCheckedToolSerials((prev) => prev.filter((s) => s !== tool.serial));
                              } else {
                                setCheckedToolSerials((prev) => [...prev, tool.serial]);
                              }
                            }}
                            className={`cursor-pointer transition h-7 leading-none ${
                              isChecked ? 'bg-amber-100/80 font-semibold' : 'hover:bg-blue-50/60'
                            }`}
                          >
                            <td className="py-1 px-2 whitespace-nowrap font-mono font-bold text-slate-900">{tool.assetNo || tool.serial}</td>
                            <td className="py-1 px-2 whitespace-nowrap truncate max-w-[340px] font-medium text-slate-800" title={tool.desc || tool.shortDesc}>
                              {tool.desc || tool.shortDesc}
                            </td>
                            <td className="py-1 px-2 whitespace-nowrap text-center font-bold">{tool.qty || 1}</td>
                            <td className="py-1 px-2 whitespace-nowrap text-slate-700">{tool.supplier || (tool.isEmdad ? 'EMDAD' : 'Sub-Contractor')}</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-slate-600">31-Mar-23</td>
                            <td className="py-1 px-2 whitespace-nowrap font-mono text-[11px] text-blue-700">GIS-Z-01073-2023</td>
                            <td className="py-1 px-2 whitespace-nowrap font-bold text-emerald-700">ACCEPTED</td>
                            <td className="py-1 px-2 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setCheckedToolSerials((prev) => [...prev, tool.serial]);
                                  } else {
                                    setCheckedToolSerials((prev) => prev.filter((s) => s !== tool.serial));
                                  }
                                }}
                                className="cursor-pointer"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer - Single clean Insert button next to Cancel */}
              <div className="flex items-center justify-between pt-1 flex-shrink-0">
                <span className="text-slate-700 text-[11px]">
                  Total matching items: <strong>{modalAvailableTools.length}</strong> | Selected: <strong className="text-blue-900">{checkedToolSerials.length}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsToolSelectOpen(false)}
                    className="px-3.5 py-1 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertSelectedTools}
                    disabled={checkedToolSerials.length === 0}
                    className="px-5 py-1 rounded bg-[#107c41] hover:bg-[#0c6233] disabled:opacity-50 text-white font-bold shadow-xs cursor-pointer text-xs flex items-center gap-1.5"
                  >
                    <span>Insert Selected Tools ({checkedToolSerials.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
