import React from 'react'
import { Printer, X } from 'lucide-react'
import { formatDate } from '../utils/format'

export interface PrintLine {
  n: number; assetNo: string | null; description: string | null; size: string | null; qty: number | null
  category?: string | null; supplier?: string | null; extra?: string | null; remarks?: string | null
}
export interface PrintTicket {
  kind: 'DT' | 'RT'
  number: string
  client: string | null; job: string | null; rig: string | null; well: string | null
  date: string | null; po: string | null; clientRef: string | null; linkedDT?: string | null; manifest?: string | null
  vehicle: string | null; driver?: string | null; hole?: string | null
  emdadRep: string | null; emdadSignDate: string | null; clientSignedBy: string | null; clientSignDate: string | null
  notes: string | null
  lines: PrintLine[]
}

/**
 * The delivery / receiving ticket the rig signs, printed from the app so the
 * signed copy and the app record are the same document. Reuses the
 * invoice-print rules in index.css (A4, everything else hidden).
 */
export function TicketPrint({ t, onClose }: { t: PrintTicket; onClose: () => void }) {
  const title = t.kind === 'DT' ? 'DELIVERY TICKET' : 'RECEIVING TICKET'
  const extraHead = t.kind === 'DT' ? 'RGT / Date In' : 'Usage / Condition'
  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-auto">
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 bg-navy-head text-white px-4 py-2">
        <span className="font-semibold text-sm">{title} {t.number}</span>
        <button className="btn-accent ml-auto" onClick={() => window.print()}><Printer size={13} /> Print / Save PDF</button>
        <button className="btn-ghost text-white" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="invoice-print bg-white mx-auto my-4 shadow-xl text-[11px] text-black" style={{ width: '210mm', minHeight: '297mm', padding: '12mm' }}>
        <div className="flex items-start justify-between border-b-2 border-black pb-2">
          <div className="flex items-center gap-3">
            <img src="/emdad-logo.png" alt="EMDAD" style={{ height: 40 }} />
            <div>
              <div className="font-bold text-[14px]">EMDAD LLC</div>
              <div className="text-[10px]">Well Intervention · Upstream Services · Abu Dhabi, UAE</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-[16px] tracking-wide">{title}</div>
            <div className="font-mono text-[13px]">{t.number}</div>
            <div className="text-[10px]">Date: {formatDate(t.date) || '—'}</div>
          </div>
        </div>

        <table className="w-full mt-3 border-collapse" style={{ fontSize: 11 }}>
          <tbody>
            {[
              ['Customer', t.client, 'Job Number', t.job],
              ['Rig', t.rig, 'Well', t.well],
              [t.kind === 'DT' ? 'PO / Taskorder' : 'Linked DT', t.kind === 'DT' ? t.po : t.linkedDT, 'Client Ref', t.clientRef],
              [t.kind === 'DT' ? 'Hole Section' : 'Manifest No', t.kind === 'DT' ? t.hole : t.manifest, 'Vehicle / Vessel', t.vehicle],
            ].map(([l1, v1, l2, v2], i) => (
              <tr key={i}>
                <td className="border border-gray-400 px-2 py-1 font-semibold bg-gray-100 w-[22%]">{l1}</td>
                <td className="border border-gray-400 px-2 py-1 w-[28%]">{v1 || ''}</td>
                <td className="border border-gray-400 px-2 py-1 font-semibold bg-gray-100 w-[22%]">{l2}</td>
                <td className="border border-gray-400 px-2 py-1 w-[28%]">{v2 || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="w-full mt-3 border-collapse" style={{ fontSize: 10.5 }}>
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-1 py-1 w-7">#</th>
              <th className="border border-gray-400 px-1 py-1 text-left">Part / Asset No</th>
              <th className="border border-gray-400 px-1 py-1 text-left">Description</th>
              <th className="border border-gray-400 px-1 py-1">Size</th>
              <th className="border border-gray-400 px-1 py-1 w-9">Qty</th>
              <th className="border border-gray-400 px-1 py-1 text-left">Category</th>
              <th className="border border-gray-400 px-1 py-1 text-left">{extraHead}</th>
              <th className="border border-gray-400 px-1 py-1 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {t.lines.map(l => (
              <tr key={l.n}>
                <td className="border border-gray-400 px-1 py-0.5 text-center">{l.n}</td>
                <td className="border border-gray-400 px-1 py-0.5 font-mono">{l.assetNo || ''}</td>
                <td className="border border-gray-400 px-1 py-0.5">{l.description || ''}</td>
                <td className="border border-gray-400 px-1 py-0.5 text-center">{l.size || ''}</td>
                <td className="border border-gray-400 px-1 py-0.5 text-center">{l.qty ?? 1}</td>
                <td className="border border-gray-400 px-1 py-0.5">{l.category || ''}</td>
                <td className="border border-gray-400 px-1 py-0.5">{l.extra || ''}</td>
                <td className="border border-gray-400 px-1 py-0.5">{l.remarks || ''}</td>
              </tr>
            ))}
            {t.lines.length === 0 && <tr><td colSpan={8} className="border border-gray-400 px-2 py-3 text-center text-gray-500">No lines</td></tr>}
          </tbody>
        </table>

        {t.notes && <div className="mt-2"><span className="font-semibold">Notes: </span>{t.notes}</div>}

        <table className="w-full mt-6 border-collapse" style={{ fontSize: 11 }}>
          <tbody>
            <tr>
              <td className="border border-gray-400 px-2 py-1 font-semibold bg-gray-100 w-1/2">{t.kind === 'DT' ? 'Prepared by (EMDAD)' : 'Received by (EMDAD)'}</td>
              <td className="border border-gray-400 px-2 py-1 font-semibold bg-gray-100 w-1/2">{t.kind === 'DT' ? 'Delivered to (Client)' : 'Returned by (Client)'}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 h-16 align-top">Name: {t.emdadRep || ''}<br />Date: {formatDate(t.emdadSignDate) || ''}<br /><br />Signature:</td>
              <td className="border border-gray-400 px-2 py-1 h-16 align-top">Name: {t.clientSignedBy || ''}<br />Date: {formatDate(t.clientSignDate) || ''}<br /><br />Signature &amp; stamp:</td>
            </tr>
            {t.kind === 'DT' && t.driver && (
              <tr><td className="border border-gray-400 px-2 py-1" colSpan={2}>Driver: {t.driver}</td></tr>
            )}
          </tbody>
        </table>
        <div className="mt-4 text-[9px] text-gray-500">Printed from EMDAD Tool Tracker · {new Date().toLocaleString('en-GB')}</div>
      </div>
    </div>
  )
}
