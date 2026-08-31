import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack } from '@astryxdesign/core/HStack'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Spinner } from '@astryxdesign/core/Spinner'
import { TextInput } from '@astryxdesign/core/TextInput'
import {
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type JSX,
} from 'react'
import { mergeProps } from '../merge-props/merge-props.js'
import { toInputValue } from '../collection-form/collection-form.utils.js'
import { CollectionList } from '../collection-list/collection-list.js'
import type { CollectionListProps } from '../collection-list/collection-list.types.js'
import { useCollectionList } from '../hooks/use-collection-list.js'
import type { CollectionBrowserProps } from './collection-browser.types.js'
import { InlineInput } from './inline-cell.js'
import { canEditColumn, isEditing } from './inline-edit.js'
import { DateHierarchyStrip } from './date-hierarchy.js'
import { choicesFor } from './filter-controls.js'
import { FilterField } from './filter-field.js'
import { searchPlaceholder } from './search-placeholder.js'
import { pageCount } from './pagination.js'
import { referencesFromRelations, resolveLabel } from './reference-labels.js'
import { allSelected, rowId, toIds, toggle, toggleAll } from './selection.js'
import { nextSort, parseSort } from './sorting.js'
import { useInlineEdit } from './use-inline-edit.js'
import { useReferenceLabels } from './use-reference-labels.js'

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

/**
 * List view for a collection: search, per-column filters, the table with bulk
 * selection, manifest actions, and pagination. All data resolves server-side —
 * the UI only sets query params and dispatches declared actions over the
 * selected ids.
 */
export function CollectionBrowser({
  client,
  collection,
  pageSize,
  renderCell,
  editable = false,
  onNotify,
  onOpenRecord,
  references,
  ...rest
}: CollectionBrowserProps): JSX.Element {
  // FK columns resolve to labels from the introspected relation graph; the
  // prop is an override, not the only way in.
  const resolvedReferences = useMemo(
    () => references ?? referencesFromRelations(collection.relations),
    [references, collection.relations],
  )
  const {
    rows,
    page,
    pageSize: size,
    total,
    hierarchy,
    choices,
    query,
    loading,
    error,
    setQuery,
    reload,
    applyLocal,
  } = useCollectionList(client, collection.slug, pageSize ? { pageSize } : {})

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [actionError, setActionError] = useState<Error | null>(null)
  const pk = collection.primaryKey
  const edit = useInlineEdit(
    client,
    collection.slug,
    reload,
    (id, field, value) =>
      applyLocal((row) => rowId(row, pk) === id, { [field]: value }),
  )
  const labels = useReferenceLabels(client, resolvedReferences)

  const totalPages = pageCount(total, size || 1)
  const filters = query.filters ?? {}
  const currentSort = parseSort(query.sort)

  const customRenderCell: CollectionListProps['renderCell'] = ({
    column,
    value,
    row,
  }) => {
    const display = resolveLabel(labels, column, value, displayValue(value))
    const field = collection.fields[column]
    const id = rowId(row, pk)

    if (onOpenRecord && id !== null && column === collection.listDisplay[0]) {
      return (
        <Button
          label={display || '—'}
          variant="ghost"
          size="sm"
          onClick={() => onOpenRecord(id)}
        />
      )
    }

    if (
      editable &&
      field &&
      id !== null &&
      canEditColumn(collection.fields, pk, column)
    ) {
      if (isEditing(edit.editing, id, column)) {
        return (
          <InlineInput
            field={field}
            value={edit.value}
            busy={edit.busy}
            onChange={edit.change}
            onCommit={() => edit.commit(field)}
            onCancel={edit.cancel}
          />
        )
      }
      return (
        <Button
          label={display || '—'}
          variant="ghost"
          size="sm"
          onClick={() => edit.start(id, column, toInputValue(field, value))}
        />
      )
    }
    return display
  }

  const hasReferences = Object.keys(resolvedReferences).length > 0
  const cellRenderer =
    renderCell ??
    (editable || hasReferences || onOpenRecord ? customRenderCell : undefined)

  async function runAction(name: string): Promise<void> {
    setRunning(true)
    setActionError(null)
    try {
      const result = await client.action(collection.slug, name, {
        ids: toIds(selected),
      })
      setSelected(new Set())
      reload()
      onNotify?.('success', result.message ?? `${name}: done`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (onNotify) {
        onNotify('error', message)
      } else {
        setActionError(new Error(message))
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div {...mergeProps<ComponentPropsWithoutRef<'div'>>({}, rest)}>
      {collection.search.length > 0 && (
        <TextInput
          label={`Search ${collection.slug}`}
          isLabelHidden
          placeholder={searchPlaceholder(collection)}
          description="Every word must match; quote a phrase to keep it together"
          hasClear
          value={query.q ?? ''}
          // Changing the query returns to the first page, like a filter does.
          onChange={(value) => setQuery({ page: 1, q: value })}
        />
      )}

      {hierarchy && (
        <DateHierarchyStrip
          hierarchy={hierarchy}
          value={query.date ?? ''}
          onNavigate={(date) => setQuery({ date })}
        />
      )}

      {collection.filters.map((filter) => (
        <FilterField
          key={filter.field}
          client={client}
          filter={filter}
          // A distinct-value filter's options travel with the list, not with
          // the collection — only the data knows them.
          choices={choicesFor(choices, filter.field)}
          value={filters[filter.field] ?? ''}
          onChange={(value) =>
            // Changing a filter returns to the first page: page 4 of the old
            // result set says nothing about the new one.
            setQuery({
              page: 1,
              filters: { ...filters, [filter.field]: value },
            })
          }
        />
      ))}

      {collection.actions.length > 0 && (
        <HStack gap={2} role="toolbar" aria-label="Actions">
          {collection.actions.map((action) => (
            <Button
              key={action.name}
              label={`${action.name} (${String(selected.size)})`}
              variant="secondary"
              isDisabled={selected.size === 0 || running}
              isLoading={running}
              onClick={() => runAction(action.name)}
            />
          ))}
        </HStack>
      )}

      {[error, actionError, edit.error].map(
        (shown, index) =>
          shown && (
            <Banner
              key={index}
              status="error"
              title={shown.message}
              role="alert"
            />
          ),
      )}

      <CollectionList
        columns={collection.listDisplay}
        sortable={collection.sortable}
        rows={rows}
        renderCell={cellRenderer}
        renderEmpty={() =>
          loading ? (
            <Spinner label="Loading…" />
          ) : (
            <EmptyState
              title="No records"
              description={`Nothing in ${collection.labelPlural.toLowerCase()} matches this view.`}
            />
          )
        }
        sort={{
          field: currentSort?.field ?? null,
          direction: currentSort?.direction ?? null,
          onSort: (column) => setQuery({ sort: nextSort(query.sort, column) }),
        }}
        selection={{
          getRowId: (row) => rowId(row, pk),
          selected,
          onToggle: (id) => setSelected((prev) => toggle(prev, id)),
          onToggleAll: () => setSelected((prev) => toggleAll(rows, pk, prev)),
          allSelected: allSelected(rows, pk, selected),
        }}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={total}
        pageSize={size || 1}
        onChange={(next) => setQuery({ page: next })}
        label={`${collection.labelPlural} pages`}
      />
    </div>
  )
}
