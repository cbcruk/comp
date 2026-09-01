import type { FilterChoices, FilterSummary } from '@comp/core'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { Text } from '@astryxdesign/core/Text'
import type { JSX } from 'react'
import type { CompClient } from '../client/create-client.types.js'
import { useReferenceOptions } from './use-reference-options.js'
import { NULL_OPTIONS, controlFor, optionsFor } from './filter-controls.js'

export interface FilterFieldProps {
  client: CompClient
  filter: FilterSummary
  value: string
  onChange: (value: string) => void
  /**
   * For a distinct-value filter: the values the current list reported. Without
   * it the control has nothing to offer, since only the data knows them.
   */
  choices?: FilterChoices
}

/**
 * One filter control, chosen by what the column can actually be asked. An enum
 * offers its values, a date its windows, a foreign key the records it points
 * at, a plain column the values it holds, and a nullable column empty/not-empty
 * — none of which the app configures, because the schema and the data already
 * said so.
 */
export function FilterField({
  client,
  filter,
  value,
  onChange,
  choices,
}: FilterFieldProps): JSX.Element {
  const control = controlFor(filter)
  const { options: references, truncated: moreReferences } =
    useReferenceOptions(
      client,
      control === 'reference' ? filter.collection : undefined,
      filter.labelField ?? null,
      filter.targetField,
    )

  if (control === 'text') {
    return (
      <TextInput
        label={filter.field}
        value={value}
        onChange={(next) => onChange(next)}
        hasClear
      />
    )
  }

  const options =
    control === 'reference'
      ? [...references, ...(filter.nullable ? NULL_OPTIONS : [])]
      : control === 'values'
        ? (choices?.options ?? [])
        : optionsFor(filter)

  return (
    <VStack gap={1}>
      <Selector
        label={filter.field}
        aria-label={`Filter by ${filter.field}`}
        value={value}
        onChange={(next) => onChange(next)}
        placeholder="All"
        // A long list of records is worth searching rather than scrolling.
        hasSearch={control === 'reference' || options.length > 10}
        options={[
          { value: '', label: 'All' },
          ...options.map((option) => ({
            value: option.value,
            label: option.label,
          })),
        ]}
      />
      {/* A capped list says so: the column holds values this control is not
          offering, and a filter that hides that hides records with it. */}
      {choices?.truncated && (
        <Text size="sm" color="secondary" role="note">
          {`showing the first ${String(filter.limit ?? options.length)} values`}
        </Text>
      )}
      {/* Same rule for the records a foreign key points at: a filter offering
          some of them, silently, hides the records it would have matched. */}
      {moreReferences && (
        <Text size="sm" color="secondary" role="note">
          {`showing the first ${String(references.length)} ${filter.collection ?? 'records'}`}
        </Text>
      )}
    </VStack>
  )
}
