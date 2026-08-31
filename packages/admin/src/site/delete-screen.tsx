import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import type { DeleteImpact } from '@comp/core'
import { useEffect, useState, type JSX } from 'react'
import type { DeleteScreenProps } from './admin-site.types.js'
import { describeImpact, summarizeImpact } from './site.utils.js'

/**
 * The delete confirmation. It does not just ask "are you sure" — it says what
 * the delete reaches, counted from the database, and refuses outright when a
 * foreign key would. A confirmation that cannot tell you the consequences is
 * only a speed bump.
 */
export function DeleteScreen({
  client,
  collection,
  id,
  navigate,
  onNotify,
}: DeleteScreenProps): JSX.Element {
  const [impact, setImpact] = useState<DeleteImpact | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setImpact(null)
    setError(null)
    client
      .deletePreview(collection.slug, id)
      .then((result) => {
        if (!cancelled) setImpact(result)
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

  const back = (): void =>
    navigate({ view: 'change', slug: collection.slug, id })

  if (error) {
    return (
      <VStack as="section" gap={3}>
        <Banner status="error" title={error.message} role="alert" />
        <HStack>
          <Button label="Back" variant="secondary" onClick={back} />
        </HStack>
      </VStack>
    )
  }
  if (!impact) return <Spinner label="Checking what this would affect…" />

  const lines = describeImpact(impact)

  return (
    <VStack as="section" gap={3}>
      <Heading level={2}>
        Delete {collection.label.toLowerCase()} {id}?
      </Heading>
      <Text>{summarizeImpact(impact)}</Text>

      {lines.length > 0 && (
        <VStack gap={1}>
          {lines.map((line) => (
            <Text
              key={line.collection}
              size="sm"
              color={line.blocking ? 'accent' : 'secondary'}
              {...(line.blocking ? { role: 'alert' } : {})}
            >
              {line.text}
            </Text>
          ))}
        </VStack>
      )}

      <HStack gap={2}>
        <Button label="Cancel" variant="secondary" onClick={back} />
      <Button
        label={impact.blocked ? 'Cannot delete' : 'Delete'}
        variant="destructive"
        isDisabled={impact.blocked || busy}
        isLoading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await client.remove(collection.slug, id)
            onNotify?.('success', `${collection.label} ${id} deleted`)
            navigate({ view: 'list', slug: collection.slug })
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (onNotify) onNotify('error', message)
            else setError(new Error(message))
          } finally {
            setBusy(false)
          }
        }}
      />
      </HStack>
    </VStack>
  )
}
