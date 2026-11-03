'use strict'
const { query } = require('./db')

/**
 * Billing status of a job, set by the billing team from the Invoicing screen
 * and shown on Drilling Jobs.
 *
 * The choices live in tbl_Lists (ListName 'BillingStatus', editable in
 * Settings → Lists) and are seeded once, below. The chosen value is kept on
 * tbl_Jobs.BillingStatus together with who set it and when.
 *
 * Jobs billed before this existed have no BillingStatus; their status is
 * worked out from the lifecycle dates already on the job (BILLING_STATUS_SQL),
 * so nothing reads blank.
 */

let ready = null
function ensureBillingStatus() {
  if (!ready) {
    ready = query(`
      IF COL_LENGTH('dbo.tbl_Jobs','BillingStatus') IS NULL
        ALTER TABLE dbo.tbl_Jobs ADD BillingStatus varchar(60) NULL;
      IF COL_LENGTH('dbo.tbl_Jobs','BillingStatusAt') IS NULL
        ALTER TABLE dbo.tbl_Jobs ADD BillingStatusAt datetime NULL;
      IF COL_LENGTH('dbo.tbl_Jobs','BillingStatusBy') IS NULL
        ALTER TABLE dbo.tbl_Jobs ADD BillingStatusBy varchar(100) NULL;`, [])
      .then(() => require('./list-seeds').ensureListSeeds())
      .catch(e => { ready = null; throw e })
  }
  return ready
}

/** Stored status, else the one the job's lifecycle dates imply. `a` = tbl_Jobs alias. */
const billingStatusSql = (a = 'j') => `COALESCE(NULLIF(${a}.BillingStatus, ''),
  CASE
    WHEN ${a}.FinalInvoicedDate IS NOT NULL OR NULLIF(${a}.LegalInvoiceNumber, '') IS NOT NULL THEN 'Final Invoiced'
    WHEN ${a}.SesSubmittedDate IS NOT NULL OR NULLIF(${a}.SesNumber, '') IS NOT NULL          THEN 'SES Submitted'
    WHEN ${a}.DraftInvoicedDate IS NOT NULL OR NULLIF(${a}.DraftInvoiceNumber, '') IS NOT NULL THEN 'Draft Invoiced'
    WHEN ${a}.SubmittedToBillingDate IS NOT NULL                                              THEN 'In Billing'
  END)`

/**
 * Save a job's billing status. Choosing SES Submitted / Final Invoiced also
 * stamps the matching date on the job the first time, so those dates come from
 * the billing team's action instead of being typed.
 */
async function setBillingStatus(jobId, status, who) {
  await ensureBillingStatus()
  await query(
    `UPDATE tbl_Jobs
        SET BillingStatus = @s, BillingStatusAt = GETDATE(), BillingStatusBy = @who,
            SesSubmittedDate = CASE WHEN @s = 'SES Submitted' AND SesSubmittedDate IS NULL
                                    THEN GETDATE() ELSE SesSubmittedDate END,
            FinalInvoicedDate = CASE WHEN @s = 'Final Invoiced' AND FinalInvoicedDate IS NULL
                                     THEN GETDATE() ELSE FinalInvoicedDate END,
            UpdatedAt = GETDATE()
      WHERE JobID = @j`,
    [{ name: 's', value: status }, { name: 'who', value: who || null }, { name: 'j', value: jobId }]
  )
}

module.exports = { ensureBillingStatus, billingStatusSql, setBillingStatus }
