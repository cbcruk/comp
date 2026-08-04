import type {
  ActionManifest,
  ActionResult,
  CollectionManifest,
  CollectionOperation,
  DeleteImpact,
  FieldMap,
  DateHierarchy,
  FilterChoices,
  FilterSummary,
  HistoryEntry,
  InboundRelation,
  InlineSummary,
  InlineWritePayload,
  ManyToManySummary,
  ManyToManyWrite,
  ResolvedForm,
  ResolvedSearch,
  OutboundRelation,
} from "@comp/core";

export type Row = Record<string, unknown>;
export type Id = string | number;

/** The shape `@comp/server` returns from `GET /collections`. */
export interface CollectionSummary {
  slug: string;
  /** Display name for one record. */
  label: string;
  /** Display name for the collection. */
  labelPlural: string;
  /** What the caller may do here — the manifest narrowed by permission. */
  permitted: CollectionOperation[];
  listDisplay: string[];
  /** Filters with their kind, choices, and relation binding resolved. */
  filters: FilterSummary[];
  /** Search fields with their lookup and relation traversal resolved. */
  search: ResolvedSearch[];
  /** Column the date drill-down navigates, or null. */
  dateHierarchy: string | null;
  fields: FieldMap;
  primaryKey: string | null;
  /** Field standing in for a record when another collection references it. */
  labelField: string | null;
  /** The add/change form as a layout. */
  form: ResolvedForm;
  /** Foreign keys on this collection, resolved to their target collection. */
  relations: OutboundRelation[];
  /** Foreign keys on other collections pointing at this one. */
  inbound: InboundRelation[];
  /** Child collections edited alongside a record of this one. */
  inlines: InlineSummary[];
  /** Many-to-many relationships this collection edits. */
  manyToMany: ManyToManySummary[];
  manifest: CollectionManifest;
  actions: ActionManifest[];
}

export interface ActionRunBody {
  ids: Id[];
  input?: unknown;
}

/** A record together with the child rows of its inlines and its links. */
export interface RecordResult {
  data: Row;
  inlines?: Record<string, Row[]>;
  /** Ids linked through each many-to-many, keyed by relationship name. */
  manyToMany?: Record<string, unknown[]>;
}

export interface ListResult {
  data: Row[];
  page: number;
  pageSize: number;
  total: number;
  /** The drill-down strip for this list; null when none is declared. */
  hierarchy?: DateHierarchy | null;
  /**
   * What each distinct-value filter may be set to, read from the data. Absent
   * unless the collection declares one.
   */
  choices?: FilterChoices[];
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: string;
  filters?: Record<string, string>;
  /** Where the date drill-down is: `2026`, `2026-07`, `2026-07-16`. */
  date?: string;
}

export interface ClientOptions {
  /** Base URL where the admin router is mounted, e.g. "/admin". */
  baseUrl: string;
  /** Optional fetch override (testing, custom headers, auth). */
  fetch?: typeof globalThis.fetch;
}

export interface CompClient {
  collections(): Promise<CollectionSummary[]>;
  list(slug: string, query?: ListQuery): Promise<ListResult>;
  get(slug: string, id: Id): Promise<Row>;
  /** Like `get`, but keeps the inline rows the server sent with the record. */
  getRecord(slug: string, id: Id): Promise<RecordResult>;
  create(
    slug: string,
    values: Row,
    inlines?: InlineWritePayload,
    manyToMany?: ManyToManyWrite,
  ): Promise<Row>;
  update(
    slug: string,
    id: Id,
    values: Row,
    inlines?: InlineWritePayload,
    manyToMany?: ManyToManyWrite,
  ): Promise<Row>;
  /** What deleting this record would reach, before doing it. */
  deletePreview(slug: string, id: Id): Promise<DeleteImpact>;
  /** Who changed this record, newest first; empty when history is off. */
  history(slug: string, id: Id, limit?: number): Promise<HistoryEntry[]>;
  /** Recent activity across every collection the caller may list. */
  recentHistory(limit?: number): Promise<HistoryEntry[]>;
  remove(slug: string, id: Id): Promise<Row>;
  action(slug: string, name: string, body: ActionRunBody): Promise<ActionResult>;
}
