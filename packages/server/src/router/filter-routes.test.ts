import { defineCollection, type SqliteDb } from "@comp/core";
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
  status: text("status", { enum: ["draft", "paid", "shipped"] })
    .notNull()
    .default("draft"),
  customerId: integer("customer_id").references(() => customers.id),
  placedAt: integer("placed_at", { mode: "timestamp" }).notNull(),
});

const orderCollection = defineCollection({
  model: orders,
  listDisplay: ["reference", "status", "customerId", "placedAt"],
  filters: ["status", "customerId", "placedAt"],
  ordering: [{ field: "id", direction: "asc" }],
});

const customerCollection = defineCollection({
  model: customers,
  listDisplay: ["name"],
});

/** Epoch seconds, the way Drizzle stores a timestamp column. */
function at(iso: string): number {
  return new Date(iso).getTime() / 1000;
}

// "Now" for these rows is 2026-07-16; the fixtures straddle every window.
const ROWS: [string, string, number | null, number][] = [
  ["A-1", "draft", 1, at("2026-07-16T09:00:00Z")], // today
  ["A-2", "paid", 1, at("2026-07-12T09:00:00Z")], // this week
  ["A-3", "paid", 2, at("2026-07-02T09:00:00Z")], // this month
  ["A-4", "shipped", null, at("2026-02-02T09:00:00Z")], // this year, no customer
  ["A-5", "draft", null, at("2025-11-02T09:00:00Z")], // last year, no customer
];

function freshApp(): ReturnType<typeof createAdminRouter> {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    `CREATE TABLE customers (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL)`,
  );
  sqlite.exec(
    `CREATE TABLE orders (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       reference text NOT NULL,
       status text DEFAULT 'draft' NOT NULL,
       customer_id integer REFERENCES customers(id),
       placed_at integer NOT NULL
     )`,
  );
  for (const name of ["Ada", "Linus"]) {
    sqlite.prepare(`INSERT INTO customers (name) VALUES (?)`).run(name as never);
  }
  for (const [reference, status, customerId, placedAt] of ROWS) {
    sqlite
      .prepare(
        `INSERT INTO orders (reference, status, customer_id, placed_at) VALUES (?, ?, ?, ?)`,
      )
      .run(reference as never, status as never, customerId as never, placedAt as never);
  }

  const db = drizzle(async (sql, params, method) => {
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

  return createAdminRouter({
    collections: [orderCollection, customerCollection],
    getDb: () => db,
  });
}

interface ListBody {
  data: { reference: string }[];
  total: number;
}

async function listWith(query: string): Promise<ListBody> {
  const response = await freshApp().request(`/collections/orders?${query}`);
  return (await response.json()) as ListBody;
}

const refs = (body: ListBody): string[] => body.data.map((row) => row.reference);

describe("filter routes", () => {
  it("advertises each filter's kind, choices and nullability", async () => {
    const response = await freshApp().request("/collections");
    const summaries = (await response.json()) as { slug: string; filters: unknown }[];
    expect(summaries.find((c) => c.slug === "orders")?.filters).toEqual([
      {
        field: "status",
        kind: "choices",
        options: [
          { value: "draft", label: "draft" },
          { value: "paid", label: "paid" },
          { value: "shipped", label: "shipped" },
        ],
        nullable: false,
      },
      {
        field: "customerId",
        kind: "relation",
        options: [],
        nullable: true,
        table: "customers",
        collection: "customers",
        targetField: "id",
        labelField: "name",
      },
      {
        field: "placedAt",
        kind: "date",
        options: [],
        nullable: false,
        // A date filter's windows are named, not enumerated as rows.
      },
    ]);
  });

  it("matches a bare value exactly, as it always did", async () => {
    const body = await listWith("status=draft");
    expect(refs(body)).toEqual(["A-1", "A-5"]);
    expect(body.total).toBe(2);
  });

  it("matches any of several values", async () => {
    expect(refs(await listWith("status=in:paid,shipped"))).toEqual([
      "A-2",
      "A-3",
      "A-4",
    ]);
  });

  it("asks whether a nullable column is set", async () => {
    expect(refs(await listWith("customerId=isnull:true"))).toEqual(["A-4", "A-5"]);
    expect(refs(await listWith("customerId=isnull:false"))).toEqual([
      "A-1",
      "A-2",
      "A-3",
    ]);
  });

  it("compares a foreign key as a number, not as the text from the URL", async () => {
    expect(refs(await listWith("customerId=1"))).toEqual(["A-1", "A-2"]);
  });

  it("bounds a date range, upper bound exclusive", async () => {
    expect(
      refs(await listWith("placedAt=range:2026-07-01..2026-07-16")),
    ).toEqual(["A-2", "A-3"]);
    expect(refs(await listWith("placedAt=range:2026-07-01.."))).toEqual([
      "A-1",
      "A-2",
      "A-3",
    ]);
  });

  it("combines filters and keeps the total honest", async () => {
    const body = await listWith("status=paid&customerId=1");
    expect(refs(body)).toEqual(["A-2"]);
    expect(body.total).toBe(1);
  });

  it("ignores a column the collection never opened for filtering", async () => {
    // `reference` is searchable-looking but was not declared as a filter.
    expect(refs(await listWith("reference=A-1"))).toHaveLength(ROWS.length);
  });

  it("drops a value the encoding cannot read instead of guessing", async () => {
    expect(refs(await listWith("placedAt=preset:someday"))).toHaveLength(
      ROWS.length,
    );
    expect(refs(await listWith("status="))).toHaveLength(ROWS.length);
  });
});

describe("date presets", () => {
  // Presets resolve against the server's clock, so the fixtures are placed
  // relative to it rather than pinned to a date that ages out of the window.
  const DAY = 86_400_000;
  const now = Date.now();
  const relative: [string, number][] = [
    ["NOW", now],
    ["3-DAYS-AGO", now - 3 * DAY],
    ["40-DAYS-AGO", now - 40 * DAY],
  ];

  async function listRelative(query: string): Promise<string[]> {
    const app = freshApp();
    for (const [reference, when] of relative) {
      await app.request("/collections/orders", {
        method: "POST",
        body: JSON.stringify({
          reference,
          placedAt: new Date(when).toISOString(),
        }),
        headers: { "content-type": "application/json" },
      });
    }
    const response = await app.request(`/collections/orders?${query}`);
    const body = (await response.json()) as ListBody;
    return refs(body).filter((reference) => reference.includes("AGO") || reference === "NOW");
  }

  it("bounds today", async () => {
    expect(await listRelative("placedAt=preset:today&pageSize=50")).toEqual(["NOW"]);
  });

  it("bounds the past week", async () => {
    expect(await listRelative("placedAt=preset:past7&pageSize=50")).toEqual([
      "NOW",
      "3-DAYS-AGO",
    ]);
  });
});
