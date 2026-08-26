import type { Table } from 'drizzle-orm'
import { foreignTableFor } from '../introspection/foreign-table.js'
import type { FieldMap } from '../introspection/introspect-table.types.js'
import type { ManyToManyMeta } from '../m2m/m2m.types.js'

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
  listDisplay: readonly string[],
): ListColumn[] {
  const linkNames = new Set(links.map((meta) => meta.name))

  return listDisplay.map((key) => {
    const [name, target] = splitTraversal(key)

    if (target === undefined) {
      if (!fields[name]) {
        throw new Error(
          `listDisplay on "${slug}" names "${name}", which is not a column`,
        )
      }
      return { key, field: name }
    }

    if (linkNames.has(name)) {
      throw new Error(
        `listDisplay on "${slug}" traverses "${name}", which is a many-to-many; a record has any number of them, so there is no single value for a cell`,
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
    }
  })
}
