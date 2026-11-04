import React, { useEffect, useMemo, useState } from 'react'
import { X, Printer, Save } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import { api } from '../utils/api'

// ADNOC Onshore final tax invoice (FR-00268 layout).
// Page 1 – lines in USD, Operational + Standby pair per tool, IP value.
// Page 2 – AED tax table (rate x 3.6725, taxable = line less ICV, VAT 5%) and totals.
// Company details (TRN, bank, terms, ICV %, VAT %, AED rate) live in tbl_AppSettings.

interface Line {
  LineID: number
  SerialNumber: string | null
  ToolDescription: string | null
  LineNumber: string | null
  OpsDays: number; StandbyDays: number
  OpsRate: number | null; StandbyRate: number | null
  OpsAmount: number; StandbyAmount: number
}
interface InvoiceHead {
  InvoiceNumber: string | null; LegalInvoiceNumber?: string | null; LegalInvoiceDate?: string | null
  InvoiceDate: string | null; Currency: string | null
}
export interface PrintInvoice {
  InvoiceID: string
  InvoiceNumber: string | null
  JobID: string | null
  InvoiceDate: string | null
  Client: string | null
  Rig: string | null
  Well: string | null
  Contract: string | null
  PONumber: string | null
  PeriodFrom: string | null
  PeriodTo: string | null
  Currency: string | null
}

type Profile = Record<string, string>

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (v: string | null | undefined) => (v ? v.split('T')[0] : '')
const fmtDate = (v: string | null | undefined) => {
  const d = day(v); if (!d) return ''
  const [y, m, dd] = d.split('-'); return `${dd}-${m}-${y}`
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
function below1000(n: number): string {
  const p: string[] = []
  if (n >= 100) { p.push(ONES[Math.floor(n / 100)] + ' hundred'); n %= 100 }
  if (n >= 20) { p.push(TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '')) }
  else if (n > 0) p.push(ONES[n])
  return p.join(' ')
}
function words(n: number): string {
  if (n === 0) return 'zero'
  const parts: string[] = []
  for (const [v, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as [number, string][]) {
    if (n >= v) { parts.push(below1000(Math.floor(n / v)) + ' ' + name); n %= v }
  }
  if (n > 0) parts.push(below1000(n))
  return parts.join(' ')
}
export function amountInWords(amount: number, major = 'US Dollars', minor = 'cents'): string {
  const whole = Math.floor(amount + 1e-9)
  const cents = Math.round((amount - whole) * 100)
  const t = `${major} ${words(whole)}` + (cents ? ` and ${words(cents)} ${minor}` : '') + ' only'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const FIELDS: [string, string][] = [
  ['companyName', 'Company name'], ['companyAddress', 'Address'], ['trn', 'TRN'],
  ['paymentTerms', 'Payment terms'], ['bankName', 'Bank'], ['bankBranch', 'Branch'],
  ['accountName', 'Account name'], ['accountNo', 'Account no.'], ['iban', 'IBAN'], ['swift', 'SWIFT'],
  ['icvPercent', 'ICV retention %'], ['vatPercent', 'VAT %'], ['aedRate', 'AED per USD'],
  ['preparedBy', 'Prepared by'], ['authorisedBy', 'Authorised by'],
]

export function AdnocTaxInvoice({ inv, onClose }: { inv: PrintInvoice; onClose: () => void }) {
  const { hasRole } = useAuth()
  const { success, error: toastErr } = useToast()
  const isAdmin = hasRole('Admin')

  const { data: lines } = useFetch<Line[]>(`/invoices/${inv.InvoiceID}/lines`)
  const { data: head } = useFetch<InvoiceHead>(`/invoices/${inv.InvoiceID}`)
  const { data: saved, refetch } = useFetch<Profile>('/invoices/profile')

  const [prof, setProf] = useState<Profile>({})
  const [edit, setEdit] = useState(false)
  const [erp, setErp] = useState('')
  const [dueDate, setDueDate] = useState('')
  useEffect(() => { if (saved) setProf(saved) }, [saved])

  const icvPct = Number(prof.icvPercent || 5)
  const vatPct = Number(prof.vatPercent || 5)
  const rate = Number(prof.aedRate || 3.6725)

  // Operational + Standby row per tool
  const rows = useMemo(() => {
    const out: { item: number; kind: 'Operational' | 'Standby'; serial: string; desc: string; qty: number; price: number; amount: number }[] = []
    ;(lines || []).forEach((l, i) => {
      const base = { item: i + 1, serial: l.SerialNumber || '', desc: l.ToolDescription || '' }
      if (Number(l.OpsDays) > 0)
        out.push({ ...base, kind: 'Operational', qty: Number(l.OpsDays), price: Number(l.OpsRate || 0), amount: Number(l.OpsAmount) })
      if (Number(l.StandbyDays) > 0)
        out.push({ ...base, kind: 'Standby', qty: Number(l.StandbyDays), price: Number(l.StandbyRate || 0), amount: Number(l.StandbyAmount) })
    })
    return out
  }, [lines])

  const ip = r2(rows.reduce((s, r) => s + r.amount, 0))
  const taxRows = rows.map(r => {
    const aed = r2(r.amount * rate)
    const taxable = r2(aed * (1 - icvPct / 100))
    const vat = r2(taxable * vatPct / 100)
    return { aed, taxable, vat }
  })
  const taxableAed = r2(taxRows.reduce((s, r) => s + r.taxable, 0))
  const vatAed = r2(taxRows.reduce((s, r) => s + r.vat, 0))
  const icv = r2(ip * icvPct / 100)
  const taxableUsd = r2(ip - icv)
  const vatUsd = r2(taxableUsd * vatPct / 100)
  const net = r2(taxableUsd + vatUsd)

  const invNo = head?.LegalInvoiceNumber || inv.InvoiceNumber || ''
  const invDate = head?.LegalInvoiceDate || inv.InvoiceDate

  const saveProfile = async () => {
    try { await api.put('/invoices/profile', prof); success('Invoice details saved'); setEdit(false); refetch() }
    catch (e: any) { toastErr(e.message || 'Save failed') }
  }

  const th = 'border border-gray-700 px-1.5 py-1 text-left font-bold bg-gray-100'
  const td = 'border border-gray-700 px-1.5 py-0.5'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col print:bg-white print:static print:block">
      <div className="no-print flex items-center gap-2 bg-[#0b192c] text-white px-3 h-10 shrink-0">
        <span className="font-bold text-[13px]">ADNOC ONSHORE TAX INVOICE</span>
        <span className="font-mono text-amber-400 text-[13px]">{invNo}</span>
        <div className="ml-auto flex gap-2">
          {isAdmin && (
            <button className="btn-mini" onClick={() => setEdit(e => !e)}>{edit ? 'Hide details' : 'Company / bank details'}</button>
          )}
          <button className="btn-accent" onClick={() => window.print()}><Printer size={13} /> Print / Save PDF</button>
          <button onClick={onClose} className="hover:text-amber-400"><X size={18} /></button>
        </div>
      </div>

      {edit && (
        <div className="no-print bg-white border-b p-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px] shrink-0 max-h-[40vh] overflow-auto">
          {FIELDS.map(([k, label]) => (
            <label key={k} className="flex flex-col">
              <span className="text-[10px] uppercase text-gray-500">{label}</span>
              <input className="field-input" value={prof[k] || ''} onChange={e => setProf(p => ({ ...p, [k]: e.target.value }))} />
            </label>
          ))}
          <button className="btn-accent self-end" onClick={saveProfile}><Save size={12} /> Save details</button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 print:p-0 print:overflow-visible">
        <div className="invoice-print mx-auto bg-white text-black text-[11px] leading-snug"
             style={{ width: '210mm' }}>
          {/* ───── Page 1 – USD ───── */}
          <section className="inv-page p-[10mm]">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <img src="/emdad-logo.png" alt="EMDAD" className="h-12" />
                <div>
                  <div className="font-bold text-[14px]">{prof.companyName || 'EMDAD LLC'}</div>
                  <div className="whitespace-pre-line">{prof.companyAddress}</div>
                  {prof.trn && <div>TRN: {prof.trn}</div>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[18px] font-bold">TAX INVOICE</div>
                <div>Invoice No: <b>{invNo}</b></div>
                <div>Invoice Date: <b>{fmtDate(invDate)}</b></div>
              </div>
            </div>

            <table className="w-full mt-3 border-collapse">
              <tbody>
                <tr><td className={td}>Bill To</td><td className={td}><b>{inv.Client || 'ADNOC Onshore'}</b></td>
                    <td className={td}>PO / Task Order</td><td className={td}><b>{inv.PONumber}</b></td></tr>
                <tr><td className={td}>Contract</td><td className={td}>{inv.Contract}</td>
                    <td className={td}>Job No.</td><td className={td}>{inv.JobID}</td></tr>
                <tr><td className={td}>Rig</td><td className={td}>{inv.Rig}</td>
                    <td className={td}>Well</td><td className={td}>{inv.Well}</td></tr>
                <tr><td className={td}>Service period</td><td className={td}>{fmtDate(inv.PeriodFrom)} to {fmtDate(inv.PeriodTo)}</td>
                    <td className={td}>Payment terms</td><td className={td}>{prof.paymentTerms}</td></tr>
                <tr><td className={td}>ERP ref.</td>
                    <td className={td}><input className="no-print-border w-full bg-transparent" value={erp} onChange={e => setErp(e.target.value)} placeholder="enter ERP ref" /></td>
                    <td className={td}>Due date</td>
                    <td className={td}><input type="date" className="bg-transparent" value={dueDate} onChange={e => setDueDate(e.target.value)} /></td></tr>
              </tbody>
            </table>

            <table className="w-full mt-3 border-collapse">
              <thead>
                <tr><th className={th}>Item</th><th className={th}>Code / Description</th><th className={th}>Our part</th>
                    <th className={th + ' text-right'}>Qty (days)</th><th className={th + ' text-right'}>Unit price ({inv.Currency || 'USD'})</th>
                    <th className={th + ' text-right'}>Amount ({inv.Currency || 'USD'})</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className={td}>{r.item}</td>
                    <td className={td}>{r.desc} – <b>{r.kind}</b></td>
                    <td className={td + ' font-mono'}>{r.serial}</td>
                    <td className={td + ' text-right'}>{r.qty}</td>
                    <td className={td + ' text-right'}>{money(r.price)}</td>
                    <td className={td + ' text-right'}>{money(r.amount)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td className={td + ' text-center text-gray-500'} colSpan={6}>No invoice lines – use “Generate from Utilization” on the invoice first.</td></tr>}
              </tbody>
            </table>

            <div className="flex justify-end mt-2">
              <table className="border-collapse w-[75mm]">
                <tbody>
                  <tr><td className={td}>Invoice Progress (IP) value</td><td className={td + ' text-right font-bold'}>{money(ip)}</td></tr>
                  <tr><td className={td}>Less {icvPct}% ICV retention</td><td className={td + ' text-right'}>({money(icv)})</td></tr>
                  <tr><td className={td}>Total taxable</td><td className={td + ' text-right'}>{money(taxableUsd)}</td></tr>
                  <tr><td className={td}>VAT {vatPct}%</td><td className={td + ' text-right'}>{money(vatUsd)}</td></tr>
                  <tr><td className={td + ' font-bold bg-gray-100'}>Net payable ({inv.Currency || 'USD'})</td><td className={td + ' text-right font-bold bg-gray-100'}>{money(net)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="mt-2"><b>Amount in words:</b> {amountInWords(net)}</div>
          </section>

          {/* ───── Page 2 – AED tax schedule ───── */}
          <section className="inv-page p-[10mm]" style={{ breakBefore: 'page' }}>
            <div className="font-bold text-[13px]">TAX SCHEDULE (AED) – Invoice {invNo}</div>
            <div className="mb-2">Exchange rate: 1 USD = {rate} AED · ICV retention {icvPct}% · VAT {vatPct}%</div>
            <table className="w-full border-collapse">
              <thead>
                <tr><th className={th}>Item</th><th className={th}>Description</th>
                    <th className={th + ' text-right'}>Qty</th><th className={th + ' text-right'}>Unit price AED</th>
                    <th className={th + ' text-right'}>Amount AED</th><th className={th + ' text-right'}>Taxable AED</th>
                    <th className={th + ' text-right'}>VAT AED</th><th className={th + ' text-right'}>Gross AED</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className={td}>{r.item}</td>
                    <td className={td}>{r.desc} – {r.kind}</td>
                    <td className={td + ' text-right'}>{r.qty}</td>
                    <td className={td + ' text-right'}>{money(r2(r.price * rate))}</td>
                    <td className={td + ' text-right'}>{money(taxRows[i].aed)}</td>
                    <td className={td + ' text-right'}>{money(taxRows[i].taxable)}</td>
                    <td className={td + ' text-right'}>{money(taxRows[i].vat)}</td>
                    <td className={td + ' text-right'}>{money(r2(taxRows[i].taxable + taxRows[i].vat))}</td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td className={td} colSpan={4}>Total</td>
                  <td className={td + ' text-right'}>{money(r2(taxRows.reduce((s, r) => s + r.aed, 0)))}</td>
                  <td className={td + ' text-right'}>{money(taxableAed)}</td>
                  <td className={td + ' text-right'}>{money(vatAed)}</td>
                  <td className={td + ' text-right'}>{money(r2(taxableAed + vatAed))}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-2"><b>Total tax (VAT) AED:</b> {money(vatAed)} · <b>Amount in words (AED):</b> {amountInWords(r2(taxableAed + vatAed), 'UAE Dirhams', 'fils')}</div>

            <div className="mt-6 border border-gray-700 p-2">
              <div className="font-bold mb-1">Please remit to</div>
              <div>Account name: {prof.accountName}</div>
              <div>Bank: {prof.bankName} {prof.bankBranch}</div>
              <div>Account no.: {prof.accountNo}</div>
              <div>IBAN: {prof.iban}</div>
              <div>SWIFT: {prof.swift}</div>
            </div>

            <div className="grid grid-cols-2 gap-10 mt-14">
              <div className="border-t border-gray-700 pt-1">Prepared by: {prof.preparedBy}</div>
              <div className="border-t border-gray-700 pt-1">Authorised by: {prof.authorisedBy}</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
