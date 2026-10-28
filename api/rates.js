'use strict'
/**
 * Shared contract-rate resolution.
 *
 * Nothing in this file names a contract, a category, a size or a hole
 * section. Every rule is derived from the shape of the rows in
 * tbl_ContractRates, so a new contract loaded tomorrow resolves without a
 * code change.
 *
 * Real tbl_ContractRates columns (confirmed via INFORMATION_SCHEMA):
 *   RateID, ContractCode, ContractName, ContractRef, Category,
 *   EMDADShortDesc, Size, HoleSection, OpsRate, StandbyRate, RunCharges,
 *   Redress, Currency, Notes, ActiveFlag, MonthlyCharges
 *
 * Two facts about the data that shape the logic here:
 *
 *  1. Contract codes do not always agree between tables. 178 jobs carry
 *     '4700024608' while its rates are filed as '4700024608-UDR' and
 *     '-UZ'. Matching is therefore on the base code, in both directions.
 *
 *  2. Some contracts price by hole section rather than tool size. On
 *     4700024096, 18 categories have six rate rows each - one per hole
 *     range - and no Size dimension at all, so an 8-3/8" and an 8-1/4"
 *     stabilizer in the same hole carry the same rate. Size cannot
 *     distinguish them; only the hole can.
 *
 *     We detect that from the data: a category whose rows hold more than
 *     one distinct HoleSection is hole-priced. No list of contract codes
 *     or range strings appears anywhere.
 */

const { query } = require('./db')

// ── normalisation ──────────────────────────────────────────────────────────
// Upper-cases, collapses runs of whitespace, and folds the several quote
// characters that appear in sizes (8", 8″, 8'') to one. Character-level
// only - no value lists.
function norm (v) {
  if (v == null) return ''
  return String(v)
    .replace(/[′″‘’“”`']/g, '"')
    .replace(/""+/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

// A HoleSection or Size cell carrying no information. Blank, or a
// placeholder of the 'N/A' family. Judged by shape, not by a list of
// contract-specific strings.
function isBlankish (v) {
  const s = norm(v)
  return s === '' || /^(N\/?A|NA|NIL|NONE|-+)$/.test(s)
}

// Strip a trailing scope suffix: '4700024608-UDR' -> '4700024608'.
// Only strips a suffix that is letters, so a code that is genuinely
// hyphenated-numeric ('TW-2025-1026', 'DVP-2023-K-016') is left alone.
function baseCode (code) {
  const s = norm(code)
  const m = /^(.*?)-([A-Z]{1,6})$/.exec(s)
  return m && /\d/.test(m[1]) ? m[1] : s
}

// ── loading ────────────────────────────────────────────────────────────────
/**
 * Every active rate row belonging to a contract, matched on the base code
 * so a job and its rate sheet find each other through a scope suffix.
 */
async function loadContractRates (contractCode) {
  if (isBlankish(contractCode)) return []
  const base = baseCode(contractCode)

  const r = await query(
    `SELECT RateID, ContractCode, Category, EMDADShortDesc, Size, HoleSection,
            OpsRate, StandbyRate, RunCharges, Redress, MonthlyCharges, Currency
       FROM tbl_ContractRates
      WHERE ActiveFlag = 1
        AND (  UPPER(LTRIM(RTRIM(ContractCode)))        = @base
            OR UPPER(LTRIM(RTRIM(ContractCode))) LIKE   @base + '-%'
            OR @base LIKE UPPER(LTRIM(RTRIM(ContractCode))) + '-%' )`,
    [{ name: 'base', value: base }]
  )
  return r.recordset
}

// ── shape of a contract ────────────────────────────────────────────────────
/**
 * Collapse rows that are the same price under a different contract scope.
 * A contract filed as both '-UDR' and '-UZ' returns every row twice, which
 * would otherwise wreck the row counts the shape test below relies on.
 * Keyed on what actually identifies a rate: category, size, hole section.
 */
function dedupe (rates) {
  const seen = new Map()
  for (const r of rates) {
    const k = `${norm(r.Category)}|${norm(r.Size)}|${norm(r.HoleSection)}`
    if (!seen.has(k)) seen.set(k, r)
  }
  return [...seen.values()]
}

/**
 * Categories in this contract that are priced by hole section.
 *
 * The test is NOT "has several hole sections" — that misreads a category
 * like NMDC - PONY, whose HoleSection column holds sizes ('4-3/4"') rather
 * than ranges, and would then demand a hole range that cannot match.
 *
 * The test is whether Size can tell the rows apart. When each row in a
 * category carries its own distinct Size, the contract prices by size and
 * HoleSection is decoration. When it cannot — the banded rows share one
 * Size, or have none — the hole section is the only thing left that
 * distinguishes them, and so it is what prices the line.
 *
 * Returns a Map: normalised category -> array of HoleSection values.
 */
function holePricedCategories (rates) {
  const rows = dedupe(rates)

  const byCat = new Map()
  for (const r of rows) {
    const k = norm(r.Category)
    if (!byCat.has(k)) byCat.set(k, [])
    byCat.get(k).push(r)
  }

  const out = new Map()
  for (const [k, list] of byCat) {
    const sizes = new Set(list.map(r => norm(r.Size)))
    const holes = new Set(list.filter(r => !isBlankish(r.HoleSection))
                              .map(r => String(r.HoleSection).trim()))

    // Size identifies every row on its own -> priced by size.
    const sizeDistinguishes = sizes.size === list.length && !sizes.has('')

    if (!sizeDistinguishes && holes.size > 1) out.set(k, [...holes])
  }
  return out
}

/**
 * The hole sections a delivery ticket on this contract may choose from —
 * the union across every hole-priced category, so one pick on the ticket
 * covers all its lines.
 *
 * A contract with no hole-priced categories returns [], and the UI then
 * shows no hole-section field at all.
 */
function listHoleSections (rates) {
  const seen = new Map()
  for (const list of holePricedCategories(rates).values())
    for (const h of list) if (!seen.has(norm(h))) seen.set(norm(h), h)
  return [...seen.values()].sort(compareHoleSections)
}

/**
 * Orders hole sections by the first number appearing in them, so the list
 * reads smallest hole first. Derived from the text, not a fixed order.
 */
function compareHoleSections (a, b) {
  const lowerBound = (s) => {
    const str = String(s)
    // first number in the string, honouring 17-1/2 and 9-5/8
    const m = /(\d+)(?:\s*-\s*(\d+)\s*\/\s*(\d+))?/.exec(str)
    if (!m) return Number.MAX_SAFE_INTEGER

    // 'FOR LESS THAN 6" HOLE' starts at zero - its number is the ceiling,
    // not the floor. Without this it sorts next to the 6-8 band.
    const before = str.slice(0, m.index).toUpperCase()
    if (/\b(LESS\s+THAN|BELOW|UNDER|UP\s+TO|SMALLER)\b/.test(before)) return 0

    return Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0)
  }
  const d = lowerBound(a) - lowerBound(b)
  return d !== 0 ? d : String(a).localeCompare(String(b))
}

// ── resolution ─────────────────────────────────────────────────────────────
/**
 * Pick the rate row for one tool.
 *
 * @param rates  rows from loadContractRates()
 * @param tool   { category, size, holeSection }
 *               holeSection is the LINE's value if it has one, else the
 *               ticket's.
 *
 * Returns { rate, matchedOn, candidates } — rate is null when nothing
 * matches. `matchedOn` says which rule fired, so the screen can show why a
 * line is priced the way it is instead of presenting a number with no
 * provenance. `candidates` is what the Edit box offers when the match was
 * ambiguous or absent.
 */
function pickRate (rates, tool) {
  const cat  = norm(tool && tool.category)
  const size = norm(tool && tool.size)
  const hole = norm(tool && tool.holeSection)

  if (!cat) return { rate: null, matchedOn: 'no-category', candidates: [] }

  // Deduped, so a contract filed under two scope suffixes does not read as
  // two competing rates for the same tool.
  const forCat = dedupe(rates).filter(r => norm(r.Category) === cat)
  if (forCat.length === 0)
    return { rate: null, matchedOn: 'no-rate-for-category', candidates: [] }

  const holePriced = holePricedCategories(rates).has(cat)

  // A hole-priced category is resolved by hole section and nothing else —
  // its rows carry no usable Size, and guessing from size would silently
  // pick a wrong band.
  if (holePriced) {
    if (!hole)
      return { rate: null, matchedOn: 'hole-section-required', candidates: forCat }

    const hit = forCat.filter(r => norm(r.HoleSection) === hole)
    if (hit.length === 1)
      return { rate: hit[0], matchedOn: 'category+holeSection', candidates: forCat }
    if (hit.length > 1) {
      // more than one row in the same band - narrow by size if we can
      const bySize = hit.filter(r => norm(r.Size) === size)
      if (bySize.length === 1)
        return { rate: bySize[0], matchedOn: 'category+holeSection+size', candidates: hit }
      return { rate: null, matchedOn: 'ambiguous-in-hole-section', candidates: hit }
    }
    return { rate: null, matchedOn: 'hole-section-not-in-contract', candidates: forCat }
  }

  // Everything else prices on size.
  if (size) {
    const exact = forCat.filter(r => norm(r.Size) === size)
    if (exact.length === 1)
      return { rate: exact[0], matchedOn: 'category+size', candidates: forCat }
    if (exact.length > 1)
      return { rate: null, matchedOn: 'ambiguous-for-size', candidates: exact }
  }

  // A category with exactly one rate row needs no size at all.
  if (forCat.length === 1)
    return { rate: forCat[0], matchedOn: 'category-only', candidates: forCat }

  // Size-less rows act as the catch-all for the category.
  const anySize = forCat.filter(r => isBlankish(r.Size))
  if (anySize.length === 1)
    return { rate: anySize[0], matchedOn: 'category+anySize', candidates: forCat }

  return {
    rate: null,
    matchedOn: size ? 'size-not-in-contract' : 'size-required',
    candidates: forCat,
  }
}

/**
 * The day rate actually charged for one logged day.
 * StatusType '1' = operating, 'S' = standby. Any other code earns nothing.
 */
function dayRate (rate, statusType) {
  if (!rate) return null
  const s = norm(statusType)
  if (s === '1') return rate.OpsRate == null ? null : Number(rate.OpsRate)
  if (s === 'S') return rate.StandbyRate == null ? null : Number(rate.StandbyRate)
  return null
}

/**
 * What the per-line Edit box offers: every rate this contract holds for the
 * category, each with a label built from whatever distinguishes the rows.
 * Free numeric entry stays available in the UI for cases no row covers,
 * such as a redress charged per inch.
 */
function listRateOptions (rates, category) {
  const cat = norm(category)
  return dedupe(rates)
    .filter(r => norm(r.Category) === cat)
    .map(r => ({
      rateId:   r.RateID,
      label:    [r.HoleSection, r.Size].filter(v => !isBlankish(v)).join(' · ') || r.Category,
      ops:      r.OpsRate     == null ? null : Number(r.OpsRate),
      standby:  r.StandbyRate == null ? null : Number(r.StandbyRate),
      redress:  r.Redress     == null ? null : Number(r.Redress),
      monthly:  r.MonthlyCharges == null ? null : Number(r.MonthlyCharges),
      currency: r.Currency || null,
    }))
    .sort((a, b) => compareHoleSections(a.label, b.label))
}

module.exports = {
  norm, isBlankish, baseCode, dedupe,
  loadContractRates,
  holePricedCategories, listHoleSections, compareHoleSections,
  pickRate, dayRate, listRateOptions,
}
