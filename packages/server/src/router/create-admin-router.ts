import {
  buildCountQuery,
  buildGetByIdQuery,
  buildListQuery,
  type Collection,
  type SqliteDb,
} from "@comp/core";
import { Hono, type Context } from "hono";
import { parseListParams } from "./list-params.js";

export interface AdminRouterConfig {
  collections: Collection[];
  /**
   * Resolve the database for a request. On Workers the D1 binding lives on
   * `c.env`, so the db must be built per request rather than at module load.
   */
  getDb: (c: Context) => SqliteDb;
}

/**
 * Mount Comp's read API for a set of collections. Every operation routes
 * through `@comp/core`'s query layer — the server never builds SQL itself, it
 * only adapts HTTP to the core contract.
 */
export function createAdminRouter(config: AdminRouterConfig): Hono {
  const app = new Hono();
  const bySlug = new Map(config.collections.map((c) => [c.slug, c]));

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

  return app;
}
