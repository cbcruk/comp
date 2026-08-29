import { type JSX } from 'react'
import {
  DEFAULT_REFERENCE_LIMIT,
  useReferenceOptions,
} from '../collection-browser/use-reference-options.js'
import type { ReferenceSelectProps } from './reference-select.types.js'

/**
 * A select whose options come from another collection — the relation (FK)
 * widget. Drop it into a form's `fieldWidgets` for the FK field; the framework
 * never guesses references, the app declares which collection to pull from.
 *
 * It offers a bounded number of records, and says when there are more, because
 * the alternative is a control that presents a prefix of a collection as the
 * whole of it. Two things follow from that and are deliberate: a value already
 * set but outside those records is still rendered, by its key, rather than
 * silently reading as blank; and a collection too large to choose from this way
 * wants the searching widget a many-to-many gets, not a longer list.
 */
export function ReferenceSelect({
  client,
  collection,
  control,
  labelField,
  valueField = 'id',
  pageSize = DEFAULT_REFERENCE_LIMIT,
}: ReferenceSelectProps): JSX.Element {
  const { options, truncated, error } = useReferenceOptions(
    client,
    collection,
    labelField,
    valueField,
    { limit: pageSize },
  )

  const required = control.field.notNull && !control.field.hasDefault
  const current = String(control.value ?? '')
  const missing =
    current !== '' && !options.some((option) => option.value === current)

  return (
    <label>
      {control.field.name}
      <select
        value={control.value}
        required={required}
        onChange={(e) => control.onChange(e.target.value)}
      >
        <option value="">—</option>
        {missing && <option value={current}>{current}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {truncated && (
        <span role="note">
          {`showing the first ${String(options.length)} ${collection}`}
        </span>
      )}
      {error && <span role="alert">{error.message}</span>}
    </label>
  )
}
