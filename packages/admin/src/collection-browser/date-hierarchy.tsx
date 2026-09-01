import { BreadcrumbItem, Breadcrumbs } from '@astryxdesign/core/Breadcrumbs'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import type { DateHierarchy } from '@comp/core'
import type { JSX } from 'react'

export interface DateHierarchyStripProps {
  hierarchy: DateHierarchy
  /** The path currently selected, as it appears in the query string. */
  value: string
  onNavigate: (path: string) => void
}

/**
 * The date drill-down: a trail back up, and the periods one step down that
 * actually contain records.
 *
 * Only non-empty periods are offered — the server counted them within whatever
 * the list is already showing, so a month the current filters emptied is not a
 * link to nowhere.
 */
export function DateHierarchyStrip({
  hierarchy,
  value,
  onNavigate,
}: DateHierarchyStripProps): JSX.Element | null {
  if (hierarchy.choices.length === 0 && hierarchy.breadcrumb.length <= 1) {
    return null
  }

  return (
    <VStack gap={2}>
      <Breadcrumbs label={`Browse by ${hierarchy.field}`}>
        {hierarchy.breadcrumb.map((crumb) => (
          <BreadcrumbItem
            key={crumb.path || 'all'}
            isCurrent={crumb.path === value}
            {...(crumb.path === value
              ? {}
              : { onClick: () => onNavigate(crumb.path) })}
          >
            {crumb.label}
          </BreadcrumbItem>
        ))}
      </Breadcrumbs>

      {hierarchy.choices.length > 0 && (
        <HStack gap={2} wrap="wrap">
          {hierarchy.choices.map((choice) => (
            <Button
              key={choice.path}
              label={`${choice.label} (${String(choice.count)})`}
              variant="ghost"
              size="sm"
              onClick={() => onNavigate(choice.path)}
            />
          ))}
        </HStack>
      )}
    </VStack>
  )
}
