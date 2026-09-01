import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Table } from '@astryxdesign/core/Table'
import { VStack } from '@astryxdesign/core/VStack'
import { describeHistory, type HistoryEntry } from '@comp/core'
import { useEffect, useState, type JSX } from 'react'
import type { HistoryScreenProps } from './admin-site.types.js'

/**
 * A record's history — Django's per-object history view.
 *
 * The entries outlive the record, so this screen keeps answering after a
 * delete; that is the whole point of storing what the record was called
 * alongside its id.
 */
export function HistoryScreen({
  client,
  collection,
  id,
  navigate,
}: HistoryScreenProps): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setError(null)
    client
      .history(collection.slug, id)
      .then((result) => {
        if (!cancelled) setEntries(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      })
    return () => {
      cancelled = true
    }
  }, [client, collection.slug, id])

  const rows = (entries ?? []).map((entry, index) => ({
    key: `${String(entry.at)}-${String(index)}`,
    when: new Date(entry.at),
    who: entry.actor ?? '—',
    what: describeHistory(entry),
  }))

  return (
    <VStack as="section" gap={4}>
      <HStack justify="between" align="center" gap={3}>
        <Heading level={2}>
          History of {collection.label.toLowerCase()} {id}
        </Heading>
        <Button
          label="Back to the record"
          variant="secondary"
          onClick={() =>
            navigate({ view: 'change', slug: collection.slug, id })
          }
        />
      </HStack>

      {error && <Banner status="error" title={error.message} role="alert" />}
      {!entries && !error && <Spinner label="Loading…" />}
      {entries?.length === 0 && (
        <EmptyState
          title="No history"
          description="Nothing has been recorded for this record."
        />
      )}

      {rows.length > 0 && (
        <Table
          data={rows}
          idKey="key"
          columns={[
            {
              key: 'when',
              header: 'When',
              renderCell: (row) => (
                <time dateTime={(row.when as Date).toISOString()}>
                  {(row.when as Date).toLocaleString()}
                </time>
              ),
            },
            { key: 'who', header: 'Who' },
            { key: 'what', header: 'What' },
          ]}
        />
      )}
    </VStack>
  )
}
