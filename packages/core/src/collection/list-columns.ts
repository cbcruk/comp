import type { Table } from 'drizzle-orm'
import { foreignTableFor } from '../introspection/foreign-table.js'
import type { FieldMap } from '../introspection/introspect-table.types.js'
import type { ManyToManyMeta } from '../m2m/m2m.types.js'

/** Default text between the values a collected column joins together. */
export const DEFAULT_COLLECT_SEPARATOR = ', '

/**
 * A column that gathers a many-to-many into one cell.
 *
 * Declared as an object rather than as `authors__name` because it is not a
 * traversal and must not read like one: a traversal is a join, and a join
 * through a join table multiplies the record. This is an aggregate, computed
 * per row in a correlated subquery, so the row set is untouched and the total
 * still agrees with it.
 */
export interface CollectConfig<TRelationship extends string = string> {
  /** Relationship to gather, by the name it is declared under. */
  collect: TRelationship
  /** Field on the far side to show. */
  field: string
  /** Text between values; defaults to {@link DEFAULT_COLLECT_SEPARATOR}. */
  separator?: string
}

/** One entry of `listDisplay` while authoring. */
export type ListDisplayEntry<TField extends string = string> =
  | TField
  | CollectConfig

/** How a collected column was resolved. */
export interface CollectedColumn {
  relationship: string
  field: string
  separator: string
}

/** One column of the list, resolved against the schema. */
export interface ListColumn {
  /**
   * The key as declared, and the key the value arrives under on a row — a
   * traversal is selected under its own name, so a client reads
   * `row["authorId__name"]` exactly as it reads `row["title"]`.
   */
  key: string
  /** Column on this table; the foreign key itself when traversing one. */
  field: string
  /** Set when the value comes from the table that key points at. */
  through?: { table: string; field: string }
  /** Set when the cell gathers a many-to-many rather than holding a column. */
  collect?: CollectedColumn
  /**
   * Whether the list may be ordered by this column. An aggregate computed per
   * row has no column to sort on, and a header that offers an order it cannot
   * apply is worse than one that does not offer it.
   */
  sortable: boolean
}

/** Split `field__other` into the key and the field on the far side. */
function splitTraversal(name: string): [string, string | undefined] {
  const at = name.indexOf('__')
  return at === -1 ? [name, undefined] : [name.slice(0, at), name.slice(at + 2)]
}

/**
 * Resolve a collection's list columns.
 *
 * A bare name is a column. `field__other` shows `other` from the record the
 * foreign key in `field` points at — Django grew the same `__` lookups in
 * `list_display`, and the reason is the same: the interesting thing about a
 * row is usually not the key itself but what it names.
 *
 * A traversal is only offered through a **foreign key**, never a
 * many-to-many. A record has one author, so its name is a value a cell can
 * hold; it has any number of tags, so there is no single value to show and a
 * join would multiply the row. That is a different question — which is what
 * the tag *filter* and the tag *search* answer.
 *
 * Every failure is at declaration time, because a column that resolves to
 * nothing renders as an empty cell, and an empty cell looks like data.
 */
export function resolveListDisplay(
  slug: string,
  model: Table,
  fields: FieldMap,
  links: readonly ManyToManyMeta[],
  listDisplay: readonly ListDisplayEntry[],
): ListColumn[] {
  const linkNames = new Set(links.map((meta) => meta.name))

  return listDisplay.map((entry) => {
    if (typeof entry !== 'string') return collected(slug, linkNames, entry)

    const key = entry
    const [name, target] = splitTraversal(key)

    if (target === undefined) {
      if (!fields[name]) {
        throw new Error(
          `listDisplay on "${slug}" names "${name}", which is not a column`,
        )
      }
      return { key, field: name, sortable: true }
    }

    if (linkNames.has(name)) {
      throw new Error(
        `listDisplay on "${slug}" traverses "${name}", which is a many-to-many; a record has any number of them, so there is no single value for a cell — gather them with { collect: "${name}", field: "${target}" }`,
      )
    }

    const field = fields[name]
    if (!field) {
      throw new Error(
        `listDisplay on "${slug}" traverses "${name}", which is not a column`,
      )
    }
    if (!field.relation) {
      throw new Error(
        `listDisplay on "${slug}" traverses "${name}", which is not a foreign key`,
      )
    }

    const far = foreignTableFor(model, name)
    if (far && !far.fields[target]) {
      throw new Error(
        `listDisplay on "${slug}" traverses "${name}" to "${target}", which is not a column there`,
      )
    }

    return {
      key,
      field: name,
      through: { table: field.relation.table, field: target },
      sortable: true,
    }
  })
}

/**
 * Resolve `{ collect, field }` against the relationships the collection
 * declares.
 *
 * Only the relationship's *name* can be checked here: the far side is a table
 * name until `bindManyToMany` finds the collection behind it, so whether the
 * field exists over there is checked at bind time — the same split resolution
 * already makes for the keys.
 */
function collected(
  slug: string,
  linkNames: ReadonlySet<string>,
  entry: CollectConfig,
): ListColumn {
  if (!linkNames.has(entry.collect)) {
    throw new Error(
      `listDisplay on "${slug}" collects "${entry.collect}", which is not one of its many-to-many relationships`,
    )
  }
  return {
    key: `${entry.collect}__${entry.field}`,
    field: entry.collect,
    collect: {
      relationship: entry.collect,
      field: entry.field,
      separator: entry.separator ?? DEFAULT_COLLECT_SEPARATOR,
    },
    sortable: false,
  }
}
