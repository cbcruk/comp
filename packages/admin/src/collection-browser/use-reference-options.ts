import type { FilterOption } from '@comp/core'
import { useEffect, useState } from 'react'
import type { CompClient } from '../client/create-client.types.js'
import { toOptions } from '../reference-select/reference-select.utils.js'

/** How many records a reference widget offers before saying there are more. */
export const DEFAULT_REFERENCE_LIMIT = 50

export interface ReferenceOptionsResult {
  options: FilterOption[]
  /**
   * Whether the far collection holds more records than these. A widget that
   * cannot say so is one that claims a collection is smaller than it is.
   */
  truncated: boolean
  loading: boolean
  /**
   * Why the options are empty, when that is the reason. An empty list and a
   * failed request look identical on screen, and only one of them means the
   * collection has nothing to offer.
   */
  error: Error | null
}

export interface ReferenceOptionsQuery {
  /** Narrows the options through the far collection's declared `search`. */
  search?: string
  limit?: number
}

/**
 * Options for a widget that points at another collection — the records it may
 * choose among.
 *
 * The far collection is **searched, not enumerated**. Reading its first page
 * and treating that as the whole of it is wrong in a way that hides itself:
 * past the page a record cannot be chosen, cannot be labeled, and nothing on
 * screen says it is missing. So the term goes to the server as `q`, resolved by
 * that collection's own `search` — knowing how to find one of its records is
 * its business, not the widget's.
 *
 * The query asks for one row more than it shows, which is how a capped list can
 * say it is a prefix rather than quietly ending — the rule a `values` filter
 * already follows.
 */
export function useReferenceOptions(
  client: CompClient,
  collection: string | undefined,
  labelField: string | null,
  valueField = 'id',
  query: ReferenceOptionsQuery = {},
): ReferenceOptionsResult {
  const { search, limit = DEFAULT_REFERENCE_LIMIT } = query
  const [options, setOptions] = useState<FilterOption[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!collection || !labelField) {
      setOptions([])
      setTruncated(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    client
      .list(collection, {
        pageSize: limit + 1,
        ...(search ? { q: search } : {}),
      })
      .then((result) => {
        if (cancelled) return
        setTruncated(result.data.length > limit)
        setOptions(
          toOptions(result.data.slice(0, limit), valueField, labelField).map(
            (option) => ({ value: String(option.value), label: option.label }),
          ),
        )
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setOptions([])
        setTruncated(false)
        setError(cause instanceof Error ? cause : new Error(String(cause)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [client, collection, labelField, valueField, search, limit])

  return { options, truncated, loading, error }
}
