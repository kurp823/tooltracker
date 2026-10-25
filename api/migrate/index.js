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
