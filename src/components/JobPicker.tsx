import React, { useMemo } from 'react'
import { ComboBox } from './ComboBox'
import { useFetch } from '../hooks/useFetch'

export interface JobRef {
  JobID: string; Rig: string | null; Well: string | null; Client: string | null
  Contract?: string | null; Status?: string | null; InvoicingType?: string | null; Currency?: string | null
}

/**
 * Type-to-search job picker. One component for every screen that asks for a
 * job, so they all behave the same: type part of the job number, rig, well or
 * client; the list filters as you type and shows the newest jobs on focus.
 *
 * scope 'active' (default) = jobs not finished or cancelled — tickets,
 * utilization, inspection. scope 'all' = every job — invoicing and history.
 */
export function JobPicker({
  value, onChange, scope = 'active', placeholder, allLabel, className, inputClassName, disabled, autoFocus,
}: {
  value: string
  onChange: (jobId: string, job?: JobRef) => void
  scope?: 'active' | 'all'
  placeholder?: string
  /** When given, an "all" row is offered (a filter); omit on a data-entry form. */
  allLabel?: string
  className?: string
  inputClassName?: string
  disabled?: boolean
  autoFocus?: boolean
}) {
  const { data: jobs, isLoading } = useFetch<JobRef[]>(scope === 'active' ? '/jobs?status=Active' : '/jobs?slim=1')
  const options = useMemo(() => (jobs || []).map(j => ({
    value: j.JobID,
    label: `${j.JobID} — ${j.Rig || '—'} / ${j.Well || '—'}${j.Client ? ` · ${j.Client}` : ''}`,
  })), [jobs])
  const byId = useMemo(() => new Map((jobs || []).map(j => [j.JobID, j])), [jobs])

  return (
    <ComboBox
      value={value}
      onChange={v => onChange(v, byId.get(v))}
      options={options}
      showAll={!!allLabel}
      allLabel={allLabel}
      placeholder={isLoading ? 'Loading jobs…' : (placeholder || 'Type job number, rig, well or client…')}
      className={className}
      inputClassName={inputClassName}
      disabled={disabled || isLoading}
    />
  )
}
