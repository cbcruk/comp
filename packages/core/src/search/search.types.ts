/**
 * How one search field matches. Django spells these as prefixes on
 * `search_fields` — `^` for the start of the value, `=` for the whole of it,
 * nothing for anywhere inside it — and the prefix is the whole vocabulary.
 */
export type SearchLookup = "contains" | "startswith" | "exact";

/** A search that reaches through a foreign key into another table. */
export interface SearchTraversal {
  /** Referenced table, as named in the database. */
  table: string;
  /** Field on the referenced collection being matched. */
  field: string;
}

export interface ResolvedSearch {
  /** Field on this collection; the foreign key itself when traversing. */
  field: string;
  lookup: SearchLookup;
  /** Set when the match happens on the far side of a foreign key. */
  through?: SearchTraversal;
}

/**
 * Authoring form. A bare name searches that column; `^` and `=` change the
 * lookup; `field__other` follows the foreign key in `field` and matches
 * `other` on the collection it points at.
 */
export type SearchConfig<TField extends string = string> = TField | string;
