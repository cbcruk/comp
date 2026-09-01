import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  getTableName,
  gte,
  lt,
  sql,
  type Column,
  type SQL,
  type Table,
} from 'drizzle-orm'
import {
  alias,
  type BaseSQLiteDatabase,
  type SQLiteColumn,
  type SQLiteTable,
} from 'drizzle-orm/sqlite-core'
import { foreignTableFor } from '../introspection/foreign-table.js'
import type { Collection } from '../collection/define-collection.types.js'
import type { FilterMap, FilterValue } from '../filters/filter.types.js'
import type { ManyToManySpec } from '../m2m/m2m.types.js'
import { datePathRange } from '../hierarchy/date-path.js'
import { filterConditions } from './build-filter-where.js'
import { scopeConditions } from './build-scope-where.js'
import { searchConditions } from './build-search-where.js'
import type { ListParams } from './list-query.types.js'

/** Async SQLite database (Cloudflare D1, sqlite-proxy, etc.). */
export type SqliteDb = BaseSQLiteDatabase<'async', unknown>

function columnsOf(model: Table): Record<string, Column> {
  return getTableColumns(model) as Record<string, Column>
}

const FILTER_OPS = new Set(['exact', 'in', 'isnull', 'range', 'preset'])

/** A caller may pass a bare scalar; read it as the exact match it means. */
function asFilterValue(value: unknown): FilterValue | null {
  if (value === undefined || value === null) return null
  if (
    typeof value === 'object' &&
    'op' in value &&
    FILTER_OPS.has(String((value as { op: unknown }).op))
  ) {
    return value as FilterValue
  }
  return { op: 'exact', value }
}

/**
 * The conditions a list request resolves to: its filters, its search, and the
 * window a date drill-down has narrowed to. Exported so the hierarchy strip
 * counts within the same result set the list shows — offering a month that the
 * current filters have emptied would be a link to nothing.
 */
export function buildListWhere(
  db: SqliteDb,
  collection: Collection,
  params: ListParams,
): SQL | undefined {
  const columns = columnsOf(collection.model)
  const conditions: SQL[] = []

  // First, because it is not the request's to negotiate: the rows the caller
  // cannot see are not in the result set the filters then narrow.
  if (params.scope) {
    conditions.push(
      ...scopeConditions(collection, params.scope, params.now ?? new Date()),
    )
  }

  if (params.filters) {
    const values: FilterMap = {}
    for (const [field, raw] of Object.entries(params.filters)) {
      const value = asFilterValue(raw)
      if (value) values[field] = value
    }
    conditions.push(
      ...filterConditions(
        collection,
        columns,
        values,
        params.now ?? new Date(),
        db,
      ),
    )
  }

  const term = params.search?.trim()
  if (term) conditions.push(...searchConditions(db, collection, term))

  // The drill-down narrows the same column the date filter would, through the
  // same half-open range — it is navigation, not a second kind of filter.
  const window = params.datePath ? datePathRange(params.datePath) : null
  if (window && collection.dateHierarchy) {
    const column = columns[collection.dateHierarchy]
    if (column) {
      conditions.push(and(gte(column, window.from), lt(column, window.to))!)
    }
  }

  if (conditions.length === 0) return undefined
  return conditions.length === 1 ? conditions[0] : and(...conditions)
}

/**
 * The joins and extra selections a list's traversed columns need.
 *
 * A foreign key is to-one, so a left join here cannot multiply a record the
 * way one through a join table would — which is why search reaches a far table
 * with a subquery and this reaches it with a join. One alias per foreign key,
 * so a table joined twice through two different keys stays two things.
 *
 * Each value is selected under the declared key, with an explicit `as`. That
 * is not cosmetic: some drivers hand rows back keyed by column name, and
 * `authors.name` beside `posts.name` would collapse into one. `mapWith` keeps
 * the far column's own decoding, so a date over there still arrives as a Date.
 */
function traversals(collection: Collection): {
  joins: { table: SQLiteTable; on: SQL }[]
  selection: Record<string, SQL.Aliased>
  columns: Record<string, Column>
} {
  const joins: { table: SQLiteTable; on: SQL }[] = []
  const selection: Record<string, SQL.Aliased> = {}
  const columns: Record<string, Column> = {}
  const joined = new Map<string, Record<string, Column>>()
  const local = columnsOf(collection.model)

  for (const entry of collection.listColumns) {
    if (!entry.through) continue

    let far = joined.get(entry.field)
    if (!far) {
      const target = foreignTableFor(collection.model, entry.field)
      const key = local[entry.field]
      if (!target || !key) continue
      const aliased = alias(target.table, `__${entry.field}`)
      const aliasedColumns = getTableColumns(aliased) as Record<string, Column>
      const referenced =
        aliasedColumns[nameOf(target.referenced, target.columns)]
      if (!referenced) continue
      joins.push({ table: aliased, on: eq(key, referenced) })
      far = aliasedColumns
      joined.set(entry.field, far)
    }

    const column = far[entry.through.field]
    if (!column) continue
    selection[entry.key] = sql`${column}`.mapWith(column).as(entry.key)
    columns[entry.key] = column
  }

  return { joins, selection, columns }
}

/**
 * The extra selections a list's collected columns need.
 *
 * A correlated subquery per column, never a join. A join through a join table
 * multiplies the record — a book with two authors would be listed twice, and
 * the total would stop agreeing with the rows — which is the same reason the
 * m2m *filter* and the m2m *search* are subqueries. Django reaches the same
 * cell with a method on the model and pays a query per row for it; one
 * aggregate per column costs the same whether the page holds one record or
 * fifty.
 *
 * Aliased explicitly, like a traversal, so a driver that keys rows by column
 * name cannot collide the far table's column with one of ours.
 */
function collected(
  collection: Collection,
  links: readonly ManyToManySpec[],
): Record<string, SQL.Aliased> {
  const selection: Record<string, SQL.Aliased> = {}
  const bySlug = new Map(links.map((spec) => [spec.name, spec]))
  // Both sides are aliased inside the subquery, and the outer reference is
  // qualified by table. Neither is cosmetic: Drizzle emits bare column names
  // when the outer query has one table, so `where book_id = id` would be
  // ambiguous — and a relationship joining a table to itself would be
  // ambiguous even qualified.
  const link = sql.identifier('__collect_link')
  const far = sql.identifier('__collect_target')
  const id = (name: string): SQL => sql`${sql.identifier(name)}`

  for (const entry of collection.listColumns) {
    if (!entry.collect) continue
    const spec = bySlug.get(entry.collect.relationship)
    if (!spec) continue

    const parent = columnsOf(collection.model)[spec.parentKey]
    const label = columnsOf(spec.target.model)[entry.collect.field]
    const targetKey = columnsOf(spec.target.model)[spec.targetKey]
    const linkParent = columnsOf(spec.through)[spec.field]
    const linkTarget = columnsOf(spec.through)[spec.targetField]
    if (!parent || !label || !targetKey || !linkParent || !linkTarget) continue

    selection[entry.key] =
      sql`(select group_concat(${far}.${id(label.name)}, ${entry.collect.separator}) from ${id(getTableName(spec.through))} as ${link} inner join ${id(getTableName(spec.target.model))} as ${far} on ${far}.${id(targetKey.name)} = ${link}.${id(linkTarget.name)} where ${link}.${id(linkParent.name)} = ${id(getTableName(collection.model))}.${id(parent.name)})`.as(
        entry.key,
      )
  }

  return selection
}

/** The property name a column is known by on its table. */
function nameOf(column: Column, columns: Record<string, Column>): string {
  for (const [key, candidate] of Object.entries(columns)) {
    if (candidate.name === column.name) return key
  }
  return column.name
}

function buildOrderBy(
  collection: Collection,
  params: ListParams,
  extra: Record<string, Column> = {},
): SQL[] {
  const columns = { ...columnsOf(collection.model), ...extra }
  const specs = params.ordering ?? collection.ordering
  const order: SQL[] = []
  for (const spec of specs) {
    const column = columns[spec.field]
    if (!column) continue
    order.push(spec.direction === 'desc' ? desc(column) : asc(column))
  }
  return order
}

/**
 * Resolve a collection + request params into a Drizzle list query. The query
 * layer — not the UI — owns filtering, search, ordering, and pagination; this
 * function is the single place all three are turned into SQL.
 *
 * Scoped to SQLite/D1 for v0.1. Other dialects get their own builder behind the
 * same signature when needed.
 */
export function buildListQuery(
  db: SqliteDb,
  collection: Collection,
  params: ListParams = {},
  links: readonly ManyToManySpec[] = [],
) {
  const where = buildListWhere(db, collection, params)
  const { joins, selection, columns } = traversals(collection)
  const orderBy = buildOrderBy(collection, params, columns)
  const pageSize = Math.max(1, params.pageSize ?? collection.pageSize)
  const page = Math.max(1, params.page ?? 1)
  const offset = (page - 1) * pageSize

  // Named explicitly rather than left to `select()`, so a traversal's value
  // can join the same row. With no traversals the two are the same columns in
  // the same order, so a plain list's SQL is unchanged.
  const model = collection.model as unknown as SQLiteTable
  const selected = {
    ...(getTableColumns(collection.model) as Record<string, SQLiteColumn>),
    ...selection,
    ...collected(collection, links),
  }
  let query = db.select(selected).from(model).$dynamic()
  for (const join of joins) query = query.leftJoin(join.table, join.on)
  if (where) query = query.where(where)
  if (orderBy.length > 0) query = query.orderBy(...orderBy)
  return query.limit(pageSize).offset(offset)
}

/**
 * Companion count query for pagination totals, sharing the same filters — and
 * the same `now`, so a relative filter cannot resolve to one window for the
 * rows and another for the total.
 */
export function buildCountQuery(
  db: SqliteDb,
  collection: Collection,
  params: Pick<
    ListParams,
    'search' | 'filters' | 'now' | 'datePath' | 'scope'
  > = {},
) {
  const where = buildListWhere(db, collection, params)
  const query = db
    .select({ count: sql<number>`count(*)` })
    .from(collection.model as unknown as SQLiteTable)
    .$dynamic()
  return where ? query.where(where) : query
}
