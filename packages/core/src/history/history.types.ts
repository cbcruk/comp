/** What happened to a record. Django's `action_flag`, spelled out. */
export type HistoryAction = "create" | "update" | "delete";

export interface HistoryEntry {
  collection: string;
  /** Primary key of the record, as text — an entry outlives its row. */
  recordId: string;
  action: HistoryAction;
  /**
   * What the record looked like at the time, from its `labelField`.
   *
   * Django keeps `object_repr` for the same reason: a deletion entry is about
   * a record that no longer exists, so an id alone leaves the history unable
   * to say what was deleted.
   */
  label: string;
  /** Fields that actually changed; empty for a create or a delete. */
  fields: string[];
  /** Who made the change, or null when nobody was authenticated. */
  actor: string | null;
  at: Date;
}

export interface HistoryQuery {
  /** Narrow to one collection. */
  collection?: string;
  /** Narrow to one record; requires `collection`. */
  recordId?: string;
  /** Only collections in this list — how a caller's permissions are applied. */
  collections?: string[];
  limit?: number;
}

/**
 * Where history is kept.
 *
 * An adapter rather than a table baked into core: an app may already have an
 * audit log, may want entries somewhere cheaper than its main database, or may
 * not want them at all. `record` never being called is a valid configuration —
 * history is opt-in, and everything else works without it.
 */
export interface HistoryStore {
  record(entry: HistoryEntry): Promise<void>;
  list(query: HistoryQuery): Promise<HistoryEntry[]>;
}
