import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../collection/define-collection.js";
import { introspectTable } from "../introspection/introspect-table.js";
import { buildCountQuery, buildListQuery } from "../query/build-list-query.js";
import { resolveSearch, splitSearchTerms } from "./resolve-search.js";

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

const fields = introspectTable(posts).fields;
const db = drizzle(async () => ({ rows: [] }));

const search = (configs: string[]): ReturnType<typeof resolveSearch> =>
  resolveSearch("posts", fields, configs);

function sqlFor(configs: string[], query: string): { sql: string; params: unknown[] } {
  const collection = defineCollection({
    model: posts,
    listDisplay: ["title"],
    search: configs,
  });
  const { sql, params } = buildListQuery(db, collection, { search: query }).toSQL();
  return { sql, params };
}

describe("resolveSearch", () => {
  it("defaults to matching anywhere inside the column", () => {
    expect(search(["title"])).toEqual([{ field: "title", lookup: "contains" }]);
  });

  it("reads the lookup off the prefix", () => {
    expect(search(["^slug", "=title"])).toEqual([
      { field: "slug", lookup: "startswith" },
      { field: "title", lookup: "exact" },
    ]);
  });

  it("follows a foreign key into the table it points at", () => {
    expect(search(["authorId__name"])).toEqual([
      {
        field: "authorId",
        lookup: "contains",
        through: { table: "authors", field: "name" },
      },
    ]);
  });

  it("combines a prefix with a traversal", () => {
    expect(search(["^authorId__name"])[0]).toEqual({
      field: "authorId",
      lookup: "startswith",
      through: { table: "authors", field: "name" },
    });
  });

  it("throws rather than quietly searching one field fewer", () => {
    expect(() => search(["nope"])).toThrow(/is not a column/);
    expect(() => search(["nope__name"])).toThrow(/is not a column/);
    expect(() => search(["title__name"])).toThrow(/is not a foreign key/);
  });

  it("is resolved onto the collection", () => {
    const collection = defineCollection({
      model: posts,
      listDisplay: ["title"],
      search: ["title", "authorId__name"],
    });
    expect(collection.search).toHaveLength(2);
    expect(collection.search[1]?.through?.table).toBe("authors");
  });
});

describe("splitSearchTerms", () => {
  it("splits on whitespace", () => {
    expect(splitSearchTerms("ada lovelace")).toEqual(["ada", "lovelace"]);
    expect(splitSearchTerms("  spaced   out ")).toEqual(["spaced", "out"]);
  });

  it("keeps a quoted phrase whole", () => {
    expect(splitSearchTerms('"ada lovelace" notes')).toEqual([
      "ada lovelace",
      "notes",
    ]);
  });

  it("tolerates an unbalanced quote", () => {
    expect(splitSearchTerms('"ada lovelace')).toEqual(["ada lovelace"]);
  });

  it("has nothing to say about an empty query", () => {
    expect(splitSearchTerms("")).toEqual([]);
    expect(splitSearchTerms("   ")).toEqual([]);
  });
});

describe("search in the query", () => {
  it("matches anywhere inside the column by default", () => {
    const { sql, params } = sqlFor(["title"], "ada");
    expect(sql).toContain('"title" like ?');
    expect(params).toContain("%ada%");
  });

  it("anchors a ^ field to the start and demands the whole of an = field", () => {
    expect(sqlFor(["^slug"], "ada").params).toContain("ada%");
    const exact = sqlFor(["=title"], "ada");
    expect(exact.sql).toContain('"title" = ?');
    expect(exact.params).toContain("ada");
  });

  it("ORs the fields for one term", () => {
    const { sql } = sqlFor(["title", "body"], "ada");
    expect(sql).toContain("or");
    expect(sql).toContain('"title" like ?');
    expect(sql).toContain('"body" like ?');
  });

  it("ANDs the terms, so a second word narrows rather than widens", () => {
    const { sql, params } = sqlFor(["title", "body"], "ada lovelace");
    expect(params).toEqual(
      expect.arrayContaining(["%ada%", "%lovelace%"]),
    );
    // Two OR groups, joined by and.
    expect(sql.match(/\(/g)?.length).toBeGreaterThan(1);
    expect(sql).toContain("and");
  });

  it("reaches through a foreign key with a subquery, not a join", () => {
    const { sql, params } = sqlFor(["authorId__name"], "ada");
    expect(sql).toContain('"author_id" in (select');
    expect(sql).toContain('from "authors"');
    expect(sql).toContain('"name" like ?');
    // No join means one row per record: no DISTINCT needed, count stays honest.
    expect(sql).not.toContain("join");
    expect(params).toContain("%ada%");
  });

  it("counts the same rows it lists", () => {
    const collection = defineCollection({
      model: posts,
      listDisplay: ["title"],
      search: ["title", "authorId__name"],
    });
    const list = buildListQuery(db, collection, { search: "ada" }).toSQL();
    const count = buildCountQuery(db, collection, { search: "ada" }).toSQL();
    // Same conditions in the same order; the list's extra params are its
    // limit and offset, which the count has no business carrying.
    expect(list.params.slice(0, count.params.length)).toEqual(count.params);
    expect(count.sql).toContain('"author_id" in (select');
  });

  it("adds no condition when nothing is searchable or the query is blank", () => {
    expect(sqlFor([], "ada").sql).not.toContain("where");
    expect(sqlFor(["title"], "   ").sql).not.toContain("where");
  });
});
