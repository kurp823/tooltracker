import { ContractRecord, ContractRateItem } from '../types';
import { INITIAL_CONTRACTS } from '../data/initialData';
import { MASTER_CONTRACT_RATES } from '../data/masterContractRates';

const CUSTOM_CONTRACTS_KEY = 'emdad_custom_contracts';
const CUSTOM_CONTRACT_RATES_KEY = 'emdad_custom_contract_rates';

/**
 * Normalizes a contract identifier for consistent map lookup
 */
export function normalizeContractKey(val: any): string {
  if (!val) return '';
  return String(val)
    .trim()
    .toUpperCase()
    .replace(/^SAP\s+/i, '')
    .replace(/^PO[-_]/i, '');
}

/**
 * Safely loads user-added or modified contracts from persistent storage
 */
export function loadCustomContracts(): ContractRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_CONTRACTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((c) => c && (c.id || c.contractRef || c.contractNo));
    }
  } catch (err) {
    console.warn('[CustomContracts] Failed to parse custom contracts from localStorage:', err);
  }
  return [];
}

/**
 * Safely saves the custom contracts list to persistent storage
 */
export function saveAllCustomContracts(contracts: ContractRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_CONTRACTS_KEY, JSON.stringify(contracts));
  } catch (err) {
    console.warn('[CustomContracts] Failed to save custom contracts to localStorage:', err);
  }
}

/**
 * Loads all custom / user-added contract rate schedules from persistent storage
 */
export function loadCustomContractRatesMap(): Record<string, ContractRateItem[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CUSTOM_CONTRACT_RATES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    console.warn('[CustomContracts] Failed to parse custom contract rates from localStorage:', err);
  }
  return {};
}

/**
 * Saves itemized rate schedules for a specific contract
 */
export function saveCustomContractRates(contractKey: string, rates: ContractRateItem[]): void {
  if (typeof window === 'undefined' || !contractKey) return;
  try {
    const map = loadCustomContractRatesMap();
    const norm = normalizeContractKey(contractKey);
    map[norm] = rates;
    // Also save raw key if different
    const rawKey = String(contractKey).trim().toUpperCase();
    if (rawKey !== norm) map[rawKey] = rates;
    localStorage.setItem(CUSTOM_CONTRACT_RATES_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('[CustomContracts] Failed to save custom contract rates:', err);
  }
}

/**
 * Adds or updates a single contract and its rates in persistent storage
 */
export function saveCustomContract(contract: ContractRecord): ContractRecord[] {
  const list = loadCustomContracts();
  const kId = normalizeContractKey(contract.id);
  const kRef = normalizeContractKey(contract.contractRef);
  const kNo = normalizeContractKey(contract.contractNo);

  const existingIdx = list.findIndex((c) => {
    return (
      (kId && normalizeContractKey(c.id) === kId) ||
      (kRef && normalizeContractKey(c.contractRef) === kRef) ||
      (kNo && normalizeContractKey(c.contractNo) === kNo)
    );
  });

  let updatedList: ContractRecord[];
  if (existingIdx >= 0) {
    updatedList = [...list];
    updatedList[existingIdx] = { ...list[existingIdx], ...contract };
  } else {
    updatedList = [contract, ...list];
  }

  saveAllCustomContracts(updatedList);

  // If contract carries rates, persist them in the rates map under all its aliases
  if (Array.isArray(contract.rates) && contract.rates.length > 0) {
    if (contract.id) saveCustomContractRates(contract.id, contract.rates);
    if (contract.contractRef) saveCustomContractRates(contract.contractRef, contract.rates);
    if (contract.contractNo) saveCustomContractRates(contract.contractNo, contract.rates);
  }

  return updatedList;
}

/**
 * Merges base contracts (e.g. from INITIAL_CONTRACTS or Azure SQL) with user-customized contracts and rates.
 * Guarantees that:
 * 1. User-added rates are NEVER lost or overwritten.
 * 2. User-edited contract parameters take precedence.
 * 3. Any new contracts added by the user persist across refreshes.
 */
export function mergeContractsWithCustom(baseContracts: ContractRecord[] = []): ContractRecord[] {
  const customContracts = loadCustomContracts();
  const ratesMap = loadCustomContractRatesMap();

  const customMap = new Map<string, ContractRecord>();
  customContracts.forEach((c) => {
    if (c.id) customMap.set(normalizeContractKey(c.id), c);
    if (c.contractRef) customMap.set(normalizeContractKey(c.contractRef), c);
    if (c.contractNo) customMap.set(normalizeContractKey(c.contractNo), c);
  });

  const seenCustomKeys = new Set<string>();

  // Helper to resolve rates for a contract
  function resolveRatesForContract(c: ContractRecord): ContractRateItem[] {
    const kId = normalizeContractKey(c.id);
    const kRef = normalizeContractKey(c.contractRef);
    const kNo = normalizeContractKey(c.contractNo);

    // 1. Check user custom rates map
    const customRates = ratesMap[kRef] || ratesMap[kNo] || ratesMap[kId];
    if (customRates && customRates.length > 0) {
      return customRates;
    }

    // 2. Check if contract object itself already has non-empty rates
    if (Array.isArray(c.rates) && c.rates.length > 0) {
      return c.rates;
    }

    // 3. Fallback to MASTER_CONTRACT_RATES master data
    const masterRates =
      MASTER_CONTRACT_RATES[c.contractRef || '']?.rates ||
      MASTER_CONTRACT_RATES[c.contractNo || '']?.rates ||
      MASTER_CONTRACT_RATES[c.id || '']?.rates;
    if (masterRates && masterRates.length > 0) {
      return masterRates;
    }

    // 4. Fallback to INITIAL_CONTRACTS
    const initial = INITIAL_CONTRACTS.find(
      (i) =>
        normalizeContractKey(i.id) === kId ||
        normalizeContractKey(i.contractRef) === kRef ||
        normalizeContractKey(i.contractNo) === kNo
    );
    return initial?.rates || [];
  }

  // Overlay custom contracts on base contracts
  const mergedBase = baseContracts.map((c) => {
    const kId = normalizeContractKey(c.id);
    const kRef = normalizeContractKey(c.contractRef);
    const kNo = normalizeContractKey(c.contractNo);

    const match = (kId && customMap.get(kId)) || (kRef && customMap.get(kRef)) || (kNo && customMap.get(kNo));
    if (match) {
      if (kId) seenCustomKeys.add(kId);
      if (kRef) seenCustomKeys.add(kRef);
      if (kNo) seenCustomKeys.add(kNo);
      const merged = { ...c, ...match };
      merged.rates = resolveRatesForContract(merged);
      return merged;
    }

    return {
      ...c,
      rates: resolveRatesForContract(c),
    };
  });

  // Append any brand new user-added contracts
  const brandNew: ContractRecord[] = [];
  customContracts.forEach((c) => {
    const kId = normalizeContractKey(c.id);
    const kRef = normalizeContractKey(c.contractRef);
    const kNo = normalizeContractKey(c.contractNo);

    const alreadyIncluded =
      (kId && seenCustomKeys.has(kId)) ||
      (kRef && seenCustomKeys.has(kRef)) ||
      (kNo && seenCustomKeys.has(kNo));

    if (!alreadyIncluded) {
      c.rates = resolveRatesForContract(c);
      brandNew.push(c);
      if (kId) seenCustomKeys.add(kId);
      if (kRef) seenCustomKeys.add(kRef);
      if (kNo) seenCustomKeys.add(kNo);
    }
  });

  return [...brandNew, ...mergedBase];
}
