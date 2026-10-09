import { ContractRecord, ContractRateItem } from '../types';
import { MASTER_CONTRACT_RATES } from '../data/masterContractRates';

export interface ToolHoleSectionOption {
  key: string;
  contractRef: string;
  category: string;
  shortDesc: string;
  size: string;
  holeSection: string;
  opsRate: number;
  standbyRate: number;
  runCharges?: number | null;
  monthlyCharges?: number | null;
  redress?: number | null;
  currency: string;
  label: string;
}

/**
 * Category synonym mapping between inventory descriptions and contract ERP categories
 */
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  'DRILLING JAR': ['DRILLING JAR', 'HYD DRILLING JAR', 'HYD-MECH DRILLING JAR', 'HYDRO-MECHANICAL DRILLING JAR', 'HYDRAULIC DRILLING JAR', 'JAR'],
  'SHOCK SUB': ['SHOCK SUB', 'SHOCK TOOL', 'SHOCK ABSORBER', 'DAMPENER'],
  'AGITATOR': ['AGITATOR', 'DRILLING AGITATOR', 'FLOW TOOLS AGITATOR'],
  'STRING STAB': ['STRING STAB', 'STRING STABILIZER', 'STABILIZER', 'BLADE STABILIZER', 'INTEGRAL BLADE STABILIZER', 'NEAR BIT STAB', 'NEAR BIT STABILIZER'],
  'STRING STAB - NM': ['STRING STAB - NM', 'STRING STAB - NON MAG', 'NON MAG STABILIZER', 'NON-MAGNETIC STABILIZER'],
  'NMDC - SLICK': ['NMDC - SLICK', 'NMDC', 'NON-MAGNETIC DRILL COLLAR', 'NON MAG DRILL COLLAR', 'MONEL COLLAR'],
  'NMDC - SPIRAL': ['NMDC - SPIRAL', 'NMDC - SPIRAL', 'NON-MAG SPIRAL COLLAR'],
  'NMDC - PONY': ['NMDC - PONY', 'NMDC PONY COLLAR', 'NON-MAG PONY'],
  'NMDC - SHORT': ['NMDC - SHORT', 'NMDC SHORT COLLAR', 'NON-MAG SHORT'],
  'BIT SUB': ['BIT SUB', 'FLOAT BIT SUB', 'BORED FOR FLOAT'],
  'BULL NOSE': ['BULL NOSE', 'BULLNOSE SUB'],
  'CIRCULATING SUB': ['CIRCULATING SUB', 'CIRC SUB', 'PBL SUB', 'CIRCULATION SUB'],
  'CROSSOVER SUB': ['CROSSOVER SUB', 'CROSSOVER', 'XO SUB', 'X-OVER SUB'],
  'DOWNHOLE MAGNET': ['DOWNHOLE MAGNET', 'STRING MAGNET', 'D. MAGNET', 'FISHING MAGNET', 'CASING MAGNET'],
  'DITCH MAGNET': ['DITCH MAGNET', 'SURFACE MAGNET'],
  'F. JAR': ['F. JAR', 'FISHING JAR', 'HYDRAULIC FISHING JAR', 'BUMPER JAR'],
  'SURFACE JAR': ['SURFACE JAR', 'SURFACE FISHING JAR'],
  'ACCELERATOR': ['ACCELERATOR', 'FISHING ACCELERATOR', 'JAR ACCELERATOR', 'INTENSIFIER'],
  'OVERSHOT': ['OVERSHOT', 'SERIES 150 OVERSHOT', 'FULL STRENGTH OVERSHOT', 'SLIM HOLE OVERSHOT'],
  'RELEASING SPEAR': ['RELEASING SPEAR', 'ITCO SPEAR', 'SPEAR'],
  'JUNK BASKET': ['JUNK BASKET', 'REVERSE CIRCULATING JUNK BASKET', 'RCJB'],
  'SECTION MILL': ['SECTION MILL', 'DUAL SECTION MILL', 'CASING MILL'],
  'PILOT MILL': ['PILOT MILL', 'P-MILL'],
  'JUNK MILL': ['JUNK MILL', 'FLAT BOTTOM MILL', 'CONCAVE MILL'],
  'STRING MILL': ['STRING MILL', 'WATERMELON MILL', 'TAPER MILL'],
  'FAST REAMER': ['FAST REAMER', 'REAMER', 'BI-DIRECTIONAL REAMER', 'REAMER STABILIZER', 'GUNDRILL REAMER'],
  'HOLE OPENER': ['HOLE OPENER'],
  'HWDP': ['HWDP', 'H.W.DRILL PIPE', 'HEAVY WEIGHT DRILL PIPE'],
  'DRILL COLLAR': ['DRILL COLLAR', 'DC', 'SPIRAL DRILL COLLAR'],
  'UBHO SUB': ['UBHO SUB', 'UNIVERSAL BOTTOM HOLE ORIENTATION SUB'],
};

/**
 * Normalizes text for lenient fuzzy category matching
 */
function normalizeString(s?: string): string {
  return (s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses numeric inch dimensions from strings like '12-1/4"', '8-1/2"', '6"'
 */
export function parseHoleDimension(dimStr?: string): number | null {
  if (!dimStr) return null;
  const clean = dimStr.replace(/["\s]/g, '');
  const fracMatch = clean.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (fracMatch) {
    const whole = parseFloat(fracMatch[1]);
    const num = parseFloat(fracMatch[2]);
    const den = parseFloat(fracMatch[3]);
    return whole + (num / den);
  }
  const singleFracMatch = clean.match(/^(\d+)\/(\d+)$/);
  if (singleFracMatch) {
    return parseFloat(singleFracMatch[1]) / parseFloat(singleFracMatch[2]);
  }
  const floatMatch = clean.match(/^(\d+(\.\d+)?)/);
  if (floatMatch) {
    return parseFloat(floatMatch[1]);
  }
  return null;
}

/**
 * Checks if a specific hole size (e.g. 12.25) falls into a contract hole section range string
 */
export function isHoleSectionMatch(contractHoleSection: string, targetSection: string): boolean {
  if (!contractHoleSection || !targetSection) return false;
  const cUpper = contractHoleSection.toUpperCase();
  const tUpper = targetSection.toUpperCase();

  // Exact string match
  if (cUpper === tUpper || cUpper.replace(/["\s]/g, '') === tUpper.replace(/["\s]/g, '')) {
    return true;
  }

  const targetDim = parseHoleDimension(targetSection);
  if (targetDim === null) return false;

  // Range patterns in ADNOC Drilling (e.g. 'FOR 12" LESS THAN 16" HOLE', 'FOR LESS THAN 6" HOLE')
  if (cUpper.includes('LESS THAN 6')) {
    return targetDim < 6.0;
  }
  if (cUpper.includes('6') && cUpper.includes('LESS THAN 8')) {
    return targetDim >= 6.0 && targetDim < 8.0;
  }
  if (cUpper.includes('8') && cUpper.includes('LESS THAN 12')) {
    return targetDim >= 8.0 && targetDim < 12.0;
  }
  if (cUpper.includes('12') && cUpper.includes('LESS THAN 16')) {
    return targetDim >= 12.0 && targetDim < 16.0;
  }
  if (cUpper.includes('16') && (cUpper.includes('20') || cUpper.includes('17-1/2'))) {
    return targetDim >= 16.0 && targetDim <= 20.0;
  }
  if (cUpper.includes('20') && cUpper.includes('ABOVE')) {
    return targetDim >= 20.0;
  }

  // Exact fraction or range within contract hole section
  const contractDim = parseHoleDimension(contractHoleSection);
  if (contractDim !== null) {
    return Math.abs(contractDim - targetDim) < 0.1;
  }

  return false;
}

/**
 * Checks if a contract is specifically an ADNOC Drilling Rental Contract (4700024096 / 4700018368)
 */
export function isAdnocDrillingRentalContract(
  contract?: ContractRecord | null | string,
  client?: string | null
): boolean {
  if (!contract && !client) return false;
  const cNo = typeof contract === 'string' ? contract : (contract?.contractNo || contract?.contractRef || contract?.id || '');
  const cStr = String(cNo).trim().toLowerCase();
  const clStr = String(client || (typeof contract === 'object' ? contract?.client : '') || '').trim().toLowerCase();

  if (cStr.includes('4700024096') || cStr.includes('4700018368')) return true;
  if (clStr.includes('drilling') && !cStr.includes('4700024608') && !cStr.includes('uz') && !cStr.includes('udr')) {
    return true;
  }
  return false;
}

/**
 * Retrieves all available Contract Rate / Hole Section options for a specific tool under a contract
 */
export function getContractRateOptionsForTool(
  tool: {
    serial?: string;
    assetNo?: string;
    desc?: string;
    description?: string;
    shortDesc?: string;
    size?: string;
    category?: string;
  },
  contract?: ContractRecord | null
): ToolHoleSectionOption[] {
  const toolDesc = normalizeString(tool.desc || tool.description || tool.shortDesc || tool.category || '');
  const toolSize = (tool.size || '').replace(/["\s]/g, '');
  const toolDim = parseHoleDimension(tool.size);
  const isAdnocDrilling = isAdnocDrillingRentalContract(contract);

  // Retrieve rate lines from contract or fallback master rates
  let rawRates: ContractRateItem[] = [];
  if (contract?.rates && contract.rates.length > 0) {
    rawRates = contract.rates;
  } else if (contract?.contractNo && MASTER_CONTRACT_RATES[contract.contractNo]) {
    rawRates = MASTER_CONTRACT_RATES[contract.contractNo].rates;
  } else if (isAdnocDrilling) {
    rawRates = MASTER_CONTRACT_RATES['4700024096']?.rates || [];
  } else {
    rawRates = MASTER_CONTRACT_RATES['444558']?.rates || MASTER_CONTRACT_RATES['4700023861']?.rates || [];
  }

  // Filter out any invalid headers
  const ratesList = rawRates.filter(
    (r) => r.no !== 'Num' && r.contractRef !== 'Ref' && r.category !== 'From ERP' && r.currency !== 'Cur' && r.holeSection !== 'Hole Section'
  );

  // Find candidate matches
  const matchedRates: ContractRateItem[] = [];
  const genericRates: ContractRateItem[] = [];

  for (const r of ratesList) {
    const rCat = normalizeString(r.category || '');
    const rShort = normalizeString(r.shortDesc || '');
    const rDim = parseHoleDimension(r.size);

    let catMatched = false;
    if (rCat && (toolDesc.includes(rCat) || rCat.includes(toolDesc))) catMatched = true;
    if (rShort && (toolDesc.includes(rShort) || rShort.includes(toolDesc))) catMatched = true;

    // Check synonyms
    if (!catMatched) {
      for (const [, synList] of Object.entries(CATEGORY_SYNONYMS)) {
        const matchesSyn = synList.some((syn) => toolDesc.includes(normalizeString(syn)));
        if (matchesSyn) {
          if (synList.some((syn) => rCat.includes(normalizeString(syn)) || rShort.includes(normalizeString(syn)))) {
            catMatched = true;
            break;
          }
        }
      }
    }

    if (catMatched) {
      // Check size compatibility
      let sizeCompatible = true;
      if (toolDim !== null && rDim !== null) {
        if (Math.abs(toolDim - rDim) > 0.3) {
          const rSizeUpper = (r.size || '').toUpperCase();
          if (!rSizeUpper.includes('TO') && !rSizeUpper.includes('-') && !rSizeUpper.includes('LESS')) {
            sizeCompatible = false;
          }
        }
      }
      if (sizeCompatible) {
        matchedRates.push(r);
      } else {
        genericRates.push(r);
      }
    }
  }

  const finalPool = matchedRates.length > 0 ? matchedRates : genericRates;

  if (finalPool.length === 0) {
    const cur = contract?.currency || (isAdnocDrilling ? 'AED' : 'USD');
    const fallbackSection = tool.size || 'Standard';
    return [
      {
        key: `DEFAULT_${tool.serial || 'TOOL'}`,
        contractRef: '—',
        category: tool.shortDesc || '',
        shortDesc: tool.shortDesc || '',
        size: tool.size || '',
        holeSection: fallbackSection,
        opsRate: 0,
        standbyRate: 0,
        currency: cur,
        label: fallbackSection,
      },
    ];
  }

  const options: ToolHoleSectionOption[] = finalPool.map((r, idx) => {
    const cur = r.currency || contract?.currency || (isAdnocDrilling ? 'AED' : 'USD');
    const sectionStr = r.holeSection && r.holeSection !== 'Hole Section' ? `${r.holeSection}` : (r.size ? `${r.size}` : 'Standard');

    return {
      key: `${r.contractRef || 'RATE'}_${r.no || idx}_${r.holeSection || r.size || idx}`,
      contractRef: r.contractRef && r.contractRef !== 'Ref' ? r.contractRef : '—',
      category: r.category || tool.shortDesc || '',
      shortDesc: r.shortDesc || tool.shortDesc || '',
      size: r.size || tool.size || '',
      holeSection: sectionStr,
      opsRate: r.opsRate || 0,
      standbyRate: r.standbyRate || 0,
      runCharges: r.runCharges,
      monthlyCharges: r.monthlyCharges,
      redress: r.redress,
      currency: cur,
      label: sectionStr,
    };
  });

  return options;
}

/**
 * Selects the best initial matching option given a job hole section (e.g. 12-1/4", 17-1/2")
 */
export function findBestMatchingOption(
  options: ToolHoleSectionOption[],
  jobHoleSection?: string
): ToolHoleSectionOption | null {
  if (!options || options.length === 0) return null;
  if (!jobHoleSection) return options[0];

  const matched = options.find((opt) => isHoleSectionMatch(opt.holeSection, jobHoleSection));
  return matched || options[0];
}
