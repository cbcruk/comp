import { defineCollection, type SqliteDb } from "@comp/core";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";
import { createAdminRouter } from "./create-admin-router.js";

/**
 * `node:sqlite` predates Vite's builtin list, so a static import fails to
 * resolve under vitest; require it at runtime instead.
 */
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: never[]): unknown;
      all(...params: never[]): Record<string, unknown>[];
    };
  };
};

/**
 * The nested write is the one place where the query layer, validation, and the
 * manifest all meet on a single request, so it is exercised against a real
 * SQLite database rather than only through generated SQL.
 */
const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull(),
  status: text("status", { enum: ["draft", "paid"] }).notNull().default("draft"),
});

const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  product: text("product").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull().default(0),
});

const SCHEMA = [
  `CREATE TABLE orders (
     id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
     reference text NOT NULL,
     status text DEFAULT 'draft' NOT NULL
   )`,
  `CREATE TABLE order_items (
     id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
     order_id integer NOT NULL REFERENCES orders(id),
     product text NOT NULL,
     quantity integer DEFAULT 1 NOT NULL,
     unit_price real DEFAULT 0 NOT NULL
   )`,
];

const itemCollection = defineCollection({
  model: orderItems,
  listDisplay: ["product", "quantity", "unitPrice"],
  ordering: [{ field: "id", direction: "asc" }],
});

const orderCollection = defineCollection({
  model: orders,
  listDisplay: ["reference", "status"],
  inlines: ["order_items"],
});

function freshDb(): SqliteDb {
  const sqlite = new DatabaseSync(":memory:");
  for (const statement of SCHEMA) sqlite.exec(statement);
  return drizzle(async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    if (method === "run") {
      statement.run(...(params as never[]));
      return { rows: [] };
    }
    const rows = statement
      .all(...(params as never[]))
      .map((row) => Object.values(row));
    return { rows: method === "get" ? (rows[0] ?? []) : rows };
  }) as unknown as SqliteDb;
}

describe("inline routes", () => {
  let app: ReturnType<typeof createAdminRouter>;

  beforeEach(() => {
    const db = freshDb();
    app = createAdminRouter({
      collections: [orderCollection, itemCollection],
      getDb: () => db,
    });
  });

  type Json = Record<string, unknown>;
  interface RecordResponse extends Json {
    data: Json;
    inlines: Record<string, Json[]>;
    issues?: { path: (string | number)[] }[];
  }

  async function call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: RecordResponse }> {
    const response = await app.request(path, {
      method,
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          }),
    });
    return {
      status: response.status,
      body: (await response.json()) as RecordResponse,
    };
  }

  const items = (body: RecordResponse): Json[] => body.inlines.order_items ?? [];

  async function seedOrder(reference = "A-1"): Promise<RecordResponse> {
    const { body } = await call("POST", "/collections/orders", {
      reference,
      inlines: {
        order_items: {
          create: [
            { product: "Cup", quantity: 2, unitPrice: 3.5 },
            { product: "Plate", quantity: 1, unitPrice: 9 },
          ],
        },
      },
    });
    return body;
  }

  it("advertises the resolved inline on the collection", async () => {
    const { body } = await call("GET", "/collections");
    const summary = (body as unknown as Json[]).find((c) => c.slug === "orders");
    expect(summary?.inlines).toEqual([
      {
        collection: "order_items",
        field: "orderId",
        targetField: "id",
        canDelete: true,
      },
    ]);
  });

  it("creates a record and its child rows in one request", async () => {
    const created = await seedOrder();
    expect(items(created)).toHaveLength(2);
    // The parent key is filled in from the record just created.
    expect(items(created).every((i) => i.orderId === created.data.id)).toBe(true);
  });

  it("returns the child rows when reading the record back", async () => {
    const created = await seedOrder();
    const { body } = await call("GET", `/collections/orders/${created.data.id}`);
    expect(items(body).map((i) => i.product)).toEqual(["Cup", "Plate"]);
  });

  it("applies an update, a delete and a create in one save", async () => {
    const created = await seedOrder();
    const [first, second] = items(created);

    const { body } = await call("PATCH", `/collections/orders/${created.data.id}`, {
      status: "paid",
      inlines: {
        order_items: {
          update: [{ id: first.id, values: { quantity: 10 } }],
          delete: [second.id],
          create: [{ product: "Bowl", quantity: 4 }],
        },
      },
    });

    expect(body.data.status).toBe("paid");
    expect(items(body).map((i) => `${i.product}x${i.quantity}`)).toEqual([
      "Cupx10",
      "Bowlx4",
    ]);
  });

  it("edits only the child rows when the record itself is unchanged", async () => {
    const created = await seedOrder();
    const { status, body } = await call(
      "PATCH",
      `/collections/orders/${created.data.id}`,
      { inlines: { order_items: { create: [{ product: "Spoon" }] } } },
    );
    expect(status).toBe(200);
    expect(items(body)).toHaveLength(3);
  });

  it("cannot reach a row belonging to another record", async () => {
    const mine = await seedOrder("A-1");
    const theirs = await seedOrder("B-2");
    const victim = items(theirs)[0];

    await call("PATCH", `/collections/orders/${mine.data.id}`, {
      inlines: {
        order_items: {
          update: [{ id: victim.id, values: { product: "Hijacked" } }],
          delete: [items(theirs)[1].id],
        },
      },
    });

    const { body } = await call("GET", `/collections/orders/${theirs.data.id}`);
    expect(items(body).map((i) => i.product)).toEqual(["Cup", "Plate"]);
  });

  it("ignores an attempt to re-parent a row", async () => {
    const mine = await seedOrder("A-1");
    const theirs = await seedOrder("B-2");

    await call("PATCH", `/collections/orders/${mine.data.id}`, {
      inlines: {
        order_items: {
          update: [
            { id: items(mine)[0].id, values: { orderId: theirs.data.id } },
          ],
        },
      },
    });

    const { body } = await call("GET", `/collections/orders/${mine.data.id}`);
    expect(items(body)).toHaveLength(2);
  });

  it("reports a bad row by its index and field", async () => {
    const created = await seedOrder();
    const { status, body } = await call(
      "PATCH",
      `/collections/orders/${created.data.id}`,
      {
        inlines: {
          order_items: {
            create: [{ product: "fine" }, { product: 42 }],
          },
        },
      },
    );

    expect(status).toBe(400);
    expect(body.issues[0].path).toEqual(["inlines", "order_items", 1, "product"]);
    // Nothing was written: the whole save is rejected before it runs.
    const { body: after } = await call(
      "GET",
      `/collections/orders/${created.data.id}`,
    );
    expect(items(after)).toHaveLength(2);
  });

  it("refuses a collection that is not an inline of this record", async () => {
    const created = await seedOrder();
    const { status } = await call("PATCH", `/collections/orders/${created.data.id}`, {
      inlines: { orders: { create: [{ reference: "X" }] } },
    });
    expect(status).toBe(400);
  });

  it("refuses an operation the child collection does not expose", async () => {
    const readOnlyItems = defineCollection({
      model: orderItems,
      slug: "order_items",
      listDisplay: ["product"],
      operations: ["list", "read"],
    });
    const db = freshDb();
    const guarded = createAdminRouter({
      collections: [orderCollection, readOnlyItems],
      getDb: () => db,
    });
    const response = await guarded.request("/collections/orders", {
      method: "POST",
      body: JSON.stringify({
        reference: "A-1",
        inlines: { order_items: { create: [{ product: "Cup" }] } },
      }),
      headers: { "content-type": "application/json" },
    });
    expect(response.status).toBe(405);
  });
});
