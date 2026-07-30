import { defineCollection, type ResolvedForm, type SqliteDb } from "@comp/core";
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

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: ["draft", "published"] })
    .notNull()
    .default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(0)),
});

const postCollection = defineCollection({
  model: posts,
  listDisplay: ["title", "status"],
  fieldsets: [
    { title: "Content", fields: [["title", "slug"]] },
    { title: "Publishing", fields: ["status", "createdAt"], collapsed: true },
  ],
  readonlyFields: ["createdAt"],
  prepopulated: { slug: ["title"] },
  radioFields: ["status"],
});

function app(): ReturnType<typeof createAdminRouter> {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    `CREATE TABLE posts (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       title text NOT NULL,
       slug text NOT NULL,
       status text DEFAULT 'draft' NOT NULL,
       created_at integer NOT NULL
     )`,
  );
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

  return createAdminRouter({ collections: [postCollection], getDb: () => db });
}

interface Post {
  id: number;
  title: string;
  slug: string;
  /** Serialized from the timestamp column, so an ISO string on the wire. */
  createdAt: string;
}

/** What the column's default resolves to in this fixture. */
const DEFAULT_CREATED_AT = new Date(0).toISOString();

async function post(body: unknown): Promise<Post> {
  const response = await app().request("/collections/posts", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  const parsed = (await response.json()) as { data: Post };
  return parsed.data;
}

describe("form layout over HTTP", () => {
  it("serves the layout so a client renders groups rather than a field list", async () => {
    const response = await app().request("/collections");
    const [summary] = (await response.json()) as { form: ResolvedForm }[];
    expect(summary?.form).toEqual({
      fieldsets: [
        {
          title: "Content",
          description: null,
          collapsed: false,
          rows: [["title", "slug"]],
        },
        {
          title: "Publishing",
          description: null,
          collapsed: true,
          rows: [["status"], ["createdAt"]],
        },
      ],
      readonly: ["createdAt"],
      prepopulated: { slug: ["title"] },
      radio: ["status"],
    });
  });
});

describe("readonly fields on the write path", () => {
  it("ignores a readonly value on create, using the column's default", async () => {
    const created = await post({
      title: "T",
      slug: "t",
      createdAt: new Date("2020-01-01").toISOString(),
    });
    // Not the value sent: the schema default, because the write dropped it.
    expect(created.createdAt).toBe(DEFAULT_CREATED_AT);
  });

  it("ignores a readonly value on update", async () => {
    const admin = app();
    const created = (await (
      await admin.request("/collections/posts", {
        method: "POST",
        body: JSON.stringify({ title: "T", slug: "t" }),
        headers: { "content-type": "application/json" },
      })
    ).json()) as { data: Post };

    const patched = (await (
      await admin.request(`/collections/posts/${created.data.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: "Renamed",
          createdAt: new Date("2030-01-01").toISOString(),
        }),
        headers: { "content-type": "application/json" },
      })
    ).json()) as { data: Post };

    expect(patched.data.title).toBe("Renamed");
    expect(patched.data.createdAt).toBe(DEFAULT_CREATED_AT);
  });

  it("still rejects a readonly value that is not even the right type", async () => {
    // Validation runs before the value is dropped, so a bad type is still a 400
    // rather than being quietly discarded.
    const response = await app().request("/collections/posts", {
      method: "POST",
      body: JSON.stringify({ title: "T", slug: "t", createdAt: "not-a-date" }),
      headers: { "content-type": "application/json" },
    });
    expect(response.status).toBe(400);
  });
});
