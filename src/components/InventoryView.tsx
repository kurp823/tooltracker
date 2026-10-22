import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ToolItem, User } from '../types';
import { TOOL_SIZES } from '../data/initialData';
import { useModulePermission, ReadOnlyBanner } from '../services/permissionService';
import { useResizableColumns, ResizerHandle, useCustomColumns } from '../services/customColumnService';
import { DropdownListKey, getDropdownOptions } from '../services/dropdownService';
import { AdminDropdownModal } from './AdminDropdownModal';
import { Settings as SettingsIcon } from 'lucide-react';
import { SearchableDropdown } from './SearchableDropdown';

interface InventoryViewProps {
  user?: User | null;
  inventory: ToolItem[];
  categories?: string[];
  sizes?: string[];
  onSaveInventory?: (updated: ToolItem[]) => void;
  onAddTool?: (tool: ToolItem) => void;
  onUpdateTool?: (id: string, updates: Partial<ToolItem>) => void;
  isAddModalOpen?: boolean;
  onCloseAddModal?: () => void;
  onOpenAddModal?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onOpenToolHistory?: (serial: string) => void;
  onRefresh?: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  user,
  inventory,
  categories: propCategories,
  sizes: propSizes,
  onSaveInventory,
  onAddTool,
  onUpdateTool,
  isAddModalOpen: propIsAddOpen,
  onCloseAddModal,
  onOpenAddModal,
  showToast: propShowToast,
  onOpenToolHistory,
  onRefresh,
}) => {
  const isAdmin = user?.role === 'Admin';
  const canEdit = isAdmin;
  const isReadOnly = !isAdmin;

  const showToast = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
      if (propShowToast) {
        propShowToast(msg, type);
      } else {
        console.log(`[Toast ${type}]: ${msg}`);
      }
    },
    [propShowToast]
  );

  const [localIsAddOpen, setLocalIsAddOpen] = useState(false);
  const isAddModalOpen = propIsAddOpen !== undefined ? propIsAddOpen : localIsAddOpen;
  const handleOpenAddModal = onOpenAddModal || (() => setLocalIsAddOpen(true));
  const handleCloseAddModal = () => {
    setIsAddingNewCat(false);
    setIsAddingNewSize(false);
    setNewCatInput('');
    setNewSizeInput('');
    if (onCloseAddModal) {
      onCloseAddModal();
    } else {
      setLocalIsAddOpen(false);
    }
  };

  const [fleetTab, setFleetTab] = useState<'active' | 'all' | 'sub' | 'released'>('active');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedOwner, setSelectedOwner] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 48;

  // Dynamic Dropdown Lists from dropdownService
  const [adminModalKey, setAdminModalKey] = useState<DropdownListKey | null>(null);
  const [statusesList, setStatusesList] = useState<string[]>(() => getDropdownOptions('toolStatuses'));
  const [locationsList, setLocationsList] = useState<string[]>(() => getDropdownOptions('toolLocations'));
  const [ownersList, setOwnersList] = useState<string[]>(() => getDropdownOptions('toolOwnerships'));
  const [suppliersList, setSuppliersList] = useState<string[]>(() => getDropdownOptions('suppliers'));

  useEffect(() => {
    const handleDropdownUpdate = () => {
      setStatusesList(getDropdownOptions('toolStatuses'));
      setLocationsList(getDropdownOptions('toolLocations'));
      setOwnersList(getDropdownOptions('toolOwnerships'));
      setSuppliersList(getDropdownOptions('suppliers'));
    };
    window.addEventListener('dropdown_options_updated', handleDropdownUpdate);
    return () => window.removeEventListener('dropdown_options_updated', handleDropdownUpdate);
  }, []);

  // Dynamic Custom Columns & Excel-like Resizable Grid Columns
  const inventoryCustomCols = useCustomColumns('inventory');
  const inventoryResizer = useResizableColumns('inventory_grid', {
    serial: 120,
    assetNo: 110,
    size: 90,
    toolType: 140,
    description: 250,
    owner: 110,
    location: 110,
    status: 120,
    agreementType: 120,
    subRate: 140,
    supplierPo: 130,
    action: 110,
  });

  const renderToolStatusBadge = (status: ToolItem['status']) => {
    switch (status) {
      case 'Good':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Available / Good
          </span>
        );
      case 'Reserved':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            🟡 Reserved
          </span>
        );
      case 'Repair':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
            Under Repair
          </span>
        );
      case 'Inspection':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
            Inspection
          </span>
        );
      case 'Redress':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-orange-50 text-orange-800 border border-orange-200">
            Redress
          </span>
        );
      case 'Removed':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
            De-inventoried
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [editingTool, setEditingTool] = useState<ToolItem | null>(null);
  const [editSerial, setEditSerial] = useState<string>('');
  const [editAssetNo, setEditAssetNo] = useState<string>('');
  const [editShortDesc, setEditShortDesc] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');
  const [editSize, setEditSize] = useState<string>('');
  const [editOwnershipType, setEditOwnershipType] = useState<'emdad' | 'sub'>('emdad');
  const [editSupplier, setEditSupplier] = useState<string>('');
  const [editStatus, setEditStatus] = useState<ToolItem['status']>('Good');
  const [editLocation, setEditLocation] = useState('Emdad Base');
  const [editAgreementType, setEditAgreementType] = useState<'Daily' | 'BackToBack' | 'MonthlyPool'>('Daily');
  const [editDailyRate, setEditDailyRate] = useState<string>('');
  const [editMonthlyRate, setEditMonthlyRate] = useState<string>('');
  const [editOperatingRate, setEditOperatingRate] = useState<string>('');
  const [editStandbyRate, setEditStandbyRate] = useState<string>('');
  const [editRunCharge, setEditRunCharge] = useState<string>('');
  const [editRedressCharge, setEditRedressCharge] = useState<string>('');
  const [editSupplierPo, setEditSupplierPo] = useState<string>('');
  const [editCurrency, setEditCurrency] = useState<string>('AED');
  const [editStartDate, setEditStartDate] = useState<string>('');
  const [editEndDate, setEditEndDate] = useState<string>('');

  // Form states for Add Tool
  const [newOwnershipType, setNewOwnershipType] = useState<'emdad' | 'sub'>('emdad');
  const [newSerial, setNewSerial] = useState('');
  const [newAssetNo, setNewAssetNo] = useState('');
  const [newType, setNewType] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newLocation, setNewLocation] = useState('Emdad Base');
  const [newStatus, setNewStatus] = useState<ToolItem['status']>('Good');
  // New sub-rental cost fields for Add Tool
  const [newSubAgreementType, setNewSubAgreementType] = useState<'Daily' | 'BackToBack' | 'MonthlyPool'>('Daily');
  const [newSubDailyRate, setNewSubDailyRate] = useState<string>('');
  const [newSubMonthlyRate, setNewSubMonthlyRate] = useState<string>('');
  const [newSubOperatingRate, setNewSubOperatingRate] = useState<string>('');
  const [newSubStandbyRate, setNewSubStandbyRate] = useState<string>('');
  const [newSubRunCharge, setNewSubRunCharge] = useState<string>('');
  const [newSubRedressCharge, setNewSubRedressCharge] = useState<string>('');
  const [newSupplierPo, setNewSupplierPo] = useState<string>('');
  const [newSupplierCurrency, setNewSupplierCurrency] = useState<string>('AED');
  const [newRentalStartDate, setNewRentalStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newRentalEndDate, setNewRentalEndDate] = useState<string>('');

  // Inline add state for new categories and sizes in modal
  const [isAddingNewCat, setIsAddingNewCat] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [isAddingNewSize, setIsAddingNewSize] = useState(false);
  const [newSizeInput, setNewSizeInput] = useState('');

  // Safe helper for tool owner
  const getToolOwner = useCallback((t: ToolItem): string => {
    const own = typeof t?.ownership === 'string' ? t.ownership.trim() : (t?.ownership ? String(t.ownership).trim() : '');
    const sup = typeof t?.supplier === 'string' ? t.supplier.trim() : (t?.supplier ? String(t.supplier).trim() : '');
    return own || sup || (t?.isEmdad ? 'EMDAD' : 'Sub-contractor');
  }, []);

  // Custom categories & sizes stored locally
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      if (Array.isArray(propCategories) && propCategories.length > 0) {
        return propCategories
          .map((item: any) => (typeof item === 'string' ? item : item?.categoryName || item?.name || String(item || '')))
          .filter(Boolean);
      }
      const saved = localStorage.getItem('emdad_custom_categories');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item: any) => (typeof item === 'string' ? item : item?.categoryName || item?.name || String(item || '')))
          .filter(Boolean);
      }
      return [];
    } catch {
      return [];
    }
  });

  const [customSizes, setCustomSizes] = useState<string[]>(() => {
    try {
      if (Array.isArray(propSizes) && propSizes.length > 0) {
        return propSizes
          .map((item: any) => (typeof item === 'string' ? item : item?.sizeString || item?.name || item?.size || String(item || '')))
          .filter(Boolean);
      }
      const saved = localStorage.getItem('emdad_custom_sizes');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item: any) => (typeof item === 'string' ? item : item?.sizeString || item?.name || item?.size || String(item || '')))
          .filter(Boolean);
      }
      return [];
    } catch {
      return [];
    }
  });

  // Sync if propCategories or propSizes changes
  useEffect(() => {
    if (Array.isArray(propCategories) && propCategories.length > 0) {
      setCustomCategories(
        propCategories.map((item: any) => (typeof item === 'string' ? item : item?.categoryName || item?.name || String(item || ''))).filter(Boolean)
      );
    }
  }, [propCategories]);

  useEffect(() => {
    if (Array.isArray(propSizes) && propSizes.length > 0) {
      setCustomSizes(
        propSizes.map((item: any) => (typeof item === 'string' ? item : item?.sizeString || item?.name || item?.size || String(item || ''))).filter(Boolean)
      );
    }
  }, [propSizes]);

  // Compute categories from inventory + custom additions
  const categories = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((t) => {
      const cat = typeof t?.shortDesc === 'string' ? t.shortDesc.trim() : (t?.shortDesc ? String(t.shortDesc).trim() : '');
      if (cat) set.add(cat);
    });
    customCategories.forEach((c) => {
      const cat = typeof c === 'string' ? c.trim() : (c ? String((c as any).categoryName || (c as any).name || c).trim() : '');
      if (cat) set.add(cat);
    });
    return Array.from(set).sort();
  }, [inventory, customCategories]);

  // Compute category dropdown options with tool counts
  const categoryDropdownOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    inventory.forEach((t) => {
      const cat = typeof t?.shortDesc === 'string' ? t.shortDesc.trim() : (t?.shortDesc ? String(t.shortDesc).trim() : '');
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    });
    return categories.map((c) => ({
      value: c,
      label: c,
      count: counts[c] || 0,
    }));
  }, [categories, inventory]);

  // Compute tool sizes from API standards + inventory + custom additions
  const standardSizes = useMemo(() => {
    const list = new Set(TOOL_SIZES);
    inventory.forEach((t) => {
      const sz = typeof t?.size === 'string' ? t.size.trim() : (t?.size ? String(t.size).trim() : '');
      if (sz) list.add(sz);
    });
    customSizes.forEach((s) => {
      const sz = typeof s === 'string' ? s.trim() : (s ? String((s as any).sizeString || (s as any).name || (s as any).size || s).trim() : '');
      if (sz) list.add(sz);
    });
    return Array.from(list);
  }, [inventory, customSizes]);

  const handleSaveNewCategory = () => {
    const val = (newCatInput || '').trim().toUpperCase();
    if (!val) return;
    if (!customCategories.includes(val)) {
      const updated = [...customCategories, val];
      setCustomCategories(updated);
      try {
        localStorage.setItem('emdad_custom_categories', JSON.stringify(updated));
      } catch (e) {}
    }
    setNewType(val);
    setNewCatInput('');
    setIsAddingNewCat(false);
    showToast(`Category "${val}" added and selected.`, 'success');
  };

  const handleSaveNewSize = () => {
    let val = (newSizeInput || '').trim();
    if (!val) return;
    if (!val.includes('"') && !val.toLowerCase().includes('mm')) {
      val = `${val}"`;
    }
    if (!customSizes.includes(val)) {
      const updated = [...customSizes, val];
      setCustomSizes(updated);
      try {
        localStorage.setItem('emdad_custom_sizes', JSON.stringify(updated));
      } catch (e) {}
    }
    setNewSize(val);
    setNewSizeInput('');
    setIsAddingNewSize(false);
    showToast(`Size "${val}" added and selected.`, 'success');
  };

  // Compute distinct owners from inventory
  const owners = useMemo(() => {
    return Array.from(
      new Set(
        inventory
          .map((t) => getToolOwner(t))
          .filter(Boolean)
      )
    ).sort();
  }, [inventory, getToolOwner]);

  // Compute next EMDAD ID
  const nextEmdadId = useMemo(() => {
    const emdNumbers = inventory
      .filter((t) => t.isEmdad && t.id.startsWith('EMD-'))
      .map((t) => parseInt(t.id.replace('EMD-', ''), 10))
      .filter((n) => !isNaN(n));
    const maxNum = emdNumbers.length > 0 ? Math.max(...emdNumbers) : 1000;
    return `EMD-${maxNum + 1}`;
  }, [inventory]);

  // Compute sub-rental statistics for Sub-Contractor Tools KPI banner
  const subRentalStats = useMemo(() => {
    const subTools = inventory.filter((t) => !t.isEmdad);
    const totalSub = subTools.length;
    const activeSub = subTools.filter((t) => t.status !== 'Removed' && t.location !== 'Returned to Supplier');
    const onRigSub = subTools.filter((t) => t.location === 'On Rig' || t.status === 'On Rig');
    
    // Total monthly accrual estimation
    // Daily tools * dailyRate * 30 + MonthlyPool tools * monthlyRate
    let estMonthlyAccrual = 0;
    let dailyActiveBurnRate = 0;

    activeSub.forEach((t) => {
      if (t.subRentalAgreementType === 'MonthlyPool' && t.subRentalMonthlyRate) {
        estMonthlyAccrual += Number(t.subRentalMonthlyRate);
        dailyActiveBurnRate += Number(t.subRentalMonthlyRate) / 30;
      } else if (t.subRentalDailyRate) {
        estMonthlyAccrual += Number(t.subRentalDailyRate) * 30;
        dailyActiveBurnRate += Number(t.subRentalDailyRate);
      }
    });

    const uniqueVendors = Array.from(new Set(subTools.map((t) => t.supplier || t.ownership).filter(Boolean)));

    return {
      totalSub,
      activeCount: activeSub.length,
      onRigCount: onRigSub.length,
      estMonthlyAccrual,
      dailyActiveBurnRate,
      vendorCount: uniqueVendors.length,
    };
  }, [inventory]);

  // Filtered inventory
  const filtered = useMemo(() => {
    return inventory.filter((t) => {
      // Tab filter
      if (fleetTab === 'active' && (t.status === 'Removed' || t.location === 'Returned to Supplier')) {
        if (selectedStatus === 'ALL') return false;
      }
      if (fleetTab === 'released' && t.status !== 'Removed' && t.location !== 'Returned to Supplier') {
        return false;
      }
      if (fleetTab === 'sub' && t.isEmdad) {
        return false;
      }

      if (selectedStatus !== 'ALL' && t.status !== selectedStatus) return false;
      if (selectedCategory !== 'ALL' && t.shortDesc !== selectedCategory) return false;
      if (selectedOwner !== 'ALL') {
        const toolOwner = getToolOwner(t);
        if (toolOwner !== selectedOwner) return false;
      }
      if (search && typeof search === 'string' && search.trim()) {
        const q = search.toLowerCase().trim();
        const fullTxt = `${t.id || ''} ${t.serial || ''} ${t.assetNo || ''} ${t.oemSerial || ''} ${t.size || ''} ${t.shortDesc || ''} ${t.desc || ''} ${t.ownership || ''} ${t.supplier || ''} ${t.location || ''}`.toLowerCase();
        if (!fullTxt.includes(q)) return false;
      }
      return true;
    });
  }, [inventory, fleetTab, selectedStatus, selectedCategory, selectedOwner, search, getToolOwner]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedList = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExportCSV = () => {
    if (inventory.length === 0) return;
    const headers = ['SystemID', 'AssetNo', 'Size', 'ShortDesc', 'Description', 'Ownership', 'Location', 'Status'];
    const rows = inventory.map((t) => [
      `"${t.id}"`,
      `"${t.assetNo || ''}"`,
      `"${t.size}"`,
      `"${(t.shortDesc || '').replace(/"/g, '""')}"`,
      `"${(t.desc || '').replace(/"/g, '""')}"`,
      `"${t.ownership}"`,
      `"${t.location}"`,
      `"${t.status}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EMDAD_Tools_Fleet_${inventory.length}_Assets.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateAssetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isEmd = newOwnershipType === 'emdad';
    const id = isEmd ? nextEmdadId : newSerial.trim();
    const ownership = isEmd ? 'EMDAD' : newSupplier.trim();

    if (!id || !newType.trim() || !newSize.trim()) {
      showToast('Please fill in tool type, size, and ID/supplier.', 'error');
      return;
    }

    const newTool: ToolItem = {
      id,
      serial: id,
      assetNo: isEmd ? newAssetNo.trim() : (newAssetNo.trim() || id),
      size: newSize.trim(),
      shortDesc: newType.trim().toUpperCase(),
      desc: newDesc.trim() || `${newSize.trim()} ${newType.trim().toUpperCase()}`,
      qty: 1,
      location: newLocation,
      status: newStatus,
      ownership,
      isEmdad: isEmd,
      supplier: ownership,
      addedDate: new Date().toISOString().split('T')[0],
      // Sub-rental details if non-EMDAD
      ...(isEmd
        ? {}
        : {
            subRentalAgreementType: newSubAgreementType,
            subRentalDailyRate: newSubDailyRate ? parseFloat(newSubDailyRate) : (newSubOperatingRate ? parseFloat(newSubOperatingRate) : null),
            subRentalMonthlyRate: newSubMonthlyRate ? parseFloat(newSubMonthlyRate) : null,
            subRentalOperatingRate: newSubOperatingRate ? parseFloat(newSubOperatingRate) : null,
            subRentalStandbyRate: newSubStandbyRate ? parseFloat(newSubStandbyRate) : null,
            subRentalRunCharge: newSubRunCharge ? parseFloat(newSubRunCharge) : null,
            subRentalRedressCharge: newSubRedressCharge ? parseFloat(newSubRedressCharge) : null,
            supplierPoNumber: newSupplierPo.trim() || undefined,
            supplierCurrency: newSupplierCurrency || 'AED',
            rentalStartDate: newRentalStartDate || null,
            rentalEndDate: newRentalEndDate || null,
          }),
    };

    const catUpper = newType.trim().toUpperCase();
    if (catUpper && !customCategories.includes(catUpper)) {
      const updatedCats = [...customCategories, catUpper];
      setCustomCategories(updatedCats);
      try {
        localStorage.setItem('emdad_custom_categories', JSON.stringify(updatedCats));
      } catch {}
    }
    const sizeClean = newSize.trim();
    if (sizeClean && !customSizes.includes(sizeClean)) {
      const updatedSizes = [...customSizes, sizeClean];
      setCustomSizes(updatedSizes);
      try {
        localStorage.setItem('emdad_custom_sizes', JSON.stringify(updatedSizes));
      } catch {}
    }

    if (onAddTool) {
      onAddTool(newTool);
    } else if (onSaveInventory) {
      onSaveInventory([newTool, ...inventory]);
    }
    handleCloseAddModal();
    // Reset
    setNewSerial('');
    setNewAssetNo('');
    setNewType('');
    setNewDesc('');
    setNewSize('');
    setNewSupplier('');
    setNewSubDailyRate('');
    setNewSubMonthlyRate('');
    setNewSubOperatingRate('');
    setNewSubStandbyRate('');
    setNewSubRunCharge('');
    setNewSubRedressCharge('');
    setNewSupplierPo('');
    setNewRentalEndDate('');
  };

  const startEditTool = (t: ToolItem) => {
    if (!canEdit) return;
    setEditingToolId(t.id);
    setEditingTool(t);
    setEditSerial(t.serial || '');
    setEditAssetNo(t.assetNo || '');
    setEditShortDesc(t.shortDesc || '');
    setEditDesc(t.desc || '');
    setEditSize(t.size || '');
    setEditOwnershipType(t.isEmdad ? 'emdad' : 'sub');
    setEditSupplier(t.supplier || (t.ownership && t.ownership !== 'EMDAD' ? t.ownership : '') || '');
    setEditStatus(t.status);
    setEditLocation(t.location || 'Emdad Base');
    setEditAgreementType(t.subRentalAgreementType || 'Daily');
    setEditDailyRate(t.subRentalDailyRate ? String(t.subRentalDailyRate) : '');
    setEditMonthlyRate(t.subRentalMonthlyRate ? String(t.subRentalMonthlyRate) : '');
    setEditOperatingRate(t.subRentalOperatingRate ? String(t.subRentalOperatingRate) : '');
    setEditStandbyRate(t.subRentalStandbyRate ? String(t.subRentalStandbyRate) : '');
    setEditRunCharge(t.subRentalRunCharge ? String(t.subRentalRunCharge) : '');
    setEditRedressCharge(t.subRentalRedressCharge ? String(t.subRentalRedressCharge) : '');
    setEditSupplierPo(t.supplierPoNumber || '');
    setEditCurrency(t.supplierCurrency || 'AED');
    setEditStartDate(t.rentalStartDate || '');
    setEditEndDate(t.rentalEndDate || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !editingToolId) return;

    const isSub = editOwnershipType === 'sub';
    const supplierName = editSupplier.trim() || 'Sub-Contractor';
    const cleanAsset = (editAssetNo.trim() || editSerial.trim());

    const updates: Partial<ToolItem> = {
      serial: cleanAsset || editingToolId,
      assetNo: cleanAsset || undefined,
      shortDesc: editShortDesc.trim() || 'DRILLING TOOL',
      desc: editDesc.trim(),
      size: editSize.trim(),
      isEmdad: !isSub,
      ownership: isSub ? supplierName : 'EMDAD',
      supplier: isSub ? supplierName : 'EMDAD',
      status: editStatus,
      location: editLocation.trim(),
      ...(isSub
        ? {
            subRentalAgreementType: editAgreementType,
            subRentalDailyRate: editDailyRate ? parseFloat(editDailyRate) : (editOperatingRate ? parseFloat(editOperatingRate) : null),
            subRentalMonthlyRate: editMonthlyRate ? parseFloat(editMonthlyRate) : null,
            subRentalOperatingRate: editOperatingRate ? parseFloat(editOperatingRate) : null,
            subRentalStandbyRate: editStandbyRate ? parseFloat(editStandbyRate) : null,
            subRentalRunCharge: editRunCharge ? parseFloat(editRunCharge) : null,
            subRentalRedressCharge: editRedressCharge ? parseFloat(editRedressCharge) : null,
            supplierPoNumber: editSupplierPo.trim() || undefined,
            supplierCurrency: editCurrency,
            rentalStartDate: editStartDate || null,
            rentalEndDate: editEndDate || null,
          }
        : {
            subRentalAgreementType: undefined,
            subRentalDailyRate: null,
            subRentalMonthlyRate: null,
            subRentalOperatingRate: null,
            subRentalStandbyRate: null,
            subRentalRunCharge: null,
            subRentalRedressCharge: null,
            supplierPoNumber: undefined,
            supplierCurrency: undefined,
            rentalStartDate: null,
            rentalEndDate: null,
          }),
    };

    if (onUpdateTool) {
      onUpdateTool(editingToolId, updates);
    } else if (onSaveInventory) {
      onSaveInventory(
        inventory.map((t) =>
          t.id === editingToolId ? { ...t, ...updates } : t
        )
      );
    }
    showToast(`Asset "${updates.serial || editingToolId}" updated successfully!`, 'success');
    setEditingToolId(null);
    setEditingTool(null);
  };

  return (
    <div className="space-y-4">
      {isReadOnly && <ReadOnlyBanner role={user?.role} moduleName="Tool Fleet & Inventory Catalog" />}

      {/* Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-medium">Assets &amp; Inventory Management</div>
          <h1 className="text-base font-bold text-[#1a3055]">Assets and Inventory Catalog</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="px-2.5 py-1.5 rounded bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs border border-slate-300 shadow-sm transition cursor-pointer flex items-center gap-1"
              title="Refresh live data from server"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 shadow-sm transition cursor-pointer"
          >
            📤 Export CSV
          </button>
        </div>
      </div>

      {/* Filter and Table Card */}
      <div className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-sm">
        {/* Quick Fleet Filter Tabs */}
        <div className="bg-[#edf3f8] px-3 pt-2 border-b border-[#b8c9db] flex flex-wrap gap-1.5 text-xs">
          <button
            onClick={() => {
              setFleetTab('active');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-t font-bold transition cursor-pointer border-t border-x ${
              fleetTab === 'active'
                ? 'bg-white text-[#1a3055] border-[#b8c9db] -mb-[1px] shadow-xs'
                : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Active Fleet Tools ({inventory.filter((t) => t.status !== 'Removed' && t.location !== 'Returned to Supplier').length})
          </button>
          <button
            onClick={() => {
              setFleetTab('all');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-t font-bold transition cursor-pointer border-t border-x ${
              fleetTab === 'all'
                ? 'bg-white text-[#1a3055] border-[#b8c9db] -mb-[1px] shadow-xs'
                : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            All Inventory Assets ({inventory.length})
          </button>
          <button
            onClick={() => {
              setFleetTab('sub');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-t font-bold transition cursor-pointer border-t border-x ${
              fleetTab === 'sub'
                ? 'bg-white text-[#1a3055] border-[#b8c9db] -mb-[1px] shadow-xs'
                : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Sub-Contractor Tools ({inventory.filter((t) => !t.isEmdad).length})
          </button>
          <button
            onClick={() => {
              setFleetTab('released');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-t font-bold transition cursor-pointer border-t border-x ${
              fleetTab === 'released'
                ? 'bg-white text-slate-900 border-[#b8c9db] -mb-[1px] shadow-xs'
                : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Released to Suppliers ({inventory.filter((t) => t.status === 'Removed' || t.location === 'Returned to Supplier').length})
          </button>
        </div>

        {/* Sub-Contractor Rental Cost & Utilization KPI Banner */}
        {fleetTab === 'sub' && (
          <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50/50 border-b border-amber-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🤝</span>
                <div>
                  <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                    Equipment Sub-Rental Cost &amp; Fleet Overview
                  </h3>
                  <p className="text-[11px] text-amber-800">
                    Third-party equipment sub-rented from suppliers under Daily, Back-to-Back, or Monthly Pool agreements.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-amber-900 bg-amber-100/80 px-2.5 py-1 rounded-full border border-amber-300">
                  {subRentalStats.vendorCount} Active Suppliers
                </span>
                <span className="text-[11px] font-semibold text-amber-900 bg-amber-100/80 px-2.5 py-1 rounded-full border border-amber-300">
                  {subRentalStats.activeCount} In Fleet / Custody
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white rounded-lg p-2.5 border border-amber-200/80 shadow-2xs">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Sub-Rented Fleet Scope</div>
                <div className="text-base font-bold text-[#1a3055] mt-0.5">
                  {subRentalStats.totalSub} <span className="text-xs font-normal text-slate-500">Serials</span>
                </div>
                <div className="text-[10px] text-emerald-700 font-medium mt-0.5 flex items-center gap-1">
                  <span>●</span> {subRentalStats.activeCount} Available / In Service
                </div>
              </div>

              <div className="bg-white rounded-lg p-2.5 border border-amber-200/80 shadow-2xs">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Deployed to Rigs</div>
                <div className="text-base font-bold text-amber-900 mt-0.5">
                  {subRentalStats.onRigCount} <span className="text-xs font-normal text-slate-500">Tools</span>
                </div>
                <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                  Generating Client Revenue Back-to-Back
                </div>
              </div>

              <div className="bg-white rounded-lg p-2.5 border border-amber-200/80 shadow-2xs">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Active Daily Burn Rate</div>
                <div className="text-base font-bold text-rose-700 mt-0.5">
                  AED {Math.round(subRentalStats.dailyActiveBurnRate).toLocaleString()}
                  <span className="text-xs font-normal text-slate-500"> /day</span>
                </div>
                <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                  Supplier Daily Cost Commitment
                </div>
              </div>

              <div className="bg-white rounded-lg p-2.5 border border-amber-200/80 shadow-2xs">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Est. Monthly Cost Accrual</div>
                <div className="text-base font-bold text-rose-800 mt-0.5">
                  AED {Math.round(subRentalStats.estMonthlyAccrual).toLocaleString()}
                  <span className="text-xs font-normal text-slate-500"> /mo</span>
                </div>
                <div className="text-[10px] text-rose-600 font-medium mt-0.5">
                  Feeds Lease Rental - Equipment P&amp;L
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="p-3 bg-[#dbe6f1] border-b border-[#b8c9db] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search serial #, asset name, description, size..."
              className="bg-white border border-[#b8c9db] rounded px-3 py-1 text-xs w-72 outline-none font-medium focus:ring-1 focus:ring-amber-400"
            />
            <SearchableDropdown
              value={selectedCategory}
              onChange={(val) => {
                setSelectedCategory(val);
                setPage(1);
              }}
              options={categoryDropdownOptions}
              allLabel="All Categories"
              totalCount={inventory.length}
              searchPlaceholder="Search 100+ categories..."
              dropdownWidth="w-80"
              title="Filter by Equipment Category"
            />
            <div className="flex items-center gap-1">
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setPage(1);
                }}
                className="bg-white border border-[#b8c9db] rounded px-2.5 py-1 text-xs font-medium outline-none"
              >
                <option value="ALL">All Statuses</option>
                {statusesList.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
              {user?.role === 'Admin' && (
                <button
                  type="button"
                  onClick={() => setAdminModalKey('toolStatuses')}
                  className="p-1 text-slate-400 hover:text-blue-700 rounded hover:bg-slate-100 cursor-pointer"
                  title="Manage Equipment Statuses (Admin)"
                >
                  <SettingsIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={selectedOwner}
              onChange={(e) => {
                setSelectedOwner(e.target.value);
                setPage(1);
              }}
              className="bg-white border border-[#b8c9db] rounded px-2.5 py-1 text-xs font-medium outline-none"
              title="Filter assets by tool owner / supplier"
            >
              <option value="ALL">All Owners ({owners.length})</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o} ({inventory.filter((t) => getToolOwner(t) === o).length})
                </option>
              ))}
            </select>

            {(search || selectedCategory !== 'ALL' || selectedStatus !== 'ALL' || selectedOwner !== 'ALL') && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('ALL');
                  setSelectedStatus('ALL');
                  setSelectedOwner('ALL');
                  setPage(1);
                }}
                className="text-xs text-slate-600 hover:text-slate-900 font-semibold underline px-2 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs font-bold text-slate-700">
              Showing {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length.toLocaleString()} tools
            </div>
          </div>
        </div>

        {/* Full-width Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-[#1a3055] border-b border-slate-200 font-bold select-none whitespace-nowrap">
              <tr>
                <th style={{ width: inventoryResizer.widths.assetNo || 130 }} className="px-3 py-2 relative whitespace-nowrap">
                  <span>Asset No</span>
                  <ResizerHandle onMouseDown={(e) => inventoryResizer.startResize('assetNo', e)} />
                </th>
                <th style={{ width: inventoryResizer.widths.size || 90 }} className="px-3 py-2 relative whitespace-nowrap">
                  <span>Size</span>
                  <ResizerHandle onMouseDown={(e) => inventoryResizer.startResize('size', e)} />
                </th>
                <th style={{ width: inventoryResizer.widths.toolType || 140 }} className="px-3 py-2 relative whitespace-nowrap">
                  <span>Tool Type</span>
                  <ResizerHandle onMouseDown={(e) => inventoryResizer.startResize('toolType', e)} />
                </th>
                <th style={{ width: inventoryResizer.widths.description || 250 }} className="px-3 py-2 relative whitespace-nowrap">
                  <span>Description</span>
                  <ResizerHandle onMouseDown={(e) => inventoryResizer.startResize('description', e)} />
                </th>
                <th style={{ width: inventoryResizer.widths.owner || 110 }} className="px-3 py-2 relative whitespace-nowrap">
                  <span>Owner</span>
                  <ResizerHandle onMouseDown={(e) => inventoryResizer.startResize('owner', e)} />
                </th>
                <th style={{ width: inventoryResizer.widths.location || 110 }} className="px-3 py-2 relative whitespace-nowrap">
                  <span>Location</span>
                  <ResizerHandle onMouseDown={(e) => inventoryResizer.startResize('location', e)} />
                </th>
                <th style={{ width: inventoryResizer.widths.status || 120 }} className="px-3 py-2 relative whitespace-nowrap">
                  <span>Status</span>
                  <ResizerHandle onMouseDown={(e) => inventoryResizer.startResize('status', e)} />
                </th>
                {fleetTab === 'sub' && (
                  <>
                    <th style={{ width: inventoryResizer.widths.agreementType || 120 }} className="px-3 py-2 relative bg-amber-50 text-amber-950 font-bold border-l border-amber-200 whitespace-nowrap">
                      <span>Agreement</span>
                      <ResizerHandle onMouseDown={(e) => inventoryResizer.startResize('agreementType', e)} />
                    </th>
                    <th style={{ width: inventoryResizer.widths.subRate || 140 }} className="px-3 py-2 relative bg-amber-50 text-amber-950 font-bold border-l border-amber-200 whitespace-nowrap">
                      <span>Supplier Cost Rate</span>
                      <ResizerHandle onMouseDown={(e) => inventoryResizer.startResize('subRate', e)} />
                    </th>
                    <th style={{ width: inventoryResizer.widths.supplierPo || 130 }} className="px-3 py-2 relative bg-amber-50 text-amber-950 font-bold border-l border-amber-200 whitespace-nowrap">
                      <span>Supplier PO #</span>
                      <ResizerHandle onMouseDown={(e) => inventoryResizer.startResize('supplierPo', e)} />
                    </th>
                  </>
                )}
                {inventoryCustomCols.map((c) => (
                  <th
                    key={c.key}
                    style={{ width: inventoryResizer.widths[c.key] || c.width || 120 }}
                    className="px-3 py-2 relative bg-indigo-50/50 text-indigo-950 font-bold border-l border-indigo-200 whitespace-nowrap"
                    title={`Custom Column: ${c.label}`}
                  >
                    <span>{c.label}</span>
                    <ResizerHandle onMouseDown={(e) => inventoryResizer.startResize(c.key, e)} />
                  </th>
                ))}
                <th style={{ width: inventoryResizer.widths.action || 110 }} className="px-3 py-2 text-center relative whitespace-nowrap">
                  <span>Action</span>
                  <ResizerHandle onMouseDown={(e) => inventoryResizer.startResize('action', e)} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {pagedList.length === 0 ? (
                <tr>
                  <td colSpan={9 + (fleetTab === 'sub' ? 3 : 0) + inventoryCustomCols.length} className="p-8 text-center text-slate-500 font-medium">
                    No tool assets found matching the selected criteria.
                  </td>
                </tr>
              ) : (
                pagedList.map((t) => {
                  const isRigInLoc = Boolean(
                    t.rig &&
                    t.location &&
                    (t.location.toLowerCase().includes(t.rig.toLowerCase().replace(/^rig\s*:?\s*/i, '')) ||
                     t.rig.toLowerCase().includes(t.location.toLowerCase().replace(/^rig\s*:?\s*/i, '')))
                  );

                  return (
                    <tr key={t.id} className="hover:bg-slate-50 transition">
                      <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">{t.assetNo || '—'}</td>
                      <td className="px-3 py-2 font-mono text-slate-700 font-medium whitespace-nowrap">{t.size || '—'}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">{t.shortDesc}</td>
                      <td className="px-3 py-2 text-slate-600 text-xs min-w-[200px] max-w-sm truncate font-normal" title={t.desc}>
                        {t.desc}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                        {t.ownership}
                      </td>
                      <td className="px-3 py-2 text-slate-700 font-medium whitespace-nowrap">
                        {t.location}
                        {t.rig && !isRigInLoc && (
                          <span className="block text-[10px] text-amber-800 font-semibold font-mono">
                            Rig: {t.rig}
                          </span>
                        )}
                        {t.reservedForJob && (
                          <span className="block text-[10px] text-amber-800 font-bold font-mono mt-0.5">
                            Reserved → {t.reservedForJob}{t.reservedForRig ? ` / ${t.reservedForRig}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {renderToolStatusBadge(t.status)}
                      </td>
                      {fleetTab === 'sub' && (
                        <>
                          <td className="px-3 py-2 border-l border-amber-100 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.subRentalAgreementType === 'BackToBack'
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                : t.subRentalAgreementType === 'MonthlyPool'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              {t.subRentalAgreementType || 'Daily'}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-rose-700 text-xs border-l border-amber-100 whitespace-nowrap">
                            {t.subRentalOperatingRate || t.subRentalDailyRate ? (
                              <div className="space-y-0.5">
                                <div>
                                  {t.supplierCurrency || 'AED'} {(t.subRentalOperatingRate || t.subRentalDailyRate)?.toLocaleString()} /d
                                  {t.subRentalOperatingRate && <span className="text-[10px] text-emerald-800 font-sans font-semibold ml-1">(Ops)</span>}
                                </div>
                                {t.subRentalStandbyRate && (
                                  <div className="text-[10px] text-amber-700 font-sans font-medium">
                                    Stby: {t.supplierCurrency || 'AED'} {t.subRentalStandbyRate.toLocaleString()} /d
                                  </div>
                                )}
                                {(t.subRentalRunCharge || t.subRentalRedressCharge) && (
                                  <div className="text-[9px] text-slate-500 font-sans font-normal flex gap-1.5">
                                    {t.subRentalRunCharge && <span>Run: {t.subRentalRunCharge.toLocaleString()}</span>}
                                    {t.subRentalRedressCharge && <span>Rdr: {t.subRentalRedressCharge.toLocaleString()}</span>}
                                  </div>
                                )}
                              </div>
                            ) : t.subRentalMonthlyRate ? (
                              `${t.supplierCurrency || 'AED'} ${t.subRentalMonthlyRate.toLocaleString()} /mo`
                            ) : (
                              <span className="text-slate-400 font-sans font-normal">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-700 text-xs border-l border-amber-100 whitespace-nowrap">
                            {t.supplierPoNumber || <span className="text-slate-300 font-sans">—</span>}
                          </td>
                        </>
                      )}
                      {inventoryCustomCols.map((c) => {
                        const val = (t as any)[c.key] ?? (t as any).customFields?.[c.key];
                        return (
                          <td key={c.key} className="px-3 py-2 text-slate-700 text-xs font-mono border-l border-slate-100 whitespace-nowrap">
                            {val !== undefined && val !== null && String(val).trim() !== ''
                              ? String(val)
                              : <span className="text-slate-300 font-sans">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {onOpenToolHistory && (
                            <button
                              type="button"
                              onClick={() => onOpenToolHistory(t.serial)}
                              title="View Tool Movement History"
                              className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-300 cursor-pointer transition flex items-center gap-1 shadow-xs"
                            >
                              <span>⏱️</span>
                              <span>History</span>
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => startEditTool(t)}
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold border border-slate-300 cursor-pointer transition"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="px-4 py-3 bg-[#f8fafc] border-t border-[#b8c9db] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-600 font-medium">
            Page <strong className="text-slate-900">{currentPage}</strong> of{' '}
            <strong>{totalPages}</strong> ({filtered.length.toLocaleString()} tools)
          </div>
          <div className="flex items-center space-x-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="px-2.5 py-1 rounded border bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              &larr; Prev
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              className="px-2.5 py-1 rounded border bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Edit Tool Modal */}
      {editingToolId && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingToolId(null);
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-[#1a3055] text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <span>🛠️ Edit Asset:</span>
                  <span className="font-mono text-amber-300">{editingTool?.assetNo || editingTool?.serial || editingToolId}</span>
                </h3>
                <p className="text-[11px] text-slate-300">
                  Admin full edit: update identification, ownership, specifications, location, status, and sub-rental terms
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingToolId(null)}
                className="text-white hover:text-amber-300 font-bold text-2xl leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs overflow-y-auto">
              {/* Ownership Selector */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <label className="block font-bold text-slate-800 text-xs mb-2">
                  Tool Ownership &amp; Supplier Classification *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex items-center gap-2.5 p-2 rounded border cursor-pointer transition ${
                    editOwnershipType === 'emdad'
                      ? 'bg-blue-50/80 border-[#1a3055] text-[#1a3055] font-bold shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="editOwnershipType"
                      value="emdad"
                      checked={editOwnershipType === 'emdad'}
                      onChange={() => setEditOwnershipType('emdad')}
                    />
                    <div>
                      <span className="block text-xs">EMDAD Owned Asset</span>
                      <span className="block text-[10px] text-slate-500 font-normal">Internal company asset</span>
                    </div>
                  </label>

                  <label className={`flex items-center gap-2.5 p-2 rounded border cursor-pointer transition ${
                    editOwnershipType === 'sub'
                      ? 'bg-amber-50/80 border-amber-600 text-amber-950 font-bold shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="editOwnershipType"
                      value="sub"
                      checked={editOwnershipType === 'sub'}
                      onChange={() => setEditOwnershipType('sub')}
                    />
                    <div>
                      <span className="block text-xs">Sub-Contractor / 3rd Party</span>
                      <span className="block text-[10px] text-amber-700 font-normal">External vendor rental tool</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Identification: Asset No */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Asset Number *
                </label>
                <input
                  type="text"
                  required
                  value={editAssetNo || editSerial}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditAssetNo(val);
                    setEditSerial(val);
                  }}
                  placeholder="e.g. 250398, NMDC912-023A, XO-1545"
                  className="w-full border rounded px-2.5 py-1.5 font-mono font-bold text-slate-900 bg-white"
                />
              </div>

              {/* Tool Category & Size */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tool Category / Type *
                  </label>
                  <input
                    type="text"
                    list="edit-modal-categories"
                    required
                    value={editShortDesc}
                    onChange={(e) => setEditShortDesc(e.target.value.toUpperCase())}
                    placeholder="e.g. DRILLING JARS"
                    className="w-full border rounded px-2.5 py-1.5 font-semibold text-slate-800 uppercase bg-white"
                  />
                  <datalist id="edit-modal-categories">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tool Size (OD)
                  </label>
                  <input
                    type="text"
                    list="edit-modal-sizes"
                    value={editSize}
                    onChange={(e) => setEditSize(e.target.value)}
                    placeholder='e.g. 6-1/2", 8", 9-1/2"'
                    className="w-full border rounded px-2.5 py-1.5 font-mono text-slate-800 bg-white"
                  />
                  <datalist id="edit-modal-sizes">
                    {standardSizes.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tool Description
                </label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Full tool description..."
                  className="w-full border rounded px-2.5 py-1.5 text-slate-800 bg-white leading-relaxed"
                />
              </div>

              {/* Status and Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Operational Status</label>
                    {user?.role === 'Admin' && (
                      <button
                        type="button"
                        onClick={() => setAdminModalKey('toolStatuses')}
                        className="text-[10px] text-blue-700 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                      >
                        <SettingsIcon className="w-2.5 h-2.5" />
                        <span>Manage</span>
                      </button>
                    )}
                  </div>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as ToolItem['status'])}
                    className="w-full border rounded px-2.5 py-1.5 font-bold text-slate-800 bg-white text-xs"
                  >
                    {statusesList.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Physical Location</label>
                    {user?.role === 'Admin' && (
                      <button
                        type="button"
                        onClick={() => setAdminModalKey('toolLocations')}
                        className="text-[10px] text-blue-700 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                      >
                        <SettingsIcon className="w-2.5 h-2.5" />
                        <span>Manage</span>
                      </button>
                    )}
                  </div>
                  <select
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 text-slate-800 bg-white text-xs"
                  >
                    <option value="">-- Select Location --</option>
                    {locationsList.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sub-Contractor Vendor & Cost Structure */}
              {editOwnershipType === 'sub' && (
                <div className="p-3.5 bg-amber-50/80 rounded-lg border border-amber-200/90 space-y-3">
                  <div className="font-bold text-amber-950 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span>🏷️</span>
                      <span>Sub-Rental Agreement &amp; Rates (Standby, Ops, Run, Redress)</span>
                    </span>
                    <span className="text-amber-800 font-mono text-[11px]">
                      Vendor: {editSupplier.trim() || 'Pending'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-semibold text-slate-700">
                          Supplier / Vendor Name *
                        </label>
                        {user?.role === 'Admin' && (
                          <button
                            type="button"
                            onClick={() => setAdminModalKey('suppliers')}
                            className="text-[10px] text-blue-700 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                          >
                            <SettingsIcon className="w-2.5 h-2.5" />
                            <span>Manage</span>
                          </button>
                        )}
                      </div>
                      <select
                        required={editOwnershipType === 'sub'}
                        value={editSupplier}
                        onChange={(e) => setEditSupplier(e.target.value)}
                        className="w-full border rounded px-2.5 py-1.5 font-medium text-xs bg-white"
                      >
                        <option value="">-- Select Vendor / Supplier --</option>
                        {suppliersList.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">Agreement Model</label>
                      <select
                        value={editAgreementType}
                        onChange={(e) => setEditAgreementType(e.target.value as any)}
                        className="w-full border rounded px-2 py-1.5 bg-white font-medium text-xs"
                      >
                        <option value="Daily">Daily Rental</option>
                        <option value="BackToBack">Back-to-Back Job</option>
                        <option value="MonthlyPool">Monthly Pool Lease</option>
                      </select>
                    </div>
                  </div>

                  {/* Commercial Sub-Contract Rates Breakdown */}
                  <div className="bg-white p-3 rounded border border-amber-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                        <span>💵</span>
                        <span>Commercial Cost Rates Breakdown</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500 font-semibold">Currency:</span>
                        <select
                          value={editCurrency}
                          onChange={(e) => setEditCurrency(e.target.value)}
                          className="border rounded px-2 py-0.5 bg-white text-[11px] font-bold"
                        >
                          <option value="AED">AED</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold mb-0.5 text-slate-700">
                          Operating Rate (/d)
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="e.g. 4500"
                          value={editOperatingRate}
                          onChange={(e) => {
                            setEditOperatingRate(e.target.value);
                            if (!editDailyRate) setEditDailyRate(e.target.value);
                          }}
                          className="w-full border rounded px-2 py-1 font-mono font-bold text-emerald-700 text-xs bg-emerald-50/20"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold mb-0.5 text-slate-700">
                          Standby Rate (/d)
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="e.g. 3000"
                          value={editStandbyRate}
                          onChange={(e) => setEditStandbyRate(e.target.value)}
                          className="w-full border rounded px-2 py-1 font-mono font-bold text-amber-700 text-xs bg-amber-50/20"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold mb-0.5 text-slate-700">
                          Run Charge (/run)
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="e.g. 1500"
                          value={editRunCharge}
                          onChange={(e) => setEditRunCharge(e.target.value)}
                          className="w-full border rounded px-2 py-1 font-mono font-bold text-blue-700 text-xs bg-blue-50/20"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold mb-0.5 text-slate-700">
                          Redress Charge
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="e.g. 2500"
                          value={editRedressCharge}
                          onChange={(e) => setEditRedressCharge(e.target.value)}
                          className="w-full border rounded px-2 py-1 font-mono font-bold text-purple-700 text-xs bg-purple-50/20"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                      <div>
                        <label className="block text-[11px] font-semibold mb-0.5 text-slate-700">
                          Standard Daily Rate (/d)
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="e.g. 3850"
                          value={editDailyRate}
                          onChange={(e) => setEditDailyRate(e.target.value)}
                          className="w-full border rounded px-2 py-1 font-mono font-bold text-rose-700 text-xs bg-slate-50/50"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold mb-0.5 text-slate-700">
                          Monthly Pool Lease Rate
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="e.g. 45000"
                          value={editMonthlyRate}
                          onChange={(e) => {
                            setEditMonthlyRate(e.target.value);
                            if (e.target.value && !editDailyRate) {
                              setEditDailyRate(String(Math.round(parseFloat(e.target.value) / 30)));
                            }
                          }}
                          className="w-full border rounded px-2 py-1 font-mono font-bold text-rose-700 text-xs bg-slate-50/50"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">Supplier PO Number</label>
                      <input
                        type="text"
                        placeholder="e.g. PO-42002198"
                        value={editSupplierPo}
                        onChange={(e) => setEditSupplierPo(e.target.value)}
                        className="w-full border rounded px-2 py-1.5 font-mono text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">On-Hire Date</label>
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        className="w-full border rounded px-2 py-1.5 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700">Expected Off-Hire</label>
                      <input
                        type="date"
                        value={editEndDate}
                        onChange={(e) => setEditEndDate(e.target.value)}
                        className="w-full border rounded px-2 py-1.5 text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t flex justify-end space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingToolId(null)}
                  className="px-3.5 py-1.5 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-sm cursor-pointer"
                >
                  Update Tool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Dropdown Manager Modal */}
      {adminModalKey && (
        <AdminDropdownModal
          isOpen={true}
          onClose={() => setAdminModalKey(null)}
          dropdownKey={adminModalKey}
          isAdmin={user?.role === 'Admin'}
          onUpdated={() => {
            setStatusesList(getDropdownOptions('toolStatuses'));
            setLocationsList(getDropdownOptions('toolLocations'));
            setOwnersList(getDropdownOptions('toolOwnerships'));
            setSuppliersList(getDropdownOptions('suppliers'));
          }}
        />
      )}
    </div>
  );
};
