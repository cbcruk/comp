import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import type { ComponentPropsWithoutRef, JSX } from 'react'
import { CollectionBrowser } from '../collection-browser/collection-browser.js'
import { mergeProps } from '../merge-props/merge-props.js'
import { AdminIndex } from './admin-index.js'
import type { AdminSiteProps } from './admin-site.types.js'
import { DeleteScreen } from './delete-screen.js'
import { HistoryScreen } from './history-screen.js'
import { RecordScreen } from './record-screen.js'
import { AdminTheme } from '../theme/admin-theme.js'
import { can } from './site.utils.js'

/**
 * The admin site: register collections and you get the screens, rather than an
 * app assembling one per collection by hand. Index, list, add, change, delete
 * confirmation — each derived from the same declarations everything else reads.
 *
 * Controlled on purpose. It takes the current route and reports navigation, so
 * an app with its own router keeps it; `useHashRoute` is the drop-in for one
 * without. Any screen can be replaced through `renderScreen` — headless here
 * means replaceable, not merely unstyled.
 */
export function AdminSite({
  client,
  collections,
  route,
  onNavigate,
  onNotify,
  fieldWidgets,
  renderScreen,
  header,
  title = 'Admin',
  theme,
  mode,
  ...rest
}: AdminSiteProps): JSX.Element {
  const collection =
    route.view === 'index'
      ? undefined
      : collections.find((entry) => entry.slug === route.slug)

  function screen(): JSX.Element {
    if (route.view === 'index') {
      return <AdminIndex collections={collections} navigate={onNavigate} />
    }
    if (!collection) {
      return (
        <VStack as="section" gap={3}>
          <Banner
            status="error"
            role="alert"
            title={`No collection named “${route.slug}” is available.`}
          />
          <HStack>
            <Button
              label="Back to the index"
              variant="secondary"
              onClick={() => onNavigate({ view: 'index' })}
            />
          </HStack>
        </VStack>
      )
    }

    const replacement = renderScreen?.({
      client,
      collection,
      route,
      navigate: onNavigate,
    })
    if (replacement !== undefined) return <>{replacement}</>

    switch (route.view) {
      case 'list':
        return (
          <VStack as="section" gap={4}>
            <HStack justify="between" align="center" gap={3}>
              <Heading level={2}>{collection.labelPlural}</Heading>
              {can(collection, 'create') && (
                <Button
                  label={`Add ${collection.label.toLowerCase()}`}
                  variant="primary"
                  onClick={() =>
                    onNavigate({ view: 'add', slug: collection.slug })
                  }
                />
              )}
            </HStack>
            <CollectionBrowser
              client={client}
              collection={collection}
              {...(onNotify ? { onNotify } : {})}
              {...(can(collection, 'read')
                ? {
                    onOpenRecord: (id: string) =>
                      onNavigate({ view: 'change', slug: collection.slug, id }),
                  }
                : {})}
            />
          </VStack>
        )
      case 'add':
      case 'change':
        return (
          <RecordScreen
            client={client}
            collection={collection}
            collections={collections}
            id={route.view === 'change' ? route.id : null}
            navigate={onNavigate}
            {...(onNotify ? { onNotify } : {})}
            {...(fieldWidgets?.[collection.slug]
              ? { fieldWidgets: fieldWidgets[collection.slug] }
              : {})}
          />
        )
      case 'history':
        return (
          <HistoryScreen
            client={client}
            collection={collection}
            id={route.id}
            navigate={onNavigate}
          />
        )
      case 'delete':
        return (
          <DeleteScreen
            client={client}
            collection={collection}
            id={route.id}
            navigate={onNavigate}
            {...(onNotify ? { onNotify } : {})}
          />
        )
    }
  }

  return (
    <AdminTheme {...(theme ? { theme } : {})} {...(mode ? { mode } : {})}>
      <VStack
        gap={4}
        padding={4}
        {...mergeProps<ComponentPropsWithoutRef<'div'>>({}, rest)}
      >
        <HStack as="header" justify="between" align="center" gap={3}>
          <Button
            label={title}
            variant="ghost"
            onClick={() => onNavigate({ view: 'index' })}
          />
          {header}
        </HStack>
        {screen()}
      </VStack>
    </AdminTheme>
  )
}
