import { ToolItem } from '../types';
import { loadDatasetFromCache, saveDatasetToCache } from './dbCache';

const CUSTOM_TOOLS_KEY = 'emdad_custom_tools';

/**
 * Safely loads custom / user-added / modified tools from localStorage.
 */
export function loadCustomTools(): ToolItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_TOOLS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((t) => t && (t.id || t.serial));
    }
    return [];
  } catch (err) {
    console.warn('[CustomTools] Failed to parse custom tools from localStorage:', err);
    return [];
  }
}

/**
 * Safely saves the entire custom tools list to localStorage.
 */
export function saveAllCustomTools(tools: ToolItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_TOOLS_KEY, JSON.stringify(tools));
  } catch (err) {
    console.warn('[CustomTools] Failed to save custom tools to localStorage:', err);
  }
}

/**
 * Adds or updates a single custom tool in persistent storage.
 */
export function saveCustomTool(tool: ToolItem): ToolItem[] {
  const list = loadCustomTools();
  const targetKey = String(tool.id || tool.serial).trim().toUpperCase();
  const targetSerial = String(tool.serial || tool.id).trim().toUpperCase();

  const existingIdx = list.findIndex((t) => {
    const k = String(t.id || t.serial).trim().toUpperCase();
    const s = String(t.serial || t.id).trim().toUpperCase();
    return k === targetKey || s === targetSerial;
  });

  let updatedList: ToolItem[];
  if (existingIdx >= 0) {
    updatedList = [...list];
    updatedList[existingIdx] = { ...list[existingIdx], ...tool };
  } else {
    updatedList = [tool, ...list];
  }

  saveAllCustomTools(updatedList);
  return updatedList;
}

/**
 * Removes a custom tool from persistent storage (e.g. if scrapped or permanently deleted).
 */
export function removeCustomTool(idOrSerial: string): ToolItem[] {
  const list = loadCustomTools();
  const target = String(idOrSerial).trim().toUpperCase();
  const filtered = list.filter((t) => {
    const k = String(t.id || t.serial).trim().toUpperCase();
    const s = String(t.serial || t.id).trim().toUpperCase();
    return k !== target && s !== target;
  });
  saveAllCustomTools(filtered);
  return filtered;
}

/**
 * Merges base inventory (e.g. from Azure SQL, IndexedDB, or INITIAL_INVENTORY)
 * with the persistent user-added/modified tools.
 *
 * Guarantees that:
 * 1. User-added tools are never dropped or overwritten by SQL re-fetches.
 * 2. User-modified tool properties take precedence over older snapshots.
 * 3. Newly created tools appear at the top of the inventory.
 */
export function mergeInventoryWithCustomTools(
  baseInventory: ToolItem[] = [],
  customTools?: ToolItem[]
): ToolItem[] {
  const custom = customTools || loadCustomTools();
  if (!custom || custom.length === 0) {
    return Array.isArray(baseInventory) ? baseInventory : [];
  }

  if (!baseInventory || baseInventory.length === 0) {
    return [...custom];
  }

  const customKeyMap = new Map<string, ToolItem>();
  custom.forEach((t) => {
    if (t.id) customKeyMap.set(String(t.id).trim().toUpperCase(), t);
    if (t.serial) customKeyMap.set(String(t.serial).trim().toUpperCase(), t);
  });

  const seenCustomKeys = new Set<string>();

  // Overlay custom edits on existing base tools
  const mergedBase = baseInventory.map((item) => {
    const kId = String(item.id || '').trim().toUpperCase();
    const kSer = String(item.serial || '').trim().toUpperCase();
    const match = (kId && customKeyMap.get(kId)) || (kSer && customKeyMap.get(kSer));
    if (match) {
      if (kId) seenCustomKeys.add(kId);
      if (kSer) seenCustomKeys.add(kSer);
      return { ...item, ...match };
    }
    return item;
  });

  // Collect any brand new custom tools that did not exist in base inventory
  const brandNewCustom: ToolItem[] = [];
  custom.forEach((t) => {
    const kId = String(t.id || '').trim().toUpperCase();
    const kSer = String(t.serial || '').trim().toUpperCase();
    if ((!kId || !seenCustomKeys.has(kId)) && (!kSer || !seenCustomKeys.has(kSer))) {
      brandNewCustom.push(t);
      if (kId) seenCustomKeys.add(kId);
      if (kSer) seenCustomKeys.add(kSer);
    }
  });

  return [...brandNewCustom, ...mergedBase];
}

/**
 * Helper to update IndexedDB cache with merged inventory
 */
export async function syncCustomToolsToIndexedDB(currentInventory: ToolItem[]): Promise<void> {
  try {
    const cached = await loadDatasetFromCache();
    if (cached) {
      await saveDatasetToCache({
        ...cached,
        inventory: currentInventory,
      });
    }
  } catch (err) {
    console.warn('[CustomTools] syncToIndexedDB notice:', err);
  }
}
