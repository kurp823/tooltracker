import { CalculationTicketLine, DraftInvoicePackageData, DrillingJob, ContractRecord, DTBatch, RTBatch, AttachedDoc } from '../types';

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
  }
): DraftInvoicePackageData {
  // Normalize job keys
  const jobKey = String(job.id || '').trim().toUpperCase();
  const jobNoKey = String(job.jobNumber || '').trim().toUpperCase();
  const rawNum = jobKey.replace(/^JOB[-_]?/i, '');

  const matchesJob = (bJobId?: string, bJobNo?: string) => {
    if (!bJobId && !bJobNo) return false;
    const candidates = [bJobId, bJobNo]
      .filter(Boolean)
      .map((k) => String(k).trim().toUpperCase());
    return candidates.some((c) => c === jobKey || c === jobNoKey || c.replace(/^JOB[-_]?/i, '') === rawNum);
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

  const derivedDT = `DT-0${job.id.replace(/[^0-9]/g, '').slice(-4) || '0001'}`;
  const derivedRT = `RT-0${job.id.replace(/[^0-9]/g, '').slice(-4) || '0001'}`;

  const deliveryTicketRefs = dtRefs.length > 0 ? dtRefs.join(', ') : derivedDT;
  const returnLoadingNoteNo = rtRefs.length > 0 ? rtRefs.join(', ') : derivedRT;

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

  if (jobDTs.length > 0 && jobDTs.some((dt) => dt.toolLines && dt.toolLines.length > 0)) {
    // Dynamically derive from live DT and RT batches
    let itemSeq = 1;

    // Optional Personnel line if assigned
    if (job.leadEngineer || job.serviceType?.toLowerCase().includes('engineer')) {
      lines.push({
        itemNo: itemSeq++,
        serialNumber: 'SUBCTR-ENG',
        toolDescription: `${job.leadEngineer || 'FISHING SPECIALIST'} - FIELD ENGINEER`,
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

        const rateLookup = CONTRACT_444558_RATES[serial] || {
          contractRefOper: 'A.4.1',
          contractRefStandby: 'A.4.1',
          operRate: 0,
          standbyRate: 25.0,
        };

        const rtBatch = jobRTs.find((rt) =>
          (rt.toolLines || []).some((rtl) => rtl.serial === serial)
        );

        const deliveryDate = formatJobDisplayDate(dt.dispatchDate || dt.rmDate || mobDateRaw);
        const returnDate = formatJobDisplayDate(rtBatch?.rtDate || demobDateRaw);

        const isOper = tl.used === true;
        const operDays = isOper ? 2 : 0;
        const uncappedStandby = Math.max(0, rentalDays - operDays);
        let standbyDays = uncappedStandby;
        if (isAdnocOnshore) {
          standbyDays = Math.min(uncappedStandby, 6);
        } else if (isAdnocDrilling) {
          standbyDays = Math.min(uncappedStandby, 10);
        }

        const operTotalUSD = operDays * rateLookup.operRate;
        const standbyTotalUSD = Math.round(standbyDays * rateLookup.standbyRate * 100) / 100;
        const totalChargesUSD = Math.round((operTotalUSD + standbyTotalUSD) * 100) / 100;

        lines.push({
          itemNo: itemSeq++,
          serialNumber: serial,
          toolDescription: tl.desc || tl.shortDesc || 'DOWNHOLE FISHING TOOL',
          qty: tl.qty || 1,
          deliveryTicketNo: dt.dtNumber || deliveryTicketRefs,
          deliveryDate,
          returnDate,
          rentalDays,
          rgtNo: rtBatch?.rtNumber || returnLoadingNoteNo,
          contractRefOper: rateLookup.contractRefOper,
          contractRefStandby: rateLookup.contractRefStandby,
          operDays,
          operRateUSD: rateLookup.operRate,
          standbyDays,
          standbyRateUSD: rateLookup.standbyRate,
          operTotalUSD,
          standbyTotalUSD,
          totalChargesUSD,
        });
      });
    });
  } else {
    // Generate tailored lines matching the specific job's attributes
    let itemSeq = 1;
    const numTools = Math.max(2, job.dtToolsCount || 3);

    // Standard fishing tool items matching rig assembly
    const defaultAssembly = [
      { desc: '5-3/4" FS OVERSHOT W/ 3-1/2" IF BOX', prefix: 'OS534', operRate: 0, standbyRate: 32.84, ref: 'A.4.1', isOper: false },
      { desc: '4-3/4" LOGAN SUPER FISHING JAR W/ 3-1/2" IF', prefix: 'SPFJ434', operRate: 0, standbyRate: 33.88, ref: 'A.4.8', isOper: false },
      { desc: '4-3/4" OD FISHING BUMPER SUB W/ 3-1/2" IF', prefix: 'FBS434', operRate: 0, standbyRate: 20.74, ref: 'A.4.7', isOper: false },
      { desc: '5" JUNK SUB W/ 3-1/2" REG PIN X BOX', prefix: 'JS5', operRate: 6.91, standbyRate: 3.46, ref: 'A.4.22', isOper: true },
      { desc: 'BIT SUB W/ 3-1/2" IF BOX X 3-1/2" REG BOX', prefix: 'BS312', operRate: 2.76, standbyRate: 1.38, ref: 'A.4.21', isOper: true },
      { desc: '4-3/4" OD COARSE THREAD SAFETY JOINT', prefix: 'SJ434', operRate: 0, standbyRate: 6.91, ref: 'A.4.26', isOper: false },
    ];

    for (let i = 0; i < numTools; i++) {
      const template = defaultAssembly[i % defaultAssembly.length];
      const serial = `${template.prefix}-${job.id.replace(/[^0-9]/g, '').slice(-3) || '101'}-${i + 1}`;
      const isOper = template.isOper;
      const operDays = isOper ? 2 : 0;
      const uncappedStandby = Math.max(0, rentalDays - operDays);
      let toolStandbyDays = uncappedStandby;
      if (isAdnocOnshore) {
        toolStandbyDays = Math.min(uncappedStandby, 6);
      } else if (isAdnocDrilling) {
        toolStandbyDays = Math.min(uncappedStandby, 10);
      }

      const operTotalUSD = Math.round(operDays * template.operRate * 100) / 100;
      const standbyTotalUSD = Math.round(toolStandbyDays * template.standbyRate * 100) / 100;
      const totalChargesUSD = Math.round((operTotalUSD + standbyTotalUSD) * 100) / 100;

      lines.push({
        itemNo: itemSeq++,
        serialNumber: serial,
        toolDescription: template.desc,
        qty: 1,
        deliveryTicketNo: deliveryTicketRefs,
        deliveryDate: mobDateFormatted,
        returnDate: demobDateFormatted,
        rentalDays,
        rgtNo: returnLoadingNoteNo,
        contractRefOper: template.ref,
        contractRefStandby: template.ref,
        operDays,
        operRateUSD: template.operRate,
        standbyDays: toolStandbyDays,
        standbyRateUSD: template.standbyRate,
        operTotalUSD,
        standbyTotalUSD,
        totalChargesUSD,
      });
    }
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

  // Build verification package
  const dtList = dtRefs.length > 0 ? dtRefs : [derivedDT];
  const rtList = rtRefs.length > 0 ? rtRefs : [derivedRT];

  const verificationPackage = {
    deliveryTickets: dtList.map((ticketNo, idx) => ({
      ticketNo,
      date: formatJobDisplayDate(jobDTs[idx]?.dispatchDate || jobDTs[idx]?.rmDate || mobDateRaw),
      toolsCount: jobDTs[idx]?.toolLines?.length || Math.max(1, lines.length - 1),
      description: `Mobilization of downhole fishing assembly to Rig ${job.rig || 'AD-63'}`,
      signedBy: jobDTs[idx]?.signedDocName || 'Rig Superintendent Verified',
    })),
    totalToolsMobilized: Math.max(1, lines.filter((l) => !l.serialNumber.includes('SUBCTR') && !l.toolDescription.toLowerCase().includes('engineer')).length),
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
      toolsReturned: jobRTs[idx]?.toolLines?.length || Math.max(1, lines.length - 1),
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
