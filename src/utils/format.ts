// Formatting utilities

// Historical job numbers were saved in inconsistent formats across tables
// (e.g. "Job-026-01836" on tbl_Jobs vs "JOB-26-01836" on tbl_DeliveryTickets/
// tbl_DailyFieldLogs — same job, different casing and zero-padding).
// Compare job numbers by this normalized form — upper-cased, each
// dash-separated numeric segment stripped of leading zeros — rather than
// exact string equality, so a job's records are found regardless of which
// format they were saved in.
export function normalizeJobId(id: string | null | undefined): string {
  if (!id) return ''
  return id
    .trim()
    .toUpperCase()
    .split('-')
    .map(seg => (/^\d+$/.test(seg) ? String(parseInt(seg, 10)) : seg))
    .join('-')
}

export function formatDate(val: string | null | undefined): string {
  if (!val) return '—'
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

export function formatDateTime(val: string | null | undefined): string {
  if (!val) return '—'
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function formatCurrency(
  amount: number | null | undefined,
  currency = 'USD'
): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(val: number | null | undefined, decimals = 0): string {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val)
}

export function statusBadgeClass(status: string): string {
  const s = (status || '').toLowerCase()
  if (s === 'open')        return 'status-open'
  if (s === 'ongoing' || s === 'active') return 'status-active'
  if (s === 'closed' || s === 'completed' || s === 'jobcompleted') return 'status-completed'
  if (s === 'draft' || s === 'draft invoice submitted') return 'status-draft'
  if (s === 'pending')     return 'status-pending'
  if (s === 'cancelled')   return 'status-cancelled'
  return 'bg-gray-100 text-gray-600'
}

export function toDateInput(val: string | null | undefined): string {
  if (!val) return ''
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return ''
    return d.toISOString().split('T')[0]
  } catch {
    return ''
  }
}

export function pluralize(count: number, word: string, plural?: string): string {
  if (count === 1) return `${count} ${word}`
  return `${count} ${plural ?? word + 's'}`
}
