-- ==============================================================================
-- EMDAD ToolTracker: Insert missing jobs (1798 - 1813) into tbl_Jobs
-- Standardized Format: JOB-026-XXXXX
-- ==============================================================================

IF NOT EXISTS (SELECT 1 FROM tbl_Jobs WHERE JobID = 'JOB-026-01798' OR JobID = 'JOB-26-01798')
BEGIN
    INSERT INTO tbl_Jobs (JobID, Rig, Well, Client, Contract, ServiceType, InvoicingType, Currency, MobDate, DemobDate, Status, CreatedDate, CreatedBy)
    VALUES ('JOB-026-01798', 'AD-110', '—', 'ADNOC ONSHORE - RENTALS', '4700023861', 'Downhole Rental', 'PerJob', 'USD', '2026-09-01', '2026-09-24', 'Completed', '2026-09-01', 'Operations');
END

IF NOT EXISTS (SELECT 1 FROM tbl_Jobs WHERE JobID = 'JOB-026-01799' OR JobID = 'JOB-26-01799')
BEGIN
    INSERT INTO tbl_Jobs (JobID, Rig, Well, Client, Contract, ServiceType, InvoicingType, Currency, MobDate, DemobDate, Status, CreatedDate, CreatedBy)
    VALUES ('JOB-026-01799', 'AD-56', '—', 'ADNOC ONSHORE - RENTALS', '4700023861', 'Downhole Rental', 'PerJob', 'USD', '2026-09-01', '2026-09-25', 'Completed', '2026-09-01', 'Operations');
END

IF NOT EXISTS (SELECT 1 FROM tbl_Jobs WHERE JobID = 'JOB-026-01800' OR JobID = 'JOB-26-01800')
BEGIN
    INSERT INTO tbl_Jobs (JobID, Rig, Well, Client, Contract, ServiceType, InvoicingType, Currency, MobDate, DemobDate, Status, CreatedDate, CreatedBy)
    VALUES ('JOB-026-01800', 'AD-80', '—', 'ADNOC DRILLING - FISHING', '4700024608 - UDR', 'Fishing Service', 'PerJob', 'USD', '2026-09-01', '2026-09-21', 'Completed', '2026-09-01', 'Operations');
END

IF NOT EXISTS (SELECT 1 FROM tbl_Jobs WHERE JobID = 'JOB-026-01801' OR JobID = 'JOB-26-01801')
BEGIN
    INSERT INTO tbl_Jobs (JobID, Rig, Well, Client, Contract, ServiceType, InvoicingType, Currency, MobDate, Status, CreatedDate, CreatedBy)
    VALUES ('JOB-026-01801', 'AD-33', '—', 'ADNOC DRILLING - FISHING', '4700024608 - UDR', 'Fishing Service', 'PerJob', 'USD', '2026-09-05', 'Ongoing', '2026-09-05', 'Operations');
END

IF NOT EXISTS (SELECT 1 FROM tbl_Jobs WHERE JobID = 'JOB-026-01802' OR JobID = 'JOB-26-01802')
BEGIN
    INSERT INTO tbl_Jobs (JobID, Rig, Well, Client, Contract, ServiceType, InvoicingType, Currency, MobDate, Status, CreatedDate, CreatedBy)
    VALUES ('JOB-026-01802', 'AD-300', 'SR-108', 'ADNOC OFFSHORE', '444558.REV.1', 'Fishing Service', 'PerJob', 'USD', '2026-09-24', 'Ongoing', '2026-09-24', 'Operations');
END

IF NOT EXISTS (SELECT 1 FROM tbl_Jobs WHERE JobID = 'JOB-026-01803' OR JobID = 'JOB-26-01803')
BEGIN
    INSERT INTO tbl_Jobs (JobID, Rig, Well, Client, Contract, ServiceType, InvoicingType, Currency, MobDate, DemobDate, Status, CreatedDate, CreatedBy)
    VALUES ('JOB-026-01803', 'AL HUDAIRIYAT', '—', 'ADNOC OFFSHORE', '444558.REV.1', 'Rental Tools', 'PerJob', 'USD', '2026-09-01', '2026-09-29', 'Completed', '2026-09-01', 'Operations');
END

IF NOT EXISTS (SELECT 1 FROM tbl_Jobs WHERE JobID = 'JOB-026-01804' OR JobID = 'JOB-26-01804')
BEGIN
    INSERT INTO tbl_Jobs (JobID, Rig, Well, Client, Contract, ServiceType, InvoicingType, Currency, MobDate, DemobDate, Status, CreatedDate, CreatedBy)
    VALUES ('JOB-026-01804', 'AD-106', '—', 'ADNOC ONSHORE - RENTALS', '4700023861', 'Downhole Rental', 'PerJob', 'USD', '2026-09-01', '2026-09-25', 'Completed', '2026-09-01', 'Operations');
END

IF NOT EXISTS (SELECT 1 FROM tbl_Jobs WHERE JobID = 'JOB-026-01805' OR JobID = 'JOB-26-01805')
BEGIN
    INSERT INTO tbl_Jobs (JobID, Rig, Well, Client, Contract, ServiceType, InvoicingType, Currency, MobDate, DemobDate, Status, CreatedDate, CreatedBy)
    VALUES ('JOB-026-01805', 'AD-135', '—', 'ADNOC ONSHORE - RENTALS', '4700023861', 'Downhole Rental', 'PerJob', 'USD', '2026-09-01', '2026-09-25', 'Completed', '2026-09-01', 'Operations');
END
