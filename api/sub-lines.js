'use strict'
const { query } = require('./db')
const { ensureListSeeds } = require('./list-seeds')

/**
 * Sub-contractor pricing, in two tables created on first use:
 *
 *   tbl_SubContractRates  the supplier's rate sheet - what a supplier charges
 *                         for a category and size, by day / month / lump sum,
 *                         for every contract or for one. The counterpart of
 *                         the client contract rate card.
 *   tbl_SubContractLines  what was agreed for one tool on one job. Only
 *                         needed when it differs from the sheet (a different
 *                         rate, or 8 days paid when 10 were billed).
 *
 * Nothing is stored for a tool that simply follows the sheet: its cost is
 * worked out when it is read, from the days marked and the sheet rate.
 */
let ready = null
function ensureLines() {
  if (!ready) {
    ready = query(`
      IF OBJECT_ID('dbo.tbl_SubContractRates', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.tbl_SubContractRates (
          id           int IDENTITY(1,1) NOT NULL CONSTRAINT PK_tbl_SubContractRates PRIMARY KEY,
          supplierName nvarchar(200) NOT NULL,
          category     nvarchar(200) NOT NULL,
          size         nvarchar(50)  NOT NULL CONSTRAINT DF_SCR_Size DEFAULT (''),
          contractCode nvarchar(100) NOT NULL CONSTRAINT DF_SCR_Contract DEFAULT (''),
          basis        nvarchar(30)  NOT NULL,
          rate         decimal(18,2) NOT NULL,
          currency     nvarchar(10)  NULL,
          notes        nvarchar(500) NULL,
          active       bit           NOT NULL CONSTRAINT DF_SCR_Active DEFAULT (1),
          updatedBy    nvarchar(100) NULL,
          updatedAt    datetime      NULL CONSTRAINT DF_SCR_At DEFAULT (GETDATE()),
          CONSTRAINT UQ_tbl_SubContractRates UNIQUE (supplierName, category, size, contractCode)
        );
      END;
      IF OBJECT_ID('dbo.tbl_SubContractLines', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.tbl_SubContractLines (
          id           int IDENTITY(1,1) NOT NULL CONSTRAINT PK_tbl_SubContractLines PRIMARY KEY,
          jobId        nvarchar(64)  NOT NULL,
          toolSerial   nvarchar(100) NOT NULL,
          supplierName nvarchar(200) NULL,
          basis        nvarchar(30)  NOT NULL,
          qty          decimal(18,3) NULL,
          rate         decimal(18,2) NOT NULL,
          amount       decimal(18,2) NULL,
          currency     nvarchar(10)  NULL,
          notes        nvarchar(500) NULL,
          updatedBy    nvarchar(100) NULL,
          updatedAt    datetime      NULL CONSTRAINT DF_SCL_At DEFAULT (GETDATE()),
          CONSTRAINT UQ_tbl_SubContractLines UNIQUE (jobId, toolSerial)
        );
      END;
      -- Quantity and amount are only stored when someone agreed something other
      -- than "the days billed"; blank means follow the days marked.
      ALTER TABLE dbo.tbl_SubContractLines ALTER COLUMN qty decimal(18,3) NULL;
      ALTER TABLE dbo.tbl_SubContractLines ALTER COLUMN amount decimal(18,2) NULL;`, [])
      .then(() => ensureListSeeds())
      .catch(e => { ready = null; throw e })
  }
  return ready
}

/** The real owner of a hired-in tool: Ownership unless blank/Rented/EMDAD, else Supplier unless EMDAD. `a` = tbl_Inventory alias. */
const ownerSql = (a = 'i') => `CASE
  WHEN NULLIF(LTRIM(RTRIM(${a}.Ownership)), '') IS NOT NULL AND UPPER(LTRIM(RTRIM(${a}.Ownership))) NOT IN ('RENTED','EMDAD') THEN LTRIM(RTRIM(${a}.Ownership))
  WHEN NULLIF(LTRIM(RTRIM(${a}.Supplier)), '')  IS NOT NULL AND UPPER(LTRIM(RTRIM(${a}.Supplier)))  <> 'EMDAD'            THEN LTRIM(RTRIM(${a}.Supplier))
  ELSE 'Unknown supplier' END`

/**
 * The sheet rate for a tool: same supplier, same category, the tool's size (or a row
 * for every size), and the job's contract (or a row for every contract). A row for
 * the specific contract / size wins over a general one.
 */
const sheetApply = (sup, cat, size, contract) => `OUTER APPLY (
  SELECT TOP 1 s.id AS sheetId, s.basis AS sheetBasis, s.rate AS sheetRate, s.currency AS sheetCurrency
    FROM tbl_SubContractRates s
   WHERE s.active = 1
     AND UPPER(s.supplierName) = UPPER(${sup})
     AND UPPER(s.category)     = UPPER(LTRIM(RTRIM(${cat})))
     AND (s.size = '' OR UPPER(s.size) = UPPER(LTRIM(RTRIM(${size}))))
     AND (s.contractCode = '' OR UPPER(s.contractCode) = UPPER(LTRIM(RTRIM(${contract}))))
   ORDER BY CASE WHEN s.contractCode <> '' THEN 0 ELSE 1 END, CASE WHEN s.size <> '' THEN 0 ELSE 1 END, s.id
) sh`

/**
 * What we pay for one tool on one job. Needs: l (settlement line), sh (sheetApply),
 * and a days column. A saved line wins over the sheet; its quantity, when blank,
 * follows the days marked (months = days / 30 for a monthly rate).
 */
const amountSql = (days) => `CASE
  WHEN COALESCE(l.rate, sh.sheetRate) IS NULL THEN NULL
  WHEN COALESCE(l.basis, sh.sheetBasis) LIKE '%lump%'  THEN ROUND(COALESCE(l.rate, sh.sheetRate), 2)
  WHEN COALESCE(l.basis, sh.sheetBasis) LIKE '%month%' THEN ROUND(COALESCE(l.rate, sh.sheetRate) * COALESCE(l.qty, ${days} / 30.0), 2)
  ELSE ROUND(COALESCE(l.rate, sh.sheetRate) * COALESCE(l.qty, ${days}), 2) END`

module.exports = { ensureLines, ownerSql, sheetApply, amountSql }
