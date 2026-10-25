import csv
import json
import re
from datetime import datetime, timedelta

def parse_date(date_str):
    if not date_str:
        return None
    s = date_str.strip().split('T')[0]
    # Check DD/MM/YYYY
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    # Check DD-MM-YYYY
    m = re.match(r"^(\d{1,2})-(\d{1,2})-(\d{4})$", s)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    # Check DD-Mon-YY e.g. 28-May-23
    m = re.match(r"^(\d{1,2})-([A-Za-z]{3})-(\d{2})$", s)
    if m:
        months = {'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
                  'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'}
        mon = months.get(m.group(2).lower(), '01')
        yr = f"20{m.group(3)}"
        return f"{yr}-{mon}-{m.group(1).zfill(2)}"
    # Check YYYY-MM-DD
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
    return None

# Collect dates per job and tool from Job history.csv
job_tool_dates = {}
with open("src/data/Job history.csv", mode="r", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        j_num = (r.get("JobNum") or r.get("Job Number") or "").strip()
        part = (r.get("PartNum") or r.get("Item Number") or "").strip()
        del_date = parse_date(r.get("DeliveryDate") or r.get("Start Date"))
        ret_date = parse_date(r.get("ReturnDate") or r.get("End Date"))
        dt_num = (r.get("DeliveryTicketNum") or r.get("DT Number") or "").strip()
        
        if j_num and part and del_date:
            k = (j_num.upper(), part.upper())
            if k not in job_tool_dates:
                job_tool_dates[k] = {
                    "delDate": del_date,
                    "retDate": ret_date,
                    "dtNumber": dt_num,
                }

# Build daily records
daily_records = []
sql_statements = []

sql_statements.append("""
-- =====================================================================
-- TABLE CREATION & DDL FOR DAILY FIELD LOGS / UTILIZATION
-- =====================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'tbl_DailyFieldLogs')
BEGIN
    CREATE TABLE tbl_DailyFieldLogs (
        LogID BIGINT IDENTITY(1,1) PRIMARY KEY,
        JobID VARCHAR(50) NOT NULL,
        DTNumber VARCHAR(50) NULL,
        ToolSerial VARCHAR(50) NOT NULL,
        LogDate DATE NOT NULL,
        StatusType VARCHAR(10) NOT NULL, -- '1' = Operating, 'S' = Standby
        RateCharged DECIMAL(18,2) NULL,
        CreatedDate DATETIME DEFAULT GETDATE(),
        CONSTRAINT UQ_JobToolDate UNIQUE (JobID, ToolSerial, LogDate)
    );
    CREATE INDEX IX_DailyLogs_Job ON tbl_DailyFieldLogs(JobID);
    CREATE INDEX IX_DailyLogs_Tool ON tbl_DailyFieldLogs(ToolSerial);
    CREATE INDEX IX_DailyLogs_Date ON tbl_DailyFieldLogs(LogDate);
END
GO
""")

with open("src/data/invoice lines.csv", mode="r", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        j_id = r.get("Job No", "").strip()
        dt_num = r.get("DT Number", "").strip()
        serial = r.get("Item Number", "").strip()
        
        if not j_id or not serial:
            continue
            
        try:
            oper_days = int(float(r.get("Operating Days", 0) or 0))
            standby_days = int(float(r.get("Standby Days", 0) or 0))
            oper_price = float(r.get("Operating Price", 0) or 0)
            standby_price = float(r.get("Standby Price", 0) or 0)
        except:
            oper_days = 0
            standby_days = 0
            oper_price = 0.0
            standby_price = 0.0
            
        if oper_days == 0 and standby_days == 0:
            continue
            
        k = (j_id.upper(), serial.upper())
        dates_info = job_tool_dates.get(k, {})
        start_date_str = dates_info.get("delDate")
        
        # If no start date found, derive from job number year or default
        if not start_date_str:
            m = re.search(r"0(\d{2})-", j_id)
            if m:
                start_date_str = f"20{m.group(1)}-06-01"
            else:
                start_date_str = "2024-01-01"
                
        try:
            cur_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        except:
            cur_date = datetime(2024, 1, 1)
            
        # Allocate Operating Days ('1') first
        for _ in range(oper_days):
            d_str = cur_date.strftime("%Y-%m-%d")
            daily_records.append({
                "jobId": j_id,
                "dtNumber": dt_num,
                "toolSerial": serial,
                "date": d_str,
                "status": "1",
                "rate": oper_price,
            })
            cur_date += timedelta(days=1)
            
        # Allocate Standby Days ('S')
        for _ in range(standby_days):
            d_str = cur_date.strftime("%Y-%m-%d")
            daily_records.append({
                "jobId": j_id,
                "dtNumber": dt_num,
                "toolSerial": serial,
                "date": d_str,
                "status": "S",
                "rate": standby_price,
            })
            cur_date += timedelta(days=1)

print(f"Generated {len(daily_records)} daily utilization log entries.")

# Write sample SQL statements for Azure SQL bulk insert
sql_out_path = "scripts/INSERT_tbl_DailyFieldLogs_Sample.sql"
with open(sql_out_path, "w", encoding="utf-8") as f:
    f.write(sql_statements[0] + "\n")
    f.write("BEGIN TRANSACTION;\n")
    for i, rec in enumerate(daily_records[:5000]):
        escaped_job = rec['jobId'].replace("'", "''")
        escaped_dt = rec['dtNumber'].replace("'", "''")
        escaped_serial = rec['toolSerial'].replace("'", "''")
        f.write(f"INSERT INTO tbl_DailyFieldLogs (JobID, DTNumber, ToolSerial, LogDate, StatusType, RateCharged) VALUES ('{escaped_job}', '{escaped_dt}', '{escaped_serial}', '{rec['date']}', '{rec['status']}', {rec['rate']});\n")
    f.write("COMMIT TRANSACTION;\n")

print(f"Wrote SQL DDL and sample batch to {sql_out_path}")
