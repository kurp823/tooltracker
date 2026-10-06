import csv
import json
import re
from collections import defaultdict

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
    "totalRevenue": 0.0,
    "operRevenue": 0.0,
    "standbyRevenue": 0.0,
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
    "totalRevenue": 0.0,
    "operRevenue": 0.0,
    "standbyRevenue": 0.0,
    "operDays": 0.0,
    "standbyDays": 0.0,
    "toolsCount": 0,
    "jobsCount": 0,
    "tools": set(),
    "jobs": set(),
})

size_stats = defaultdict(lambda: {
    "size": "",
    "totalRevenue": 0.0,
    "operRevenue": 0.0,
    "standbyRevenue": 0.0,
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
    "totalRevenue": 0.0,
    "operRevenue": 0.0,
    "standbyRevenue": 0.0,
    "operDays": 0.0,
    "standbyDays": 0.0,
    "toolsCount": 0,
    "jobsCount": 0,
    "tools": set(),
    "jobs": set(),
})

total_revenue = 0.0
total_oper_revenue = 0.0
total_standby_revenue = 0.0
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
            
        oper_rev = round(oper_days * oper_price, 2)
        standby_rev = round(standby_days * standby_price, 2)
        if total <= 0:
            total = round(oper_rev + standby_rev, 2)
            
        cat = match_category(desc)
        size = match_size(desc)
        
        meta = jobs_meta.get(j_id.upper(), {})
        client = meta.get("client", "") or "ADNOC"
        contract = meta.get("project", "") or "444558"
        rig = meta.get("rig", "")
        
        # Tool aggregates
        t = tool_stats[serial]
        t["serial"] = serial
        t["assetNo"] = serial
        if len(desc) > len(t["desc"]):
            t["desc"] = desc
        t["category"] = cat
        t["size"] = size
        t["totalRevenue"] += total
        t["operRevenue"] += oper_rev
        t["standbyRevenue"] += standby_rev
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
        c["totalRevenue"] += total
        c["operRevenue"] += oper_rev
        c["standbyRevenue"] += standby_rev
        c["operDays"] += oper_days
        c["standbyDays"] += standby_days
        c["tools"].add(serial)
        if j_id: c["jobs"].add(j_id)
        
        # Size aggregates
        s = size_stats[size]
        s["size"] = size
        s["totalRevenue"] += total
        s["operRevenue"] += oper_rev
        s["standbyRevenue"] += standby_rev
        s["operDays"] += oper_days
        s["standbyDays"] += standby_days
        s["tools"].add(serial)
        if j_id: s["jobs"].add(j_id)
        
        # Contract aggregates
        c_key = f"{contract} - {client}" if contract else client
        cnt = contract_stats[c_key]
        cnt["contract"] = contract or "444558"
        cnt["client"] = client or "ADNOC OFFSHORE"
        cnt["totalRevenue"] += total
        cnt["operRevenue"] += oper_rev
        cnt["standbyRevenue"] += standby_rev
        cnt["operDays"] += oper_days
        cnt["standbyDays"] += standby_days
        cnt["tools"].add(serial)
        if j_id: cnt["jobs"].add(j_id)
        
        total_revenue += total
        total_oper_revenue += oper_rev
        total_standby_revenue += standby_rev
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
        "totalRevenue": round(data["totalRevenue"], 2),
        "operRevenue": round(data["operRevenue"], 2),
        "standbyRevenue": round(data["standbyRevenue"], 2),
        "operDays": data["operDays"],
        "standbyDays": data["standbyDays"],
        "jobsCount": len(data["jobs"]),
        "lastJobId": data["lastJobId"],
        "lastInvoiceDate": data["lastInvoiceDate"],
        "clients": list(data["clients"]),
        "contracts": list(data["contracts"]),
        "rigs": list(data["rigs"]),
    })

tools_list.sort(key=lambda x: x["totalRevenue"], reverse=True)

# Format categories list
categories_list = []
for cat, data in cat_stats.items():
    categories_list.append({
        "category": cat,
        "totalRevenue": round(data["totalRevenue"], 2),
        "operRevenue": round(data["operRevenue"], 2),
        "standbyRevenue": round(data["standbyRevenue"], 2),
        "operDays": data["operDays"],
        "standbyDays": data["standbyDays"],
        "toolsCount": len(data["tools"]),
        "jobsCount": len(data["jobs"]),
    })
categories_list.sort(key=lambda x: x["totalRevenue"], reverse=True)

# Format sizes list
sizes_list = []
for sz, data in size_stats.items():
    sizes_list.append({
        "size": sz,
        "totalRevenue": round(data["totalRevenue"], 2),
        "operRevenue": round(data["operRevenue"], 2),
        "standbyRevenue": round(data["standbyRevenue"], 2),
        "operDays": data["operDays"],
        "standbyDays": data["standbyDays"],
        "toolsCount": len(data["tools"]),
        "jobsCount": len(data["jobs"]),
    })
sizes_list.sort(key=lambda x: x["totalRevenue"], reverse=True)

# Format contracts list
contracts_list = []
for c_key, data in contract_stats.items():
    contracts_list.append({
        "contractKey": c_key,
        "contract": data["contract"],
        "client": data["client"],
        "totalRevenue": round(data["totalRevenue"], 2),
        "operRevenue": round(data["operRevenue"], 2),
        "standbyRevenue": round(data["standbyRevenue"], 2),
        "operDays": data["operDays"],
        "standbyDays": data["standbyDays"],
        "toolsCount": len(data["tools"]),
        "jobsCount": len(data["jobs"]),
    })
contracts_list.sort(key=lambda x: x["totalRevenue"], reverse=True)

output = {
    "summary": {
        "totalRevenue": round(total_revenue, 2),
        "totalOperRevenue": round(total_oper_revenue, 2),
        "totalStandbyRevenue": round(total_standby_revenue, 2),
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

tot_rev = output["summary"]["totalRevenue"]
tot_tools = output["summary"]["totalTools"]
print(f"Generated src/data/toolRevenueData.json successfully! Total: ${tot_rev:,.2f} across {tot_tools} tools.")
