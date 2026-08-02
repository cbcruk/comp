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

const authors = sqliteTable("authors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  body: text("body"),
  authorId: integer("author_id").references(() => authors.id),
});

const postCollection = defineCollection({
  model: posts,
  listDisplay: ["title"],
  search: ["title", "body", "^slug", "authorId__name"],
  ordering: [{ field: "id", direction: "asc" }],
});

const authorCollection = defineCollection({
  model: authors,
  listDisplay: ["name"],
  search: ["=name"],
});

/** title, slug, body, author */
const ROWS: [string, string, string | null, number | null][] = [
  ["Ada on engines", "ada-engines", "Notes about the analytical engine", 1],
  ["Engines at scale", "engines-scale", "A longer piece", 2],
  ["Untitled", "draft-one", "ada appears only in the body", 2],
  ["Orphan", "orphan", null, null],
];

function app(): ReturnType<typeof createAdminRouter> {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    `CREATE TABLE authors (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL)`,
  );
  sqlite.exec(
    `CREATE TABLE posts (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       title text NOT NULL,
       slug text NOT NULL,
       body text,
       author_id integer REFERENCES authors(id)
     )`,
  );
  for (const name of ["Ada Lovelace", "Grace Hopper"]) {
    sqlite.prepare(`INSERT INTO authors (name) VALUES (?)`).run(name as never);
  }
  for (const [title, slug, body, authorId] of ROWS) {
    sqlite
      .prepare(`INSERT INTO posts (title, slug, body, author_id) VALUES (?, ?, ?, ?)`)
      .run(title as never, slug as never, body as never, authorId as never);
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
    collections: [postCollection, authorCollection],
    getDb: () => db,
  });
}

interface ListBody {
  data: { title: string; name?: string }[];
  total: number;
}

async function search(slug: string, q: string): Promise<ListBody> {
  const response = await app().request(
    `/collections/${slug}?q=${encodeURIComponent(q)}`,
  );
  return (await response.json()) as ListBody;
}

const titles = (body: ListBody): string[] => body.data.map((row) => row.title);

describe("search over HTTP", () => {
  it("matches anywhere inside a bare field", async () => {
    expect(titles(await search("posts", "engine"))).toEqual([
      "Ada on engines",
      "Engines at scale",
    ]);
  });

  it("ORs the declared fields for one term", async () => {
    // "ada" is in one title, one body, and one author's name.
    expect(titles(await search("posts", "ada"))).toEqual([
      "Ada on engines",
      "Untitled",
    ]);
  });

  it("ANDs the terms, so a second word narrows the result", async () => {
    // The old behavior matched the whole query as one substring and found
    // nothing here; now each word only has to match some field.
    expect(titles(await search("posts", "ada engine"))).toEqual([
      "Ada on engines",
    ]);
    expect(titles(await search("posts", "ada nonsense"))).toEqual([]);
  });

  it("keeps a quoted phrase whole", async () => {
    expect(titles(await search("posts", '"at scale"'))).toEqual([
      "Engines at scale",
    ]);
    expect(titles(await search("posts", '"scale at"'))).toEqual([]);
  });

  it("anchors a ^ field to the start of the value", async () => {
    // `slug` is declared `^slug`: "engines-scale" starts with it, and the
    // substring inside "ada-engines" does not count.
    const body = await search("posts", "engines-");
    expect(titles(body)).toEqual(["Engines at scale"]);
  });

  it("demands the whole value for an = field, term by term", async () => {
    // The lookup applies to each term, so an unquoted two-word query asks the
    // name to equal both words at once and can never match. Quoting keeps it
    // one term — which is what the quotes are for.
    expect((await search("authors", '"Ada Lovelace"')).data).toHaveLength(1);
    expect((await search("authors", "Ada Lovelace")).data).toHaveLength(0);
    expect((await search("authors", "Ada")).data).toHaveLength(0);
  });

  it("searches across a foreign key", async () => {
    // "hopper" appears nowhere on posts — only on the author they point at.
    expect(titles(await search("posts", "hopper"))).toEqual([
      "Engines at scale",
      "Untitled",
    ]);
  });

  it("counts the rows it returned, without a join inflating them", async () => {
    const body = await search("posts", "ada");
    expect(body.total).toBe(body.data.length);
    expect(body.total).toBe(2);
  });

  it("leaves the list alone when the query is blank", async () => {
    expect(titles(await search("posts", "   "))).toHaveLength(ROWS.length);
  });
});
