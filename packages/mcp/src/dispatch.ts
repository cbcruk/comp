import {
  allowAll,
  authorizeOperation,
  authorizeRecordAccess,
  buildCountQuery,
  buildGetByIdQuery,
  buildListQuery,
  buildRecordsByIdsQuery,
  checksRecords,
  collectDateHierarchy,
  collectFilterChoices,
  collectDeleteImpact,
  createRecord,
  deleteRecord,
  parseDatePath,
  parseFilterValue,
  readInlines,
  readManyToMany,
  resolveScope,
  runAction,
  updateRecord,
  validateInsert,
  validateUpdate,
  ValidationError,
  writeInlines,
  writeManyToMany,
  type ActionDefinition,
  type AuthAdapter,
  type Collection,
  type CollectionOperation,
  type FilterMap,
  type HistoryStore,
  type InlineSpec,
  type InlineWritePayload,
  type ManyToManySpec,
  type ManyToManyWrite,
  type Identity,
  type ListParams,
  type RecordScope,
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
  /** Where writes are logged; omit and nothing is recorded. */
  history?: HistoryStore | undefined;
  /** Who these calls act as, on the history entry. */
  actor?: string | null;
  /**
   * Who is calling and what they may do. The same adapter the HTTP router
   * takes: a tool call and a request are the same operation on the same
   * collection, and a permission that only one of them honors is not one.
   */
  auth?: AuthAdapter | undefined;
  /** The identity resolved once for this request. */
  identity?: Identity | null;
}

/** The operations a tool performs, in the vocabulary permissions are keyed on. */
export function operationsOf(binding: ToolBinding): CollectionOperation[] {
  switch (binding.kind) {
    case "list":
      return ["list"];
    case "get":
    case "history":
      return ["read"];
    case "create":
      return ["create"];
    case "update":
      return ["update"];
    case "delete":
    case "delete_preview":
      return ["delete"];
    case "action":
      return binding.operations ?? [];
  }
}

function adapterOf(ctx: McpContext): AuthAdapter {
  return ctx.auth ?? allowAll;
}

/** May this caller run this tool at all? */
async function permitted(
  ctx: McpContext,
  binding: ToolBinding,
): Promise<boolean> {
  const auth = adapterOf(ctx);
  const identity = ctx.identity ?? null;
  for (const operation of operationsOf(binding)) {
    const allowed = await authorizeOperation(auth, {
      identity,
      collection: binding.collection,
      operation,
    });
    if (!allowed) return false;
  }
  return true;
}

function scopeOf(
  ctx: McpContext,
  collection: Collection,
): Promise<RecordScope | undefined> {
  return resolveScope(adapterOf(ctx), ctx.identity ?? null, collection);
}

/**
 * Read the row a tool call names, refusing the same two ways the HTTP router
 * does: outside the scope is "not found", inside it but off-limits is
 * "forbidden".
 */
async function recordFor(
  ctx: McpContext,
  collection: Collection,
  id: unknown,
  operation: CollectionOperation,
  scope: RecordScope | undefined,
): Promise<{ row: Record<string, unknown> } | { error: ToolResult }> {
  const rows = await buildGetByIdQuery(ctx.db, collection, id, scope).all();
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return { error: { ...text({ error: "Not found" }), isError: true } };

  const allowed = await authorizeRecordAccess(adapterOf(ctx), {
    identity: ctx.identity ?? null,
    collection,
    operation,
    record: row,
  });
  if (!allowed) {
    return { error: { ...text({ error: "Forbidden" }), isError: true } };
  }
  return { row };
}

interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function text(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** The write context: the same db, store, actor and scope for every tool call. */
function mutationContext(
  ctx: McpContext,
  collection: Collection,
  scope?: RecordScope,
): {
  db: SqliteDb;
  collection: Collection;
  history?: HistoryStore | undefined;
  actor: string | null;
  scope?: RecordScope | undefined;
} {
  return {
    db: ctx.db,
    collection,
    history: ctx.history,
    actor: ctx.actor ?? null,
    ...(scope ? { scope } : {}),
  };
}

/** Read a record back with its child rows and links — the HTTP shape. */
async function withNested(
  db: SqliteDb,
  specs: InlineSpec[],
  links: ManyToManySpec[],
  row: Record<string, unknown>,
): Promise<unknown> {
  if (specs.length === 0 && links.length === 0) return row;
  return {
    ...row,
    ...(specs.length > 0 ? { inlines: await readInlines(db, specs, row) } : {}),
    ...(links.length > 0
      ? { manyToMany: await readManyToMany(db, links, row) }
      : {}),
  };
}

/** Apply the tool call's link sets, if it sent any. */
async function applyLinks(
  db: SqliteDb,
  links: ManyToManySpec[],
  row: Record<string, unknown>,
  payload: unknown,
): Promise<void> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  await writeManyToMany(db, links, row, payload as ManyToManyWrite);
}

/** Apply the tool call's inline changes, if it made any. */
async function applyInlines(
  db: SqliteDb,
  specs: InlineSpec[],
  row: Record<string, unknown>,
  payload: unknown,
): Promise<void> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  await writeInlines(db, specs, row, payload as InlineWritePayload);
}

function parseOrdering(sort: unknown): ListParams["ordering"] {
  if (typeof sort !== "string" || sort === "") return undefined;
  const [field, direction] = sort.split(":");
  if (!field) return undefined;
  return [{ field, direction: direction === "desc" ? "desc" : "asc" }];
}

/**
 * Read the tool call's filters with the same encoding the query string uses —
 * `in:`, `isnull:`, `range:`, `preset:` — so a model and the admin UI narrow a
 * list identically instead of each transport inventing its own dialect.
 */
function parseFilters(raw: unknown): FilterMap | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

  const filters: FilterMap = {};
  for (const [field, entry] of Object.entries(raw as Record<string, unknown>)) {
    const value =
      typeof entry === "string"
        ? parseFilterValue(entry)
        : { op: "exact" as const, value: entry };
    if (value) filters[field] = value;
  }
  return Object.keys(filters).length > 0 ? filters : undefined;
}

function listParams(args: Record<string, unknown>): ListParams {
  return {
    // One instant per call, shared by the rows and their total.
    now: new Date(),
    ...(typeof args.date === "string"
      ? { datePath: parseDatePath(args.date) }
      : {}),
    page: typeof args.page === "number" ? args.page : undefined,
    pageSize: typeof args.pageSize === "number" ? args.pageSize : undefined,
    search: typeof args.q === "string" ? args.q : undefined,
    filters: parseFilters(args.filters),
    ordering: parseOrdering(args.sort),
  };
}

/** The ids an action may act on, after the scope and the per-record rule. */
async function visibleIds(
  ctx: McpContext,
  collection: Collection,
  operations: readonly CollectionOperation[],
  requested: unknown[],
): Promise<unknown[]> {
  const auth = adapterOf(ctx);
  if (requested.length === 0 || !checksRecords(auth)) return requested;

  const rows = (await buildRecordsByIdsQuery(
    ctx.db,
    collection,
    requested,
    await scopeOf(ctx, collection),
  ).all()) as Record<string, unknown>[];

  const key = collection.primaryKey;
  if (!key) return [];

  const allowed: unknown[] = [];
  for (const row of rows) {
    const permits = await Promise.all(
      operations.map((operation) =>
        authorizeRecordAccess(auth, {
          identity: ctx.identity ?? null,
          collection,
          operation,
          record: row,
        }),
      ),
    );
    if (permits.every(Boolean)) allowed.push(row[key]);
  }
  return allowed;
}

async function runTool(
  binding: ToolBinding,
  args: Record<string, unknown>,
  ctx: McpContext,
): Promise<ToolResult> {
  const collection: Collection = binding.collection;
  const db = ctx.db;

  // The tool surface is already narrowed to what this caller may run, but a
  // name can be called directly — so the permission is checked here, where the
  // work happens, not only where the list is built.
  if (!(await permitted(ctx, binding))) {
    return { ...text({ error: "Forbidden" }), isError: true };
  }
  const scope = await scopeOf(ctx, collection);

  switch (binding.kind) {
    case "list": {
      const params = { ...listParams(args), ...(scope ? { scope } : {}) };
      const rows = await buildListQuery(db, collection, params).all();
      const totals = await buildCountQuery(db, collection, params).all();
      return text({
        data: rows,
        total: totals[0]?.count ?? 0,
        hierarchy: await collectDateHierarchy(db, collection, params),
        // The vocabulary of any distinct-value filter, so a model narrows the
        // list with a value that exists instead of guessing one.
        choices: await collectFilterChoices(db, collection, scope),
      });
    }
    case "get": {
      const found = await recordFor(ctx, collection, args.id, "read", scope);
      if ("error" in found) return found.error;
      return text(
        await withNested(db, binding.inlines, binding.links ?? [], found.row),
      );
    }
    case "create": {
      const { inlines, manyToMany, ...rest } = args;
      // Nothing to narrow to and nothing to decide about: a row that does not
      // exist yet is governed by the collection's `create` grant alone.
      const values = validateInsert(collection, rest);
      const row = await createRecord(mutationContext(ctx, collection), values);
      if (!row) return { ...text({ error: "Insert returned no row" }), isError: true };
      await applyInlines(db, binding.inlines, row, inlines);
      await applyLinks(db, binding.links ?? [], row, manyToMany);
      return text(await withNested(db, binding.inlines, binding.links ?? [], row));
    }
    case "update": {
      const { id, inlines, manyToMany, ...rest } = args;
      let before: Record<string, unknown> | undefined;
      if (checksRecords(adapterOf(ctx))) {
        const found = await recordFor(ctx, collection, id, "update", scope);
        if ("error" in found) return found.error;
        before = found.row;
      }

      const values = validateUpdate(collection, rest);
      // Editing only the child rows is a real edit; don't force an empty
      // UPDATE on the parent just to reach them.
      const row =
        Object.keys(values).length > 0
          ? await updateRecord(
              {
                ...mutationContext(ctx, collection, scope),
                ...(before ? { before } : {}),
              },
              id,
              values,
            )
          : (before ??
            ((await buildGetByIdQuery(db, collection, id, scope).all())[0] as
              | Record<string, unknown>
              | undefined));
      if (!row) return { ...text({ error: "Not found" }), isError: true };
      await applyInlines(db, binding.inlines, row, inlines);
      await applyLinks(db, binding.links ?? [], row, manyToMany);
      return text(await withNested(db, binding.inlines, binding.links ?? [], row));
    }
    case "delete_preview": {
      const found = await recordFor(ctx, collection, args.id, "delete", scope);
      if ("error" in found) return found.error;
      return text(
        await collectDeleteImpact(
          db,
          collection,
          found.row,
          binding.deleteRelations ?? [],
        ),
      );
    }
    case "delete": {
      if (checksRecords(adapterOf(ctx))) {
        const found = await recordFor(ctx, collection, args.id, "delete", scope);
        if ("error" in found) return found.error;
      }
      const row = await deleteRecord(
        mutationContext(ctx, collection, scope),
        args.id,
      );
      if (!row) return { ...text({ error: "Not found" }), isError: true };
      return text(row);
    }
    case "history": {
      if (!ctx.history) {
        return { ...text({ error: "History is not enabled" }), isError: true };
      }
      // The entries describe a record, so reaching them means being able to
      // reach the record.
      if (checksRecords(adapterOf(ctx))) {
        const found = await recordFor(ctx, collection, args.id, "read", scope);
        if ("error" in found) return found.error;
      }
      return text(
        await ctx.history.list({
          collection: collection.slug,
          recordId: String(args.id),
          ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
        }),
      );
    }
    case "action": {
      const action = ctx.actions.find(
        (a) => a.collection === collection.slug && a.name === binding.actionName,
      );
      if (!action) return { ...text({ error: "Unknown action" }), isError: true };
      const requested = Array.isArray(args.ids) ? args.ids : [];
      // Ids are not permissions: an action only ever receives the rows this
      // caller can see and may act on.
      const ids = await visibleIds(ctx, collection, action.operations, requested);
      const result = await runAction(action, { db, collection, ids, input: args.input });
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

    case "tools/list": {
      // Narrowed by permission, like the site index is: advertising a tool
      // that would answer "Forbidden" is worse than not listing it.
      const bindings = [...ctx.registry.values()];
      const visible = await Promise.all(
        bindings.map(async (binding) =>
          (await permitted(ctx, binding)) ? binding : null,
        ),
      );
      return ok(id, {
        tools: listTools(
          new Map(
            visible
              .filter((binding): binding is ToolBinding => binding !== null)
              .map((binding) => [binding.tool.name, binding]),
          ),
        ),
      });
    }

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
