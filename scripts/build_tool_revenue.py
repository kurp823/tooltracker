import csv
import json
import re
from collections import defaultdict

USD_AED_RATE = 3.6725
AED_CONTRACTS = {"4700024096"}

# 1. Load Categories
categories = []
with open("src/data/Category_list.csv", mode="r", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        c_id = r.get("Category ID", "").strip()
        c_name = r.get("Category", "").strip()
        if c_name:
            categories.append({"id": c_id, "name": c_name, "upper": c_name.upper()})

categories.sort(key=lambda x: len(x["name"]), reverse=True)

# 2. Load Sizes
sizes = []
with open("src/data/Size_tools.csv", mode="r", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        s_id = r.get("Size ID", "").strip()
        s_name = r.get("sizes", "").strip().replace('"', '')
        if s_name:
            sizes.append({"id": s_id, "name": s_name + '"', "clean": s_name.strip()})

sizes.sort(key=lambda x: len(x["clean"]), reverse=True)

# 3. Load Jobs metadata from jobcard.csv
jobs_meta = {}
with open("src/data/jobcard.csv", mode="r", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        j_id = r.get("Job Number", "").strip()
        if j_id:
            jobs_meta[j_id.upper()] = {
                "client": r.get("Client", "").strip(),
                "project": r.get("Project Code", "").strip(),
                "rig": r.get("Rig", "").strip(),
                "well": r.get("Well", "").strip(),
                "status": r.get("Status", "").strip(),
                "startDate": r.get("Start Date", "").strip(),
                "endDate": r.get("End Date", "").strip(),
                "legalNumber": r.get("Legal Number", "").strip(),
                "invoiceDate": r.get("Invoice Date", "").strip(),
            }

def match_category(desc):
    u = (desc or "").upper()
    for cat in categories:
        if cat["upper"] in u:
            return cat["name"]
    if "JAR" in u and "DRILL" in u: return "DRILLING JAR"
    if "JAR" in u and "FISH" in u: return "FISHING JAR"
    if "JAR" in u: return "DRILLING JAR"
    if "STABILIZER" in u or "STB" in u: return "STABILIZER"
    if "HOLE OPENER" in u: return "HOLE OPENER"
    if "SHOCK" in u: return "SHOCK TOOL"
    if "WHIPSTOCK" in u: return "WHIPSTOCK"
    if "OVERSHOT" in u: return "OVERSHOT"
    if "MILL" in u: return "JUNK MILL"
    if "REAMER" in u: return "ROLLER REAMER"
    if "SUB" in u: return "SUB"
    if "BASKET" in u: return "CARGO BASKET"
    if "VALVE" in u: return "SAFETY VALVE"
    if "COLLAR" in u: return "DRILL COLLAR"
    if "SPEAR" in u: return "RELEASING SPEAR"
    if "MOTOR" in u: return "MUD MOTOR"
    return "OTHER DOWNHOLE TOOL"

def match_size(desc):
    u = (desc or "").upper()
    for s in sizes:
        if s["clean"] and re.search(r"(?<![0-9/.-])" + re.escape(s["clean"]) + r'(?:\"|\s*INCH|\s*OD|\s*ID|\b)', u):
            return s["name"]
    m = re.search(r'(\d+(?:[-/]\d+)?(?:\.\d+)?)\s*\"', u)
    if m:
        return m.group(1) + '"'
    return "N/A"

# 4. Process invoice lines
tool_stats = defaultdict(lambda: {
    "serial": "",
    "assetNo": "",
    "desc": "",
    "category": "",
    "size": "",
    "currency": "USD",
    "nativeRevenue": 0.0,
    "nativeOperRevenue": 0.0,
    "nativeStandbyRevenue": 0.0,
    "totalRevenueUSD": 0.0,
    "operRevenueUSD": 0.0,
    "standbyRevenueUSD": 0.0,
    "totalRevenueAED": 0.0,
    "operRevenueAED": 0.0,
    "standbyRevenueAED": 0.0,
    "operDays": 0.0,
    "standbyDays": 0.0,
    "jobs": set(),
    "dts": set(),
    "clients": set(),
    "contracts": set(),
    "rigs": set(),
    "lastJobId": "",
    "lastInvoiceDate": "",
})

cat_stats = defaultdict(lambda: {
    "category": "",
    "totalRevenueUSD": 0.0,
    "operRevenueUSD": 0.0,
    "standbyRevenueUSD": 0.0,
    "totalRevenueAED": 0.0,
    "operRevenueAED": 0.0,
    "standbyRevenueAED": 0.0,
    "operDays": 0.0,
    "standbyDays": 0.0,
    "toolsCount": 0,
    "jobsCount": 0,
    "tools": set(),
    "jobs": set(),
})

size_stats = defaultdict(lambda: {
    "size": "",
    "totalRevenueUSD": 0.0,
    "operRevenueUSD": 0.0,
    "standbyRevenueUSD": 0.0,
    "totalRevenueAED": 0.0,
    "operRevenueAED": 0.0,
    "standbyRevenueAED": 0.0,
    "operDays": 0.0,
    "standbyDays": 0.0,
    "toolsCount": 0,
    "jobsCount": 0,
    "tools": set(),
    "jobs": set(),
})

contract_stats = defaultdict(lambda: {
    "contract": "",
    "client": "",
    "currency": "USD",
    "nativeRevenue": 0.0,
    "nativeOperRevenue": 0.0,
    "nativeStandbyRevenue": 0.0,
    "totalRevenueUSD": 0.0,
    "operRevenueUSD": 0.0,
    "standbyRevenueUSD": 0.0,
    "totalRevenueAED": 0.0,
    "operRevenueAED": 0.0,
    "standbyRevenueAED": 0.0,
    "operDays": 0.0,
    "standbyDays": 0.0,
    "toolsCount": 0,
    "jobsCount": 0,
    "tools": set(),
    "jobs": set(),
})

total_revenue_usd = 0.0
total_oper_revenue_usd = 0.0
total_standby_revenue_usd = 0.0

total_revenue_aed = 0.0
total_oper_revenue_aed = 0.0
total_standby_revenue_aed = 0.0

total_oper_days = 0.0
total_standby_days = 0.0

with open("src/data/invoice lines.csv", mode="r", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        j_id = r.get("Job No", "").strip()
        dt_num = r.get("DT Number", "").strip()
        serial = r.get("Item Number", "").strip()
        desc = r.get("Item Desc", "").strip()
        
        if not serial:
            continue
            
        try:
            standby_price = float(r.get("Standby Price", 0) or 0)
            oper_price = float(r.get("Operating Price", 0) or 0)
            standby_days = float(r.get("Standby Days", 0) or 0)
            oper_days = float(r.get("Operating Days", 0) or 0)
            total = float(r.get("Total", 0) or 0)
        except:
            standby_price = 0.0
            oper_price = 0.0
            standby_days = 0.0
            oper_days = 0.0
            total = 0.0
            
        native_oper_rev = round(oper_days * oper_price, 2)
        native_standby_rev = round(standby_days * standby_price, 2)
        if total <= 0:
            total = round(native_oper_rev + native_standby_rev, 2)
            
        cat = match_category(desc)
        size = match_size(desc)
        
        meta = jobs_meta.get(j_id.upper(), {})
        client = meta.get("client", "") or "ADNOC"
        contract = meta.get("project", "") or "444558"
        rig = meta.get("rig", "")
        
        is_aed = contract in AED_CONTRACTS
        currency = "AED" if is_aed else "USD"
        
        if is_aed:
            # Contract is in AED
            tot_aed = total
            oper_aed = native_oper_rev
            sb_aed = native_standby_rev
            
            tot_usd = round(total / USD_AED_RATE, 2)
            oper_usd = round(native_oper_rev / USD_AED_RATE, 2)
            sb_usd = round(native_standby_rev / USD_AED_RATE, 2)
        else:
            # Contract is in USD
            tot_usd = total
            oper_usd = native_oper_rev
            sb_usd = native_standby_rev
            
            tot_aed = round(total * USD_AED_RATE, 2)
            oper_aed = round(native_oper_rev * USD_AED_RATE, 2)
            sb_aed = round(native_standby_rev * USD_AED_RATE, 2)
        
        # Tool aggregates
        t = tool_stats[serial]
        t["serial"] = serial
        t["assetNo"] = serial
        if len(desc) > len(t["desc"]):
            t["desc"] = desc
        t["category"] = cat
        t["size"] = size
        t["currency"] = currency
        t["nativeRevenue"] += total
        t["nativeOperRevenue"] += native_oper_rev
        t["nativeStandbyRevenue"] += native_standby_rev
        
        t["totalRevenueUSD"] += tot_usd
        t["operRevenueUSD"] += oper_usd
        t["standbyRevenueUSD"] += sb_usd
        
        t["totalRevenueAED"] += tot_aed
        t["operRevenueAED"] += oper_aed
        t["standbyRevenueAED"] += sb_aed
        
        t["operDays"] += oper_days
        t["standbyDays"] += standby_days
        if j_id: t["jobs"].add(j_id)
        if dt_num: t["dts"].add(dt_num)
        if client: t["clients"].add(client)
        if contract: t["contracts"].add(contract)
        if rig: t["rigs"].add(rig)
        t["lastJobId"] = j_id
        if meta.get("invoiceDate"):
            t["lastInvoiceDate"] = meta.get("invoiceDate")
            
        # Category aggregates
        c = cat_stats[cat]
        c["category"] = cat
        c["totalRevenueUSD"] += tot_usd
        c["operRevenueUSD"] += oper_usd
        c["standbyRevenueUSD"] += sb_usd
        c["totalRevenueAED"] += tot_aed
        c["operRevenueAED"] += oper_aed
        c["standbyRevenueAED"] += sb_aed
        c["operDays"] += oper_days
        c["standbyDays"] += standby_days
        c["tools"].add(serial)
        if j_id: c["jobs"].add(j_id)
        
        # Size aggregates
        s = size_stats[size]
        s["size"] = size
        s["totalRevenueUSD"] += tot_usd
        s["operRevenueUSD"] += oper_usd
        s["standbyRevenueUSD"] += sb_usd
        s["totalRevenueAED"] += tot_aed
        s["operRevenueAED"] += oper_aed
        s["standbyRevenueAED"] += sb_aed
        s["operDays"] += oper_days
        s["standbyDays"] += standby_days
        s["tools"].add(serial)
        if j_id: s["jobs"].add(j_id)
        
        # Contract aggregates
        c_key = f"{contract} - {client}" if contract else client
        cnt = contract_stats[c_key]
        cnt["contract"] = contract or "444558"
        cnt["client"] = client or "ADNOC OFFSHORE"
        cnt["currency"] = currency
        cnt["nativeRevenue"] += total
        cnt["nativeOperRevenue"] += native_oper_rev
        cnt["nativeStandbyRevenue"] += native_standby_rev
        
        cnt["totalRevenueUSD"] += tot_usd
        cnt["operRevenueUSD"] += oper_usd
        cnt["standbyRevenueUSD"] += sb_usd
        
        cnt["totalRevenueAED"] += tot_aed
        cnt["operRevenueAED"] += oper_aed
        cnt["standbyRevenueAED"] += sb_aed
        
        cnt["operDays"] += oper_days
        cnt["standbyDays"] += standby_days
        cnt["tools"].add(serial)
        if j_id: cnt["jobs"].add(j_id)
        
        total_revenue_usd += tot_usd
        total_oper_revenue_usd += oper_usd
        total_standby_revenue_usd += sb_usd
        
        total_revenue_aed += tot_aed
        total_oper_revenue_aed += oper_aed
        total_standby_revenue_aed += sb_aed
        
        total_oper_days += oper_days
        total_standby_days += standby_days

# Format tools list
tools_list = []
for serial, data in tool_stats.items():
    tools_list.append({
        "serial": data["serial"],
        "assetNo": data["assetNo"],
        "desc": data["desc"],
        "category": data["category"],
        "size": data["size"],
        "currency": data["currency"],
        "nativeRevenue": round(data["nativeRevenue"], 2),
        "nativeOperRevenue": round(data["nativeOperRevenue"], 2),
        "nativeStandbyRevenue": round(data["nativeStandbyRevenue"], 2),
        "totalRevenueUSD": round(data["totalRevenueUSD"], 2),
        "operRevenueUSD": round(data["operRevenueUSD"], 2),
        "standbyRevenueUSD": round(data["standbyRevenueUSD"], 2),
        "totalRevenueAED": round(data["totalRevenueAED"], 2),
        "operRevenueAED": round(data["operRevenueAED"], 2),
        "standbyRevenueAED": round(data["standbyRevenueAED"], 2),
        # Default backward-compatible fields
        "totalRevenue": round(data["totalRevenueUSD"], 2),
        "operRevenue": round(data["operRevenueUSD"], 2),
        "standbyRevenue": round(data["standbyRevenueUSD"], 2),
        "operDays": data["operDays"],
        "standbyDays": data["standbyDays"],
        "jobsCount": len(data["jobs"]),
        "lastJobId": data["lastJobId"],
        "lastInvoiceDate": data["lastInvoiceDate"],
        "clients": list(data["clients"]),
        "contracts": list(data["contracts"]),
        "rigs": list(data["rigs"]),
    })

tools_list.sort(key=lambda x: x["totalRevenueUSD"], reverse=True)

# Format categories list
categories_list = []
for cat, data in cat_stats.items():
    categories_list.append({
        "category": cat,
        "totalRevenueUSD": round(data["totalRevenueUSD"], 2),
        "operRevenueUSD": round(data["operRevenueUSD"], 2),
        "standbyRevenueUSD": round(data["standbyRevenueUSD"], 2),
        "totalRevenueAED": round(data["totalRevenueAED"], 2),
        "operRevenueAED": round(data["operRevenueAED"], 2),
        "standbyRevenueAED": round(data["standbyRevenueAED"], 2),
        # Default backward-compatible fields
        "totalRevenue": round(data["totalRevenueUSD"], 2),
        "operRevenue": round(data["operRevenueUSD"], 2),
        "standbyRevenue": round(data["standbyRevenueUSD"], 2),
        "operDays": data["operDays"],
        "standbyDays": data["standbyDays"],
        "toolsCount": len(data["tools"]),
        "jobsCount": len(data["jobs"]),
    })
categories_list.sort(key=lambda x: x["totalRevenueUSD"], reverse=True)

# Format sizes list
sizes_list = []
for sz, data in size_stats.items():
    sizes_list.append({
        "size": sz,
        "totalRevenueUSD": round(data["totalRevenueUSD"], 2),
        "operRevenueUSD": round(data["operRevenueUSD"], 2),
        "standbyRevenueUSD": round(data["standbyRevenueUSD"], 2),
        "totalRevenueAED": round(data["totalRevenueAED"], 2),
        "operRevenueAED": round(data["operRevenueAED"], 2),
        "standbyRevenueAED": round(data["standbyRevenueAED"], 2),
        # Default backward-compatible fields
        "totalRevenue": round(data["totalRevenueUSD"], 2),
        "operRevenue": round(data["operRevenueUSD"], 2),
        "standbyRevenue": round(data["standbyRevenueUSD"], 2),
        "operDays": data["operDays"],
        "standbyDays": data["standbyDays"],
        "toolsCount": len(data["tools"]),
        "jobsCount": len(data["jobs"]),
    })
sizes_list.sort(key=lambda x: x["totalRevenueUSD"], reverse=True)

# Format contracts list
contracts_list = []
for c_key, data in contract_stats.items():
    contracts_list.append({
        "contractKey": c_key,
        "contract": data["contract"],
        "client": data["client"],
        "currency": data["currency"],
        "nativeRevenue": round(data["nativeRevenue"], 2),
        "nativeOperRevenue": round(data["nativeOperRevenue"], 2),
        "nativeStandbyRevenue": round(data["nativeStandbyRevenue"], 2),
        "totalRevenueUSD": round(data["totalRevenueUSD"], 2),
        "operRevenueUSD": round(data["operRevenueUSD"], 2),
        "standbyRevenueUSD": round(data["standbyRevenueUSD"], 2),
        "totalRevenueAED": round(data["totalRevenueAED"], 2),
        "operRevenueAED": round(data["operRevenueAED"], 2),
        "standbyRevenueAED": round(data["standbyRevenueAED"], 2),
        # Default backward-compatible fields
        "totalRevenue": round(data["totalRevenueUSD"], 2),
        "operRevenue": round(data["operRevenueUSD"], 2),
        "standbyRevenue": round(data["standbyRevenueUSD"], 2),
        "operDays": data["operDays"],
        "standbyDays": data["standbyDays"],
        "toolsCount": len(data["tools"]),
        "jobsCount": len(data["jobs"]),
    })
contracts_list.sort(key=lambda x: x["totalRevenueUSD"], reverse=True)

output = {
    "summary": {
        "fxRateUSDToAED": USD_AED_RATE,
        "totalRevenueUSD": round(total_revenue_usd, 2),
        "totalOperRevenueUSD": round(total_oper_revenue_usd, 2),
        "totalStandbyRevenueUSD": round(total_standby_revenue_usd, 2),
        "totalRevenueAED": round(total_revenue_aed, 2),
        "totalOperRevenueAED": round(total_oper_revenue_aed, 2),
        "totalStandbyRevenueAED": round(total_standby_revenue_aed, 2),
        # Default backward-compatible fields
        "totalRevenue": round(total_revenue_usd, 2),
        "totalOperRevenue": round(total_oper_revenue_usd, 2),
        "totalStandbyRevenue": round(total_standby_revenue_usd, 2),
        "totalOperDays": total_oper_days,
        "totalStandbyDays": total_standby_days,
        "totalTools": len(tools_list),
        "totalCategories": len(categories_list),
        "totalSizes": len(sizes_list),
        "totalContracts": len(contracts_list),
    },
    "categories": categories_list,
    "sizes": sizes_list,
    "contracts": contracts_list,
    "tools": tools_list,
}

with open("src/data/toolRevenueData.json", "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2)

# Generate lightweight revenueSummary.ts
summary_ts_content = f"""// Autogenerated lightweight commercial summary for Operations Dashboard and Analytics
export interface RevenueSummaryData {{
  fxRateUSDToAED: number;
  totalRevenueUSD: number;
  totalOperRevenueUSD: number;
  totalStandbyRevenueUSD: number;
  totalRevenueAED: number;
  totalOperRevenueAED: number;
  totalStandbyRevenueAED: number;
  totalRevenue: number;
  totalOperRevenue: number;
  totalStandbyRevenue: number;
  totalOperDays: number;
  totalStandbyDays: number;
  totalTools: number;
  totalCategories: number;
  totalSizes: number;
  totalContracts: number;
}}

export interface CategoryRevenueSummary {{
  category: string;
  totalRevenueUSD: number;
  operRevenueUSD: number;
  standbyRevenueUSD: number;
  totalRevenueAED: number;
  operRevenueAED: number;
  standbyRevenueAED: number;
  totalRevenue: number;
  operRevenue: number;
  standbyRevenue: number;
  operDays: number;
  standbyDays: number;
  toolCount?: number;
  toolsCount?: number;
  jobsCount: number;
}}

export interface ContractRevenueSummary {{
  contractKey?: string;
  contract: string;
  client: string;
  currency: 'AED' | 'USD';
  nativeRevenue: number;
  nativeOperRevenue: number;
  nativeStandbyRevenue: number;
  totalRevenueUSD: number;
  operRevenueUSD: number;
  standbyRevenueUSD: number;
  totalRevenueAED: number;
  operRevenueAED: number;
  standbyRevenueAED: number;
  totalRevenue: number;
  operRevenue: number;
  standbyRevenue: number;
  operDays?: number;
  standbyDays?: number;
  toolCount?: number;
  toolsCount?: number;
  jobsCount: number;
}}

export const REVENUE_SUMMARY: RevenueSummaryData = {json.dumps(output["summary"], indent=2)};

export const TOP_CATEGORIES_REVENUE: CategoryRevenueSummary[] = {json.dumps(categories_list[:10], indent=2)};

export const TOP_CONTRACTS_REVENUE: ContractRevenueSummary[] = {json.dumps(contracts_list[:12], indent=2)};
"""

with open("src/data/revenueSummary.ts", "w", encoding="utf-8") as f:
    f.write(summary_ts_content)

print(f"Generated toolRevenueData.json and revenueSummary.ts successfully!")
print(f"Total Revenue USD: ${output['summary']['totalRevenueUSD']:,.2f} | Total Revenue AED: AED {output['summary']['totalRevenueAED']:,.2f}")
