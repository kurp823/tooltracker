/**
 * GET /api/health?tables=tbl_Jobs,tbl_GatePasses,tbl_DailyFieldLogs
 * Returns real column names for the requested tables (or a default set).
 * TEMPORARY — remove after schema audit.
 */
const { query: dbQuery } = require('../db')

module.exports = async function (context, req) {
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
