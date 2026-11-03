'use strict'
const { query } = require('./db')

/**
 * Dropdown lists the app needs, created in tbl_Lists the first time they are
 * asked for. A list is only seeded while it has no rows at all, so anything an
 * Admin later renames, hides or adds in Settings → Lists is never put back.
 */
const SEEDS = {
  BillingStatus: ['Draft', 'In Billing', 'Draft Invoiced', 'SES Submitted',
                  'Draft Invoice Under Approval', 'Final Invoiced', 'On Hold'],
  CrewDesignation: ['Supervisor', 'Tool Pusher', 'Fishing Supervisor', 'Operator',
                    'Technician', 'Rigger', 'Workshop Coordinator', 'Engineer'],
}

let ready = null
function ensureListSeeds() {
  if (!ready) {
    ready = (async () => {
      for (const [name, values] of Object.entries(SEEDS)) {
        await query(
          `IF NOT EXISTS (SELECT 1 FROM dbo.tbl_Lists WHERE ListName = @n)
           BEGIN
             DECLARE @v TABLE (Value varchar(60), SortOrder int);
             INSERT INTO @v VALUES ${values.map((v, i) => `('${v.replace(/'/g, "''")}',${i + 1})`).join(',')};
             INSERT INTO dbo.tbl_Lists (ListName, Value, Label, SortOrder, ActiveFlag, IsSystem, UpdatedAt, UpdatedBy)
             SELECT @n, v.Value, v.Value, v.SortOrder, 1, 0, GETDATE(), 'system' FROM @v v;
           END`,
          [{ name: 'n', value: name }])
      }
    })().catch(e => { ready = null; throw e })
  }
  return ready
}

module.exports = { ensureListSeeds }
