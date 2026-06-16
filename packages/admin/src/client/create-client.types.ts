import type { CollectionManifest, FieldMap } from "@comp/core";

export type Row = Record<string, unknown>;

/** The shape `@comp/server` returns from `GET /collections`. */
export interface CollectionSummary {
  slug: string;
  listDisplay: string[];
  filters: string[];
  search: string[];
  fields: FieldMap;
  primaryKey: string | null;
  manifest: CollectionManifest;
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
  get(slug: string, id: string | number): Promise<Row>;
  create(slug: string, values: Row): Promise<Row>;
  update(slug: string, id: string | number, values: Row): Promise<Row>;
  remove(slug: string, id: string | number): Promise<Row>;
}
