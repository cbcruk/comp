import type {
  ActionResult,
  DeleteImpact,
  HistoryEntry,
  InlineWritePayload,
} from "@comp/core";
import { CompClientError } from "./client-error.js";
import type {
  ActionRunBody,
  ClientOptions,
  CollectionSummary,
  CompClient,
  ListQuery,
  ListResult,
  RecordResult,
  Row,
} from "./create-client.types.js";

function buildListPath(slug: string, query: ListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.q) params.set("q", query.q);
  if (query.sort) params.set("sort", query.sort);
  if (query.date) params.set("date", query.date);
  for (const [key, value] of Object.entries(query.filters ?? {})) {
    if (value !== "") params.set(key, value);
  }
  const qs = params.toString();
  return `/collections/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`;
}

/**
 * Build a client for the admin API. The same operations the server exposes —
 * never a UI-only path — so the admin, CLI, and future MCP share one surface.
 */
export function createClient(options: ClientOptions): CompClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init?.headers,
      },
    });
    const body: unknown = await response
      .json()
      .catch(() => undefined);
    if (!response.ok) throw new CompClientError(response.status, body);
    return body as T;
  }

  function unwrap<T>(body: { data: T }): T {
    return body.data;
  }

  function getRecord(slug: string, id: string | number): Promise<RecordResult> {
    return request<RecordResult>(
      `/collections/${encodeURIComponent(slug)}/${encodeURIComponent(String(id))}`,
    );
  }

  /** A record and its child rows travel in one request — one user action. */
  function withInlines(values: Row, inlines?: InlineWritePayload): Row {
    return inlines && Object.keys(inlines).length > 0
      ? { ...values, inlines }
      : values;
  }

  return {
    async collections() {
      return request<CollectionSummary[]>("/collections");
    },
    async list(slug, query) {
      return request<ListResult>(buildListPath(slug, query));
    },
    async get(slug, id) {
      return unwrap(await getRecord(slug, id));
    },
    getRecord,
    async create(slug, values, inlines) {
      const body = await request<{ data: Row }>(
        `/collections/${encodeURIComponent(slug)}`,
        { method: "POST", body: JSON.stringify(withInlines(values, inlines)) },
      );
      return unwrap(body);
    },
    async update(slug, id, values, inlines) {
      const body = await request<{ data: Row }>(
        `/collections/${encodeURIComponent(slug)}/${encodeURIComponent(String(id))}`,
        { method: "PATCH", body: JSON.stringify(withInlines(values, inlines)) },
      );
      return unwrap(body);
    },
    async deletePreview(slug, id) {
      const body = await request<{ data: DeleteImpact }>(
        `/collections/${encodeURIComponent(slug)}/${encodeURIComponent(String(id))}/delete-preview`,
      );
      return unwrap(body);
    },
    async history(slug, id, limit) {
      const query = limit === undefined ? "" : `?limit=${String(limit)}`;
      const body = await request<{ data: HistoryEntry[] }>(
        `/collections/${encodeURIComponent(slug)}/${encodeURIComponent(String(id))}/history${query}`,
      );
      return unwrap(body);
    },
    async recentHistory(limit) {
      const query = limit === undefined ? "" : `?limit=${String(limit)}`;
      const body = await request<{ data: HistoryEntry[] }>(`/history${query}`);
      return unwrap(body);
    },
    async remove(slug, id) {
      const body = await request<{ data: Row }>(
        `/collections/${encodeURIComponent(slug)}/${encodeURIComponent(String(id))}`,
        { method: "DELETE" },
      );
      return unwrap(body);
    },
    async action(slug, name, body: ActionRunBody) {
      return request<ActionResult>(
        `/collections/${encodeURIComponent(slug)}/actions/${encodeURIComponent(name)}`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
  };
}
