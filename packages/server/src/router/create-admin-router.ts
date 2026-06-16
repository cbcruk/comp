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
  type CollectionOperation,
  type SqliteDb,
} from "@comp/core";
import { Hono, type Context } from "hono";
import { parseListParams } from "./list-params.js";

export interface AdminRouterConfig {
  collections: Collection[];
  /** Bulk/custom actions, scoped to a collection by their `collection` slug. */
  actions?: ActionDefinition[];
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
  const bySlug = new Map(config.collections.map((c) => [c.slug, c]));
  const actionsBySlug = new Map<string, ActionDefinition[]>();
  for (const action of config.actions ?? []) {
    const list = actionsBySlug.get(action.collection) ?? [];
    list.push(action);
    actionsBySlug.set(action.collection, list);
  }

  app.get("/collections", (c) =>
    c.json(
      config.collections.map((collection) => ({
        slug: collection.slug,
        listDisplay: collection.listDisplay,
        filters: collection.filters,
        search: collection.search,
        fields: collection.fields,
        primaryKey: collection.primaryKey,
        manifest: collection.manifest,
        actions: (actionsBySlug.get(collection.slug) ?? []).map(
          (action) => action.manifest,
        ),
      })),
    ),
  );

  app.get("/collections/:slug", async (c) => {
    const collection = bySlug.get(c.req.param("slug"));
    if (!collection) return c.json({ error: "Unknown collection" }, 404);

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

    const db = config.getDb(c);
    const rows = await buildGetByIdQuery(
      db,
      collection,
      c.req.param("id"),
    ).all();
    const row = rows[0];
    if (!row) return c.json({ error: "Not found" }, 404);

    return c.json({ data: row });
  });

  app.post("/collections/:slug", async (c) => {
    const collection = bySlug.get(c.req.param("slug"));
    if (!collection) return c.json({ error: "Unknown collection" }, 404);
    if (!allows(collection, "create")) {
      return c.json({ error: "Create not allowed" }, 405);
    }

    try {
      const values = validateInsert(collection, await parseJsonBody(c));
      const rows = await buildInsertQuery(config.getDb(c), collection, values);
      return c.json({ data: rows[0] }, 201);
    } catch (error) {
      if (error instanceof ValidationError) {
        return c.json({ error: error.message, issues: error.issues }, 400);
      }
      throw error;
    }
  });

  app.patch("/collections/:slug/:id", async (c) => {
    const collection = bySlug.get(c.req.param("slug"));
    if (!collection) return c.json({ error: "Unknown collection" }, 404);
    if (!allows(collection, "update")) {
      return c.json({ error: "Update not allowed" }, 405);
    }

    try {
      const values = validateUpdate(collection, await parseJsonBody(c));
      const rows = await buildUpdateQuery(
        config.getDb(c),
        collection,
        c.req.param("id"),
        values,
      );
      if (!rows[0]) return c.json({ error: "Not found" }, 404);
      return c.json({ data: rows[0] });
    } catch (error) {
      if (error instanceof ValidationError) {
        return c.json({ error: error.message, issues: error.issues }, 400);
      }
      throw error;
    }
  });

  app.delete("/collections/:slug/:id", async (c) => {
    const collection = bySlug.get(c.req.param("slug"));
    if (!collection) return c.json({ error: "Unknown collection" }, 404);
    if (!allows(collection, "delete")) {
      return c.json({ error: "Delete not allowed" }, 405);
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

    const body = (await parseJsonBody(c)) as
      | { ids?: unknown[]; input?: unknown }
      | undefined;
    const ids = Array.isArray(body?.ids) ? body.ids : [];

    const result = await action.handler({
      db: config.getDb(c),
      collection,
      ids,
      input: body?.input,
    });
    return c.json(result);
  });

  return app;
}
