import type {
  ActionManifest,
  ActionResult,
  CollectionManifest,
  FieldMap,
} from "@comp/core";

export type Row = Record<string, unknown>;
export type Id = string | number;

/** The shape `@comp/server` returns from `GET /collections`. */
export interface CollectionSummary {
  slug: string;
  listDisplay: string[];
  filters: string[];
  search: string[];
  fields: FieldMap;
  primaryKey: string | null;
  manifest: CollectionManifest;
  actions: ActionManifest[];
}

export interface ActionRunBody {
  ids: Id[];
  input?: unknown;
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
  create(slug: string, values: Row): Promise<Row>;
  update(slug: string, id: Id, values: Row): Promise<Row>;
  remove(slug: string, id: Id): Promise<Row>;
  action(slug: string, name: string, body: ActionRunBody): Promise<ActionResult>;
}
