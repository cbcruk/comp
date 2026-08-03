import { defineCollection, type SqliteDb } from "@comp/core";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
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

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
});

const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

const postTags = sqliteTable(
  "post_tags",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] })],
);

const tagCollection = defineCollection({
  model: tags,
  listDisplay: ["name"],
  labelField: "name",
});

const postCollection = defineCollection({
  model: posts,
  listDisplay: ["title"],
  ordering: [{ field: "id", direction: "asc" }],
  manyToMany: [{ collection: "tags", through: postTags, filter: true }],
});

interface Sqlite {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: never[]): unknown;
    all(...params: never[]): Record<string, unknown>[];
  };
}

let sqlite: Sqlite;
let app: ReturnType<typeof createAdminRouter>;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE posts (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      title text NOT NULL
    );
    CREATE TABLE tags (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text NOT NULL
    );
    CREATE TABLE post_tags (
      post_id integer NOT NULL REFERENCES posts(id) ON DELETE cascade,
      tag_id integer NOT NULL REFERENCES tags(id) ON DELETE cascade,
      PRIMARY KEY (post_id, tag_id)
    );
    INSERT INTO posts (title) VALUES ('First'), ('Second'), ('Third');
    INSERT INTO tags (name) VALUES ('rust'), ('sqlite'), ('django');
    INSERT INTO post_tags (post_id, tag_id) VALUES (1, 1), (1, 2), (2, 2);
  `);

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

  app = createAdminRouter({
    collections: [postCollection, tagCollection],
    getDb: () => db,
  });
});

interface RecordBody {
  data: { id: number; title: string };
  manyToMany?: Record<string, unknown[]>;
}

interface ListBody {
  data: { id: number; title: string }[];
  total: number;
}

const links = (postId: number): unknown[] =>
  sqlite
    .prepare(`SELECT tag_id FROM post_tags WHERE post_id = ? ORDER BY tag_id`)
    .all(postId as never)
    .map((row) => row.tag_id);

async function read(id: number): Promise<RecordBody> {
  const response = await app.request(`/collections/posts/${String(id)}`);
  return (await response.json()) as RecordBody;
}

async function write(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<Response> {
  return app.request(path, { method, body: JSON.stringify(body) });
}

describe("reading a record's links", () => {
  it("comes back with the record, keyed by the relationship's name", async () => {
    expect((await read(1)).manyToMany).toEqual({ tags: [1, 2] });
    expect((await read(3)).manyToMany).toEqual({ tags: [] });
  });

  it("is on the collection summary, bound to the far collection", async () => {
    const summaries = (await (await app.request("/collections")).json()) as {
      slug: string;
      manyToMany: unknown[];
    }[];
    const post = summaries.find((entry) => entry.slug === "posts");
    expect(post?.manyToMany).toEqual([
      { name: "tags", collection: "tags", targetKey: "id", labelField: "name" },
    ]);
  });
});

describe("setting a record's links", () => {
  it("replaces the whole set — Django's .set()", async () => {
    const response = await write("/collections/posts/1", "PATCH", {
      manyToMany: { tags: [2, 3] },
    });
    expect(response.status).toBe(200);
    // 1 went, 3 arrived, 2 stayed put rather than being deleted and re-added.
    expect(links(1)).toEqual([2, 3]);
  });

  it("clears the set when given an empty one", async () => {
    await write("/collections/posts/1", "PATCH", { manyToMany: { tags: [] } });
    expect(links(1)).toEqual([]);
  });

  it("leaves a relationship the write never mentions alone", async () => {
    // A form that does not render a relationship must not be able to clear it.
    await write("/collections/posts/1", "PATCH", { title: "Renamed" });
    expect(links(1)).toEqual([1, 2]);
    expect((await read(1)).data.title).toBe("Renamed");
  });

  it("links a record on the way in", async () => {
    const response = await write("/collections/posts", "POST", {
      title: "Fourth",
      manyToMany: { tags: [3] },
    });
    expect(response.status).toBe(201);
    const created = (await response.json()) as RecordBody;
    expect(created.manyToMany).toEqual({ tags: [3] });
    expect(links(created.data.id)).toEqual([3]);
  });

  it("takes the same id twice as one link", async () => {
    // The join table would refuse the second row; the write should not need it
    // to.
    const response = await write("/collections/posts/3", "PATCH", {
      manyToMany: { tags: [1, 1] },
    });
    expect(response.status).toBe(200);
    expect(links(3)).toEqual([1]);
  });

  it("refuses an id that is not there rather than dropping it", async () => {
    // Half a selection saved silently is the kind of save that looks like it
    // worked.
    const response = await write("/collections/posts/3", "PATCH", {
      manyToMany: { tags: [1, 999] },
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { issues?: { path: string[] }[] };
    expect(body.issues?.[0]?.path).toEqual(["manyToMany", "tags"]);
    // Nothing was linked: the write failed before it touched anything.
    expect(links(3)).toEqual([]);
  });

  it("refuses a relationship this collection does not have", async () => {
    const response = await write("/collections/posts/1", "PATCH", {
      manyToMany: { authors: [1] },
    });
    expect(response.status).toBe(400);
  });

  it("only ever touches the record being edited", async () => {
    // The unlink is scoped to the parent in SQL; post 2 also has tag 2.
    await write("/collections/posts/1", "PATCH", { manyToMany: { tags: [] } });
    expect(links(2)).toEqual([2]);
  });
});

describe("filtering by a many-to-many", () => {
  const list = async (query: string): Promise<ListBody> =>
    (await (await app.request(`/collections/posts${query}`)).json()) as ListBody;

  it("finds the records linked to one", async () => {
    const body = await list("?tags=2");
    expect(body.data.map((row) => row.title)).toEqual(["First", "Second"]);
    expect(body.total).toBe(2);
  });

  it("counts each record once, however many links match", async () => {
    // A join would list "First" twice — it has both tags — and the total would
    // stop matching the rows.
    const body = await list("?tags=in:1,2");
    expect(body.data.map((row) => row.title)).toEqual(["First", "Second"]);
    expect(body.total).toBe(2);
  });

  it("finds the records with no links at all", async () => {
    const body = await list("?tags=isnull:true");
    expect(body.data.map((row) => row.title)).toEqual(["Third"]);
  });

  it("finds the records with any", async () => {
    expect((await list("?tags=isnull:false")).total).toBe(2);
  });
});
