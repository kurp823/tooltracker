import React, { useState, useMemo, useEffect } from 'react';
import { ConsumableItem, ConsumableIssuance, SubDivision, User, DrillingJob, ToolItem } from '../types';
import {
  getConsumablesList,
  saveConsumablesList,
  getConsumableIssuances,
  issueConsumableItem,
  recordConsumableReceipt,
  generateSivPrintHtml,
  getConsumableCategories,
  addConsumableCategory,
} from '../services/consumablesService';
import { SearchableConsumableSelect } from './SearchableConsumableSelect';
import { openPrintWindow } from '../services/ticketPrintService';
import {
  Search,
  Filter,
  Plus,
  Package,
  Printer,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Layers,
  ArrowRight,
  Download,
  Building2,
  Wrench,
  Warehouse,
  History,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface ConsumablesViewProps {
  user?: User | null;
  jobs?: DrillingJob[];
  inventory?: ToolItem[];
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefresh?: () => void;
}

export const ConsumablesView: React.FC<ConsumablesViewProps> = ({
  user,
  jobs = [],
  inventory = [],
  showToast,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'stock' | 'issuance' | 'receipt'>('stock');
  const [stockItems, setStockItems] = useState<ConsumableItem[]>(getConsumablesList());
  const [issuances, setIssuances] = useState<ConsumableIssuance[]>(getConsumableIssuances());
  const [categories, setCategories] = useState<string[]>(getConsumableCategories());
  const [isAddingNewCat, setIsAddingNewCat] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Modals
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isAddSkuModalOpen, setIsAddSkuModalOpen] = useState(false);

  // Issuance Form State
  const [issuePartNo, setIssuePartNo] = useState('');
  const [issueQty, setIssueQty] = useState<number>(1);
  const [destinationType, setDestinationType] = useState<'WORKSHOP_BASE' | 'TOOL_REDRESS'>('TOOL_REDRESS');
  const [workshopArea, setWorkshopArea] = useState('Main Workshop Bay 1');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedToolSerial, setSelectedToolSerial] = useState('');
  const [subDivision, setSubDivision] = useState<SubDivision>('RENTALS');
  const [requestedBy, setRequestedBy] = useState('');
  const [issuedBy, setIssuedBy] = useState(user?.name || 'Hamdan Storekeeper');
  const [remarks, setRemarks] = useState('');

  // Receipt Form State
  const [receiptPo, setReceiptPo] = useState('');
  const [receiptPartNo, setReceiptPartNo] = useState('');
  const [receiptDesc, setReceiptDesc] = useState('');
  const [receiptQty, setReceiptQty] = useState<number>(5);
  const [receiptCost, setReceiptCost] = useState<number>(1000);
  const [receiptSupplier, setReceiptSupplier] = useState('');

  // New SKU State
  const [newPartNo, setNewPartNo] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState<any>('Redress Kit');
  const [newUnit, setNewUnit] = useState('KIT');
  const [newStock, setNewStock] = useState<number>(10);
  const [newCost, setNewCost] = useState<number>(1500);
  const [newReorder, setNewReorder] = useState<number>(5);
  const [newBin, setNewBin] = useState('BAY-A-01');
  const [newSupplier, setNewSupplier] = useState('');

  const refreshData = () => {
    setStockItems(getConsumablesList());
    setIssuances(getConsumableIssuances());
    if (onRefresh) onRefresh();
  };

  useEffect(() => {
    const handleUpdate = () => {
      setStockItems(getConsumablesList());
      setIssuances(getConsumableIssuances());
    };
    window.addEventListener('consumables_updated', handleUpdate);
    return () => window.removeEventListener('consumables_updated', handleUpdate);
  }, []);

  // Filtered Stock Items
  const filteredStock = useMemo(() => {
    return stockItems.filter((item) => {
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          item.partNo.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.binLocation.toLowerCase().includes(q) ||
          (item.supplier && item.supplier.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [stockItems, selectedCategory, search]);

  // Inventory Totals
  const stockSummary = useMemo(() => {
    const totalSKUs = stockItems.length;
    const totalUnits = stockItems.reduce((sum, i) => sum + i.currentStock, 0);
    const totalValuation = stockItems.reduce((sum, i) => sum + (i.currentStock * i.unitCostAED), 0);
    const lowStockCount = stockItems.filter((i) => i.currentStock <= i.reorderLevel).length;

    return { totalSKUs, totalUnits, totalValuation, lowStockCount };
  }, [stockItems]);

  // Handle Issuance Submit
  const handleIssueSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!issuePartNo) {
      if (showToast) showToast('Please select a consumable item to issue.', 'error');
      return;
    }

    const selectedItem = stockItems.find((s) => s.partNo === issuePartNo);
    if (!selectedItem) return;

    if (issueQty <= 0) {
      if (showToast) showToast('Issue quantity must be greater than zero.', 'error');
      return;
    }

    if (selectedItem.currentStock < issueQty) {
      if (showToast) {
        showToast(
          `Insufficient stock! Available: ${selectedItem.currentStock} ${selectedItem.unit}. Negative inventory is not permitted.`,
          'error'
        );
      }
      return;
    }

    const result = issueConsumableItem({
      issueDate: new Date().toISOString().substring(0, 10),
      partNo: selectedItem.partNo,
      description: selectedItem.description,
      qtyIssued: Number(issueQty),
      unitCostAED: selectedItem.unitCostAED,
      destinationType,
      workshopArea: destinationType === 'WORKSHOP_BASE' ? workshopArea : undefined,
      jobId: destinationType === 'TOOL_REDRESS' ? selectedJobId : undefined,
      toolSerialNo: destinationType === 'TOOL_REDRESS' ? selectedToolSerial : undefined,
      subDivision,
      requestedBy: requestedBy.trim() || 'Workshop Lead Technician',
      issuedBy: issuedBy.trim() || user?.name || 'Storekeeper',
      remarks,
    });

    if (result.success) {
      setIsIssueModalOpen(false);
      refreshData();
      if (showToast) showToast(result.message, 'success');
    } else {
      if (showToast) showToast(result.message, 'error');
    }
  };

  // Handle Receipt Submit
  const handleReceiptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptPartNo.trim() || receiptQty <= 0) {
      if (showToast) showToast('Please enter a valid part number and quantity.', 'error');
      return;
    }

    recordConsumableReceipt({
      poNumber: receiptPo.trim() || `PO-${Date.now().toString().slice(-6)}`,
      partNo: receiptPartNo.trim().toUpperCase(),
      description: receiptDesc.trim() || 'Consumable Item',
      qtyReceived: Number(receiptQty),
      unitCostAED: Number(receiptCost),
      totalCostAED: Number((receiptQty * receiptCost).toFixed(2)),
      supplier: receiptSupplier.trim() || 'Approved Supplier',
      receivedDate: new Date().toISOString().substring(0, 10),
      receivedBy: user?.name || 'Storekeeper',
    });

    setIsReceiptModalOpen(false);
    refreshData();
    if (showToast) showToast(`Received ${receiptQty} units of ${receiptPartNo} into store.`, 'success');
  };

  // Handle Add New SKU
  const handleAddSkuSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartNo.trim()) return;

    const list = getConsumablesList();
    if (list.some((i) => i.partNo.toUpperCase() === newPartNo.trim().toUpperCase())) {
      if (showToast) showToast('Part number already exists in consumables catalogue.', 'error');
      return;
    }

    const newItem: ConsumableItem = {
      id: `SKU-${Date.now()}`,
      partNo: newPartNo.trim().toUpperCase(),
      description: newDesc.trim(),
      category: newCategory,
      unit: newUnit,
      currentStock: Number(newStock),
      unitCostAED: Number(newCost),
      reorderLevel: Number(newReorder),
      binLocation: newBin.trim().toUpperCase(),
      supplier: newSupplier.trim(),
      lastRestockedDate: new Date().toISOString().substring(0, 10),
    };

    list.push(newItem);
    saveConsumablesList(list);
    setIsAddSkuModalOpen(false);
    refreshData();
    if (showToast) showToast(`Added SKU ${newPartNo} to master catalogue.`, 'success');
  };

  // Print SIV Voucher
  const handlePrintSiv = (issuance: ConsumableIssuance) => {
    const html = generateSivPrintHtml(issuance);
    openPrintWindow(html, `SIV-${issuance.sivNumber}`);
  };

  // Export to Excel
  const handleExportStock = () => {
    const rows = filteredStock.map((s) => ({
      'Part Number': s.partNo,
      'Description': s.description,
      'Category': s.category,
      'Unit': s.unit,
      'Current Stock': s.currentStock,
      'Unit Cost (AED)': s.unitCostAED,
      'Total Value (AED)': s.currentStock * s.unitCostAED,
      'Reorder Level': s.reorderLevel,
      'Low Stock Status': s.currentStock <= s.reorderLevel ? 'LOW STOCK' : 'OK',
      'Bin Location': s.binLocation,
      'Supplier': s.supplier || '—',
      'Last Restocked': s.lastRestockedDate || '—',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consumables Stock');
    XLSX.writeFile(wb, `Consumables_Inventory_${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-[#1b3a57] to-slate-900 border border-slate-700 rounded-lg p-4 text-white shadow-md">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="bg-amber-600 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                Store &amp; Inventory • GAP C
              </span>
              <h1 className="text-xl font-bold tracking-tight">Consumables Store &amp; Material Issuance</h1>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Workshop consumables, redress kits, thread dope, and paint. Dual routing: Workshop overhead vs Direct tool redress. Negative stock prohibited.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportStock}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-semibold flex items-center space-x-1 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Stock</span>
            </button>
            <button
              onClick={() => setIsReceiptModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-xs font-bold flex items-center space-x-1 shadow transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Goods Receipt (GR)</span>
            </button>
            <button
              onClick={() => {
                setIssuePartNo(stockItems[0]?.partNo || '');
                setIsIssueModalOpen(true);
              }}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold flex items-center space-x-1 shadow transition cursor-pointer"
            >
              <Wrench className="w-4 h-4" />
              <span>Issue Consumable (SIV)</span>
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-700/80">
          <div className="bg-slate-800/80 rounded p-2.5 border border-slate-700">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Catalogue SKUs</div>
            <div className="text-base font-extrabold text-blue-400 font-mono mt-0.5">
              {stockSummary.totalSKUs} Items
            </div>
          </div>
          <div className="bg-slate-800/80 rounded p-2.5 border border-slate-700">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Units in Stock</div>
            <div className="text-base font-extrabold text-slate-200 font-mono mt-0.5">
              {stockSummary.totalUnits.toLocaleString()} Units
            </div>
          </div>
          <div className="bg-slate-800/80 rounded p-2.5 border border-slate-700">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Inventory Valuation</div>
            <div className="text-base font-extrabold text-emerald-400 font-mono mt-0.5">
              AED {stockSummary.totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-slate-800/80 rounded p-2.5 border border-slate-700">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Low Stock Warnings</div>
            <div className="text-base font-extrabold text-amber-400 font-mono mt-0.5 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>{stockSummary.lowStockCount} SKUs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center space-x-2 border-b border-slate-300 pb-1 text-xs">
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-3 py-1.5 font-bold rounded-t-md transition cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'stock'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Warehouse className="w-3.5 h-3.5" />
          <span>Stock Catalogue &amp; Levels ({stockItems.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('issuance')}
          className={`px-3 py-1.5 font-bold rounded-t-md transition cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'issuance'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Issuance Slips &amp; Vouchers ({issuances.length})</span>
        </button>
      </div>

      {/* TAB 1: Stock Inventory */}
      {activeTab === 'stock' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="bg-white border border-[#b8c9db] rounded-lg p-3 shadow-xs flex flex-wrap items-center gap-3 text-xs">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search part #, description, bin location, supplier..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-slate-600">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1.5 bg-white font-medium text-slate-800 cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setIsAddSkuModalOpen(true)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-slate-700 font-bold cursor-pointer"
            >
              + New SKU
            </button>
          </div>

          {/* Stock Table */}
          <div className="bg-white border border-[#b8c9db] rounded-lg shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[calc(100vh-360px)]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#eef4fb] text-[#1a3055] border-b border-[#b8c9db] sticky top-0 z-10 shadow-2xs font-bold text-[11px]">
                  <tr>
                    <th className="p-2.5 border-r border-slate-200">Part Number</th>
                    <th className="p-2.5 border-r border-slate-200">Description</th>
                    <th className="p-2.5 border-r border-slate-200">Category</th>
                    <th className="p-2.5 border-r border-slate-200 text-center">Unit</th>
                    <th className="p-2.5 border-r border-slate-200 text-right">Available Qty</th>
                    <th className="p-2.5 border-r border-slate-200 text-right">Unit Cost (AED)</th>
                    <th className="p-2.5 border-r border-slate-200 text-right">Valuation (AED)</th>
                    <th className="p-2.5 border-r border-slate-200 text-center">Bin Location</th>
                    <th className="p-2.5 border-r border-slate-200">Supplier</th>
                    <th className="p-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredStock.map((item) => {
                    const isLowStock = item.currentStock <= item.reorderLevel;

                    return (
                      <tr key={item.id} className="hover:bg-blue-50/40 transition">
                        <td className="p-2.5 border-r border-slate-200 font-mono font-bold text-slate-900">
                          {item.partNo}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 font-medium text-slate-800">
                          {item.description}
                        </td>
                        <td className="p-2.5 border-r border-slate-200">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {item.category}
                          </span>
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-bold text-slate-600">
                          {item.unit}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono">
                          <div className="flex items-center justify-end space-x-1.5">
                            <span className={`font-bold ${isLowStock ? 'text-amber-700' : 'text-slate-900'}`}>
                              {item.currentStock}
                            </span>
                            {isLowStock && (
                              <span className="bg-amber-100 text-amber-800 border border-amber-300 rounded px-1 text-[9px] font-bold" title={`Reorder level: ${item.reorderLevel}`}>
                                REORDER
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono text-slate-700">
                          AED {item.unitCostAED.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-right font-mono font-bold text-blue-900">
                          AED {(item.currentStock * item.unitCostAED).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold text-slate-600">
                          {item.binLocation}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-slate-600 truncate max-w-[150px]">
                          {item.supplier || '—'}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => {
                              setIssuePartNo(item.partNo);
                              setIsIssueModalOpen(true);
                            }}
                            className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded text-[10px] font-bold transition cursor-pointer"
                          >
                            Issue
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Issuance Vouchers Ledger */}
      {activeTab === 'issuance' && (
        <div className="bg-white border border-[#b8c9db] rounded-lg shadow-xs overflow-hidden">
          <div className="p-3 bg-[#eef4fb] border-b border-[#b8c9db] flex justify-between items-center text-xs">
            <div className="font-bold text-[#1a3055]">Store Issuance Vouchers (SIV) Ledger</div>
            <div className="text-slate-500 text-[11px]">* All issuances deduct stock and post to financial cost lines</div>
          </div>

          <div className="overflow-x-auto max-h-[calc(100vh-360px)]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f8fafc] text-slate-700 border-b border-[#b8c9db] sticky top-0 z-10 font-bold text-[11px]">
                <tr>
                  <th className="p-2.5 border-r border-slate-200">SIV #</th>
                  <th className="p-2.5 border-r border-slate-200">Date</th>
                  <th className="p-2.5 border-r border-slate-200">Part No &amp; Description</th>
                  <th className="p-2.5 border-r border-slate-200 text-center">Qty</th>
                  <th className="p-2.5 border-r border-slate-200 text-right">Total Cost (AED)</th>
                  <th className="p-2.5 border-r border-slate-200">Routing Destination</th>
                  <th className="p-2.5 border-r border-slate-200 text-center">Sub-Division</th>
                  <th className="p-2.5 border-r border-slate-200">Requested / Issued By</th>
                  <th className="p-2.5 text-center">Print Voucher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {issuances.map((iss) => (
                  <tr key={iss.issuanceId} className="hover:bg-blue-50/40 transition">
                    <td className="p-2.5 border-r border-slate-200 font-mono font-bold text-red-700">
                      {iss.sivNumber}
                    </td>
                    <td className="p-2.5 border-r border-slate-200 font-mono text-slate-600">
                      {iss.issueDate}
                    </td>
                    <td className="p-2.5 border-r border-slate-200">
                      <div className="font-bold text-slate-900">{iss.partNo}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[220px]">{iss.description}</div>
                    </td>
                    <td className="p-2.5 border-r border-slate-200 text-center font-bold font-mono text-slate-800">
                      {iss.qtyIssued}
                    </td>
                    <td className="p-2.5 border-r border-slate-200 text-right font-mono font-bold text-blue-900">
                      AED {iss.totalCostAED.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2.5 border-r border-slate-200">
                      {iss.destinationType === 'TOOL_REDRESS' ? (
                        <div>
                          <span className="font-bold text-blue-800">Tool Redress: {iss.toolSerialNo || 'Tool'}</span>
                          {iss.jobId && <div className="text-[10px] text-slate-500 font-mono">Job: {iss.jobId}</div>}
                        </div>
                      ) : (
                        <div>
                          <span className="font-bold text-slate-700">Workshop Base</span>
                          <div className="text-[10px] text-slate-500">{iss.workshopArea || 'Base Operations'}</div>
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 border-r border-slate-200 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        {iss.subDivision}
                      </span>
                    </td>
                    <td className="p-2.5 border-r border-slate-200 text-[11px]">
                      <div><strong>Req:</strong> {iss.requestedBy}</div>
                      <div className="text-slate-500"><strong>Iss:</strong> {iss.issuedBy}</div>
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => handlePrintSiv(iss)}
                        className="p-1.5 text-blue-700 hover:bg-blue-100 rounded cursor-pointer transition"
                        title="Print Store Issuance Voucher"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Issue Consumable (SIV) */}
      {isIssueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="bg-[#1a3055] text-white px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-sm">Issue Consumables (Store Issuance Voucher)</h2>
              <button
                onClick={() => setIsIssueModalOpen(false)}
                className="text-slate-300 hover:text-white cursor-pointer font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleIssueSubmit} className="p-4 space-y-3 text-xs">
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-900 text-[11px]">
                <strong>Negative Inventory Policy:</strong> Issuances exceeding available shelf stock are blocked automatically.
              </div>

              {/* SKU Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Consumable SKU *</label>
                <SearchableConsumableSelect
                  items={stockItems}
                  selectedPartNo={issuePartNo}
                  onSelect={(item) => setIssuePartNo(item.partNo)}
                />
              </div>

              {/* Quantity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Quantity to Issue *</label>
                  <input
                    type="number"
                    min={1}
                    value={issueQty}
                    onChange={(e) => setIssueQty(parseInt(e.target.value, 10) || 1)}
                    required
                    className="w-full border rounded px-2.5 py-1.5 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Sub-Division P&amp;L</label>
                  <select
                    value={subDivision}
                    onChange={(e) => setSubDivision(e.target.value as SubDivision)}
                    className="w-full border rounded px-2.5 py-1.5 font-bold text-slate-800 bg-white"
                  >
                    <option value="RENTALS">RENTALS</option>
                    <option value="FISHING">FISHING</option>
                    <option value="WHIPSTOCK">WHIPSTOCK</option>
                  </select>
                </div>
              </div>

              {/* Destination Routing */}
              <div className="border border-slate-300 rounded p-2.5 space-y-2 bg-slate-50">
                <label className="block font-bold text-slate-700">Cost Destination Routing *</label>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="radio"
                      name="destination"
                      checked={destinationType === 'TOOL_REDRESS'}
                      onChange={() => setDestinationType('TOOL_REDRESS')}
                    />
                    <span className="font-bold text-blue-900">Specific Tool Redress (Asset Trail)</span>
                  </label>
                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="radio"
                      name="destination"
                      checked={destinationType === 'WORKSHOP_BASE'}
                      onChange={() => setDestinationType('WORKSHOP_BASE')}
                    />
                    <span className="font-bold text-slate-700">Workshop Overhead</span>
                  </label>
                </div>

                {destinationType === 'TOOL_REDRESS' ? (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block font-medium text-slate-600 mb-1">Target Tool Serial</label>
                      <input
                        type="text"
                        value={selectedToolSerial}
                        onChange={(e) => setSelectedToolSerial(e.target.value)}
                        placeholder="e.g. JAR-675-014"
                        className="w-full border rounded px-2 py-1 font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-600 mb-1">Linked Job ID</label>
                      <input
                        type="text"
                        value={selectedJobId}
                        onChange={(e) => setSelectedJobId(e.target.value)}
                        placeholder="e.g. JOB-026-01798"
                        className="w-full border rounded px-2 py-1 font-mono font-bold"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block font-medium text-slate-600 mb-1">Workshop Area / Base Destination</label>
                    <input
                      type="text"
                      value={workshopArea}
                      onChange={(e) => setWorkshopArea(e.target.value)}
                      placeholder="e.g. Main Base Bay 1, Blasting Yard"
                      className="w-full border rounded px-2 py-1"
                    />
                  </div>
                )}
              </div>

              {/* Personnel */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Requested By</label>
                  <input
                    type="text"
                    value={requestedBy}
                    onChange={(e) => setRequestedBy(e.target.value)}
                    placeholder="e.g. Tariq Mansour (Lead Tech)"
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Issued By</label>
                  <input
                    type="text"
                    value={issuedBy}
                    onChange={(e) => setIssuedBy(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Usage Remarks</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  placeholder="Notes on tool maintenance, condition, or justification..."
                  className="w-full border rounded px-2.5 py-1 text-xs"
                />
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsIssueModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-blue-600 text-white font-bold hover:bg-blue-700 shadow cursor-pointer"
                >
                  Generate SIV Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Goods Receipt */}
      {isReceiptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-emerald-800 text-white px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-sm">Goods Receipt — Consumables Store Inward</h2>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="text-slate-300 hover:text-white cursor-pointer font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReceiptSubmit} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">PO Reference</label>
                <input
                  type="text"
                  value={receiptPo}
                  onChange={(e) => setReceiptPo(e.target.value)}
                  placeholder="e.g. PO-2026-081"
                  className="w-full border rounded px-2.5 py-1.5 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Part Number *</label>
                <input
                  type="text"
                  value={receiptPartNo}
                  onChange={(e) => setReceiptPartNo(e.target.value)}
                  placeholder="e.g. RK-JAR-675"
                  required
                  className="w-full border rounded px-2.5 py-1.5 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Item Description</label>
                <input
                  type="text"
                  value={receiptDesc}
                  onChange={(e) => setReceiptDesc(e.target.value)}
                  placeholder="e.g. Redress Seal Kit"
                  className="w-full border rounded px-2.5 py-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Qty Received *</label>
                  <input
                    type="number"
                    min={1}
                    value={receiptQty}
                    onChange={(e) => setReceiptQty(parseInt(e.target.value, 10) || 1)}
                    required
                    className="w-full border rounded px-2.5 py-1.5 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unit Cost (AED)</label>
                  <input
                    type="number"
                    value={receiptCost}
                    onChange={(e) => setReceiptCost(parseFloat(e.target.value) || 0)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Supplier Name</label>
                <input
                  type="text"
                  value={receiptSupplier}
                  onChange={(e) => setReceiptSupplier(e.target.value)}
                  placeholder="e.g. Downhole Seal Tech UAE"
                  className="w-full border rounded px-2.5 py-1.5"
                />
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsReceiptModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-700 text-white font-bold hover:bg-emerald-600 shadow cursor-pointer"
                >
                  Receive Goods
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add New SKU */}
      {isAddSkuModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-[#1a3055] text-white px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-sm">Add New Consumable SKU to Master</h2>
              <button
                onClick={() => setIsAddSkuModalOpen(false)}
                className="text-slate-300 hover:text-white cursor-pointer font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSkuSubmit} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Part Number *</label>
                  <input
                    type="text"
                    value={newPartNo}
                    onChange={(e) => setNewPartNo(e.target.value)}
                    placeholder="e.g. LUB-GREASE-HT"
                    required
                    className="w-full border rounded px-2 py-1 font-mono font-bold"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Category *</label>
                    <button
                      type="button"
                      onClick={() => setIsAddingNewCat(!isAddingNewCat)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                    >
                      {isAddingNewCat ? '← Select Existing' : '+ Add New'}
                    </button>
                  </div>

                  {isAddingNewCat ? (
                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        value={newCatInput}
                        onChange={(e) => setNewCatInput(e.target.value)}
                        placeholder="Type new category..."
                        className="w-full border rounded px-2 py-1 font-bold text-slate-800 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newCatInput.trim()) {
                            const updated = addConsumableCategory(newCatInput);
                            setCategories(updated);
                            setNewCategory(newCatInput.trim());
                            setIsAddingNewCat(false);
                            setNewCatInput('');
                          }
                        }}
                        className="px-2 py-1 bg-blue-600 text-white rounded font-bold text-[10px] cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full border rounded px-2 py-1 bg-white font-medium"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description *</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="e.g. High Temp Synthetic Bearing Grease"
                  required
                  className="w-full border rounded px-2 py-1"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Initial Qty</label>
                  <input
                    type="number"
                    value={newStock}
                    onChange={(e) => setNewStock(parseInt(e.target.value, 10) || 0)}
                    className="w-full border rounded px-2 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unit Cost (AED)</label>
                  <input
                    type="number"
                    value={newCost}
                    onChange={(e) => setNewCost(parseFloat(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reorder Lvl</label>
                  <input
                    type="number"
                    value={newReorder}
                    onChange={(e) => setNewReorder(parseInt(e.target.value, 10) || 0)}
                    className="w-full border rounded px-2 py-1 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bin / Location</label>
                  <input
                    type="text"
                    value={newBin}
                    onChange={(e) => setNewBin(e.target.value)}
                    placeholder="e.g. BAY-B-04"
                    className="w-full border rounded px-2 py-1 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unit of Measure</label>
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="w-full border rounded px-2 py-1 bg-white font-medium"
                  >
                    <option value="KIT">KIT</option>
                    <option value="EA">EA</option>
                    <option value="CAN">CAN</option>
                    <option value="LTR">LTR</option>
                    <option value="SET">SET</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddSkuModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-blue-600 text-white font-bold hover:bg-blue-700 shadow cursor-pointer"
                >
                  Save SKU
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
