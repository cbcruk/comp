import {
  and,
  eq,
  getTableColumns,
  inArray,
  like,
  or,
  type Column,
  type SQL,
} from 'drizzle-orm'
import { foreignTableFor } from '../introspection/foreign-table.js'
import { SQLiteTable, type SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { Collection } from '../collection/define-collection.types.js'
import type { ResolvedSearch, SearchLookup } from '../search/search.types.js'
import { splitSearchTerms } from '../search/resolve-search.js'
import type { SqliteDb } from './build-list-query.js'

/** The single-column primary key of a table reached by a traversal. */
function keyOf(columns: Record<string, Column>): Column | undefined {
  return Object.values(columns).find((candidate) => candidate.primary)
}

function match(column: Column, lookup: SearchLookup, term: string): SQL {
  switch (lookup) {
    case 'startswith':
      return like(column, `${term}%`)
    case 'exact':
      return eq(column, term)
    default:
      return like(column, `%${term}%`)
  }
}

/**
 * One search field's condition for one term. A traversal becomes a subquery
 * rather than a join: the row set stays one-per-record, so the list needs no
 * `DISTINCT` and its count stays honest — which is the thing a join through a
 * to-many relation costs you.
 */
function condition(
  db: SqliteDb,
  collection: Collection,
  spec: ResolvedSearch,
  term: string,
  columns: Record<string, Column>,
): SQL | undefined {
  if (spec.link) return linkCondition(db, collection, spec, term, columns)

  const column = columns[spec.field]
  if (!column) return undefined

  if (!spec.through) return match(column, spec.lookup, term)

  const target = foreignTableFor(collection.model, spec.field)
  const far = target?.columns[spec.through.field]
  if (!target || !far) return undefined

  const keyColumn = keyOf(target.columns)
  if (!keyColumn) return undefined

  return inArray(
    column,
    db
      // The columns come off an SQLiteTable; the generic `Column` type is
      // just how they are carried around here.
      .select({ value: keyColumn as unknown as SQLiteColumn })
      .from(target.table)
      .where(match(far, spec.lookup, term)),
  )
}

/**
 * A term matched across a join table.
 *
 * Two nested subqueries, and no join at either level: a join through a
 * to-many multiplies a record by its links, and then the list needs a
 * `DISTINCT` and its total stops matching the rows it returned. Reads as "this
 * record's key is among those linked to a far record that matches".
 */
function linkCondition(
  db: SqliteDb,
  collection: Collection,
  spec: ResolvedSearch,
  term: string,
  columns: Record<string, Column>,
): SQL | undefined {
  const link = spec.link
  if (!link) return undefined

  const meta = collection.manyToMany.find(
    (entry) => entry.name === link.relationship,
  )
  if (!meta) return undefined

  const parentColumn = columns[meta.parentKey]
  const joinColumns = getTableColumns(meta.through) as Record<string, Column>
  const linkParent = joinColumns[meta.field]
  const linkTarget = joinColumns[meta.targetField]
  if (!parentColumn || !linkParent || !linkTarget) return undefined

  const far = foreignTableFor(meta.through, meta.targetField)
  const farColumn = far?.columns[link.field]
  const farKey = far ? keyOf(far.columns) : undefined
  if (!far || !farColumn || !farKey) return undefined

  return inArray(
    parentColumn,
    db
      .select({ value: linkParent as unknown as SQLiteColumn })
      .from(meta.through as unknown as SQLiteTable)
      .where(
        inArray(
          linkTarget,
          db
            .select({ value: farKey as unknown as SQLiteColumn })
            .from(far.table)
            .where(match(farColumn, spec.lookup, term)),
        ),
      ),
  )
}

/**
 * Build the search condition: every term must match at least one field.
 *
 * Terms are ANDed and fields ORed, so adding a word narrows the result — the
 * behavior a search box implies. Matching the whole query as one substring, as
 * this used to, means a second word usually finds nothing.
 */
export function searchConditions(
  db: SqliteDb,
  collection: Collection,
  query: string,
): SQL[] {
  if (collection.search.length === 0) return []

  const columns = getTableColumns(collection.model) as Record<string, Column>
  const conditions: SQL[] = []

  for (const term of splitSearchTerms(query)) {
    const matches = collection.search
      .map((spec) => condition(db, collection, spec, term, columns))
      .filter((entry): entry is SQL => entry !== undefined)
    if (matches.length === 0) continue
    conditions.push(matches.length === 1 ? matches[0]! : or(...matches)!)
  }

  return conditions
}

/** The whole search as one condition, or undefined when it matches nothing. */
export function searchCondition(
  db: SqliteDb,
  collection: Collection,
  query: string,
): SQL | undefined {
  const conditions = searchConditions(db, collection, query)
  if (conditions.length === 0) return undefined
  return conditions.length === 1 ? conditions[0] : and(...conditions)
}
