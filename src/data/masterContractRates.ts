import { ContractRateItem } from "../types";

export interface MasterContractData {
  contractNo: string;
  name: string;
  description: string;
  currency: string;
  rates: ContractRateItem[];
}

// Seed data removed — all contract rates come from Azure SQL (tbl_ContractRates)
export const MASTER_CONTRACT_RATES: Record<string, MasterContractData> = {};
