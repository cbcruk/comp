import {
  buildCountQuery,
  buildDeleteQuery,
  buildGetByIdQuery,
  buildInsertQuery,
  buildListQuery,
  buildUpdateQuery,
  validateInsert,
  validateUpdate,
  ValidationError,
  type ActionDefinition,
  type Collection,
  type ListParams,
  type SqliteDb,
} from "@comp/core";
import type { ToolBinding } from "./tools.js";
import { listTools } from "./tools.js";

export const PROTOCOL_VERSION = "2024-11-05";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpContext {
  registry: Map<string, ToolBinding>;
  actions: ActionDefinition[];
  db: SqliteDb;
}

interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function text(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function parseOrdering(sort: unknown): ListParams["ordering"] {
  if (typeof sort !== "string" || sort === "") return undefined;
  const [field, direction] = sort.split(":");
  if (!field) return undefined;
  return [{ field, direction: direction === "desc" ? "desc" : "asc" }];
}

function listParams(args: Record<string, unknown>): ListParams {
  return {
    page: typeof args.page === "number" ? args.page : undefined,
    pageSize: typeof args.pageSize === "number" ? args.pageSize : undefined,
    search: typeof args.q === "string" ? args.q : undefined,
    filters:
      args.filters && typeof args.filters === "object"
        ? (args.filters as Record<string, unknown>)
        : undefined,
    ordering: parseOrdering(args.sort),
  };
}

async function runTool(
  binding: ToolBinding,
  args: Record<string, unknown>,
  ctx: McpContext,
): Promise<ToolResult> {
  const collection: Collection = binding.collection;
  const db = ctx.db;

  switch (binding.kind) {
    case "list": {
      const params = listParams(args);
      const rows = await buildListQuery(db, collection, params).all();
      const totals = await buildCountQuery(db, collection, params).all();
      return text({ data: rows, total: totals[0]?.count ?? 0 });
    }
    case "get": {
      const rows = await buildGetByIdQuery(db, collection, args.id).all();
      if (!rows[0]) return { ...text({ error: "Not found" }), isError: true };
      return text(rows[0]);
    }
    case "create": {
      const values = validateInsert(collection, args);
      const rows = await buildInsertQuery(db, collection, values);
      return text(rows[0]);
    }
    case "update": {
      const { id, ...rest } = args;
      const values = validateUpdate(collection, rest);
      const rows = await buildUpdateQuery(db, collection, id, values);
      if (!rows[0]) return { ...text({ error: "Not found" }), isError: true };
      return text(rows[0]);
    }
    case "delete": {
      const rows = await buildDeleteQuery(db, collection, args.id);
      if (!rows[0]) return { ...text({ error: "Not found" }), isError: true };
      return text(rows[0]);
    }
    case "action": {
      const action = ctx.actions.find(
        (a) => a.collection === collection.slug && a.name === binding.actionName,
      );
      if (!action) return { ...text({ error: "Unknown action" }), isError: true };
      const ids = Array.isArray(args.ids) ? args.ids : [];
      const result = await action.handler({ db, collection, ids, input: args.input });
      return text(result);
    }
  }
}

function ok(id: JsonRpcResponse["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function fail(
  id: JsonRpcResponse["id"],
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Handle one JSON-RPC message. Returns null for notifications (no id). The
 * tool surface is generated from the collection declarations, so it mirrors
 * the UI/CLI exactly.
 */
export async function handleRpc(
  request: JsonRpcRequest,
  ctx: McpContext,
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;

  switch (request.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "@comp/mcp", version: "0.0.0" },
      });

    case "notifications/initialized":
      return null;

    case "tools/list":
      return ok(id, { tools: listTools(ctx.registry) });

    case "tools/call": {
      const params = (request.params ?? {}) as {
        name?: string;
        arguments?: Record<string, unknown>;
      };
      const binding = params.name ? ctx.registry.get(params.name) : undefined;
      if (!binding) return fail(id, -32602, `Unknown tool: ${params.name}`);
      try {
        return ok(id, await runTool(binding, params.arguments ?? {}, ctx));
      } catch (error) {
        if (error instanceof ValidationError) {
          return ok(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: error.message, issues: error.issues }),
              },
            ],
            isError: true,
          });
        }
        return ok(id, {
          content: [
            { type: "text", text: error instanceof Error ? error.message : String(error) },
          ],
          isError: true,
        });
      }
    }

    default:
      return fail(id, -32601, `Method not found: ${request.method}`);
  }
}
