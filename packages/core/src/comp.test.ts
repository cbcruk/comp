import { drizzle } from "drizzle-orm/sqlite-proxy";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  bulkDeleteAction,
  defineAction,
} from "./action/define-action.js";
import { allowAll } from "./auth/allow-all.js";
import type { AuthAdapter } from "./auth/auth-adapter.types.js";
import { defineCollection } from "./collection/define-collection.js";
import { introspectTable } from "./introspection/introspect-table.js";
import {
  buildDeleteQuery,
  buildInsertQuery,
  buildUpdateQuery,
} from "./mutation/build-mutations.js";
import { buildGetByIdQuery } from "./query/build-get-query.js";
import {
  buildCountQuery,
  buildListQuery,
} from "./query/build-list-query.js";
import {
  deriveInsertSchema,
  deriveUpdateSchema,
  validateInsert,
  validateUpdate,
} from "./validation/derive-schema.js";
import { ValidationError } from "./validation/validation-error.js";

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

  it("captures enum values when declared", () => {
    const docs = sqliteTable("docs", {
      state: text("state", { enum: ["open", "closed"] }),
    });
    expect(introspectTable(docs).fields.state?.enumValues).toEqual([
      "open",
      "closed",
    ]);
    expect(meta.fields.title?.enumValues).toBeUndefined();
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

describe("validateInsert / validateUpdate", () => {
  it("returns parsed data on valid insert input", () => {
    expect(validateInsert(postCollection, { title: "Hello" })).toMatchObject({
      title: "Hello",
    });
  });

  it("throws ValidationError with issues on invalid input", () => {
    try {
      validateInsert(postCollection, {});
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).issues.length).toBeGreaterThan(0);
    }
  });

  it("accepts an empty update", () => {
    expect(validateUpdate(postCollection, {})).toEqual({});
  });
});

describe("defineAction", () => {
  it("normalizes config into a capability manifest", () => {
    const action = defineAction({
      name: "publish",
      collection: "posts",
      operations: ["update"],
      handler: async () => ({ affected: 0 }),
    });
    expect(action.label).toBe("publish");
    expect(action.manifest).toEqual({
      name: "publish",
      collection: "posts",
      operations: ["update"],
    });
  });

  it("requires a name and at least one operation", () => {
    const handler = async () => ({ affected: 0 });
    expect(() =>
      defineAction({ name: "", collection: "posts", operations: ["update"], handler }),
    ).toThrow(/name/);
    expect(() =>
      defineAction({ name: "x", collection: "posts", operations: [], handler }),
    ).toThrow(/operations/);
  });
});

describe("bulkDeleteAction", () => {
  it("declares the delete capability", () => {
    const action = bulkDeleteAction("posts");
    expect(action.name).toBe("delete");
    expect(action.operations).toEqual(["delete"]);
  });

  it("deletes each selected id and counts what was affected", async () => {
    const deleted: unknown[] = [];
    const fakeDb = {
      delete: () => ({
        where: () => ({
          returning: () => {
            deleted.push(true);
            return Promise.resolve([{ id: deleted.length }]);
          },
        }),
      }),
    };
    const action = bulkDeleteAction("posts");
    const result = await action.handler({
      db: fakeDb as never,
      collection: postCollection,
      ids: [1, 2, 3],
    });
    expect(result.affected).toBe(3);
    expect(deleted).toHaveLength(3);
  });
});

describe("auth adapter", () => {
  it("allow-all yields an anonymous identity and authorizes everything", async () => {
    expect(await allowAll.authenticate(new Request("http://x"))).toEqual({
      subject: "anonymous",
    });
    expect(
      await allowAll.authorize({
        identity: { subject: "anonymous" },
        collection: postCollection,
        operation: "delete",
      }),
    ).toBe(true);
  });

  it("a custom adapter can deny by operation", async () => {
    const readOnly: AuthAdapter = {
      authenticate: () => ({ subject: "viewer" }),
      authorize: ({ operation }) => operation === "list" || operation === "read",
    };
    expect(
      await readOnly.authorize({
        identity: { subject: "viewer" },
        collection: postCollection,
        operation: "list",
      }),
    ).toBe(true);
    expect(
      await readOnly.authorize({
        identity: { subject: "viewer" },
        collection: postCollection,
        operation: "delete",
      }),
    ).toBe(false);
  });
});

describe("mutation queries", () => {
  it("builds an insert with returning", () => {
    const { sql, params } = buildInsertQuery(db, postCollection, {
      title: "Hello",
    }).toSQL();
    expect(sql).toContain('insert into "posts"');
    expect(sql).toContain("returning");
    expect(params).toContain("Hello");
  });

  it("builds an update keyed on the primary key", () => {
    const { sql, params } = buildUpdateQuery(db, postCollection, 7, {
      title: "Edited",
    }).toSQL();
    expect(sql).toContain('update "posts"');
    expect(sql).toContain('"posts"."id" = ?');
    expect(params).toEqual(expect.arrayContaining(["Edited", 7]));
  });

  it("builds a delete keyed on the primary key", () => {
    const { sql, params } = buildDeleteQuery(db, postCollection, 7).toSQL();
    expect(sql).toContain('delete from "posts"');
    expect(sql).toContain('"posts"."id" = ?');
    expect(params).toContain(7);
  });
});
