import type { ActionResult } from "@comp/core";
import { CompClientError } from "./client-error.js";
import type {
  ActionRunBody,
  ClientOptions,
  CollectionSummary,
  CompClient,
  ListQuery,
  ListResult,
  Row,
} from "./create-client.types.js";

function buildListPath(slug: string, query: ListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.q) params.set("q", query.q);
  if (query.sort) params.set("sort", query.sort);
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

  return {
    async collections() {
      return request<CollectionSummary[]>("/collections");
    },
    async list(slug, query) {
      return request<ListResult>(buildListPath(slug, query));
    },
    async get(slug, id) {
      const body = await request<{ data: Row }>(
        `/collections/${encodeURIComponent(slug)}/${encodeURIComponent(String(id))}`,
      );
      return unwrap(body);
    },
    async create(slug, values) {
      const body = await request<{ data: Row }>(
        `/collections/${encodeURIComponent(slug)}`,
        { method: "POST", body: JSON.stringify(values) },
      );
      return unwrap(body);
    },
    async update(slug, id, values) {
      const body = await request<{ data: Row }>(
        `/collections/${encodeURIComponent(slug)}/${encodeURIComponent(String(id))}`,
        { method: "PATCH", body: JSON.stringify(values) },
      );
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
