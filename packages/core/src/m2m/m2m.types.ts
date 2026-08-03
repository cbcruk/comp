import type { Table } from "drizzle-orm";
import type { Collection } from "../collection/define-collection.types.js";

/**
 * A many-to-many relationship, declared on the collection that edits it.
 *
 * Django puts a `ManyToManyField` on the model and generates the join table.
 * A Drizzle schema has no such field — the join table is the declaration — so
 * what an author names here is the table itself and the collection on the far
 * side. Everything else (which key goes where, what it points at) is read off
 * the schema, which is why `through` is the one structural thing that has to
 * be passed: nothing points at a join table, so the registry cannot find it.
 */
export interface ManyToManyConfig {
  /** Slug of the collection on the other side. */
  collection: string;
  /** The join table. */
  through: Table;
  /**
   * Name this appears under in payloads and on the form. Defaults to the other
   * collection's slug; set it when a collection joins the same one twice.
   */
  name?: string;
  /** Join-table key pointing here; needed only when it points here twice. */
  field?: string;
  /** Join-table key pointing at the other side; same rule. */
  targetField?: string;
  /**
   * Offer this relationship as a filter — Django's `list_filter` over a
   * many-to-many. Declared here rather than in `filters` because a
   * relationship's name is not a column of this table, and `filters` is
   * checked against the columns at authoring time; a name that slipped past
   * that check would be a filter that silently never matched.
   */
  filter?: boolean;
}

/**
 * A many-to-many resolved against the two tables it joins. Everything the
 * query layer needs is here, and none of it required the registry: which key
 * is ours, which is theirs, and what each points at are facts about the join
 * table alone. Binding the far side to a *collection* does need the registry,
 * and that happens later in {@link ManyToManySpec}.
 */
export interface ManyToManyMeta {
  /** Property name in payloads. */
  name: string;
  /** Declared slug of the collection on the far side. */
  collection: string;
  /** Table on the far side, which the registry checks that slug against. */
  table: string;
  through: Table;
  /** Join-table field holding this collection's key. */
  field: string;
  /** Field on this collection that key points at. */
  parentKey: string;
  /** Join-table field holding the far side's key. */
  targetField: string;
  /** Field on the far collection that key points at. */
  targetKey: string;
  /** Whether it is offered as a filter. */
  filter: boolean;
}

/** A many-to-many with the far side bound to a registered collection. */
export interface ManyToManySpec extends ManyToManyMeta {
  target: Collection;
}

/** The serializable view, for clients and tool schemas. */
export interface ManyToManySummary {
  name: string;
  /** Slug of the collection on the far side. */
  collection: string;
  /** Field on that collection a link stores — the option's value. */
  targetKey: string;
  /** Field standing in for one of its records. */
  labelField: string | null;
}

/**
 * The links a write sets, keyed by relationship name: the complete membership,
 * not a set of changes.
 *
 * This is Django's `.set()`, and it is the shape because it is what a form can
 * honestly produce — a multi-select knows what is selected now, not what was
 * added since it was drawn. The diff against what is stored happens on the
 * server, where the current state actually is.
 */
export type ManyToManyWrite = Record<string, unknown[]>;

/** What a write changed, per relationship. */
export interface ManyToManyResult {
  name: string;
  linked: unknown[];
  unlinked: unknown[];
}
