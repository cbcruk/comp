import {
  buildCountQuery,
  buildDeleteQuery,
  buildGetByIdQuery,
  buildInsertQuery,
  buildListQuery,
  buildUpdateQuery,
  allowAll,
  collectDeleteImpact,
  filterSummaries,
  InlineError,
  inlineOperations,
  inlineSummary,
  readInlines,
  resolveDeleteRelations,
  resolveInlines,
  resolveRelations,
  runAction,
  validateInsert,
  validateUpdate,
  ValidationError,
  writeInlines,
  type ActionDefinition,
  type AuthAdapter,
  type Collection,
  type CollectionOperation,
  type DeleteRelation,
  type InlineSpec,
  type InlineWritePayload,
  type SqliteDb,
} from "@comp/core";
import { Hono, type Context } from "hono";
import { splitInlineBody } from "./inline-body.js";
import { parseListParams } from "./list-params.js";

export interface AdminRouterConfig {
  collections: Collection[];
  /** Bulk/custom actions, scoped to a collection by their `collection` slug. */
  actions?: ActionDefinition[];
  /** Auth adapter; defaults to allow-all. */
  auth?: AuthAdapter;
  /**
   * Resolve the database for a request. On Workers the D1 binding lives on
   * `c.env`, so the db must be built per request rather than at module load.
   */
  getDb: (c: Context) => SqliteDb;
}

function allows(collection: Collection, op: CollectionOperation): boolean {
  return collection.manifest.operations.includes(op);
}

/** An action may only touch operations its target collection grants. */
function withinCapabilities(
  action: ActionDefinition,
  collection: Collection,
): boolean {
  return action.operations.every((op) => allows(collection, op));
}

/**
 * Map a write failure to a response. Validation issues carry the row and field
 * they came from (`inlines.<slug>.<index>.<field>`), so they reach the form
 * unchanged; an inline asking for an ungranted operation is a 405 like any
 * other disallowed write.
 */
function inlineAwareError(c: Context, error: unknown): Response {
  if (error instanceof ValidationError) {
    return c.json({ error: error.message, issues: error.issues }, 400);
  }
  if (error instanceof InlineError) {
    return c.json({ error: error.message }, 405);
  }
  throw error;
}

async function parseJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/**
 * Mount Comp's read + write API for a set of collections. Every operation
 * routes through `@comp/core`'s query/validation layer — the server never
 * builds SQL or validates itself, it only adapts HTTP to the core contract.
 * Writes are gated on the collection manifest's declared operations.
 */
export function createAdminRouter(config: AdminRouterConfig): Hono {
  const app = new Hono();
  const auth = config.auth ?? allowAll;
  const bySlug = new Map(config.collections.map((c) => [c.slug, c]));
  // The relation graph is a property of the whole registry, so it is resolved
  // once here rather than per request — and served to clients so the UI never
  // has to be told which collection an FK points at. Inlines bind to that same
  // graph, and a bad declaration throws here, at startup, not on a request.
  const relations = resolveRelations(config.collections);
  const inlines = resolveInlines(config.collections);
  const deleteRelations = resolveDeleteRelations(config.collections);
  const actionsBySlug = new Map<string, ActionDefinition[]>();
  for (const action of config.actions ?? []) {
    const list = actionsBySlug.get(action.collection) ?? [];
    list.push(action);
    actionsBySlug.set(action.collection, list);
  }

  async function authorized(
    c: Context,
    collection: Collection,
    operation: CollectionOperation,
  ): Promise<boolean> {
    const identity = await auth.authenticate(c.req.raw);
    return Boolean(await auth.authorize({ identity, collection, operation }));
  }

  function specsFor(collection: Collection): InlineSpec[] {
    return inlines.get(collection.slug) ?? [];
  }

  /**
   * A parent's child rows, with each inline gated on the child's own manifest
   * and permissions — an inline is a view onto another collection, so it never
   * grants more than reading that collection directly would.
   */
  async function inlineRows(
    c: Context,
    collection: Collection,
    row: Record<string, unknown>,
    db: SqliteDb,
  ): Promise<Record<string, Record<string, unknown>[]> | undefined> {
    const specs = specsFor(collection);
    if (specs.length === 0) return undefined;
    return readInlines(db, specs, row, async (spec) => {
      if (!allows(spec.collection, "list")) return false;
      return authorized(c, spec.collection, "list");
    });
  }

  /**
   * Check an inline write before anything runs: the child must be an inline of
   * this parent, expose each operation the write needs, and permit it for this
   * caller. Returns the refusal to send, or null to proceed.
   */
  async function refuseInlineWrite(
    c: Context,
    collection: Collection,
    payload: InlineWritePayload,
  ): Promise<Response | null> {
    const bySlug = new Map(
      specsFor(collection).map((spec) => [spec.collection.slug, spec]),
    );
    for (const [slug, write] of Object.entries(payload)) {
      const spec = bySlug.get(slug);
      if (!spec) {
        return c.json({ error: `"${slug}" is not an inline of this collection` }, 400);
      }
      for (const operation of inlineOperations(write)) {
        if (!allows(spec.collection, operation)) {
          return c.json({ error: `${operation} not allowed on "${slug}"` }, 405);
        }
        if (!(await authorized(c, spec.collection, operation))) {
          return c.json({ error: "Forbidden" }, 403);
        }
      }
    }
    return null;
  }

  /** The operations this caller may actually perform on a collection. */
  async function permittedOperations(
    c: Context,
    collection: Collection,
  ): Promise<CollectionOperation[]> {
    const permitted: CollectionOperation[] = [];
    for (const operation of collection.manifest.operations) {
      if (await authorized(c, collection, operation)) permitted.push(operation);
    }
    return permitted;
  }

  /**
   * The site index. A collection this caller cannot list is left out entirely
   * rather than listed and then refused — an index that advertises screens you
   * are not allowed to open is worse than no index.
   */
  app.get("/collections", async (c) => {
    const summaries = [];
    for (const collection of config.collections) {
      const permitted = await permittedOperations(c, collection);
      if (!permitted.includes("list")) continue;
      summaries.push({
        slug: collection.slug,
        label: collection.label,
        labelPlural: collection.labelPlural,
        // What this caller may do: the manifest narrowed by permission.
        permitted,
        listDisplay: collection.listDisplay,
        filters: filterSummaries(
          collection.filters,
          relations.outbound[collection.slug] ?? [],
        ),
        search: collection.search,
        fields: collection.fields,
        primaryKey: collection.primaryKey,
        labelField: collection.labelField,
        relations: relations.outbound[collection.slug] ?? [],
        inbound: relations.inbound[collection.slug] ?? [],
        inlines: (inlines.get(collection.slug) ?? []).map(inlineSummary),
        manifest: collection.manifest,
        actions: (actionsBySlug.get(collection.slug) ?? []).map(
          (action) => action.manifest,
        ),
      });
    }
    return c.json(summaries);
  });

  app.get("/collections/:slug/:id/delete-preview", async (c) => {
    const collection = bySlug.get(c.req.param("slug"));
    if (!collection) return c.json({ error: "Unknown collection" }, 404);
    if (!allows(collection, "delete")) {
      return c.json({ error: "Delete not allowed" }, 405);
    }
    if (!(await authorized(c, collection, "delete"))) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const db = config.getDb(c);
    const rows = await buildGetByIdQuery(db, collection, c.req.param("id")).all();
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: "Not found" }, 404);

    const relations: DeleteRelation[] = deleteRelations.get(collection.slug) ?? [];
    return c.json({
      data: await collectDeleteImpact(db, collection, row, relations),
    });
  });

  app.get("/collections/:slug", async (c) => {
    const collection = bySlug.get(c.req.param("slug"));
    if (!collection) return c.json({ error: "Unknown collection" }, 404);
    if (!(await authorized(c, collection, "list"))) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const db = config.getDb(c);
    const params = parseListParams(collection, c.req.query());
    const rows = await buildListQuery(db, collection, params).all();
    const totals = await buildCountQuery(db, collection, params).all();
    const total = totals[0]?.count ?? 0;

    return c.json({
      data: rows,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? collection.pageSize,
      total,
    });
  });

  app.get("/collections/:slug/:id", async (c) => {
    const collection = bySlug.get(c.req.param("slug"));
    if (!collection) return c.json({ error: "Unknown collection" }, 404);
    if (!(await authorized(c, collection, "read"))) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const db = config.getDb(c);
    const rows = await buildGetByIdQuery(
      db,
      collection,
      c.req.param("id"),
    ).all();
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: "Not found" }, 404);

    return c.json({ data: row, inlines: await inlineRows(c, collection, row, db) });
  });

  app.post("/collections/:slug", async (c) => {
    const collection = bySlug.get(c.req.param("slug"));
    if (!collection) return c.json({ error: "Unknown collection" }, 404);
    if (!allows(collection, "create")) {
      return c.json({ error: "Create not allowed" }, 405);
    }
    if (!(await authorized(c, collection, "create"))) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const body = splitInlineBody(await parseJsonBody(c));
    const refusal = await refuseInlineWrite(c, collection, body.inlines);
    if (refusal) return refusal;

    const db = config.getDb(c);
    try {
      const values = validateInsert(collection, body.values);
      const rows = await buildInsertQuery(db, collection, values);
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return c.json({ error: "Insert returned no row" }, 500);

      await writeInlines(db, specsFor(collection), row, body.inlines);
      return c.json(
        { data: row, inlines: await inlineRows(c, collection, row, db) },
        201,
      );
    } catch (error) {
      return inlineAwareError(c, error);
    }
  });

  app.patch("/collections/:slug/:id", async (c) => {
    const collection = bySlug.get(c.req.param("slug"));
    if (!collection) return c.json({ error: "Unknown collection" }, 404);
    if (!allows(collection, "update")) {
      return c.json({ error: "Update not allowed" }, 405);
    }
    if (!(await authorized(c, collection, "update"))) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const body = splitInlineBody(await parseJsonBody(c));
    const refusal = await refuseInlineWrite(c, collection, body.inlines);
    if (refusal) return refusal;

    const db = config.getDb(c);
    try {
      const values = validateUpdate(collection, body.values);
      // Editing only the child rows is a real edit; don't force an empty
      // UPDATE on the parent just to get at its inlines.
      const rows =
        Object.keys(values).length > 0
          ? await buildUpdateQuery(db, collection, c.req.param("id"), values)
          : await buildGetByIdQuery(db, collection, c.req.param("id")).all();
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return c.json({ error: "Not found" }, 404);

      await writeInlines(db, specsFor(collection), row, body.inlines);
      return c.json({
        data: row,
        inlines: await inlineRows(c, collection, row, db),
      });
    } catch (error) {
      return inlineAwareError(c, error);
    }
  });

  app.delete("/collections/:slug/:id", async (c) => {
    const collection = bySlug.get(c.req.param("slug"));
    if (!collection) return c.json({ error: "Unknown collection" }, 404);
    if (!allows(collection, "delete")) {
      return c.json({ error: "Delete not allowed" }, 405);
    }
    if (!(await authorized(c, collection, "delete"))) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const rows = await buildDeleteQuery(
      config.getDb(c),
      collection,
      c.req.param("id"),
    );
    if (!rows[0]) return c.json({ error: "Not found" }, 404);
    return c.json({ data: rows[0] });
  });

  app.post("/collections/:slug/actions/:name", async (c) => {
    const collection = bySlug.get(c.req.param("slug"));
    if (!collection) return c.json({ error: "Unknown collection" }, 404);

    const action = (actionsBySlug.get(collection.slug) ?? []).find(
      (a) => a.name === c.req.param("name"),
    );
    if (!action) return c.json({ error: "Unknown action" }, 404);
    if (!withinCapabilities(action, collection)) {
      return c.json(
        { error: "Action exceeds the collection's capabilities" },
        403,
      );
    }
    for (const operation of action.operations) {
      if (!(await authorized(c, collection, operation))) {
        return c.json({ error: "Forbidden" }, 403);
      }
    }

    const body = (await parseJsonBody(c)) as
      | { ids?: unknown[]; input?: unknown }
      | undefined;
    const ids = Array.isArray(body?.ids) ? body.ids : [];

    const result = await runAction(action, {
      db: config.getDb(c),
      collection,
      ids,
      input: body?.input,
    });
    return c.json(result);
  });

  return app;
}
