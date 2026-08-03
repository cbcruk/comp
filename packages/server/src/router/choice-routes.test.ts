import { defineCollection, type FilterChoices, type SqliteDb } from "@comp/core";
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

const items = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  product: text("product").notNull(),
  vendor: text("vendor"),
});

const itemCollection = defineCollection({
  model: items,
  listDisplay: ["product", "vendor"],
  // Neither column declares its values anywhere — only the rows know them.
  filters: [
    { field: "product", kind: "values" },
    { field: "vendor", kind: "values" },
  ],
  ordering: [{ field: "id", direction: "asc" }],
});

/** product, vendor */
const ROWS: [string, string | null][] = [
  ["Bowl", "acme"],
  ["Cup", null],
  ["Bowl", "acme"],
  ["Anvil", "zed"],
  ["Cup", "acme"],
];

function app(collection = itemCollection): ReturnType<typeof createAdminRouter> {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    `CREATE TABLE order_items (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       product text NOT NULL,
       vendor text
     )`,
  );
  for (const [product, vendor] of ROWS) {
    sqlite
      .prepare(`INSERT INTO order_items (product, vendor) VALUES (?, ?)`)
      .run(product as never, vendor as never);
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

  return createAdminRouter({ collections: [collection], getDb: () => db });
}

interface ListBody {
  data: { product: string; vendor: string | null }[];
  total: number;
  choices: FilterChoices[];
}

async function list(
  query = "",
  collection = itemCollection,
): Promise<ListBody> {
  const response = await app(collection).request(`/collections/order_items${query}`);
  return (await response.json()) as ListBody;
}

const choice = (body: ListBody, field: string): FilterChoices | undefined =>
  body.choices.find((entry) => entry.field === field);
const values = (body: ListBody, field: string): string[] =>
  (choice(body, field)?.options ?? []).map((option) => option.value);

describe("distinct-value filters", () => {
  it("offers the values the column actually holds, deduplicated and ordered", async () => {
    const body = await list();
    expect(values(body, "product")).toEqual(["Anvil", "Bowl", "Cup"]);
    expect(choice(body, "product")?.truncated).toBe(false);
  });

  it("offers an entry for the rows with no value", async () => {
    // One item has no vendor, so "Empty" is a place to go — and it is last.
    expect(values(await list(), "vendor")).toEqual(["acme", "zed", "isnull:true"]);
  });

  it("says nothing about empties when the column has none", async () => {
    expect(values(await list(), "product")).not.toContain("isnull:true");
  });

  it("filters by a chosen value", async () => {
    const body = await list("?product=Bowl");
    expect(body.total).toBe(2);
    expect(body.data.every((row) => row.product === "Bowl")).toBe(true);
  });

  it("selects the rows with no value", async () => {
    const body = await list("?vendor=isnull:true");
    expect(body.total).toBe(1);
    expect(body.data[0]?.product).toBe("Cup");
  });

  it("keeps offering every value while one of them is selected", async () => {
    // The choices come from the whole table, like Django's do. Narrowing them
    // to the current list would make the filter a one-way door: pick "Bowl"
    // and switching to "Cup" would mean clearing it first.
    const body = await list("?product=Bowl");
    expect(values(body, "product")).toEqual(["Anvil", "Bowl", "Cup"]);
    expect(values(body, "vendor")).toEqual(["acme", "zed", "isnull:true"]);
  });

  it("says so when it is only showing a prefix", async () => {
    const capped = defineCollection({
      model: items,
      listDisplay: ["product"],
      filters: [{ field: "product", kind: "values", limit: 2 }],
    });
    const body = await list("", capped);
    expect(values(body, "product")).toEqual(["Anvil", "Bowl"]);
    expect(choice(body, "product")?.truncated).toBe(true);
  });

  it("costs nothing for a collection that declares none", async () => {
    const plain = defineCollection({
      model: items,
      listDisplay: ["product"],
      filters: ["product"],
    });
    const body = await list("", plain);
    expect(body.choices).toEqual([]);
  });
});
