/**
 * JobDossierFormParts — memoized form sections for JobDossierView.
 *
 * WHY THIS FILE EXISTS:
 *   JobDossierView.tsx is ~6 000 lines. Every controlled input that calls
 *   setState on each keystroke forces a full re-render of the entire tree,
 *   causing visible typing lag.
 *
 *   Each component here is wrapped in React.memo with a custom comparator
 *   that checks only the specific field values it owns, so an unrelated state
 *   change elsewhere in JobDossierView does not re-render these components.
 *
 *   All inputs remain FULLY CONTROLLED (value + onChange on every keystroke):
 *   no blur-only pattern, no local state, no data-loss risk.
 *
 * Components:
 *   CalloutHeaderForm     — 5-field Callout header form (Callout No, Req Date, etc.)
 *   RTHeaderForm          — 5-field Receiving Ticket header (Date, Carrier, L/Note, etc.)
 *   ChecklistRowInputCells — Per-row Well + Client DT# cells (inside checklist .map())
 *   DTToolLineInputCells   — Per-row Well + Client DT# cells (inside DT tool lines .map())
 */

import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// CalloutHeaderForm
// ─────────────────────────────────────────────────────────────────────────────

interface CalloutHeaderFormProps {
  calloutId: string;
  reqDate: string;
  projectNo: string;
  poNumber: string;
  emailRef: string;
  rigWellDisplay: string;   // pre-formatted "AD-117 / BB-543"
  disabled: boolean;
  statusText: string;       // e.g. "In Progress", "Dispatched"
  statusClassName: string;  // tailwind classes for the status badge
  onFieldChange: (field: string, value: string) => void;
}

const CalloutHeaderFormInner: React.FC<CalloutHeaderFormProps> = ({
  calloutId, reqDate, projectNo, poNumber, emailRef, rigWellDisplay,
  disabled, statusText, statusClassName, onFieldChange,
}) => {
  const cls = 'bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs w-28 disabled:bg-slate-100 disabled:cursor-not-allowed';
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-white p-2 rounded border border-slate-200">
      <div className="flex items-center gap-1">
        <span className="font-bold text-slate-600 w-16">Callout No:</span>
        <input type="text" value={calloutId} disabled={disabled}
          onChange={(e) => onFieldChange('id', e.target.value)}
          className={`${cls} font-mono font-bold text-blue-900`} />
      </div>
      <div className="flex items-center gap-1">
        <span className="font-bold text-slate-600 w-16">Req Date:</span>
        <input type="date" value={reqDate} disabled={disabled}
          onChange={(e) => onFieldChange('reqDate', e.target.value)}
          className={`${cls} font-mono`} />
      </div>
      <div className="flex items-center gap-1">
        <span className="font-bold text-slate-600 w-16">Project No:</span>
        <input type="text" value={projectNo} disabled={disabled}
          onChange={(e) => onFieldChange('projectNo', e.target.value)}
          className={`${cls} font-mono`} />
      </div>
      <div className="flex items-center gap-1">
        <span className="font-bold text-slate-600 w-16">PO Number:</span>
        <input type="text" value={poNumber} disabled={disabled}
          onChange={(e) => onFieldChange('poNumber', e.target.value)}
          className={`${cls} font-mono`} />
      </div>
      <div className="flex items-center gap-1">
        <span className="font-bold text-slate-600 w-16">Rig / Well:</span>
        <span className="font-bold text-slate-800 font-mono">{rigWellDisplay}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="font-bold text-slate-600 w-16">Email Ref:</span>
        <input type="text" value={emailRef} disabled={disabled}
          placeholder="Client authorization / email"
          onChange={(e) => onFieldChange('emailRef', e.target.value)}
          className={`${cls} w-36`} />
      </div>
      <div className="flex items-center gap-1">
        <span className="font-bold text-slate-600 w-16">Status:</span>
        <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${statusClassName}`}>
          {statusText}
        </span>
      </div>
    </div>
  );
};

export const CalloutHeaderForm = React.memo(
  CalloutHeaderFormInner,
  (p, n) =>
    p.disabled === n.disabled &&
    p.calloutId === n.calloutId &&
    p.reqDate === n.reqDate &&
    p.projectNo === n.projectNo &&
    p.poNumber === n.poNumber &&
    p.emailRef === n.emailRef &&
    p.rigWellDisplay === n.rigWellDisplay &&
    p.statusText === n.statusText &&
    p.statusClassName === n.statusClassName,
);


// ─────────────────────────────────────────────────────────────────────────────
// RTHeaderForm
// ─────────────────────────────────────────────────────────────────────────────

interface RTHeaderFormProps {
  isEditable: boolean;
  // edit values (used when isEditable)
  editDate: string;
  editCarrier: string;
  editLoadingNoteDate: string;
  editLoadingNoteNo: string;
  editReceivedBy: string;
  // display values (used when locked)
  displayDate: string;
  displayCarrier: string;
  displayLoadingNoteDate: string;
  displayLoadingNoteNo: string;
  displayReceivedBy: string;
  onFieldChange: (field: string, value: string) => void;
}

const RTHeaderFormInner: React.FC<RTHeaderFormProps> = ({
  isEditable,
  editDate, editCarrier, editLoadingNoteDate, editLoadingNoteNo, editReceivedBy,
  displayDate, displayCarrier, displayLoadingNoteDate, displayLoadingNoteNo, displayReceivedBy,
  onFieldChange,
}) => {
  const inputCls = 'bg-white border border-slate-300 rounded px-2 py-0.5 text-xs w-full focus:border-blue-500 focus:outline-none';
  return (
    <>
      <div>
        <span className="font-bold text-slate-600 block mb-0.5">Date:</span>
        {isEditable ? (
          <input type="date" value={editDate}
            onChange={(e) => onFieldChange('rtDate', e.target.value)}
            className={`${inputCls} font-mono font-bold text-slate-800 cursor-pointer`} />
        ) : (
          <span className="font-mono font-bold text-slate-900">{displayDate}</span>
        )}
      </div>
      <div>
        <span className="font-bold text-slate-600 block mb-0.5">Shipped Via:</span>
        {isEditable ? (
          <input type="text" placeholder="Shipped Via (Carrier)" value={editCarrier}
            onChange={(e) => onFieldChange('carrier', e.target.value)}
            className={inputCls} />
        ) : (
          <span className="text-slate-800">{displayCarrier}</span>
        )}
      </div>
      <div>
        <span className="font-bold text-slate-600 block mb-0.5">L/Note Date:</span>
        {isEditable ? (
          <input type="date" value={editLoadingNoteDate}
            onChange={(e) => onFieldChange('loadingNoteDate', e.target.value)}
            className={`${inputCls} font-mono text-slate-800 cursor-pointer`} />
        ) : (
          <span className="font-mono text-slate-800">{displayLoadingNoteDate}</span>
        )}
      </div>
      <div>
        <span className="font-bold text-slate-600 block mb-0.5">L/Note No:</span>
        {isEditable ? (
          <input type="text" placeholder="Loading Note No" value={editLoadingNoteNo}
            onChange={(e) => onFieldChange('loadingNoteNo', e.target.value)}
            className={`${inputCls} font-mono font-bold text-slate-800`} />
        ) : (
          <span className="font-mono font-bold text-slate-900">{displayLoadingNoteNo}</span>
        )}
      </div>
      <div>
        <span className="font-bold text-slate-600 block mb-0.5">Received By:</span>
        {isEditable ? (
          <input type="text" placeholder="Received By (Name / Lead)" value={editReceivedBy}
            onChange={(e) => onFieldChange('receivedBy', e.target.value)}
            className={inputCls} />
        ) : (
          <span className="font-medium text-slate-800">{displayReceivedBy || '—'}</span>
        )}
      </div>
    </>
  );
};

export const RTHeaderForm = React.memo(
  RTHeaderFormInner,
  (p, n) =>
    p.isEditable === n.isEditable &&
    p.editDate === n.editDate &&
    p.editCarrier === n.editCarrier &&
    p.editLoadingNoteDate === n.editLoadingNoteDate &&
    p.editLoadingNoteNo === n.editLoadingNoteNo &&
    p.editReceivedBy === n.editReceivedBy &&
    p.displayDate === n.displayDate &&
    p.displayCarrier === n.displayCarrier &&
    p.displayLoadingNoteDate === n.displayLoadingNoteDate &&
    p.displayLoadingNoteNo === n.displayLoadingNoteNo &&
    p.displayReceivedBy === n.displayReceivedBy,
);


// ─────────────────────────────────────────────────────────────────────────────
// ChecklistRowInputCells  (3 <td> cells: Rig select + Well + Client DT#)
// ─────────────────────────────────────────────────────────────────────────────

interface ChecklistRowInputCellsProps {
  seq: number;
  allocatedRig: string;
  allocatedWell: string;
  clientDtNo: string;
  disabled: boolean;
  rigOptions: string[];
  onFieldChange: (seq: number, field: string, value: string) => void;
}

const ChecklistRowInputCellsInner: React.FC<ChecklistRowInputCellsProps> = ({
  seq, allocatedRig, allocatedWell, clientDtNo, disabled, rigOptions, onFieldChange,
}) => (
  <>
    <td className="py-0.5 px-1 whitespace-nowrap border-l border-amber-100">
      <select
        value={allocatedRig}
        onChange={(e) => onFieldChange(seq, 'allocatedRig', e.target.value)}
        disabled={disabled}
        className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-[11px] font-bold text-slate-800 w-28 focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Select Rig...</option>
        {rigOptions.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    </td>
    <td className="py-0.5 px-1 whitespace-nowrap border-l border-amber-100">
      <input
        type="text"
        value={allocatedWell}
        placeholder="Well Name"
        onChange={(e) => onFieldChange(seq, 'allocatedWell', e.target.value)}
        disabled={disabled}
        className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-800 w-20 focus:ring-1 focus:ring-blue-500"
      />
    </td>
    <td className="py-0.5 px-1 whitespace-nowrap border-l border-amber-100">
      <input
        type="text"
        value={clientDtNo}
        placeholder="Client DT #"
        onChange={(e) => onFieldChange(seq, 'clientDtNo', e.target.value)}
        disabled={disabled}
        className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-[11px] font-mono text-indigo-900 font-bold w-28 focus:ring-1 focus:ring-blue-500 placeholder:font-sans placeholder:font-normal"
      />
    </td>
  </>
);

export const ChecklistRowInputCells = React.memo(
  ChecklistRowInputCellsInner,
  (p, n) =>
    p.seq === n.seq &&
    p.disabled === n.disabled &&
    p.allocatedRig === n.allocatedRig &&
    p.allocatedWell === n.allocatedWell &&
    p.clientDtNo === n.clientDtNo,
  // rigOptions excluded — it's a static constant array that never changes
);


// ─────────────────────────────────────────────────────────────────────────────
// DTToolLineInputCells  (3 <td> cells per DT tool line row)
// ─────────────────────────────────────────────────────────────────────────────

interface DTToolLineInputCellsProps {
  idx: number;
  allocatedRig: string;
  allocatedWell: string;
  clientDtNo: string;
  disabled: boolean;
  rigOptions: string[];
  onRigChange: (idx: number, value: string) => void;
  onWellChange: (idx: number, value: string) => void;
  onClientDtChange: (idx: number, value: string) => void;
}

const DTToolLineInputCellsInner: React.FC<DTToolLineInputCellsProps> = ({
  idx, allocatedRig, allocatedWell, clientDtNo, disabled, rigOptions,
  onRigChange, onWellChange, onClientDtChange,
}) => (
  <>
    <td className="py-0.5 px-1 whitespace-nowrap border-l border-amber-100">
      <select
        value={allocatedRig}
        onChange={(e) => onRigChange(idx, e.target.value)}
        disabled={disabled}
        className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-[11px] font-bold text-slate-800 w-28 focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Select Rig...</option>
        {rigOptions.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    </td>
    <td className="py-0.5 px-1 whitespace-nowrap border-l border-amber-100">
      <input
        type="text"
        value={allocatedWell}
        placeholder="Well Name"
        onChange={(e) => onWellChange(idx, e.target.value)}
        disabled={disabled}
        className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-800 w-20 focus:ring-1 focus:ring-blue-500"
      />
    </td>
    <td className="py-0.5 px-1 whitespace-nowrap border-l border-amber-100">
      <input
        type="text"
        value={clientDtNo}
        placeholder="Client DT #"
        onChange={(e) => onClientDtChange(idx, e.target.value)}
        disabled={disabled}
        className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-[11px] font-mono text-indigo-900 font-bold w-28 focus:ring-1 focus:ring-blue-500 placeholder:font-sans placeholder:font-normal"
      />
    </td>
  </>
);

export const DTToolLineInputCells = React.memo(
  DTToolLineInputCellsInner,
  (p, n) =>
    p.idx === n.idx &&
    p.disabled === n.disabled &&
    p.allocatedRig === n.allocatedRig &&
    p.allocatedWell === n.allocatedWell &&
    p.clientDtNo === n.clientDtNo,
);
