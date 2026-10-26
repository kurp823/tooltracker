'use strict'
const { query, jsonResponse, requireAuth, jobKey } = require('../db')

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
  {
    name: 'seed:inventory-lookup-indexes',
    sql: `
      -- Ticket lines reference a tool by SystemID, AssetNo or OEMSerial.
      -- Only SystemID (the key) was indexed, so resolving a line by the other
      -- two scanned the whole table for every row. These make the lookup
      -- index-seekable.
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tbl_Inventory_AssetNo'
                       AND object_id = OBJECT_ID('dbo.tbl_Inventory'))
        CREATE INDEX IX_tbl_Inventory_AssetNo ON dbo.tbl_Inventory (AssetNo);

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tbl_Inventory_OEMSerial'
                       AND object_id = OBJECT_ID('dbo.tbl_Inventory'))
        CREATE INDEX IX_tbl_Inventory_OEMSerial ON dbo.tbl_Inventory (OEMSerial);

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tbl_DTL_serial'
                       AND object_id = OBJECT_ID('dbo.tbl_DeliveryTicketLines'))
        CREATE INDEX IX_tbl_DTL_serial ON dbo.tbl_DeliveryTicketLines (serial);

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tbl_RTL_serial'
                       AND object_id = OBJECT_ID('dbo.tbl_ReceivingTicketLines'))
        CREATE INDEX IX_tbl_RTL_serial ON dbo.tbl_ReceivingTicketLines (serial);

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tbl_DFL_tool_dt'
                       AND object_id = OBJECT_ID('dbo.tbl_DailyFieldLogs'))
        CREATE INDEX IX_tbl_DFL_tool_dt ON dbo.tbl_DailyFieldLogs (ToolSerial, DTNumber);`,
  },

  /*
   * One-off data migration: pull the off-pattern tickets back into the single
   * DT-NNNNN / RT-NNNNN series.
   *
   * Two numbering schemes were in use. The historic series is DT-NNNNN /
   * RT-NNNNN, and a handful of tickets were created as DT-26-NNNN(N) /
   * RT-26-NNNNN before the generator was fixed — inconsistent even among
   * themselves (DT-26-3425 four digits, DT-26-03433 five).
   *
   * DELIBERATELY LEFT ALONE:
   *   DT-DUMMY-* / RT-DUMMY-* (305 each)  — placeholders, confirmed to stay
   *   RT-CLOSE-001..007                   — intentional closers for legacy jobs
   * Neither matches the patterns below: 'DUMMY' and 'CLOSE' are not digits.
   *
   * A ticket number is the join key for its line table, for
   * tbl_ReceivingTickets.linkedDtNumber and for tbl_DailyFieldLogs.DTNumber,
   * so the header and every referencing row move together inside one
   * transaction. Tickets with no lines at all are removed rather than given a
   * number from the real series — nothing references them.
   *
   * Idempotent: once no 'XX-NN-' numbers remain, every statement is a no-op.
   */
  {
    name: 'seed:renumber-stray-tickets',
    sql: `
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;

      ----------------------------------------------------------------- DT ---
      -- Empty strays first, so they don't consume numbers in the real series.
      DELETE FROM tbl_DeliveryTickets
       WHERE (dtNumber LIKE 'DT-[0-9][0-9]-%' OR dtNumber LIKE '%TEST%')
         AND NOT EXISTS (SELECT 1 FROM tbl_DeliveryTicketLines l WHERE l.dtNumber = tbl_DeliveryTickets.dtNumber)
         AND NOT EXISTS (SELECT 1 FROM tbl_ReceivingTickets r WHERE r.linkedDtNumber = tbl_DeliveryTickets.dtNumber)
         AND NOT EXISTS (SELECT 1 FROM tbl_DailyFieldLogs d WHERE d.DTNumber = tbl_DeliveryTickets.dtNumber);

      DECLARE @dtMax INT = COALESCE((
        SELECT MAX(TRY_CAST(SUBSTRING(dtNumber, 4, 10) AS INT))
          FROM tbl_DeliveryTickets
         WHERE dtNumber LIKE 'DT-[0-9][0-9][0-9][0-9][0-9]'), 0);

      -- Oldest first, so the new numbers run in the order the tickets happened.
      DECLARE @dtMap TABLE (oldNo NVARCHAR(50) PRIMARY KEY, newNo NVARCHAR(50) NOT NULL);
      INSERT INTO @dtMap (oldNo, newNo)
      SELECT dtNumber,
             'DT-' + RIGHT('00000' + CAST(@dtMax + ROW_NUMBER() OVER (ORDER BY deliveryDate, dtNumber) AS VARCHAR(10)), 5)
        FROM tbl_DeliveryTickets
       WHERE dtNumber LIKE 'DT-[0-9][0-9]-%';

      UPDATE l SET l.dtNumber = m.newNo
        FROM tbl_DeliveryTicketLines l JOIN @dtMap m ON m.oldNo = l.dtNumber;
      UPDATE d SET d.DTNumber = m.newNo
        FROM tbl_DailyFieldLogs d JOIN @dtMap m ON m.oldNo = d.DTNumber;
      UPDATE r SET r.linkedDtNumber = m.newNo
        FROM tbl_ReceivingTickets r JOIN @dtMap m ON m.oldNo = r.linkedDtNumber;
      UPDATE t SET t.dtNumber = m.newNo
        FROM tbl_DeliveryTickets t JOIN @dtMap m ON m.oldNo = t.dtNumber;

      ----------------------------------------------------------------- RT ---
      DELETE FROM tbl_ReceivingTickets
       WHERE (rtNumber LIKE 'RT-[0-9][0-9]-%' OR rtNumber LIKE '%TEST%')
         AND NOT EXISTS (SELECT 1 FROM tbl_ReceivingTicketLines l WHERE l.rtNumber = tbl_ReceivingTickets.rtNumber);

      DECLARE @rtMax INT = COALESCE((
        SELECT MAX(TRY_CAST(SUBSTRING(rtNumber, 4, 10) AS INT))
          FROM tbl_ReceivingTickets
         WHERE rtNumber LIKE 'RT-[0-9][0-9][0-9][0-9][0-9]'), 0);

      DECLARE @rtMap TABLE (oldNo NVARCHAR(50) PRIMARY KEY, newNo NVARCHAR(50) NOT NULL);
      INSERT INTO @rtMap (oldNo, newNo)
      SELECT rtNumber,
             'RT-' + RIGHT('00000' + CAST(@rtMax + ROW_NUMBER() OVER (ORDER BY receivingDate, rtNumber) AS VARCHAR(10)), 5)
        FROM tbl_ReceivingTickets
       WHERE rtNumber LIKE 'RT-[0-9][0-9]-%';

      UPDATE l SET l.rtNumber = m.newNo
        FROM tbl_ReceivingTicketLines l JOIN @rtMap m ON m.oldNo = l.rtNumber;
      UPDATE t SET t.rtNumber = m.newNo
        FROM tbl_ReceivingTickets t JOIN @rtMap m ON m.oldNo = t.rtNumber;

      COMMIT TRANSACTION;`,
  },

  /*
   * One-off data repair: remove the duplicate ticket lines that were confirmed
   * to carry no information, keeping the earliest row of each group.
   *
   * tbl_ReceivingTicketLines held 58,392 rows against tbl_DeliveryTicketLines'
   * 47,106 — impossible, since nothing can be received that was never
   * dispatched. Measured cause: 20,460 duplicate rows, weighted three and a
   * half times more heavily on the receiving side.
   *
   * ONLY these two cases are removed:
   *   - every row in the group agrees on all meaningful columns
   *   - the rows agree on everything except `remarks`, and remarks is only
   *     ever blank or a literal copy of usedStatus (an import artefact that
   *     wrote the usage string into a second column)
   *
   * DELIBERATELY NOT TOUCHED: 256 groups / 620 rows that differ on quantity,
   * usage, condition, routing or description. Those may be real separate
   * entries and are left for a human to judge.
   *
   * Keeps MIN(id), which also preserves the lower itemNo so the original
   * 1..N sequence survives. Idempotent: once each group holds one row the
   * HAVING COUNT(*) > 1 guard matches nothing.
   */
  {
    /*
     * The grouping that both the diagnostics and the de-duplication do is
     * (ticket, serial); without an index that is a full scan of 58,000 and
     * 47,000 rows on every call.
     */
    name: 'seed:ticket-line-group-indexes',
    sql: `
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RTLines_rtNumber_serial')
        CREATE INDEX IX_RTLines_rtNumber_serial
          ON dbo.tbl_ReceivingTicketLines (rtNumber, serial) INCLUDE (id, qty, usedStatus);
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DTLines_dtNumber_serial')
        CREATE INDEX IX_DTLines_dtNumber_serial
          ON dbo.tbl_DeliveryTicketLines (dtNumber, serial) INCLUDE (id, qty);`,
  },
  {
    /*
     * Mark equipment that is physically on a rig.
     *
     * Nothing ever wrote tbl_Inventory.Status for historic tickets, so a tool
     * dispatched to a rig on a live job still reads 'Good' and the tool picker
     * will happily offer it to a second job. This closes that gap for the
     * existing data; the dispatch endpoint already does it for new tickets.
     *
     * Scope is deliberately narrow:
     *   - Live jobs only. Equipment outstanding on a CLOSED job is missing
     *     paperwork, not kit on a rig — the job would not have been closed
     *     with the tools still out. Marking those 'On Rig' would strand them
     *     out of the picker.
     *   - 'Good' rows only. DBR, Inspection, Maintenance and Lost in Hole
     *     each belong to another workflow and are left exactly as they are.
     *
     * Idempotent: a second run matches nothing, because the rows it changed
     * no longer read 'Good'.
     */
    name: 'seed:backfill-on-rig',
    sql: `
      WITH live AS (
        SELECT ${jobKey('JobID')} AS jobKey
          FROM tbl_Jobs
         WHERE Status IN ('Ongoing', 'Draft Invoice Submitted', 'Open', 'Waiting on Signed Docs')
      ),
      dt AS (
        SELECT ${jobKey('t.jobNumber')} AS jobKey,
               l.serial, t.rig, t.deliveryDate
          FROM tbl_DeliveryTicketLines l
          JOIN tbl_DeliveryTickets t ON t.dtNumber = l.dtNumber
         WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
      ),
      rt AS (
        SELECT DISTINCT
               ${jobKey('t.jobNumber')} AS jobKey,
               l.serial
          FROM tbl_ReceivingTicketLines l
          JOIN tbl_ReceivingTickets t ON t.rtNumber = l.rtNumber
         WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
      ),
      outstanding AS (
        SELECT dt.serial, dt.rig,
               ROW_NUMBER() OVER (PARTITION BY dt.serial
                                      ORDER BY dt.deliveryDate DESC) AS rn
          FROM dt
         WHERE dt.jobKey IN (SELECT jobKey FROM live WHERE NULLIF(jobKey, '') IS NOT NULL)
           AND NOT EXISTS (SELECT 1 FROM rt
                            WHERE rt.jobKey = dt.jobKey AND rt.serial = dt.serial)
      ),
      latest AS (
        -- One row per asset. A serial outstanding on more than one live job is
        -- wherever its most recent dispatch sent it.
        SELECT serial, rig FROM outstanding WHERE rn = 1
      )
      UPDATE i
         SET Status   = 'On Rig',
             Location = COALESCE(l.rig, i.Location)
        FROM tbl_Inventory i
        JOIN latest l ON i.SystemID = l.serial OR i.AssetNo = l.serial
       WHERE i.Status = 'Good';`,
  },
  {
    /*
     * Remove delivery tickets carrying the wrong rig or well.
     *
     * The job list is the authority. A job that is Completed and carries a
     * legal invoice number has a settled rig and well; a delivery ticket on
     * that job showing a different rig or well is wrong data. Checked against
     * every job in the table first: no job anywhere has the rig/well these
     * tickets claim, so there is nothing to re-attach them to.
     *
     * Compared loosely - ignoring case, spaces, dashes, brackets and dots -
     * so AD-137(JORDAN) and AD 137 count as the same rig and only a genuine
     * difference is removed. 2,656 of 2,669 such tickets match and are
     * untouched.
     *
     * DUMMY tickets are deliberately excluded: those are a deliberate
     * convention for closing old jobs, not data to clean up.
     *
     * Idempotent: once removed the rows no longer match.
     */
    name: 'seed:remove-wrong-rigwell-tickets',
    sql: `
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;

      WITH jobs AS (
        SELECT JobID, Rig, Well, Status, LegalInvoiceNumber,
               ${jobKey('JobID')} AS jobKey
          FROM tbl_Jobs
         WHERE Status = 'Completed'
           AND NULLIF(LTRIM(RTRIM(LegalInvoiceNumber)), '') IS NOT NULL
      ),
      dt AS (
        SELECT t.dtNumber, t.rig, t.well, ${jobKey('t.jobNumber')} AS jobKey
          FROM tbl_DeliveryTickets t
         WHERE t.dtNumber NOT LIKE 'DT-DUMMY%'
           AND t.dtNumber NOT LIKE 'DUMMY%'
      )
      SELECT d.dtNumber
        INTO #wrongRigWell
        FROM dt d
        JOIN jobs j ON j.jobKey = d.jobKey
       WHERE UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(j.Rig)), ''),' ',''),'-',''),'(',''),')',''),'.','')) <> UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(d.rig)), ''),' ',''),'-',''),'(',''),')',''),'.',''))
          OR UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(j.Well)), ''),' ',''),'-',''),'(',''),')',''),'.','')) <> UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(d.well)), ''),' ',''),'-',''),'(',''),')',''),'.',''));

      DELETE FROM tbl_DeliveryTicketLines
       WHERE dtNumber IN (SELECT dtNumber FROM #wrongRigWell);

      DELETE FROM tbl_DeliveryTickets
       WHERE dtNumber IN (SELECT dtNumber FROM #wrongRigWell);

      DROP TABLE #wrongRigWell;

      COMMIT;`,
  },
  {
    /*
     * Staging table for a corrected DT/RT sheet.
     *
     * The sheet is the operator's own reconciliation: one row per dispatched
     * tool, carrying the return ticket if it came back. It lands here first so
     * it can be counted and compared against the live tables before anything
     * is written, and so a bad import can be cleared and redone.
     *
     * Text columns throughout - the sheet is whatever Excel produced, and
     * coercing dates or numbers on the way in would lose the rows that need
     * looking at most.
     */
    name: 'seed:import-dtrt-staging',
    sql: `
      IF OBJECT_ID('dbo.tbl_ImportDTRT', 'U') IS NULL
      CREATE TABLE dbo.tbl_ImportDTRT (
        id         INT IDENTITY(1,1) PRIMARY KEY,
        batchId    NVARCHAR(40)   NOT NULL,
        rowNo      INT            NULL,
        jobNum     NVARCHAR(60)   NULL,
        dtNo       NVARCHAR(60)   NULL,
        dtDate     NVARCHAR(40)   NULL,
        sNo        NVARCHAR(20)   NULL,
        partNum    NVARCHAR(120)  NULL,
        partDesc   NVARCHAR(400)  NULL,
        rtNo       NVARCHAR(60)   NULL,
        rtDate     NVARCHAR(40)   NULL,
        remark     NVARCHAR(120)  NULL,
        rig        NVARCHAR(120)  NULL,
        well       NVARCHAR(120)  NULL,
        uploadedAt DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        uploadedBy NVARCHAR(100)  NULL
      );

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ImportDTRT_batch')
        CREATE INDEX IX_ImportDTRT_batch ON dbo.tbl_ImportDTRT (batchId)
          INCLUDE (dtNo, partNum, rtNo);
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ImportDTRT_dtpart')
        CREATE INDEX IX_ImportDTRT_dtpart ON dbo.tbl_ImportDTRT (dtNo, partNum);`,
  },
  {
    /*
     * A normalised, de-duplicated projection of a staged import batch.
     *
     * Every check the preview runs needs the same three things: the job key,
     * the row de-duplicated, and the sheet's AssetNo resolved to the inventory
     * SystemID that ticket lines actually store. Computing those inside each
     * check meant five passes over 46,000 rows with expressions no index could
     * serve, and the preview passed the 45-second function cap.
     *
     * Built once per batch, indexed, and every check then reads from here.
     */
    name: 'seed:import-dtrt-resolved',
    sql: `
      IF OBJECT_ID('dbo.tbl_ImportDTRTResolved', 'U') IS NULL
      CREATE TABLE dbo.tbl_ImportDTRTResolved (
        id        INT IDENTITY(1,1) PRIMARY KEY,
        batchId   NVARCHAR(40)  NOT NULL,
        jobKey    NVARCHAR(80)  NULL,
        jobNum    NVARCHAR(60)  NULL,
        dtNo      NVARCHAR(60)  NULL,
        partNum   NVARCHAR(120) NULL,
        rtNo      NVARCHAR(60)  NULL,
        rig       NVARCHAR(120) NULL,
        well      NVARCHAR(120) NULL,
        remark    NVARCHAR(120) NULL,
        systemId  NVARCHAR(120) NULL,
        rtKind    TINYINT       NOT NULL   -- 0 none, 1 real, 2 dummy
      );

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ImpRes_batch')
        CREATE INDEX IX_ImpRes_batch ON dbo.tbl_ImportDTRTResolved (batchId)
          INCLUDE (jobKey, dtNo, partNum, rtNo, systemId, rtKind);
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ImpRes_dtpart')
        CREATE INDEX IX_ImpRes_dtpart ON dbo.tbl_ImportDTRTResolved (batchId, dtNo, partNum);
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ImpRes_rtpart')
        CREATE INDEX IX_ImpRes_rtpart ON dbo.tbl_ImportDTRTResolved (batchId, rtNo, partNum);
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ImpRes_jobpart')
        CREATE INDEX IX_ImpRes_jobpart ON dbo.tbl_ImportDTRTResolved (batchId, jobKey, systemId);

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Inventory_AssetNo')
        CREATE INDEX IX_Inventory_AssetNo ON dbo.tbl_Inventory (AssetNo) INCLUDE (SystemID);`,
  },
  {
    name: 'seed:dedupe-ticket-lines',
    sql: `
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;

      ----------------------------------------------- receiving ticket lines ---
      WITH g AS (
        SELECT rtNumber, serial,
               COUNT(DISTINCT CAST(CONCAT(
                 LEFT(COALESCE(CAST(toolDescription AS NVARCHAR(4000)), '~'), 150), '|',
                 COALESCE(CAST(qty AS NVARCHAR(20)), '~'), '|',
                 COALESCE(usedStatus, '~'), '|',
                 LEFT(COALESCE(CAST(condition AS NVARCHAR(4000)), '~'), 80), '|',
                 COALESCE(routedTo, '~')
               ) AS NVARCHAR(500))) AS shapesIgnoringRemarks,
               COUNT(DISTINCT LEFT(COALESCE(CAST(remarks AS NVARCHAR(4000)), '~'), 150)) AS remarkVariants,
               SUM(CASE
                     WHEN NULLIF(LTRIM(RTRIM(CAST(remarks AS NVARCHAR(4000)))), '') IS NULL
                       OR LTRIM(RTRIM(CAST(remarks AS NVARCHAR(4000)))) = LTRIM(RTRIM(COALESCE(usedStatus, '')))
                     THEN 0 ELSE 1 END) AS rowsWithRealRemarks
          FROM tbl_ReceivingTicketLines
         WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
         GROUP BY rtNumber, serial
        HAVING COUNT(*) > 1
      ),
      safe AS (
        SELECT rtNumber, serial FROM g
         WHERE shapesIgnoringRemarks = 1
           AND (remarkVariants = 1 OR rowsWithRealRemarks = 0)
      ),
      ranked AS (
        -- EXISTS rather than JOIN: a CTE that joins another table is not
        -- updatable ("the modification affects multiple base tables"), so the
        -- row source has to resolve to tbl_ReceivingTicketLines alone.
        SELECT l.id,
               ROW_NUMBER() OVER (PARTITION BY l.rtNumber, l.serial ORDER BY l.id) AS rn
          FROM tbl_ReceivingTicketLines l
         WHERE EXISTS (SELECT 1 FROM safe s
                        WHERE s.rtNumber = l.rtNumber AND s.serial = l.serial)
      )
      -- Delete by id from the base table. One pass; the earlier
      -- NOT IN (SELECT keepId FROM keepers) re-evaluated the keeper set per
      -- row and was killed at 15s over 58,000 rows.
      DELETE FROM tbl_ReceivingTicketLines
       WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

      ------------------------------------------------ delivery ticket lines ---
      WITH gd AS (
        SELECT dtNumber, serial
          FROM tbl_DeliveryTicketLines
         WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
         GROUP BY dtNumber, serial
        HAVING COUNT(*) > 1
           AND COUNT(DISTINCT CAST(CONCAT(
                 LEFT(COALESCE(CAST(toolDescription AS NVARCHAR(4000)), '~'), 150), '|',
                 COALESCE(CAST(qty AS NVARCHAR(20)), '~'), '|',
                 LEFT(COALESCE(CAST(remarks AS NVARCHAR(4000)), '~'), 150)
               ) AS NVARCHAR(500))) = 1
      ),
      rankedD AS (
        SELECT l.id,
               ROW_NUMBER() OVER (PARTITION BY l.dtNumber, l.serial ORDER BY l.id) AS rn
          FROM tbl_DeliveryTicketLines l
         WHERE EXISTS (SELECT 1 FROM gd
                        WHERE gd.dtNumber = l.dtNumber AND gd.serial = l.serial)
      )
      DELETE FROM tbl_DeliveryTicketLines
       WHERE id IN (SELECT id FROM rankedD WHERE rn > 1);

      COMMIT TRANSACTION;`,
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
