/**
 * Master Dropdown & Lookup Management Service
 * Provides centralized, persistent, and dynamically editable options for all dropdowns across ToolTracker.
 * Eliminates all hardcoded dropdown items and gives Admins full Add, Edit, Delete, and Correction capabilities.
 */

export type DropdownListKey =
  | 'suppliers'
  | 'clients'
  | 'rigs'
  | 'subDivisions'
  | 'toolOwnerships'
  | 'toolLocations'
  | 'toolStatuses'
  | 'consumableCategories'
  | 'consumableUnits'
  | 'depreciationSectors'
  | 'maintenanceTypes'
  | 'maintenanceTechnicians'
  | 'inspectionTypes'
  | 'inspectionDispositions'
  | 'jobServiceCategories'
  | 'holeSections'
  | 'rentalAgreementModels'
  | 'currencies';

export interface DropdownDefinition {
  key: DropdownListKey;
  label: string;
  group: 'Commercial & Financial' | 'Operations & Rig' | 'Inventory & Fleet' | 'Maintenance & QC' | 'Consumables & Store';
  description: string;
  defaultOptions: string[];
}

export const DROPDOWN_DEFINITIONS: Record<DropdownListKey, DropdownDefinition> = {
  suppliers: {
    key: 'suppliers',
    label: 'Sub-Contractors & Tool Suppliers',
    group: 'Commercial & Financial',
    description: 'Third-party vendors supplying rental tools, machining, and overhaul services',
    defaultOptions: [
      'Motormax Drilling Technologies',
      'Epis Oilfield Services',
      'Coretrax',
      'Weatherford',
      'Elite Energy',
      'Saltire Energy',
      'Flow Tools',
      'Hunting Energy Services',
      'Schlumberger / SLB',
      'Baker Hughes',
      'Halliburton',
    ],
  },
  clients: {
    key: 'clients',
    label: 'Clients & Operators',
    group: 'Operations & Rig',
    description: 'Operating oil companies and drilling contractors',
    defaultOptions: [
      'ADNOC Onshore',
      'ADNOC Offshore',
      'ADNOC Drilling',
      'ADNOC Sour Gas',
      'Al Dhafra Petroleum',
      'Al Yasat Petroleum',
      'SNOC (Sharjah National Oil Corp)',
      'Petrofac',
      'Emdad Base Operations',
    ],
  },
  rigs: {
    key: 'rigs',
    label: 'Drilling Rigs',
    group: 'Operations & Rig',
    description: 'Active land and offshore drilling and workover rigs',
    defaultOptions: [
      'ND-19',
      'ND-20',
      'ND-21',
      'ND-22',
      'ND-23',
      'AD-1',
      'AD-2',
      'AD-33',
      'AD-55',
      'AD-137',
      'RIG-8',
      'HAIL-1',
      'GHASH-2',
      'AL-NOUF',
    ],
  },
  subDivisions: {
    key: 'subDivisions',
    label: 'Business Sub-Divisions (P&L Sectors)',
    group: 'Commercial & Financial',
    description: 'Main operational sectors used for revenue and cost allocation',
    defaultOptions: [
      'FISHING',
      'WHIPSTOCK',
      'RENTALS',
    ],
  },
  toolOwnerships: {
    key: 'toolOwnerships',
    label: 'Equipment Ownership Entities',
    group: 'Inventory & Fleet',
    description: 'Fleet ownership classifications (EMDAD owned vs. sub-rented)',
    defaultOptions: [
      'EMDAD',
      'MOTORMAX',
      'EPIS',
      'ELITE',
      'SALTIRE',
      'FLOW TOOLS',
      'WEATHERFORD',
      'CORETRAX',
      'HUNTING',
    ],
  },
  toolLocations: {
    key: 'toolLocations',
    label: 'Storage Locations & Bays',
    group: 'Inventory & Fleet',
    description: 'Physical yards, inspection bays, workshops, and rigs',
    defaultOptions: [
      'Emdad Base',
      'On Rig',
      'Inspection Bay',
      'Workshop',
      'Yard Dispatch',
      'Returned to Supplier',
      'Supplier Yard',
    ],
  },
  toolStatuses: {
    key: 'toolStatuses',
    label: 'Equipment Operational Statuses',
    group: 'Inventory & Fleet',
    description: 'Asset operational conditions across inventory and jobs',
    defaultOptions: [
      'Good',
      'Repair',
      'Inspection',
      'Redress',
      'On Rig',
      'Removed',
      'Lost in Hole',
      'Scrapped',
    ],
  },
  depreciationSectors: {
    key: 'depreciationSectors',
    label: 'Asset Depreciation Sectors',
    group: 'Commercial & Financial',
    description: 'Asset classification sectors for monthly auto-depreciation calculation',
    defaultOptions: [
      'P&M',
      'Vehicles',
      'Comp & Printers',
      'IP Rights',
      'Building & Yard',
      'Office Furniture',
    ],
  },
  consumableCategories: {
    key: 'consumableCategories',
    label: 'Consumables Stock Categories',
    group: 'Consumables & Store',
    description: 'Product categories for warehouse consumables and store items',
    defaultOptions: [
      'Redress Kit',
      'Paint & Coating',
      'Thread Compound & Lubricant',
      'O-Rings & Seals',
      'Hardware & Fasteners',
      'HSE & Safety',
      'Tools & Spares',
      'Welding & Machining',
    ],
  },
  consumableUnits: {
    key: 'consumableUnits',
    label: 'Consumables Units of Measure',
    group: 'Consumables & Store',
    description: 'Stock keeping units (UOM)',
    defaultOptions: [
      'Each',
      'Kit',
      'Can',
      'Drum',
      'Meter',
      'Roll',
      'Set',
      'Box',
      'Pair',
      'Kg',
      'Liter',
    ],
  },
  maintenanceTypes: {
    key: 'maintenanceTypes',
    label: 'Maintenance Service Channels',
    group: 'Maintenance & QC',
    description: 'Service channels for work orders',
    defaultOptions: [
      'InHouse',
      'Vendor',
      'ThirdParty',
    ],
  },
  maintenanceTechnicians: {
    key: 'maintenanceTechnicians',
    label: 'Workshop Technicians & Personnel',
    group: 'Maintenance & QC',
    description: 'Technicians and supervisors assigned to workshop work orders',
    defaultOptions: [
      'Nihas',
      'Workshop Supervisor',
      'Lead Machinist',
      'Senior Redress Tech',
      'QC Inspector',
    ],
  },
  inspectionTypes: {
    key: 'inspectionTypes',
    label: 'QC Inspection Methods',
    group: 'Maintenance & QC',
    description: 'Non-destructive testing and inspection methods',
    defaultOptions: [
      'Visual',
      'Dimensional',
      'MPI (Magnetic Particle)',
      'Liquid Penetrant (DPI)',
      'Ultrasonic Testing (UT)',
      'Eddy Current',
      'Third-Party Certification',
    ],
  },
  inspectionDispositions: {
    key: 'inspectionDispositions',
    label: 'QC Inspection Dispositions',
    group: 'Maintenance & QC',
    description: 'Disposition actions following quality inspection',
    defaultOptions: [
      'Return to Base',
      'Send for Repair',
      'Send for Redress Overhaul',
      'Scrap / Decommission',
      'Hold for Engineering Review',
    ],
  },
  jobServiceCategories: {
    key: 'jobServiceCategories',
    label: 'Job Service Types',
    group: 'Operations & Rig',
    description: 'Service categories executed on drilling & workover jobs',
    defaultOptions: [
      'Downhole Rental',
      'Fishing Service',
      'Whipstock Operations',
      'Workover / Milling',
      'Tubing Conveyed Perforating (TCP)',
      'Thru-Tubing Fishing',
      'Wellbore Cleanout',
    ],
  },
  holeSections: {
    key: 'holeSections',
    label: 'Standard Hole Sections',
    group: 'Operations & Rig',
    description: 'Wellbore hole section diameters',
    defaultOptions: [
      '26"',
      '17-1/2"',
      '16"',
      '12-1/4"',
      '8-1/2"',
      '6"',
      '4-1/2"',
      '3-1/2"',
    ],
  },
  rentalAgreementModels: {
    key: 'rentalAgreementModels',
    label: 'Sub-Rental Agreement Models',
    group: 'Commercial & Financial',
    description: 'Commercial contract models for 3rd-party tool rentals',
    defaultOptions: [
      'Daily',
      'Monthly',
      'BackToBack',
      'MonthlyPool',
      'Lumpsum',
    ],
  },
  currencies: {
    key: 'currencies',
    label: 'Commercial Currencies',
    group: 'Commercial & Financial',
    description: 'Currencies for supplier and customer invoices',
    defaultOptions: [
      'AED',
      'USD',
      'EUR',
      'GBP',
    ],
  },
};

const STORAGE_PREFIX = 'emdad_dropdown_';

/**
 * Get all current options for a given dropdown list.
 * Merges localStorage custom options with default fallbacks and ensures no blanks.
 */
export function getDropdownOptions(key: DropdownListKey): string[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((item) => typeof item === 'string' && item.trim().length > 0);
      }
    }
  } catch (err) {
    console.warn(`[dropdownService] Error reading options for ${key}:`, err);
  }

  // Fallback to defaults
  const def = DROPDOWN_DEFINITIONS[key];
  return def ? [...def.defaultOptions] : [];
}

/**
 * Save updated options for a dropdown list and notify all listeners.
 */
export function saveDropdownOptions(key: DropdownListKey, options: string[]): string[] {
  // Deduplicate and remove empty
  const clean = Array.from(new Set(options.map((o) => o.trim()).filter((o) => o.length > 0)));
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(clean));
    window.dispatchEvent(
      new CustomEvent('dropdown_options_updated', {
        detail: { key, options: clean },
      })
    );
  } catch (err) {
    console.error(`[dropdownService] Error saving options for ${key}:`, err);
  }
  return clean;
}

/**
 * Add a new option to a dropdown list.
 */
export function addDropdownOption(key: DropdownListKey, newOption: string): { success: boolean; message: string; options: string[] } {
  const trimmed = newOption.trim();
  if (!trimmed) {
    return { success: false, message: 'Option name cannot be empty.', options: getDropdownOptions(key) };
  }

  const current = getDropdownOptions(key);
  const exists = current.some((o) => o.toLowerCase() === trimmed.toLowerCase());
  if (exists) {
    return { success: false, message: `Option "${trimmed}" already exists in ${DROPDOWN_DEFINITIONS[key]?.label || key}.`, options: current };
  }

  const updated = [...current, trimmed];
  saveDropdownOptions(key, updated);
  return { success: true, message: `Added "${trimmed}" successfully.`, options: updated };
}

/**
 * Edit / Rename an existing option in a dropdown list.
 */
export function updateDropdownOption(
  key: DropdownListKey,
  oldOption: string,
  newOption: string
): { success: boolean; message: string; options: string[] } {
  const trimmedOld = oldOption.trim();
  const trimmedNew = newOption.trim();

  if (!trimmedNew) {
    return { success: false, message: 'New option name cannot be empty.', options: getDropdownOptions(key) };
  }

  const current = getDropdownOptions(key);
  const existsOther = current.some((o) => o.toLowerCase() === trimmedNew.toLowerCase() && o.toLowerCase() !== trimmedOld.toLowerCase());
  if (existsOther) {
    return { success: false, message: `Option "${trimmedNew}" already exists.`, options: current };
  }

  const updated = current.map((o) => (o === trimmedOld ? trimmedNew : o));
  saveDropdownOptions(key, updated);
  return { success: true, message: `Renamed "${trimmedOld}" to "${trimmedNew}".`, options: updated };
}

/**
 * Delete an option from a dropdown list.
 */
export function deleteDropdownOption(key: DropdownListKey, optionToDelete: string): { success: boolean; message: string; options: string[] } {
  const trimmed = optionToDelete.trim();
  const current = getDropdownOptions(key);
  if (current.length <= 1) {
    return { success: false, message: 'Cannot delete the last remaining option in this list.', options: current };
  }

  const updated = current.filter((o) => o !== trimmed);
  saveDropdownOptions(key, updated);
  return { success: true, message: `Deleted "${trimmed}".`, options: updated };
}

/**
 * Reset a dropdown list to its system factory defaults.
 */
export function resetDropdownList(key: DropdownListKey): string[] {
  const def = DROPDOWN_DEFINITIONS[key];
  if (!def) return [];
  return saveDropdownOptions(key, [...def.defaultOptions]);
}

/**
 * Get all available dropdown list keys with their definitions.
 */
export function getAllDropdownDefinitions(): DropdownDefinition[] {
  return Object.values(DROPDOWN_DEFINITIONS);
}
