import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Table, useTableSortable } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { useMemo, type JSX } from 'react'
import type {
  CollectionListProps,
  ColumnSort,
  Row,
} from './collection-list.types.js'

function defaultCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

/** Comp says `asc`/`desc`; the table says `ascending`/`descending`. */
function toTableSort(sort: ColumnSort | undefined) {
  if (!sort?.field || !sort.direction) return []
  const direction = sort.direction === 'asc' ? 'ascending' : 'descending'
  return [{ sortKey: sort.field, direction } as const]
}

/**
 * A collection's list view.
 *
 * Purely presentational — it renders what the query layer resolved and nothing
 * more. Sorting is **controlled**: the header reports which column was asked
 * for and the rows arrive already sorted, because a page is a window onto a
 * table and sorting the window would put the wrong rows in it.
 *
 * Selection is an ordinary leading column rather than a plugin, so one
 * `renderCell` contract covers every cell and a row's id stays the list's own
 * idea rather than the table's.
 */
export function CollectionList({
  columns,
  rows,
  renderCell,
  renderHeader,
  renderEmpty,
  selection,
  sort,
  sortable,
  ...rest
}: CollectionListProps): JSX.Element {
  const sortPlugin = useTableSortable<Row>({
    sort: toTableSort(sort),
    onSortChange: (next) => {
      const first = next[0]
      if (sort && first) sort.onSort(first.sortKey)
    },
    allowUnsortedState: true,
  })

  const tableColumns = useMemo<TableColumn<Row>[]>(() => {
    const selectionColumn: TableColumn<Row>[] = selection
      ? [
          {
            key: '__select',
            width: { type: 'pixel', value: 48 },
            header: selection.onToggleAll ? (
              <CheckboxInput
                label="Select all"
                isLabelHidden
                value={selection.allSelected ?? false}
                onChange={selection.onToggleAll}
              />
            ) : null,
            renderCell: (row: Row) => {
              const id = selection.getRowId(row)
              if (id === null) return null
              return (
                <CheckboxInput
                  label={`Select ${id}`}
                  isLabelHidden
                  value={selection.selected.has(id)}
                  onChange={() => selection.onToggle(id)}
                />
              )
            },
          },
        ]
      : []

    return [
      ...selectionColumn,
      ...columns.map<TableColumn<Row>>((column) => ({
        key: column,
        header: renderHeader ? renderHeader(column) : column,
        // A column the server cannot order by offers no sort: a control that
        // looks like it sorts and does nothing is worse than a plain heading.
        sortable: Boolean(sort) && (!sortable || sortable.includes(column)),
        renderCell: (row: Row) =>
          renderCell
            ? renderCell({ column, value: row[column], row })
            : defaultCell(row[column]),
      })),
    ]
  }, [columns, renderCell, renderHeader, selection, sort, sortable])

  if (rows.length === 0 && renderEmpty) {
    return <>{renderEmpty()}</>
  }

  return (
    <Table<Row>
      data={rows}
      columns={tableColumns}
      plugins={sort ? { sortable: sortPlugin } : {}}
      {...rest}
    />
  )
}
