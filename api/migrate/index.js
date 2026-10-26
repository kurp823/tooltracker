'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

/**
 * POST /api/migrate  — create missing tables (Admin only, idempotent)
 *
 * tbl_JobTools and tbl_JobPersonnel were specified as "new tables needed" but
 * were never created in the live database, so the Job Dossier's Checklist and
 * Manpower/Crew tabs returned 500 on every request.
 *
 * Purely additive: each statement is guarded by an OBJECT_ID existence check,
 * so running it twice is a no-op and no existing table or row is touched.
 * Column shapes match exactly what api/jobs/index.js already reads and writes.
 */
const MIGRATIONS = [
  {
    name: 'tbl_JobTools',
    sql: `
      IF OBJECT_ID('dbo.tbl_JobTools', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.tbl_JobTools (
          JobToolID int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_tbl_JobTools PRIMARY KEY,
          JobID     nvarchar(50)  NOT NULL,
          SystemID  varchar(20)   NULL,
          Serial    nvarchar(100) NULL,
          AssetNo   nvarchar(50)  NULL,
          ShortDesc nvarchar(200) NULL,
          [Size]    nvarchar(50)  NULL,
          IsEmdad   bit           NULL,
          AddedDate datetime      NULL
            CONSTRAINT DF_tbl_JobTools_AddedDate DEFAULT (GETDATE()),
          AddedBy   nvarchar(100) NULL,
          Notes     nvarchar(500) NULL
        );
        CREATE INDEX IX_tbl_JobTools_JobID    ON dbo.tbl_JobTools (JobID);
        CREATE INDEX IX_tbl_JobTools_SystemID ON dbo.tbl_JobTools (SystemID);
      END`,
  },
  {
    name: 'tbl_JobPersonnel',
    sql: `
      IF OBJECT_ID('dbo.tbl_JobPersonnel', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.tbl_JobPersonnel (
          id        int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_tbl_JobPersonnel PRIMARY KEY,
          JobID     nvarchar(50)  NOT NULL,
          UserID    int           NULL,
          [Name]    nvarchar(200) NULL,
          [Role]    nvarchar(100) NULL,
          MobDate   date          NULL,
          DemobDate date          NULL,
          Notes     nvarchar(500) NULL
        );
        CREATE INDEX IX_tbl_JobPersonnel_JobID ON dbo.tbl_JobPersonnel (JobID);
      END`,
  },
  {
    name: 'tbl_VendorOrderLines',
    sql: `
      IF OBJECT_ID('dbo.tbl_VendorOrderLines', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.tbl_VendorOrderLines (
          id        int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_tbl_VendorOrderLines PRIMARY KEY,
          poNumber  nvarchar(50)  NOT NULL,
          [lineNo]  int           NULL,
          assetNo   nvarchar(50)  NULL,
          description nvarchar(500) NULL,
          [size]    nvarchar(50)  NULL,
          qty       decimal(18,2) NULL,
          unitPrice decimal(18,2) NULL,
          -- ASSET / INVENTORY lines become inventory on receipt; others do not.
          costCode  nvarchar(30)  NULL,
          requiresInspection bit  NULL CONSTRAINT DF_VOL_ReqInsp DEFAULT (0),
          receivedQty decimal(18,2) NULL CONSTRAINT DF_VOL_RecvQty DEFAULT (0),
          notes     nvarchar(500) NULL
        );
        CREATE INDEX IX_tbl_VendorOrderLines_poNumber ON dbo.tbl_VendorOrderLines (poNumber);
      END`,
  },
  {
    name: 'tbl_GRN',
    sql: `
      IF OBJECT_ID('dbo.tbl_GRN', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.tbl_GRN (
          id        int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_tbl_GRN PRIMARY KEY,
          grnNumber nvarchar(50)  NOT NULL,
          manualRef nvarchar(100) NULL,
          poNumber  nvarchar(50)  NULL,
          supplierCode nvarchar(50)  NULL,
          supplierName nvarchar(200) NULL,
          receiptDate  date          NULL,
          receivedBy   nvarchar(100) NULL,
          currency     nvarchar(10)  NULL,
          totalItemsReceived decimal(18,2) NULL,
          totalInwardValue   decimal(18,2) NULL,
          notes        nvarchar(1000) NULL,
          attachmentRef nvarchar(500) NULL,
          createdBy    nvarchar(100) NULL,
          createdAt    datetime      NULL CONSTRAINT DF_GRN_CreatedAt DEFAULT (GETDATE())
        );
        CREATE UNIQUE INDEX UX_tbl_GRN_grnNumber ON dbo.tbl_GRN (grnNumber);
        CREATE INDEX IX_tbl_GRN_poNumber ON dbo.tbl_GRN (poNumber);
      END`,
  },
  {
    name: 'tbl_GRNLines',
    sql: `
      IF OBJECT_ID('dbo.tbl_GRNLines', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.tbl_GRNLines (
          id        int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_tbl_GRNLines PRIMARY KEY,
          grnNumber nvarchar(50)  NOT NULL,
          poLineId  int           NULL,
          assetNo   nvarchar(50)  NULL,
          description nvarchar(500) NULL,
          [size]    nvarchar(50)  NULL,
          receivedQty decimal(18,2) NULL,
          unitPrice decimal(18,2) NULL,
          costCode  nvarchar(30)  NULL,
          requiresInspection bit  NULL CONSTRAINT DF_GRNL_ReqInsp DEFAULT (0),
          inventoryCreated   bit  NULL CONSTRAINT DF_GRNL_InvCreated DEFAULT (0),
          notes     nvarchar(500) NULL
        );
        CREATE INDEX IX_tbl_GRNLines_grnNumber ON dbo.tbl_GRNLines (grnNumber);
      END`,
  },
  {
    name: 'tbl_SubRentalInward',
    sql: `
      IF OBJECT_ID('dbo.tbl_SubRentalInward', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.tbl_SubRentalInward (
          id           int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_tbl_SubRentalInward PRIMARY KEY,
          inwardNumber nvarchar(50)  NULL,
          supplierCode nvarchar(50)  NULL,
          supplierName nvarchar(200) NULL,
          manifestRef  nvarchar(100) NULL,
          inwardDate   date          NULL,
          assetNo      nvarchar(50)  NULL,
          description  nvarchar(500) NULL,
          [size]       nvarchar(50)  NULL,
          qty          decimal(18,2) NULL,
          currency     nvarchar(10)  NULL,
          -- Agreed hire rates for this supplier's tool. These are the rate
          -- source for sub-contract equipment, the counterpart to the
          -- contract rate card used for EMDAD-owned tools.
          standbyRate   decimal(18,2) NULL,
          operatingRate decimal(18,2) NULL,
          runCharge     decimal(18,2) NULL,
          redress       decimal(18,2) NULL,
          monthlyCharge decimal(18,2) NULL,
          location     nvarchar(50)  NULL,
          status       nvarchar(30)  NULL,
          notes        nvarchar(500) NULL,
          createdBy    nvarchar(100) NULL,
          createdAt    datetime      NULL CONSTRAINT DF_SRI_CreatedAt DEFAULT (GETDATE())
        );
        CREATE INDEX IX_tbl_SubRentalInward_supplier ON dbo.tbl_SubRentalInward (supplierCode);
        CREATE INDEX IX_tbl_SubRentalInward_assetNo  ON dbo.tbl_SubRentalInward (assetNo);
      END`,
  },
  {
    name: 'seed:tbl_ToolSizes',
    sql: `
      -- One-time backfill. From here on the size master is the source and
      -- inventory receives its size from it via PO/GRN and rental intake,
      -- not the other way round. Only runs while the master is empty.
      IF NOT EXISTS (SELECT 1 FROM dbo.tbl_ToolSizes)
      BEGIN
        IF COLUMNPROPERTY(OBJECT_ID('dbo.tbl_ToolSizes'), 'SizeID', 'IsIdentity') = 1
          INSERT INTO dbo.tbl_ToolSizes (SizeLabel, InInventory, ActiveFlag, SortOrder)
          SELECT s.lbl, 1, 1, ROW_NUMBER() OVER (ORDER BY s.lbl)
          FROM (SELECT DISTINCT LTRIM(RTRIM(i.[Size])) AS lbl
                  FROM dbo.tbl_Inventory i
                 WHERE NULLIF(LTRIM(RTRIM(i.[Size])), '') IS NOT NULL) s;
        ELSE
          INSERT INTO dbo.tbl_ToolSizes (SizeID, SizeLabel, InInventory, ActiveFlag, SortOrder)
          SELECT ROW_NUMBER() OVER (ORDER BY s.lbl), s.lbl, 1, 1,
                 ROW_NUMBER() OVER (ORDER BY s.lbl)
          FROM (SELECT DISTINCT LTRIM(RTRIM(i.[Size])) AS lbl
                  FROM dbo.tbl_Inventory i
                 WHERE NULLIF(LTRIM(RTRIM(i.[Size])), '') IS NOT NULL) s;
      END`,
  },
  {
    name: 'seed:tbl_Suppliers',
    sql: `
      -- Promote the suppliers already present on inventory (Ownership) into
      -- the supplier master, skipping any that are already registered.
      INSERT INTO dbo.tbl_Suppliers (supplierCode, supplierName, supplierType, active, createdBy, createdAt)
      SELECT REPLACE(REPLACE(UPPER(s.nm), ' ', '-'), '.', ''), s.nm,
             CASE WHEN UPPER(s.nm) = 'EMDAD' THEN 'Internal' ELSE 'Rental Vendor' END,
             1, 'migrate', GETDATE()
      FROM (SELECT DISTINCT LTRIM(RTRIM(i.Ownership)) AS nm
              FROM dbo.tbl_Inventory i
             WHERE NULLIF(LTRIM(RTRIM(i.Ownership)), '') IS NOT NULL) s
      WHERE NOT EXISTS (
        SELECT 1 FROM dbo.tbl_Suppliers x
         WHERE UPPER(LTRIM(RTRIM(x.supplierName))) = UPPER(s.nm)
      )`,
  },
]

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (user.Role !== 'Admin') {
    return jsonResponse(context, 403, { error: 'Admin only' })
  }
  if (req.method.toUpperCase() !== 'POST') {
    return jsonResponse(context, 405, { error: 'Method not allowed' })
  }

  const results = {}
  for (const m of MIGRATIONS) {
    try {
      // Data seeds are idempotent by their own guards and create no object,
      // so the table-existence check below does not apply to them.
      if (m.name.startsWith('seed:')) {
        await query(m.sql)
        results[m.name] = 'applied'
        continue
      }

      const before = await query(
        `SELECT CASE WHEN OBJECT_ID('dbo.${m.name}', 'U') IS NULL THEN 0 ELSE 1 END AS present`
      )
      const existed = before.recordset[0].present === 1

      if (existed) {
        results[m.name] = 'already existed — no change'
        continue
      }

      await query(m.sql)

      const after = await query(
        `SELECT CASE WHEN OBJECT_ID('dbo.${m.name}', 'U') IS NULL THEN 0 ELSE 1 END AS present`
      )
      results[m.name] = after.recordset[0].present === 1 ? 'created' : 'FAILED — still missing'
    } catch (err) {
      context.log.error(`Migration ${m.name} failed:`, err)
      results[m.name] = `error: ${err.message}`
    }
  }

  return jsonResponse(context, 200, { results })
}
