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

# 2. Load Sizes (Filter out apparel sizes like XL, 2XL)
apparel_sizes = {'L', 'XL', '2XL', '3XL', '4XL', 'S', 'M', 'N/A', '10', '11', '9'}
sizes_raw = []
with open("src/data/Size_tools.csv", mode="r", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        s_id = r.get("Size ID", "").strip()
        s_name = r.get("sizes", "").strip().replace('"', '')
        if s_name and s_name not in apparel_sizes and not s_name.startswith('FOR '):
            sizes_raw.append({"id": s_id, "name": s_name + '"', "clean": s_name.strip()})

sizes_raw.sort(key=lambda x: len(x["clean"]), reverse=True)

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

def parse_num(val):
    if val is None:
        return 0.0
    s = str(val).replace(',', '').replace('$', '').replace('AED', '').strip()
    if s == '-' or not s:
        return 0.0
    try:
        return float(s)
    except:
        return 0.0

def classify_category(desc, serial=''):
    u = (desc or '').upper()
    s = (serial or '').upper()

    # Mitigation / Specialty tools
    if 'TOMAX' in u or 'TOMAX' in s or 'AST TOOL' in u or 'ACTIVATED DRILLING' in u: return 'MITIGATION TOOL - TOMAX'
    if 'NEO TORK' in u or 'NEOTORK' in u: return 'MITIGATION TOOL - NEO TORK'
    if 'POSI TRACK' in u or 'POSITRACK' in u: return 'MITIGATION TOOL - POSI TRACK'
    if 'HI TOOL' in u: return 'MITIGATION TOOL - HI TOOL'

    # Auto Driller / Drillwell
    if 'AUTODRILLER' in u or 'AUTO DRILLER' in u or 'DRILWEL' in u: return 'AUTO DRILLER'

    # Torque Reducers
    if 'TORQUE REDUCER CLAMP' in u or 'TORQUE CLAMP' in u: return 'TORQUE REDUCER CLAMPS'
    if 'TORQUE REDUCER SUB' in u: return 'TORQUE REDUCER SUBS'

    # Magnets
    if 'DITCH MAGNET' in u: return 'DITCH MAGNET'
    if 'FLOWLINE' in u and 'MAGNET' in u: return 'FLOWLINE D.MAGNET'
    if 'STRING MAGNET' in u: return 'STRING MAGNET'
    if 'F. MAGNET' in u or 'FISHING MAGNET' in u: return 'F. MAGNET'
    if 'SP MAGNET' in u or 'DOWNHOLE MAGNET' in u or 'D. MAGNET' in u or 'MAGNET' in u: return 'DOWNHOLE MAGNET'

    # Casing Scrapers / Cleanout
    if 'SCRAPER HD' in u or 'HI PRO' in u or 'ACTIVATED DRILLING SCRAPER' in u or 'CASING SCRAPPER (HEAVY' in u: return 'CASING SCRAPPER (HEAVY DUTY)'
    if 'ROTATING' in u and ('SCRAPER' in u or 'SCRAPPER' in u): return 'CASING SCRAPPER (ROTATING)'
    if 'NON-ROTATING' in u and ('SCRAPER' in u or 'SCRAPPER' in u): return 'CASING SCRAPPER (NON-ROTATING)'
    if 'SCRAPER' in u or 'SCRAPPER' in u: return 'CASING SCRAPPER (ROTATING)'
    if 'CASING BRUSH' in u or ('BRUSH' in u and 'CASING' in u): return 'CASING BRUSH (HEAVY DUTY)'

    # Reamers / Hole Openers
    if 'SHURIKEN' in u or 'REDBACK' in u or 'ROLLER REAMER' in u or 'R/REAMER' in u or 'R.REAMER' in u: return 'ROLLER REAMER'
    if 'BI-DIRECTIONAL REAMER' in u or 'BIDIRECTIONAL' in u: return 'BI-DIRECTIONAL REAMER'
    if 'REAMER STABILIZER' in u: return 'REAMER STABILIZER'
    if 'HOLE OPENER' in u: return 'HOLE OPENER'

    # Jars
    if 'SUPER FISHING JAR' in u or 'SUPER JAR' in u: return 'SUPER FISHING JAR'
    if 'SURFACE JAR' in u: return 'SURFACE JAR'
    if 'FISHING JAR' in u or 'F. JAR' in u or "TYPE 'Z'" in u or 'TYPE Z' in u or 'OIL JAR' in u: return 'F. JAR'
    if 'DRILLING JAR' in u or 'DRILL JAR' in u or 'HYDRO-MECHANICAL' in u or 'HYDRO MECHANICAL' in u or 'HYDRAULIC DRILLING' in u or 'HYD DRILLING JAR' in u or 'NOV DOUBLE ACTING' in u: return 'DRILLING JAR'
    if 'JAR' in u: return 'DRILLING JAR'

    # Stabilizers
    if 'NEAR BIT STABILIZER' in u or 'NEAR BIT STAB' in u or 'NEARBIT' in u or 'NB STAB' in u: return 'NEAR BIT STABILIZER'
    if 'STRING STABILIZER' in u or 'STRING STAB' in u or 'STB' in u or 'STABILIZER' in u: return 'STRING STAB'
    if 'TURBO BACK' in u: return 'TURBO BACK STAB'

    # Shock Tools
    if 'SHOCK TOOL' in u or 'SHOCK SUB' in u or 'SHOCK' in u: return 'SHOCK TOOL'

    # Pressure Control / BOP / Diverter
    if 'DIVERTER' in u or 'MSP' in u or ('FLOW TOOLS' in u and 'DIVERTER' in u): return 'DIVERTER'
    if 'ANNULAR BOP' in u or 'ANNULAR' in u: return 'ANNULAR BOP'
    if 'DOUBLE BOP' in u or 'SINGLE BOP' in u or 'BOP' in u: return '13-5/8" DOUBLE BOP'
    if 'RISER' in u or 'MARINE RISER' in u: return 'MARINE RISERS'

    # Overshot Controls & Packoffs
    if 'TYPE "A"' in u or 'TYPE A PACKOFF' in u or 'TYPE-A-PACKOFF' in u: return 'TYPE-A-PACKOFF'
    if 'SPIRAL GRAPPLE CONTROL' in u: return 'SPIRAL GRAPPLE CONTROL'
    if 'PLAIN CONTROL' in u or 'GRAPPLE CONTROL' in u: return 'PLAIN CONTROL'
    if 'MILL CONTROL' in u: return 'MILL CONTROL'
    if 'BASKET GRAPPLE' in u: return 'BASKET GRAPPLE'
    if 'SPIRAL GRAPPLE' in u or 'GRAPPLE' in u: return 'SPIRAL GRAPPLE'
    if 'HOLLOW MILL GUIDE' in u: return 'HOLLOW MILL GUIDE'
    if 'OVERSHOT EXTENSION' in u or 'O.SHOT EXT' in u: return 'O.SHOT EXT FS'
    if 'O.SIZE GUIDE' in u or 'OVERSIZE GUIDE' in u: return 'O.SIZE GUIDE'
    if 'WALL HOOK' in u: return 'WALL HOOK GUIDE'
    if 'CUTLIP' in u: return 'CUTLIP GUIDE'
    if 'BOWL' in u: return 'BOWL'
    if 'BULL NOSE' in u: return 'BULL NOSE'

    # Overshot Bodies
    if 'OVERSHOT FS' in u or 'FS OVERSHOT' in u: return 'OVERSHOT FS'
    if 'OVERSHOT SC' in u or 'SC OVERSHOT' in u: return 'OVERSHOT SC'
    if 'OVERSHOT SH' in u or 'SH OVERSHOT' in u: return 'OVERSHOT SH'
    if 'OVERSHOT' in u: return 'OVERSHOT FS'

    # Subs & Valves
    if 'FLOAT SUB' in u or 'FLOAT VALVE' in u: return 'FLOAT SUB'
    if 'CROSSOVER' in u or 'X-OVER' in u or 'XO' in u or 'C.BUSHING' in u or 'BUSHING' in u: return 'CROSSOVER'
    if 'SAFETY JOINT' in u: return 'SAFETY JOINT'
    if 'DRAIN' in u and 'SUB' in u: return 'DRAIN IN SUB'
    if 'SCREW IN SUB' in u: return 'SCREW IN SUB'
    if 'LIFT PLUG' in u or 'LIFTING PLUG' in u: return 'LIFT PLUG'
    if 'LIFT SUB' in u or 'LIFTING SUB' in u: return 'LIFT SUB'
    if 'STOP SUB' in u: return 'STOP SUB'
    if 'STOP COLLAR' in u: return 'STOP COLLAR'
    if 'STOP RING' in u: return 'STOP RING'

    # Mills
    if 'STRING MILL' in u or ('SM' in s and 'MILL' in u): return 'STRING MILL'
    if 'CASING MILL' in u: return 'CASING MILL'
    if 'PACKER MILL' in u: return 'PACKER MILL'
    if 'PILOT MILL' in u: return 'PILOT MILL'
    if 'TAPER MILL' in u: return 'TAPER MILL'
    if 'WATERMELON MILL' in u: return 'WATERMELON MILL'
    if 'WINDOW MILL' in u: return 'WINDOW MILL'
    if 'JUNK MILL' in u or 'MILL' in u: return 'JUNK MILL'

    # Washpipe & Shoes
    if 'WASHOVER SHOE' in u or 'WASHOVERSHOE' in u: return 'WASHOVERSHOE'
    if 'WASH PIPE' in u or 'WASHPIPE' in u: return 'WASHPIPE'

    # Handling & Rig Floor
    if 'CARGO BASKET' in u or 'BASKET' in u: return 'CARGO BASKET'
    if 'STABILIZER SKID' in u or 'SKID' in u: return 'SKID'
    if 'SLINGS' in u: return 'SLINGS'
    if 'ELEVATOR' in u: return 'SD.ELEVATOR'
    if 'SAFETY CLAMP' in u: return 'SAFETY CLAMP'
    if 'SLIP' in u: return 'SLIP - DC'

    # Tubulars & Drill String
    if 'NON-MAG' in u or 'NMDC' in u: return 'NMDC - SLICK'
    if 'DRILL COLLAR' in u or ('DC' in u and 'COLLAR' in u): return 'DRILL COLLAR'
    if 'HEAVY WEIGHT' in u or 'HWDP' in u: return 'H.W.DRILL PIPE'
    if 'DRILL PIPE' in u or ('DP' in u and 'PIPE' in u): return 'DRILL PIPE'
    if 'TUBING' in u: return 'TUBING'
    if 'PUP JOINT' in u: return 'PUP JOINT'

    # Spears & Whipstocks
    if 'SPEAR' in u: return 'RELEASING SPEAR'
    if 'WHIPSTOCK' in u: return 'WHIPSTOCK'
    if 'TAPER TAP' in u: return 'TAPER TAP'
    if 'DIE COLLAR' in u: return 'DIE COLLAR'
    if 'IMP. BLOCK' in u or 'IMPRESSION BLOCK' in u: return 'IMP. BLOCK'
    if 'RCJB' in u or 'POOR BUOY' in u or 'JUNK BASKET' in u: return 'RCJB'
    if 'PRT' in u or 'PACKER RETRIEVING' in u: return 'PRT'
    if 'MUD MOTOR' in u or 'MOTOR' in u: return 'MUD MOTOR'
    if 'SUB' in u: return 'BIT SUB'

    # Personnel / Engineers
    if 'ENGINEER' in u or 'SPECIALIST' in u or 'TECHNICIAN' in u: return 'FISHING ENGINEER'

    # Fallback to category list matches
    for cat in categories:
        if cat["upper"] in u:
            return cat["name"]

    return 'OTHER DOWNHOLE TOOL'

def classify_size(desc):
    u = (desc or '').upper()
    # 1. Look for fractional/decimal inches format: 29-1/2", 17-1/2", 8-3/8", 7", 9-5/8", 21-1/4", 6-3/4"
    m = re.search(r'(?<![0-9/.-])(\d+[\s-]+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?)\s*\"', u)
    if m:
        val = m.group(1).strip().replace(' ', '-')
        return val + '"'
    
    # 2. Check against validated size catalog
    for s in sizes_raw:
        if not s["clean"]: continue
        pat = r'(?<![0-9/.-])' + re.escape(s["clean"]) + r'("|\s*INCH|\s*OD|\s*ID|\s*WP|\b)'
        if re.search(pat, u):
            return s["name"]

    # 3. Check foot marks e.g. 17-1/4' or 12'
    m_foot = re.search(r'(?<![0-9/.-])(\d+[\s-]+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?)\s*\'', u)
    if m_foot:
        return m_foot.group(1).strip().replace(' ', '-') + '"'

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
    "lineItems": [],
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
            
        standby_price = parse_num(r.get("Standby Price"))
        oper_price = parse_num(r.get("Operating Price"))
        standby_days = parse_num(r.get("Standby Days"))
        oper_days = parse_num(r.get("Operating Days"))
        raw_total = parse_num(r.get("Total"))
        
        native_oper_rev = round(oper_days * oper_price, 2)
        native_standby_rev = round(standby_days * standby_price, 2)
        
        total = raw_total if raw_total > 0 else round(native_oper_rev + native_standby_rev, 2)
        
        # If rates were 0 but total was populated
        if standby_price == 0 and oper_price == 0 and total > 0:
            if oper_days > 0 and standby_days == 0:
                native_oper_rev = total
            elif standby_days > 0 and oper_days == 0:
                native_standby_rev = total
            elif oper_days > 0 and standby_days > 0:
                total_days = oper_days + standby_days
                native_oper_rev = round(total * (oper_days / total_days), 2)
                native_standby_rev = round(total - native_oper_rev, 2)

        # Classification
        cat = classify_category(desc, serial)
        size = classify_size(desc)
        
        meta = jobs_meta.get(j_id.upper(), {})
        client = meta.get("client", "") or "ADNOC"
        contract = meta.get("project", "") or "4700023861"
        rig = meta.get("rig", "")
        
        is_aed = contract in AED_CONTRACTS
        currency = "AED" if is_aed else "USD"
        
        if is_aed:
            tot_aed = total
            oper_aed = native_oper_rev
            sb_aed = native_standby_rev
            
            tot_usd = round(total / USD_AED_RATE, 2)
            oper_usd = round(native_oper_rev / USD_AED_RATE, 2)
            sb_usd = round(native_standby_rev / USD_AED_RATE, 2)
        else:
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
            
        # Store individual line item for transparent audit and tool detail view
        if total > 0 or oper_days > 0 or standby_days > 0:
            t["lineItems"].append({
                "jobId": j_id,
                "dtNumber": dt_num,
                "itemDesc": desc,
                "standbyPrice": standby_price,
                "operPrice": oper_price,
                "standbyDays": standby_days,
                "operDays": oper_days,
                "lineTotal": total,
                "contract": contract,
                "client": client,
                "currency": currency,
            })
            
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
        cnt["contract"] = contract or "4700023861"
        cnt["client"] = client or "ADNOC ONSHORE - RENTALS"
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
        "lineItems": data["lineItems"][:30], # Up to 30 individual job invoice lines for modal audit
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
print(f"Total Tools: {output['summary']['totalTools']:,} | Categories: {output['summary']['totalCategories']} | Sizes: {output['summary']['totalSizes']}")
