/**
 * GET /api/health?tables=tbl_Jobs,tbl_GatePasses,tbl_DailyFieldLogs
 * Returns real column names for the requested tables (or a default set).
 *
 * GET /api/health?probe=clients,contracts,invoices,suppliers,inspection,maintenance
 * Runs the EXACT list query each fixed endpoint uses (no auth needed) and
 * reports row count + a sample row, or the raw SQL error. Lets the fix be
 * verified without logging in.
 *
 * TEMPORARY — remove after schema audit.
 */
const { query: dbQuery } = require('../db')

const PROBES = {
  clients: `SELECT id AS ClientID, clientName AS ClientName, clientCode AS ShortName,
                NULL AS Country, address AS Address,
                contactName AS ContactPerson, contactEmail AS ContactEmail,
                contactPhone AS ContactPhone, active AS IsActive
         FROM   tbl_Clients
         ORDER  BY clientName`,
  contracts: `SELECT c.ContractID, c.ContractRef AS ContractNumber,
                c.Client + ' - ' + c.ContractRef AS ContractName,
                NULL AS ClientID, c.Client AS ClientName,
                c.StartDate, c.EndDate, c.Status, c.Currency,
                c.Notes AS Description,
                CASE WHEN c.Status = 'Active' THEN 1 ELSE 0 END AS IsActive
         FROM   tbl_Contracts c
         ORDER  BY c.ContractRef`,
  invoices: `SELECT i.id AS InvoiceID, i.invoiceNumber AS InvoiceNumber, i.jobNumber AS JobID,
              i.invoiceDate AS InvoiceDate, NULL AS DueDate,
              i.currency AS Currency, i.totalAmount AS TotalAmount, i.status AS Status,
              YEAR(i.invoiceDate) AS FiscalYear, i.createdAt AS CreatedDate,
              c.clientName AS Client
         FROM tbl_Invoices i
         LEFT JOIN tbl_Clients c ON i.clientCode = c.clientCode
        ORDER BY i.invoiceDate DESC, i.createdAt DESC`,
  suppliers: `SELECT s.id AS SupplierID, s.supplierName AS SupplierName, s.contactName AS ContactName,
              s.contactEmail AS Email, s.contactPhone AS Phone,
              NULL AS Country, s.active AS IsActive,
              (SELECT COUNT(*) FROM tbl_Inventory WHERE Supplier = s.supplierName) AS ToolCount
         FROM tbl_Suppliers s
        ORDER BY s.supplierName`,
  inspection: `SELECT i.id AS InspectionID, 'INS-' + CAST(i.id AS varchar) AS InspectionNumber,
              i.jobNumber AS JobID, i.serial AS SerialNumber, i.asset AS AssetNo,
              NULL AS ToolDescription, NULL AS SizeName,
              i.inspectionType AS InspectionType, i.inspectionDate AS InspectionDate,
              i.inspector AS Inspector, i.result AS Result, i.status AS Status,
              i.notes AS Notes, i.createdAt AS CreatedDate, i.createdBy AS CreatedBy
         FROM tbl_InspectionRecords i
        ORDER BY i.inspectionDate DESC, i.createdAt DESC`,
  maintenance: `SELECT m.id AS MaintenanceJobID, m.jobCardNumber AS MaintenanceJobNumber,
              m.serial AS SerialNumber, m.asset AS AssetNo, NULL AS ToolDescription,
              m.jobType AS MaintenanceType, m.priority AS Priority, m.description AS Description,
              m.dateIn AS ScheduledDate, m.completedDate AS CompletedDate, m.status AS Status,
              m.completedBy AS TechnicianName, m.notes AS Notes,
              m.createdAt AS CreatedDate, m.createdBy AS CreatedBy
         FROM tbl_MaintenanceJobs m
        ORDER BY
          CASE m.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
          m.dateIn ASC`,
  'delivery-tickets': `SELECT d.id AS DTID, d.dtNumber AS DTNumber, d.jobNumber AS JobID,
              d.deliveryDate AS DTDate, d.status AS Status,
              d.createdAt AS CreatedDate, d.createdBy AS CreatedBy,
              c.clientName AS Client,
              (SELECT COUNT(*) FROM tbl_DeliveryTicketLines WHERE dtNumber = d.dtNumber) AS LineCount
         FROM tbl_DeliveryTickets d
         LEFT JOIN tbl_Clients c ON d.clientCode = c.clientCode
        ORDER BY d.createdAt DESC`,
  'receiving-tickets': `SELECT r.id AS RTID, r.rtNumber AS RTNumber, r.jobNumber AS JobID,
              r.receivingDate AS RTDate, r.status AS Status,
              r.createdAt AS CreatedDate, r.createdBy AS CreatedBy,
              c.clientName AS Client,
              (SELECT COUNT(*) FROM tbl_ReceivingTicketLines WHERE rtNumber = r.rtNumber) AS LineCount
         FROM tbl_ReceivingTickets r
         LEFT JOIN tbl_Clients c ON r.clientCode = c.clientCode
        ORDER BY r.createdAt DESC`,
  'gate-passes': `SELECT g.GatePassID, g.GPNumber AS GatePassNumber, g.Supplier,
              g.GPDate AS PassDate, g.PreparedBy, g.AuthorizedBy, g.Notes,
              (SELECT COUNT(*) FROM tbl_GatePassLines WHERE GatePassID = g.GatePassID) AS ItemCount
         FROM tbl_GatePass g
        ORDER BY g.GPDate DESC`,
  jobs: `SELECT JobID, Rig, Well, Client, Status, CreatedDate, CreatedBy, UpdatedAt
         FROM tbl_Jobs ORDER BY CreatedDate DESC`,
  'jobs-01836': `SELECT DISTINCT JobID FROM tbl_Jobs WHERE JobID LIKE '%01836%'`,
  'dt-01836': `SELECT DISTINCT jobNumber FROM tbl_DeliveryTickets WHERE jobNumber LIKE '%01836%'`,
  'dtlines-01830': `SELECT TOP 10 l.id, l.dtNumber, l.itemNo, l.serial, l.toolDescription, l.qty, l.remarks
         FROM tbl_DeliveryTicketLines l
         WHERE l.dtNumber IN (SELECT dtNumber FROM tbl_DeliveryTickets WHERE jobNumber = 'JOB-26-01830')
         ORDER BY l.itemNo`,
  'inv-emd6364': `SELECT TOP 5 SystemID, AssetNo, OEMSerial, ShortDesc FROM tbl_Inventory
         WHERE SystemID = 'EMD-6364' OR AssetNo = 'EMD-6364' OR OEMSerial = 'EMD-6364'`,
  'inv-sample': `SELECT TOP 10 SystemID, AssetNo, OEMSerial, ShortDesc FROM tbl_Inventory ORDER BY SystemID`,
  'all-tables': `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`,
  'remarks-distinct': `SELECT remarks, COUNT(*) AS n FROM tbl_DeliveryTicketLines GROUP BY remarks ORDER BY n DESC`,
  'reserved-dts': `SELECT d.jobNumber, d.dtNumber, d.deliveryDate, d.createdAt, d.createdBy, COUNT(*) AS lineCount
         FROM tbl_DeliveryTicketLines l
         JOIN tbl_DeliveryTickets d ON d.dtNumber = l.dtNumber
         WHERE l.remarks = 'Reserved in Checklist'
         GROUP BY d.jobNumber, d.dtNumber, d.deliveryDate, d.createdAt, d.createdBy
         ORDER BY d.createdAt DESC`,
  'emd-serial-sample': `SELECT TOP 15 serial, COUNT(*) AS n FROM tbl_DeliveryTicketLines
         WHERE serial LIKE 'EMD-%' GROUP BY serial ORDER BY n DESC`,
  'serial-formats': `SELECT
           SUM(CASE WHEN serial LIKE 'EMD-%' THEN 1 ELSE 0 END) AS emdFormat,
           SUM(CASE WHEN serial IS NULL OR serial = '' THEN 1 ELSE 0 END) AS blankOrNull,
           COUNT(*) AS total
         FROM tbl_DeliveryTicketLines`,
}

module.exports = async function (context, req) {
  if (req.query.probe) {
    const names = req.query.probe.split(',')
    const results = {}
    for (const name of names) {
      const sqlText = PROBES[name]
      if (!sqlText) { results[name] = 'UNKNOWN_PROBE'; continue }
      try {
        const r = await dbQuery(sqlText, [])
        results[name] = { ok: true, rowCount: r.recordset.length, sample: r.recordset[0] || null, rows: r.recordset.slice(0, 15) }
      } catch (e) {
        results[name] = { ok: false, error: e.message }
      }
    }
    context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(results, null, 2) }
    return
  }

  const defaultTables = [
    'tbl_Jobs', 'tbl_DeliveryTickets', 'tbl_DeliveryTicketLines',
    'tbl_ReceivingTickets', 'tbl_ReceivingTicketLines',
    'tbl_GatePasses', 'tbl_GatePass', 'tbl_GatePassItems', 'tbl_GatePassLines',
    'tbl_DailyFieldLogs', 'tbl_Clients', 'tbl_Inventory'
  ]
  const tables = (req.query.tables ? req.query.tables.split(',') : defaultTables)

  const results = {}
  for (const t of tables) {
    try {
      const r = await dbQuery(
        `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t ORDER BY ORDINAL_POSITION`,
        [{ name: 't', value: t }]
      )
      results[t] = r.recordset.length
        ? r.recordset.map(c => c.COLUMN_NAME + ':' + c.DATA_TYPE)
        : 'TABLE_NOT_FOUND'
    } catch (e) {
      results[t] = 'ERROR:' + e.message
    }
  }

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(results, null, 2)
  }
}
