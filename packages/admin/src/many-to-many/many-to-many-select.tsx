import type { ManyToManySummary } from '@comp/core'
import { Banner } from '@astryxdesign/core/Banner'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import {
  useDeferredValue,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type JSX,
} from 'react'
import type { CompClient } from '../client/create-client.types.js'
import { useReferenceOptions } from '../collection-browser/use-reference-options.js'
import { mergeProps } from '../merge-props/merge-props.js'
import { isLinked, toggleLink } from './links.js'

export interface ManyToManySelectProps extends Omit<
  ComponentPropsWithoutRef<'fieldset'>,
  'onChange'
> {
  client: CompClient
  /** The relationship, as the server resolved it. */
  relation: ManyToManySummary
  /** Ids currently linked. */
  value: readonly unknown[]
  onChange: (next: unknown[]) => void
  /**
   * Label per linked id, as the record read reported it. Without it a linked
   * record outside the current search results has no name to show.
   */
  labels?: Record<string, string>
  /** Heading for the group; defaults to the relationship's name. */
  legend?: string
}

/**
 * The widget for a many-to-many: the linked records, and a search for more.
 *
 * Checkboxes rather than a multi-select, for the reason Django moved away from
 * one: a `<select multiple>` loses the whole selection to a stray click, and
 * the set is the value here — there is no "changed one row" to fall back on.
 *
 * What it does **not** do is list the far collection. Offering its first page
 * as if it were the whole thing is a failure that hides itself: past that page
 * a record cannot be linked and, worse, one already linked renders as nothing —
 * so it cannot be unlinked either, and the form silently disagrees with the
 * database. So the linked records are drawn from the record's own read, always,
 * and everything else is reached by searching. This is what Django's
 * `autocomplete_fields` is for, arrived at from the same problem.
 */
export function ManyToManySelect({
  client,
  relation,
  value,
  onChange,
  labels,
  legend,
  ...rest
}: ManyToManySelectProps): JSX.Element {
  const [search, setSearch] = useState('')
  const deferred = useDeferredValue(search)
  const { options, truncated, loading, error } = useReferenceOptions(
    client,
    relation.collection,
    relation.labelField,
    relation.targetKey,
    { search: deferred },
  )

  // A record checked out of the results has to keep its name when the search
  // moves on: the option it came from is gone, and the record read only knew
  // about what was linked when the form loaded.
  const [seen, setSeen] = useState<Record<string, string>>({})
  useEffect(() => {
    if (options.length === 0) return
    setSeen((prev) => {
      const next = { ...prev }
      let changed = false
      for (const option of options) {
        if (next[option.value] !== option.label) {
          next[option.value] = option.label
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [options])

  const labelFor = (key: string): string =>
    labels?.[key] ?? seen[key] ?? key

  const linkedKeys = value.map((id) => String(id))
  const unlinkedOptions = options.filter(
    (option) => !isLinked(value, option.value),
  )

  return (
    <VStack
      as="fieldset"
      gap={2}
      {...mergeProps<ComponentPropsWithoutRef<'fieldset'>>({}, rest)}
    >
      <Text as="label" weight="medium">
        {legend ?? relation.name}
      </Text>

      {linkedKeys.length === 0 ? (
        <Text size="sm" color="secondary">
          Nothing linked yet.
        </Text>
      ) : (
        linkedKeys.map((key) => (
          <CheckboxInput
            key={key}
            label={labelFor(key)}
            htmlName={relation.name}
            value
            onChange={() => onChange(toggleLink(value, key))}
          />
        ))
      )}

      <TextInput
        label={`Search ${relation.collection}`}
        isLabelHidden
        hasClear
        value={search}
        placeholder={`Search ${relation.collection}…`}
        onChange={(next) => setSearch(next)}
      />

      {error && <Banner status="error" title={error.message} role="alert" />}
      {loading && <Spinner label="Searching…" />}

      {!loading && !error && unlinkedOptions.length === 0 && (
        <Text size="sm" color="secondary">
          {search
            ? `No ${relation.collection} match “${search}”.`
            : `No more ${relation.collection} to link.`}
        </Text>
      )}

      {unlinkedOptions.map((option) => (
        <CheckboxInput
          key={option.value}
          label={option.label}
          htmlName={relation.name}
          value={false}
          onChange={() => onChange(toggleLink(value, option.value))}
        />
      ))}

      {truncated && (
        <Text size="sm" color="secondary" role="note">
          More {relation.collection} match than are shown — keep typing.
        </Text>
      )}
    </VStack>
  )
}
