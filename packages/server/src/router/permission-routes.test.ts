import {
  bulkDeleteAction,
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

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  status: text("status", { enum: ["draft", "published"] }).notNull(),
  channel: text("channel"),
});

const postCollection = defineCollection({
  model: posts,
  listDisplay: ["title", "status"],
  filters: [{ field: "channel", kind: "values" }],
  ordering: [{ field: "id", direction: "asc" }],
});

/** title, status, channel */
const ROWS: [string, string, string][] = [
  ["Public one", "published", "web"],
  ["Secret draft", "draft", "internal"],
  ["Public two", "published", "web"],
  ["Another draft", "draft", "internal"],
];

/** Sees only published posts; may do everything to what it can see. */
const readerScope: AuthAdapter = {
  authenticate: () => null,
  authorize: () => true,
  scope: () => ({ status: "published" }),
};

/** Sees everything, but a published post is locked. */
const lockPublished: AuthAdapter = {
  authenticate: () => null,
  authorize: () => true,
  authorizeRecord: ({ operation, record }) =>
    operation === "list" || operation === "read" || record.status !== "published",
};

function app(auth: AuthAdapter): ReturnType<typeof createAdminRouter> {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    `CREATE TABLE posts (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       title text NOT NULL,
       status text NOT NULL,
       channel text
     )`,
  );
  for (const [title, status, channel] of ROWS) {
    sqlite
      .prepare(`INSERT INTO posts (title, status, channel) VALUES (?, ?, ?)`)
      .run(title as never, status as never, channel as never);
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
    collections: [postCollection],
    actions: [bulkDeleteAction(postCollection.slug)],
    getDb: () => db,
    auth,
  });
}

interface ListBody {
  data: { id: number; title: string }[];
  total: number;
  choices: { field: string; options: { value: string }[] }[];
}

describe("a scope decides which rows exist", () => {
  it("narrows the list and its total together", async () => {
    const response = await app(readerScope).request("/collections/posts");
    const body = (await response.json()) as ListBody;
    expect(body.data.map((row) => row.title)).toEqual([
      "Public one",
      "Public two",
    ]);
    // A total that counted the hidden rows would announce their existence.
    expect(body.total).toBe(2);
  });

  it("narrows what a distinct-value filter offers", async () => {
    // Otherwise the filter names values that only invisible rows hold.
    const response = await app(readerScope).request("/collections/posts");
    const body = (await response.json()) as ListBody;
    const channels = body.choices[0]?.options.map((option) => option.value);
    expect(channels).toEqual(["web"]);
  });

  it("answers 404, not 403, for a row outside it", async () => {
    // "Forbidden" would confirm the row is there; the caller learns nothing by
    // guessing ids.
    const response = await app(readerScope).request("/collections/posts/2");
    expect(response.status).toBe(404);
  });

  it("still serves a row inside it", async () => {
    const response = await app(readerScope).request("/collections/posts/1");
    expect(response.status).toBe(200);
  });

  it("refuses to update or delete through it", async () => {
    const patch = await app(readerScope).request("/collections/posts/2", {
      method: "PATCH",
      body: JSON.stringify({ title: "Rewritten" }),
    });
    expect(patch.status).toBe(404);

    const remove = await app(readerScope).request("/collections/posts/2", {
      method: "DELETE",
    });
    expect(remove.status).toBe(404);
  });

  it("leaves the rows inside it writable", async () => {
    const response = await app(readerScope).request("/collections/posts/1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Rewritten" }),
    });
    expect(response.status).toBe(200);
  });

  it("narrows the ids a bulk action receives", async () => {
    // The selection is the caller's; which rows it stands for is not.
    const admin = app(readerScope);
    const run = await admin.request("/collections/posts/actions/delete", {
      method: "POST",
      body: JSON.stringify({ ids: [1, 2, 3, 4] }),
    });
    expect(run.status).toBe(200);

    const body = (await (
      await admin.request("/collections/posts")
    ).json()) as ListBody;
    expect(body.total).toBe(0);

    // The drafts it could not see are still there — asking for them by id did
    // not make them reachable.
    const all = app({ authenticate: () => null, authorize: () => true });
    expect(((await (await all.request("/collections/posts")).json()) as ListBody).total)
      .toBe(4);
  });
});

describe("a per-record rule decides what may be done to a row", () => {
  it("refuses with 403, because the row is visible", async () => {
    const response = await app(lockPublished).request("/collections/posts/1", {
      method: "DELETE",
    });
    expect(response.status).toBe(403);
  });

  it("allows the same operation on a row it permits", async () => {
    const response = await app(lockPublished).request("/collections/posts/2", {
      method: "DELETE",
    });
    expect(response.status).toBe(200);
  });

  it("guards the delete confirmation with the same answer", async () => {
    // A preview that described a delete the delete itself would refuse is a
    // confirmation of nothing.
    const response = await app(lockPublished).request(
      "/collections/posts/1/delete-preview",
    );
    expect(response.status).toBe(403);
  });

  it("keeps a locked row out of a bulk action", async () => {
    const admin = app(lockPublished);
    await admin.request("/collections/posts/actions/delete", {
      method: "POST",
      body: JSON.stringify({ ids: [1, 2, 3, 4] }),
    });
    const body = (await (
      await admin.request("/collections/posts")
    ).json()) as ListBody;
    expect(body.data.map((row) => row.title)).toEqual([
      "Public one",
      "Public two",
    ]);
  });

  it("costs nothing when the adapter decides per collection only", async () => {
    // No scope, no record hook: the rows are all there and all writable.
    const plain = app({ authenticate: () => null, authorize: () => true });
    const body = (await (
      await plain.request("/collections/posts")
    ).json()) as ListBody;
    expect(body.total).toBe(4);
    expect(
      (await plain.request("/collections/posts/2", { method: "DELETE" })).status,
    ).toBe(200);
  });
});
