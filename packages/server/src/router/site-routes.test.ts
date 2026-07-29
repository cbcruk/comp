import {
  defineCollection,
  type AuthAdapter,
  type SqliteDb,
} from "@comp/core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
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

const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull(),
  // No stated action: SQL's default refuses the delete.
  customerId: integer("customer_id").references(() => customers.id),
});

const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  product: text("product").notNull(),
});

const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").references(() => orders.id, {
    onDelete: "set null",
  }),
  body: text("body").notNull(),
});

const orderCollection = defineCollection({
  model: orders,
  listDisplay: ["reference"],
  inlines: ["order_items"],
});
const itemCollection = defineCollection({ model: orderItems, listDisplay: ["product"] });
const noteCollection = defineCollection({ model: notes, listDisplay: ["body"] });
const customerCollection = defineCollection({ model: customers, listDisplay: ["name"] });

const COLLECTIONS = [
  orderCollection,
  itemCollection,
  noteCollection,
  customerCollection,
];

function freshDb(): SqliteDb {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    `CREATE TABLE customers (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL)`,
  );
  sqlite.exec(
    `CREATE TABLE orders (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       reference text NOT NULL,
       customer_id integer REFERENCES customers(id)
     )`,
  );
  sqlite.exec(
    `CREATE TABLE order_items (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       order_id integer NOT NULL REFERENCES orders(id) ON DELETE cascade,
       product text NOT NULL
     )`,
  );
  sqlite.exec(
    `CREATE TABLE notes (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       order_id integer REFERENCES orders(id) ON DELETE SET NULL,
       body text NOT NULL
     )`,
  );

  sqlite.prepare(`INSERT INTO customers (name) VALUES ('Ada')`).run();
  sqlite.prepare(`INSERT INTO orders (reference, customer_id) VALUES ('A-1', 1)`).run();
  for (const product of ["Cup", "Plate", "Bowl"]) {
    sqlite
      .prepare(`INSERT INTO order_items (order_id, product) VALUES (1, ?)`)
      .run(product as never);
  }
  sqlite.prepare(`INSERT INTO notes (order_id, body) VALUES (1, 'call back')`).run();
  // A second order that nothing points at.
  sqlite.prepare(`INSERT INTO orders (reference) VALUES ('A-2')`).run();

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

function app(auth?: AuthAdapter): ReturnType<typeof createAdminRouter> {
  const db = freshDb();
  return createAdminRouter({
    collections: COLLECTIONS,
    getDb: () => db,
    ...(auth ? { auth } : {}),
  });
}

interface Summary {
  slug: string;
  label: string;
  labelPlural: string;
  permitted: string[];
}

interface Impact {
  related: { collection: string; count: number; effect: string }[];
  cascades: number;
  blocked: boolean;
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("site index", () => {
  it("names every collection so a screen can be titled", async () => {
    const summaries = await json<Summary[]>(await app().request("/collections"));
    expect(
      summaries.map((s) => [s.slug, s.label, s.labelPlural]),
    ).toEqual([
      ["orders", "Order", "Orders"],
      ["order_items", "Order item", "Order items"],
      ["notes", "Note", "Notes"],
      ["customers", "Customer", "Customers"],
    ]);
  });

  it("reports what this caller may do, not just what exists", async () => {
    const summaries = await json<Summary[]>(await app().request("/collections"));
    expect(summaries[0]?.permitted).toEqual([
      "list",
      "read",
      "create",
      "update",
      "delete",
    ]);
  });

  it("leaves out a collection the caller cannot list", async () => {
    const readOnly: AuthAdapter = {
      authenticate: () => null,
      authorize: ({ collection, operation }) =>
        collection.slug !== "customers" && operation !== "delete",
    };
    const summaries = await json<Summary[]>(await app(readOnly).request("/collections"));
    expect(summaries.map((s) => s.slug)).toEqual(["orders", "order_items", "notes"]);
    expect(summaries[0]?.permitted).not.toContain("delete");
  });
});

describe("delete preview", () => {
  async function preview(id: number): Promise<Impact> {
    const body = await json<{ data: Impact }>(
      await app().request(`/collections/orders/${id}/delete-preview`),
    );
    return body.data;
  }

  it("counts what the delete reaches and how each key reacts", async () => {
    const impact = await preview(1);
    expect(impact.related).toEqual([
      { collection: "order_items", field: "orderId", count: 3, effect: "cascade" },
      { collection: "notes", field: "orderId", count: 1, effect: "clear" },
    ]);
    expect(impact.cascades).toBe(3);
    expect(impact.blocked).toBe(false);
  });

  it("says nothing points at a record when nothing does", async () => {
    const impact = await preview(2);
    expect(impact.related).toEqual([]);
    expect(impact.cascades).toBe(0);
    expect(impact.blocked).toBe(false);
  });

  it("reports a key with no stated action as blocking", async () => {
    const { data: impact } = await json<{ data: Impact }>(
      await app().request("/collections/customers/1/delete-preview"),
    );
    expect(impact.related).toEqual([
      { collection: "orders", field: "customerId", count: 1, effect: "block" },
    ]);
    expect(impact.blocked).toBe(true);
  });

  it("404s for a record that is not there", async () => {
    expect((await app().request("/collections/orders/99/delete-preview")).status).toBe(
      404,
    );
  });

  it("needs the same permission the delete itself needs", async () => {
    const noDelete: AuthAdapter = {
      authenticate: () => null,
      authorize: ({ operation }) => operation !== "delete",
    };
    expect(
      (await app(noDelete).request("/collections/orders/1/delete-preview")).status,
    ).toBe(403);
  });

  it("405s when the collection never exposed delete", async () => {
    const db = freshDb();
    const guarded = createAdminRouter({
      collections: [
        defineCollection({
          model: orders,
          listDisplay: ["reference"],
          operations: ["list", "read"],
        }),
      ],
      getDb: () => db,
    });
    expect((await guarded.request("/collections/orders/1/delete-preview")).status).toBe(
      405,
    );
  });
});
