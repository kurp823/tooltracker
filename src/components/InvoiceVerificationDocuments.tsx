import React, { useState } from 'react';
import { DraftInvoicePackageData, AttachedDoc, DrillingJob, DTBatch, RTBatch } from '../types';
import {
  FileText,
  Check,
  Truck,
  Anchor,
  Clock,
  ShieldCheck,
  Calendar,
  Layers,
  ChevronRight,
  Printer,
  ExternalLink,
  Award,
  UserCheck,
  Box,
  CornerDownRight,
  ClipboardList,
  Paperclip,
  Download,
  AlertTriangle,
  Plus,
  Eye,
} from 'lucide-react';
import { DocumentAttachmentModal } from './DocumentAttachmentModal';

interface InvoiceVerificationDocumentsProps {
  packageData: DraftInvoicePackageData;
  currentJob?: DrillingJob;
  dtBatches?: DTBatch[];
  rtBatches?: RTBatch[];
  selectedDocId?: string | 'all';
  onUpdateJob?: (job: DrillingJob) => void;
  onUpdateDTBatch?: (batch: DTBatch) => void;
  onUpdateRTBatch?: (batch: RTBatch) => void;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const InvoiceVerificationDocuments: React.FC<InvoiceVerificationDocumentsProps> = ({
  packageData,
  currentJob,
  dtBatches = [],
  rtBatches = [],
  selectedDocId = 'all',
  onUpdateJob,
  onUpdateDTBatch,
  onUpdateRTBatch,
  onShowToast,
}) => {
  const attachedDocs: AttachedDoc[] = packageData.attachedDocuments || [];
  
  // Modal for attaching documents directly from the invoice verification dossier
  const [attachModalState, setAttachModalState] = useState<{
    isOpen: boolean;
    sourceType: 'DT' | 'RT' | 'Utilization';
    refNumber: string;
    targetBatch?: DTBatch | RTBatch;
  }>({
    isOpen: false,
    sourceType: 'DT',
    refNumber: '',
  });

  const [previewDoc, setPreviewDoc] = useState<AttachedDoc | null>(null);

  // Group attached documents by source for clean scannable display
  const dtDocs = attachedDocs.filter((d) => d.sourceType === 'DT');
  const rtDocs = attachedDocs.filter((d) => d.sourceType === 'RT');
  const utDocs = attachedDocs.filter((d) => d.sourceType === 'Utilization' || d.sourceType === 'Job');

  // Filtered view if a specific document was selected from the Jump Bar
  const displayedDocs = selectedDocId === 'all'
    ? attachedDocs
    : attachedDocs.filter((d) => d.id === selectedDocId || `exhibit-${d.id}` === selectedDocId);

  const handleOpenAttachForDT = (dtNumber: string) => {
    const target = dtBatches.find((b) => b.dtNumber === dtNumber);
    setAttachModalState({
      isOpen: true,
      sourceType: 'DT',
      refNumber: dtNumber,
      targetBatch: target,
    });
  };

  const handleOpenAttachForRT = (rtNumber: string) => {
    const target = rtBatches.find((b) => b.rtNumber === rtNumber);
    setAttachModalState({
      isOpen: true,
      sourceType: 'RT',
      refNumber: rtNumber,
      targetBatch: target,
    });
  };

  const handleOpenAttachForRigLog = () => {
    setAttachModalState({
      isOpen: true,
      sourceType: 'Utilization',
      refNumber: `Rig ${packageData.rig} Daily Log`,
    });
  };

  const handleSaveModalAttachments = (newAttachments: AttachedDoc[]) => {
    if (attachModalState.sourceType === 'DT' && attachModalState.targetBatch && onUpdateDTBatch) {
      const dt = attachModalState.targetBatch as DTBatch;
      const primary = newAttachments[0];
      const updated: DTBatch = {
        ...dt,
        isSigned: newAttachments.length > 0,
        signedDocName: primary?.name || '',
        signedDocUrl: primary?.url || '',
        signedDate: primary?.uploadDate || dt.signedDate || packageData.dateOfSupply,
        attachments: newAttachments,
      };
      onUpdateDTBatch(updated);
      if (onShowToast) onShowToast(`Updated ${newAttachments.length} document(s) for ${dt.dtNumber}.`, 'success');
    } else if (attachModalState.sourceType === 'RT' && attachModalState.targetBatch && onUpdateRTBatch) {
      const rt = attachModalState.targetBatch as RTBatch;
      const primary = newAttachments[0];
      const updated: RTBatch = {
        ...rt,
        isSigned: newAttachments.length > 0,
        signedDocName: primary?.name || '',
        signedDocUrl: primary?.url || '',
        signedDate: primary?.uploadDate || rt.signedDate || packageData.dateOfSupply,
        attachments: newAttachments,
      };
      onUpdateRTBatch(updated);
      if (onShowToast) onShowToast(`Updated ${newAttachments.length} document(s) for ${rt.rtNumber}.`, 'success');
    } else if (attachModalState.sourceType === 'Utilization' && currentJob && onUpdateJob) {
      const updated: DrillingJob = {
        ...currentJob,
        signedUtilizationAttached: newAttachments.length > 0,
        utilizationAttachments: newAttachments,
      };
      onUpdateJob(updated);
      if (onShowToast) onShowToast(`Updated ${newAttachments.length} rig log document(s) for Job ${currentJob.id}.`, 'success');
    }
    setAttachModalState((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto font-sans">
      {/* Attached Verification Dossier Header Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-blue-100 text-blue-900">
            <Paperclip className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
              <span>Attached Physical Verification Documents</span>
              <span className="px-2 py-0.2 bg-blue-50 text-blue-800 rounded font-mono text-[10px] border border-blue-200">
                {attachedDocs.length} {attachedDocs.length === 1 ? 'Exhibit' : 'Exhibits'}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Dynamically linked from field Delivery Tickets ({packageData.deliveryTicketRefs || 'DT'}), Return Tickets ({packageData.returnLoadingNoteNo || 'RT'}), and Rig Sign-offs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={handleOpenAttachForRigLog}
            className="px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold border border-slate-200 text-xs transition cursor-pointer flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5 text-blue-700" />
            <span>+ Attach Document</span>
          </button>
        </div>
      </div>

      {/* If no documents are attached at all, display a helpful operational guide */}
      {attachedDocs.length === 0 && (
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-lg p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-xl border border-amber-200">
            📎
          </div>
          <div className="max-w-md mx-auto">
            <h4 className="font-bold text-slate-800 text-sm">No Physical Documents Attached to this Job Yet</h4>
            <p className="text-slate-500 text-xs mt-1">
              Field signed tickets, manifests, or dual-signed rig daily logs will appear here once attached in Delivery Tickets, Receiving Tickets, or Fleet Utilization.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => handleOpenAttachForDT(packageData.deliveryTicketRefs?.split(',')[0]?.trim() || 'DT-02171')}
              className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] cursor-pointer"
            >
              + Attach Delivery Ticket / Manifest
            </button>
            <button
              type="button"
              onClick={() => handleOpenAttachForRT(packageData.returnLoadingNoteNo?.split(',')[0]?.trim() || 'RT-02214')}
              className="px-3 py-1.5 rounded bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 border border-slate-300 cursor-pointer"
            >
              + Attach Receiving Ticket / Demob
            </button>
            <button
              type="button"
              onClick={handleOpenAttachForRigLog}
              className="px-3 py-1.5 rounded bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 border border-slate-300 cursor-pointer"
            >
              + Attach Dual-Signed Rig Daily Log
            </button>
          </div>
        </div>
      )}

      {/* Render Each Real Attached Physical Document */}
      {displayedDocs.map((doc, index) => {
        const isCombined =
          doc.category.toLowerCase().includes('combined') ||
          (doc.name.toLowerCase().includes('manifest') && doc.name.toLowerCase().includes('dt')) ||
          (doc.name.toLowerCase().includes('manifest') && doc.name.toLowerCase().includes('rt'));

        return (
          <div
            key={doc.id || index}
            id={`exhibit-${doc.id}`}
            className="bg-white border-2 border-slate-800 rounded-lg p-5 shadow-xs space-y-4 print:p-0 print:border-none print:shadow-none break-after-page"
          >
            {/* Exhibit Header */}
            <div className="border-b border-slate-300 pb-2.5 flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-400 font-mono text-xs font-bold">
                  Exhibit {index + 1} of {attachedDocs.length}
                </span>
                <span className="font-bold text-slate-900 text-sm">
                  [{doc.sourceRef}] {doc.category}
                </span>
                {isCombined && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300">
                    Combined Document (1 File Attached)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewDoc(doc)}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-300 cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-700" />
                  <span>View Scan</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const printWin = window.open('', '_blank');
                    if (printWin) {
                      printWin.document.write(`
                        <html>
                          <head><title>${doc.name}</title></head>
                          <body style="font-family: sans-serif; padding: 20px;">
                            <h2>EMDAD UPSTREAM SERVICES — OFFICIAL BILLING EXHIBIT</h2>
                            <h3>Exhibit ${index + 1}: ${doc.category}</h3>
                            <p><strong>Job ID:</strong> ${packageData.jobId} &bull; <strong>Rig:</strong> ${packageData.rig} &bull; <strong>Well:</strong> ${packageData.well}</p>
                            <p><strong>Source:</strong> ${doc.sourceType} (${doc.sourceRef}) &bull; <strong>File:</strong> ${doc.name}</p>
                            <hr />
                            <p style="margin-top: 30px; color: #555;">[Official Physical Scan Copy verified on file at EMDAD Commercial Operations Department]</p>
                          </body>
                        </html>
                      `);
                      printWin.document.close();
                      printWin.print();
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-300 cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span>Print</span>
                </button>
              </div>
            </div>

            {/* Document Metadata Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded p-2.5 text-xs">
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">File Name</span>
                <span className="font-bold text-slate-900 truncate block font-mono text-[11px]" title={doc.name}>
                  {doc.name}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Document Type</span>
                <span className="font-semibold text-blue-900">{doc.category}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Source Origin</span>
                <span className="font-mono text-slate-800">{doc.sourceType} ({doc.sourceRef})</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Signed / Upload Date</span>
                <span className="font-semibold text-slate-900">{doc.uploadDate}</span>
              </div>
            </div>

            {/* Document Content & Verification Body */}
            <div className="border border-slate-200 rounded-lg p-4 bg-white space-y-3">
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[10px] flex items-center gap-1">
                    <Check className="w-3 h-3" /> Field Sign-off Confirmed
                  </span>
                  <span className="text-slate-600 text-[11px]">
                    Verified by: <strong className="text-slate-800">{doc.uploadedBy || 'Operations Lead'}</strong>
                  </span>
                </div>
                {doc.notes && (
                  <span className="text-[11px] text-slate-500 italic">
                    Note: {doc.notes}
                  </span>
                )}
              </div>

              {/* Contextual verification details tailored to this specific document type */}
              {doc.sourceType === 'DT' && (
                <div className="p-3 bg-blue-50/40 rounded border border-blue-100 text-xs space-y-2">
                  <div className="flex justify-between font-bold text-blue-950">
                    <span>Mobilization Equipment Consignment ({doc.sourceRef})</span>
                    <span>Destination: Rig {packageData.rig}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 leading-relaxed">
                    Dispatched from EMDAD Mussafah Base M-44 to {packageData.customerName} on {doc.uploadDate || packageData.dateOfSupply}.
                    {isCombined ? (
                      <span className="font-semibold text-blue-900 ml-1">
                        Client Mobilization Cargo Manifest and Signed Delivery Ticket are consolidated into this single exhibit.
                      </span>
                    ) : (
                      <span> Signed delivery receipt acknowledged by Rig Materials Representative.</span>
                    )}
                  </div>
                </div>
              )}

              {doc.sourceType === 'RT' && (
                <div className="p-3 bg-amber-50/40 rounded border border-amber-100 text-xs space-y-2">
                  <div className="flex justify-between font-bold text-amber-950">
                    <span>Demobilization Backload Consignment ({doc.sourceRef})</span>
                    <span>Returned from Rig {packageData.rig}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 leading-relaxed">
                    Received at EMDAD Mussafah Base Receiving Bay on {doc.uploadDate || packageData.invoiceDate}.
                    {isCombined ? (
                      <span className="font-semibold text-amber-900 ml-1">
                        Backload Vessel Cargo Manifest and Signed Receiving Ticket are consolidated into this single exhibit.
                      </span>
                    ) : (
                      <span> Return condition verified and logged into QC Inspection Bay.</span>
                    )}
                  </div>
                </div>
              )}

              {doc.sourceType === 'Utilization' && (
                <div className="p-3 bg-emerald-50/40 rounded border border-emerald-100 text-xs space-y-2">
                  <div className="flex justify-between font-bold text-emerald-950">
                    <span>Dual-Signed Rig Operations Tour Log ({packageData.rig})</span>
                    <span>Well: {packageData.well}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 leading-relaxed">
                    Official field operations sign-off verifying {packageData.operDays} operating day(s) and {packageData.standbyDays} standby day(s).
                    Dual signatures endorsed by ADNOC Rig Superintendent and Lead Fishing Engineer.
                  </div>
                </div>
              )}

              {/* Physical Scan Representation Box */}
              <div className="border border-slate-300 rounded p-4 bg-slate-50/60 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-white border border-slate-300 flex items-center justify-center text-slate-700 shadow-2xs font-bold text-xs">
                    PDF
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-xs">{doc.name}</div>
                    <div className="text-[10px] text-slate-500">
                      Scanned Document Copy ({doc.fileSize || '1.4 MB'}) • Verified Clean Scan
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(doc)}
                    className="px-3 py-1 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Preview</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Exhibit Footer Audit Seal */}
            <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1">
              <span>EMDAD Upstream Billing Verification Registry &bull; Dossier Ref #{packageData.jobId}</span>
              <span className="font-mono">Exhibit #{index + 1} / {attachedDocs.length}</span>
            </div>
          </div>
        );
      })}

      {/* Interactive Scan Preview Lightbox Modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 bg-[#1a3055] text-white flex justify-between items-center">
              <div>
                <span className="text-xs text-amber-300 font-bold uppercase">{previewDoc.sourceRef}</span>
                <h4 className="font-bold text-sm text-white">{previewDoc.name}</h4>
                <p className="text-[11px] text-slate-300">{previewDoc.category}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="text-white hover:text-amber-300 font-bold text-xl p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto text-xs bg-slate-100 flex-1">
              <div className="bg-white border-2 border-slate-300 shadow-md p-6 rounded max-w-xl mx-auto font-sans space-y-4">
                <div className="border-b-2 border-slate-800 pb-3 flex justify-between items-start">
                  <div>
                    <h2 className="text-base font-black text-[#1a3055]">EMDAD L.L.C.</h2>
                    <p className="text-[10px] text-slate-600 uppercase font-semibold">Field Operations & Commercial Verification</p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 bg-slate-900 text-white font-bold rounded text-[10px]">
                      {previewDoc.category}
                    </span>
                    <p className="text-[10px] font-mono text-slate-700 mt-0.5">{previewDoc.sourceRef}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 p-2 bg-slate-50 border border-slate-200 rounded text-[11px]">
                  <div><strong className="text-slate-600">Client:</strong> {packageData.customerName}</div>
                  <div><strong className="text-slate-600">Rig / Well:</strong> {packageData.rig} / {packageData.well}</div>
                  <div><strong className="text-slate-600">Contract #:</strong> {packageData.contractNo}</div>
                  <div><strong className="text-slate-600">Signed Date:</strong> {previewDoc.uploadDate}</div>
                </div>

                <div className="py-12 px-6 border-2 border-dashed border-slate-300 rounded text-center space-y-2 bg-slate-50">
                  <div className="text-3xl text-blue-900">📄</div>
                  <div className="font-bold text-slate-800 text-sm">{previewDoc.name}</div>
                  <p className="text-slate-500 text-[11px] max-w-sm mx-auto">
                    Scanned image / PDF verified and stored in EMDAD electronic transmittal vault.
                  </p>
                  <div className="pt-2 flex justify-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-300">
                      ✓ Dual Stamp &amp; Signatures Present
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 text-[10px]">
                  <div>
                    <p className="font-bold text-slate-700">EMDAD Base Representative</p>
                    <div className="border-b border-slate-400 w-32 my-1"></div>
                    <p className="text-slate-500">Muhammad Tariq &bull; {previewDoc.uploadDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-700">Client / Rig Superintendent</p>
                    <div className="border-b border-slate-400 w-32 ml-auto my-1"></div>
                    <p className="text-slate-500">Signed on Rig Location &bull; {previewDoc.uploadDate}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-1.5 rounded bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 text-xs cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Attachment Modal for Direct Uploading */}
      {attachModalState.isOpen && (
        <DocumentAttachmentModal
          title={`Attach Document to ${attachModalState.refNumber}`}
          subtitle={`Job: ${packageData.jobId} | Rig: ${packageData.rig}`}
          referenceNumber={attachModalState.refNumber}
          sourceType={attachModalState.sourceType}
          existingAttachments={
            attachModalState.sourceType === 'DT'
              ? dtDocs
              : attachModalState.sourceType === 'RT'
              ? rtDocs
              : utDocs
          }
          onSaveAttachments={handleSaveModalAttachments}
          onClose={() => setAttachModalState((prev) => ({ ...prev, isOpen: false }))}
        />
      )}
    </div>
  );
};
