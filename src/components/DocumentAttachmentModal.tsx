import React, { useState, useRef } from 'react';
import { AttachedDoc, AttachmentCategory } from '../types';
import {
  Paperclip,
  Plus,
  Trash2,
  FileText,
  CheckCircle2,
  Clock,
  UploadCloud,
  Layers,
  X,
  ShieldCheck,
  Tag,
} from 'lucide-react';

export interface DocumentAttachmentModalProps {
  title: string;
  subtitle?: string;
  referenceNumber: string;
  sourceType?: 'DT' | 'RT' | 'Utilization' | 'Job';
  existingAttachments?: AttachedDoc[];
  currentDocUrl?: string;
  currentDocName?: string;
  currentSignedDate?: string;
  isSigned?: boolean;
  onSave?: (docData: {
    docUrl: string;
    docName: string;
    signedDate: string;
    isSigned: boolean;
  }) => void;
  onSaveAttachments?: (attachments: AttachedDoc[]) => void;
  onClose: () => void;
}

const CATEGORY_OPTIONS: AttachmentCategory[] = [
  'Combined DT & Manifest',
  'Signed Delivery Ticket',
  'Client Mobilization Manifest',
  'Combined RT & Demob Manifest',
  'Signed Receiving Ticket',
  'Client Demobilization Manifest',
  'Dual-Signed Rig Daily Log',
  'Utilization Sign-off',
  'Inspection / MPI Certificate',
  'Other Supporting Document',
];

export const DocumentAttachmentModal: React.FC<DocumentAttachmentModalProps> = ({
  title,
  subtitle,
  referenceNumber,
  sourceType = 'DT',
  existingAttachments = [],
  currentDocUrl,
  currentDocName,
  currentSignedDate,
  isSigned = false,
  onSave,
  onSaveAttachments,
  onClose,
}) => {
  // Initialize attachment list
  const [attachments, setAttachments] = useState<AttachedDoc[]>(() => {
    if (existingAttachments && existingAttachments.length > 0) {
      return [...existingAttachments];
    }
    if (currentDocName || currentDocUrl) {
      let defaultCat: AttachmentCategory = 'Signed Delivery Ticket';
      if (sourceType === 'RT') defaultCat = 'Signed Receiving Ticket';
      if (sourceType === 'Utilization') defaultCat = 'Dual-Signed Rig Daily Log';
      if (currentDocName?.toLowerCase().includes('manifest') && (sourceType === 'DT' || currentDocName?.toLowerCase().includes('dt'))) {
        defaultCat = 'Combined DT & Manifest';
      } else if (currentDocName?.toLowerCase().includes('manifest') && (sourceType === 'RT' || currentDocName?.toLowerCase().includes('rt'))) {
        defaultCat = 'Combined RT & Demob Manifest';
      }

      return [
        {
          id: `att-init-${Date.now()}`,
          name: currentDocName || `${referenceNumber}_Signed.pdf`,
          url: currentDocUrl || '',
          category: defaultCat,
          sourceType,
          sourceRef: referenceNumber,
          uploadDate: currentSignedDate || new Date().toISOString().split('T')[0],
          uploadedBy: 'Current User',
        },
      ];
    }
    return [];
  });

  const [signedDate, setSignedDate] = useState<string>(
    currentSignedDate || new Date().toISOString().split('T')[0]
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getDefaultCategoryForName = (fileName: string): AttachmentCategory => {
    const fn = fileName.toLowerCase();
    if ((fn.includes('manifest') || fn.includes('mnf')) && (fn.includes('dt') || fn.includes('delivery'))) {
      return 'Combined DT & Manifest';
    }
    if ((fn.includes('manifest') || fn.includes('mnf')) && (fn.includes('rt') || fn.includes('return') || fn.includes('demob'))) {
      return 'Combined RT & Demob Manifest';
    }
    if (fn.includes('mob') && fn.includes('manifest')) {
      return 'Client Mobilization Manifest';
    }
    if (fn.includes('demob') && fn.includes('manifest')) {
      return 'Client Demobilization Manifest';
    }
    if (fn.includes('daily') || fn.includes('tour') || fn.includes('log') || fn.includes('rig')) {
      return 'Dual-Signed Rig Daily Log';
    }
    if (fn.includes('utilization') || fn.includes('ut')) {
      return 'Utilization Sign-off';
    }
    if (fn.includes('mpi') || fn.includes('inspect') || fn.includes('qc') || fn.includes('cert')) {
      return 'Inspection / MPI Certificate';
    }
    if (sourceType === 'RT') return 'Signed Receiving Ticket';
    if (sourceType === 'Utilization') return 'Dual-Signed Rig Daily Log';
    return 'Signed Delivery Ticket';
  };

  const handleFiles = (files: FileList | File[]) => {
    setError('');
    const newItems: AttachedDoc[] = [];

    Array.from(files).forEach((file, idx) => {
      const reader = new FileReader();
      const cat = getDefaultCategoryForName(file.name);
      const sizeStr = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

      reader.onload = (e) => {
        const res = (e.target?.result as string) || '';
        const docItem: AttachedDoc = {
          id: `att-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
          name: file.name,
          url: res,
          category: cat,
          sourceType,
          sourceRef: referenceNumber,
          uploadDate: signedDate,
          uploadedBy: 'Current User',
          fileSize: sizeStr,
        };
        setAttachments((prev) => [...prev, docItem]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleRemoveDoc = (id: string) => {
    setAttachments((prev) => prev.filter((doc) => doc.id !== id));
  };

  const handleCategoryChange = (id: string, newCategory: AttachmentCategory) => {
    setAttachments((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, category: newCategory } : doc))
    );
  };

  const handleAddQuickSimulation = (cat: AttachmentCategory, suffix: string) => {
    const fileName = `${referenceNumber}_${suffix}.pdf`;
    const docItem: AttachedDoc = {
      id: `att-sim-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: fileName,
      url: `data:application/pdf;base64,mockedDoc-${referenceNumber}`,
      category: cat,
      sourceType,
      sourceRef: referenceNumber,
      uploadDate: signedDate,
      uploadedBy: 'Operations Dispatch',
      fileSize: '1.4 MB',
      notes: 'Verified signed scan copy',
    };
    setAttachments((prev) => [...prev, docItem]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (attachments.length === 0) {
      setError('Please attach at least one signed document file.');
      return;
    }

    if (onSaveAttachments) {
      onSaveAttachments(attachments);
    }

    if (onSave && attachments.length > 0) {
      const primary = attachments[0];
      onSave({
        docUrl: primary.url || `https://emdad-storage.local/documents/${encodeURIComponent(primary.name)}`,
        docName: primary.name,
        signedDate,
        isSigned: true,
      });
    }

    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden border border-[#b8c9db] flex flex-col animate-in fade-in zoom-in-95 duration-150 max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
          <div>
            <div className="text-xs text-amber-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span>{referenceNumber}</span>
              <span className="text-white/60">•</span>
              <span className="text-white/80">{sourceType.toUpperCase()} DOCUMENT ATTACHMENTS</span>
            </div>
            <h3 className="font-bold text-sm text-white">{title}</h3>
            {subtitle && <div className="text-[11px] text-slate-300 mt-0.5">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white font-bold text-xl cursor-pointer p-1"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
          {/* Status Indicator */}
          <div className="flex items-center justify-between p-2.5 rounded bg-slate-50 border border-slate-200">
            <span className="font-semibold text-slate-700">Attachment Status:</span>
            {attachments.length > 0 ? (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{attachments.length} Document(s) Attached</span>
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Pending Physical Sign-Off</span>
              </span>
            )}
          </div>

          {/* Signed Date Field */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Date Signed by Client / Rig Representative *
            </label>
            <input
              type="date"
              required
              value={signedDate}
              onChange={(e) => setSignedDate(e.target.value)}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-800 focus:ring-1 focus:ring-[#1a3055] outline-none"
            />
          </div>

          {/* Current Attached Documents List */}
          {attachments.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="font-bold text-slate-700">
                  Attached Physical Documents ({attachments.length}):
                </label>
                <span className="text-[10px] text-slate-500">
                  Categorize each file so invoice dossier headers match exactly
                </span>
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {attachments.map((doc, idx) => (
                  <div
                    key={doc.id}
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-100/70 transition"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="p-1.5 rounded bg-blue-100 text-blue-900 mt-0.5">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate text-[11px]">
                          {doc.name}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>{doc.fileSize || '1.2 MB'}</span>
                          <span>•</span>
                          <span>Uploaded: {doc.uploadDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select
                        value={doc.category}
                        onChange={(e) =>
                          handleCategoryChange(doc.id, e.target.value as AttachmentCategory)
                        }
                        className="text-[10px] font-bold border border-slate-300 rounded px-2 py-1 bg-white text-slate-800 outline-none focus:border-blue-600"
                      >
                        {CATEGORY_OPTIONS.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemoveDoc(doc.id)}
                        className="p-1 rounded text-rose-600 hover:bg-rose-50 border border-rose-200 cursor-pointer"
                        title="Remove Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Area for New Files (Multiple files supported) */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="font-bold text-slate-700">
                Upload Scanned Documents (PDF, JPG, PNG) — Multiple Files Supported
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-700 hover:underline font-bold text-[11px] cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add More Files
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFiles(e.target.files);
                }
              }}
            />

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition ${
                isDragOver
                  ? 'border-blue-500 bg-blue-50/50'
                  : 'border-slate-300 bg-slate-50/80 hover:bg-slate-100 hover:border-slate-400'
              }`}
            >
              <div className="flex justify-center mb-1.5 text-blue-700">
                <UploadCloud className="w-8 h-8" />
              </div>
              <div className="font-bold text-slate-800 text-xs">
                Click to browse or drop multiple files here
              </div>
              <div className="text-slate-500 text-[10px] mt-0.5">
                Upload combined scans (DT + Manifest together) or separate files (PDF, JPG, PNG up to 25MB)
              </div>
            </div>
          </div>

          {error && (
            <div className="p-2 bg-rose-50 border border-rose-200 rounded text-rose-700 font-bold text-[11px]">
              {error}
            </div>
          )}

          {/* Quick Simulation Options */}
          <div className="p-2.5 rounded border border-slate-200 bg-slate-50 text-[11px] space-y-1.5">
            <span className="font-bold text-slate-600 block">Quick Pre-fill Options (One-click):</span>
            <div className="flex flex-wrap gap-1.5">
              {sourceType === 'DT' && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddQuickSimulation('Combined DT & Manifest', 'Signed_DT_and_Manifest')
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold cursor-pointer"
                  >
                    + Combined DT &amp; Manifest (One Doc)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddQuickSimulation('Signed Delivery Ticket', 'Signed_DT')
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-semibold cursor-pointer"
                  >
                    + Separate Signed DT
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddQuickSimulation('Client Mobilization Manifest', 'Mob_Cargo_Manifest')
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-semibold cursor-pointer"
                  >
                    + Separate Mob Manifest
                  </button>
                </>
              )}

              {sourceType === 'RT' && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddQuickSimulation('Combined RT & Demob Manifest', 'Signed_RT_and_Demob')
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold cursor-pointer"
                  >
                    + Combined RT &amp; Demob (One Doc)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddQuickSimulation('Signed Receiving Ticket', 'Signed_RT')
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-semibold cursor-pointer"
                  >
                    + Separate Signed RT
                  </button>
                </>
              )}

              {sourceType === 'Utilization' && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddQuickSimulation('Dual-Signed Rig Daily Log', 'DualSigned_Rig_Daily_Log')
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold cursor-pointer"
                  >
                    + Dual-Signed Rig Daily Log
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddQuickSimulation('Utilization Sign-off', 'Monthly_Utilization_Sheet')
                    }
                    className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-semibold cursor-pointer"
                  >
                    + Monthly Utilization Sign-Off
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-200 flex justify-between items-center flex-shrink-0">
            <span className="text-[11px] text-slate-500">
              {attachments.length} document(s) will be linked to this ticket and billing package.
            </span>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[#1a3055] hover:bg-[#24426d] text-white font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Save All Attachments</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
