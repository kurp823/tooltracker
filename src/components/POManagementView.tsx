import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  PurchaseOrder,
  POLineItem,
  GoodsReceiptNote,
  GRNLineItem,
  SubDivision,
  ProcurementClassification,
  ToolItem,
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
  SupplierBalanceSummary,
} from '../services/poManagementService';
import { getDropdownOptions } from '../services/dropdownService';
import { saveCustomTool } from '../services/customTools';
import { saveInventoryApi, toSqlIsoDate } from '../services/api';
import { formatDateDDMMYYYY as formatDateDD_MM_YYYY } from '../utils';
import {
  FileText,
  Plus,
  Trash2,
  Calendar,
  DollarSign,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Printer,
  Package,
  Truck,
  ShieldCheck,
  ChevronDown,
  X,
  Building2,
  Layers,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface POManagementViewProps {
  user?: User | null;
  onNavigate?: (module: string, param?: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  categories?: string[];
  sizes?: string[];
  inventory?: ToolItem[];
  onSaveTool?: (tool: ToolItem) => void;
}

type ActiveTab = 'po-register' | 'grn-inward' | 'supplier-balance';

export const POManagementView: React.FC<POManagementViewProps> = ({
  user,
  onNavigate,
  showToast = () => {},
  categories = [],
  sizes = [],
  inventory = [],
  onSaveTool,
}) => {
  const isAdmin = user?.role === 'Admin';
  const [activeTab, setActiveTab] = useState<ActiveTab>('po-register');

  // Master Data State
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceiptNote[]>([]);
  const [supplierBalances, setSupplierBalances] = useState<SupplierBalanceSummary[]>([]);

  // Search & Filter State
  const [poSearchQuery, setPoSearchQuery] = useState('');
  const [poFilterSubDiv, setPoFilterSubDiv] = useState<string>('ALL');
  const [poFilterStatus, setPoFilterStatus] = useState<string>('ALL');
  const [grnSearchQuery, setGrnSearchQuery] = useState('');

  // Modals
  const [isCreatePOModalOpen, setIsCreatePOModalOpen] = useState(false);
  const [isCreateGRNModalOpen, setIsCreateGRNModalOpen] = useState(false);
  const [previewPO, setPreviewPO] = useState<PurchaseOrder | null>(null);
  const [previewGRN, setPreviewGRN] = useState<GoodsReceiptNote | null>(null);

  // Suppliers Master
  const masterSuppliers = useMemo(() => {
    return getDropdownOptions('suppliers');
  }, []);

  // Initial Load
  const refreshData = () => {
    setPurchaseOrders(loadPurchaseOrders());
    setGoodsReceipts(loadGoodsReceiptNotes());
    setSupplierBalances(getSupplierBalanceReport());
  };

  useEffect(() => {
    refreshData();
  }, []);

  // -------------------------------------------------------------
  // TAB 1: CREATE PURCHASE ORDER FORM STATE
  // -------------------------------------------------------------
  const [poFormData, setPoFormData] = useState({
    poNumber: '',
    orderDate: new Date().toISOString().split('T')[0],
    supplier: '',
    subDivision: 'FISHING' as SubDivision,
    currency: 'AED' as 'AED' | 'USD',
    notes: '',
  });

  interface POLineDraft {
    id: string;
    assetNo: string;
    description: string;
    size: string;
    qty: number;
    costCode: ProcurementClassification;
    unitPrice: number;
  }

  const [poLineDrafts, setPoLineDrafts] = useState<POLineDraft[]>([
    {
      id: 'POL-1',
      assetNo: '',
      description: '',
      size: '',
      qty: 1,
      costCode: 'ASSET',
      unitPrice: 0,
    },
  ]);

  const handleOpenCreatePO = () => {
    setPoFormData({
      poNumber: `PO-${new Date().getFullYear().toString().slice(-2)}-${Math.floor(1000 + Math.random() * 9000)}`,
      orderDate: new Date().toISOString().split('T')[0],
      supplier: masterSuppliers[0] || 'EMDAD',
      subDivision: 'FISHING',
      currency: 'AED',
      notes: '',
    });
    setPoLineDrafts([
      {
        id: 'POL-1',
        assetNo: '',
        description: '',
        size: '',
        qty: 1,
        costCode: 'ASSET',
        unitPrice: 0,
      },
    ]);
    setIsCreatePOModalOpen(true);
  };

  const handleAddPOLine = () => {
    setPoLineDrafts((prev) => [
      ...prev,
      {
        id: `POL-${prev.length + 1}`,
        assetNo: '',
        description: '',
        size: '',
        qty: 1,
        costCode: 'ASSET',
        unitPrice: 0,
      },
    ]);
  };

  const handleRemovePOLine = (idx: number) => {
    if (poLineDrafts.length <= 1) {
      showToast('A Purchase Order must contain at least 1 line item.', 'error');
      return;
    }
    setPoLineDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdatePOLine = (idx: number, field: keyof POLineDraft, value: any) => {
    setPoLineDrafts((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
    );
  };

  const totalPOAmount = useMemo(() => {
    return poLineDrafts.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  }, [poLineDrafts]);

  const handleSavePurchaseOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poFormData.poNumber.trim()) {
      showToast('Please enter a valid PO Number.', 'error');
      return;
    }
    if (!poFormData.supplier.trim()) {
      showToast('Please select a Supplier.', 'error');
      return;
    }
    const invalidLine = poLineDrafts.find((l) => !l.assetNo.trim() && !l.description.trim());
    if (invalidLine) {
      showToast('Please enter Asset/Part Number or Description for each line.', 'error');
      return;
    }

    const lines: POLineItem[] = poLineDrafts.map((l, idx) => ({
      lineId: `LINE-${idx + 1}`,
      partNo: l.assetNo.trim().toUpperCase(),
      description: l.description.trim() || l.assetNo.trim().toUpperCase(),
      category: 'DOWNHOLE TOOL',
      size: l.size.trim() || '—',
      orderedQty: Number(l.qty) || 1,
      receivedQty: 0,
      balanceQty: Number(l.qty) || 1,
      unitPrice: Number(l.unitPrice) || 0,
      currency: poFormData.currency,
      classification: l.costCode,
      subDivision: poFormData.subDivision,
    }));

    const result = createPurchaseOrder({
      poNumber: poFormData.poNumber.trim().toUpperCase(),
      supplier: poFormData.supplier,
      orderDate: toSqlIsoDate(poFormData.orderDate),
      currency: poFormData.currency,
      subDivision: poFormData.subDivision,
      notes: poFormData.notes.trim(),
      createdBy: user?.name || 'Procurement',
      lines,
    });

    if (result.success) {
      showToast(result.message, 'success');
      setIsCreatePOModalOpen(false);
      refreshData();
    } else {
      showToast(result.message, 'error');
    }
  };

  // -------------------------------------------------------------
  // TAB 2: CREATE GOODS RECEIPT NOTE (GRN) STATE
  // -------------------------------------------------------------
  const [selectedPOForGRN, setSelectedPOForGRN] = useState<string>('');
  const [grnHeader, setGrnHeader] = useState({
    receiptNumber: '',
    manualGRNNumber: '',
    receiptDate: new Date().toISOString().split('T')[0],
    receivedBy: user?.name || 'Yard Supervisor',
    supplier: '',
    subDivision: 'FISHING' as SubDivision,
    currency: 'AED' as 'AED' | 'USD',
  });

  interface GRNLineDraft {
    poLineId: string;
    lineNo: number;
    assetNo: string;
    description: string;
    size: string;
    poQty: number;
    alreadyReceived: number;
    balanceToReceive: number;
    receivedQty: number;
    isConfirmedReceived: boolean;
    requiresInspection: boolean;
    costCode: ProcurementClassification;
    unitPrice: number;
  }

  const [grnLineDrafts, setGrnLineDrafts] = useState<GRNLineDraft[]>([]);

  // Open POs available for receiving
  const openPOsForReceiving = useMemo(() => {
    return purchaseOrders.filter((po) => po.status !== 'FULFILLED' && po.status !== 'CANCELLED');
  }, [purchaseOrders]);

  const handleOpenCreateGRN = (preselectedPONumber?: string) => {
    const curYr = new Date().getFullYear().toString().slice(-2);
    const existingSeq = goodsReceipts.length + 1;
    const generatedReceiptNo = `GRN-${curYr}-${String(existingSeq).padStart(4, '0')}`;

    const targetPO = preselectedPONumber
      ? purchaseOrders.find((p) => p.poNumber === preselectedPONumber)
      : openPOsForReceiving[0] || null;

    if (targetPO) {
      setSelectedPOForGRN(targetPO.poNumber);
      setGrnHeader({
        receiptNumber: generatedReceiptNo,
        manualGRNNumber: '',
        receiptDate: new Date().toISOString().split('T')[0],
        receivedBy: user?.name || 'Yard Supervisor',
        supplier: targetPO.supplier,
        subDivision: targetPO.subDivision || 'FISHING',
        currency: targetPO.currency || 'AED',
      });

      const lines: GRNLineDraft[] = targetPO.lines.map((l, idx) => {
        const bal = l.balanceQty > 0 ? l.balanceQty : Math.max(0, l.orderedQty - l.receivedQty);
        return {
          poLineId: l.lineId,
          lineNo: idx + 1,
          assetNo: l.partNo,
          description: l.description,
          size: l.size || '—',
          poQty: l.orderedQty,
          alreadyReceived: l.receivedQty,
          balanceToReceive: bal,
          receivedQty: bal, // default to receiving the remaining balance
          isConfirmedReceived: bal > 0,
          requiresInspection: l.classification === 'ASSET',
          costCode: l.classification || 'ASSET',
          unitPrice: l.unitPrice,
        };
      });
      setGrnLineDrafts(lines);
    } else {
      setSelectedPOForGRN('');
      setGrnHeader({
        receiptNumber: generatedReceiptNo,
        manualGRNNumber: '',
        receiptDate: new Date().toISOString().split('T')[0],
        receivedBy: user?.name || 'Yard Supervisor',
        supplier: masterSuppliers[0] || 'EMDAD',
        subDivision: 'FISHING',
        currency: 'AED',
      });
      setGrnLineDrafts([]);
    }

    setIsCreateGRNModalOpen(true);
  };

  const handleSelectPOInGRN = (poNum: string) => {
    setSelectedPOForGRN(poNum);
    const po = purchaseOrders.find((p) => p.poNumber === poNum);
    if (!po) return;

    setGrnHeader((prev) => ({
      ...prev,
      supplier: po.supplier,
      subDivision: po.subDivision || 'FISHING',
      currency: po.currency || 'AED',
    }));

    const lines: GRNLineDraft[] = po.lines.map((l, idx) => {
      const bal = l.balanceQty > 0 ? l.balanceQty : Math.max(0, l.orderedQty - l.receivedQty);
      return {
        poLineId: l.lineId,
        lineNo: idx + 1,
        assetNo: l.partNo,
        description: l.description,
        size: l.size || '—',
        poQty: l.orderedQty,
        alreadyReceived: l.receivedQty,
        balanceToReceive: bal,
        receivedQty: bal,
        isConfirmedReceived: bal > 0,
        requiresInspection: l.classification === 'ASSET',
        costCode: l.classification || 'ASSET',
        unitPrice: l.unitPrice,
      };
    });
    setGrnLineDrafts(lines);
  };

  const handleSaveGRN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grnHeader.receiptNumber.trim()) {
      showToast('Please specify a System Receipt Number.', 'error');
      return;
    }
    if (!selectedPOForGRN && !grnHeader.supplier) {
      showToast('Please select a PO or specify a Supplier.', 'error');
      return;
    }

    const itemsToReceive = grnLineDrafts.filter((l) => l.isConfirmedReceived && l.receivedQty > 0);
    if (itemsToReceive.length === 0) {
      showToast('Please select at least 1 item with confirmed receipt quantity > 0.', 'error');
      return;
    }

    const grnLines: GRNLineItem[] = itemsToReceive.map((l) => ({
      lineId: `GRNL-${l.lineNo}`,
      poLineId: l.poLineId,
      partNo: l.assetNo,
      description: l.description,
      category: 'DOWNHOLE TOOL',
      size: l.size,
      toolsno: l.assetNo,
      subDivision: grnHeader.subDivision,
      qtyReceived: Number(l.receivedQty),
      unitPrice: Number(l.unitPrice),
      bookValue: Number(l.unitPrice) * Number(l.receivedQty),
      currency: grnHeader.currency,
      belongsTo: 'EMDAD',
      reqInsp: Boolean(l.requiresInspection),
      classification: l.costCode,
    }));

    const postResult = postGoodsReceiptNote({
      ticketNo: grnHeader.manualGRNNumber.trim() || grnHeader.receiptNumber,
      supplierDt: grnHeader.manualGRNNumber.trim(),
      dateRecd: toSqlIsoDate(grnHeader.receiptDate),
      supplier: grnHeader.supplier,
      poNumber: selectedPOForGRN,
      mfgReceivedBy: grnHeader.receivedBy,
      currency: grnHeader.currency,
      totalItemsReceived: itemsToReceive.reduce((s, l) => s + Number(l.receivedQty), 0),
      totalInwardValue: itemsToReceive.reduce((s, l) => s + (Number(l.unitPrice) * Number(l.receivedQty)), 0),
      lines: grnLines,
    });

    if (postResult.success) {
      // Also register newly received asset tools into Master Inventory & Azure SQL
      for (const item of itemsToReceive) {
        if (item.costCode === 'ASSET' || item.costCode === 'INVENTORY') {
          const toolItem: ToolItem = {
            id: item.assetNo,
            serial: item.assetNo,
            assetNo: item.assetNo,
            size: item.size || 'Standard',
            shortDesc: 'DOWNHOLE TOOL',
            desc: item.description,
            qty: Number(item.receivedQty),
            location: item.requiresInspection ? 'Inspection Bay' : 'Emdad Base',
            status: item.requiresInspection ? ('Inspection' as any) : ('Good' as any),
            ownership: 'EMDAD',
            isEmdad: true,
            supplier: grnHeader.supplier,
            addedDate: toSqlIsoDate(grnHeader.receiptDate),
          };

          saveCustomTool(toolItem);
          // onSaveTool (handleAddTool in App.tsx) calls saveInventoryApi internally —
          // do NOT also call saveInventoryApi here directly; that would double-write.
          if (onSaveTool) onSaveTool(toolItem);
        }
      }

      showToast(`Goods Receipt Note ${grnHeader.receiptNumber} posted successfully. Inventory updated!`, 'success');
      setIsCreateGRNModalOpen(false);
      refreshData();
    } else {
      showToast(postResult.message, 'error');
    }
  };

  // -------------------------------------------------------------
  // FILTERED DATA VIEWS
  // -------------------------------------------------------------
  const filteredPurchaseOrders = useMemo(() => {
    return purchaseOrders.filter((po) => {
      const q = poSearchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        po.poNumber.toLowerCase().includes(q) ||
        po.supplier.toLowerCase().includes(q) ||
        po.lines.some((l) => l.partNo.toLowerCase().includes(q) || l.description.toLowerCase().includes(q));

      const matchesSubDiv = poFilterSubDiv === 'ALL' || po.subDivision === poFilterSubDiv;
      const matchesStatus = poFilterStatus === 'ALL' || po.status === poFilterStatus;

      return matchesSearch && matchesSubDiv && matchesStatus;
    });
  }, [purchaseOrders, poSearchQuery, poFilterSubDiv, poFilterStatus]);

  const filteredGRNs = useMemo(() => {
    return goodsReceipts.filter((grn) => {
      const q = grnSearchQuery.trim().toLowerCase();
      return (
        !q ||
        grn.grnId.toLowerCase().includes(q) ||
        (grn.ticketNo || '').toLowerCase().includes(q) ||
        (grn.poNumber || '').toLowerCase().includes(q) ||
        grn.supplier.toLowerCase().includes(q) ||
        grn.lines.some((l) => l.partNo.toLowerCase().includes(q) || l.description.toLowerCase().includes(q))
      );
    });
  }, [goodsReceipts, grnSearchQuery]);

  // -------------------------------------------------------------
  // RENDER MAIN VIEW
  // -------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* EXECUTIVE TOP BANNER - MATCHING JOB DOSSIER */}
      <div className="bg-[#1a3055] text-white rounded p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold text-base tracking-wide">EMDAD PROCUREMENT &amp; GOODS INWARD</span>
            <span className="bg-blue-900 text-blue-200 text-[10px] font-mono px-2 py-0.5 rounded border border-blue-700">
              ISO / Azure SQL Aligned
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Purchase Order Management, Goods Receipt (GRN) with Inspection Routing, and Third-Party Sub-Rental Inward.
          </p>
        </div>

        {/* TOP LEVEL ACTION BUTTONS */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleOpenCreatePO}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3.5 py-1.5 rounded shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Create Purchase Order</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenCreateGRN()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-1.5 rounded shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Package className="w-3.5 h-3.5" />
            <span>+ Create GRN</span>
          </button>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex items-center border-b border-[#b8c9db] bg-white rounded-t px-2 pt-2 gap-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('po-register')}
          className={`px-4 py-2 rounded-t flex items-center gap-1.5 transition cursor-pointer border-t border-x ${
            activeTab === 'po-register'
              ? 'bg-[#f0f5fb] text-[#1a3055] border-[#b8c9db] -mb-[1px] border-b-transparent shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-50'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Purchase Orders ({purchaseOrders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('grn-inward')}
          className={`px-4 py-2 rounded-t flex items-center gap-1.5 transition cursor-pointer border-t border-x ${
            activeTab === 'grn-inward'
              ? 'bg-[#f0f5fb] text-[#1a3055] border-[#b8c9db] -mb-[1px] border-b-transparent shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-50'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Goods Receipt (GRN) ({goodsReceipts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('supplier-balance')}
          className={`px-4 py-2 rounded-t flex items-center gap-1.5 transition cursor-pointer border-t border-x ${
            activeTab === 'supplier-balance'
              ? 'bg-[#f0f5fb] text-[#1a3055] border-[#b8c9db] -mb-[1px] border-b-transparent shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-50'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Pending Items Report</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PURCHASE ORDERS REGISTER */}
      {/* ========================================================================= */}
      {activeTab === 'po-register' && (
        <div className="bg-white border border-[#b8c9db] rounded-b p-4 space-y-3 shadow-2xs">
          {/* SEARCH & FILTERS BAR */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search PO #, supplier, asset / part number..."
                value={poSearchQuery}
                onChange={(e) => setPoSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={poFilterSubDiv}
                onChange={(e) => setPoFilterSubDiv(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-700"
              >
                <option value="ALL">All Sub-Divisions</option>
                <option value="FISHING">Fishing</option>
                <option value="WHIPSTOCK">Whipstock</option>
                <option value="RENTALS">Rentals</option>
              </select>

              <select
                value={poFilterStatus}
                onChange={(e) => setPoFilterStatus(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-700"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="PARTIALLY_RECEIVED">Partially Received</option>
                <option value="FULFILLED">Fulfilled</option>
              </select>
            </div>
          </div>

          {/* PO TABLE */}
          <div className="overflow-x-auto border border-[#b8c9db] rounded">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f0f5fb] text-[#1a3055] border-b border-[#b8c9db] font-bold">
                <tr>
                  <th className="p-2 text-center w-10">#</th>
                  <th className="p-2 whitespace-nowrap">PO NUMBER</th>
                  <th className="p-2 whitespace-nowrap">PO DATE</th>
                  <th className="p-2">SUPPLIER</th>
                  <th className="p-2 whitespace-nowrap">SUB-DIVISION</th>
                  <th className="p-2 text-center whitespace-nowrap">LINES</th>
                  <th className="p-2 text-right whitespace-nowrap">TOTAL AMOUNT</th>
                  <th className="p-2 text-right whitespace-nowrap">INWARDED</th>
                  <th className="p-2 text-right whitespace-nowrap">BALANCE</th>
                  <th className="p-2 text-center whitespace-nowrap">STATUS</th>
                  <th className="p-2 text-center whitespace-nowrap">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredPurchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-500 font-medium bg-slate-50">
                      No purchase orders found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredPurchaseOrders.map((po, idx) => {
                    const isFullyInwarded = po.status === 'FULFILLED';
                    return (
                      <tr key={po.poId || po.poNumber} className="hover:bg-blue-50/40">
                        <td className="p-2 text-center text-slate-500 font-mono">{idx + 1}</td>
                        <td className="p-2 font-mono font-bold text-blue-800 whitespace-nowrap">{po.poNumber}</td>
                        <td className="p-2 font-mono text-slate-600 whitespace-nowrap">{formatDateDD_MM_YYYY(po.orderDate)}</td>
                        <td className="p-2 font-semibold text-slate-800">{po.supplier}</td>
                        <td className="p-2 whitespace-nowrap">
                          <span className="bg-slate-100 text-slate-700 font-bold text-[10px] px-2 py-0.5 rounded border border-slate-300">
                            {po.subDivision || 'FISHING'}
                          </span>
                        </td>
                        <td className="p-2 text-center font-bold text-slate-700">{po.lines?.length || 0}</td>
                        <td className="p-2 text-right font-mono font-bold text-slate-800">
                          {po.currency} {po.totalAmount.toLocaleString()}
                        </td>
                        <td className="p-2 text-right font-mono text-emerald-700">
                          {po.currency} {po.inwardedAmount.toLocaleString()}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-amber-800">
                          {po.currency} {po.balanceAmount.toLocaleString()}
                        </td>
                        <td className="p-2 text-center whitespace-nowrap">
                          {po.status === 'FULFILLED' ? (
                            <span className="bg-emerald-100 text-emerald-800 font-bold text-[10px] px-2 py-0.5 rounded border border-emerald-300">
                              Fulfilled
                            </span>
                          ) : po.status === 'PARTIALLY_RECEIVED' ? (
                            <span className="bg-amber-100 text-amber-800 font-bold text-[10px] px-2 py-0.5 rounded border border-amber-300">
                              Partial
                            </span>
                          ) : (
                            <span className="bg-blue-100 text-blue-800 font-bold text-[10px] px-2 py-0.5 rounded border border-blue-300">
                              Open
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {!isFullyInwarded && (
                              <button
                                type="button"
                                onClick={() => handleOpenCreateGRN(po.poNumber)}
                                className="bg-blue-700 hover:bg-blue-800 text-white font-bold text-[10px] px-2 py-0.5 rounded shadow-2xs cursor-pointer flex items-center gap-1"
                                title="Create GRN against this PO"
                              >
                                <span>Receive (GRN)</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setPreviewPO(po)}
                              className="text-slate-600 hover:text-blue-700 font-semibold text-[11px] underline cursor-pointer"
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: GOODS RECEIPT (GRN) REGISTER */}
      {/* ========================================================================= */}
      {activeTab === 'grn-inward' && (
        <div className="bg-white border border-[#b8c9db] rounded-b p-4 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search GRN #, manual delivery note #, PO #, supplier..."
                value={grnSearchQuery}
                onChange={(e) => setGrnSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={() => handleOpenCreateGRN()}
              className="bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs px-3.5 py-1.5 rounded shadow-xs cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Create Goods Receipt</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-[#b8c9db] rounded">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f0f5fb] text-[#1a3055] border-b border-[#b8c9db] font-bold">
                <tr>
                  <th className="p-2 text-center w-10">#</th>
                  <th className="p-2 whitespace-nowrap">SYSTEM GRN #</th>
                  <th className="p-2 whitespace-nowrap">MANUAL / REF #</th>
                  <th className="p-2 whitespace-nowrap">LINKED PO #</th>
                  <th className="p-2">SUPPLIER</th>
                  <th className="p-2 whitespace-nowrap">RECEIPT DATE</th>
                  <th className="p-2 whitespace-nowrap">RECEIVED BY</th>
                  <th className="p-2 text-center whitespace-nowrap">ITEMS RECD</th>
                  <th className="p-2 text-right whitespace-nowrap">INWARD VALUE</th>
                  <th className="p-2 text-center whitespace-nowrap">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredGRNs.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-500 font-medium bg-slate-50">
                      No Goods Receipt Notes posted yet. Click <strong>&quot;+ Create Goods Receipt&quot;</strong> to receive tools.
                    </td>
                  </tr>
                ) : (
                  filteredGRNs.map((grn, idx) => (
                    <tr key={grn.grnId} className="hover:bg-blue-50/40">
                      <td className="p-2 text-center text-slate-500 font-mono">{idx + 1}</td>
                      <td className="p-2 font-mono font-bold text-blue-900 whitespace-nowrap">{grn.grnId}</td>
                      <td className="p-2 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {grn.supplierDt || grn.ticketNo || '—'}
                      </td>
                      <td className="p-2 font-mono text-blue-700 whitespace-nowrap">{grn.poNumber || 'Direct GRN'}</td>
                      <td className="p-2 font-medium text-slate-800">{grn.supplier}</td>
                      <td className="p-2 font-mono text-slate-600 whitespace-nowrap">{formatDateDD_MM_YYYY(grn.dateRecd)}</td>
                      <td className="p-2 text-slate-700 whitespace-nowrap">{grn.mfgReceivedBy || '—'}</td>
                      <td className="p-2 text-center font-bold text-emerald-800">{grn.totalItemsReceived}</td>
                      <td className="p-2 text-right font-mono font-bold text-slate-800">
                        {grn.currency || 'AED'} {grn.totalInwardValue.toLocaleString()}
                      </td>
                      <td className="p-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setPreviewGRN(grn)}
                          className="text-blue-700 hover:text-blue-900 font-bold text-xs underline cursor-pointer"
                        >
                          View Inward Slip
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



      {/* ========================================================================= */}
      {/* TAB 4: PENDING ITEMS & SUPPLIER BALANCE REPORT */}
      {/* ========================================================================= */}
      {activeTab === 'supplier-balance' && (
        <div className="bg-white border border-[#b8c9db] rounded-b p-4 space-y-4 shadow-2xs">
          <div>
            <h3 className="font-bold text-sm text-[#1a3055]">Supplier Pending Balance Report</h3>
            <p className="text-xs text-slate-500">
              Complete audit of open items and quantities pending delivery against issued Purchase Orders.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs">
              <span className="text-slate-500 block">Total Issued POs</span>
              <span className="text-xl font-bold text-blue-900">{purchaseOrders.length}</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs">
              <span className="text-slate-500 block">Pending POs with Open Balance</span>
              <span className="text-xl font-bold text-amber-900">
                {purchaseOrders.filter((p) => p.status === 'OPEN' || p.status === 'PARTIALLY_RECEIVED').length}
              </span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-xs">
              <span className="text-slate-500 block">Fulfilled Orders</span>
              <span className="text-xl font-bold text-emerald-900">
                {purchaseOrders.filter((p) => p.status === 'FULFILLED').length}
              </span>
            </div>
          </div>

          {/* BALANCE TABLE */}
          <div className="overflow-x-auto border border-[#b8c9db] rounded">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f0f5fb] text-[#1a3055] border-b border-[#b8c9db] font-bold">
                <tr>
                  <th className="p-2 w-10 text-center">#</th>
                  <th className="p-2">SUPPLIER</th>
                  <th className="p-2 text-center whitespace-nowrap">TOTAL POS</th>
                  <th className="p-2 text-center whitespace-nowrap">OPEN POS</th>
                  <th className="p-2 text-center whitespace-nowrap">ORDERED ITEMS</th>
                  <th className="p-2 text-center whitespace-nowrap">RECEIVED ITEMS</th>
                  <th className="p-2 text-center whitespace-nowrap">PENDING ITEMS</th>
                  <th className="p-2 text-right whitespace-nowrap">PENDING VALUE (AED)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {supplierBalances.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-medium bg-slate-50">
                      No supplier pending balances. All orders fulfilled or no POs created yet.
                    </td>
                  </tr>
                ) : (
                  supplierBalances.map((sb, idx) => (
                    <tr key={sb.supplier} className="hover:bg-slate-50">
                      <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="p-2 font-bold text-slate-900">{sb.supplier}</td>
                      <td className="p-2 text-center font-mono">{sb.totalPOs}</td>
                      <td className="p-2 text-center font-mono font-bold text-amber-800">{sb.openPOs}</td>
                      <td className="p-2 text-center font-mono">{sb.totalItemsOrdered}</td>
                      <td className="p-2 text-center font-mono text-emerald-700">{sb.totalItemsInwarded}</td>
                      <td className="p-2 text-center font-mono font-bold text-red-700">{sb.pendingBalanceQty}</td>
                      <td className="p-2 text-right font-mono font-bold text-slate-800">
                        AED {sb.pendingBalanceValue.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE PURCHASE ORDER */}
      {/* ========================================================================= */}
      {isCreatePOModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-md shadow-2xl border border-slate-300 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* MODAL HEADER */}
            <div className="bg-[#1a3055] text-white px-4 py-2.5 flex items-center justify-between text-xs font-bold flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <span className="text-sm">Create New Purchase Order (PO)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatePOModalOpen(false)}
                className="text-white/80 hover:text-white cursor-pointer text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSavePurchaseOrder} className="flex flex-col flex-1 overflow-hidden">
              {/* FORM HEADER FIELDS */}
              <div className="p-4 bg-[#f8fafc] border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs flex-shrink-0">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">PO Number *</label>
                  <input
                    type="text"
                    required
                    value={poFormData.poNumber}
                    onChange={(e) => setPoFormData({ ...poFormData, poNumber: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">PO Date *</label>
                  <input
                    type="date"
                    required
                    value={poFormData.orderDate}
                    onChange={(e) => setPoFormData({ ...poFormData, orderDate: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-800 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Supplier *</label>
                  <select
                    value={poFormData.supplier}
                    onChange={(e) => setPoFormData({ ...poFormData, supplier: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 font-medium text-slate-800"
                  >
                    {masterSuppliers.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Sub-Division *</label>
                  <select
                    value={poFormData.subDivision}
                    onChange={(e) => setPoFormData({ ...poFormData, subDivision: e.target.value as SubDivision })}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 font-bold text-blue-900"
                  >
                    <option value="FISHING">Fishing</option>
                    <option value="WHIPSTOCK">Whipstock</option>
                    <option value="RENTALS">Rentals</option>
                  </select>
                </div>
              </div>

              {/* LINE ITEMS GRID */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800">PO Line Items ({poLineDrafts.length})</h4>
                  <button
                    type="button"
                    onClick={handleAddPOLine}
                    className="bg-slate-100 hover:bg-slate-200 text-[#1a3055] font-bold text-xs px-2.5 py-1 rounded border border-slate-300 cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Line Item</span>
                  </button>
                </div>

                <div className="border border-[#b8c9db] rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#f0f5fb] text-[#1a3055] font-bold border-b border-[#b8c9db]">
                      <tr>
                        <th className="p-2 w-8 text-center">#</th>
                        <th className="p-2 min-w-[140px]">Asset / Part Number *</th>
                        <th className="p-2 min-w-[200px]">Description</th>
                        <th className="p-2 w-24">Size</th>
                        <th className="p-2 w-16 text-center">Qty</th>
                        <th className="p-2 w-32">Cost Code</th>
                        <th className="p-2 w-28 text-right">Unit Price</th>
                        <th className="p-2 w-28 text-right">Total Price</th>
                        <th className="p-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {poLineDrafts.map((line, idx) => (
                        <tr key={line.id} className="hover:bg-slate-50">
                          <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-1">
                            <input
                              type="text"
                              required
                              placeholder="e.g. RG-6-01"
                              value={line.assetNo}
                              onChange={(e) => handleUpdatePOLine(idx, 'assetNo', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono font-bold text-slate-900"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              placeholder="Technical description..."
                              value={line.description}
                              onChange={(e) => handleUpdatePOLine(idx, 'description', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-800"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              placeholder='e.g. 6"'
                              value={line.size}
                              onChange={(e) => handleUpdatePOLine(idx, 'size', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-center font-mono text-slate-700"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              min={1}
                              value={line.qty}
                              onChange={(e) => handleUpdatePOLine(idx, 'qty', parseInt(e.target.value) || 1)}
                              className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-center font-bold text-slate-900"
                            />
                          </td>
                          <td className="p-1">
                            <select
                              value={line.costCode}
                              onChange={(e) => handleUpdatePOLine(idx, 'costCode', e.target.value as ProcurementClassification)}
                              className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-xs font-semibold text-slate-800"
                            >
                              <option value="ASSET">Asset (Capex)</option>
                              <option value="INVENTORY">Inventory</option>
                              <option value="CONSUMABLES">Consumables</option>
                            </select>
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={line.unitPrice}
                              onChange={(e) => handleUpdatePOLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                              className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-right font-mono text-slate-900"
                            />
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            AED {((Number(line.qty) || 0) * (Number(line.unitPrice) || 0)).toLocaleString()}
                          </td>
                          <td className="p-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemovePOLine(idx)}
                              className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                              title="Delete row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MODAL FOOTER */}
              <div className="p-3 bg-[#f0f5fb] border-t border-[#b8c9db] flex items-center justify-between flex-shrink-0 text-xs">
                <div className="font-bold text-slate-700">
                  Total PO Value: <span className="text-blue-900 text-sm font-mono ml-1">AED {totalPOAmount.toLocaleString()}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatePOModalOpen(false)}
                    className="bg-white hover:bg-slate-100 text-slate-700 font-bold px-3 py-1.5 rounded border border-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-1.5 rounded shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Save Purchase Order</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CREATE GOODS RECEIPT NOTE (GRN) */}
      {/* ========================================================================= */}
      {isCreateGRNModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-md shadow-2xl border border-slate-300 w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">
            {/* HEADER */}
            <div className="bg-[#1a3055] text-white px-4 py-2.5 flex items-center justify-between text-xs font-bold flex-shrink-0">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-400" />
                <span className="text-sm">Create Goods Receipt Note (GRN)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateGRNModalOpen(false)}
                className="text-white/80 hover:text-white cursor-pointer text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveGRN} className="flex flex-col flex-1 overflow-hidden">
              {/* HEADER FIELDS */}
              <div className="p-4 bg-[#f8fafc] border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs flex-shrink-0">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Link to PO Number</label>
                  <select
                    value={selectedPOForGRN}
                    onChange={(e) => handleSelectPOInGRN(e.target.value)}
                    className="w-full bg-white border border-blue-400 rounded px-2.5 py-1.5 font-mono font-bold text-blue-900"
                  >
                    <option value="">-- Direct Receipt (No PO) --</option>
                    {openPOsForReceiving.map((p) => (
                      <option key={p.poNumber} value={p.poNumber}>
                        {p.poNumber} &bull; {p.supplier} (Bal: {p.lines.reduce((s, l) => s + l.balanceQty, 0)} items)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">System Receipt # *</label>
                  <input
                    type="text"
                    required
                    value={grnHeader.receiptNumber}
                    onChange={(e) => setGrnHeader({ ...grnHeader, receiptNumber: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Manual GRN / Ref #
                    <span className="text-slate-400 font-normal ml-1">(Paper/Delivery Note)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DN-66057"
                    value={grnHeader.manualGRNNumber}
                    onChange={(e) => setGrnHeader({ ...grnHeader, manualGRNNumber: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Receipt Date *</label>
                  <input
                    type="date"
                    required
                    value={grnHeader.receiptDate}
                    onChange={(e) => setGrnHeader({ ...grnHeader, receiptDate: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-800 cursor-pointer"
                  />
                </div>
              </div>

              {/* RECEIPT LINE ITEMS */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800">
                    Receipt Line Items {selectedPOForGRN && `for PO ${selectedPOForGRN}`}
                  </h4>
                  <span className="text-slate-500 text-[11px]">
                    Only remaining balance is displayed for open PO items.
                  </span>
                </div>

                <div className="border border-[#b8c9db] rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#f0f5fb] text-[#1a3055] font-bold border-b border-[#b8c9db]">
                      <tr>
                        <th className="p-2 w-8 text-center">#</th>
                        <th className="p-2 min-w-[130px]">Asset / Part No</th>
                        <th className="p-2 min-w-[200px]">Description</th>
                        <th className="p-2 text-center w-16">PO Qty</th>
                        <th className="p-2 text-center w-16">Received</th>
                        <th className="p-2 text-center w-16 font-bold text-amber-900">Balance</th>
                        <th className="p-2 text-center w-24">Receive Qty *</th>
                        <th className="p-2 text-center w-28 bg-emerald-50 text-emerald-950 font-bold">
                          Received? (✓)
                        </th>
                        <th className="p-2 text-center w-32 bg-amber-50 text-amber-950 font-bold">
                          Inspection? (✓)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {grnLineDrafts.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-500 font-medium bg-slate-50">
                            Please select a Purchase Order above to load items.
                          </td>
                        </tr>
                      ) : (
                        grnLineDrafts.map((line, idx) => (
                          <tr key={line.poLineId || idx} className={line.isConfirmedReceived ? 'bg-blue-50/30' : 'hover:bg-slate-50'}>
                            <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                            <td className="p-2 font-mono font-bold text-slate-900">{line.assetNo}</td>
                            <td className="p-2 text-slate-800">{line.description}</td>
                            <td className="p-2 text-center font-mono">{line.poQty}</td>
                            <td className="p-2 text-center font-mono text-emerald-700">{line.alreadyReceived}</td>
                            <td className="p-2 text-center font-mono font-bold text-amber-800">{line.balanceToReceive}</td>
                            <td className="p-1 text-center">
                              <input
                                type="number"
                                min={0}
                                max={line.balanceToReceive}
                                value={line.receivedQty}
                                onChange={(e) => {
                                  const val = Math.max(0, parseInt(e.target.value) || 0);
                                  setGrnLineDrafts((prev) =>
                                    prev.map((l, i) =>
                                      i === idx ? { ...l, receivedQty: val, isConfirmedReceived: val > 0 } : l
                                    )
                                  );
                                }}
                                className="w-16 bg-white border border-slate-300 rounded px-1.5 py-1 text-center font-bold text-slate-900"
                              />
                            </td>
                            <td className="p-2 text-center bg-emerald-50/50">
                              <input
                                type="checkbox"
                                checked={line.isConfirmedReceived}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setGrnLineDrafts((prev) =>
                                    prev.map((l, i) =>
                                      i === idx
                                        ? {
                                            ...l,
                                            isConfirmedReceived: checked,
                                            receivedQty: checked && l.receivedQty === 0 ? l.balanceToReceive : l.receivedQty,
                                          }
                                        : l
                                    )
                                  );
                                }}
                                className="w-4 h-4 cursor-pointer text-emerald-600 rounded"
                              />
                            </td>
                            <td className="p-2 text-center bg-amber-50/50">
                              <input
                                type="checkbox"
                                checked={line.requiresInspection}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setGrnLineDrafts((prev) =>
                                    prev.map((l, i) => (i === idx ? { ...l, requiresInspection: checked } : l))
                                  );
                                }}
                                className="w-4 h-4 cursor-pointer text-amber-600 rounded"
                                title="If checked, routes item to Inspection Bay before becoming available in fleet"
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* FOOTER */}
              <div className="p-3 bg-[#f0f5fb] border-t border-[#b8c9db] flex items-center justify-between flex-shrink-0 text-xs">
                <div className="text-slate-600">
                  Confirmed Receiving:{' '}
                  <strong className="text-blue-900 font-mono">
                    {grnLineDrafts.filter((l) => l.isConfirmedReceived).reduce((s, l) => s + Number(l.receivedQty), 0)} unit(s)
                  </strong>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateGRNModalOpen(false)}
                    className="bg-white hover:bg-slate-100 text-slate-700 font-bold px-3 py-1.5 rounded border border-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-700 hover:bg-blue-800 text-white font-bold px-4 py-1.5 rounded shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Post Goods Receipt</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: VIEW / PREVIEW PO */}
      {/* ========================================================================= */}
      {previewPO && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-md shadow-2xl border border-slate-300 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="bg-[#1a3055] text-white px-4 py-2.5 flex items-center justify-between font-bold flex-shrink-0">
              <span>Purchase Order Details &bull; {previewPO.poNumber}</span>
              <button
                type="button"
                onClick={() => setPreviewPO(null)}
                className="text-white/80 hover:text-white cursor-pointer text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="text-slate-500 block font-medium">PO Number:</span>
                  <span className="font-mono font-bold text-blue-900">{previewPO.poNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Date:</span>
                  <span className="font-mono font-bold">{formatDateDD_MM_YYYY(previewPO.orderDate)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Supplier:</span>
                  <span className="font-bold">{previewPO.supplier}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Sub-Division:</span>
                  <span className="font-bold text-slate-800">{previewPO.subDivision || 'FISHING'}</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-2">Order Line Items</h4>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="p-2 w-8 text-center">#</th>
                        <th className="p-2">Asset / Part No</th>
                        <th className="p-2">Description</th>
                        <th className="p-2 text-center">Ordered</th>
                        <th className="p-2 text-center text-emerald-700">Received</th>
                        <th className="p-2 text-center text-amber-800 font-bold">Balance</th>
                        <th className="p-2 text-right">Unit Price</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {previewPO.lines.map((l, i) => (
                        <tr key={l.lineId || i}>
                          <td className="p-2 text-center font-mono text-slate-500">{i + 1}</td>
                          <td className="p-2 font-mono font-bold text-slate-900">{l.partNo}</td>
                          <td className="p-2 text-slate-700">{l.description}</td>
                          <td className="p-2 text-center font-mono">{l.orderedQty}</td>
                          <td className="p-2 text-center font-mono text-emerald-700">{l.receivedQty}</td>
                          <td className="p-2 text-center font-mono font-bold text-amber-800">{l.balanceQty}</td>
                          <td className="p-2 text-right font-mono">
                            {previewPO.currency} {l.unitPrice.toLocaleString()}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            {previewPO.currency} {(l.orderedQty * l.unitPrice).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
              <span className="font-bold text-slate-700">
                Total Value: <strong className="text-blue-900 font-mono">{previewPO.currency} {previewPO.totalAmount.toLocaleString()}</strong>
              </span>
              <button
                type="button"
                onClick={() => setPreviewPO(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-1 rounded cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: VIEW / PREVIEW GRN */}
      {/* ========================================================================= */}
      {previewGRN && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-md shadow-2xl border border-slate-300 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="bg-[#1a3055] text-white px-4 py-2.5 flex items-center justify-between font-bold flex-shrink-0">
              <span>Goods Receipt Inward Slip &bull; {previewGRN.grnId}</span>
              <button
                type="button"
                onClick={() => setPreviewGRN(null)}
                className="text-white/80 hover:text-white cursor-pointer text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="text-slate-500 block font-medium">GRN Number:</span>
                  <span className="font-mono font-bold text-blue-900">{previewGRN.grnId}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Manual / Ref #:</span>
                  <span className="font-mono font-bold">{previewGRN.supplierDt || previewGRN.ticketNo || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Linked PO #:</span>
                  <span className="font-mono font-bold text-blue-700">{previewGRN.poNumber || 'Direct'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Receipt Date:</span>
                  <span className="font-mono font-bold">{formatDateDD_MM_YYYY(previewGRN.dateRecd)}</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-2">Inward Received Line Items</h4>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="p-2 w-8 text-center">#</th>
                        <th className="p-2">Asset / Part No</th>
                        <th className="p-2">Description</th>
                        <th className="p-2 text-center">Size</th>
                        <th className="p-2 text-center text-emerald-800 font-bold">Qty Received</th>
                        <th className="p-2 text-center">Destination</th>
                        <th className="p-2 text-right">Inward Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {previewGRN.lines.map((l, i) => (
                        <tr key={l.lineId || i}>
                          <td className="p-2 text-center font-mono text-slate-500">{i + 1}</td>
                          <td className="p-2 font-mono font-bold text-slate-900">{l.partNo}</td>
                          <td className="p-2 text-slate-700">{l.description}</td>
                          <td className="p-2 text-center font-mono">{l.size || '—'}</td>
                          <td className="p-2 text-center font-mono font-bold text-emerald-800">{l.qtyReceived}</td>
                          <td className="p-2 text-center">
                            {l.reqInsp ? (
                              <span className="bg-amber-100 text-amber-800 font-bold text-[10px] px-2 py-0.5 rounded border border-amber-300">
                                Inspection Bay
                              </span>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-800 font-bold text-[10px] px-2 py-0.5 rounded border border-emerald-300">
                                Master Fleet (Yard Base)
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-800">
                            {previewGRN.currency || 'AED'} {l.bookValue.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
              <span className="font-bold text-slate-700">
                Total Inward Value: <strong className="text-emerald-800 font-mono">{previewGRN.currency || 'AED'} {previewGRN.totalInwardValue.toLocaleString()}</strong>
              </span>
              <button
                type="button"
                onClick={() => setPreviewGRN(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-1 rounded cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
