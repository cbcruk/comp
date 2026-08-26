/**
 * How one search field matches. Django spells these as prefixes on
 * `search_fields` — `^` for the start of the value, `=` for the whole of it,
 * nothing for anywhere inside it — and the prefix is the whole vocabulary.
 */
export type SearchLookup = 'contains' | 'startswith' | 'exact'

/** A search that reaches through a foreign key into another table. */
export interface SearchTraversal {
  /** Referenced table, as named in the database. */
  table: string
  /** Field on the referenced collection being matched. */
  field: string
}

/**
 * A search that reaches across a join table into the collection on the far
 * side of a many-to-many.
 *
 * It names the relationship rather than a column, because a many-to-many has
 * none on this table — the join table is the declaration. Carrying only names
 * keeps `ResolvedSearch` serializable: the query layer looks the relationship
 * up in `collection.manyToMany`, which is where the tables live.
 */
export interface SearchLink {
  /** Name of the declared many-to-many. */
  relationship: string
  /** Field on the far collection being matched. */
  field: string
}

export interface ResolvedSearch {
  /**
   * Field on this collection; the foreign key itself when traversing one, and
   * the relationship's name when reaching through a join table.
   */
  field: string
  lookup: SearchLookup
  /** Set when the match happens on the far side of a foreign key. */
  through?: SearchTraversal
  /** Set when the match happens across a join table. */
  link?: SearchLink
}

/**
 * Authoring form. A bare name searches that column; `^` and `=` change the
 * lookup; `field__other` follows the foreign key in `field` and matches
 * `other` on the collection it points at, or — when `field` names a declared
 * many-to-many rather than a column — reaches across the join table and
 * matches `other` on the collection at the far end.
 */
export type SearchConfig<TField extends string = string> = TField | string
