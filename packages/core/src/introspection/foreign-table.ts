import { getTableColumns, is, type Column, type Table } from 'drizzle-orm'
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core'
import { introspectTable } from './introspect-table.js'
import type { FieldMap } from './introspect-table.types.js'

/** A table reached through a foreign key, and what is on it. */
export interface ForeignTable {
  table: SQLiteTable
  columns: Record<string, Column>
  fields: FieldMap
  /** The column over there that the key points at — one side of a join. */
  referenced: Column
}

/**
 * The table a field's foreign key points at, as a Drizzle table rather than a
 * name.
 *
 * `FieldMeta.relation` carries the target's *name*, which is enough to reason
 * about the relation graph but not enough to build a subquery against it or to
 * check that a column exists over there. The table object is reachable from
 * the key itself, so this needs nothing but the table the key is on — no
 * registry, and no requirement that the target be a registered collection.
 *
 * Composite keys are skipped: everything built on this addresses one column.
 */
export function foreignTableFor(
  model: Table,
  field: string,
): ForeignTable | null {
  if (!is(model, SQLiteTable)) return null

  const columns = getTableColumns(model) as Record<string, Column>
  const column = columns[field]
  if (!column) return null

  for (const foreignKey of getTableConfig(model).foreignKeys) {
    const reference = foreignKey.reference()
    if (reference.columns.length !== 1) continue
    if (reference.columns[0]?.name !== column.name) continue
    const referenced = reference.foreignColumns[0]
    if (!referenced) continue
    const table = reference.foreignTable as SQLiteTable
    return {
      table,
      columns: getTableColumns(table) as Record<string, Column>,
      fields: introspectTable(table).fields,
      referenced: referenced as Column,
    }
  }
  return null
}
