import type {
  ActionDefinition,
  Collection,
  HistoryStore,
  SqliteDb,
} from "@comp/core";
import { Hono, type Context } from "hono";
import { handleRpc, type JsonRpcRequest } from "./dispatch.js";
import { buildToolRegistry } from "./tools.js";

export interface McpHandlerConfig {
  collections: Collection[];
  actions?: ActionDefinition[];
  /** Resolve the database per request (D1 binding lives on `c.env`). */
  getDb: (c: Context) => SqliteDb;
  /**
   * Where to record who changed what. Pass the same store the HTTP router
   * uses: a write is a write, and a history that only sees one transport is
   * worse than none.
   */
  history?: HistoryStore;
  /** Who these tool calls act as, for history entries. */
  actor?: string | null;
}

/**
 * Mount an MCP endpoint (JSON-RPC over HTTP POST) for the given collections and
 * actions. The tool surface is generated from the same declarations the admin
 * UI and CLI use — one core surface, three frontends.
 */
export function createMcpHandler(config: McpHandlerConfig): Hono {
  const app = new Hono();
  const actions = config.actions ?? [];
  const registry = buildToolRegistry(config.collections, actions);

  app.post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | JsonRpcRequest
      | JsonRpcRequest[]
      | null;
    if (!body) {
      return c.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        400,
      );
    }

    const ctx = {
      registry,
      actions,
      db: config.getDb(c),
      history: config.history,
      actor: config.actor ?? null,
    };

    if (Array.isArray(body)) {
      const responses = await Promise.all(body.map((req) => handleRpc(req, ctx)));
      return c.json(responses.filter((r) => r !== null));
    }

    const response = await handleRpc(body, ctx);
    if (!response) return c.body(null, 204);
    return c.json(response);
  });

  return app;
}
