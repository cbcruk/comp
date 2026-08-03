import { defineCollection, type DateHierarchy, type SqliteDb } from "@comp/core";
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

const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull(),
  status: text("status", { enum: ["draft", "paid"] }).notNull().default("draft"),
  placedAt: integer("placed_at", { mode: "timestamp" }).notNull(),
});

const orderCollection = defineCollection({
  model: orders,
  listDisplay: ["reference"],
  filters: ["status"],
  dateHierarchy: "placedAt",
  ordering: [{ field: "id", direction: "asc" }],
});

/** reference, status, when */
const ROWS: [string, string, string][] = [
  ["A-1", "paid", "2024-03-02T10:00:00Z"],
  ["A-2", "draft", "2026-07-16T10:00:00Z"],
  ["A-3", "paid", "2026-07-16T18:00:00Z"],
  ["A-4", "paid", "2026-07-20T10:00:00Z"],
  ["A-5", "draft", "2026-11-01T10:00:00Z"],
];

function app(): ReturnType<typeof createAdminRouter> {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    `CREATE TABLE orders (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       reference text NOT NULL,
       status text DEFAULT 'draft' NOT NULL,
       placed_at integer NOT NULL
     )`,
  );
  for (const [reference, status, when] of ROWS) {
    sqlite
      .prepare(`INSERT INTO orders (reference, status, placed_at) VALUES (?, ?, ?)`)
      .run(
        reference as never,
        status as never,
        (new Date(when).getTime() / 1000) as never,
      );
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

  return createAdminRouter({ collections: [orderCollection], getDb: () => db });
}

interface ListBody {
  data: { reference: string }[];
  total: number;
  hierarchy: DateHierarchy | null;
}

async function list(query = ""): Promise<ListBody> {
  const response = await app().request(`/collections/orders${query}`);
  return (await response.json()) as ListBody;
}

const refs = (body: ListBody): string[] => body.data.map((row) => row.reference);
const choices = (body: ListBody): [string, number][] =>
  (body.hierarchy?.choices ?? []).map((choice) => [choice.label, choice.count]);

describe("the date drill-down", () => {
  it("offers the years the records span, with their counts", async () => {
    const body = await list();
    expect(body.hierarchy?.level).toBe("year");
    expect(choices(body)).toEqual([
      ["2024", 1],
      ["2026", 4],
    ]);
    // A year with no records is not offered at all — 2025 is missing.
    expect(choices(body).map(([label]) => label)).not.toContain("2025");
  });

  it("drills into a year and offers only the months that have records", async () => {
    const body = await list("?date=2026");
    expect(body.hierarchy?.level).toBe("month");
    expect(choices(body)).toEqual([
      ["July", 3],
      ["November", 1],
    ]);
    expect(refs(body)).toEqual(["A-2", "A-3", "A-4", "A-5"]);
  });

  it("drills into a month and offers its days", async () => {
    const body = await list("?date=2026-07");
    expect(body.hierarchy?.level).toBe("day");
    expect(choices(body)).toEqual([
      ["16", 2],
      ["20", 1],
    ]);
  });

  it("drills into a day and stops offering", async () => {
    const body = await list("?date=2026-07-16");
    expect(body.hierarchy?.level).toBe("record");
    expect(body.hierarchy?.choices).toEqual([]);
    expect(refs(body)).toEqual(["A-2", "A-3"]);
    expect(body.total).toBe(2);
  });

  it("names the trail back up", async () => {
    const body = await list("?date=2026-07-16");
    expect(body.hierarchy?.breadcrumb).toEqual([
      { label: "All dates", path: "" },
      { label: "2026", path: "2026" },
      { label: "July", path: "2026-07" },
      { label: "16", path: "2026-07-16" },
    ]);
  });

  it("counts within whatever else is narrowing the list", async () => {
    // Only paid orders: July 2026 has two of the three.
    const body = await list("?date=2026&status=paid");
    expect(choices(body)).toEqual([["July", 2]]);
    expect(refs(body)).toEqual(["A-3", "A-4"]);
  });

  it("keeps the total honest while drilled in", async () => {
    const body = await list("?date=2026-07");
    expect(body.total).toBe(3);
    expect(body.data).toHaveLength(3);
  });

  it("shows the whole list again for an unreadable trail", async () => {
    // A bad date in a URL should land somewhere usable.
    expect(refs(await list("?date=nope"))).toHaveLength(ROWS.length);
    expect(refs(await list("?date=2026-02-30"))).toHaveLength(ROWS.length);
  });

  it("says nothing for a collection that declares no hierarchy", async () => {
    const plain = defineCollection({ model: orders, listDisplay: ["reference"] });
    const db = drizzle(async () => ({ rows: [] })) as unknown as SqliteDb;
    const response = await createAdminRouter({
      collections: [plain],
      getDb: () => db,
    }).request("/collections/orders");
    expect(((await response.json()) as ListBody).hierarchy).toBeNull();
  });
});
