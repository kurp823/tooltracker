'use strict'
const { query } = require('./db')
const { ensureListSeeds } = require('./list-seeds')

/** tbl_SubContractLines: what we pay a sub-contractor for one tool on one job. Created on first use. */
let ready = null
function ensureLines() {
  if (!ready) {
    ready = query(`
      IF OBJECT_ID('dbo.tbl_SubContractLines', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.tbl_SubContractLines (
          id           int IDENTITY(1,1) NOT NULL CONSTRAINT PK_tbl_SubContractLines PRIMARY KEY,
          jobId        nvarchar(64)  NOT NULL,
          toolSerial   nvarchar(100) NOT NULL,
          supplierName nvarchar(200) NULL,
          basis        nvarchar(30)  NOT NULL,
          qty          decimal(18,3) NOT NULL,
          rate         decimal(18,2) NOT NULL,
          amount       decimal(18,2) NOT NULL,
          currency     nvarchar(10)  NULL,
          notes        nvarchar(500) NULL,
          updatedBy    nvarchar(100) NULL,
          updatedAt    datetime      NULL CONSTRAINT DF_SCL_At DEFAULT (GETDATE()),
          CONSTRAINT UQ_tbl_SubContractLines UNIQUE (jobId, toolSerial)
        );
      END`, []).then(() => ensureListSeeds()).catch(e => { ready = null; throw e })
  }
  return ready
}


module.exports = { ensureLines }
