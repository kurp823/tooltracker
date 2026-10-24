const sql = require('mssql');

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    const connStr =
      process.env.SQLAZURECONNSTR_ToolTrackingDB ||
      process.env.SqlConnectionString ||
      process.env.SQL_CONNECTION_STRING ||
      process.env.AZURE_SQL_CONNECTION_STRING ||
      process.env.DATABASE_URL;

    if (!connStr) {
      throw new Error('Azure SQL connection string is missing from environment variables.');
    }

    poolPromise = sql.connect(connStr);
  }
  return poolPromise;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-functions-key',
};

function getParam(req, name) {
  const lower = name.toLowerCase();
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      if (key.toLowerCase() === lower && req.query[key] !== undefined && req.query[key] !== null) {
        return req.query[key];
      }
    }
  }
  let bodyObj = req.body;
  if (typeof bodyObj === 'string') {
    try {
      bodyObj = JSON.parse(bodyObj);
    } catch {}
  }
  if (bodyObj && typeof bodyObj === 'object') {
    for (const key of Object.keys(bodyObj)) {
      if (key.toLowerCase() === lower && bodyObj[key] !== undefined && bodyObj[key] !== null) {
        return bodyObj[key];
      }
    }
  }
  return undefined;
}

module.exports = async function (context, req) {
  // Handle CORS preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: CORS_HEADERS,
      body: '',
    };
    return;
  }

  const action = (
    (req.query && req.query.action) ||
    (req.body && req.body.action) ||
    ''
  ).toLowerCase();

  try {
    switch (action) {
      case 'ping': {
        context.res = {
          status: 200,
          headers: CORS_HEADERS,
          body: {
            success: true,
            message: 'pong',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }

      case 'getdashboardkpis': {
        const pool = await getPool();
        const result = await pool.request().query(`
          SELECT
              (SELECT COUNT(*) FROM tbl_Jobs WHERE Status = 'Ongoing') AS activeRigs,
              (SELECT COUNT(*) FROM tbl_Inventory WHERE Status = 'Dispatched') AS toolsOnRig,
              (SELECT COUNT(*) FROM tbl_DeliveryTickets WHERE clientSignedBy IS NULL OR clientSignedBy = '') AS pendingDTs,
              (SELECT COUNT(*) FROM tbl_ReceivingTickets WHERE clientSignedBy IS NULL OR clientSignedBy = '') AS pendingRTs;
        `);

        const row = result.recordset && result.recordset[0] ? result.recordset[0] : {};
        const data = {
          activeRigs: Number(row.activeRigs || 0),
          toolsOnRig: Number(row.toolsOnRig || 0),
          pendingDTs: Number(row.pendingDTs || 0),
          pendingRTs: Number(row.pendingRTs || 0),
        };

        context.res = {
          status: 200,
          headers: CORS_HEADERS,
          body: {
            success: true,
            data,
          },
        };
        return;
      }

      case 'getinventory': {
        const pool = await getPool();
        const pageParam = getParam(req, 'page');
        const limitParam = getParam(req, 'limit');
        const searchParam = getParam(req, 'search') || '';
        const search = typeof searchParam === 'string' ? searchParam.trim() : String(searchParam || '').trim();

        const hasPagination = pageParam !== undefined && pageParam !== null && String(pageParam).trim() !== '';

        if (!hasPagination) {
          const request = pool.request();
          let whereClause = '';
          if (search) {
            request.input('search', sql.NVarChar, search);
            whereClause = ` WHERE AssetNo LIKE '%' + @search + '%' OR ShortDesc LIKE '%' + @search + '%' OR Description LIKE '%' + @search + '%' OR OEMSerial LIKE '%' + @search + '%'`;
          }
          const result = await request.query(`SELECT * FROM tbl_Inventory${whereClause} ORDER BY SystemID ASC`);
          const rows = result.recordset || [];
          context.res = {
            status: 200,
            headers: CORS_HEADERS,
            body: {
              success: true,
              data: rows,
            },
          };
          return;
        }

        const page = Math.max(1, parseInt(String(pageParam), 10) || 1);
        const limit = Math.max(1, parseInt(String(limitParam || 50), 10) || 50);
        const offset = (page - 1) * limit;

        let whereClause = '';
        const countReq = pool.request();
        if (search) {
          countReq.input('search', sql.NVarChar, search);
          whereClause = ` WHERE AssetNo LIKE '%' + @search + '%' OR ShortDesc LIKE '%' + @search + '%' OR Description LIKE '%' + @search + '%' OR OEMSerial LIKE '%' + @search + '%'`;
        }
        const countRes = await countReq.query(`SELECT COUNT(*) AS total FROM tbl_Inventory${whereClause}`);
        const totalCount = Number(countRes.recordset && countRes.recordset[0] ? countRes.recordset[0].total : 0);

        const dataReq = pool.request();
        if (search) {
          dataReq.input('search', sql.NVarChar, search);
        }
        dataReq.input('offset', sql.Int, offset);
        dataReq.input('limit', sql.Int, limit);
        const dataRes = await dataReq.query(
          `SELECT * FROM tbl_Inventory${whereClause} ORDER BY SystemID ASC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
        );
        const rows = dataRes.recordset || [];

        context.res = {
          status: 200,
          headers: CORS_HEADERS,
          body: {
            success: true,
            data: rows,
            totalCount: totalCount,
            page: page,
            limit: limit,
          },
        };
        return;
      }

      case 'getjobs': {
        const pool = await getPool();
        const pageParam = getParam(req, 'page');
        const limitParam = getParam(req, 'limit');
        const searchParam = getParam(req, 'search') || '';
        const search = typeof searchParam === 'string' ? searchParam.trim() : String(searchParam || '').trim();

        const hasPagination = pageParam !== undefined && pageParam !== null && String(pageParam).trim() !== '';

        if (!hasPagination) {
          const request = pool.request();
          let whereClause = '';
          if (search) {
            request.input('search', sql.NVarChar, search);
            whereClause = ` WHERE JobID LIKE '%' + @search + '%' OR Rig LIKE '%' + @search + '%' OR Well LIKE '%' + @search + '%' OR Client LIKE '%' + @search + '%' OR Contract LIKE '%' + @search + '%'`;
          }
          const result = await request.query(`SELECT * FROM tbl_Jobs${whereClause} ORDER BY JobID DESC`);
          const rows = result.recordset || [];
          context.res = {
            status: 200,
            headers: CORS_HEADERS,
            body: {
              success: true,
              data: rows,
            },
          };
          return;
        }

        const page = Math.max(1, parseInt(String(pageParam), 10) || 1);
        const limit = Math.max(1, parseInt(String(limitParam || 50), 10) || 50);
        const offset = (page - 1) * limit;

        let whereClause = '';
        const countReq = pool.request();
        if (search) {
          countReq.input('search', sql.NVarChar, search);
          whereClause = ` WHERE JobID LIKE '%' + @search + '%' OR Rig LIKE '%' + @search + '%' OR Well LIKE '%' + @search + '%' OR Client LIKE '%' + @search + '%' OR Contract LIKE '%' + @search + '%'`;
        }
        const countRes = await countReq.query(`SELECT COUNT(*) AS total FROM tbl_Jobs${whereClause}`);
        const totalCount = Number(countRes.recordset && countRes.recordset[0] ? countRes.recordset[0].total : 0);

        const dataReq = pool.request();
        if (search) {
          dataReq.input('search', sql.NVarChar, search);
        }
        dataReq.input('offset', sql.Int, offset);
        dataReq.input('limit', sql.Int, limit);
        const dataRes = await dataReq.query(
          `SELECT * FROM tbl_Jobs${whereClause} ORDER BY JobID DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
        );
        const rows = dataRes.recordset || [];

        context.res = {
          status: 200,
          headers: CORS_HEADERS,
          body: {
            success: true,
            data: rows,
            totalCount: totalCount,
            page: page,
            limit: limit,
          },
        };
        return;
      }

      case 'getjobtools': {
        const pool = await getPool();
        const jobNumberParam = getParam(req, 'jobNumber') || getParam(req, 'jobId') || getParam(req, 'id') || '';
        const jobNumber = typeof jobNumberParam === 'string' ? jobNumberParam.trim() : String(jobNumberParam || '').trim();

        if (!jobNumber) {
          context.res = {
            status: 400,
            headers: CORS_HEADERS,
            body: {
              success: false,
              error: 'jobNumber parameter is required.',
            },
          };
          return;
        }

        // 1. Query tbl_DeliveryTickets and join tbl_DeliveryTicketLines WHERE jobNumber = @jobNumber
        let dtRows = [];
        let dtLineRows = [];
        try {
          const dtReq = pool.request();
          dtReq.input('jobNumber', sql.NVarChar, jobNumber);
          const dtRes = await dtReq.query(`
            SELECT * FROM tbl_DeliveryTickets
            WHERE jobNumber = @jobNumber OR JobNumber = @jobNumber OR jobId = @jobNumber OR JobID = @jobNumber
          `);
          dtRows = dtRes.recordset || [];

          const dtLineReq = pool.request();
          dtLineReq.input('jobNumber', sql.NVarChar, jobNumber);
          const dtLineRes = await dtLineReq.query(`
            SELECT tbl_DeliveryTicketLines.*
            FROM tbl_DeliveryTicketLines
            INNER JOIN tbl_DeliveryTickets ON tbl_DeliveryTicketLines.dtNumber = tbl_DeliveryTickets.dtNumber
            WHERE tbl_DeliveryTickets.jobNumber = @jobNumber OR tbl_DeliveryTickets.JobNumber = @jobNumber OR tbl_DeliveryTickets.jobId = @jobNumber OR tbl_DeliveryTickets.JobID = @jobNumber
          `);
          dtLineRows = dtLineRes.recordset || [];
        } catch (err) {
          if (context.log && context.log.warn) {
            context.log.warn('[getjobtools] tbl_DeliveryTickets/Lines query warning:', err.message);
          }
        }

        // 2. Query tbl_DTBatches and tbl_DTBatchLines WHERE JobID = @jobNumber (legacy compatibility)
        let batchRows = [];
        let batchLineRows = [];
        try {
          const batchReq = pool.request();
          batchReq.input('jobNumber', sql.NVarChar, jobNumber);
          const batchRes = await batchReq.query(`
            SELECT * FROM tbl_DTBatches
            WHERE JobID = @jobNumber OR JobNumber = @jobNumber OR jobId = @jobNumber OR jobNumber = @jobNumber
          `);
          batchRows = batchRes.recordset || [];

          const batchLineReq = pool.request();
          batchLineReq.input('jobNumber', sql.NVarChar, jobNumber);
          const batchLineRes = await batchLineReq.query(`
            SELECT tbl_DTBatchLines.*
            FROM tbl_DTBatchLines
            INNER JOIN tbl_DTBatches ON tbl_DTBatchLines.DTBatchID = tbl_DTBatches.DTBatchID
            WHERE tbl_DTBatches.JobID = @jobNumber OR tbl_DTBatches.JobNumber = @jobNumber OR tbl_DTBatches.jobId = @jobNumber OR tbl_DTBatches.jobNumber = @jobNumber
          `);
          batchLineRows = batchLineRes.recordset || [];
        } catch (err) {
          if (context.log && context.log.warn) {
            context.log.warn('[getjobtools] tbl_DTBatches/Lines query warning:', err.message);
          }
        }

        // 3. Query tbl_ReceivingTickets and tbl_ReceivingTicketLines WHERE jobNumber = @jobNumber
        let rtRows = [];
        let rtLineRows = [];
        try {
          const rtReq = pool.request();
          rtReq.input('jobNumber', sql.NVarChar, jobNumber);
          const rtRes = await rtReq.query(`
            SELECT * FROM tbl_ReceivingTickets
            WHERE jobNumber = @jobNumber OR JobNumber = @jobNumber OR jobId = @jobNumber OR JobID = @jobNumber
          `);
          rtRows = rtRes.recordset || [];

          const rtLineReq = pool.request();
          rtLineReq.input('jobNumber', sql.NVarChar, jobNumber);
          const rtLineRes = await rtLineReq.query(`
            SELECT tbl_ReceivingTicketLines.*
            FROM tbl_ReceivingTicketLines
            INNER JOIN tbl_ReceivingTickets ON tbl_ReceivingTicketLines.rtNumber = tbl_ReceivingTickets.rtNumber
            WHERE tbl_ReceivingTickets.jobNumber = @jobNumber OR tbl_ReceivingTickets.JobNumber = @jobNumber OR tbl_ReceivingTickets.jobId = @jobNumber OR tbl_ReceivingTickets.JobID = @jobNumber
          `);
          rtLineRows = rtLineRes.recordset || [];
        } catch (err) {
          if (context.log && context.log.warn) {
            context.log.warn('[getjobtools] tbl_ReceivingTickets/Lines query warning:', err.message);
          }
        }

        context.res = {
          status: 200,
          headers: CORS_HEADERS,
          body: {
            success: true,
            data: {
              deliveryTickets: dtRows,
              deliveryLines: dtLineRows,
              receivingTickets: rtRows,
              receivingLines: rtLineRows,
              dtBatches: batchRows,
              batchLines: batchLineRows,
            },
          },
        };
        return;
      }

      case 'gettoolhistory': {
        const pool = await getPool();
        const serialParam = getParam(req, 'serial') || getParam(req, 'serialNo') || getParam(req, 'assetNo') || '';
        const serial = typeof serialParam === 'string' ? serialParam.trim() : String(serialParam || '').trim();

        if (!serial) {
          context.res = {
            status: 400,
            headers: CORS_HEADERS,
            body: {
              success: false,
              error: 'serial parameter is required.',
            },
          };
          return;
        }

        // 1. Query tbl_MovementLog WHERE Serial = @serial ORDER BY LogDate DESC
        let movementLog = [];
        try {
          const movReq = pool.request();
          movReq.input('serial', sql.NVarChar, serial);
          const movRes = await movReq.query(`
            SELECT * FROM tbl_MovementLog
            WHERE Serial = @serial OR serial = @serial
            ORDER BY LogDate DESC
          `);
          movementLog = movRes.recordset || [];
        } catch (err) {
          if (context.log && context.log.warn) {
            context.log.warn('[gettoolhistory] tbl_MovementLog query warning:', err.message);
          }
        }

        // 2. Query tbl_DeliveryTicketLines JOIN tbl_DeliveryTickets ON tbl_DeliveryTicketLines.dtNumber = tbl_DeliveryTickets.dtNumber WHERE tbl_DeliveryTicketLines.serial = @serial
        let dispatches = [];
        try {
          const dtReq = pool.request();
          dtReq.input('serial', sql.NVarChar, serial);
          const dtRes = await dtReq.query(`
            SELECT 
              tbl_DeliveryTicketLines.*,
              tbl_DeliveryTickets.jobNumber,
              tbl_DeliveryTickets.rig,
              tbl_DeliveryTickets.well,
              tbl_DeliveryTickets.dispatchDate,
              tbl_DeliveryTickets.rmDate,
              tbl_DeliveryTickets.client,
              tbl_DeliveryTickets.contract,
              tbl_DeliveryTickets.status AS ticketStatus
            FROM tbl_DeliveryTicketLines
            INNER JOIN tbl_DeliveryTickets ON tbl_DeliveryTicketLines.dtNumber = tbl_DeliveryTickets.dtNumber
            WHERE tbl_DeliveryTicketLines.serial = @serial OR tbl_DeliveryTicketLines.Serial = @serial
          `);
          dispatches = dtRes.recordset || [];
        } catch (err) {
          if (context.log && context.log.warn) {
            context.log.warn('[gettoolhistory] tbl_DeliveryTickets join query warning:', err.message);
          }
        }

        // 3. Query tbl_ReceivingTicketLines JOIN tbl_ReceivingTickets ON tbl_ReceivingTicketLines.rtNumber = tbl_ReceivingTickets.rtNumber WHERE tbl_ReceivingTicketLines.serial = @serial
        let returns = [];
        try {
          const rtReq = pool.request();
          rtReq.input('serial', sql.NVarChar, serial);
          const rtRes = await rtReq.query(`
            SELECT 
              tbl_ReceivingTicketLines.*,
              tbl_ReceivingTickets.jobNumber,
              tbl_ReceivingTickets.rig,
              tbl_ReceivingTickets.well,
              tbl_ReceivingTickets.rtDate,
              tbl_ReceivingTickets.client,
              tbl_ReceivingTickets.contract,
              tbl_ReceivingTickets.status AS ticketStatus
            FROM tbl_ReceivingTicketLines
            INNER JOIN tbl_ReceivingTickets ON tbl_ReceivingTicketLines.rtNumber = tbl_ReceivingTickets.rtNumber
            WHERE tbl_ReceivingTicketLines.serial = @serial OR tbl_ReceivingTicketLines.Serial = @serial
          `);
          returns = rtRes.recordset || [];
        } catch (err) {
          if (context.log && context.log.warn) {
            context.log.warn('[gettoolhistory] tbl_ReceivingTickets join query warning:', err.message);
          }
        }

        context.res = {
          status: 200,
          headers: CORS_HEADERS,
          body: {
            success: true,
            data: {
              movementLog,
              dispatches,
              returns,
            },
          },
        };
        return;
      }

      default: {
        context.res = {
          status: 400,
          headers: CORS_HEADERS,
          body: {
            success: false,
            error: `Action '${action || 'undefined'}' not recognized.`,
          },
        };
        return;
      }
    }
  } catch (err) {
    if (context.log && context.log.error) {
      context.log.error('ToolTracker Azure Function error:', err);
    }
    context.res = {
      status: 500,
      headers: CORS_HEADERS,
      body: {
        success: false,
        error: err.message || 'Internal server error',
      },
    };
  }
};
