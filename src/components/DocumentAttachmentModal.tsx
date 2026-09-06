import React, { useState, useRef } from 'react';

export interface DocumentAttachmentModalProps {
  title: string;
  subtitle?: string;
  referenceNumber: string;
  currentDocUrl?: string;
  currentDocName?: string;
  currentSignedDate?: string;
  isSigned?: boolean;
  onSave: (docData: {
    docUrl: string;
    docName: string;
    signedDate: string;
    isSigned: boolean;
  }) => void;
  onClose: () => void;
}

export const DocumentAttachmentModal: React.FC<DocumentAttachmentModalProps> = ({
  title,
  subtitle,
  referenceNumber,
  currentDocUrl,
  currentDocName,
  currentSignedDate,
  isSigned = false,
  onSave,
  onClose,
}) => {
  const [docName, setDocName] = useState(currentDocName || '');
  const [docUrl, setDocUrl] = useState(currentDocUrl || '');
  const [signedDate, setSignedDate] = useState(
    currentSignedDate || new Date().toISOString().split('T')[0]
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file) return;
    setError('');
    setDocName(file.name);

    // Create a local object URL or read as base64 data URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const res = e.target?.result as string;
      setDocUrl(res);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim() && !docUrl) {
      setError('Please select or upload a signed document copy (PDF, JPG, or PNG).');
      return;
    }
    onSave({
      docUrl: docUrl || `https://emdad-storage.local/documents/${encodeURIComponent(docName)}`,
      docName: docName.trim(),
      signedDate,
      isSigned: true,
    });
    onClose();
  };

  const handleRemoveDoc = () => {
    setDocName('');
    setDocUrl('');
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden border border-[#b8c9db] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-[#1a3055] text-white flex justify-between items-center">
          <div>
            <div className="text-xs text-amber-300 font-bold uppercase tracking-wider">
              {referenceNumber}
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Status Indicator */}
          <div className="flex items-center justify-between p-2.5 rounded bg-slate-50 border border-slate-200">
            <span className="font-semibold text-slate-700">Document Status:</span>
            {isSigned || docUrl ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <span>✓</span> Signed Copy Attached
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                <span>⏳</span> Pending Signed Copy
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

          {/* Upload Area */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Signed Ticket Document (PDF, Scanned Image, PNG) *
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />

            {docName ? (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-xl">📄</span>
                  <div className="truncate">
                    <div className="font-bold text-blue-950 truncate">{docName}</div>
                    <div className="text-[10px] text-blue-700">Ready to save with ticket record</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-1 rounded bg-white text-blue-800 border border-blue-300 font-bold text-[10px] hover:bg-blue-100 cursor-pointer"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveDoc}
                    className="px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px] hover:bg-rose-100 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded p-6 text-center cursor-pointer transition ${
                  isDragOver
                    ? 'border-amber-500 bg-amber-50/50'
                    : 'border-slate-300 bg-slate-50 hover:bg-slate-100/80 hover:border-slate-400'
                }`}
              >
                <div className="text-2xl mb-1">📎</div>
                <div className="font-bold text-slate-800">
                  Click to choose file or drag &amp; drop here
                </div>
                <div className="text-slate-500 text-[10px] mt-0.5">
                  Supports scanned PDF, JPG, PNG up to 25MB
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-2 bg-rose-50 border border-rose-200 rounded text-rose-700 font-bold text-[11px]">
              {error}
            </div>
          )}

          {/* Quick Simulation Pre-fill for testing convenience */}
          {!docName && (
            <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
              <span>Quick mock scan:</span>
              <button
                type="button"
                onClick={() => {
                  setDocName(`${referenceNumber}_Signed_Stamped.pdf`);
                  setDocUrl(`data:application/pdf;base64,mockedSignedScan-${referenceNumber}`);
                }}
                className="text-blue-700 hover:underline font-bold cursor-pointer"
              >
                + Attach Signed Scan &ldquo;{referenceNumber}_Signed.pdf&rdquo;
              </button>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-2 border-t border-slate-200 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-[#1a3055] hover:bg-[#24426d] text-white font-bold shadow-sm cursor-pointer"
            >
              Save Signed Copy &rarr;
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
