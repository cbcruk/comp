import { drizzle } from "drizzle-orm/sqlite-proxy";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { defineCollection } from "./collection/define-collection.js";
import { introspectTable } from "./introspection/introspect-table.js";
import { buildGetByIdQuery } from "./query/build-get-query.js";
import {
  buildCountQuery,
  buildListQuery,
} from "./query/build-list-query.js";
import {
  deriveInsertSchema,
  deriveUpdateSchema,
} from "./validation/derive-schema.js";

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body"),
  status: text("status").notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(0)),
});

const postCollection = defineCollection({
  model: posts,
  listDisplay: ["title", "status", "createdAt"],
  filters: ["status"],
  search: ["title", "body"],
  ordering: [{ field: "createdAt", direction: "desc" }],
});

// sqlite-proxy needs no native driver; .toSQL() never invokes the callback.
const db = drizzle(async () => ({ rows: [] }));

describe("introspectTable", () => {
  const meta = introspectTable(posts);

  it("maps every column with its db name", () => {
    expect(Object.keys(meta.fields).sort()).toEqual([
      "body",
      "createdAt",
      "id",
      "status",
      "title",
    ]);
    expect(meta.fields.createdAt?.columnName).toBe("created_at");
  });

  it("identifies the primary key", () => {
    expect(meta.primaryKey).toBe("id");
    expect(meta.fields.id?.primaryKey).toBe(true);
  });

  it("captures nullability and defaults", () => {
    expect(meta.fields.title?.notNull).toBe(true);
    expect(meta.fields.body?.notNull).toBe(false);
    expect(meta.fields.status?.hasDefault).toBe(true);
    expect(meta.fields.createdAt?.hasDefault).toBe(true);
  });
});

describe("defineCollection", () => {
  it("defaults the slug to the table name", () => {
    expect(postCollection.slug).toBe("posts");
  });

  it("fills in defaults and resolves the manifest", () => {
    expect(postCollection.pageSize).toBe(25);
    expect(postCollection.manifest).toEqual({
      collection: "posts",
      operations: ["list", "read", "create", "update", "delete"],
    });
  });

  it("honors explicit slug and operations", () => {
    const readOnly = defineCollection({
      model: posts,
      slug: "articles",
      listDisplay: ["title"],
      operations: ["list", "read"],
    });
    expect(readOnly.slug).toBe("articles");
    expect(readOnly.manifest.operations).toEqual(["list", "read"]);
  });
});

describe("buildListQuery", () => {
  it("applies default ordering and pagination", () => {
    const { sql, params } = buildListQuery(db, postCollection).toSQL();
    expect(sql).toContain('order by "posts"."created_at" desc');
    expect(sql).toContain("limit ?");
    // Drizzle omits `offset` when it is 0, so only the limit param remains.
    expect(params).toEqual([25]);
  });

  it("paginates with 1-based pages", () => {
    const { params } = buildListQuery(db, postCollection, {
      page: 3,
      pageSize: 10,
    }).toSQL();
    expect(params).toEqual([10, 20]);
  });

  it("builds equality filters", () => {
    const { sql, params } = buildListQuery(db, postCollection, {
      filters: { status: "published" },
    }).toSQL();
    expect(sql).toContain('"posts"."status" = ?');
    expect(params).toContain("published");
  });

  it("ORs the search term across search columns", () => {
    const { sql, params } = buildListQuery(db, postCollection, {
      search: "hello",
    }).toSQL();
    expect(sql).toContain("like ?");
    expect(sql).toContain(" or ");
    expect(params.filter((p) => p === "%hello%")).toHaveLength(2);
  });

  it("ignores unknown filter keys and undefined values", () => {
    const { params } = buildListQuery(db, postCollection, {
      filters: { status: undefined },
    }).toSQL();
    expect(params).toEqual([25]);
  });
});

describe("buildGetByIdQuery", () => {
  it("filters on the primary key and limits to one row", () => {
    const { sql, params } = buildGetByIdQuery(db, postCollection, 42).toSQL();
    expect(sql).toContain('"posts"."id" = ?');
    expect(sql).toContain("limit ?");
    expect(params).toEqual([42, 1]);
  });

  it("throws when the collection has no primary key", () => {
    const keyless = defineCollection({
      model: sqliteTable("tags", { name: text("name") }),
      listDisplay: ["name"],
    });
    expect(() => buildGetByIdQuery(db, keyless, "x")).toThrow(/primary key/);
  });
});

describe("buildCountQuery", () => {
  it("counts with the same filters", () => {
    const { sql, params } = buildCountQuery(db, postCollection, {
      filters: { status: "draft" },
    }).toSQL();
    expect(sql).toContain("count(*)");
    expect(params).toContain("draft");
  });
});

describe("deriveInsertSchema", () => {
  const schema = deriveInsertSchema(postCollection);

  it("requires not-null columns without a default", () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ title: "Hello" }).success).toBe(true);
  });

  it("treats primary keys and defaulted columns as optional", () => {
    const result = schema.safeParse({ title: "Hello" });
    expect(result.success).toBe(true);
  });

  it("allows null for nullable columns", () => {
    expect(schema.safeParse({ title: "Hello", body: null }).success).toBe(
      true,
    );
  });

  it("makes every field optional for updates", () => {
    expect(deriveUpdateSchema(postCollection).safeParse({}).success).toBe(true);
  });
});
