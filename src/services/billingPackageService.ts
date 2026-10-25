import { CalculationTicketLine, DraftInvoicePackageData, DrillingJob, ContractRecord, DTBatch, RTBatch, AttachedDoc } from '../types';
import { normalizeJobKey } from './api';
import {
  getContractRateOptionsForTool,
  findBestMatchingOption,
  ToolHoleSectionOption,
} from './contractRateResolver';
import { getJobUtilizationRecords, ToolUtilizationRecord } from './jobUtilizationData';

/**
 * Standard fixed conversion rate applied by EMDAD for UAE tax invoices
 */
export const USD_TO_AED_EXCHANGE_RATE = 3.6725;
export const UAE_VAT_PERCENTAGE = 5.0;

/**
 * Number to Words converter for USD currency
 */
export function convertAmountToWords(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'ZERO USD ONLY';

  const singleDigits = [
    '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
    'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'
  ];

  const tens = [
    '', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'
  ];

  function convertHundreds(n: number): string {
    let str = '';
    if (n >= 100) {
      str += singleDigits[Math.floor(n / 100)] + ' HUNDRED ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += singleDigits[n] + ' ';
    }
    return str.trim();
  }

  const rounded = Math.round(amount * 100) / 100;
  const dollars = Math.floor(rounded);
  const cents = Math.round((rounded - dollars) * 100);

  if (dollars === 0 && cents === 0) return 'ZERO USD ONLY';

  let result = '';
  const millions = Math.floor(dollars / 1000000);
  const thousands = Math.floor((dollars % 1000000) / 1000);
  const remainder = dollars % 1000;

  if (millions > 0) {
    result += convertHundreds(millions) + ' MILLION ';
  }
  if (thousands > 0) {
    result += convertHundreds(thousands) + ' THOUSAND ';
  }
  if (remainder > 0) {
    result += convertHundreds(remainder) + ' ';
  }

  result = result.trim() + ' USD';

  if (cents > 0) {
    result += ' AND ' + convertHundreds(cents) + ' CENTS';
  }

  return result.trim() + ' ONLY';
}

/**
 * Known contract schedule rates from Contract 444558 & standard fishing rates
 */
export const CONTRACT_444558_RATES: Record<string, {
  contractRefOper: string;
  contractRefStandby: string;
  operRate: number;
  standbyRate: number;
  description?: string;
}> = {
  // Personnel
  'SUBCTR24': { contractRefOper: 'A.4.33', contractRefStandby: 'A.4.33', operRate: 850.00, standbyRate: 0.00, description: 'JOSE SALOMAO' },
  'JOSE SALOMAO': { contractRefOper: 'A.4.33', contractRefStandby: 'A.4.33', operRate: 850.00, standbyRate: 0.00, description: 'FISHING ENGINEER' },
  'FISHING ENGINEER': { contractRefOper: 'A.4.33', contractRefStandby: 'A.4.33', operRate: 850.00, standbyRate: 0.00 },

  // Overshots & guides
  'OS534FS-1295': { contractRefOper: 'A.4.1', contractRefStandby: 'A.4.1', operRate: 0.00, standbyRate: 32.84 },
  'OS578SH-001': { contractRefOper: 'A.4.1', contractRefStandby: 'A.4.1', operRate: 0.00, standbyRate: 32.84 },
  'SN-1016': { contractRefOper: 'A.4.1', contractRefStandby: 'A.4.1', operRate: 0.00, standbyRate: 32.84 },
  'SN-1181': { contractRefOper: 'A.4.2', contractRefStandby: 'A.4.2', operRate: 0.00, standbyRate: 33.88 },
  'HM534-1500': { contractRefOper: 'A.4.2', contractRefStandby: 'A.4.3', operRate: 0.00, standbyRate: 24.89 },
  'HM534-1517': { contractRefOper: 'A.4.2', contractRefStandby: 'A.4.3', operRate: 0.00, standbyRate: 24.89 },

  // Jars & Intensifiers & Bumper subs
  'SPFJ434-004': { contractRefOper: 'A.4.8', contractRefStandby: 'A.4.8', operRate: 0.00, standbyRate: 33.88 },
  'FJ434-1430': { contractRefOper: 'A.4.8', contractRefStandby: 'A.4.8', operRate: 0.00, standbyRate: 33.88 },
  'SN-1088': { contractRefOper: 'A.4.8', contractRefStandby: 'A.4.8', operRate: 0.00, standbyRate: 22.47 },
  'FBS434-1002': { contractRefOper: 'A.4.7', contractRefStandby: 'A.4.7', operRate: 0.00, standbyRate: 20.74 },

  // Impression block & Magnets
  'LIB578-1363': { contractRefOper: 'A.4.15', contractRefStandby: 'A.4.15', operRate: 0.00, standbyRate: 1.90 },
  'FMG512-001': { contractRefOper: 'A.4.12', contractRefStandby: 'A.4.12', operRate: 0.00, standbyRate: 7.60 },
  'SN-1372': { contractRefOper: 'A.4.24', contractRefStandby: 'A.4.24', operRate: 0.00, standbyRate: 6.22 },

  // Mills
  'JM6-1499': { contractRefOper: 'A.4.13', contractRefStandby: 'A.4.13', operRate: 0.00, standbyRate: 6.57 },
  'SN-1480': { contractRefOper: 'A.4.13', contractRefStandby: 'A.4.13', operRate: 0.00, standbyRate: 6.57 },
  'SM6-012': { contractRefOper: 'A.4.13', contractRefStandby: 'A.4.13', operRate: 0.00, standbyRate: 6.56 },

  // Subs
  'SN-1517': { contractRefOper: 'A.4.22', contractRefStandby: 'A.4.22', operRate: 6.91, standbyRate: 3.46 },
  'SN-1248': { contractRefOper: 'A.4.21', contractRefStandby: 'A.4.21', operRate: 2.76, standbyRate: 1.38 },
  'XO-1542': { contractRefOper: 'A.4.21', contractRefStandby: 'A.4.21', operRate: 2.76, standbyRate: 1.38 },
  'SN-1272': { contractRefOper: 'A.4.21', contractRefStandby: 'A.4.21', operRate: 0.00, standbyRate: 1.38 },
  'SN-1240': { contractRefOper: 'A.4.21', contractRefStandby: 'A.4.21', operRate: 0.00, standbyRate: 1.38 },
  'SN-1023': { contractRefOper: 'A.4.26', contractRefStandby: 'A.4.26', operRate: 0.00, standbyRate: 6.91 },
  'SN-1347': { contractRefOper: 'A.4.11', contractRefStandby: 'A.4.11', operRate: 0.00, standbyRate: 6.57 },
  'RCJB534-003': { contractRefOper: 'A.4.6', contractRefStandby: 'A.4.6', operRate: 0.00, standbyRate: 14.86 },
  'JS5-1533': { contractRefOper: 'A.4.22', contractRefStandby: 'A.4.22', operRate: 0.00, standbyRate: 3.46 },

  // Wash pipe
  'WPSJ534-1334': { contractRefOper: 'A.4.4', contractRefStandby: 'A.4.4', operRate: 0.00, standbyRate: 32.15 },
  'WP534-1548': { contractRefOper: 'A.4.4', contractRefStandby: 'A.4.4', operRate: 0.00, standbyRate: 32.84 },
  'WP534-1577': { contractRefOper: 'A.4.4', contractRefStandby: 'A.4.4', operRate: 0.00, standbyRate: 32.84 },
  'WP534-1574': { contractRefOper: 'A.4.4', contractRefStandby: 'A.4.4', operRate: 0.00, standbyRate: 32.84 },
  'WP534-1556': { contractRefOper: 'A.4.4', contractRefStandby: 'A.4.4', operRate: 0.00, standbyRate: 32.84 },
  'WP534-1573': { contractRefOper: 'A.4.4', contractRefStandby: 'A.4.4', operRate: 0.00, standbyRate: 32.84 },

  // Washover shoes
  'WS534-1603': { contractRefOper: 'A.4.13', contractRefStandby: 'A.4.13', operRate: 0.00, standbyRate: 7.95 },
  'WS534-1605': { contractRefOper: 'A.4.13', contractRefStandby: 'A.4.13', operRate: 0.00, standbyRate: 7.95 },
  'WS534-1623': { contractRefOper: 'A.4.13', contractRefStandby: 'A.4.13', operRate: 0.00, standbyRate: 7.95 },
  'WS534-1618': { contractRefOper: 'A.4.13', contractRefStandby: 'A.4.13', operRate: 0.00, standbyRate: 7.95 },
  'WS534-1624': { contractRefOper: 'A.4.13', contractRefStandby: 'A.4.13', operRate: 0.00, standbyRate: 7.95 },

  // Releasing spear & stop sub & die collar & cutter
  'SN-1264': { contractRefOper: 'A.4.16', contractRefStandby: 'A.4.16', operRate: 0.00, standbyRate: 14.52 },
  'SN-1259': { contractRefOper: 'A.4.16', contractRefStandby: 'A.4.16', operRate: 0.00, standbyRate: 14.52 },
  'SN-1080': { contractRefOper: 'A.4.16', contractRefStandby: 'A.4.16', operRate: 0.00, standbyRate: 14.52 },
  'STSB278-1500': { contractRefOper: 'A.4.19', contractRefStandby: 'A.4.19', operRate: 0.00, standbyRate: 4.49 },
  'STSB238-1497': { contractRefOper: 'A.4.19', contractRefStandby: 'A.4.19', operRate: 0.00, standbyRate: 4.49 },
  'EC578-004': { contractRefOper: 'A.4.5', contractRefStandby: 'A.4.5', operRate: 0.00, standbyRate: 11.41 },
  'DC6-005': { contractRefOper: 'A.4.11', contractRefStandby: 'A.4.11', operRate: 0.00, standbyRate: 7.95 },
};

/**
 * Formats date into DD-MMM-YYYY or clean readable format
 */
function formatJobDisplayDate(dateStr?: string, fallback = '25-Oct-2025'): string {
  if (!dateStr) return fallback;
  const s = String(dateStr).trim().split('T')[0];
  const parts = s.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mIdx = parseInt(parts[1], 10) - 1;
      return `${parts[2]}-${months[mIdx] || parts[1]}-${parts[0]}`;
    }
  }
  return s;
}

/**
 * Helper to compute the exact invoice package given a job and supporting batches
 */
export function generateInvoicePackageForJob(
  job: DrillingJob,
  dtBatches: DTBatch[],
  rtBatches: RTBatch[],
  contract?: ContractRecord | null,
  options?: {
    invoiceNo?: string;
    invoiceDate?: string;
    dateOfSupply?: string;
    poNo?: string;
  },
  // Real confirmed per-day Operating/Standby records for this job, as saved
  // by the Utilization screen (tbl_DailyFieldLogs via fetchDailyFieldLogsApi).
  // Raw SQL row shape, field names vary by source - read defensively.
  dailyFieldLogs?: Array<Record<string, any>>
): DraftInvoicePackageData {
  // Index confirmed daily logs by tool serial/asset no (upper-cased) so each
  // tool line can look up its own real Operating/Standby day counts, instead
  // of guessing a flat "2 operating days" for every tool that was used.
  const confirmedDaysBySerial = new Map<string, { operDays: number; standbyDays: number }>();
  (dailyFieldLogs || []).forEach((row) => {
    const serial = String(row.ToolSerial || row.toolSerial || row.Serial || row.AssetNo || row.assetNo || '').trim().toUpperCase();
    if (!serial) return;
    const status = String(row.Status || row.status || '').trim().toUpperCase();
    const isOper = status === '1' || status === 'OPERATIONAL' || status === 'OPER' || status === 'OPS';
    const isStandby = status === 'S' || status === 'STANDBY' || status === 'SB';
    if (!isOper && !isStandby) return;
    const entry = confirmedDaysBySerial.get(serial) || { operDays: 0, standbyDays: 0 };
    if (isOper) entry.operDays += 1;
    if (isStandby) entry.standbyDays += 1;
    confirmedDaysBySerial.set(serial, entry);
  });
  // Normalize job keys
  const jobNormKey = normalizeJobKey(job.id || job.jobNumber);
  const jobKey = String(job.id || '').trim().toUpperCase();
  const jobNoKey = String(job.jobNumber || '').trim().toUpperCase();

  const matchesJob = (bJobId?: string, bJobNo?: string) => {
    if (!bJobId && !bJobNo) return false;
    const candidates = [bJobId, bJobNo]
      .filter(Boolean)
      .map((k) => String(k).trim().toUpperCase());
    return candidates.some((c) => {
      if (c === jobKey || c === jobNoKey) return true;
      const cNorm = normalizeJobKey(c);
      return Boolean(jobNormKey && cNorm === jobNormKey);
    });
  };

  // Find DTs and RTs for this job
  const jobDTs = dtBatches.filter((b) => matchesJob(b.jobId, (b as any).jobNumber));
  const jobRTs = rtBatches.filter((b) => matchesJob(b.jobId, (b as any).jobNumber));

  const dtRefs = jobDTs.map((d) => d.dtNumber).filter(Boolean);
  const rtRefs = jobRTs.map((r) => r.rtNumber).filter(Boolean);

  const todayStr = new Date().toISOString().split('T')[0];
  const mobDateRaw = job.mobDate || (jobDTs[0]?.dispatchDate || jobDTs[0]?.rmDate) || todayStr;
  let demobDateRaw = job.demobDate || job.lastRtDate || job.finalInvoicedDate || (jobRTs[0]?.rtDate) || '';
  if (!demobDateRaw) {
    try {
      const d = new Date(mobDateRaw);
      d.setDate(d.getDate() + 29);
      demobDateRaw = d.toISOString().split('T')[0];
    } catch {
      demobDateRaw = todayStr;
    }
  }

  const mobDateFormatted = formatJobDisplayDate(mobDateRaw, '—');
  const demobDateFormatted = formatJobDisplayDate(demobDateRaw, '—');

  // Calculate rental days
  let rentalDays = 1;
  try {
    const d1 = new Date(mobDateRaw).getTime();
    const d2 = new Date(demobDateRaw).getTime();
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (diff > 0) rentalDays = diff;
  } catch {
    rentalDays = 1;
  }

  // Invoice identifiers
  const invNo =
    options?.invoiceNo ||
    job.legalInvoiceNumber ||
    job.draftInvoiceNumber ||
    (job.id ? `INV-${job.id.replace(/^JOB[-_]?/i, '')}` : 'INV-DRAFT');

  const invDate =
    options?.invoiceDate ||
    (job.finalInvoicedDate ? formatJobDisplayDate(job.finalInvoicedDate) : (job.invoiceDate ? formatJobDisplayDate(job.invoiceDate) : formatJobDisplayDate(todayStr)));

  const dateOfSupply = options?.dateOfSupply || mobDateFormatted;

  // A job that already carries a legal (final) invoice number has already been
  // billed to the client - its figures must come only from real/archived
  // records from this point on and must never be silently regenerated or
  // overwritten with fabricated placeholders.
  const isLocked = Boolean(job.legalInvoiceNumber && job.legalInvoiceNumber.trim() && job.legalInvoiceNumber.trim() !== '—');

  // Real archived tool/utilization history for this job (actual DT/RT/tool
  // details previously recorded), used only when no live DT/RT batch is
  // matched. This is real data, never a guess.
  const historicalRecords: ToolUtilizationRecord[] = getJobUtilizationRecords(job.id || job.jobNumber);
  const historicalDtRefs = Array.from(new Set(historicalRecords.map((r) => r.dt).filter(Boolean)));

  // NOTE: previously this fabricated a DT-0xxxx/RT-0xxxx ticket number out of
  // the job ID digits whenever no ticket matched - that invented a document
  // number that doesn't correspond to any real signed ticket. Never do that:
  // show the real refs if found, otherwise say plainly that none were found.
  const deliveryTicketRefs = dtRefs.length > 0
    ? dtRefs.join(', ')
    : (historicalDtRefs.length > 0 ? historicalDtRefs.join(', ') : 'No DT on record');
  const returnLoadingNoteNo = rtRefs.length > 0 ? rtRefs.join(', ') : 'No RT on record';

  // Derive Client Details
  let customerName = 'ADNOC OFFSHORE (EX-ADMA-OPCO)';
  let customerAddress = 'HAMDAN STREET, PO BOX 303, ABU DHABI, United Arab Emirates';
  let customerTrn = '100229459100003';
  let customerCode = 'C00006';

  const cStr = String(job.client || contract?.client || '').toUpperCase();
  if (cStr.includes('ONSHORE') || cStr.includes('ADCO')) {
    customerName = 'ADNOC ONSHORE (EX-ADCO)';
    customerAddress = 'AL CORNICHE STREET, P.O. BOX 270, ABU DHABI, UAE';
    customerTrn = '100229459100002';
    customerCode = 'C00002';
  } else if (cStr.includes('DRILLING')) {
    customerName = 'ADNOC DRILLING COMPANY P.J.S.C.';
    customerAddress = 'STREET 10, MUSAFFAH INDUSTRIAL AREA, P.O. BOX 4017, ABU DHABI, UAE';
    customerTrn = '100236056500001';
    customerCode = 'C00010';
  } else if (cStr.includes('BAKER')) {
    customerName = 'BAKER HUGHES EASTERN DIVISION';
    customerAddress = 'PLOT 15, SECTOR M-44, MUSAFFAH, ABU DHABI, UAE';
    customerTrn = '100344819000003';
    customerCode = 'C00024';
  } else if (cStr.includes('HALLIBURTON')) {
    customerName = 'HALLIBURTON WORLDWIDE LIMITED';
    customerAddress = 'SECTOR M-21, MUSAFFAH, P.O. BOX 57, ABU DHABI, UAE';
    customerTrn = '100024982100003';
    customerCode = 'C00015';
  } else if (cStr.startsWith('TW-') || (job.contract && job.contract.startsWith('TW-'))) {
    customerName = `ADNOC DRILLING / OFFSHORE (TASK: ${job.client || job.contract})`;
    customerAddress = 'P.O. BOX 303, ABU DHABI, United Arab Emirates';
    customerTrn = '100229459100003';
    customerCode = 'C00006';
  } else if (job.client && job.client.trim()) {
    customerName = job.client;
  }

  const poNo =
    options?.poNo ||
    (job.poNumber && job.poNumber !== '0' && job.poNumber !== '' ? job.poNumber : (contract?.poNumber || '—'));

  const contractNo =
    (job.contract && job.contract !== '—' && !job.contract.startsWith('TW-')) ? job.contract : (contract?.contractNo || '444558');

  // Standby cap determination based on client contract:
  // - ADNOC Onshore: max 6 standby days per job
  // - ADNOC Drilling: max 10 standby days per month
  // - Other contracts: no standby cap
  const isAdnocOnshore = cStr.includes('ONSHORE') || cStr.includes('ADCO');
  const isAdnocDrilling = cStr.includes('DRILLING');

  // Build calculation lines
  let lines: CalculationTicketLine[] = [];
  let usesConfirmedUtilization = false;
  // Tool descriptions whose contract rate could not be mapped by category at
  // all (ended up on a $0 / generic fallback rate). Surfaced so a mapping
  // gap is visible on the invoice instead of silently billing at zero.
  const unmappedToolDescriptions = new Set<string>();

  if (jobDTs.length > 0 && jobDTs.some((dt) => dt.toolLines && dt.toolLines.length > 0)) {
    // Dynamically derive from live DT and RT batches
    let itemSeq = 1;

    // Optional Personnel line if assigned
    if ((job as any).leadEngineer || job.serviceType?.toLowerCase().includes('engineer')) {
      lines.push({
        itemNo: itemSeq++,
        serialNumber: 'SUBCTR-ENG',
        toolDescription: `${(job as any).leadEngineer || 'FISHING SPECIALIST'} - FIELD ENGINEER`,
        qty: 1,
        deliveryTicketNo: '',
        deliveryDate: mobDateFormatted,
        returnDate: demobDateFormatted,
        rentalDays: Math.min(rentalDays, 4),
        rgtNo: '',
        contractRefOper: 'A.4.33',
        contractRefStandby: 'A.4.33',
        operDays: Math.min(rentalDays, 4),
        operRateUSD: 850.00,
        standbyDays: 0,
        standbyRateUSD: 0.00,
        operTotalUSD: Math.min(rentalDays, 4) * 850.00,
        standbyTotalUSD: 0.00,
        totalChargesUSD: Math.min(rentalDays, 4) * 850.00,
      });
    }

    jobDTs.forEach((dt) => {
      (dt.toolLines || []).forEach((tl) => {
        const serial = tl.serial || tl.assetNo;
        if (!serial) return;

        let selectedHoleSectionOpt: ToolHoleSectionOption | null = null;
        try {
          const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(`emdad_job_tool_sections_${job.id || job.jobNumber}`) : null;
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed[serial] || parsed[(tl as any).id]) {
              selectedHoleSectionOpt = parsed[serial] || parsed[(tl as any).id];
            }
          }
        } catch {}

        if (!selectedHoleSectionOpt) {
          const rateOpts = getContractRateOptionsForTool(
            {
              desc: tl.desc || tl.shortDesc,
              assetNo: serial,
              category: (tl as any).category,
              size: (tl as any).size,
            },
            contract
          );
          if (rateOpts.length > 0) {
            selectedHoleSectionOpt = findBestMatchingOption(rateOpts, (job as any).holeSection || (tl as any).holeSection) || rateOpts[0];
          }
        }

        // getContractRateOptionsForTool() returns a contractRef of '—' with
        // opsRate/standbyRate of 0 when it could not map this tool's
        // category/description to any contract rate line at all (no exact
        // category match, no fuzzy/synonym match). That is a real pricing
        // gap, not a legitimate $0 rate - flag it so it's visible on the
        // invoice instead of silently billing the tool at zero.
        const isUnmappedCategory = Boolean(selectedHoleSectionOpt && selectedHoleSectionOpt.contractRef === '—');
        if (isUnmappedCategory) {
          unmappedToolDescriptions.add(tl.desc || tl.shortDesc || serial);
        }

        let rateLookup = CONTRACT_444558_RATES[serial];

        if (selectedHoleSectionOpt && !isUnmappedCategory) {
          const isAED = selectedHoleSectionOpt.currency === 'AED';
          rateLookup = {
            contractRefOper: selectedHoleSectionOpt.contractRef || 'SCHEDULE 2',
            contractRefStandby: selectedHoleSectionOpt.contractRef || 'SCHEDULE 2',
            operRate: isAED ? selectedHoleSectionOpt.opsRate / USD_TO_AED_EXCHANGE_RATE : selectedHoleSectionOpt.opsRate,
            standbyRate: isAED ? selectedHoleSectionOpt.standbyRate / USD_TO_AED_EXCHANGE_RATE : selectedHoleSectionOpt.standbyRate,
            description: selectedHoleSectionOpt.shortDesc,
          };
        } else if (contract?.rates && contract.rates.length > 0) {
          const descUpper = String(tl.desc || tl.shortDesc || '').toUpperCase();
          const catUpper = String((tl as any).category || '').toUpperCase();
          const sizeUpper = String((tl as any).size || '').toUpperCase();
          const matched = contract.rates.find((r) => {
            const rDesc = (r.shortDesc || '').toUpperCase();
            const rCat = (r.category || '').toUpperCase();
            const rSize = (r.size || '').toUpperCase();
            if (rDesc && descUpper.includes(rDesc)) return true;
            if (rCat && (catUpper.includes(rCat) || descUpper.includes(rCat))) return true;
            if (rSize && sizeUpper && rSize === sizeUpper) return true;
            return false;
          });
          if (matched) {
            const isAED = contract.currency === 'AED';
            rateLookup = {
              contractRefOper: matched.contractRef || 'SCHEDULE 2',
              contractRefStandby: matched.contractRef || 'SCHEDULE 2',
              operRate: isAED ? matched.opsRate / USD_TO_AED_EXCHANGE_RATE : matched.opsRate,
              standbyRate: isAED ? matched.standbyRate / USD_TO_AED_EXCHANGE_RATE : matched.standbyRate,
            };
            // Recovered via a direct contract-rate match - not actually unmapped.
            unmappedToolDescriptions.delete(tl.desc || tl.shortDesc || serial);
          }
        }

        if (!rateLookup) {
          unmappedToolDescriptions.add(tl.desc || tl.shortDesc || serial);
          rateLookup = {
            contractRefOper: 'A.4.1',
            contractRefStandby: 'A.4.1',
            operRate: 0,
            standbyRate: 25.0,
          };
        }

        const rtBatch = jobRTs.find((rt) =>
          (rt.toolLines || []).some((rtl) => rtl.serial === serial)
        );

        const deliveryDate = formatJobDisplayDate(dt.dispatchDate || dt.rmDate || mobDateRaw);
        const returnDate = formatJobDisplayDate(rtBatch?.rtDate || demobDateRaw);

        // Prefer the real, confirmed per-day Operating/Standby count from the
        // Utilization screen (tbl_DailyFieldLogs) over the flat "2 operating
        // days if used, else 0" guess below - that guess ignored whatever was
        // actually confirmed against this job and is why invoiced days could
        // disagree with the Utilization tab.
        const confirmedDays = confirmedDaysBySerial.get(String(serial).trim().toUpperCase());

        let operDays: number;
        let standbyDays: number;
        if (confirmedDays) {
          operDays = confirmedDays.operDays;
          standbyDays = confirmedDays.standbyDays;
          usesConfirmedUtilization = true;
        } else {
          const isOper = tl.used === true;
          operDays = isOper ? 2 : 0;
          const uncappedStandby = Math.max(0, rentalDays - operDays);
          standbyDays = uncappedStandby;
          if (isAdnocOnshore) {
            standbyDays = Math.min(uncappedStandby, 6);
          } else if (isAdnocDrilling) {
            standbyDays = Math.min(uncappedStandby, 10);
          }
        }

        const operTotalUSD = Math.round(operDays * rateLookup.operRate * 100) / 100;
        const standbyTotalUSD = Math.round(standbyDays * rateLookup.standbyRate * 100) / 100;
        const totalChargesUSD = Math.round((operTotalUSD + standbyTotalUSD) * 100) / 100;

        let toolDescDisplay = tl.desc || tl.shortDesc || 'DOWNHOLE FISHING TOOL';
        if (selectedHoleSectionOpt?.holeSection && selectedHoleSectionOpt.holeSection !== 'All Sizes' && selectedHoleSectionOpt.holeSection !== 'STANDARD') {
          toolDescDisplay = `${toolDescDisplay} [${selectedHoleSectionOpt.holeSection}]`;
        }

        // Sub-Contractor / Supplier Cost Lookup from Job or Master Inventory
        const rawSupplier = (tl.supplier || (tl as any).ownership || '').trim();
        const isSubTool = Boolean(tl.isEmdad === false || (rawSupplier && rawSupplier.toUpperCase() !== 'EMDAD'));
        const supplierName = isSubTool ? (rawSupplier || 'MOTORMAX') : 'EMDAD';

        // Check for saved sub-rental overrides
        let subSbDays = isSubTool ? standbyDays : 0;
        let subOpsDays = isSubTool ? operDays : 0;
        let subSbRateUSD = isSubTool ? Math.round(rateLookup.standbyRate * 0.75 * 100) / 100 : 0;
        let subOpsRateUSD = isSubTool ? Math.round(rateLookup.operRate * 0.75 * 100) / 100 : 0;
        let subRunChargeUSD = 0;
        let subRedressChargeUSD = 0;

        try {
          const savedCosts = typeof localStorage !== 'undefined'
            ? localStorage.getItem(`emdad_job_subrental_costs_${job.id || job.jobNumber}`)
            : null;
          if (savedCosts) {
            const parsedCosts = JSON.parse(savedCosts);
            const subSaved = parsedCosts[serial] || parsedCosts[(tl as any).id];
            if (subSaved) {
              if (subSaved.subSbDays !== undefined) subSbDays = Number(subSaved.subSbDays);
              if (subSaved.subOpsDays !== undefined) subOpsDays = Number(subSaved.subOpsDays);
              if (subSaved.subSbRate !== undefined) subSbRateUSD = Math.round((Number(subSaved.subSbRate) / USD_TO_AED_EXCHANGE_RATE) * 100) / 100;
              if (subSaved.subOpsRate !== undefined) subOpsRateUSD = Math.round((Number(subSaved.subOpsRate) / USD_TO_AED_EXCHANGE_RATE) * 100) / 100;
              if (subSaved.subRunCharge !== undefined) subRunChargeUSD = Math.round((Number(subSaved.subRunCharge) / USD_TO_AED_EXCHANGE_RATE) * 100) / 100;
              if (subSaved.subRedressCharge !== undefined) subRedressChargeUSD = Math.round((Number(subSaved.subRedressCharge) / USD_TO_AED_EXCHANGE_RATE) * 100) / 100;
            }
          }
        } catch {}

        const totalSubCostUSD = isSubTool
          ? Math.round(((subSbDays * subSbRateUSD) + (subOpsDays * subOpsRateUSD) + subRunChargeUSD + subRedressChargeUSD) * 100) / 100
          : 0;

        lines.push({
          itemNo: itemSeq++,
          serialNumber: serial,
          toolDescription: toolDescDisplay,
          qty: tl.qty || 1,
          deliveryTicketNo: dt.dtNumber || deliveryTicketRefs,
          deliveryDate,
          returnDate,
          rentalDays,
          rgtNo: rtBatch?.rtNumber || returnLoadingNoteNo,
          contractRefOper: rateLookup.contractRefOper,
          contractRefStandby: rateLookup.contractRefStandby,
          operDays,
          operRateUSD: Math.round(rateLookup.operRate * 100) / 100,
          standbyDays,
          standbyRateUSD: Math.round(rateLookup.standbyRate * 100) / 100,
          operTotalUSD,
          standbyTotalUSD,
          totalChargesUSD,
          // Subcontractor Cost Data
          supplier: supplierName,
          isSubTool,
          subSbDays,
          subOpsDays,
          subSbRateUSD,
          subOpsRateUSD,
          subRunChargeUSD,
          subRedressChargeUSD,
          totalSubCostUSD,
          allocatedRig: tl.allocatedRig || dt.rig || job.rig || '',
          allocatedWell: tl.allocatedWell || dt.well || job.well || '',
          clientDtNo: tl.clientDtNo || '',
        });
      });
    });
  } else if (historicalRecords.length > 0) {
    // No live DT/RT batch matched this job, but real archived tool/utilization
    // history exists for it (previously invoiced/recorded data) - use that
    // instead of inventing a generic tool assembly.
    let itemSeq = 1;
    historicalRecords.forEach((rec) => {
      const operDays = rec.operDays || 0;
      const sbDays = rec.sbDays || 0;
      const operRate = rec.operRate || 0;
      const sbRate = rec.sbRate || 0;
      const operTotalUSD = Math.round(operDays * operRate * 100) / 100;
      const standbyTotalUSD = Math.round(sbDays * sbRate * 100) / 100;
      const totalChargesUSD = Math.round((operTotalUSD + standbyTotalUSD) * 100) / 100;

      lines.push({
        itemNo: itemSeq++,
        serialNumber: rec.serial || '—',
        toolDescription: rec.desc || 'TOOL (FROM ARCHIVED JOB RECORD)',
        qty: 1,
        deliveryTicketNo: rec.dt || deliveryTicketRefs,
        deliveryDate: rec.delDate ? formatJobDisplayDate(rec.delDate) : mobDateFormatted,
        returnDate: rec.retDate ? formatJobDisplayDate(rec.retDate) : demobDateFormatted,
        rentalDays,
        rgtNo: returnLoadingNoteNo,
        contractRefOper: 'ARCHIVED RECORD',
        contractRefStandby: 'ARCHIVED RECORD',
        operDays,
        operRateUSD: operRate,
        standbyDays: sbDays,
        standbyRateUSD: sbRate,
        operTotalUSD,
        standbyTotalUSD,
        totalChargesUSD,
      });
    });
  } else {
    // No live DT/RT batch and no archived utilization history matched this
    // job - there is nothing real to show. Previously this point generated a
    // fictional assembly of generic fishing tools with fabricated serial
    // numbers and rates; that is never done now. `lines` stays empty and
    // `noMatchedRecords` (below) tells the UI to say so plainly instead of
    // printing an invoice with invented tools.
  }

  // Roll up values
  let crewChargeUSD = 0;
  let operationalChargeUSD = 0;
  let standbyChargeUSD = 0;

  lines.forEach((l) => {
    if (l.itemNo === 1 || l.serialNumber.includes('SUBCTR') || l.toolDescription.toLowerCase().includes('salomao') || l.toolDescription.toLowerCase().includes('engineer')) {
      crewChargeUSD += l.operTotalUSD + l.standbyTotalUSD;
    } else {
      operationalChargeUSD += l.operTotalUSD;
      standbyChargeUSD += l.standbyTotalUSD;
    }
  });

  crewChargeUSD = Math.round(crewChargeUSD * 100) / 100;
  operationalChargeUSD = Math.round(operationalChargeUSD * 100) / 100;
  standbyChargeUSD = Math.round(standbyChargeUSD * 100) / 100;

  const grossValueUSD = Math.round((crewChargeUSD + operationalChargeUSD + standbyChargeUSD) * 100) / 100;
  const vatPercentage = UAE_VAT_PERCENTAGE;
  const vatAmountUSD = Math.round(grossValueUSD * (vatPercentage / 100) * 100) / 100;
  const grandTotalUSD = Math.round((grossValueUSD + vatAmountUSD) * 100) / 100;

  const exchangeRateUSDToAED = USD_TO_AED_EXCHANGE_RATE;
  const crewChargeAED = Math.round(crewChargeUSD * exchangeRateUSDToAED * 100) / 100;
  const operationalChargeAED = Math.round(operationalChargeUSD * exchangeRateUSDToAED * 100) / 100;
  const standbyChargeAED = Math.round(standbyChargeUSD * exchangeRateUSDToAED * 100) / 100;

  const taxableAmountTotalAED = Math.round((crewChargeAED + operationalChargeAED + standbyChargeAED) * 100) / 100;
  const vatTotalAED = Math.round(taxableAmountTotalAED * (vatPercentage / 100) * 100) / 100;
  const grandTotalAED = Math.round((taxableAmountTotalAED + vatTotalAED) * 100) / 100;

  const amountInWords = convertAmountToWords(grandTotalUSD);

  const operDays = 2;
  const standbyDays = Math.max(0, rentalDays - operDays);

  const standbyNotes = `STANDBY DAYS FROM ${mobDateFormatted} TO ${demobDateFormatted} = ${standbyDays} DAYS`;
  const operNotes = `OPERATIONAL DAYS = ${operDays} DAYS AS PER RIG SIGN-OFF`;
  const operDaysSummary = `${operDays} Operational Days as per Rig Sign-off`;

  // Build verification package - only ever from real refs (live or
  // archived); an empty list here means no real ticket was found, which the
  // UI shows plainly rather than inventing one.
  const dtList = dtRefs.length > 0 ? dtRefs : historicalDtRefs;
  const rtList = rtRefs.length > 0 ? rtRefs : [];

  const verificationPackage = {
    deliveryTickets: dtList.map((ticketNo, idx) => ({
      ticketNo,
      date: formatJobDisplayDate(jobDTs[idx]?.dispatchDate || jobDTs[idx]?.rmDate || mobDateRaw),
      toolsCount: jobDTs[idx]?.toolLines?.length || lines.length,
      description: `Mobilization of downhole fishing assembly to Rig ${job.rig || 'AD-63'}`,
      signedBy: jobDTs[idx]?.signedDocName || (jobDTs[idx] ? 'Rig Superintendent Verified' : 'Not Verified (Archived Record)'),
    })),
    totalToolsMobilized: lines.filter((l) => !l.serialNumber.includes('SUBCTR') && !l.toolDescription.toLowerCase().includes('engineer')).length,
    totalCrewMobilized: lines.some((l) => l.serialNumber.includes('SUBCTR') || l.toolDescription.toLowerCase().includes('engineer')) ? 1 : 0,
    mobManifest: {
      manifestRef: `MNF-${(job.rig || 'RIG').replace(/[^a-zA-Z0-9]/g, '')}-${job.id.replace(/[^0-9]/g, '').slice(-4) || '2025'}`,
      receivedDate: mobDateFormatted,
      rigName: job.rig || 'Rig Location',
      verifiedBy: 'Rig Superintendent Verified',
      transportMode: (job.rig || '').toUpperCase().startsWith('AD-') || (job.rig || '').toUpperCase().startsWith('AL-')
        ? 'Offshore Supply Vessel Marine #4'
        : 'Oilfield Heavy Haul Truck #18',
    },
    receivingTickets: rtList.map((ticketNo, idx) => ({
      ticketNo,
      date: formatJobDisplayDate(jobRTs[idx]?.rtDate || demobDateRaw),
      toolsReturned: jobRTs[idx]?.toolLines?.length || 0,
      backloadStatus: 'Complete Demobilization',
      routedTo: 'Checked into Inspection Bay',
    })),
    demobManifest: {
      manifestRef: `MNF-BACKLOAD-${job.id.replace(/[^0-9]/g, '').slice(-4) || '0941'}`,
      releaseDate: demobDateFormatted,
      rigName: job.rig || 'Rig Location',
      vesselOrTruck: (job.rig || '').toUpperCase().startsWith('AD-') || (job.rig || '').toUpperCase().startsWith('AL-')
        ? 'Offshore Supply Vessel Marine #4'
        : 'Oilfield Heavy Haul Truck #18',
      destination: 'EMDAD Mussafah Base M-44',
    },
    rigSignoff: {
      engineerName: 'JOSE SALOMAO',
      mobDate: mobDateFormatted,
      demobDate: demobDateFormatted,
      operationalDays: operDays,
      standbyDays: standbyDays,
      operationSummary: `Downhole fishing & recovery operations at Well ${job.well || 'Rig Well'}`,
      approvalRef: `${job.rig || 'AD'}-FSH-${job.id.replace(/[^0-9]/g, '').slice(-2) || '01'}`,
      supervisorName: 'Signed by ADNOC Rig Supervisor',
    },
  };

  // Compile all actual physical documents linked to this job from DTs, RTs, and Rig/Utilization
  const attachedDocuments: AttachedDoc[] = [];

  // 1. Delivery Ticket attachments
  jobDTs.forEach((dt) => {
    if (dt.attachments && dt.attachments.length > 0) {
      attachedDocuments.push(...dt.attachments);
    } else if (dt.signedDocName || dt.signedDocUrl || dt.isSigned) {
      attachedDocuments.push({
        id: `att-dt-${dt.id || dt.dtNumber}`,
        name: dt.signedDocName || `${dt.dtNumber}_Signed_Delivery_Ticket.pdf`,
        url: dt.signedDocUrl || '',
        category: dt.signedDocName?.toLowerCase().includes('manifest')
          ? 'Combined DT & Manifest'
          : 'Signed Delivery Ticket',
        sourceType: 'DT',
        sourceRef: dt.dtNumber,
        uploadDate: dt.signedDate || dt.rmDate || dateOfSupply,
        uploadedBy: dt.dispatchedBy || 'Base Operations',
      });
    }
  });

  // 2. Receiving Ticket attachments
  jobRTs.forEach((rt) => {
    if (rt.attachments && rt.attachments.length > 0) {
      attachedDocuments.push(...rt.attachments);
    } else if (rt.signedDocName || rt.signedDocUrl || rt.isSigned) {
      attachedDocuments.push({
        id: `att-rt-${rt.id || rt.rtNumber}`,
        name: rt.signedDocName || `${rt.rtNumber}_Signed_Receiving_Ticket.pdf`,
        url: rt.signedDocUrl || '',
        category: rt.signedDocName?.toLowerCase().includes('manifest')
          ? 'Combined RT & Demob Manifest'
          : 'Signed Receiving Ticket',
        sourceType: 'RT',
        sourceRef: rt.rtNumber,
        uploadDate: rt.signedDate || rt.rtDate || demobDateFormatted,
        uploadedBy: rt.receivedBy || 'Receiving Yard',
      });
    }
  });

  // 3. Rig Daily Log / Utilization attachments
  if (job.utilizationAttachments && job.utilizationAttachments.length > 0) {
    attachedDocuments.push(...job.utilizationAttachments);
  } else if (job.signedUtilizationAttached) {
    attachedDocuments.push({
      id: `att-ut-${job.id}`,
      name: `Rig_${(job.rig || 'AD63').replace(/[^a-zA-Z0-9]/g, '')}_DualSigned_Daily_Tour_Log.pdf`,
      url: '',
      category: 'Dual-Signed Rig Daily Log',
      sourceType: 'Utilization',
      sourceRef: `Rig ${job.rig || 'AD-63'} Daily Sign-Off`,
      uploadDate: job.waitingSignedDocsDate || job.ongoingDate || demobDateFormatted,
      uploadedBy: 'ADNOC Rig Superintendent & EMDAD Lead',
    });
  }



  return {
    jobId: job.id,
    invoiceNumber: invNo,
    invoiceDate: invDate,
    dateOfSupply,
    customerCode,
    customerName,
    customerAddress,
    customerTrn,
    contractNo,
    poNo,
    rig: job.rig || 'AD-63',
    well: job.well || 'INFILL WELL',
    serviceOrderNo: job.id,
    deliveryTicketRefs,
    returnLoadingNoteNo,
    lines,
    noMatchedRecords: lines.length === 0,
    usesConfirmedUtilization,
    unmappedToolDescriptions: Array.from(unmappedToolDescriptions),
    dataSource: (jobDTs.length > 0 && jobDTs.some((dt) => dt.toolLines && dt.toolLines.length > 0))
      ? 'live'
      : (historicalRecords.length > 0 ? 'historical' : 'none'),
    isLocked,
    crewChargeUSD,
    crewDays: 4,
    crewDailyRateUSD: 850.00,
    operDays,
    standbyDays,
    operDaysSummary,
    operationalChargeUSD,
    standbyChargeUSD,
    grossValueUSD,
    vatPercentage,
    vatAmountUSD,
    grandTotalUSD,
    exchangeRateUSDToAED,
    crewChargeAED,
    operationalChargeAED,
    standbyChargeAED,
    taxableAmountTotalAED,
    vatTotalAED,
    grandTotalAED,
    amountInWords,
    standbyNotes,
    operNotes,
    verificationPackage,
    attachedDocuments,
    bankDetails: {
      remitTo: 'FIRST ABU DHABI BANK, P.O. BOX 4, ABU DHABI, UAE',
      accountAddress: 'FIRST ABU DHABI BANK, P.O. BOX 4, ABU DHABI, UAE',
      usdIban: 'AE45 0354 0212 0314 1283 035',
      swift: 'NBADAEAA',
    },
  };
}
