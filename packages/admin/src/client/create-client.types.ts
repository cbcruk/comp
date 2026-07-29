import type {
  ActionManifest,
  ActionResult,
  CollectionManifest,
  FieldMap,
  FilterSummary,
  InboundRelation,
  InlineSummary,
  InlineWritePayload,
  OutboundRelation,
} from "@comp/core";

export type Row = Record<string, unknown>;
export type Id = string | number;

/** The shape `@comp/server` returns from `GET /collections`. */
export interface CollectionSummary {
  slug: string;
  listDisplay: string[];
  /** Filters with their kind, choices, and relation binding resolved. */
  filters: FilterSummary[];
  search: string[];
  fields: FieldMap;
  primaryKey: string | null;
  /** Field standing in for a record when another collection references it. */
  labelField: string | null;
  /** Foreign keys on this collection, resolved to their target collection. */
  relations: OutboundRelation[];
  /** Foreign keys on other collections pointing at this one. */
  inbound: InboundRelation[];
  /** Child collections edited alongside a record of this one. */
  inlines: InlineSummary[];
  manifest: CollectionManifest;
  actions: ActionManifest[];
}

export interface ActionRunBody {
  ids: Id[];
  input?: unknown;
}

/** A record together with the child rows of its inlines. */
export interface RecordResult {
  data: Row;
  inlines?: Record<string, Row[]>;
}

export interface ListResult {
  data: Row[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: string;
  filters?: Record<string, string>;
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
  create(slug: string, values: Row, inlines?: InlineWritePayload): Promise<Row>;
  update(
    slug: string,
    id: Id,
    values: Row,
    inlines?: InlineWritePayload,
  ): Promise<Row>;
  remove(slug: string, id: Id): Promise<Row>;
  action(slug: string, name: string, body: ActionRunBody): Promise<ActionResult>;
}
