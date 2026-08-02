import {
  createDrizzleHistoryStore,
  defineCollection,
  type AuthAdapter,
  type HistoryEntry,
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
  body: text("body"),
});

const secrets = sqliteTable("secrets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

const postCollection = defineCollection({ model: posts, listDisplay: ["title"] });
const secretCollection = defineCollection({ model: secrets, listDisplay: ["name"] });

interface Harness {
  app: ReturnType<typeof createAdminRouter>;
  /** The store, read directly to check what a write recorded. */
  entries: () => Promise<HistoryEntry[]>;
}

function harness(options: { auth?: AuthAdapter; history?: boolean } = {}): Harness {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    `CREATE TABLE posts (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, title text NOT NULL, body text)`,
  );
  sqlite.exec(
    `CREATE TABLE secrets (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL)`,
  );
  sqlite.exec(
    `CREATE TABLE comp_history (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       collection text NOT NULL,
       record_id text NOT NULL,
       action text NOT NULL,
       label text NOT NULL,
       fields text DEFAULT '[]' NOT NULL,
       actor text,
       at integer NOT NULL
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

  const store = createDrizzleHistoryStore(db);
  return {
    app: createAdminRouter({
      collections: [postCollection, secretCollection],
      getDb: () => db,
      ...(options.history === false ? {} : { history: store }),
      ...(options.auth ? { auth: options.auth } : {}),
    }),
    entries: () => store.list({ limit: 100 }),
  };
}

const json = { "content-type": "application/json" };

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

interface Post {
  id: number;
  title: string;
}

describe("history is written by the mutation layer", () => {
  it("records a create with what the record is called", async () => {
    const { app, entries } = harness();
    await app.request("/collections/posts", {
      method: "POST",
      body: JSON.stringify({ title: "Ada on engines" }),
      headers: json,
    });

    const [entry] = await entries();
    expect(entry).toMatchObject({
      collection: "posts",
      recordId: "1",
      action: "create",
      label: "Ada on engines",
      fields: [],
    });
  });

  it("records only the fields an update actually changed", async () => {
    const { app, entries } = harness();
    const created = await body<{ data: Post }>(
      await app.request("/collections/posts", {
        method: "POST",
        body: JSON.stringify({ title: "Original", body: "unchanged" }),
        headers: json,
      }),
    );

    // The whole record goes back, as a form would send it.
    await app.request(`/collections/posts/${created.data.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Renamed", body: "unchanged" }),
      headers: json,
    });

    const [entry] = await entries();
    expect(entry?.action).toBe("update");
    expect(entry?.fields).toEqual(["title"]);
    expect(entry?.label).toBe("Renamed");
  });

  it("keeps an entry that outlives the record", async () => {
    const { app, entries } = harness();
    await app.request("/collections/posts", {
      method: "POST",
      body: JSON.stringify({ title: "Doomed" }),
      headers: json,
    });
    await app.request("/collections/posts/1", { method: "DELETE" });

    const [entry] = await entries();
    expect(entry).toMatchObject({ action: "delete", label: "Doomed" });

    // The record is gone; its history is not.
    expect((await app.request("/collections/posts/1")).status).toBe(404);
    const view = await body<{ data: HistoryEntry[] }>(
      await app.request("/collections/posts/1/history"),
    );
    expect(view.data).toHaveLength(2);
  });

  it("names who made the change", async () => {
    const auth: AuthAdapter = {
      authenticate: () => ({ subject: "ada" }),
      authorize: () => true,
    };
    const { app, entries } = harness({ auth });
    await app.request("/collections/posts", {
      method: "POST",
      body: JSON.stringify({ title: "Signed" }),
      headers: json,
    });
    expect((await entries())[0]?.actor).toBe("ada");
  });

  it("writes nothing when no store is configured", async () => {
    const { app } = harness({ history: false });
    const response = await app.request("/collections/posts", {
      method: "POST",
      body: JSON.stringify({ title: "Unlogged" }),
      headers: json,
    });
    // The write still succeeds; history is opt-in.
    expect(response.status).toBe(201);
    expect((await app.request("/collections/posts/1/history")).status).toBe(404);
  });
});

describe("reading history", () => {
  it("returns a record's entries newest first", async () => {
    const { app } = harness();
    await app.request("/collections/posts", {
      method: "POST",
      body: JSON.stringify({ title: "First" }),
      headers: json,
    });
    await app.request("/collections/posts/1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Second" }),
      headers: json,
    });

    const view = await body<{ data: HistoryEntry[] }>(
      await app.request("/collections/posts/1/history"),
    );
    expect(view.data.map((entry) => entry.action)).toEqual(["update", "create"]);
  });

  it("keeps one record's history out of another's", async () => {
    const { app } = harness();
    for (const title of ["One", "Two"]) {
      await app.request("/collections/posts", {
        method: "POST",
        body: JSON.stringify({ title }),
        headers: json,
      });
    }
    const view = await body<{ data: HistoryEntry[] }>(
      await app.request("/collections/posts/2/history"),
    );
    expect(view.data).toHaveLength(1);
    expect(view.data[0]?.label).toBe("Two");
  });

  it("needs permission to read the record it is about", async () => {
    const auth: AuthAdapter = {
      authenticate: () => null,
      authorize: ({ operation }) => operation !== "read",
    };
    const { app } = harness({ auth });
    expect((await app.request("/collections/posts/1/history")).status).toBe(403);
  });

  it("shows recent activity only from collections the caller may list", async () => {
    const { app } = harness();
    await app.request("/collections/posts", {
      method: "POST",
      body: JSON.stringify({ title: "Visible" }),
      headers: json,
    });
    await app.request("/collections/secrets", {
      method: "POST",
      body: JSON.stringify({ name: "Hidden" }),
      headers: json,
    });

    const all = await body<{ data: HistoryEntry[] }>(await app.request("/history"));
    expect(all.data).toHaveLength(2);

    const guarded = harness({
      auth: {
        authenticate: () => null,
        authorize: ({ collection }) => collection.slug !== "secrets",
      },
    });
    await guarded.app.request("/collections/posts", {
      method: "POST",
      body: JSON.stringify({ title: "Visible" }),
      headers: json,
    });
    const narrowed = await body<{ data: HistoryEntry[] }>(
      await guarded.app.request("/history"),
    );
    expect(narrowed.data.every((entry) => entry.collection === "posts")).toBe(true);
  });
});
