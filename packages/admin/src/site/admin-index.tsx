import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import type { ComponentPropsWithoutRef, JSX } from 'react'
import { mergeProps } from '../merge-props/merge-props.js'
import type { AdminIndexProps } from './admin-site.types.js'
import { can } from './site.utils.js'

/**
 * The site index: every collection this caller can open, and an add button
 * where they may create. Registering a collection is what puts it here — there
 * is no separate menu to keep in step with the registry.
 */
export function AdminIndex({
  collections,
  navigate,
  ...rest
}: AdminIndexProps): JSX.Element {
  if (collections.length === 0) {
    return (
      <EmptyState
        title="Nothing to show"
        description="No collections are available to you."
      />
    )
  }

  return (
    <VStack
      as="nav"
      gap={2}
      {...mergeProps<ComponentPropsWithoutRef<'nav'>>(
        { 'aria-label': 'Collections' },
        rest,
      )}
    >
      {collections.map((collection) => (
        <HStack key={collection.slug} gap={2} align="center">
          <Button
            label={collection.labelPlural}
            variant="secondary"
            onClick={() => navigate({ view: 'list', slug: collection.slug })}
          />
          {can(collection, 'create') && (
            <Button
              label={`Add ${collection.label}`}
              variant="ghost"
              onClick={() => navigate({ view: 'add', slug: collection.slug })}
            />
          )}
        </HStack>
      ))}
    </VStack>
  )
}
