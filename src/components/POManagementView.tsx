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
}

type ActiveTab = 'po-register' | 'grn-inward' | 'supplier-report' | 'grn-history';

export const POManagementView: React.FC<POManagementViewProps> = ({
  user,
  onNavigate,
  showToast,
}) => {
  const isAdmin = user?.role === 'Admin';
  const [activeTab, setActiveTab] = useState<ActiveTab>('po-register');

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
  const [grnHeader, setGrnHeader] = useState({
    ticketNo: `${Math.floor(200 + Math.random() * 800)}`,
    supplier: supplierOptions[0] || 'EMDAD',
    supplierDt: `DN-${Math.floor(10000 + Math.random() * 90000)}`,
    poNumber: '',
    dateRecd: new Date().toISOString().slice(0, 10),
    mfgReceivedBy: user?.name || 'STORE INSPECTOR',
    currency: 'AED' as 'AED' | 'USD',
  });

  const [grnRows, setGrnRows] = useState<GRNLineItem[]>([
    {
      lineId: `GRNL-${Date.now()}-1`,
      partNo: 'RG-6-01',
      description: '6" NO GO RING GAUGE',
      category: 'GAUGE RING',
      size: '6"',
      toolsno: 'RG-6-01',
      contractRef: '4700024608',
      subDivision: 'FISHING',
      qtyReceived: 1,
      unitPrice: 12000,
      bookValue: 12000,
      currency: 'AED',
      belongsTo: 'EMDAD',
      reqInsp: false,
      insDate: '',
      classification: 'ASSET',
      usefulLifeMonths: 60,
      salvageValue: 0,
      monthlyDepreciation: 200,
      comments: '',
    },
  ]);

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
          category: l.category,
          size: l.size || '',
          toolsno: `${l.partNo || 'TL'}-${idx + 1}`,
          contractRef: l.contractRef || found.contractRef || '4700024608',
          subDivision: subDiv,
          qtyReceived: l.balanceQty, // Default to remaining balance
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

    setGrnRows(rows);
    showToast?.(`Loaded ${rows.length} pending lines from PO ${found.poNumber}`, 'info');
  };

  const handleAddGrnRow = () => {
    setGrnRows([
      ...grnRows,
      {
        lineId: `GRNL-${Date.now()}-${grnRows.length + 1}`,
        partNo: '',
        description: '',
        category: 'GAUGE RING',
        size: '',
        toolsno: '',
        contractRef: '4700024608',
        subDivision: 'FISHING',
        qtyReceived: 1,
        unitPrice: 0,
        bookValue: 0,
        currency: grnHeader.currency,
        belongsTo: 'EMDAD',
        reqInsp: false,
        classification: 'INVENTORY',
        comments: '',
      },
    ]);
  };

  const handleRemoveGrnRow = (idx: number) => {
    if (grnRows.length <= 1) return;
    setGrnRows(grnRows.filter((_, i) => i !== idx));
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

  const handlePostGRN = () => {
    if (!isAdmin) {
      showToast?.('Only Admin users have permission to post Goods Receipts.', 'error');
      return;
    }
    if (!grnHeader.ticketNo.trim() || !grnHeader.supplierDt.trim()) {
      showToast?.('Ticket No and Supplier Delivery Ticket / Note are required.', 'error');
      return;
    }
    if (grnRows.some((r) => !r.description.trim() || r.qtyReceived <= 0)) {
      showToast?.('All rows must have a description and received quantity > 0.', 'error');
      return;
    }

    const res = postGoodsReceiptNote({
      ticketNo: grnHeader.ticketNo,
      poNumber: grnHeader.poNumber || 'DIRECT-GRN',
      supplier: grnHeader.supplier,
      supplierDt: grnHeader.supplierDt,
      dateRecd: grnHeader.dateRecd,
      mfgReceivedBy: grnHeader.mfgReceivedBy,
      currency: grnHeader.currency,
      totalItemsReceived: grnRows.reduce((s, r) => s + r.qtyReceived, 0),
      totalInwardValue: grnRows.reduce((s, r) => s + r.qtyReceived * r.bookValue, 0),
      qcStatus: grnRows.some((r) => r.reqInsp) ? 'PENDING_INSPECTION' : 'ACCEPTED',
      comments: `Posted by ${user?.name || 'Admin'}`,
      lines: grnRows,
    });

    if (res.success) {
      showToast?.(res.message, 'success');
      refreshData();
      setActiveTab('grn-history');
    } else {
      showToast?.(res.message, 'error');
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
        <div className="bg-white rounded-b-xl rounded-tr-xl p-6 shadow-sm border border-slate-200 space-y-6">
          {/* Header Panel (Replicating exact layout of "Newreceipts" screenshot) */}
          <div className="bg-slate-50 border border-slate-300 rounded-xl p-5 shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span className="w-2.5 h-6 bg-indigo-600 rounded-full inline-block"></span>
                Newreceipts Inward Voucher
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase">PO Reference:</span>
                <select
                  value={grnHeader.poNumber}
                  onChange={(e) => handleSelectPOForGRN(e.target.value)}
                  className="px-3 py-1.5 border border-indigo-300 rounded-lg text-sm bg-white font-mono font-bold text-indigo-900 shadow-sm"
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

            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-xs font-semibold text-slate-600">
              <div>
                <label className="block text-slate-500 mb-1">Ticket No</label>
                <input
                  type="text"
                  value={grnHeader.ticketNo}
                  disabled={!isAdmin}
                  onChange={(e) => setGrnHeader({ ...grnHeader, ticketNo: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono font-bold text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Supplier DT / DN</label>
                <input
                  type="text"
                  value={grnHeader.supplierDt}
                  disabled={!isAdmin}
                  onChange={(e) => setGrnHeader({ ...grnHeader, supplierDt: e.target.value })}
                  placeholder="DN-66057"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Date Recd</label>
                <input
                  type="date"
                  value={grnHeader.dateRecd}
                  disabled={!isAdmin}
                  onChange={(e) => setGrnHeader({ ...grnHeader, dateRecd: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-slate-900 bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Supplier</label>
                <select
                  value={grnHeader.supplier}
                  disabled={!isAdmin}
                  onChange={(e) => setGrnHeader({ ...grnHeader, supplier: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-slate-900 bg-white font-medium"
                >
                  {supplierOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Mfg / Inspector</label>
                <input
                  type="text"
                  value={grnHeader.mfgReceivedBy}
                  disabled={!isAdmin}
                  onChange={(e) => setGrnHeader({ ...grnHeader, mfgReceivedBy: e.target.value })}
                  placeholder="NOOR ISLAM"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">PO Currency</label>
                <select
                  value={grnHeader.currency}
                  disabled={!isAdmin}
                  onChange={(e) => setGrnHeader({ ...grnHeader, currency: e.target.value as 'AED' | 'USD' })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-bold text-slate-900 bg-white"
                >
                  <option value="AED">AED (UAE Dirham)</option>
                  <option value="USD">USD (US Dollar)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Grid matching exact user's screenshot layout */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Inward Items Grid ({grnRows.length} lines)
              </div>
              {isAdmin && (
                <button
                  onClick={handleAddGrnRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Add Line Item
                </button>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-300 rounded-xl shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-200/80 text-slate-800 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2 whitespace-nowrap">Contract #</th>
                    <th className="p-2 whitespace-nowrap">Sub-Division</th>
                    <th className="p-2 whitespace-nowrap">cat</th>
                    <th className="p-2 whitespace-nowrap">Size</th>
                    <th className="p-2 whitespace-nowrap">toolsno</th>
                    <th className="p-2 whitespace-nowrap">description</th>
                    <th className="p-2 whitespace-nowrap text-center">qtyin</th>
                    <th className="p-2 whitespace-nowrap">Belongs to</th>
                    <th className="p-2 whitespace-nowrap text-right">BOOKVALUE ({grnHeader.currency})</th>
                    <th className="p-2 whitespace-nowrap text-center">Req_insp</th>
                    <th className="p-2 whitespace-nowrap">Classification</th>
                    <th className="p-2 whitespace-nowrap">ins_date</th>
                    <th className="p-2 whitespace-nowrap">comments</th>
                    {isAdmin && <th className="p-2 text-center"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {grnRows.map((row, idx) => (
                    <tr key={row.lineId} className="hover:bg-indigo-50/30 transition-colors">
                      {/* Contract Dropdown */}
                      <td className="p-1.5">
                        <select
                          value={row.contractRef || ''}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'contractRef', e.target.value)}
                          className="px-2 py-1 border border-slate-300 rounded text-xs font-mono font-bold bg-white"
                        >
                          {contractOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                          <option value="GENERAL / BASE">GENERAL BASE</option>
                        </select>
                      </td>

                      {/* Auto-derived Sub-Division */}
                      <td className="p-1.5">
                        <span className="font-bold text-slate-800 uppercase px-2 py-1 bg-slate-100 rounded border border-slate-200">
                          {row.subDivision}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="p-1.5">
                        <input
                          type="text"
                          value={row.category}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'category', e.target.value)}
                          placeholder="GAUGE RING"
                          className="w-24 px-2 py-1 border border-slate-300 rounded font-semibold text-slate-800"
                        />
                      </td>

                      {/* Size */}
                      <td className="p-1.5">
                        <input
                          type="text"
                          value={row.size || ''}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'size', e.target.value)}
                          placeholder="6&quot;"
                          className="w-16 px-2 py-1 border border-slate-300 rounded font-mono"
                        />
                      </td>

                      {/* toolsno (Serial #) */}
                      <td className="p-1.5">
                        <input
                          type="text"
                          value={row.toolsno || ''}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'toolsno', e.target.value)}
                          placeholder="RG-6-01"
                          className="w-24 px-2 py-1 border border-slate-300 rounded font-mono font-bold text-indigo-900 bg-indigo-50/30"
                        />
                      </td>

                      {/* Description */}
                      <td className="p-1.5">
                        <input
                          type="text"
                          value={row.description}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'description', e.target.value)}
                          placeholder="6&quot; NO GO RING GAUGE"
                          className="w-48 px-2 py-1 border border-slate-300 rounded font-medium text-slate-800"
                        />
                      </td>

                      {/* qtyin */}
                      <td className="p-1.5 text-center">
                        <input
                          type="number"
                          min="1"
                          value={row.qtyReceived}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'qtyReceived', parseInt(e.target.value) || 0)}
                          className="w-12 px-2 py-1 border border-slate-300 rounded text-center font-bold"
                        />
                      </td>

                      {/* Belongs to (Ownership) */}
                      <td className="p-1.5">
                        <input
                          type="text"
                          value={row.belongsTo}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'belongsTo', e.target.value)}
                          placeholder="EMDAD"
                          className="w-20 px-2 py-1 border border-slate-300 rounded font-semibold"
                        />
                      </td>

                      {/* BOOKVALUE */}
                      <td className="p-1.5 text-right">
                        <input
                          type="number"
                          value={row.bookValue}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'bookValue', parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 border border-slate-300 rounded text-right font-mono font-bold"
                        />
                      </td>

                      {/* Req_insp Checkbox */}
                      <td className="p-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.reqInsp}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'reqInsp', e.target.checked)}
                          className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                        />
                      </td>

                      {/* Classification Dropdown */}
                      <td className="p-1.5">
                        <select
                          value={row.classification}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'classification', e.target.value as ProcurementClassification)}
                          className={`px-2 py-1 border rounded font-bold text-xs ${
                            row.classification === 'ASSET'
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : row.classification === 'INVENTORY'
                              ? 'bg-blue-100 text-blue-900 border-blue-300'
                              : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          }`}
                        >
                          <option value="ASSET">ASSET (Depreciated)</option>
                          <option value="INVENTORY">INVENTORY (Fleet)</option>
                          <option value="CONSUMABLE">CONSUMABLE (Store)</option>
                        </select>
                      </td>

                      {/* ins_date */}
                      <td className="p-1.5">
                        <input
                          type="date"
                          value={row.insDate || ''}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'insDate', e.target.value)}
                          className="w-28 px-1.5 py-1 border border-slate-300 rounded text-xs"
                        />
                      </td>

                      {/* comments */}
                      <td className="p-1.5">
                        <input
                          type="text"
                          value={row.comments || ''}
                          disabled={!isAdmin}
                          onChange={(e) => handleGrnRowChange(idx, 'comments', e.target.value)}
                          placeholder="Heat #, Bay..."
                          className="w-28 px-2 py-1 border border-slate-300 rounded"
                        />
                      </td>

                      {isAdmin && (
                        <td className="p-1.5 text-center">
                          <button
                            onClick={() => handleRemoveGrnRow(idx)}
                            className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Depreciation Summary for ASSET lines */}
            {grnRows.some((r) => r.classification === 'ASSET') && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Asset Capitalization & Depreciation Allocation
                </div>
                <p className="text-xs text-amber-800">
                  The items classified as <span className="font-bold">ASSET</span> will be added to the Fixed Asset register.
                  Monthly straight-line depreciation will be automatically posted into that contract's linked Sub-Division column
                  under <span className="font-bold">GL Cost Code 51105 Dep P&M</span> on the Sub-Division Monthly Expense Grid.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  {grnRows
                    .filter((r) => r.classification === 'ASSET')
                    .map((asset, i) => (
                      <div key={i} className="p-2.5 bg-white border border-amber-200 rounded-lg text-xs">
                        <div className="font-bold text-slate-800 truncate">{asset.description || 'Asset'}</div>
                        <div className="text-slate-500">Sub-Division: <span className="font-bold text-slate-800">{asset.subDivision}</span></div>
                        <div className="text-slate-500">Book Value: <span className="font-mono font-bold text-slate-900">{grnHeader.currency} {asset.bookValue.toLocaleString()}</span></div>
                        <div className="text-emerald-700 font-bold">
                          Depreciation: {grnHeader.currency} {asset.monthlyDepreciation || 0}/mo (over {asset.usefulLifeMonths || 60} mos)
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Post Action */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <div className="text-sm font-semibold text-slate-600">
                Total Inward Value:{' '}
                <span className="font-mono font-bold text-indigo-900 text-base">
                  {grnHeader.currency} {grnRows.reduce((s, r) => s + r.qtyReceived * r.bookValue, 0).toLocaleString()}
                </span>
              </div>

              {isAdmin ? (
                <button
                  onClick={handlePostGRN}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-900/20 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  ✅ Confirm & Post Goods Receipt (GRN)
                </button>
              ) : (
                <span className="text-xs text-slate-400 font-semibold italic">
                  Read-only view (Admin credentials required to post receipts).
                </span>
              )}
            </div>
          </div>
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

            {/* Line Items Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Line Items ({poLines.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddPoLine}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Line
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                    <tr>
                      <th className="p-2">Part #</th>
                      <th className="p-2">Description</th>
                      <th className="p-2">Contract</th>
                      <th className="p-2 text-center">Qty</th>
                      <th className="p-2 text-right">Unit Price</th>
                      <th className="p-2 text-right">Total</th>
                      <th className="p-2">Type</th>
                      <th className="p-2 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {poLines.map((line, idx) => (
                      <tr key={idx}>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={line.partNo}
                            onChange={(e) => handlePoLineChange(idx, 'partNo', e.target.value)}
                            placeholder="Part #"
                            className="w-24 px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => handlePoLineChange(idx, 'description', e.target.value)}
                            placeholder="Full description"
                            className="w-48 px-2 py-1 border border-slate-300 rounded text-xs font-medium"
                          />
                        </td>
                        <td className="p-1.5">
                          <select
                            value={line.contractRef || newPoHeader.contractRef}
                            onChange={(e) => handlePoLineChange(idx, 'contractRef', e.target.value)}
                            className="w-28 px-1.5 py-1 border border-slate-300 rounded text-xs font-mono"
                          >
                            {contractOptions.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1.5 text-center">
                          <input
                            type="number"
                            min="1"
                            value={line.orderedQty}
                            onChange={(e) => handlePoLineChange(idx, 'orderedQty', parseFloat(e.target.value) || 0)}
                            className="w-14 px-1.5 py-1 border border-slate-300 rounded text-center font-bold text-xs"
                          />
                        </td>
                        <td className="p-1.5 text-right">
                          <input
                            type="number"
                            value={line.unitPrice}
                            onChange={(e) => handlePoLineChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-20 px-1.5 py-1 border border-slate-300 rounded text-right font-mono text-xs font-bold"
                          />
                        </td>
                        <td className="p-1.5 text-right font-mono font-bold text-slate-800">
                          {newPoHeader.currency} {((line.orderedQty || 0) * (line.unitPrice || 0)).toLocaleString()}
                        </td>
                        <td className="p-1.5">
                          <select
                            value={line.classification}
                            onChange={(e) => handlePoLineChange(idx, 'classification', e.target.value)}
                            className="px-1.5 py-1 border border-slate-300 rounded text-xs font-semibold"
                          >
                            <option value="ASSET">ASSET</option>
                            <option value="INVENTORY">INVENTORY</option>
                            <option value="CONSUMABLE">CONSUMABLE</option>
                          </select>
                        </td>
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemovePoLine(idx)}
                            className="text-rose-500 hover:text-rose-700"
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
