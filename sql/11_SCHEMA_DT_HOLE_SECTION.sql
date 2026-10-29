-- Migration 11: add holeSection to tbl_DeliveryTickets
-- Run once against ToolTrackingDB before deploying feat/dt-hole-section-billing.
--
-- Purpose: stores the hole-section choice a dispatcher makes when filling
-- an ADNOC delivery ticket. The rate resolver (api/rates.js) uses the ticket's
-- holeSection as the default for every hole-priced line on that ticket;
-- a per-line override can be added later without further schema changes.
--
-- The column is nullable: existing tickets and non-ADNOC jobs carry NULL,
-- and the UI hides the field entirely for contracts with no hole-priced
-- categories (i.e., when GET /delivery-tickets/{id}/hole-sections returns []).

ALTER TABLE tbl_DeliveryTickets
  ADD holeSection NVARCHAR(50) NULL;
GO
