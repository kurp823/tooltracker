import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DrillingJob, DTBatch, RTBatch, ToolItem, User } from '../types';
import { formatDateDDMMYY, formatQty } from '../utils';
import * as XLSX from 'xlsx';

interface UtilizationViewProps {
  user?: User | null;
  inventory: ToolItem[];
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches?: RTBatch[];
  onUpdateJob?: (job: DrillingJob) => void;
}

interface ClientRateConfig {
  currency: string;
  standby: number;
  ops: number;
  cap: number | null;
}

const CLIENT_RATES: Record<string, ClientRateConfig> = {
  'AON': { currency: 'USD', standby: 700, ops: 950, cap: 6 },
  'ADNOC Onshore': { currency: 'USD', standby: 700, ops: 950, cap: 6 },
  'ADNOC-D': { currency: 'AED', standby: 850, ops: 1200, cap: null },
  'ADNOC Drilling': { currency: 'AED', standby: 850, ops: 1200, cap: null },
  'AOF': { currency: 'USD', standby: 750, ops: 1050, cap: null },
  'ADNOC Offshore': { currency: 'USD', standby: 750, ops: 1050, cap: null },
  'TWL': { currency: 'USD', standby: 600, ops: 900, cap: null },
  'Turnwell': { currency: 'USD', standby: 600, ops: 900, cap: null },
  'Default': { currency: 'AED', standby: 850, ops: 1200, cap: null },
};

// Tabs: Header, Tools, Man Power, Inventory (No consumables)
export type EpicorTab = 'Header' | 'Tools' | 'Man Power' | 'Inventory';

export interface EpicorLineItem {
  id: string;
  category: 'Tools' | 'Man Power' | 'Inventory';
  lineNo: number;
  dtNumber: string;
  deliveryDate: string;
  assetNumber: string;
  description: string;
  quantity: number;
  status: 'New' | 'On Rig' | 'Returned' | 'Standby' | 'Good';
  rotHours?: string;
  returnDate?: string;
  rtNumber?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Strict date range restriction helper:
 * Updates are ONLY allowed from deliveryDate (start of day) to returnDate/receivingDate (end of day).
 * Beyond these days, user cannot update 'S' or '1' in utilization.
 */
export const isCellDateAllowed = (
  item: EpicorLineItem,
  dateStr: string
): { allowed: boolean; reason?: string } => {
  if (item.deliveryDate && dateStr < item.deliveryDate) {
    return {
      allowed: false,
      reason: `Prior to delivery date (${formatDateDDMMYY(item.deliveryDate)})`,
    };
  }
  if (item.returnDate && item.returnDate.trim() && dateStr > item.returnDate) {
    return {
      allowed: false,
      reason: `After receiving/return date (${formatDateDDMMYY(item.returnDate)})`,
    };
  }
  return { allowed: true };
};

export const UtilizationView: React.FC<UtilizationViewProps> = ({
  user,
  inventory,
  jobs,
  dtBatches,
  rtBatches = [],
  onUpdateJob,
}) => {
  // 1. Active Job
  const [selectedJobId, setSelectedJobId] = useState<string>(jobs[0]?.id || 'JOB-26-00001');
  const currentJob = useMemo(() => {
    return jobs.find((j) => j.id === selectedJobId) || jobs[0];
  }, [jobs, selectedJobId]);

  // Searchable Active Job Combobox
  const [isJobDropdownOpen, setIsJobDropdownOpen] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const jobDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (jobDropdownRef.current && !jobDropdownRef.current.contains(e.target as Node)) {
        setIsJobDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sortedAndFilteredJobs = useMemo(() => {
    let list = [...jobs];
    if (jobSearchQuery.trim()) {
      const q = jobSearchQuery.toLowerCase();
      list = list.filter(
        (j) =>
          j.id.toLowerCase().includes(q) ||
          j.client.toLowerCase().includes(q) ||
          j.rig.toLowerCase().includes(q) ||
          j.well.toLowerCase().includes(q) ||
          (j.poNumber || '').toLowerCase().includes(q) ||
          (j.contract || '').toLowerCase().includes(q)
      );
    }
    const extractSeq = (idStr: string) => {
      const m = idStr.match(/\d+$/);
      return m ? parseInt(m[0], 10) : 0;
    };
    return list.sort((a, b) => extractSeq(a.id) - extractSeq(b.id));
  }, [jobs, jobSearchQuery]);

  // Rate Configuration
  const clientCode = useMemo(() => {
    if (!currentJob) return 'ADNOC-D';
    if (currentJob.client.includes('Drilling')) return 'ADNOC-D';
    if (currentJob.client.includes('Offshore')) return 'AOF';
    if (currentJob.client.includes('Onshore')) return 'AON';
    if (currentJob.client.includes('Turnwell')) return 'TWL';
    return 'ADNOC-D';
  }, [currentJob]);

  const rateConfig: ClientRateConfig =
    CLIENT_RATES[currentJob?.client || ''] || CLIENT_RATES[clientCode] || CLIENT_RATES.Default;

  // 2. Active Tab (Header, Tools, Man Power, Inventory) - Default to Header
  const [activeTab, setActiveTab] = useState<EpicorTab>('Header');

  // 3. Year and Month selector (matching Epicor ERP Screenshot 3: Year: 2026, Month: September)
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(8); // 8 = September (0-indexed)

  const activeYM = useMemo(() => {
    return `${selectedYear}-${pad(selectedMonthIdx + 1)}`;
  }, [selectedYear, selectedMonthIdx]);

  // Days in selected month
  const daysInActiveMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonthIdx + 1, 0).getDate();
  }, [selectedYear, selectedMonthIdx]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');

  // View Mode: 'epicor' (Single selected month tab view) or 'accordion' (Multi-month view, collapsed by default)
  const [viewMode, setViewMode] = useState<'epicor' | 'accordion'>('epicor');
  // All accordion months are collapsed by default as requested!
  const [accordionOpenMonths, setAccordionOpenMonths] = useState<Record<string, boolean>>({});

  // 4. Line Items State: Tools, Man Power, Inventory
  const initialItems = useMemo(() => {
    if (!currentJob) return [];
    const items: EpicorLineItem[] = [];
    const prevYM = '2026-08';
    const curYM = '2026-09';

    // A. Tools (from DTs or demo catalog)
    const jobDTs = dtBatches.filter((b) => b.jobId === currentJob.id);
    let lineSeq = 1;

    if (jobDTs.length > 0) {
      jobDTs.forEach((dt) => {
        dt.toolLines.forEach((tl) => {
          const matchedRT = rtBatches.find(
            (rt) =>
              rt.jobId === currentJob.id &&
              rt.toolLines.some((rtl) => rtl.serial === tl.serial)
          );
          const toolInv = inventory.find((t) => t.serial === tl.serial);

          items.push({
            id: `tool-${dt.dtNumber}-${tl.serial}-${lineSeq}`,
            category: 'Tools',
            lineNo: lineSeq++,
            dtNumber: dt.dtNumber,
            deliveryDate: dt.dispatchDate || dt.rmDate || `${curYM}-01`,
            assetNumber: tl.assetNo || toolInv?.assetNo || tl.serial,
            description: tl.desc || toolInv?.desc || `${tl.size} ${tl.shortDesc}`,
            quantity: 1,
            status: tl.status === 'OnRig' ? 'On Rig' : 'New',
            rotHours: '',
            returnDate: matchedRT?.rtDate || '',
            rtNumber: matchedRT?.rtNumber || '',
          });
        });
      });
    } else {
      // Standard Epicor representative fleet tools
      const sampleTools = [
        { asset: 'EW-024', desc: '16FT CARGO BASKET FOR DRILLING ASSEMBLY', dt: 'DT-03161', dtDate: `${curYM}-01`, retDate: '', rt: '' },
        { asset: 'OS818FS-1224', desc: '8-1/8" OD LOGAN SERIES 150 FULL STRENGTH RELEASING OVERSHOT', dt: 'DT-03161', dtDate: `${curYM}-03`, retDate: `${curYM}-24`, rt: 'RT-0042' },
        { asset: 'OSEXT818FS-1', desc: '8-1/8" OD X 6-9/16" REG PIN X BOX OVERSHOT EXTENSION SUB', dt: 'DT-03161', dtDate: `${curYM}-03`, retDate: `${curYM}-24`, rt: 'RT-0042' },
        { asset: 'SN-1121', desc: '8-1/8" OD SH OVERSHOT SPIRAL GRAPPLE & PACKER ASSY', dt: 'DT-03161', dtDate: `${curYM}-01`, retDate: '', rt: '' },
        { asset: 'SN-1022', desc: '8-1/8" SH OVERSHOT BASKET GRAPPLE CONTROL', dt: 'DT-03161', dtDate: `${curYM}-01`, retDate: '', rt: '' },
        { asset: 'SN-1202', desc: '6-1/2" OD X 2-1/4" ID DRILLING BUMPER SUB W/ 4-1/2" IF PIN X BOX', dt: 'DT-03161', dtDate: `${curYM}-02`, retDate: '', rt: '' },
        { asset: 'FA612-001', desc: '6-1/2" FISHING ACCELERATOR C/W 4-1/2" IF PIN X BOX', dt: 'DT-03161', dtDate: `${curYM}-04`, retDate: '', rt: '' },
        { asset: 'SN-1134', desc: '6-1/2" OD FISHING BUMPER JAR DOUBLE ACTING HYDRAULIC', dt: 'DT-03161', dtDate: `${curYM}-05`, retDate: `${curYM}-26`, rt: 'RT-0043' },
        { asset: 'SM850-008', desc: '8-1/2" STRING MILL W/ 4-1/2" IF PIN X BOX CRUSHED CARBIDE', dt: 'DT-03161', dtDate: `${curYM}-02`, retDate: '', rt: '' },
        { asset: 'SN-1104', desc: '6-5/8" OD JUNK SUB W/ 4-1/2" IF PIN X BOX', dt: 'DT-03161', dtDate: `${curYM}-01`, retDate: '', rt: '' },
        { asset: 'SN-1205', desc: 'BIT SUB W/ 4-1/2" IF BOX X 6-5/8" REG BOX BORED FOR FLOAT', dt: 'DT-03161', dtDate: `${curYM}-01`, retDate: '', rt: '' },
        { asset: 'SN-1269', desc: 'CROSSOVER SUB W/ 4-1/2" IF PIN X 4-1/2" XH BOX', dt: 'DT-03161', dtDate: `${curYM}-01`, retDate: '', rt: '' },
        { asset: 'SN-1375', desc: '36" LONG DITCH MAGNET C/W CLEANING BRACKET & HANDLES', dt: 'DT-03161', dtDate: `${curYM}-01`, retDate: '', rt: '' },
        { asset: 'SN-1265', desc: '5-3/4" ITCO RELEASING SPEAR W/ 3-1/2" IF PIN X BOX', dt: 'DT-03161', dtDate: `${curYM}-06`, retDate: `${curYM}-22`, rt: 'RT-0044' },
        { asset: 'STS8312-1498', desc: 'SPEAR STOP SUB W/ 3-1/2" IF PIN X BOX', dt: 'DT-03161', dtDate: `${curYM}-06`, retDate: `${curYM}-22`, rt: 'RT-0044' },
        { asset: 'SN-1115', desc: '7-7/8" RCJB W/ 8-3/8" MAGNET INSERT REVERSE CIRCULATING', dt: 'DT-03161', dtDate: `${curYM}-01`, retDate: '', rt: '' },
        { asset: 'JAR-800-HM', desc: '8" OD DOUBLE ACTING HYDRO-MECHANICAL DRILLING JAR C/W 6-5/8" REG', dt: 'DT-03162', dtDate: `${curYM}-02`, retDate: '', rt: '' },
        { asset: 'ST-950-00', desc: '9-1/2" SHOCK TOOL C/W 7-5/8" REG PIN X BOX ST950', dt: 'DT-03162', dtDate: `${curYM}-02`, retDate: '', rt: '' },
        { asset: 'NMDC-634', desc: '6-3/4" NON-MAGNETIC DRILL COLLAR (NMDC) MONEL', dt: 'DT-03163', dtDate: `${curYM}-03`, retDate: '', rt: '' },
        { asset: 'STAB-1214', desc: '12-1/4" INTEGRAL BLADE NEAR BIT STABILIZER C/W WEAR BUTTONS', dt: 'DT-03163', dtDate: `${curYM}-03`, retDate: '', rt: '' },
      ];

      sampleTools.forEach((st) => {
        items.push({
          id: `sample-tool-${lineSeq}`,
          category: 'Tools',
          lineNo: lineSeq++,
          dtNumber: st.dt,
          deliveryDate: st.dtDate,
          assetNumber: st.asset,
          description: st.desc,
          quantity: 1,
          status: st.retDate ? 'Returned' : 'On Rig',
          rotHours: '',
          returnDate: st.retDate || '',
          rtNumber: st.rt || '',
        });
      });
    }

    // B. Man Power (Field Personnel in dedicated tab)
    let manSeq = 1;
    const sampleManpower = [
      { code: 'EMP-701', role: 'Lead Directional Drilling Engineer (Tariq Mansour)', mob: 'MOB-ENG-01', date: `${prevYM}-20` },
      { code: 'EMP-824', role: 'Senior MWD / LWD Field Engineer (Jonathan Vance)', mob: 'MOB-ENG-01', date: `${prevYM}-20` },
      { code: 'EMP-612', role: 'Downhole Tool Specialist & Redress Eng (Ahmed Al-Ameri)', mob: 'MOB-ENG-02', date: `${prevYM}-24` },
      { code: 'EMP-905', role: 'Fishing & Well Intervention Specialist (Khaled Al-Zaabi)', mob: 'MOB-ENG-03', date: `${curYM}-01` },
    ];

    sampleManpower.forEach((m) => {
      items.push({
        id: `man-${manSeq}`,
        category: 'Man Power',
        lineNo: manSeq++,
        dtNumber: m.mob,
        deliveryDate: m.date,
        assetNumber: m.code,
        description: m.role,
        quantity: 1,
        status: 'On Rig',
        rotHours: '12',
      });
    });

    // C. Inventory (Non-tool equipment, baskets, crossovers mobilized to site)
    let invSeq = 1;
    const sampleInventory = [
      { code: 'BSK-16-01', desc: '16FT DNV CERTIFIED OFFSHORE CARGO BASKET WITH SLINGS & SHACKLES', dt: 'DT-03161', date: `${curYM}-01` },
      { code: 'PUP-658-10', desc: '6-5/8" REG 10FT DRILL STRING PUP JOINT S-135 27.7# RANGE 2', dt: 'DT-03161', date: `${curYM}-01` },
      { code: 'XOV-412-658', desc: 'CROSSOVER SUB 4-1/2" IF PIN X 6-5/8" REG BOX 4145H ALLOY', dt: 'DT-03161', date: `${curYM}-01` },
      { code: 'MAG-CLEAN-02', desc: 'HEAVY DUTY DITCH MAGNET CLEANING TRAY AND RETRIEVAL KIT', dt: 'DT-03161', date: `${curYM}-01` },
    ];

    sampleInventory.forEach((inv) => {
      items.push({
        id: `inv-${invSeq}`,
        category: 'Inventory',
        lineNo: invSeq++,
        dtNumber: inv.dt,
        deliveryDate: inv.date,
        assetNumber: inv.code,
        description: inv.desc,
        quantity: 1,
        status: 'Good',
        rotHours: '',
      });
    });

    return items;
  }, [currentJob, dtBatches, rtBatches, inventory]);

  const [lineItems, setLineItems] = useState<EpicorLineItem[]>(initialItems);
  useEffect(() => {
    setLineItems(initialItems);
  }, [initialItems]);

  // Daily cell values: key `${rowId}|${YYYY-MM-DD}` => 'S' | '1' | ''
  const [cells, setCells] = useState<Record<string, string>>(() => {
    const prevYM = '2026-08';
    const curYM = '2026-09';
    const initial: Record<string, string> = {};

    // Seed August records for manpower and early equipment mobilized in August
    ['man-1', 'man-2', 'man-3'].forEach((rid) => {
      for (let d = 20; d <= 31; d++) {
        initial[`${rid}|${prevYM}-${pad(d)}`] = '1';
      }
    });
    // Early mobilized tools in August (sample-tool-1 to 5)
    for (let l = 1; l <= 5; l++) {
      const rowId = `sample-tool-${l}`;
      for (let d = 24; d <= 31; d++) {
        initial[`${rowId}|${prevYM}-${pad(d)}`] = d <= 26 ? 'S' : '1';
      }
    }

    // Seed September records strictly within valid delivery/return bounds
    // Tool 1: from 1st to 10th
    for (let d = 1; d <= 10; d++) {
      initial[`sample-tool-1|${curYM}-${pad(d)}`] = d <= 3 ? 'S' : '1';
    }
    // Tool 2 & 3 (OS818FS-1224 & OSEXT818FS-1): delivered on 03/09, so days 1-2 are empty/locked!
    for (let d = 3; d <= 12; d++) {
      initial[`sample-tool-2|${curYM}-${pad(d)}`] = d <= 5 ? 'S' : '1';
      initial[`sample-tool-3|${curYM}-${pad(d)}`] = d <= 5 ? 'S' : '1';
    }
    // Tools 4 to 6
    for (let l = 4; l <= 6; l++) {
      for (let d = 1; d <= 10; d++) {
        initial[`sample-tool-${l}|${curYM}-${pad(d)}`] = d <= 2 ? 'S' : '1';
      }
    }
    // Tool 7 (FA612-001): delivered 04/09
    for (let d = 4; d <= 12; d++) {
      initial[`sample-tool-7|${curYM}-${pad(d)}`] = d <= 6 ? 'S' : '1';
    }
    // Tool 8 (SN-1134): delivered 05/09
    for (let d = 5; d <= 14; d++) {
      initial[`sample-tool-8|${curYM}-${pad(d)}`] = d <= 7 ? 'S' : '1';
    }
    // Tools 9 to 13
    for (let l = 9; l <= 13; l++) {
      for (let d = 1; d <= 10; d++) {
        initial[`sample-tool-${l}|${curYM}-${pad(d)}`] = d <= 3 ? 'S' : '1';
      }
    }
    // Tools 14 & 15: delivered 06/09
    for (let l = 14; l <= 15; l++) {
      for (let d = 6; d <= 15; d++) {
        initial[`sample-tool-${l}|${curYM}-${pad(d)}`] = d <= 8 ? 'S' : '1';
      }
    }
    // Tools 16 to 20
    for (let l = 16; l <= 20; l++) {
      const startD = l <= 18 ? 2 : 3;
      for (let d = startD; d <= 10; d++) {
        initial[`sample-tool-${l}|${curYM}-${pad(d)}`] = d <= (startD + 2) ? 'S' : '1';
      }
    }

    // Manpower active in September
    ['man-1', 'man-2', 'man-3', 'man-4'].forEach((rid) => {
      for (let d = 1; d <= 10; d++) {
        initial[`${rid}|${curYM}-${pad(d)}`] = '1';
      }
    });

    // Inventory active in September
    ['inv-1', 'inv-2'].forEach((rid) => {
      for (let d = 1; d <= 10; d++) {
        initial[`${rid}|${curYM}-${pad(d)}`] = 'S';
      }
    });

    return initial;
  });

  // Submitted Invoices state (Tracks official submissions & generated tax invoices)
  const [submittedInvoices, setSubmittedInvoices] = useState<Record<string, {
    invoiceNo: string;
    submittedAt: string;
    periodYM: string;
    subtotal: number;
    vatAmount: number;
    totalWithVat: number;
    status: 'Submitted' | 'Approved';
  }>>({
    '2026-08': {
      invoiceNo: 'INV-202608-0042',
      submittedAt: '2026-08-31',
      periodYM: '2026-08',
      subtotal: 21500,
      vatAmount: 1075,
      totalWithVat: 22575,
      status: 'Approved',
    },
  });

  const [isSubmitInvoiceModalOpen, setIsSubmitInvoiceModalOpen] = useState(false);

  // Selected cell, focused cell & row tracking
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<{ itemId: string; day: number } | null>(null);
  const [copiedTsvData, setCopiedTsvData] = useState<string>('');

  // Paste from Excel Modal
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteModalText, setPasteModalText] = useState('');

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' | 'inf' } | null>(null);
  const showToast = (msg: string, type: 'ok' | 'err' | 'inf' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Add Item Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItemCat, setNewItemCat] = useState<'Tools' | 'Man Power' | 'Inventory'>('Tools');
  const [newItemAsset, setNewItemAsset] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemDt, setNewItemDt] = useState('');
  const [newItemDate, setNewItemDate] = useState('2026-09-01');

  // Side Scroller Reference for smooth scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handleScrollDays = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const delta = direction === 'left' ? -250 : 250;
      scrollContainerRef.current.scrollBy({ left: delta, behavior: 'smooth' });
    }
  };

  // Filtered items by active tab & search query
  const displayedItems = useMemo(() => {
    let list = lineItems;
    if (activeTab !== 'Header') {
      list = list.filter((i) => i.category === activeTab);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((i) =>
        `${i.assetNumber} ${i.description} ${i.dtNumber} ${i.lineNo}`
          .toLowerCase()
          .includes(q)
      );
    }
    return list;
  }, [lineItems, activeTab, searchQuery]);

  // Row stats for active month (strictly counts days within delivery & receiving range)
  const calcItemStats = useCallback(
    (item: EpicorLineItem, ym: string) => {
      const [y, m] = ym.split('-').map(Number);
      const nD = new Date(y, m, 0).getDate();
      let sbCount = 0;
      let opsCount = 0;

      for (let d = 1; d <= nD; d++) {
        const dateStr = `${ym}-${pad(d)}`;
        if (!isCellDateAllowed(item, dateStr).allowed) continue;
        const val = cells[`${item.id}|${ym}-${pad(d)}`];
        if (val === 'S') sbCount++;
        else if (val === '1') opsCount++;
      }

      const cap = rateConfig.cap;
      const billedSb = cap !== null ? Math.min(sbCount, cap) : sbCount;
      const sbAmount = billedSb * rateConfig.standby;
      const opsAmount = opsCount * rateConfig.ops;
      const totalAmount = sbAmount + opsAmount;

      return { sbCount, billedSb, opsCount, sbAmount, opsAmount, totalAmount };
    },
    [cells, rateConfig]
  );

  // Totals for active month
  const monthTotals = useMemo(() => {
    let totalSb = 0;
    let totalOps = 0;
    let totalRev = 0;

    displayedItems.forEach((item) => {
      const s = calcItemStats(item, activeYM);
      totalSb += s.billedSb;
      totalOps += s.opsCount;
      totalRev += s.totalAmount;
    });

    return { totalSb, totalOps, totalRev, count: displayedItems.length };
  }, [displayedItems, activeYM, calcItemStats]);

  // Active month invoice breakdown by category (Tools, Man Power, Inventory + 5% UAE VAT)
  const activeMonthInvoiceBreakdown = useMemo(() => {
    let toolsAmount = 0;
    let toolsSb = 0;
    let toolsOps = 0;
    let toolsCount = 0;

    let manAmount = 0;
    let manSb = 0;
    let manOps = 0;
    let manCount = 0;

    let invAmount = 0;
    let invSb = 0;
    let invOps = 0;
    let invCount = 0;

    lineItems.forEach((item) => {
      const s = calcItemStats(item, activeYM);
      if (item.category === 'Tools') {
        toolsAmount += s.totalAmount;
        toolsSb += s.billedSb;
        toolsOps += s.opsCount;
        toolsCount++;
      } else if (item.category === 'Man Power') {
        manAmount += s.totalAmount;
        manSb += s.billedSb;
        manOps += s.opsCount;
        manCount++;
      } else if (item.category === 'Inventory') {
        invAmount += s.totalAmount;
        invSb += s.billedSb;
        invOps += s.opsCount;
        invCount++;
      }
    });

    const subtotal = toolsAmount + manAmount + invAmount;
    const vatAmount = Math.round(subtotal * 0.05);
    const totalWithVat = subtotal + vatAmount;
    const totalLines = toolsCount + manCount + invCount;

    return {
      toolsAmount, toolsSb, toolsOps, toolsCount,
      manAmount, manSb, manOps, manCount,
      manpowerAmount: manAmount, manpowerCount: manCount,
      invAmount, invSb, invOps, invCount,
      inventoryAmount: invAmount, inventoryCount: invCount,
      subtotal, vatAmount, totalWithVat, totalLines,
    };
  }, [lineItems, activeYM, calcItemStats]);

  // Identify all active months for the current job (e.g. August 2026, September 2026)
  const jobActiveMonths = useMemo(() => {
    const set = new Set<string>();
    // Default active job operational months
    set.add('2026-08');
    set.add('2026-09');

    lineItems.forEach((item) => {
      if (item.deliveryDate) set.add(item.deliveryDate.slice(0, 7));
      if (item.returnDate) set.add(item.returnDate.slice(0, 7));
    });

    Object.keys(cells).forEach((k) => {
      const parts = k.split('|');
      if (parts[1] && cells[k]) set.add(parts[1].slice(0, 7));
    });

    return Array.from(set).sort();
  }, [lineItems, cells]);

  // Clean, high-level summary of values for August, September & active months with Total Invoice for the job
  const jobMonthlySummaries = useMemo(() => {
    return jobActiveMonths.map((ym) => {
      const [yStr, mStr] = ym.split('-');
      const y = parseInt(yStr, 10);
      const mIdx = parseInt(mStr, 10) - 1;
      const mName = MONTH_NAMES[mIdx] || ym;

      let monthSb = 0;
      let monthOps = 0;
      let monthRev = 0;

      lineItems.forEach((item) => {
        const s = calcItemStats(item, ym);
        monthSb += s.billedSb;
        monthOps += s.opsCount;
        monthRev += s.totalAmount;
      });

      const submission = submittedInvoices[ym];

      return {
        ym,
        year: y,
        monthIdx: mIdx,
        monthName: mName,
        standbyDays: monthSb,
        opsDays: monthOps,
        invoicedAmount: monthRev,
        isCurrentPeriod: ym === activeYM,
        isSubmitted: Boolean(submission),
        invoiceNumber: submission?.invoiceNo || (ym < '2026-09' ? `INV-${ym.replace('-', '')}-0042` : null),
      };
    });
  }, [jobActiveMonths, lineItems, calcItemStats, activeYM, submittedInvoices]);

  // Grand total invoice for the entire job across all performed months
  const jobGrandTotal = useMemo(() => {
    let totalSb = 0;
    let totalOps = 0;
    let grandTotal = 0;

    jobMonthlySummaries.forEach((ms) => {
      totalSb += ms.standbyDays;
      totalOps += ms.opsDays;
      grandTotal += ms.invoicedAmount;
    });

    return { totalSb, totalOps, grandTotal };
  }, [jobMonthlySummaries]);

  const activeMonthInvoice = submittedInvoices[activeYM] || null;

  // Handle invoice submission workflow
  const handleConfirmSubmitInvoice = () => {
    const invNo = `INV-${selectedYear}${pad(selectedMonthIdx + 1)}-${(currentJob.id || 'JOB').replace(/[^a-zA-Z0-9]/g, '')}`;
    const newRecord = {
      invoiceNo: invNo,
      submittedAt: new Date().toISOString().slice(0, 10),
      periodYM: activeYM,
      subtotal: activeMonthInvoiceBreakdown.subtotal,
      vatAmount: activeMonthInvoiceBreakdown.vatAmount,
      totalWithVat: activeMonthInvoiceBreakdown.totalWithVat,
      status: 'Submitted' as const,
    };

    setSubmittedInvoices((prev) => ({
      ...prev,
      [activeYM]: newRecord,
    }));

    // Synchronize status directly to DrillingJob so Operations and Billing categories update!
    if (onUpdateJob && currentJob) {
      // Append this new monthly invoice number to existing legal invoice numbers
      const existingInvoices = (currentJob.legalInvoiceNumber || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!existingInvoices.includes(invNo)) {
        existingInvoices.push(invNo);
      }
      const updatedLegalInvoiceNumber = existingInvoices.join(', ');

      const updatedJob: DrillingJob = {
        ...currentJob,
        status: 'Final invoiced',
        legalInvoiceNumber: updatedLegalInvoiceNumber,
        finalInvoicedDate: new Date().toISOString().slice(0, 10),
        invoiceAmount: (currentJob.invoiceAmount || 0) + newRecord.totalWithVat,
        notes: currentJob.notes
          ? `${currentJob.notes}\n[${new Date().toISOString().slice(0, 10)}]: Invoiced ${invNo} for period ${MONTH_NAMES[selectedMonthIdx]} ${selectedYear} (${rateConfig.currency} ${newRecord.totalWithVat.toLocaleString()})`
          : `[${new Date().toISOString().slice(0, 10)}]: Invoiced ${invNo} for period ${MONTH_NAMES[selectedMonthIdx]} ${selectedYear} (${rateConfig.currency} ${newRecord.totalWithVat.toLocaleString()})`,
      };

      onUpdateJob(updatedJob);
    }

    setIsSubmitInvoiceModalOpen(false);
    showToast(`Invoice ${invNo} submitted & Job ${currentJob?.id} status updated to 'Final invoiced' in Operations & Billing categories!`, 'ok');
  };

  const handleReopenInvoice = () => {
    const invNo = `INV-${selectedYear}${pad(selectedMonthIdx + 1)}-${(currentJob.id || 'JOB').replace(/[^a-zA-Z0-9]/g, '')}`;
    setSubmittedInvoices((prev) => {
      const copy = { ...prev };
      delete copy[activeYM];
      return copy;
    });

    if (onUpdateJob && currentJob) {
      const existingInvoices = (currentJob.legalInvoiceNumber || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && s !== invNo);

      const updatedJob: DrillingJob = {
        ...currentJob,
        legalInvoiceNumber: existingInvoices.join(', '),
        status: existingInvoices.length > 0 ? 'Final invoiced' : 'Job completed and waiting signed docs',
      };
      onUpdateJob(updatedJob);
    }

    setIsSubmitInvoiceModalOpen(false);
    showToast(`Billing period ${MONTH_NAMES[selectedMonthIdx]} ${selectedYear} reopened for revisions.`, 'inf');
  };

  // Commercial Grand Total across all categories for active period
  const overallCommercialTotal = useMemo(() => {
    let grandRev = 0;
    let grandSb = 0;
    let grandOps = 0;

    lineItems.forEach((item) => {
      const s = calcItemStats(item, activeYM);
      grandRev += s.totalAmount;
      grandSb += s.billedSb;
      grandOps += s.opsCount;
    });

    return { grandRev, grandSb, grandOps };
  }, [lineItems, activeYM, calcItemStats]);

  // Clear Selection Action
  const handleClearSelection = () => {
    if (selectedCells.size > 0) {
      setCells((prev) => {
        const next = { ...prev };
        selectedCells.forEach((k) => {
          next[k] = '';
        });
        return next;
      });
      setSelectedCells(new Set());
      showToast('Cleared selected cell(s)', 'ok');
    } else if (activeRowId) {
      setCells((prev) => {
        const next = { ...prev };
        for (let d = 1; d <= daysInActiveMonth; d++) {
          next[`${activeRowId}|${activeYM}-${pad(d)}`] = '';
        }
        return next;
      });
      showToast(`Cleared row ${activeRowId}`, 'ok');
    } else {
      showToast('Select cells or a row to clear.', 'inf');
    }
  };

  // TRUE EXCEL COPY & PASTE (Tab-Delimited TSV Support)
  // Allows copying from this grid directly into Excel, and pasting from Excel back into this grid!
  const handleCopy = async () => {
    let tsv = '';
    const activeItem = displayedItems.find((i) => i.id === activeRowId) || displayedItems[0];

    if (activeItem && (activeRowId || selectedCells.size === 0)) {
      // Copy single active row day values (1..daysInActiveMonth) tab-separated for Excel
      const dayVals: string[] = [];
      for (let d = 1; d <= daysInActiveMonth; d++) {
        const k = `${activeItem.id}|${activeYM}-${pad(d)}`;
        dayVals.push(cells[k] || '');
      }
      tsv = dayVals.join('\t');
      setCopiedTsvData(tsv);

      try {
        await navigator.clipboard.writeText(tsv);
        showToast(`Copied Line ${activeItem.lineNo} (${activeItem.assetNumber}) to clipboard. Ready to paste in Excel (Ctrl+V)!`, 'ok');
      } catch {
        showToast(`Copied Line ${activeItem.lineNo} data into clipboard memory buffer.`, 'ok');
      }
      return;
    }

    if (displayedItems.length > 0) {
      // Copy whole grid formatted as Excel spreadsheet with DT No and Delivery Date separate
      const headerRow = ['Line', 'DT Number', 'Delivery Date', 'Asset Number', 'Description', 'Qty', 'Status'];
      for (let d = 1; d <= daysInActiveMonth; d++) {
        headerRow.push(String(d));
      }
      headerRow.push('SB Days', 'Ops Days', `Rate (${rateConfig.currency})`, `Total (${rateConfig.currency})`);

      const rows: string[] = [headerRow.join('\t')];
      displayedItems.forEach((item) => {
        const stats = calcItemStats(item, activeYM);
        const row = [
          item.lineNo,
          item.dtNumber,
          formatDateDDMMYY(item.deliveryDate),
          item.assetNumber,
          item.description,
          formatQty(item.quantity),
          item.status,
        ];
        for (let d = 1; d <= daysInActiveMonth; d++) {
          const dateStr = `${activeYM}-${pad(d)}`;
          if (isCellDateAllowed(item, dateStr).allowed) {
            row.push(cells[`${item.id}|${dateStr}`] || '');
          } else {
            row.push('-');
          }
        }
        row.push(stats.billedSb, stats.opsCount, rateConfig.ops, stats.totalAmount);
        rows.push(row.join('\t'));
      });

      tsv = rows.join('\r\n');
      setCopiedTsvData(tsv);

      try {
        await navigator.clipboard.writeText(tsv);
        showToast(`Copied all ${displayedItems.length} line items to clipboard. Paste directly into Excel!`, 'ok');
      } catch {
        showToast('Copied grid data into memory buffer.', 'ok');
      }
    }
  };

  // Applies tab/newline delimited text (copied from Excel) into the utilization cells
  const applyExcelPastedText = (rawText: string) => {
    if (!rawText || !rawText.trim()) {
      showToast('Clipboard is empty. Nothing to paste.', 'inf');
      return;
    }

    const lines = rawText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;

    const startIdx = activeRowId
      ? Math.max(0, displayedItems.findIndex((i) => i.id === activeRowId))
      : 0;

    setCells((prev) => {
      const next = { ...prev };
      let appliedCount = 0;

      lines.forEach((lineStr, lineOffset) => {
        const targetItem = displayedItems[startIdx + lineOffset];
        if (!targetItem) return;

        // Delimited by Tab (Excel) or Comma (CSV)
        const tokens = lineStr.includes('\t') ? lineStr.split('\t') : lineStr.split(',');

        // Detect if tokens contain complete table row (with line number, asset, etc.)
        let dayTokens = tokens;
        if (tokens.length >= daysInActiveMonth + 6) {
          // Skip header columns: Line(0), DT(1), DeliveryDate(2), Asset(3), Desc(4), Qty(5), Status(6)
          dayTokens = tokens.slice(7, 7 + daysInActiveMonth);
        } else if (tokens.length >= daysInActiveMonth + 5) {
          // Older format with combined DT & Date
          dayTokens = tokens.slice(6, 6 + daysInActiveMonth);
        }

        dayTokens.forEach((token, colIdx) => {
          const day = colIdx + 1;
          if (day > daysInActiveMonth) return;

          // Strict restriction: only update cells within delivery and receiving range
          const cellDateStr = `${activeYM}-${pad(day)}`;
          if (!isCellDateAllowed(targetItem, cellDateStr).allowed) {
            return;
          }

          const clean = token.trim().toUpperCase();
          let val: 'S' | '1' | '' = '';
          if (clean === '1' || clean === 'OPS' || clean === 'O') {
            val = '1';
          } else if (clean === 'S' || clean === 'SB' || clean === 'STANDBY') {
            val = 'S';
          } else if (clean === '' || clean === '0' || clean === '-') {
            val = '';
          }

          const cellKey = `${targetItem.id}|${cellDateStr}`;
          next[cellKey] = val;
          appliedCount++;
        });
      });

      showToast(`Pasted ${appliedCount} day values from Excel across ${Math.min(lines.length, displayedItems.length - startIdx)} row(s)!`, 'ok');
      return next;
    });
  };

  const handlePaste = async () => {
    // Attempt reading system clipboard
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          applyExcelPastedText(text);
          return;
        }
      }
    } catch {
      // Permission blocked by iframe or browser
    }

    // If memory buffer has copied data, try that
    if (copiedTsvData && copiedTsvData.trim()) {
      applyExcelPastedText(copiedTsvData);
      return;
    }

    // Otherwise open the Quick Excel Paste modal fallback
    setPasteModalText('');
    setIsPasteModalOpen(true);
  };

  // Focus Cell Helper with immediate DOM focus
  const focusCell = useCallback((itemId: string, day: number) => {
    if (day < 1 || day > daysInActiveMonth) return;
    setFocusedCell({ itemId, day });
    requestAnimationFrame(() => {
      const el = document.getElementById(`util-cell-${itemId}-${day}`);
      if (el) {
        el.focus();
      }
    });
  }, [daysInActiveMonth]);

  // Keyboard navigation and continuous instant typing (1 for Operation, S for Standby)
  // STRICT RULE: Updates are ONLY allowed between delivery date (start) and receiving date (end).
  const handleCellKeyDown = (
    e: React.KeyboardEvent,
    item: EpicorLineItem,
    day: number
  ) => {
    const key = e.key;
    const cellDateStr = `${activeYM}-${pad(day)}`;
    const cellKey = `${item.id}|${cellDateStr}`;
    const allowedCheck = isCellDateAllowed(item, cellDateStr);

    if (key === '1' || key === 'o' || key === 'O') {
      e.preventDefault();
      if (!allowedCheck.allowed) {
        showToast(`Cannot enter utilization: ${allowedCheck.reason}`, 'err');
        return;
      }
      setCells((prev) => ({ ...prev, [cellKey]: '1' }));
      // Advance to next valid allowed day for seamless continuous typing
      let nextDay: number | null = null;
      for (let d = day + 1; d <= daysInActiveMonth; d++) {
        if (isCellDateAllowed(item, `${activeYM}-${pad(d)}`).allowed) {
          nextDay = d;
          break;
        }
      }
      if (nextDay !== null) {
        focusCell(item.id, nextDay);
      }
    } else if (key === 's' || key === 'S') {
      e.preventDefault();
      if (!allowedCheck.allowed) {
        showToast(`Cannot enter utilization: ${allowedCheck.reason}`, 'err');
        return;
      }
      setCells((prev) => ({ ...prev, [cellKey]: 'S' }));
      // Advance to next valid allowed day for seamless continuous typing
      let nextDay: number | null = null;
      for (let d = day + 1; d <= daysInActiveMonth; d++) {
        if (isCellDateAllowed(item, `${activeYM}-${pad(d)}`).allowed) {
          nextDay = d;
          break;
        }
      }
      if (nextDay !== null) {
        focusCell(item.id, nextDay);
      }
    } else if (key === 'Backspace' || key === 'Delete' || key === '0' || key === ' ') {
      e.preventDefault();
      if (!allowedCheck.allowed) {
        showToast(`Cell is locked: ${allowedCheck.reason}`, 'err');
        return;
      }
      setCells((prev) => ({ ...prev, [cellKey]: '' }));
      if (day < daysInActiveMonth) {
        focusCell(item.id, day + 1);
      }
    } else if (key === 'ArrowRight') {
      e.preventDefault();
      if (day < daysInActiveMonth) {
        focusCell(item.id, day + 1);
      }
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      if (day > 1) {
        focusCell(item.id, day - 1);
      }
    } else if (key === 'ArrowDown' || key === 'Enter') {
      e.preventDefault();
      const currentIdx = displayedItems.findIndex((i) => i.id === item.id);
      if (currentIdx < displayedItems.length - 1) {
        const nextItem = displayedItems[currentIdx + 1];
        setActiveRowId(nextItem.id);
        focusCell(nextItem.id, day);
      }
    } else if (key === 'ArrowUp') {
      e.preventDefault();
      const currentIdx = displayedItems.findIndex((i) => i.id === item.id);
      if (currentIdx > 0) {
        const prevItem = displayedItems[currentIdx - 1];
        setActiveRowId(prevItem.id);
        focusCell(prevItem.id, day);
      }
    } else if (key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (day > 1) focusCell(item.id, day - 1);
      } else {
        if (day < daysInActiveMonth) focusCell(item.id, day + 1);
      }
    }
  };

  // Add Item Submit
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemAsset.trim() || !newItemDesc.trim()) {
      alert('Asset Number and Description are required.');
      return;
    }

    const nextLineNo = lineItems.filter((i) => i.category === newItemCat).length + 1;
    const newItem: EpicorLineItem = {
      id: `${newItemCat.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      category: newItemCat,
      lineNo: nextLineNo,
      dtNumber: newItemDt.trim() || (newItemCat === 'Man Power' ? 'MOB-ENG' : 'DT-MANUAL'),
      deliveryDate: newItemDate,
      assetNumber: newItemAsset.trim(),
      description: newItemDesc.trim(),
      quantity: 1,
      status: 'New',
      rotHours: '',
    };

    setLineItems((prev) => [...prev, newItem]);
    setIsAddModalOpen(false);
    setNewItemAsset('');
    setNewItemDesc('');
    showToast(`Added ${newItem.assetNumber} to ${newItemCat}`, 'ok');
  };

  // Export XLSX matching Epicor format
  const handleExportXLSX = () => {
    const wsData: any[][] = [];
    wsData.push(['EMDAD OILFIELD SERVICES LLC - EPICOR UTILIZATION MASTER']);
    wsData.push([
      'JOB NO:', currentJob.id,
      'CLIENT:', currentJob.client,
      'RIG:', currentJob.rig,
      'WELL:', currentJob.well,
      'YEAR:', selectedYear,
      'MONTH:', MONTH_NAMES[selectedMonthIdx],
      'RATE RULE:', `${rateConfig.currency} ${rateConfig.standby} SB / ${rateConfig.ops} Ops`
    ]);
    wsData.push([]);

    const headers = [
      'Line Number',
      'DT Number',
      'Delivery Date',
      'Asset Number',
      'Description',
      'Quantity',
      'Status'
    ];
    for (let d = 1; d <= daysInActiveMonth; d++) {
      headers.push(String(d));
    }
    headers.push('Standby Days', 'Ops Days', `Rate (${rateConfig.currency})`, `Total Net (${rateConfig.currency})`);
    wsData.push(headers);

    displayedItems.forEach((item) => {
      const stats = calcItemStats(item, activeYM);
      const rowArr: any[] = [
        item.lineNo,
        item.dtNumber,
        formatDateDDMMYY(item.deliveryDate),
        item.assetNumber,
        item.description,
        formatQty(item.quantity),
        item.status,
      ];
      for (let d = 1; d <= daysInActiveMonth; d++) {
        const dateStr = `${activeYM}-${pad(d)}`;
        if (isCellDateAllowed(item, dateStr).allowed) {
          rowArr.push(cells[`${item.id}|${dateStr}`] || '');
        } else {
          rowArr.push('-');
        }
      }
      rowArr.push(stats.billedSb, stats.opsCount, rateConfig.ops, stats.totalAmount);
      wsData.push(rowArr);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${MONTH_NAMES[selectedMonthIdx]}_${selectedYear}`);

    const fileName = `UTILIZATION_${activeTab.replace(/\s+/g, '_')}_${(currentJob.rig || 'RIG').replace(/\s+/g, '_')}_${activeYM}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`Exported spreadsheet: ${fileName}`, 'ok');
  };

  return (
    <div className="space-y-3 text-xs select-none w-full">
      {/* Header Ribbon & Active Job Switcher */}
      <div className="bg-white border border-[#b8c9db] rounded p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2.5 mb-2.5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#1a3055] text-white flex items-center justify-center font-bold text-sm shadow-2xs">
              📊
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                Operations &bull; Upstream Resource Accounting
              </div>
              <h1 className="text-base font-extrabold text-[#1a3055] tracking-tight">
                Utilization Master
              </h1>
            </div>
          </div>

          {/* Type-to-Search Job Selector & Actions */}
          <div className="flex items-center gap-2.5">
            <label className="font-bold text-slate-700 text-xs whitespace-nowrap">Active Job:</label>
            
            {/* Custom Searchable Combo */}
            <div className="relative" ref={jobDropdownRef}>
              <div className="flex items-center gap-1">
                {/* Dropdown trigger button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsJobDropdownOpen(!isJobDropdownOpen);
                    setJobSearchQuery('');
                  }}
                  className="border border-[#1a3055] rounded px-3 py-1.5 font-mono font-bold text-xs bg-slate-50 text-[#1a3055] hover:bg-slate-100 flex items-center justify-between gap-2 shadow-2xs cursor-pointer min-w-[260px] md:min-w-[300px]"
                >
                  <span className="truncate">
                    {currentJob.id} &mdash; {currentJob.client} ({currentJob.rig})
                  </span>
                  <span className="text-[10px] text-slate-500">▼</span>
                </button>
              </div>

              {/* Searchable Dropdown Popover */}
              {isJobDropdownOpen && (
                <div className="absolute left-0 mt-1 w-80 md:w-96 bg-white border border-[#1a3055] rounded-md shadow-2xl z-50 overflow-hidden text-xs">
                  {/* Search Bar */}
                  <div className="p-2 bg-slate-100 border-b border-slate-200">
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        value={jobSearchQuery}
                        onChange={(e) => setJobSearchQuery(e.target.value)}
                        placeholder="Type to search (e.g. 00003, ADNOC, AD-45)..."
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-xs outline-none focus:border-[#1a3055] focus:ring-1 focus:ring-[#1a3055]"
                      />
                      {jobSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setJobSearchQuery('')}
                          className="absolute right-2 top-1 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Scrollable Job List */}
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {sortedAndFilteredJobs.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 italic">
                        No jobs match &ldquo;{jobSearchQuery}&rdquo;
                      </div>
                    ) : (
                      sortedAndFilteredJobs.map((j) => (
                        <div
                          key={j.id}
                          onClick={() => {
                            setSelectedJobId(j.id);
                            setIsJobDropdownOpen(false);
                            setJobSearchQuery('');
                          }}
                          className={`p-2.5 hover:bg-blue-50 cursor-pointer transition flex items-center justify-between gap-2 ${
                            j.id === selectedJobId ? 'bg-blue-50/80 font-bold border-l-4 border-l-[#1a3055]' : ''
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-[#1a3055]">{j.id}</span>
                              <span className="text-slate-400">&bull;</span>
                              <span className="font-semibold text-slate-800">{j.client}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                              <span>Rig: <strong>{j.rig}</strong></span>
                              <span>Well: <strong>{j.well}</strong></span>
                              {j.poNumber && <span>PO: <strong className="font-mono">{j.poNumber}</strong></span>}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {j.status}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3 py-1.5 rounded bg-[#1a3055] text-white hover:bg-[#24426d] font-bold text-xs shadow-2xs cursor-pointer flex items-center gap-1.5"
            >
              <span>+</span> Add Line Item
            </button>
          </div>
        </div>

        {/* Job Parameters Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs bg-slate-50 p-2 rounded border border-slate-200">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Rig / Well</span>
            <span className="font-bold text-slate-900">{currentJob.rig} / {currentJob.well}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Client</span>
            <span className="font-bold text-[#1a3055]">{currentJob.client}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">PO Number</span>
            <span className="font-mono text-slate-800">{currentJob.poNumber || 'PO-EMD-2026'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Hole Section</span>
            <span className="font-mono text-slate-800">{currentJob.holeSection || '12-1/4"'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Contract Agreement</span>
            <span className="font-semibold text-slate-800 truncate block" title={currentJob.contract || currentJob.client}>
              {currentJob.contract || currentJob.client}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Period Billing</span>
            <span className="font-bold font-mono text-emerald-800">
              {rateConfig.currency} {monthTotals.totalRev.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Epicor ERP Window Tabs: Header | Tools | Man Power | Inventory (NO Consumables) */}
      <div className="bg-white border border-[#b8c9db] rounded shadow-2xs overflow-hidden">
        {/* Main Tab Navigation Bar */}
        <div className="bg-[#e4eef8] border-b border-[#b8c9db] px-2 pt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-1">
            {(['Header', 'Tools', 'Man Power', 'Inventory'] as EpicorTab[]).map((tab) => {
              const count = tab === 'Header' ? null : lineItems.filter((i) => i.category === tab).length;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 font-bold text-xs rounded-t transition cursor-pointer border-t border-x flex items-center gap-1.5 ${
                    activeTab === tab
                      ? 'bg-white text-[#1a3055] border-[#b8c9db] -mb-[1px] shadow-2xs font-extrabold'
                      : 'bg-transparent text-slate-600 border-transparent hover:bg-slate-200/60'
                  }`}
                >
                  <span>
                    {tab === 'Header' && '📑'}
                    {tab === 'Tools' && '🛠️'}
                    {tab === 'Man Power' && '👷'}
                    {tab === 'Inventory' && '📦'}
                  </span>
                  <span>{tab}</span>
                  {count !== null && (
                    <span
                      className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        activeTab === tab ? 'bg-blue-100 text-blue-900' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content 1: HEADER (Job Details, Commercial Terms, Monthly Invoicing Summary) */}
        {activeTab === 'Header' && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Job & Rig Specifications */}
              <div className="border border-slate-200 rounded p-3 bg-slate-50/50 space-y-2">
                <h3 className="font-bold text-[#1a3055] text-xs uppercase tracking-wide border-b pb-1">
                  1. Operational Assignment &amp; Rig Wellsite
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">Job Number:</span>
                    <strong className="font-mono text-slate-900">{currentJob.id}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Client Operator:</span>
                    <strong className="text-[#1a3055]">{currentJob.client}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Rig ID:</span>
                    <strong className="text-slate-900">{currentJob.rig}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Well Name:</span>
                    <strong className="text-slate-900">{currentJob.well}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Purchase Order (PO):</span>
                    <strong className="font-mono text-slate-800">{currentJob.poNumber || 'PO-ADD-88910'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Hole Section:</span>
                    <strong className="font-mono text-slate-800">{currentJob.holeSection || '12-1/4"'}</strong>
                  </div>
                </div>
              </div>

              {/* Contract Terms & Commercial Agreement */}
              <div className="border border-slate-200 rounded p-3 bg-slate-50/50 space-y-2">
                <h3 className="font-bold text-[#1a3055] text-xs uppercase tracking-wide border-b pb-1">
                  2. Contract Commercial Agreement
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">Master Contract:</span>
                    <strong className="text-slate-900">{currentJob.contract || currentJob.client}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Billing Currency:</span>
                    <strong className="font-mono text-slate-900">{rateConfig.currency}</strong>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500 block">Pricing Tariff:</span>
                    <span className="text-slate-700 font-semibold">
                      Contract Schedule Tariff (Line-by-line pricing governed by selected contract)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Standby Terms:</span>
                    <strong className="text-slate-800">
                      {rateConfig.cap !== null ? `Max ${rateConfig.cap} Standby Days / month` : 'Uncapped Standard Standby'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Billing Basis:</span>
                    <strong className="text-emerald-800">Monthly Accrual / Delivery Reconciliation</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Overall Resource Allotment Breakdown */}
            <div className="border border-slate-200 rounded p-3 bg-white space-y-3">
              <h3 className="font-bold text-[#1a3055] text-xs uppercase tracking-wide">
                3. Mobilized Line Item Summary by Tab
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  onClick={() => setActiveTab('Tools')}
                  className="p-3 bg-blue-50/50 border border-blue-200 rounded cursor-pointer hover:bg-blue-100/60 transition"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-blue-950">🛠️ Downhole Tools Tab</span>
                    <span className="text-lg font-extrabold font-mono text-blue-900">
                      {lineItems.filter((i) => i.category === 'Tools').length}
                    </span>
                  </div>
                  <div className="text-[11px] text-blue-800 mt-1">
                    Jars, shock tools, stabilizers &amp; fishing assemblies
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('Man Power')}
                  className="p-3 bg-purple-50/50 border border-purple-200 rounded cursor-pointer hover:bg-purple-100/60 transition"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-purple-950">👷 Man Power Tab</span>
                    <span className="text-lg font-extrabold font-mono text-purple-900">
                      {lineItems.filter((i) => i.category === 'Man Power').length}
                    </span>
                  </div>
                  <div className="text-[11px] text-purple-800 mt-1">
                    Field drilling engineers, MWD specialists &amp; crew
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('Inventory')}
                  className="p-3 bg-amber-50/50 border border-amber-200 rounded cursor-pointer hover:bg-amber-100/60 transition"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-amber-950">📦 Inventory Assets Tab</span>
                    <span className="text-lg font-extrabold font-mono text-amber-900">
                      {lineItems.filter((i) => i.category === 'Inventory').length}
                    </span>
                  </div>
                  <div className="text-[11px] text-amber-800 mt-1">
                    Certified cargo baskets, pup joints &amp; crossovers
                  </div>
                </div>
              </div>
            </div>

            {/* Estimated Commercial Financial Total */}
            <div className="p-3 bg-[#1a3055] text-white rounded flex items-center justify-between">
              <div>
                <div className="font-bold text-sm">Active Period Estimated Billing ({MONTH_NAMES[selectedMonthIdx]} {selectedYear})</div>
                <div className="text-xs text-slate-300">
                  Total Standby ({overallCommercialTotal.grandSb} Days) + Total Ops ({overallCommercialTotal.grandOps} Days)
                </div>
              </div>
              <div className="text-xl font-mono font-extrabold bg-[#ffd875] text-[#4a2e00] px-4 py-1.5 rounded border border-[#c8860d]">
                {rateConfig.currency} {overallCommercialTotal.grandRev.toLocaleString()}
              </div>
            </div>

            {/* Monthly Invoicing Summary for this Job (August, September, etc. with Total Invoice for the job) */}
            <div className="border border-slate-200 rounded overflow-hidden bg-white shadow-2xs">
              <div className="bg-[#e4eef8] px-3.5 py-2.5 border-b border-[#b8c9db] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wide text-[#1a3055] flex items-center gap-1.5">
                    <span>🧾</span> 4. Monthly Invoicing Summary for Job ({currentJob.id})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    High-level commercial values for months performed on this job with total invoice summary
                  </p>
                </div>
                <button
                  onClick={() => setIsSubmitInvoiceModalOpen(true)}
                  className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <span>🧾</span> Submit for Invoice
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                      <th className="py-2.5 px-3">Billing Month</th>
                      <th className="py-2.5 px-3 text-center">Standby Days</th>
                      <th className="py-2.5 px-3 text-center">Operating Days</th>
                      <th className="py-2.5 px-3 text-right">Invoiced Net Amount</th>
                      <th className="py-2.5 px-3 text-center">Invoice Status</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {jobMonthlySummaries.map((ms) => (
                      <tr
                        key={ms.ym}
                        className={`hover:bg-blue-50/50 transition ${
                          ms.isCurrentPeriod ? 'bg-amber-50/50 font-medium' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">
                              {ms.monthName} {ms.year}
                            </span>
                            {ms.isCurrentPeriod && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-blue-100 text-blue-900 border border-blue-200">
                                Active Period
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-blue-900 font-semibold">
                          {ms.standbyDays} Days
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-emerald-900 font-semibold">
                          {ms.opsDays} Days
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 text-xs">
                          {rateConfig.currency} {ms.invoicedAmount.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {ms.invoiceNumber ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-block">
                              {ms.invoiceNumber}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-block">
                              Ready to Submit
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => {
                              setSelectedYear(ms.year);
                              setSelectedMonthIdx(ms.monthIdx);
                              setActiveTab('Tools');
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold text-[#1a3055] hover:text-blue-700 hover:underline cursor-pointer"
                          >
                            View Grid &rarr;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#1a3055] text-white font-bold border-t-2 border-[#c8860d]">
                      <td className="py-2.5 px-3 text-xs uppercase tracking-wide">
                        Total Invoice for Job ({currentJob.id})
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-blue-200">
                        {jobGrandTotal.totalSb} Days SB
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-emerald-200">
                        {jobGrandTotal.totalOps} Days Ops
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sm font-extrabold text-[#ffd875]">
                        {rateConfig.currency} {jobGrandTotal.grandTotal.toLocaleString()}
                      </td>
                      <td colSpan={2} className="py-2.5 px-3 text-right text-[11px] text-slate-300 font-normal">
                        Accumulated across {jobMonthlySummaries.length} job billing periods
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 2: GRID FOR TOOLS, MAN POWER, OR INVENTORY */}
        {activeTab !== 'Header' && (
          <div className="p-3 space-y-3">
            {/* Epicor Controls & Parameters Bar (Matching Screenshot 3) */}
            <div className="bg-[#f8fafc] border border-slate-200 rounded p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Year & Month Selection matching Epicor */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="font-bold text-slate-700">Year :</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                    className="border border-slate-300 rounded px-2.5 py-1 bg-white font-mono font-bold text-slate-800 outline-none"
                  >
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                    <option value={2027}>2027</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="font-bold text-slate-700">Month :</label>
                  <select
                    value={selectedMonthIdx}
                    onChange={(e) => setSelectedMonthIdx(parseInt(e.target.value, 10))}
                    className="border border-slate-300 rounded px-2.5 py-1 bg-white font-bold text-slate-800 outline-none"
                  >
                    {MONTH_NAMES.map((m, idx) => (
                      <option key={m} value={idx}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick Search */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search 100+ lines..."
                    className="border border-slate-300 rounded px-2.5 py-1 bg-white w-48 outline-none text-xs"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600 font-bold">
                      &times;
                    </button>
                  )}
                </div>
              </div>

              {/* Exact Epicor Operational Guide Notice (as shown in Screenshot 3) */}
              <div className="bg-white border border-blue-200 px-3 py-1 rounded shadow-2xs font-mono text-[11px] text-right">
                <div className="font-bold text-emerald-800">Enter 1 for Operation</div>
                <div className="font-bold text-blue-800">Enter S for Standby</div>
              </div>
            </div>

            {/* Epicor Action Buttons Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  title="Copy active row or entire grid formatted for Excel (Ctrl+C)"
                  className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 cursor-pointer shadow-2xs flex items-center gap-1"
                >
                  <span>📋</span> Copy
                </button>
                <button
                  onClick={handlePaste}
                  title="Paste values copied from Excel (Ctrl+V)"
                  className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 cursor-pointer shadow-2xs flex items-center gap-1"
                >
                  <span>📥</span> Paste
                </button>
                <button
                  onClick={handleClearSelection}
                  title="Clear values from selected cells or active row"
                  className="px-2.5 py-1 rounded bg-slate-50 text-slate-600 font-bold text-xs border border-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>

              {/* Invoicing, Export & Scroller Navigators */}
              <div className="flex items-center gap-2">
                {/* Horizontal side scroller controls */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-300">
                  <button
                    onClick={() => handleScrollDays('left')}
                    title="Scroll Days Left"
                    className="px-2 py-0.5 rounded bg-white hover:bg-slate-200 text-slate-700 font-bold cursor-pointer text-xs"
                  >
                    &larr; Days
                  </button>
                  <button
                    onClick={() => handleScrollDays('right')}
                    title="Scroll Days Right"
                    className="px-2 py-0.5 rounded bg-white hover:bg-slate-200 text-slate-700 font-bold cursor-pointer text-xs"
                  >
                    Days &rarr;
                  </button>
                </div>

                <button
                  onClick={handleExportXLSX}
                  className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-2xs cursor-pointer"
                >
                  📥 Export XLSX
                </button>
                <button
                  onClick={() => {
                    showToast(`Utilization submitted for invoice generation (${rateConfig.currency} ${monthTotals.totalRev.toLocaleString()})`, 'ok');
                  }}
                  className="px-3 py-1 rounded bg-[#ffd875] text-[#4a2e00] font-bold text-xs border border-[#c8860d] hover:brightness-105 shadow-2xs cursor-pointer"
                >
                  Submit for Invoice
                </button>
              </div>
            </div>

            {/* High-Density Epicor Grid with Sticky Frozen Left Columns & Horizontal Side Scroller */}
            <div
              ref={scrollContainerRef}
              className="overflow-x-auto w-full border border-[#b8c9db] rounded shadow-2xs max-h-[650px] overflow-y-auto"
            >
              <table className="w-full text-xs text-left border-collapse min-w-[1400px]">
                <thead className="bg-[#1a3055] text-white font-bold uppercase text-[9px] tracking-wider sticky top-0 z-30">
                  <tr>
                    {/* 1. Line Number */}
                    <th className="px-1.5 py-1.5 text-center w-8 sticky left-0 bg-[#1a3055] z-40 border-r border-[#2a436e]">
                      #
                    </th>
                    {/* 2. DT Number */}
                    <th className="px-2 py-1.5 min-w-[95px] sticky left-[32px] bg-[#1a3055] z-40 border-r border-[#2a436e]">
                      DT No
                    </th>
                    {/* 3. Delivery Date (dd/mm/yy) */}
                    <th className="px-2 py-1.5 min-w-[85px] sticky left-[127px] bg-[#1a3055] z-40 border-r border-[#2a436e]">
                      Del Date
                    </th>
                    {/* 4. Asset Number */}
                    <th className="px-2 py-1.5 min-w-[110px] sticky left-[212px] bg-[#1a3055] z-40 border-r border-[#2a436e]">
                      Asset Number
                    </th>
                    {/* 5. Description */}
                    <th className="px-2 py-1.5 min-w-[200px] max-w-[260px] sticky left-[322px] bg-[#1a3055] z-40 border-r-2 border-slate-400 shadow-sm">
                      Description
                    </th>
                    {/* 6. Quantity */}
                    <th className="px-1.5 py-1.5 text-center w-9">
                      Qty
                    </th>
                    {/* 7. Status */}
                    <th className="px-1.5 py-1.5 text-center w-14">
                      Status
                    </th>

                    {/* Day Columns 1..daysInActiveMonth (Compact single day numbers 1, 2, 3...) */}
                    {Array.from({ length: daysInActiveMonth }).map((_, dIdx) => {
                      const day = dIdx + 1;
                      const dateStr = `${selectedYear}-${pad(selectedMonthIdx + 1)}-${pad(day)}`;
                      return (
                        <th
                          key={day}
                          className="px-0 py-1.5 text-center font-mono font-bold text-[10px] border-r border-[#2a436e]"
                          style={{ width: '22px', minWidth: '22px' }}
                          title={formatDateDDMMYY(dateStr)}
                        >
                          {day}
                        </th>
                      );
                    })}

                    {/* Summary Columns */}
                    <th className="px-1.5 py-1.5 text-center w-12 text-blue-300 sticky right-[160px] bg-[#1a3055] z-30">
                      SB Days
                    </th>
                    <th className="px-1.5 py-1.5 text-center w-12 text-emerald-300 sticky right-[108px] bg-[#1a3055] z-30">
                      Ops Days
                    </th>
                    <th className="px-1.5 py-1.5 text-center w-14 sticky right-[52px] bg-[#1a3055] z-30">
                      Rate ({rateConfig.currency})
                    </th>
                    <th className="px-2 py-1.5 text-right w-20 sticky right-0 bg-[#1a3055] z-30">
                      Total ({rateConfig.currency})
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]">
                  {displayedItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7 + daysInActiveMonth + 4}
                        className="p-10 text-center text-slate-500 font-medium"
                      >
                        No line items found for this tab or search query.
                      </td>
                    </tr>
                  ) : (
                    displayedItems.map((item) => {
                      const stats = calcItemStats(item, activeYM);
                      const isRowActive = activeRowId === item.id;

                      return (
                        <tr
                          key={item.id}
                          onClick={() => setActiveRowId(item.id)}
                          className={`hover:bg-slate-50 transition-colors ${
                            isRowActive ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          {/* Line Number */}
                          <td
                            className={`px-1.5 py-1 text-center font-mono font-semibold sticky left-0 z-20 border-r border-slate-200 text-[11px] ${
                              isRowActive
                                ? 'bg-blue-100 text-blue-900 font-bold border-l-3 border-l-blue-700'
                                : 'bg-white text-slate-600'
                            }`}
                          >
                            {item.lineNo}
                          </td>

                          {/* DT Number */}
                          <td className="px-2 py-1 font-mono text-slate-800 whitespace-nowrap sticky left-[32px] bg-white z-20 border-r border-slate-200 text-[11px]">
                            {item.dtNumber}
                          </td>

                          {/* Delivery Date (dd/mm/yy) */}
                          <td className="px-2 py-1 font-mono text-slate-800 whitespace-nowrap sticky left-[127px] bg-white z-20 border-r border-slate-200 text-[11px]">
                            {formatDateDDMMYY(item.deliveryDate)}
                          </td>

                          {/* Asset Number */}
                          <td className="px-2 py-1 font-mono font-bold text-[#1a3055] whitespace-nowrap sticky left-[212px] bg-white z-20 border-r border-slate-200 text-[11px]">
                            {item.assetNumber}
                          </td>

                          {/* Description */}
                          <td className="px-2 py-1 text-slate-800 font-medium text-[11px] leading-tight sticky left-[322px] bg-white z-20 border-r-2 border-slate-300 shadow-xs truncate max-w-[260px]">
                            {item.description}
                          </td>

                          {/* Quantity (Compact integer format) */}
                          <td className="px-1.5 py-1 text-center font-mono font-bold text-slate-700 text-[11px]">
                            {formatQty(item.quantity)}
                          </td>

                          {/* Status */}
                          <td className="px-1 py-1 text-center">
                            <span
                              className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                                item.status === 'On Rig'
                                    ? 'bg-blue-100 text-blue-900'
                                    : item.status === 'New'
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>

                          {/* Day Columns 1..daysInActiveMonth with continuous typing skipping locked dates */}
                          {Array.from({ length: daysInActiveMonth }).map((_, dIdx) => {
                            const day = dIdx + 1;
                            const cellDateStr = `${activeYM}-${pad(day)}`;
                            const cellKey = `${item.id}|${cellDateStr}`;
                            const val = cells[cellKey] || '';
                            const isCellSelected = selectedCells.has(cellKey);
                            const isFocused = focusedCell?.itemId === item.id && focusedCell?.day === day;
                            const allowedCheck = isCellDateAllowed(item, cellDateStr);

                            return (
                              <td
                                key={day}
                                className={`p-0 border-r border-slate-200 text-center relative ${
                                  !allowedCheck.allowed ? 'bg-slate-100/80' : ''
                                }`}
                                style={{ width: '22px', minWidth: '22px' }}
                              >
                                <div
                                  id={`util-cell-${item.id}-${day}`}
                                  tabIndex={allowedCheck.allowed ? 0 : -1}
                                  role="gridcell"
                                  title={
                                    !allowedCheck.allowed
                                      ? `Locked: ${allowedCheck.reason}`
                                      : `Line ${item.lineNo} Day ${day} (${formatDateDDMMYY(cellDateStr)})`
                                  }
                                  aria-label={`Line ${item.lineNo} Day ${day}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!allowedCheck.allowed) {
                                      showToast(`Day ${day} is outside valid period (${allowedCheck.reason})`, 'err');
                                      return;
                                    }
                                    setActiveRowId(item.id);
                                    focusCell(item.id, day);
                                    if (e.shiftKey) {
                                      setSelectedCells((prev) => new Set([...prev, cellKey]));
                                    } else {
                                      setSelectedCells(new Set([cellKey]));
                                    }
                                  }}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    if (!allowedCheck.allowed) {
                                      showToast(`Day ${day} is outside valid period (${allowedCheck.reason})`, 'err');
                                      return;
                                    }
                                    // Toggle between S -> 1 -> empty
                                    const nextVal = val === '' ? 'S' : val === 'S' ? '1' : '';
                                    setCells((prev) => ({ ...prev, [cellKey]: nextVal }));
                                    // Move to next allowed day
                                    let nextDay = day + 1;
                                    while (nextDay <= daysInActiveMonth) {
                                      const nextDateStr = `${activeYM}-${pad(nextDay)}`;
                                      if (isCellDateAllowed(item, nextDateStr).allowed) {
                                        focusCell(item.id, nextDay);
                                        break;
                                      }
                                      nextDay++;
                                    }
                                  }}
                                  onKeyDown={(e) => handleCellKeyDown(e, item, day)}
                                  className={`w-5.5 h-6 min-w-[22px] flex items-center justify-center font-mono font-bold text-[11px] transition outline-none select-none ${
                                    !allowedCheck.allowed
                                      ? 'cursor-not-allowed text-slate-300 opacity-50 bg-slate-100'
                                      : val === 'S'
                                      ? 'cursor-pointer bg-[#e8f2fe] text-[#1e3a5f]'
                                      : val === '1'
                                      ? 'cursor-pointer bg-[#eafaf1] text-[#14532d]'
                                      : 'cursor-pointer hover:bg-slate-100 text-transparent'
                                  } ${isFocused ? 'ring-2 ring-blue-700 z-20 bg-blue-100/70' : isCellSelected ? 'ring-2 ring-blue-500 z-10' : ''}`}
                                >
                                  {!allowedCheck.allowed ? '·' : val}
                                </div>
                              </td>
                            );
                          })}

                          {/* Standby Days */}
                          <td className="px-1.5 py-1 text-center font-mono font-bold text-blue-800 bg-blue-50/50 sticky right-[160px] z-10 text-[11px]">
                            {stats.billedSb}
                          </td>

                          {/* Ops Days */}
                          <td className="px-1.5 py-1 text-center font-mono font-bold text-emerald-800 bg-emerald-50/50 sticky right-[108px] z-10 text-[11px]">
                            {stats.opsCount}
                          </td>

                          {/* Day Rate */}
                          <td className="px-1.5 py-1 text-center font-mono text-slate-700 sticky right-[52px] bg-white z-10 text-[11px]">
                            {rateConfig.ops}
                          </td>

                          {/* Total Line Amount */}
                          <td className="px-2 py-1 text-right font-mono font-bold text-[#1a3055] sticky right-0 bg-slate-50 z-10 text-[11px]">
                            {stats.totalAmount.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })
                  )}

                  {/* Summary Footer Row */}
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 sticky bottom-0 z-20">
                    <td colSpan={7} className="px-3 py-1.5 text-right uppercase tracking-wider text-slate-700 text-[10px] sticky left-0 bg-slate-100 z-20 border-r border-slate-300">
                      {MONTH_NAMES[selectedMonthIdx]} {selectedYear} Billing Totals ({displayedItems.length} Lines):
                    </td>
                    {/* Day columns clean separator without confusing random numbers */}
                    {Array.from({ length: daysInActiveMonth }).map((_, dIdx) => (
                      <td
                        key={dIdx}
                        className="p-0 border-r border-slate-200 bg-slate-50/60"
                        style={{ width: '22px', minWidth: '22px' }}
                      />
                    ))}
                    <td className="px-1.5 py-1.5 text-center font-mono font-bold text-blue-900 sticky right-[160px] bg-slate-100 z-10 text-[11px]">
                      {monthTotals.totalSb}
                    </td>
                    <td className="px-1.5 py-1.5 text-center font-mono font-bold text-emerald-900 sticky right-[108px] bg-slate-100 z-10 text-[11px]">
                      {monthTotals.totalOps}
                    </td>
                    <td className="sticky right-[52px] bg-slate-100 z-10 text-center text-slate-400 font-mono text-[10px]">-</td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold text-[#1a3055] sticky right-0 bg-slate-200 z-10 text-[11px]">
                      {monthTotals.totalRev.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Billing Summary Breakdown Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gradient-to-r from-slate-50 via-blue-50/30 to-slate-50 p-3 rounded-lg border border-[#b8c9db] shadow-2xs">
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Active Billed Assets
                </div>
                <div className="text-base font-extrabold font-mono text-[#1a3055]">
                  {displayedItems.length} Equipment Lines
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {currentJob?.jobNo || 'All Active Lines'} &bull; {MONTH_NAMES[selectedMonthIdx]} {selectedYear}
                </div>
              </div>

              <div className="space-y-0.5 border-l border-slate-200 pl-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                  Standby Accrual (50%)
                </div>
                <div className="text-base font-extrabold font-mono text-blue-900">
                  {monthTotals.totalSb} Days
                </div>
                <div className="text-[10px] text-slate-500">
                  Tariff: {rateConfig.standby} {rateConfig.currency}/day
                </div>
              </div>

              <div className="space-y-0.5 border-l border-slate-200 pl-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Operating Accrual (100%)
                </div>
                <div className="text-base font-extrabold font-mono text-emerald-900">
                  {monthTotals.totalOps} Days
                </div>
                <div className="text-[10px] text-slate-500">
                  Tariff: {rateConfig.ops} {rateConfig.currency}/day
                </div>
              </div>

              <div className="space-y-0.5 border-l border-slate-200 pl-3 bg-white/70 -m-1 p-2 rounded border border-blue-200">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                  Total Monthly Invoiced Net
                </div>
                <div className="text-lg font-black font-mono text-[#1a3055]">
                  {monthTotals.totalRev.toLocaleString()} {rateConfig.currency}
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold">
                  Calculated per contract tariff schedule
                </div>
              </div>
            </div>

            {/* Grid Helper Banner */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
              <div className="flex items-center gap-3">
                <span>Click any cell and type <strong>1</strong> (Operation) or <strong>S</strong> (Standby). Press <strong>Delete</strong> to clear.</span>
                <span>&bull;</span>
                <span>Use <strong>Copy</strong> and <strong>Paste</strong> to exchange data with Excel.</span>
              </div>
              <div className="font-mono font-bold text-slate-700">
                Active View: {displayedItems.length} {activeTab} Records
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submit for Invoice Modal (Functional Commercial Billing Workflow) */}
      {isSubmitInvoiceModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsSubmitInvoiceModalOpen(false);
          }}
        >
          <div className="bg-white rounded-lg border border-[#b8c9db] shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-[#1a3055] text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🧾</span>
                <div>
                  <h3 className="font-bold text-sm leading-tight">
                    Commercial Invoice Submission &bull; {MONTH_NAMES[selectedMonthIdx]} {selectedYear}
                  </h3>
                  <div className="text-[11px] text-blue-200">
                    Commercial Invoicing Gateway &bull; Job {currentJob.id} ({currentJob.client})
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsSubmitInvoiceModalOpen(false)}
                className="text-white/80 hover:text-white font-bold text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* Submission Status Alert */}
              {activeMonthInvoice ? (
                <div className="bg-emerald-50 border border-emerald-300 rounded p-3 flex items-start gap-3">
                  <span className="text-xl">✅</span>
                  <div className="flex-1">
                    <div className="font-bold text-emerald-950 text-xs">
                      Invoice Transmitted to Accounts
                    </div>
                    <div className="text-[11px] text-emerald-800 mt-0.5">
                      Invoice Reference:{' '}
                      <strong className="font-mono">{activeMonthInvoice.invoiceNo}</strong> &bull; Submitted on{' '}
                      {activeMonthInvoice.submittedAt}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSubmittedInvoices((prev) => {
                        const next = { ...prev };
                        delete next[activeYM];
                        return next;
                      });
                      showToast(`Invoice for ${MONTH_NAMES[selectedMonthIdx]} ${selectedYear} reopened for edits`, 'inf');
                    }}
                    className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 shadow-2xs text-[11px] cursor-pointer"
                  >
                    Reopen for Edits
                  </button>
                </div>
              ) : (
                <div className="bg-blue-50/70 border border-blue-200 rounded p-3 text-slate-700">
                  <div className="font-bold text-[#1a3055] text-xs flex items-center gap-1.5 mb-1">
                    <span>ℹ️</span> Invoice Generation Function
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    This function consolidates daily operational (1) and standby (S) utilization across all job resources
                    for <strong>{MONTH_NAMES[selectedMonthIdx]} {selectedYear}</strong> into a verified commercial invoice packet.
                  </p>
                </div>
              )}

              {/* Job & Rig Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-slate-50 rounded border border-slate-200 text-[11px]">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[9px] block">Client Operator</span>
                  <strong className="text-[#1a3055]">{currentJob.client}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[9px] block">Rig / Well Location</span>
                  <strong className="text-slate-800">{currentJob.rig} / {currentJob.well}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[9px] block">Purchase Order (PO)</span>
                  <strong className="font-mono text-slate-800">{currentJob.poNumber || 'PO-EMD-2026'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[9px] block">Contract Daily Tariff</span>
                  <span className="font-mono text-blue-900 font-semibold">
                    {rateConfig.currency} {rateConfig.standby} SB / {rateConfig.ops} Ops
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[9px] block">Standby Days (50%)</span>
                  <span className="font-mono font-bold text-blue-900">{monthTotals.totalSb} Days</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[9px] block">Operating Days (100%)</span>
                  <span className="font-mono font-bold text-emerald-900">{monthTotals.totalOps} Days</span>
                </div>
              </div>

              {/* Resource Breakdown Table */}
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase border-b">
                    <tr>
                      <th className="py-1.5 px-3">Resource Category</th>
                      <th className="py-1.5 px-3 text-center">Billed Lines</th>
                      <th className="py-1.5 px-3 text-right">Net Tariff ({rateConfig.currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[11px]">
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">
                        🛠️ Downhole Tools &amp; Assemblies
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-600">
                        {activeMonthInvoiceBreakdown.toolsCount} items
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                        {activeMonthInvoiceBreakdown.toolsAmount.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">
                        👷 Personnel &amp; Field Engineering
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-600">
                        {activeMonthInvoiceBreakdown.manpowerCount} crew
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                        {activeMonthInvoiceBreakdown.manpowerAmount.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">
                        📦 Inventory Assets &amp; Baskets
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-600">
                        {activeMonthInvoiceBreakdown.inventoryCount} items
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                        {activeMonthInvoiceBreakdown.inventoryAmount.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold text-xs border-t">
                    <tr>
                      <td className="py-1.5 px-3 text-slate-600">Net Operational Subtotal:</td>
                      <td className="py-1.5 px-3 text-center font-mono text-slate-500">
                        {activeMonthInvoiceBreakdown.totalLines} lines
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-slate-900">
                        {rateConfig.currency} {activeMonthInvoiceBreakdown.subtotal.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="py-1.5 px-3 text-slate-600">
                        UAE Standard VAT (5%):
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-slate-700">
                        {rateConfig.currency} {activeMonthInvoiceBreakdown.vatAmount.toLocaleString()}
                      </td>
                    </tr>
                    <tr className="bg-[#1a3055] text-white">
                      <td colSpan={2} className="py-2 px-3 font-bold uppercase tracking-wider text-[11px]">
                        Total Invoiced Amount Payable:
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-sm font-extrabold text-[#ffd875]">
                        {rateConfig.currency} {activeMonthInvoiceBreakdown.totalWithVat.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <button
                type="button"
                onClick={() => setIsSubmitInvoiceModalOpen(false)}
                className="px-3.5 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
              >
                Close Window
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleExportXLSX();
                    showToast('Invoice backup spreadsheet exported', 'ok');
                  }}
                  className="px-3 py-1.5 rounded bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <span>📥</span> Export Backup XLSX
                </button>

                {!activeMonthInvoice ? (
                  <button
                    type="button"
                    onClick={handleConfirmSubmitInvoice}
                    className="px-4 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-2xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🧾</span> Confirm &amp; Submit to Accounts
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      showToast(`Invoice ${activeMonthInvoice.invoiceNo} is officially filed with Accounts`, 'ok');
                      setIsSubmitInvoiceModalOpen(false);
                    }}
                    className="px-4 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow-2xs cursor-pointer"
                  >
                    Done &bull; Invoice Filed
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Line Item Modal (for Tools, Man Power, or Inventory) */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddModalOpen(false);
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center">
              <h3 className="font-bold text-sm">Add Resource to Utilization Master Grid</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddItem} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Resource Category Tab *</label>
                <select
                  value={newItemCat}
                  onChange={(e) => setNewItemCat(e.target.value as any)}
                  className="w-full border rounded px-3 py-2 font-bold bg-white"
                >
                  <option value="Tools">🛠️ Tools (Downhole Drilling &amp; Rental)</option>
                  <option value="Man Power">👷 Man Power (Engineers &amp; Personnel)</option>
                  <option value="Inventory">📦 Inventory (Cargo Baskets &amp; Crossovers)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {newItemCat === 'Man Power'
                    ? 'Employee ID *'
                    : newItemCat === 'Tools'
                    ? 'Tool Serial / Asset # *'
                    : 'Inventory Asset Code *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    newItemCat === 'Man Power'
                      ? 'e.g. EMP-910'
                      : newItemCat === 'Tools'
                      ? 'e.g. JAR-203-881'
                      : 'e.g. BSK-16-004'
                  }
                  value={newItemAsset}
                  onChange={(e) => setNewItemAsset(e.target.value)}
                  className="w-full border rounded px-3 py-1.5 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {newItemCat === 'Man Power'
                    ? 'Field Engineer Role & Name *'
                    : newItemCat === 'Tools'
                    ? 'Tool Description & Specifications *'
                    : 'Inventory Asset Description *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    newItemCat === 'Man Power'
                      ? 'e.g. MWD Field Engineer (Saeed Al-Nuaimi)'
                      : newItemCat === 'Tools'
                      ? 'e.g. 8" Hydraulic Fishing Jar 6-5/8 Reg Pin x Box'
                      : 'e.g. 16ft Cargo Handling Basket with Slings'
                  }
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  className="w-full border rounded px-3 py-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">DT / MOB Ref</label>
                  <input
                    type="text"
                    placeholder="e.g. DT-03165"
                    value={newItemDt}
                    onChange={(e) => setNewItemDt(e.target.value)}
                    className="w-full border rounded px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mobilization Date</label>
                  <input
                    type="date"
                    value={newItemDate}
                    onChange={(e) => setNewItemDate(e.target.value)}
                    className="w-full border rounded px-3 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow cursor-pointer"
                >
                  Save to {newItemCat} &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Paste from Excel Modal */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-[#b8c9db] shadow-xl w-full max-w-lg p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h2 className="text-sm font-bold text-[#1a3055] flex items-center gap-1.5">
                  <span>📋</span> Paste Utilization from Excel
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Copy days (or rows) in Excel, paste here with Ctrl+V, and click Apply.
                </p>
              </div>
              <button
                onClick={() => setIsPasteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                &times;
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Excel Data Buffer (Tab-Separated or CSV):
              </label>
              <textarea
                rows={6}
                value={pasteModalText}
                onChange={(e) => setPasteModalText(e.target.value)}
                placeholder="Paste copied Excel cells here (Ctrl+V)&#10;e.g. 1	1	1	S	S..."
                className="w-full border border-slate-300 rounded p-2 text-xs font-mono bg-slate-50 focus:bg-white outline-none focus:ring-1 focus:ring-blue-600"
                autoFocus
              />
              <div className="text-[10px] text-slate-500">
                Target: {activeRowId ? `Starting at active row (${displayedItems.find((i) => i.id === activeRowId)?.assetNumber || activeRowId})` : 'Starting at line 1'}
              </div>
            </div>

            <div className="pt-3 border-t flex justify-end space-x-2 text-xs">
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 border border-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  applyExcelPastedText(pasteModalText);
                  setIsPasteModalOpen(false);
                }}
                className="px-4 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow-sm cursor-pointer"
              >
                Apply to Grid &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-12 right-6 z-50 px-4 py-2.5 rounded-lg text-white font-bold text-xs shadow-lg animate-in slide-in-from-bottom-2 ${
            toast.type === 'ok' ? 'bg-emerald-700' : 'bg-[#1a3055]'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}
