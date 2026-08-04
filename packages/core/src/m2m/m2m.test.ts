import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../collection/define-collection.js";
import { buildListQuery } from "../query/build-list-query.js";
import { bindManyToMany, manyToManySummary } from "./resolve-m2m.js";

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

/** A table joined to itself: neither key is "the other one". */
const related = sqliteTable("related_posts", {
  fromId: integer("from_id")
    .notNull()
    .references(() => posts.id),
  toId: integer("to_id")
    .notNull()
    .references(() => posts.id),
});

const db = drizzle(async () => ({ rows: [] }));

const tagCollection = defineCollection({
  model: tags,
  listDisplay: ["name"],
  labelField: "name",
});

const postCollection = defineCollection({
  model: posts,
  listDisplay: ["title"],
  // The relationship declares its own filter: its name is not a column, and
  // `filters` is checked against the columns at authoring time.
  manyToMany: [{ collection: "tags", through: postTags, filter: true }],
});

describe("resolving a many-to-many", () => {
  it("reads both sides off the join table", () => {
    const meta = postCollection.manyToMany[0]!;
    // Only the join table and the far collection's slug were declared; which
    // key is whose came from the schema.
    expect(meta).toMatchObject({
      name: "tags",
      filter: true,
      collection: "tags",
      table: "tags",
      field: "postId",
      parentKey: "id",
      targetField: "tagId",
    });
  });

  it("refuses a join table that does not reach this collection", () => {
    const unrelated = sqliteTable("notes", {
      id: integer("id").primaryKey(),
      tagId: integer("tag_id").references(() => tags.id),
    });
    expect(() =>
      defineCollection({
        model: posts,
        listDisplay: ["title"],
        manyToMany: [{ collection: "tags", through: unrelated }],
      }),
    ).toThrow(/no foreign key to it/);
  });

  it("refuses a self-join until it is told which key is which", () => {
    expect(() =>
      defineCollection({
        model: posts,
        listDisplay: ["title"],
        manyToMany: [{ collection: "posts", through: related }],
      }),
    ).toThrow(/ambiguous/);

    const selfJoined = defineCollection({
      model: posts,
      listDisplay: ["title"],
      manyToMany: [
        {
          name: "related",
          collection: "posts",
          through: related,
          field: "fromId",
          targetField: "toId",
        },
      ],
    });
    expect(selfJoined.manyToMany[0]).toMatchObject({
      name: "related",
      field: "fromId",
      targetField: "toId",
    });
  });

  it("binds the far side over the registry", () => {
    const specs = bindManyToMany([postCollection, tagCollection]).get("posts");
    expect(specs).toHaveLength(1);
    // The column name became the far collection's field name, and the label
    // field came with it.
    expect(manyToManySummary(specs![0]!)).toEqual({
      name: "tags",
      collection: "tags",
      targetKey: "id",
      labelField: "name",
    });
  });

  it("catches a declaration that names the wrong collection", () => {
    const wrong = defineCollection({
      model: posts,
      slug: "posts",
      listDisplay: ["title"],
      manyToMany: [{ collection: "authors", through: postTags }],
    });
    expect(() => bindManyToMany([wrong, tagCollection])).toThrow(
      /but its join table reaches "tags"/,
    );
  });

  it("drops a relationship whose far side is not a collection", () => {
    expect(bindManyToMany([postCollection]).get("posts")).toEqual([]);
  });
});

describe("filtering by a many-to-many", () => {
  const sqlFor = (value: unknown): { sql: string; params: unknown[] } =>
    buildListQuery(db, postCollection, { filters: { tags: value } }).toSQL();

  it("is offered as a filter by name, with the far table attached", () => {
    expect(postCollection.filters[0]).toMatchObject({
      field: "tags",
      kind: "m2m",
      table: "tags",
      nullable: true,
    });
  });

  it("matches through a subquery, not a join", () => {
    // A join multiplies a record by its links: two matching tags would list
    // the post twice, and the total would stop matching the rows.
    const { sql, params } = sqlFor("3");
    expect(sql).toContain("select");
    expect(sql).toContain("post_tags");
    expect(sql).not.toContain("join");
    expect(sql).not.toContain("distinct");
    // Coerced to the key's type: an integer column compared against "3" would
    // match nothing.
    expect(params).toContain(3);
  });

  it("takes several at once", () => {
    const { sql, params } = sqlFor({ op: "in", values: ["1", "2"] });
    expect(sql).toContain("post_tags");
    expect(params).toEqual(expect.arrayContaining([1, 2]));
  });

  it("asks for the records with no links at all", () => {
    expect(sqlFor({ op: "isnull", value: true }).sql).toContain("not in");
    expect(sqlFor({ op: "isnull", value: false }).sql).toContain(" in (");
  });
});
