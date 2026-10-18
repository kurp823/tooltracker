import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  PurchaseOrder,
  POLineItem,
  GoodsReceiptNote,
  GRNLineItem,
  ProcurementClassification,
  SubDivision,
} from '../types';
import {
  loadPurchaseOrders,
  saveAllPurchaseOrders,
  createPurchaseOrder,
  deletePurchaseOrder,
  loadGoodsReceiptNotes,
  saveAllGoodsReceiptNotes,
  postGoodsReceiptNote,
  getSupplierBalanceReport,
  parseBulkPOCSV,
  SupplierBalanceSummary,
} from '../services/poManagementService';
import { CONTRACT_SUB_DIVISIONS, resolveContractSubDivision } from '../services/customContracts';
import { getDropdownOptions } from '../services/dropdownService';
import {
  FileText,
  Plus,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  Printer,
  Trash2,
  Building2,
  Calendar,
  DollarSign,
  Search,
  Filter,
  CheckSquare,
  ShieldCheck,
  PackageCheck,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';

interface POManagementViewProps {
  user?: User | null;
  onNavigate?: (module: string, param?: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  categories?: string[];
  sizes?: string[];
}

type ActiveTab = 'po-register' | 'grn-inward' | 'supplier-report' | 'grn-history';

export const POManagementView: React.FC<POManagementViewProps> = ({
  user,
  onNavigate,
  showToast,
  categories,
  sizes,
}) => {
  const isAdmin = user?.role === 'Admin';
  const [activeTab, setActiveTab] = useState<ActiveTab>('grn-inward');

  // Master Data
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [grnList, setGrnList] = useState<GoodsReceiptNote[]>([]);
  const [supplierBalances, setSupplierBalances] = useState<SupplierBalanceSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Load Data
  const refreshData = () => {
    setPurchaseOrders(loadPurchaseOrders());
    setGrnList(loadGoodsReceiptNotes());
    setSupplierBalances(getSupplierBalanceReport());
  };

  useEffect(() => {
    refreshData();
    const handleUpdate = () => refreshData();
    window.addEventListener('po_updated', handleUpdate);
    window.addEventListener('grn_updated', handleUpdate);
    return () => {
      window.removeEventListener('po_updated', handleUpdate);
      window.removeEventListener('grn_updated', handleUpdate);
    };
  }, []);

  // Dropdowns from Master Registry
  const supplierOptions = useMemo(() => {
    const list = getDropdownOptions('suppliers');
    return list.length > 0 ? list : ['EMDAD', 'Motormax Drilling Technologies', 'Epis Oilfield Services', 'Coretrax', 'Weatherford'];
  }, []);
  const contractOptions = Object.keys(CONTRACT_SUB_DIVISIONS);

  // Link Tool Categories from database tables (customCategories / tbl_ToolCategories)
  const availableCategories = useMemo(() => {
    const list = [...(categories || [])];
    if (list.length === 0) {
      try {
        const s = localStorage.getItem('emdad_custom_categories');
        if (s) {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed) && parsed.length > 0) list.push(...parsed);
        }
      } catch {}
    }
    const defaults = [
      'GAUGE RING',
      'BIT SUB',
      'CARGO BASKET',
      'CROSSOVER SUB',
      'CUTLIP GUIDE',
      'DRILL PIPE',
      'DRILLING JAR',
      'FISHING JAR',
      'GUNDRILL REAMER',
      'HOLE OPENER',
      'HYD DRILLING JAR',
      'MOTOR',
      'OVERSHOT',
      'REDRESS KIT',
      'ROLLER REAMER',
      'SAFETY VALVE',
      'STABILIZER',
      'WHIPSTOCK',
      'DOWNHOLE TOOLS',
      'CONSUMABLES / SPARES',
    ];
    defaults.forEach((d) => {
      if (!list.includes(d)) list.push(d);
    });
    return Array.from(new Set(list));
  }, [categories]);

  // Link Tool Sizes from database tables (customSizes / tbl_ToolSizes)
  const availableSizes = useMemo(() => {
    const list = [...(sizes || [])];
    if (list.length === 0) {
      try {
        const s = localStorage.getItem('emdad_custom_sizes');
        if (s) {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed) && parsed.length > 0) list.push(...parsed);
        }
      } catch {}
    }
    const defaults = [
      '3-1/2"',
      '4-3/4"',
      '5-3/4"',
      '5-7/8"',
      '6"',
      '6-1/2"',
      '6-3/4"',
      '8"',
      '8-1/8"',
      '8-1/2"',
      '8-3/8"',
      '8-5/16"',
      '9-1/2"',
      '11-3/4"',
      '12-1/4"',
      '14-3/4"',
      '17-1/2"',
      '26"',
    ];
    defaults.forEach((d) => {
      if (!list.includes(d)) list.push(d);
    });
    return Array.from(new Set(list));
  }, [sizes]);

  // =========================================================================
  // TAB 1: PO CREATION & REGISTER STATE
  // =========================================================================
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPoHeader, setNewPoHeader] = useState({
    poNumber: `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    supplier: supplierOptions[0] || 'EMDAD',
    orderDate: new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: '',
    currency: 'AED' as 'AED' | 'USD',
    contractRef: '4700024608',
    notes: '',
  });

  const [poLines, setPoLines] = useState<Omit<POLineItem, 'lineId' | 'itemNo' | 'receivedQty' | 'balanceQty'>[]>([
    {
      partNo: '',
      description: '',
      category: 'Downhole Tools',
      size: '6-3/4"',
      contractRef: '4700024608',
      subDivision: 'FISHING',
      orderedQty: 1,
      unitPrice: 0,
      totalPrice: 0,
      classification: 'INVENTORY',
      belongsTo: 'EMDAD',
    },
  ]);

  const handleAddPoLine = () => {
    const parentContract = newPoHeader.contractRef;
    const parentDiv = resolveContractSubDivision(parentContract) || 'FISHING';
    setPoLines([
      ...poLines,
      {
        partNo: '',
        description: '',
        category: 'Spares',
        size: '',
        contractRef: parentContract,
        subDivision: parentDiv,
        orderedQty: 1,
        unitPrice: 0,
        totalPrice: 0,
        classification: 'CONSUMABLE',
        belongsTo: 'EMDAD',
      },
    ]);
  };

  const handleRemovePoLine = (index: number) => {
    if (poLines.length <= 1) return;
    setPoLines(poLines.filter((_, idx) => idx !== index));
  };

  const handlePoLineChange = (index: number, field: string, val: any) => {
    setPoLines((prev) => {
      const next = [...prev];
      const target = { ...next[index], [field]: val };

      if (field === 'contractRef') {
        target.subDivision = resolveContractSubDivision(val) || target.subDivision;
      }
      if (field === 'orderedQty' || field === 'unitPrice') {
        const qty = field === 'orderedQty' ? parseFloat(val) || 0 : target.orderedQty;
        const price = field === 'unitPrice' ? parseFloat(val) || 0 : target.unitPrice;
        target.totalPrice = qty * price;
      }

      next[index] = target;
      return next;
    });
  };

  const handleSavePO = () => {
    if (!isAdmin) {
      showToast?.('Only Admin users can create Purchase Orders.', 'error');
      return;
    }
    if (!newPoHeader.poNumber.trim()) {
      showToast?.('PO Number is required.', 'error');
      return;
    }
    if (poLines.some((l) => !l.description.trim() || l.orderedQty <= 0)) {
      showToast?.('Please ensure all lines have a description and quantity > 0.', 'error');
      return;
    }

    const subDiv = resolveContractSubDivision(newPoHeader.contractRef) || 'RENTALS';

    createPurchaseOrder({
      poNumber: newPoHeader.poNumber.trim(),
      supplier: newPoHeader.supplier,
      orderDate: newPoHeader.orderDate,
      expectedDeliveryDate: newPoHeader.expectedDeliveryDate,
      currency: newPoHeader.currency,
      contractRef: newPoHeader.contractRef,
      subDivision: subDiv,
      notes: newPoHeader.notes,
      totalAmount: poLines.reduce((s, l) => s + (l.totalPrice || l.orderedQty * l.unitPrice), 0),
      status: 'OPEN',
      createdBy: user?.name || 'Admin',
      lines: poLines as any,
    });

    showToast?.(`Purchase Order ${newPoHeader.poNumber} created successfully!`, 'success');
    setShowCreateModal(false);
    refreshData();
  };

  // Bulk CSV Upload
  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const res = parseBulkPOCSV(text);
      if (res.success && res.lines.length > 0) {
        setPoLines(res.lines as any);
        showToast?.(`Loaded ${res.lines.length} lines from CSV!`, 'success');
      } else {
        showToast?.(res.errors[0] || 'Failed to parse CSV.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadSampleCSV = () => {
    const csvContent =
      'PartNo,Description,Category,Size,ContractRef,Quantity,UnitPrice,Classification\n' +
      'RG-600-01,6" NO GO RING GAUGE,GAUGE RING,6",4700024608,1,12000,ASSET\n' +
      'RG-812-01,8-1/2" NO GO RING GAUGE,GAUGE RING,8-1/2",4700023373,1,200,INVENTORY\n' +
      'RK-JAR-675,Redress Seal Kit 6-3/4" Jar,REDRESS KIT,6-3/4",4700018368,5,1850,CONSUMABLE\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PO_Line_Items_Template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // =========================================================================
  // TAB 2: MULTI-LINE GOODS RECEIPT NOTE (GRN) STATE ("Newreceipts")
  // =========================================================================
  const [currentGrnIndex, setCurrentGrnIndex] = useState<number>(0);
  const [selectedGrnRowIdx, setSelectedGrnRowIdx] = useState<number>(0);
  const [searchGrtVal, setSearchGrtVal] = useState<string>('DN2023-0075');
  const [isUpdateMode, setIsUpdateMode] = useState<boolean>(true);

  const [grnHeader, setGrnHeader] = useState({
    ticketNo: '230',
    supplier: 'EMDAD',
    supplierDt: 'DN-66057',
    poNumber: '32175',
    dateRecd: '2023-08-15',
    mfgReceivedBy: 'NOOR ISLAM',
    currency: 'AED' as 'AED' | 'USD',
  });

  const [grnRows, setGrnRows] = useState<GRNLineItem[]>(() => {
    const list = loadGoodsReceiptNotes();
    if (list.length > 0) return list[0].lines;
    return [];
  });

  // Sync with grnList when it loads or currentGrnIndex changes
  useEffect(() => {
    if (grnList.length > 0) {
      const current = grnList[currentGrnIndex] || grnList[0];
      setGrnHeader({
        ticketNo: current.ticketNo,
        supplier: current.supplier,
        supplierDt: current.supplierDt,
        poNumber: current.poNumber,
        dateRecd: current.dateRecd,
        mfgReceivedBy: current.mfgReceivedBy || 'NOOR ISLAM',
        currency: current.currency,
      });
      setGrnRows(current.lines || []);
      setSearchGrtVal(current.supplierDt || current.ticketNo);
    }
  }, [grnList, currentGrnIndex]);

  // Load lines from selected PO into GRN
  const handleSelectPOForGRN = (poNum: string) => {
    const found = purchaseOrders.find((p) => p.poNumber === poNum);
    if (!found) return;

    setGrnHeader({
      ...grnHeader,
      poNumber: found.poNumber,
      supplier: found.supplier,
      currency: found.currency,
    });

    const rows: GRNLineItem[] = found.lines
      .filter((l) => l.balanceQty > 0)
      .map((l, idx) => {
        const subDiv = resolveContractSubDivision(l.contractRef || found.contractRef) || 'RENTALS';
        const bookVal = l.unitPrice;
        const usefulMonths = l.classification === 'ASSET' ? 60 : 0;
        const monthlyDep = usefulMonths > 0 ? Number((bookVal / usefulMonths).toFixed(2)) : 0;

        return {
          lineId: `GRNL-${Date.now()}-${idx}`,
          poLineId: l.lineId,
          partNo: l.partNo,
          description: l.description,
          category: l.category || availableCategories[0] || 'GAUGE RING',
          size: l.size || availableSizes[0] || '6"',
          toolsno: `${l.partNo || 'TL'}-${idx + 1}`,
          contractRef: l.contractRef || found.contractRef || '4700024608',
          subDivision: subDiv,
          qtyReceived: l.balanceQty,
          unitPrice: l.unitPrice,
          bookValue: bookVal,
          currency: found.currency,
          belongsTo: l.belongsTo || 'EMDAD',
          reqInsp: l.classification === 'INVENTORY' || l.classification === 'ASSET',
          insDate: new Date().toISOString().slice(0, 10),
          classification: l.classification,
          usefulLifeMonths: usefulMonths,
          salvageValue: 0,
          monthlyDepreciation: monthlyDep,
          comments: '',
        };
      });

    setGrnRows(rows.length > 0 ? rows : [
      {
        lineId: `GRNL-${Date.now()}-1`,
        partNo: '',
        description: '',
        category: availableCategories[0] || 'GAUGE RING',
        size: availableSizes[0] || '6"',
        toolsno: '',
        contractRef: found.contractRef || '4700024608',
        subDivision: resolveContractSubDivision(found.contractRef) || 'FISHING',
        qtyReceived: 1,
        unitPrice: 0,
        bookValue: 0,
        currency: found.currency,
        belongsTo: 'EMDAD',
        reqInsp: false,
        insDate: '',
        classification: 'INVENTORY',
        comments: '',
      }
    ]);
    setSelectedGrnRowIdx(0);
    showToast?.(`Loaded ${rows.length} pending lines from PO ${found.poNumber}`, 'info');
  };

  const handleAddGrnRow = () => {
    setGrnRows([
      ...grnRows,
      {
        lineId: `GRNL-${Date.now()}-${grnRows.length + 1}`,
        partNo: '',
        description: '',
        category: availableCategories[0] || 'GAUGE RING',
        size: availableSizes[0] || '6"',
        toolsno: '',
        contractRef: '4700024608',
        subDivision: 'FISHING',
        qtyReceived: 1,
        unitPrice: 0,
        bookValue: 0,
        currency: grnHeader.currency,
        belongsTo: 'EMDAD',
        reqInsp: false,
        insDate: '',
        classification: 'INVENTORY',
        comments: '',
      },
    ]);
    setSelectedGrnRowIdx(grnRows.length);
  };

  const handleRemoveGrnRow = (idx: number) => {
    if (grnRows.length <= 1) return;
    setGrnRows(grnRows.filter((_, i) => i !== idx));
    if (selectedGrnRowIdx >= grnRows.length - 1) {
      setSelectedGrnRowIdx(Math.max(0, grnRows.length - 2));
    }
  };

  const handleGrnRowChange = (index: number, field: string, val: any) => {
    setGrnRows((prev) => {
      const next = [...prev];
      const target = { ...next[index], [field]: val };

      if (field === 'contractRef') {
        target.subDivision = resolveContractSubDivision(val) || target.subDivision;
      }
      if (field === 'bookValue' || field === 'usefulLifeMonths') {
        const bv = field === 'bookValue' ? parseFloat(val) || 0 : target.bookValue;
        const months = field === 'usefulLifeMonths' ? parseInt(val) || 60 : target.usefulLifeMonths || 60;
        target.monthlyDepreciation = months > 0 ? Number((bv / months).toFixed(2)) : 0;
      }
      if (field === 'classification') {
        if (val === 'ASSET') {
          target.usefulLifeMonths = target.usefulLifeMonths || 60;
          target.monthlyDepreciation = Number(((target.bookValue || 0) / 60).toFixed(2));
        } else {
          target.usefulLifeMonths = undefined;
          target.monthlyDepreciation = undefined;
        }
      }

      next[index] = target;
      return next;
    });
  };

  const handleSearchGRT = () => {
    const q = searchGrtVal.trim().toUpperCase();
    const found = grnList.find(
      (g) =>
        (g.supplierDt || '').toUpperCase() === q ||
        (g.ticketNo || '').toUpperCase() === q ||
        (g.grnId || '').toUpperCase() === q
    );
    if (found) {
      const idx = grnList.findIndex((g) => g.grnId === found.grnId);
      if (idx >= 0) setCurrentGrnIndex(idx);
      setGrnHeader({
        ticketNo: found.ticketNo,
        supplier: found.supplier,
        supplierDt: found.supplierDt,
        poNumber: found.poNumber,
        dateRecd: found.dateRecd,
        mfgReceivedBy: found.mfgReceivedBy || '',
        currency: found.currency,
      });
      setGrnRows(found.lines || []);
      setSelectedGrnRowIdx(0);
      showToast?.(`Loaded Goods Receipt ${found.supplierDt || found.ticketNo}`, 'success');
    } else {
      showToast?.(`No Goods Receipt found matching "${searchGrtVal}".`, 'error');
    }
  };

  const handlePrevGRN = () => {
    if (grnList.length === 0) return;
    const nextIdx = currentGrnIndex > 0 ? currentGrnIndex - 1 : grnList.length - 1;
    setCurrentGrnIndex(nextIdx);
    const target = grnList[nextIdx];
    setGrnHeader({
      ticketNo: target.ticketNo,
      supplier: target.supplier,
      supplierDt: target.supplierDt,
      poNumber: target.poNumber,
      dateRecd: target.dateRecd,
      mfgReceivedBy: target.mfgReceivedBy || '',
      currency: target.currency,
    });
    setGrnRows(target.lines || []);
    setSearchGrtVal(target.supplierDt || target.ticketNo);
    setSelectedGrnRowIdx(0);
  };

  const handleNextGRN = () => {
    if (grnList.length === 0) return;
    const nextIdx = currentGrnIndex < grnList.length - 1 ? currentGrnIndex + 1 : 0;
    setCurrentGrnIndex(nextIdx);
    const target = grnList[nextIdx];
    setGrnHeader({
      ticketNo: target.ticketNo,
      supplier: target.supplier,
      supplierDt: target.supplierDt,
      poNumber: target.poNumber,
      dateRecd: target.dateRecd,
      mfgReceivedBy: target.mfgReceivedBy || '',
      currency: target.currency,
    });
    setGrnRows(target.lines || []);
    setSearchGrtVal(target.supplierDt || target.ticketNo);
    setSelectedGrnRowIdx(0);
  };

  const handleLastGRN = () => {
    if (grnList.length === 0) return;
    const nextIdx = grnList.length - 1;
    setCurrentGrnIndex(nextIdx);
    const target = grnList[nextIdx];
    setGrnHeader({
      ticketNo: target.ticketNo,
      supplier: target.supplier,
      supplierDt: target.supplierDt,
      poNumber: target.poNumber,
      dateRecd: target.dateRecd,
      mfgReceivedBy: target.mfgReceivedBy || '',
      currency: target.currency,
    });
    setGrnRows(target.lines || []);
    setSearchGrtVal(target.supplierDt || target.ticketNo);
    setSelectedGrnRowIdx(0);
  };

  const handleNewRecord = () => {
    const newTicket = String(Math.floor(200 + Math.random() * 800));
    setGrnHeader({
      ticketNo: newTicket,
      supplier: supplierOptions[0] || 'EMDAD',
      supplierDt: `DN-${Math.floor(10000 + Math.random() * 90000)}`,
      poNumber: '',
      dateRecd: new Date().toISOString().slice(0, 10),
      mfgReceivedBy: user?.name || 'NOOR ISLAM',
      currency: 'AED',
    });
    setGrnRows([
      {
        lineId: `GRNL-${Date.now()}-1`,
        partNo: '',
        description: '',
        category: availableCategories[0] || 'GAUGE RING',
        size: availableSizes[0] || '6"',
        toolsno: '',
        contractRef: '4700024608',
        subDivision: 'FISHING',
        qtyReceived: 1,
        unitPrice: 0,
        bookValue: 0,
        currency: 'AED',
        belongsTo: 'EMDAD',
        reqInsp: false,
        insDate: '',
        classification: 'INVENTORY',
        comments: '',
      },
    ]);
    setSelectedGrnRowIdx(0);
    showToast?.('Initialized new receipt record.', 'info');
  };

  const handleSaveOrUpdateGRN = () => {
    if (!isAdmin) {
      showToast?.('Only Admin users have permission to update or save Goods Receipts.', 'error');
      return;
    }
    if (!grnHeader.ticketNo.trim() || !grnHeader.supplierDt.trim()) {
      showToast?.('Ticket No and Supplier DT are required.', 'error');
      return;
    }
    if (grnRows.length === 0 || grnRows.some((r) => !r.description.trim() || (r.qtyReceived || 0) <= 0)) {
      showToast?.('All rows must have a description and received quantity > 0.', 'error');
      return;
    }

    const totalQty = grnRows.reduce((s, r) => s + (Number(r.qtyReceived) || 0), 0);
    const totalVal = grnRows.reduce((s, r) => s + (Number(r.bookValue || (r.qtyReceived * (r.unitPrice || 0))) || 0), 0);

    const existingIdx = grnList.findIndex(
      (g) => g.ticketNo === grnHeader.ticketNo || g.supplierDt === grnHeader.supplierDt
    );

    if (existingIdx >= 0) {
      const updatedList = [...grnList];
      updatedList[existingIdx] = {
        ...updatedList[existingIdx],
        ticketNo: grnHeader.ticketNo,
        supplierDt: grnHeader.supplierDt,
        dateRecd: grnHeader.dateRecd,
        supplier: grnHeader.supplier,
        poNumber: grnHeader.poNumber,
        mfgReceivedBy: grnHeader.mfgReceivedBy,
        currency: grnHeader.currency,
        totalItemsReceived: totalQty,
        totalInwardValue: totalVal,
        lines: grnRows,
      };
      saveAllGoodsReceiptNotes(updatedList);
      setGrnList(updatedList);
      showToast?.(`Receipt Ticket #${grnHeader.ticketNo} updated successfully!`, 'success');
    } else {
      const res = postGoodsReceiptNote({
        ticketNo: grnHeader.ticketNo,
        supplierDt: grnHeader.supplierDt,
        poNumber: grnHeader.poNumber || 'DIRECT-GRN',
        supplier: grnHeader.supplier,
        dateRecd: grnHeader.dateRecd,
        mfgReceivedBy: grnHeader.mfgReceivedBy,
        currency: grnHeader.currency,
        lines: grnRows,
      });
      if (res.success) {
        showToast?.(`Receipt Ticket #${grnHeader.ticketNo} created and registered in database!`, 'success');
        refreshData();
      } else {
        showToast?.(res.message, 'error');
      }
    }
  };

  // =========================================================================
  // PRINTABLE GRN MODAL
  // =========================================================================
  const [selectedGrnForPrint, setSelectedGrnForPrint] = useState<GoodsReceiptNote | null>(null);

  const handlePrintSlip = () => {
    window.print();
  };

  // Filtered POs
  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter((po) => {
      const matchSearch =
        po.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        po.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (po.contractRef || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || po.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [purchaseOrders, searchQuery, statusFilter]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 rounded-2xl text-white shadow-xl border border-slate-700">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 bg-amber-500 text-slate-950 text-xs font-black uppercase tracking-wider rounded-md">
              Procurement & Inventory Inward Hub
            </span>
            <span className="px-2.5 py-1 bg-indigo-500/30 text-indigo-200 text-xs font-semibold rounded-md border border-indigo-400/30">
              Live Contract & Sub-Division Integration
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Purchase Orders & Goods Inward (GRN)</h1>
          <p className="text-sm text-slate-300 mt-1">
            Bulk PO Upload, Multi-line Receiving, 3-Way Classification (Asset / Inventory / Consumable), and Supplier Balance Tracking
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              + Create Purchase Order
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2 shadow-sm gap-2">
        <button
          onClick={() => setActiveTab('po-register')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'po-register'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          📦 PO Register ({purchaseOrders.length})
        </button>

        <button
          onClick={() => setActiveTab('grn-inward')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'grn-inward'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          📥 Goods Receipt Note (GRN)
        </button>

        <button
          onClick={() => setActiveTab('supplier-report')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'supplier-report'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          📊 Supplier-wise Balance Report
        </button>

        <button
          onClick={() => setActiveTab('grn-history')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'grn-history'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Printer className="w-4 h-4" />
          📜 GRN History & Inward Slips ({grnList.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PO REGISTER */}
      {/* ========================================================================= */}
      {activeTab === 'po-register' && (
        <div className="bg-white rounded-b-xl rounded-tr-xl p-6 shadow-sm border border-slate-200 space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search PO #, Supplier, Contract..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="PARTIALLY_RECEIVED">Partially Received</option>
                <option value="FULFILLED">Fulfilled</option>
              </select>

              {isAdmin && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  + New PO
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {filteredPOs.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">No purchase orders found.</p>
              <p className="text-xs text-slate-400 mt-1">
                {isAdmin ? 'Click "+ Create Purchase Order" or upload via CSV.' : 'No active purchase orders recorded.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3 whitespace-nowrap">PO NUMBER</th>
                    <th className="p-3 whitespace-nowrap">SUPPLIER</th>
                    <th className="p-3 whitespace-nowrap">ORDER DATE</th>
                    <th className="p-3 whitespace-nowrap">CONTRACT REF</th>
                    <th className="p-3 whitespace-nowrap">SUB-DIVISION</th>
                    <th className="p-3 whitespace-nowrap text-right">TOTAL PO VALUE</th>
                    <th className="p-3 whitespace-nowrap text-right">INWARDED</th>
                    <th className="p-3 whitespace-nowrap text-right">BALANCE</th>
                    <th className="p-3 whitespace-nowrap text-center">STATUS</th>
                    <th className="p-3 whitespace-nowrap text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPOs.map((po) => {
                    const statusBadge =
                      po.status === 'FULFILLED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : po.status === 'PARTIALLY_RECEIVED'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800';

                    return (
                      <tr key={po.poId} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-mono font-bold text-indigo-700 whitespace-nowrap">
                          {po.poNumber}
                        </td>
                        <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">
                          {po.supplier}
                        </td>
                        <td className="p-3 text-slate-600 whitespace-nowrap">{po.orderDate}</td>
                        <td className="p-3 font-mono text-slate-700 whitespace-nowrap">
                          {po.contractRef || '—'}
                        </td>
                        <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">
                          {po.subDivision || 'RENTALS'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {po.currency} {(po.totalAmount || 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-700 font-semibold whitespace-nowrap">
                          {po.currency} {(po.inwardedAmount || 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-amber-700 whitespace-nowrap">
                          {po.currency} {(po.balanceAmount || 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${statusBadge}`}>
                            {po.status}
                          </span>
                        </td>
                        <td className="p-3 text-center whitespace-nowrap space-x-2">
                          <button
                            onClick={() => {
                              handleSelectPOForGRN(po.poNumber);
                              setActiveTab('grn-inward');
                            }}
                            className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-md transition-colors cursor-pointer"
                          >
                            Receive (GRN)
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => {
                                if (confirm(`Delete Purchase Order ${po.poNumber}?`)) {
                                  deletePurchaseOrder(po.poId);
                                  showToast?.(`Deleted PO ${po.poNumber}`, 'info');
                                  refreshData();
                                }
                              }}
                              className="px-2 py-1 text-rose-600 hover:bg-rose-50 text-xs rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: GOODS RECEIPT NOTE (GRN) MULTI-LINE INWARD ("Newreceipts") */}
      {/* ========================================================================= */}
      {activeTab === 'grn-inward' && (
        <div className="bg-white rounded-b-xl rounded-tr-xl p-4 shadow-sm border border-slate-200 space-y-4">
          {/* Top Form Header Container - Replicating Newreceipts in media_1792340689574_7db12f71.png */}
          <div className="bg-[#d9e2ec] border border-[#94a3b8] rounded-md p-3 shadow-inner">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                Newreceipts
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600 uppercase">Select PO:</span>
                <select
                  value={grnHeader.poNumber}
                  onChange={(e) => handleSelectPOForGRN(e.target.value)}
                  className="px-2 py-0.5 border border-slate-400 rounded bg-white text-xs font-mono font-bold text-indigo-950 shadow-sm"
                >
                  <option value="">-- Direct Goods Receipt (No PO) --</option>
                  {purchaseOrders
                    .filter((p) => p.status !== 'FULFILLED')
                    .map((p) => (
                      <option key={p.poId} value={p.poNumber}>
                        {p.poNumber} ({p.supplier} - Bal: {p.currency} {p.balanceAmount.toLocaleString()})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3 text-xs">
              {/* Left Column Fields */}
              <div className="space-y-1.5 min-w-[210px]">
                <div className="flex items-center gap-2">
                  <label className="w-20 font-semibold text-slate-700">Ticket No</label>
                  <input
                    type="text"
                    value={grnHeader.ticketNo}
                    disabled={!isAdmin}
                    onChange={(e) => setGrnHeader({ ...grnHeader, ticketNo: e.target.value })}
                    className="w-24 px-2 py-0.5 border border-slate-400 bg-white font-mono font-bold text-slate-900 shadow-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-20 font-semibold text-slate-700">Supplier DT</label>
                  <input
                    type="text"
                    value={grnHeader.supplierDt}
                    disabled={!isAdmin}
                    onChange={(e) => setGrnHeader({ ...grnHeader, supplierDt: e.target.value })}
                    placeholder="DN-66057"
                    className="w-24 px-2 py-0.5 border border-slate-400 bg-white font-mono text-slate-900 shadow-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-20 font-semibold text-slate-700">Date Recd</label>
                  <input
                    type="text"
                    value={grnHeader.dateRecd}
                    disabled={!isAdmin}
                    onChange={(e) => setGrnHeader({ ...grnHeader, dateRecd: e.target.value })}
                    placeholder="8/15/2023"
                    className="w-24 px-2 py-0.5 border border-slate-400 bg-white text-slate-900 shadow-sm font-medium"
                  />
                </div>
              </div>

              {/* Middle Column Fields */}
              <div className="space-y-1.5 min-w-[280px]">
                <div className="flex items-center gap-2">
                  <label className="w-16 font-semibold text-slate-700">Supplier</label>
                  <select
                    value={grnHeader.supplier}
                    disabled={!isAdmin}
                    onChange={(e) => setGrnHeader({ ...grnHeader, supplier: e.target.value })}
                    className="w-52 px-2 py-0.5 border border-slate-400 bg-white text-slate-900 shadow-sm font-medium"
                  >
                    {supplierOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-16 font-semibold text-slate-700">PO Num</label>
                  <input
                    type="text"
                    value={grnHeader.poNumber}
                    disabled={!isAdmin}
                    onChange={(e) => setGrnHeader({ ...grnHeader, poNumber: e.target.value })}
                    placeholder="32175"
                    className="w-28 px-2 py-0.5 border border-slate-400 bg-white font-mono font-bold text-slate-900 shadow-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-16 font-semibold text-slate-700">Mfg</label>
                  <input
                    type="text"
                    value={grnHeader.mfgReceivedBy}
                    disabled={!isAdmin}
                    onChange={(e) => setGrnHeader({ ...grnHeader, mfgReceivedBy: e.target.value })}
                    placeholder="NOOR ISLAM"
                    className="w-48 px-2 py-0.5 border border-slate-400 bg-white text-slate-900 shadow-sm font-medium"
                  />
                </div>
              </div>

              {/* Controls & Search */}
              <div className="space-y-2 min-w-[260px]">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="chkUpdateRecord"
                    checked={isUpdateMode}
                    onChange={(e) => setIsUpdateMode(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded-none border border-slate-400 bg-white cursor-pointer"
                  />
                  <button
                    onClick={handleSaveOrUpdateGRN}
                    className="px-3 py-1 bg-[#8fa4c4] hover:bg-[#7b93b5] text-slate-950 font-semibold text-xs rounded border border-[#6b82a3] shadow-sm cursor-pointer transition-colors"
                  >
                    Update Record
                  </button>
                  <button
                    onClick={handleNewRecord}
                    className="px-3 py-1 bg-[#8fa4c4] hover:bg-[#7b93b5] text-slate-950 font-semibold text-xs rounded border border-[#6b82a3] shadow-sm cursor-pointer transition-colors"
                  >
                    New Record
                  </button>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <span className="font-bold text-slate-800 whitespace-nowrap">Search GRT :</span>
                  <input
                    type="text"
                    value={searchGrtVal}
                    onChange={(e) => setSearchGrtVal(e.target.value)}
                    placeholder="DN2023-0075"
                    className="w-28 px-2 py-0.5 border border-slate-400 bg-white font-mono text-slate-900 shadow-sm"
                  />
                  <button
                    onClick={handleSearchGRT}
                    className="px-3 py-0.5 bg-[#558b2f] hover:bg-[#436d24] text-white font-bold text-xs rounded border border-[#33691e] shadow-sm cursor-pointer transition-colors"
                  >
                    Search
                  </button>
                </div>
              </div>

              {/* Right Stack Navigation: Prev, Next, Last */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={handlePrevGRN}
                  className="w-20 py-0.5 px-2 bg-[#8fa4c4] hover:bg-[#7b93b5] text-slate-950 font-semibold text-xs rounded border border-[#6b82a3] shadow-sm text-center cursor-pointer transition-colors"
                >
                  Prev
                </button>
                <button
                  onClick={handleNextGRN}
                  className="w-20 py-0.5 px-2 bg-[#8fa4c4] hover:bg-[#7b93b5] text-slate-950 font-semibold text-xs rounded border border-[#6b82a3] shadow-sm text-center cursor-pointer transition-colors"
                >
                  Next
                </button>
                <button
                  onClick={handleLastGRN}
                  className="w-20 py-0.5 px-2 bg-[#8fa4c4] hover:bg-[#7b93b5] text-slate-950 font-semibold text-xs rounded border border-[#6b82a3] shadow-sm text-center cursor-pointer transition-colors"
                >
                  Last
                </button>
              </div>
            </div>
          </div>

          {/* High-Density Spreadsheet Grid - Exact Replica of Access / Excel view */}
          <div className="overflow-x-auto border border-slate-400 bg-white shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#546377] text-white font-bold border-b border-slate-400 select-none">
                <tr className="divide-x divide-[#697a91]">
                  <th className="w-6 p-1 text-center bg-[#475569]"></th>
                  <th className="p-1 px-2 whitespace-nowrap">cat ▾</th>
                  <th className="p-1 px-2 whitespace-nowrap">Size ▾</th>
                  <th className="p-1 px-2 whitespace-nowrap">toolsno ▾</th>
                  <th className="p-1 px-2 whitespace-nowrap min-w-[220px]">description ▾</th>
                  <th className="p-1 px-2 whitespace-nowrap text-center">qtyin ▾</th>
                  <th className="p-1 px-2 whitespace-nowrap">Belongs to ▾</th>
                  <th className="p-1 px-2 whitespace-nowrap text-right">BOOKVALVE ▾</th>
                  <th className="p-1 px-2 whitespace-nowrap text-center">Req_insp ▾</th>
                  <th className="p-1 px-2 whitespace-nowrap">Asset / Inventory ▾</th>
                  <th className="p-1 px-2 whitespace-nowrap">ins_date ▾</th>
                  <th className="p-1 px-2 whitespace-nowrap">comments ▾</th>
                  {isAdmin && <th className="p-1 text-center w-6"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 font-sans text-xs">
                {grnRows.map((row, idx) => {
                  const isSelected = selectedGrnRowIdx === idx;
                  const rowBg = isSelected ? 'bg-[#bae6fd]' : 'bg-white hover:bg-slate-50';

                  return (
                    <tr
                      key={row.lineId || idx}
                      onClick={() => setSelectedGrnRowIdx(idx)}
                      className={`${rowBg} divide-x divide-slate-300 transition-colors cursor-pointer`}
                    >
                      {/* Row Selector Indicator (Black pointer ► on selected row) */}
                      <td className="w-6 p-0 text-center font-bold text-slate-900 bg-slate-100/70 select-none">
                        {isSelected ? '►' : ''}
                      </td>

                      {/* cat (Linked to database categories) */}
                      <td className="p-0">
                        <select
                          value={row.category}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'category', e.target.value)}
                          className="w-full bg-transparent border-0 px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        >
                          {availableCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Size (Linked to database sizes) */}
                      <td className="p-0">
                        <select
                          value={row.size || ''}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'size', e.target.value)}
                          className="w-full bg-transparent border-0 px-2 py-1 text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        >
                          <option value="">--</option>
                          {availableSizes.map((sz) => (
                            <option key={sz} value={sz}>
                              {sz}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* toolsno (Tool Serial Number) */}
                      <td className="p-0">
                        <input
                          type="text"
                          value={row.toolsno || ''}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'toolsno', e.target.value)}
                          placeholder="RG-6-01"
                          className="w-full bg-transparent border-0 px-2 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        />
                      </td>

                      {/* description */}
                      <td className="p-0">
                        <input
                          type="text"
                          value={row.description}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'description', e.target.value)}
                          placeholder="6&quot; NO GO RING GAUGE"
                          className="w-full bg-transparent border-0 px-2 py-1 text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        />
                      </td>

                      {/* qtyin (Numeric received) */}
                      <td className="p-0 text-center">
                        <input
                          type="number"
                          min="0"
                          value={row.qtyReceived}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'qtyReceived', parseInt(e.target.value) || 0)}
                          className="w-12 bg-transparent border-0 px-1 py-1 text-center text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 mx-auto"
                        />
                      </td>

                      {/* Belongs to (Ownership) */}
                      <td className="p-0">
                        <input
                          type="text"
                          value={row.belongsTo || 'EMDAD'}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'belongsTo', e.target.value)}
                          className="w-full bg-transparent border-0 px-2 py-1 text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        />
                      </td>

                      {/* BOOKVALVE */}
                      <td className="p-0 text-right">
                        <input
                          type="text"
                          value={`${grnHeader.currency}${Number(row.bookValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          disabled={!isAdmin}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0;
                            handleGrnRowChange(idx, 'bookValue', val);
                          }}
                          className="w-full bg-transparent border-0 px-2 py-1 text-right text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        />
                      </td>

                      {/* Req_insp (Centered Checkbox) */}
                      <td className="p-0 text-center">
                        <div className="flex items-center justify-center py-1">
                          <input
                            type="checkbox"
                            checked={!!row.reqInsp}
                            disabled={!isAdmin}
                            onChange={(e) => handleGrnRowChange(idx, 'reqInsp', e.target.checked)}
                            className="w-3.5 h-3.5 text-blue-600 rounded-none border border-slate-400 cursor-pointer"
                          />
                        </div>
                      </td>

                      {/* Asset / Inventory (3-Way Classification) */}
                      <td className="p-0">
                        <select
                          value={row.classification}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'classification', e.target.value as ProcurementClassification)}
                          className="w-full bg-transparent border-0 px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        >
                          <option value="ASSET">ASSET</option>
                          <option value="INVENTORY">INVENTORY</option>
                          <option value="CONSUMABLE">CONSUMABLE</option>
                        </select>
                      </td>

                      {/* ins_date */}
                      <td className="p-0">
                        <input
                          type="text"
                          value={row.insDate || ''}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'insDate', e.target.value)}
                          placeholder="YYYY-MM-DD"
                          className="w-full bg-transparent border-0 px-2 py-1 text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        />
                      </td>

                      {/* comments */}
                      <td className="p-0">
                        <input
                          type="text"
                          value={row.comments || ''}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'comments', e.target.value)}
                          className="w-full bg-transparent border-0 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        />
                      </td>

                      {isAdmin && (
                        <td className="p-1 text-center w-6 bg-white">
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              handleRemoveGrnRow(idx);
                            }}
                            className="text-slate-400 hover:text-rose-600 text-xs font-bold cursor-pointer"
                            title="Delete Row"
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {/* Bottom Entry / Summary Row with '*' */}
                <tr className="bg-white divide-x divide-slate-300 font-bold border-t-2 border-slate-400">
                  <td className="w-6 p-1 text-center text-slate-900 bg-slate-100 select-none font-mono">
                    *
                  </td>
                  <td className="p-1 px-2 text-slate-400 font-normal italic">
                    {isAdmin ? '+ Click + to add row' : ''}
                  </td>
                  <td className="p-1"></td>
                  <td className="p-1"></td>
                  <td className="p-1"></td>
                  <td className="p-1 text-center font-mono text-xs text-slate-950 font-black">
                    {grnRows.reduce((s, r) => s + (Number(r.qtyReceived) || 0), 0)}
                  </td>
                  <td className="p-1"></td>
                  <td className="p-1 px-2 text-right font-mono text-xs text-slate-950 font-black">
                    {grnHeader.currency}
                    {grnRows
                      .reduce((s, r) => s + (Number(r.bookValue) || 0), 0)
                      .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-1 text-center">
                    <input
                      type="checkbox"
                      disabled
                      className="w-3.5 h-3.5 rounded-none border border-slate-300"
                    />
                  </td>
                  <td className="p-1"></td>
                  <td className="p-1"></td>
                  <td className="p-1"></td>
                  {isAdmin && (
                    <td className="p-1 text-center">
                      <button
                        onClick={handleAddGrnRow}
                        className="text-emerald-700 hover:text-emerald-900 font-black text-sm cursor-pointer"
                        title="Add New Row"
                      >
                        +
                      </button>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Bottom Record Navigation Bar & Summary Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <button
                onClick={handleAddGrnRow}
                disabled={!isAdmin}
                className="flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded border border-slate-300 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Line Item
              </button>

              <span className="text-slate-400">|</span>

              <span className="font-mono">
                Record: {grnList.length > 0 ? `${currentGrnIndex + 1} of ${grnList.length}` : '1 of 1'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-xs font-semibold text-slate-600">
                Total Inward Value:{' '}
                <span className="font-mono font-bold text-indigo-900 text-sm">
                  {grnHeader.currency}{' '}
                  {grnRows.reduce((s, r) => s + (Number(r.bookValue) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {isAdmin && (
                <button
                  onClick={handleSaveOrUpdateGRN}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Save / Post Receipt
                </button>
              )}
            </div>
          </div>

          {/* Depreciation Summary for ASSET lines */}
          {grnRows.some((r) => r.classification === 'ASSET') && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-bold">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Fixed Asset Capitalization & Straight-Line Depreciation
              </div>
              <p className="text-amber-800">
                Lines marked as <span className="font-bold">ASSET</span> are capitalized at book value.
                Depreciation is charged straight-line over 60 months against the associated sub-division under <span className="font-bold">GL Cost Code 51105 Dep P&M</span>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                {grnRows
                  .filter((r) => r.classification === 'ASSET')
                  .slice(0, 6)
                  .map((asset, i) => (
                    <div key={i} className="p-2 bg-white border border-amber-200 rounded text-xs">
                      <div className="font-bold text-slate-800 truncate">{asset.description || 'Asset'}</div>
                      <div className="text-slate-500">SN: <span className="font-mono font-bold text-slate-800">{asset.toolsno}</span></div>
                      <div className="text-slate-500">Book Value: <span className="font-mono font-bold text-slate-900">{grnHeader.currency} {Number(asset.bookValue || 0).toLocaleString()}</span></div>
                      <div className="text-emerald-700 font-semibold">
                        Monthly Dep: {grnHeader.currency} {asset.monthlyDepreciation || Number(((asset.bookValue || 0) / 60).toFixed(2))}/mo
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SUPPLIER-WISE BALANCE & OUTSTANDING REPORT */}
      {/* ========================================================================= */}
      {activeTab === 'supplier-report' && (
        <div className="bg-white rounded-b-xl rounded-tr-xl p-6 shadow-sm border border-slate-200 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-800">Supplier-wise Outstanding & Balance Report</h2>
              <p className="text-xs text-slate-500">Tracks total PO value issued, inwarded value, and pending backorder exposure</p>
            </div>
            <button
              onClick={() => {
                const csv =
                  'Supplier,Total POs,Ordered Value,Inward Value,Balance Value,Completion %\n' +
                  supplierBalances
                    .map(
                      (s) =>
                        `"${s.supplier}",${s.totalPOs},${s.totalOrderedValue},${s.totalInwardValue},${s.totalBalanceValue},${s.fulfillmentRate}%`
                    )
                    .join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Supplier_Outstanding_Report_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export Report (CSV)
            </button>
          </div>

          {supplierBalances.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 font-semibold">No supplier balance data available.</p>
              <p className="text-xs text-slate-400">Create POs to track supplier fulfillment and pending backorders.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">SUPPLIER NAME</th>
                    <th className="p-3 text-center">TOTAL POs</th>
                    <th className="p-3 text-right">TOTAL PO VALUE</th>
                    <th className="p-3 text-right">GOODS INWARDED</th>
                    <th className="p-3 text-right">OUTSTANDING BALANCE</th>
                    <th className="p-3 text-center">FULFILLMENT %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplierBalances.map((s) => (
                    <tr key={s.supplier} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-bold text-slate-800 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        {s.supplier}
                      </td>
                      <td className="p-3 text-center font-mono font-semibold text-slate-700">{s.totalPOs}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        {s.currency} {s.totalOrderedValue.toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-700 font-semibold">
                        {s.currency} {s.totalInwardValue.toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-700">
                        {s.currency} {s.totalBalanceValue.toLocaleString()}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-24 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-emerald-600 h-2 rounded-full"
                              style={{ width: `${Math.min(100, s.fulfillmentRate)}%` }}
                            ></div>
                          </div>
                          <span className="font-mono text-xs font-bold text-slate-700">{s.fulfillmentRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: GRN AUDIT HISTORY & PRINTABLE SLIPS */}
      {/* ========================================================================= */}
      {activeTab === 'grn-history' && (
        <div className="bg-white rounded-b-xl rounded-tr-xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-800">Posted Goods Receipt Notes (GRN)</h2>
            <p className="text-xs text-slate-500">Historical receiving slips with Storekeeper and QC inspection sign-offs</p>
          </div>

          {grnList.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
              <Printer className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 font-semibold">No goods receipt slips posted yet.</p>
              <p className="text-xs text-slate-400">Post receipts from Tab 2 to generate permanent audit logs.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">TICKET #</th>
                    <th className="p-3">PO NUMBER</th>
                    <th className="p-3">SUPPLIER</th>
                    <th className="p-3">DELIVERY NOTE #</th>
                    <th className="p-3">RECEIPT DATE</th>
                    <th className="p-3">RECEIVED BY</th>
                    <th className="p-3 text-right">TOTAL VALUE</th>
                    <th className="p-3 text-center">QC STATUS</th>
                    <th className="p-3 text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {grnList.map((grn) => (
                    <tr key={grn.grnId} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono font-bold text-indigo-700">{grn.ticketNo}</td>
                      <td className="p-3 font-mono text-slate-700">{grn.poNumber}</td>
                      <td className="p-3 font-semibold text-slate-800">{grn.supplier}</td>
                      <td className="p-3 font-mono text-slate-600">{grn.supplierDt}</td>
                      <td className="p-3 text-slate-600">{grn.dateRecd}</td>
                      <td className="p-3 text-slate-700">{grn.mfgReceivedBy}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        {grn.currency} {(grn.totalInwardValue || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 text-xs font-bold rounded ${
                            grn.qcStatus === 'ACCEPTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : grn.qcStatus === 'PENDING_INSPECTION'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {grn.qcStatus}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setSelectedGrnForPrint(grn)}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded flex items-center gap-1 mx-auto cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print GIN Slip
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE NEW PURCHASE ORDER (Manual + Bulk Upload) */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-800">Create New Purchase Order</h3>
                <p className="text-xs text-slate-500">Manual line items grid or bulk CSV template upload</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Header Fields */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-500 mb-1">PO Number</label>
                <input
                  type="text"
                  value={newPoHeader.poNumber}
                  onChange={(e) => setNewPoHeader({ ...newPoHeader, poNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Supplier</label>
                <select
                  value={newPoHeader.supplier}
                  onChange={(e) => setNewPoHeader({ ...newPoHeader, supplier: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  {supplierOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Contract Number</label>
                <select
                  value={newPoHeader.contractRef}
                  onChange={(e) => setNewPoHeader({ ...newPoHeader, contractRef: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
                >
                  {contractOptions.map((c) => (
                    <option key={c} value={c}>
                      {c} ({CONTRACT_SUB_DIVISIONS[c]})
                    </option>
                  ))}
                  <option value="GENERAL / BASE">GENERAL BASE</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">PO Currency</label>
                <select
                  value={newPoHeader.currency}
                  onChange={(e) => setNewPoHeader({ ...newPoHeader, currency: e.target.value as 'AED' | 'USD' })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                >
                  <option value="AED">AED (Dirhams)</option>
                  <option value="USD">USD (Dollars)</option>
                </select>
              </div>
            </div>

            {/* CSV Actions */}
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs font-bold text-slate-700">Bulk Actions:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSampleCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Sample CSV
                </button>
                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Upload CSV Lines
                  <input type="file" accept=".csv" onChange={handleBulkUpload} className="hidden" />
                </label>
              </div>
            </div>

            {/* Line Items Grid - Access/Excel Grid Styling */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Line Items ({poLines.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddPoLine}
                  className="flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded border border-slate-300 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Add Line Item
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-400 rounded-sm shadow-sm max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#546377] text-white font-bold sticky top-0 border-b border-slate-400 select-none">
                    <tr className="divide-x divide-[#697a91]">
                      <th className="w-6 p-1 text-center bg-[#475569]">#</th>
                      <th className="p-1 px-2 whitespace-nowrap">cat ▾</th>
                      <th className="p-1 px-2 whitespace-nowrap">Size ▾</th>
                      <th className="p-1 px-2 whitespace-nowrap">Part # / toolsno ▾</th>
                      <th className="p-1 px-2 whitespace-nowrap min-w-[180px]">description ▾</th>
                      <th className="p-1 px-2 whitespace-nowrap">Contract # ▾</th>
                      <th className="p-1 px-2 whitespace-nowrap text-center">qty ▾</th>
                      <th className="p-1 px-2 whitespace-nowrap text-right">Unit Price ▾</th>
                      <th className="p-1 px-2 whitespace-nowrap text-right">Total ({newPoHeader.currency}) ▾</th>
                      <th className="p-1 px-2 whitespace-nowrap">Belongs to ▾</th>
                      <th className="p-1 px-2 whitespace-nowrap">Classification ▾</th>
                      <th className="p-1 text-center w-6"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300 font-sans text-xs bg-white">
                    {poLines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 divide-x divide-slate-300">
                        {/* Row # */}
                        <td className="w-6 p-0 text-center font-bold text-slate-600 bg-slate-100/70 select-none">
                          {idx + 1}
                        </td>

                        {/* Category Dropdown from DB */}
                        <td className="p-0">
                          <select
                            value={line.category}
                            onChange={(e) => handlePoLineChange(idx, 'category', e.target.value)}
                            className="w-full bg-transparent border-0 px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                          >
                            {availableCategories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Size Dropdown from DB */}
                        <td className="p-0">
                          <select
                            value={line.size || ''}
                            onChange={(e) => handlePoLineChange(idx, 'size', e.target.value)}
                            className="w-full bg-transparent border-0 px-2 py-1 text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                          >
                            <option value="">--</option>
                            {availableSizes.map((sz) => (
                              <option key={sz} value={sz}>
                                {sz}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Part # / toolsno */}
                        <td className="p-0">
                          <input
                            type="text"
                            value={line.partNo}
                            onChange={(e) => handlePoLineChange(idx, 'partNo', e.target.value)}
                            placeholder="Part #"
                            className="w-full bg-transparent border-0 px-2 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                          />
                        </td>

                        {/* Description */}
                        <td className="p-0">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => handlePoLineChange(idx, 'description', e.target.value)}
                            placeholder="Item description"
                            className="w-full bg-transparent border-0 px-2 py-1 text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                          />
                        </td>

                        {/* Contract Ref */}
                        <td className="p-0">
                          <select
                            value={line.contractRef || newPoHeader.contractRef}
                            onChange={(e) => handlePoLineChange(idx, 'contractRef', e.target.value)}
                            className="w-full bg-transparent border-0 px-2 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                          >
                            {contractOptions.map((c) => (
                              <option key={c} value={c}>
                                {c} ({CONTRACT_SUB_DIVISIONS[c]})
                              </option>
                            ))}
                            <option value="GENERAL / BASE">GENERAL BASE</option>
                          </select>
                        </td>

                        {/* Qty */}
                        <td className="p-0 text-center">
                          <input
                            type="number"
                            min="1"
                            value={line.orderedQty}
                            onChange={(e) => handlePoLineChange(idx, 'orderedQty', parseFloat(e.target.value) || 0)}
                            className="w-12 bg-transparent border-0 px-1 py-1 text-center font-bold text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 mx-auto"
                          />
                        </td>

                        {/* Unit Price */}
                        <td className="p-0 text-right">
                          <input
                            type="number"
                            value={line.unitPrice}
                            onChange={(e) => handlePoLineChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-20 bg-transparent border-0 px-2 py-1 text-right font-mono font-bold text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                          />
                        </td>

                        {/* Total */}
                        <td className="p-0 px-2 text-right font-mono font-bold text-xs text-slate-900 bg-slate-50/50">
                          {((line.orderedQty || 0) * (line.unitPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Belongs to */}
                        <td className="p-0">
                          <input
                            type="text"
                            value={line.belongsTo || 'EMDAD'}
                            onChange={(e) => handlePoLineChange(idx, 'belongsTo', e.target.value)}
                            className="w-full bg-transparent border-0 px-2 py-1 text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                          />
                        </td>

                        {/* 3-Way Classification */}
                        <td className="p-0">
                          <select
                            value={line.classification}
                            onChange={(e) => handlePoLineChange(idx, 'classification', e.target.value)}
                            className="w-full bg-transparent border-0 px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                          >
                            <option value="ASSET">ASSET</option>
                            <option value="INVENTORY">INVENTORY</option>
                            <option value="CONSUMABLE">CONSUMABLE</option>
                          </select>
                        </td>

                        {/* Remove Row */}
                        <td className="p-1 text-center w-6 bg-white">
                          <button
                            type="button"
                            onClick={() => handleRemovePoLine(idx)}
                            className="text-slate-400 hover:text-rose-600 text-xs font-bold cursor-pointer"
                            title="Remove Line"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}

                    {/* Bottom Summary / * Row */}
                    <tr className="bg-white divide-x divide-slate-300 font-bold border-t-2 border-slate-400">
                      <td className="w-6 p-1 text-center text-slate-900 bg-slate-100 select-none font-mono">
                        *
                      </td>
                      <td className="p-1 px-2 text-slate-400 font-normal italic">
                        + Add item
                      </td>
                      <td className="p-1"></td>
                      <td className="p-1"></td>
                      <td className="p-1"></td>
                      <td className="p-1"></td>
                      <td className="p-1 text-center font-mono text-xs text-slate-950 font-black">
                        {poLines.reduce((s, l) => s + (Number(l.orderedQty) || 0), 0)}
                      </td>
                      <td className="p-1"></td>
                      <td className="p-1 px-2 text-right font-mono text-xs text-slate-950 font-black">
                        {newPoHeader.currency}{' '}
                        {poLines
                          .reduce((s, l) => s + (l.orderedQty || 0) * (l.unitPrice || 0), 0)
                          .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1"></td>
                      <td className="p-1"></td>
                      <td className="p-1 text-center">
                        <button
                          type="button"
                          onClick={handleAddPoLine}
                          className="text-emerald-700 hover:text-emerald-900 font-black text-sm cursor-pointer"
                          title="Add New Row"
                        >
                          +
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total and Actions */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <div className="text-sm font-semibold text-slate-700">
                Total PO Value:{' '}
                <span className="font-mono font-bold text-indigo-900 text-lg">
                  {newPoHeader.currency}{' '}
                  {poLines.reduce((s, l) => s + (l.orderedQty || 0) * (l.unitPrice || 0), 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePO}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-900/20 cursor-pointer"
                >
                  Save & Issue PO
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PRINTABLE GOODS INWARD NOTE (GIN / GRN) */}
      {/* ========================================================================= */}
      {selectedGrnForPrint && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-8 shadow-2xl space-y-6 print:p-0 print:shadow-none">
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">EMDAD LLC - DRILLING SERVICES</h2>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  Goods Inward Receipt Note (GIN / GRN)
                </p>
              </div>
              <div className="text-right">
                <div className="font-mono font-black text-xl text-indigo-900">
                  TICKET #{selectedGrnForPrint.ticketNo}
                </div>
                <div className="text-xs text-slate-500">PO Ref: {selectedGrnForPrint.poNumber}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block">Supplier:</span>
                <span className="text-slate-800 font-bold">{selectedGrnForPrint.supplier}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Supplier DT/DN:</span>
                <span className="text-slate-800 font-mono font-bold">{selectedGrnForPrint.supplierDt}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Date Received:</span>
                <span className="text-slate-800">{selectedGrnForPrint.dateRecd}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Store Inspector:</span>
                <span className="text-slate-800 font-bold">{selectedGrnForPrint.mfgReceivedBy}</span>
              </div>
            </div>

            {/* Lines */}
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-100 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2 border-r border-slate-300">Item</th>
                  <th className="p-2 border-r border-slate-300">Serial #</th>
                  <th className="p-2 border-r border-slate-300">Contract</th>
                  <th className="p-2 border-r border-slate-300">Division</th>
                  <th className="p-2 text-center border-r border-slate-300">Qty</th>
                  <th className="p-2 text-right border-r border-slate-300">Book Value</th>
                  <th className="p-2">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {selectedGrnForPrint.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="p-2 border-r border-slate-300 font-medium">
                      {l.description} ({l.size || l.category})
                    </td>
                    <td className="p-2 border-r border-slate-300 font-mono font-bold">{l.toolsno || '—'}</td>
                    <td className="p-2 border-r border-slate-300 font-mono">{l.contractRef || '—'}</td>
                    <td className="p-2 border-r border-slate-300 font-bold">{l.subDivision}</td>
                    <td className="p-2 border-r border-slate-300 text-center font-bold">{l.qtyReceived}</td>
                    <td className="p-2 border-r border-slate-300 text-right font-mono font-bold">
                      {selectedGrnForPrint.currency} {l.bookValue.toLocaleString()}
                    </td>
                    <td className="p-2 font-bold">{l.classification}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Signature Blocks */}
            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-300 text-xs font-semibold">
              <div className="space-y-12">
                <div className="text-slate-500">Received By Storekeeper:</div>
                <div className="border-b border-slate-400 pb-1">Signature & Date</div>
              </div>
              <div className="space-y-12">
                <div className="text-slate-500">QC Inspector Verification:</div>
                <div className="border-b border-slate-400 pb-1">Signature & Date (Badge #)</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 print:hidden pt-4">
              <button
                onClick={() => setSelectedGrnForPrint(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handlePrintSlip}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Print Inward Slip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
