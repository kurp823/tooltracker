import { useListOptions } from '../contexts/ListsContext'

/*
 * The <option> elements for one dropdown, read from tbl_Lists.
 *
 * Written as a component rather than a hook so a screen swaps
 *
 *     {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
 * for
 *     <ListOptions name="MaintenanceStatus" current={form.Status} />
 *
 * in one line, wherever it sits — including inside a nested component or a
 * loop, where a hook could not go.
 */

interface Props {
  /** The ListName in tbl_Lists, e.g. 'JobStatus'. */
  name: string
  /**
   * The value this record already holds. It is always offered, even when it
   * is no longer in the list — a record saved years ago may carry a value
   * since hidden, and a dropdown that did not offer it would silently
   * change that record to whatever sits at the top on the next save.
   */
  current?: string | null
  /** A leading blank option, for filters and optional fields. */
  blank?: boolean
  /** Label for the blank option. */
  blankLabel?: string
  /** A leading 'All' option, for filter bars. */
  includeAll?: boolean
  /** Label for that option — 'All Statuses', 'All Priorities' and so on. */
  allLabel?: string
}

export function ListOptions({ name, current, blank, blankLabel, includeAll, allLabel }: Props) {
  const { options, isLoading, error, configured } = useListOptions(name, current)

  return (
    <>
      {includeAll && <option value="All">{allLabel ?? 'All'}</option>}
      {blank      && <option value="">{blankLabel ?? ''}</option>}

      {options.map(o => (
        <option key={o.value} value={o.value}>
          {/* A value no longer on offer is still shown, marked, so nobody
              wonders why a record reads something the list does not have. */}
          {o.retired ? `${o.label} (not in list)` : o.label}
        </option>
      ))}

      {/* No invented fallback values: if the list cannot be read, the
          dropdown says so rather than offering a set that may not match
          what this database holds. */}
      {!isLoading && !configured && !current && (
        <option value="" disabled>
          {error ? 'Could not load options' : `No values set up for ${name}`}
        </option>
      )}
    </>
  )
}
