import { Selector } from '@astryxdesign/core/Selector'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
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
    <VStack gap={1}>
      <Selector
        label={control.field.name}
        value={control.value}
        isRequired={required}
        placeholder="—"
        hasSearch
        onChange={(next) => control.onChange(next)}
        {...(error ? { status: { type: 'error' as const, message: error.message } } : {})}
        options={[
          { value: '', label: '—' },
          // A value already set but outside the offered records still renders,
          // by its key, rather than silently reading as blank.
          ...(missing ? [{ value: current, label: current }] : []),
          ...options.map((option) => ({
            value: option.value,
            label: option.label,
          })),
        ]}
      />
      {truncated && (
        <Text size="sm" color="secondary" role="note">
          {`showing the first ${String(options.length)} ${collection}`}
        </Text>
      )}
    </VStack>
  )
}
