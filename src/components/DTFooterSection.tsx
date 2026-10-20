/**
 * DTFooterSection — memoized 3-column logistics footer for Delivery Tickets.
 *
 * WHY MEMOIZED:
 *   JobDossierView.tsx is ~6 000 lines. When a user types in any input,
 *   onChange fires → parent setState → parent re-renders the entire tree →
 *   visible typing lag. By isolating these 9 inputs here with React.memo,
 *   only THIS small component re-renders on each keystroke; the massive
 *   checklist table, DT tool-lines table, and everything else stay frozen.
 *
 *   The inputs remain FULLY CONTROLLED (value + onChange on every keystroke)
 *   — no blur-only commit, no local state, no data loss risk.
 *
 * Usage:
 *   <DTFooterSection
 *     fields={footerFields}
 *     disabled={!canUserEditDT || (isLocked && !adminUnlocked)}
 *     dispatchDate="15/10/2026"
 *     onFieldChange={(field, value) => handleUpdateDTField(field, value)}
 *   />
 */

import React from 'react';

export interface DTFooterFields {
  dispatchedBy: string;
  designation: string;
  deliveredTo: string;
  vesselBoat: string;
  transport: string;
  vehicleNo: string;
  driverName: string;
  contactNo: string;
}

interface DTFooterSectionProps {
  fields: DTFooterFields;
  disabled: boolean;
  dispatchDate: string;          // pre-formatted display string, e.g. "15/10/2026"
  onFieldChange: (field: keyof DTFooterFields, value: string) => void;
}

const DTFooterSectionInner: React.FC<DTFooterSectionProps> = ({
  fields,
  disabled,
  dispatchDate,
  onFieldChange,
}) => {
  const inputClass =
    'bg-white border border-slate-300 rounded px-2 py-0.5 w-40 text-xs disabled:bg-slate-100';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-[#f8fafc] p-3 rounded border border-slate-200">

      {/* Column 1: Dispatch Authority */}
      <div className="space-y-1.5 bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
        <div className="font-bold text-slate-700 border-b pb-1 text-[11px] uppercase tracking-wider text-blue-900">
          1. Warehouse &amp; Operations Dispatch
        </div>
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-600">Dispatched By:</span>
          <input
            type="text"
            value={fields.dispatchedBy}
            onChange={(e) => onFieldChange('dispatchedBy', e.target.value)}
            disabled={disabled}
            placeholder="e.g. Operations / Full Name"
            className={inputClass}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-600">Designation:</span>
          <input
            type="text"
            value={fields.designation}
            onChange={(e) => onFieldChange('designation', e.target.value)}
            disabled={disabled}
            placeholder="e.g. Workshop Coordinator / Engineer"
            className={inputClass}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-600">Dispatch Date:</span>
          <span className="font-mono font-bold text-slate-800 text-xs">{dispatchDate}</span>
        </div>
      </div>

      {/* Column 2: Logistics & Destination */}
      <div className="space-y-1.5 bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
        <div className="font-bold text-slate-700 border-b pb-1 text-[11px] uppercase tracking-wider text-blue-900">
          2. Destination &amp; Marine Logistics
        </div>
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-600">Delivered To:</span>
          <input
            type="text"
            value={fields.deliveredTo}
            onChange={(e) => onFieldChange('deliveredTo', e.target.value)}
            disabled={disabled}
            placeholder="e.g. Esnad Jetty / Yard 08"
            className={inputClass}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-600">Vessel / Boat:</span>
          <input
            type="text"
            value={fields.vesselBoat}
            onChange={(e) => onFieldChange('vesselBoat', e.target.value)}
            disabled={disabled}
            placeholder="e.g. Zakher Star / Marsol"
            className={inputClass}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-600">Transport:</span>
          <input
            type="text"
            value={fields.transport}
            onChange={(e) => onFieldChange('transport', e.target.value)}
            disabled={disabled}
            placeholder="e.g. Emdad Logistics"
            className={inputClass}
          />
        </div>
      </div>

      {/* Column 3: Road Haulage & Driver */}
      <div className="space-y-1.5 bg-white p-2.5 rounded border border-slate-200 shadow-2xs">
        <div className="font-bold text-slate-700 border-b pb-1 text-[11px] uppercase tracking-wider text-blue-900">
          3. Haulage &amp; Driver Details
        </div>
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-600">Vehicle No:</span>
          <input
            type="text"
            value={fields.vehicleNo}
            onChange={(e) => onFieldChange('vehicleNo', e.target.value)}
            disabled={disabled}
            placeholder="e.g. 54912 / 70136 AD"
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-600">Driver Name:</span>
          <input
            type="text"
            value={fields.driverName}
            onChange={(e) => onFieldChange('driverName', e.target.value)}
            disabled={disabled}
            placeholder="e.g. Driver Full Name"
            className={inputClass}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-600">Contact No:</span>
          <input
            type="text"
            value={fields.contactNo}
            onChange={(e) => onFieldChange('contactNo', e.target.value)}
            disabled={disabled}
            placeholder="e.g. +971 50 123 4567"
            className={`${inputClass} font-mono`}
          />
        </div>
      </div>

    </div>
  );
};

/**
 * React.memo with custom comparator:
 * Only re-render when the specific field values, disabled flag, or date actually change.
 * The onFieldChange callback is excluded from comparison — the parent should pass
 * a stable useCallback reference, but even if it doesn't, we don't want a new
 * function reference to blow away the memo.
 */
export const DTFooterSection = React.memo(
  DTFooterSectionInner,
  (prev, next) =>
    prev.disabled === next.disabled &&
    prev.dispatchDate === next.dispatchDate &&
    prev.fields.dispatchedBy === next.fields.dispatchedBy &&
    prev.fields.designation === next.fields.designation &&
    prev.fields.deliveredTo === next.fields.deliveredTo &&
    prev.fields.vesselBoat === next.fields.vesselBoat &&
    prev.fields.transport === next.fields.transport &&
    prev.fields.vehicleNo === next.fields.vehicleNo &&
    prev.fields.driverName === next.fields.driverName &&
    prev.fields.contactNo === next.fields.contactNo
);
