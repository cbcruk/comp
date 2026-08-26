import type { Table } from 'drizzle-orm'
import { foreignTableFor } from '../introspection/foreign-table.js'
import type { FieldMap } from '../introspection/introspect-table.types.js'
import type { ManyToManyMeta } from '../m2m/m2m.types.js'
import type { ResolvedSearch, SearchLookup } from './search.types.js'

const PREFIX: Record<string, SearchLookup> = {
  '^': 'startswith',
  '=': 'exact',
}

/** Split `field__other` into the key and the field on the far side. */
function splitTraversal(name: string): [string, string | undefined] {
  const at = name.indexOf('__')
  return at === -1 ? [name, undefined] : [name.slice(0, at), name.slice(at + 2)]
}

/** Refuse a traversal that lands on a column the far table does not have. */
function assertFarField(
  slug: string,
  key: string,
  target: string,
  fields: FieldMap | undefined,
): void {
  if (!fields || fields[target]) return
  throw new Error(
    `Search on "${slug}" traverses "${key}" to "${target}", which is not a column there`,
  )
}

/**
 * Resolve a collection's declared search fields.
 *
 * Each entry names a column and, through its prefix, how that column is
 * matched. `field__other` follows the foreign key held in `field` — the target
 * table comes from the schema, so a traversal names a column that exists rather
 * than a relation the app had to describe.
 *
 * A traversal may also name a declared many-to-many instead of a column, and
 * then it reaches across the join table to the collection on the far side.
 * That needs no registry either: nothing points at a join table, but the join
 * table points at both sides, so the far table is reachable from its own keys.
 *
 * A name that is neither a column nor a relationship, a traversal through
 * something that is not a foreign key, and a traversal onto a column the far
 * table does not have all throw here — rather than quietly searching one field
 * fewer, which is indistinguishable from a search that found nothing.
 */
export function resolveSearch(
  slug: string,
  model: Table,
  fields: FieldMap,
  links: readonly ManyToManyMeta[],
  configs: readonly string[],
): ResolvedSearch[] {
  const resolved: ResolvedSearch[] = []
  const byName = new Map(links.map((meta) => [meta.name, meta]))

  for (const config of configs) {
    const lookup = PREFIX[config.charAt(0)] ?? 'contains'
    const name = lookup === 'contains' ? config : config.slice(1)
    const [key, target] = splitTraversal(name)

    const field = fields[key]
    const link = byName.get(key)

    if (!field && !link) {
      throw new Error(
        `Search on "${slug}" names "${key}", which is neither a column nor a relationship`,
      )
    }

    if (target === undefined) {
      if (!field) {
        throw new Error(
          `Search on "${slug}" names the relationship "${key}"; name a field on it, as "${key}__<field>"`,
        )
      }
      resolved.push({ field: key, lookup })
      continue
    }

    if (link) {
      // The far side is reached from the join table's own foreign key, the
      // same way a plain traversal reaches it from the collection's.
      const far = foreignTableFor(link.through, link.targetField)
      assertFarField(slug, key, target, far?.fields)
      resolved.push({
        field: key,
        lookup,
        link: { relationship: key, field: target },
      })
      continue
    }

    if (!field?.relation) {
      throw new Error(
        `Search on "${slug}" traverses "${key}", which is not a foreign key`,
      )
    }
    assertFarField(slug, key, target, foreignTableFor(model, key)?.fields)
    resolved.push({
      field: key,
      lookup,
      through: { table: field.relation.table, field: target },
    })
  }

  return resolved
}

/**
 * Split a query into terms, keeping a quoted phrase whole.
 *
 * Django splits the search box the same way and requires every term to match
 * something, which is what makes typing more words narrow the list instead of
 * widening it — the behavior people expect from a search box and the opposite
 * of matching the whole string as one substring.
 */
export function splitSearchTerms(query: string): string[] {
  const terms: string[] = []
  let current = ''
  let quoted = false

  for (const character of query) {
    if (character === '"') {
      quoted = !quoted
      continue
    }
    if (!quoted && /\s/.test(character)) {
      if (current !== '') terms.push(current)
      current = ''
      continue
    }
    current += character
  }
  if (current !== '') terms.push(current)

  return terms
}
