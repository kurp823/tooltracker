import React, { useState } from 'react';
import {
  X,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  FileText,
  Truck,
  ArrowDownLeft,
  Building2,
  ExternalLink,
  ShieldCheck,
  DollarSign,
  Layers,
} from 'lucide-react';
import { DrillingJob, DTBatch, RTBatch } from '../types';
import { resolveJobStage, isLegalInvoiceNumber, STAGE_DEFINITIONS } from '../jobLifecycle';
import { JobLifecycleStepper } from './JobLifecycleStepper';

interface JobDetailModalProps {
  job: DrillingJob;
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  onClose: () => void;
  onOpenStatusModal?: () => void;
  canEdit?: boolean;
  formatJobDate: (d?: string | null) => string;
  renderStatusBadge: (job: DrillingJob, dtCount?: number, rtCount?: number) => React.ReactNode;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({
  job,
  dtBatches,
  rtBatches,
  onClose,
  onOpenStatusModal,
  canEdit = false,
  formatJobDate,
  renderStatusBadge,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'dts' | 'rts' | 'lifecycle'>('overview');

  // Compute tool counts
  const dtCount = dtBatches.reduce((acc, b) => acc + (b.toolLines?.length || 0), 0);
  const rtCount = rtBatches.reduce((acc, b) => acc + (b.toolLines?.length || 0), 0);
  const stage = resolveJobStage(job, dtCount, rtCount);
  const stageDef = STAGE_DEFINITIONS[stage];

  const hasLegal = isLegalInvoiceNumber(job.legalInvoiceNumber);
  const legalNumberDisplay = hasLegal ? job.legalInvoiceNumber : null;

  // ERP invoice number (Under Approval if not legal FSH/FR/WHP)
  const erpNumberDisplay =
    job.draftInvoiceNumber && job.draftInvoiceNumber.trim() !== '' && job.draftInvoiceNumber.trim() !== '—'
      ? job.draftInvoiceNumber
      : !hasLegal && job.legalInvoiceNumber && job.legalInvoiceNumber.trim() !== '' && job.legalInvoiceNumber.trim() !== '—'
      ? job.legalInvoiceNumber
      : null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 no-print animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Compact Header Bar */}
        <div className="px-4 py-2.5 bg-[#1a3055] text-white flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-amber-300 text-xs">
              {job.id}
            </span>
            <span className="text-slate-400 text-xs">&bull;</span>
            <span className="text-xs font-bold text-white">
              Rig: {job.rig || 'Unassigned'}
            </span>
            {job.well && job.well !== '—' && job.well !== '-' && (
              <span className="text-slate-300 text-xs font-normal">
                ({job.well})
              </span>
            )}
            <span className="text-slate-400 text-xs">&bull;</span>
            <span className="text-slate-300 text-xs truncate max-w-[180px]">
              {job.client || 'ADNOC'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {renderStatusBadge(job, dtCount, rtCount)}

            <button
              onClick={handlePrint}
              className="p-1 rounded bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition cursor-pointer"
              title="Print Job Dossier"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition cursor-pointer"
              title="Close window (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Compact Tab Strip */}
        <div className="px-4 bg-slate-100 border-b border-slate-200 flex items-center gap-1 flex-shrink-0 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-[#1a3055] text-[#1a3055] font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3 h-3" />
            <span>Commercial &amp; Job Details</span>
          </button>

          <button
            onClick={() => setActiveTab('dts')}
            className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'dts'
                ? 'border-[#1a3055] text-[#1a3055] font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-3 h-3" />
            <span>Delivery Tickets ({dtBatches.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('rts')}
            className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'rts'
                ? 'border-[#1a3055] text-[#1a3055] font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowDownLeft className="w-3 h-3" />
            <span>Receiving Tickets ({rtBatches.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('lifecycle')}
            className={`py-2 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'lifecycle'
                ? 'border-[#1a3055] text-[#1a3055] font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Milestones</span>
          </button>
        </div>

        {/* Tab Content Body - Compact & Clean */}
        <div className="p-3.5 overflow-y-auto flex-1 text-xs space-y-3">
          {/* TAB 1: OVERVIEW & COMMERCIAL */}
          {activeTab === 'overview' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Field & Contractual Parameters */}
                <div className="bg-slate-50 border border-slate-200 rounded p-2.5 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                    <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-[#1a3055]" />
                      <span>Operational Assignment</span>
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500">
                      {job.rig || 'RIG'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block">Client</span>
                      <span className="font-bold text-slate-900">{job.client || '—'}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block">Project Code</span>
                      <span className="font-mono text-slate-800">{job.contract || '—'}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block">PO Number</span>
                      <span className="font-mono text-slate-800">{job.poNumber || '—'}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block">Service Type</span>
                      <span className="text-slate-800">{job.serviceType || 'Downhole Rental'}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block">Mob Date</span>
                      <span className="font-mono text-slate-800">{formatJobDate(job.mobDate)}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block">Demob Date</span>
                      <span className="font-mono text-slate-800">{formatJobDate(job.demobDate)}</span>
                    </div>
                  </div>
                </div>

                {/* Commercial Clearance & Invoice Status */}
                <div className="bg-slate-50 border border-slate-200 rounded p-2.5 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                    <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-[#1a3055]" />
                      <span>Commercial Clearance</span>
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500">
                      FINANCIAL
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between p-1.5 rounded bg-white border border-slate-200">
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase">
                          Legal Invoice Number
                        </div>
                        <div className="text-[9px] text-slate-400">
                          Prefix FSH, FR, or WHP
                        </div>
                      </div>
                      <div className="text-right">
                        {legalNumberDisplay ? (
                          <div className="flex items-center gap-1 font-mono font-bold text-slate-900 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{legalNumberDisplay}</span>
                          </div>
                        ) : (
                          <span className="text-amber-700 font-bold text-[11px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Under Approval
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-1.5 rounded bg-white border border-slate-200">
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase">
                          ERP / Draft Invoice
                        </div>
                      </div>
                      <div className="font-mono font-semibold text-slate-800 text-xs">
                        {erpNumberDisplay || '—'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-1.5 rounded bg-white border border-slate-200">
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase">
                          Job Value / Amount
                        </div>
                      </div>
                      <div className="font-mono font-bold text-emerald-800 text-xs">
                        {(() => {
                          const val = job.invoiceAmount || (typeof job.cost === 'number' ? job.cost : parseFloat(String(job.cost || '').replace(/[^0-9.-]/g, '')) || 0);
                          return val
                            ? `$${Number(val).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })} USD`
                            : '—';
                        })()}
                      </div>
                    </div>

                    {/* Compact Signoff verification */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px]">
                      <div className="p-1 rounded bg-white border border-slate-200 flex items-center justify-center gap-1">
                        {dtBatches.length > 0 ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Clock className="w-3 h-3 text-slate-400" />
                        )}
                        <span className="font-medium">DT Tickets</span>
                      </div>

                      <div className="p-1 rounded bg-white border border-slate-200 flex items-center justify-center gap-1">
                        {rtBatches.length > 0 ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Clock className="w-3 h-3 text-slate-400" />
                        )}
                        <span className="font-medium">RT Tickets</span>
                      </div>

                      <div className="p-1 rounded bg-white border border-slate-200 flex items-center justify-center gap-1">
                        {job.signedUtilizationAttached ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Clock className="w-3 h-3 text-slate-400" />
                        )}
                        <span className="font-medium">Rig Sheet</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Action / Pipeline Bar */}
              <div className="p-2.5 rounded bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-800 text-xs">
                    Current Milestone: {stageDef.label}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {stageDef.description}
                  </div>
                </div>

                {canEdit && stage !== '6_completed' && onOpenStatusModal && (
                  <button
                    onClick={onOpenStatusModal}
                    className="px-2.5 py-1 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#234270] transition cursor-pointer"
                  >
                    Update Stage &rarr;
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DELIVERY TICKETS (DT) */}
          {activeTab === 'dts' && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-800">
                Dispatched Delivery Tickets ({dtBatches.length})
              </div>

              {dtBatches.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded border border-slate-200 text-center text-slate-400">
                  <div className="font-medium text-slate-600">No Delivery Tickets Dispatched</div>
                </div>
              ) : (
                <div className="border border-slate-200 rounded overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2 font-mono">DT Number</th>
                        <th className="p-2">Date</th>
                        <th className="p-2">Dispatched By</th>
                        <th className="p-2 text-center">Tools</th>
                        <th className="p-2">Equipment Serials</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dtBatches.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50">
                          <td className="p-2 font-mono font-bold text-[#1a3055]">
                            {b.dtNumber}
                          </td>
                          <td className="p-2 font-mono text-slate-600">
                            {formatJobDate(b.rmDate || b.deliveryDate)}
                          </td>
                          <td className="p-2 text-slate-700">{b.dispatchedBy || 'Operations'}</td>
                          <td className="p-2 text-center font-mono font-bold text-slate-800">
                            {b.toolLines?.length || 0}
                          </td>
                          <td className="p-2 text-slate-600 font-mono text-[11px]">
                            {(b.toolLines || [])
                              .map((t) => `${t.serial}`)
                              .join(', ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RECEIVING TICKETS (RT) */}
          {activeTab === 'rts' && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-800">
                Backloaded Receiving Tickets ({rtBatches.length})
              </div>

              {rtBatches.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded border border-slate-200 text-center text-slate-400">
                  <div className="font-medium text-slate-600">No Receiving Tickets Processed</div>
                </div>
              ) : (
                <div className="border border-slate-200 rounded overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2 font-mono">RT Number</th>
                        <th className="p-2">Received Date</th>
                        <th className="p-2">Received By</th>
                        <th className="p-2 text-center">Returned</th>
                        <th className="p-2">Returned Equipment Serials</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rtBatches.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50">
                          <td className="p-2 font-mono font-bold text-slate-900">
                            {b.rtNumber}
                          </td>
                          <td className="p-2 font-mono text-slate-600">
                            {formatJobDate(b.rtDate)}
                          </td>
                          <td className="p-2 text-slate-700">{b.receivedBy || 'Base QC'}</td>
                          <td className="p-2 text-center font-mono font-bold text-slate-800">
                            {b.toolLines?.length || 0}
                          </td>
                          <td className="p-2 text-slate-600 font-mono text-[11px]">
                            {(b.toolLines || [])
                              .map((t) => `${t.serial}`)
                              .join(', ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MILESTONES */}
          {activeTab === 'lifecycle' && (
            <div className="space-y-3">
              <JobLifecycleStepper
                job={job}
                dtBatches={dtBatches}
                rtBatches={rtBatches}
                canEdit={canEdit}
                onOpenStatusModal={onOpenStatusModal}
              />
            </div>
          )}
        </div>

        {/* Compact Modal Footer */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0 text-xs">
          <div className="text-slate-500 font-mono text-[11px]">
            Job ID: <strong>{job.id}</strong> &bull; Rig: <strong>{job.rig || '—'}</strong>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
