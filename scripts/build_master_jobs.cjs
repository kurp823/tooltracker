const fs = require('fs');

async function generateMasterData() {
  console.log('Connecting to live Azure data...');
  const res = await fetch('http://localhost:3000/api/ToolTracker?action=GET_ALL_DATA&env=live');
  const json = await res.json();
  const dts = json.data?.dtBatches || [];
  const rts = json.data?.rtBatches || [];
  
  console.log(`Loaded ${dts.length} DTs and ${rts.length} RTs`);
  
  // Read any existing CSV text from scripts/create_jobs_data.py
  let csvText = '';
  try {
    const py = fs.readFileSync('scripts/create_jobs_data.py', 'utf8');
    const m = py.match(/CSV_TEXT = """([\s\S]*?)"""/);
    if (m) csvText = m[1];
  } catch (e) {
    console.log('No create_jobs_data.py');
  }

  // Also check if data_part1 and data_part2 exist
  let part1 = '';
  try {
    const p1 = fs.readFileSync('scripts/data_part1.py', 'utf8');
    const m1 = p1.match(/DATA_PART1 = """([\s\S]*?)"""/);
    if (m1) part1 = m1[1];
  } catch (e) {}

  let part2 = '';
  try {
    const p2 = fs.readFileSync('scripts/data_part2.py', 'utf8');
    const m2 = p2.match(/DATA_PART2 = """([\s\S]*?)"""/);
    if (m2) part2 = m2[1];
  } catch (e) {}

  const fullCsv = [csvText, part1, part2].join('\n');

  // Simple CSV parser supporting quotes
  function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const rows = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('Job Number')) continue;
      const row = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          row.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      row.push(cur.trim());
      rows.push(row);
    }
    return rows;
  }

  const csvRows = parseCSV(fullCsv);
  console.log(`Parsed ${csvRows.length} CSV rows`);

  const csvJobsMap = new Map();
  for (const row of csvRows) {
    const jNum = (row[0] || '').trim();
    if (!jNum) continue;

    let invAmt = 0;
    if (row[11]) {
      invAmt = parseFloat(row[11].replace(/,/g, '').trim()) || 0;
    }

    const rawStatus = (row[6] || '').trim();
    let status = 'Completed';
    const sLower = rawStatus.toLowerCase();
    if (sLower === 'ongoing' || sLower === 'active' || sLower === 'open') {
      status = 'Ongoing';
    } else if (sLower === 'invoiced' || (row[9] && row[9].trim())) {
      status = 'Final invoiced';
    } else if (sLower === 'closed') {
      status = 'Closed';
    } else {
      status = 'Completed';
    }

    csvJobsMap.set(jNum.toUpperCase(), {
      id: jNum,
      rig: (row[1] || '').trim(),
      well: (row[2] || '').trim(),
      contract: (row[3] || '').trim(),
      client: (row[4] || '').trim(),
      serviceType: (row[5] || '').trim(),
      status: status,
      mobDate: (row[7] || '').trim(),
      demobDate: (row[8] || '').trim(),
      legalInvoiceNumber: (row[9] || '').trim(),
      draftInvoiceNumber: (row[10] || '').trim(),
      invoiceAmount: invAmt,
      poNumber: (row[16] || '').trim(),
      cost: (row[17] || '').trim(),
      invoicingType: 'PerJob',
      currency: 'USD',
      createdBy: 'Operations',
      createdDate: (row[7] || '2023-01-01').trim(),
    });
  }

  console.log(`Mapped ${csvJobsMap.size} unique jobs from CSV`);

  // Master Jobs Map
  const masterMap = new Map();

  // Add CSV jobs first
  for (const [k, v] of csvJobsMap.entries()) {
    masterMap.set(k, { ...v, dtToolsCount: 0, rtToolsCount: 0, toolsOnRig: 0 });
  }

  // Synthesize and enrich with DTs
  dts.forEach((dt) => {
    const rawId = dt.jobNumber || dt.jobId;
    if (!rawId) return;
    const key = rawId.trim().toUpperCase();
    if (!masterMap.has(key)) {
      masterMap.set(key, {
        id: rawId.trim(),
        rig: dt.rig || 'RIG-EMDAD',
        well: dt.well || '—',
        client: dt.customer || dt.contract || dt.clientCode || 'ADNOC DRILLING',
        contract: dt.contract || dt.clientCode || '',
        poNumber: dt.poNumber || '',
        serviceType: dt.calloutRef ? `Callout: ${dt.calloutRef}` : 'Downhole Tool Dispatch',
        status: 'Completed',
        mobDate: dt.deliveryDate ? dt.deliveryDate.split('T')[0] : (dt.dispatchDate ? dt.dispatchDate.split('T')[0] : ''),
        demobDate: '',
        legalInvoiceNumber: '',
        draftInvoiceNumber: '',
        invoiceAmount: 0,
        dtToolsCount: 0,
        rtToolsCount: 0,
        toolsOnRig: 0,
        invoicingType: 'PerJob',
        currency: 'USD',
        createdBy: 'Operations',
        createdDate: dt.deliveryDate ? dt.deliveryDate.split('T')[0] : '2023-01-01',
      });
    }
    const job = masterMap.get(key);
    const lines = dt.toolLines?.length || 0;
    job.dtToolsCount += lines;
    if (!job.rig && dt.rig) job.rig = dt.rig;
    if ((!job.well || job.well === '—') && dt.well) job.well = dt.well;
    if (!job.poNumber && dt.poNumber) job.poNumber = dt.poNumber;
    if (!job.mobDate && dt.deliveryDate) job.mobDate = dt.deliveryDate.split('T')[0];
  });

  // Enrich with RTs
  rts.forEach((rt) => {
    const rawId = rt.jobNumber || rt.jobId;
    if (!rawId) return;
    const key = rawId.trim().toUpperCase();
    if (!masterMap.has(key)) {
      masterMap.set(key, {
        id: rawId.trim(),
        rig: rt.rig || 'RIG-EMDAD',
        well: rt.well || '—',
        client: 'ADNOC DRILLING',
        contract: rt.contract || '',
        poNumber: '',
        serviceType: 'Downhole Tool Return',
        status: 'Completed',
        mobDate: '',
        demobDate: rt.rtDate ? rt.rtDate.split('T')[0] : '',
        legalInvoiceNumber: '',
        draftInvoiceNumber: '',
        invoiceAmount: 0,
        dtToolsCount: 0,
        rtToolsCount: 0,
        toolsOnRig: 0,
        invoicingType: 'PerJob',
        currency: 'USD',
        createdBy: 'Operations',
        createdDate: '2023-01-01',
      });
    }
    const job = masterMap.get(key);
    const lines = rt.toolLines?.length || 0;
    job.rtToolsCount += lines;
    if (!job.demobDate && rt.rtDate) job.demobDate = rt.rtDate.split('T')[0];
    if (!job.rig && rt.rig) job.rig = rt.rig;
    if ((!job.well || job.well === '—') && rt.well) job.well = rt.well;
  });

  // Calculate Tools On Rig and Status
  let activeJobs = 0;
  let completedJobs = 0;
  let invoicedJobs = 0;

  for (const job of masterMap.values()) {
    job.toolsOnRig = Math.max(0, job.dtToolsCount - job.rtToolsCount);
    
    if (job.legalInvoiceNumber) {
      job.status = 'Final invoiced';
      invoicedJobs++;
    } else if (job.toolsOnRig > 0) {
      job.status = 'Ongoing';
      activeJobs++;
    } else {
      job.status = 'Completed';
      completedJobs++;
    }
  }

  console.log(`Total Master Jobs catalog: ${masterMap.size}`);
  console.log(`Active/Ongoing: ${activeJobs}`);
  console.log(`Invoiced: ${invoicedJobs}`);
  console.log(`Completed: ${completedJobs}`);

  const allJobs = Array.from(masterMap.values());
  fs.writeFileSync('src/data/masterJobs.json', JSON.stringify(allJobs, null, 2));
  console.log('Successfully wrote src/data/masterJobs.json');
}

generateMasterData().catch(console.error);
