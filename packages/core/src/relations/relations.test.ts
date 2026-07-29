import {
  foreignKey,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../collection/define-collection.js";
import { resolveLabelField } from "../collection/label-field.js";
import { introspectTable } from "../introspection/introspect-table.js";
import { resolveRelations } from "./resolve-relations.js";

const authors = sqliteTable("authors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  authorId: integer("author_id").references(() => authors.id, {
    onDelete: "cascade",
  }),
});

const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  body: text("body").notNull(),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id),
});

/** A table whose target is deliberately left unregistered. */
const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  ownerId: integer("owner_id").references(() => authors.id),
});

/** Composite key: no single field owns it. */
const revisions = sqliteTable(
  "revisions",
  {
    postId: integer("post_id").notNull(),
    postSlug: text("post_slug").notNull(),
    body: text("body"),
  },
  (table) => [
    foreignKey({
      columns: [table.postId, table.postSlug],
      foreignColumns: [posts.id, posts.title],
    }),
  ],
);

describe("introspectTable — relations", () => {
  it("captures a single-column foreign key on the field that holds it", () => {
    const meta = introspectTable(posts);
    expect(meta.fields.authorId?.relation).toEqual({
      table: "authors",
      column: "id",
      onDelete: "cascade",
    });
  });

  it("maps the key back to the TypeScript field name, not the column name", () => {
    // The column is `author_id`; the field is `authorId`.
    expect(introspectTable(posts).relations).toEqual([
      {
        fields: ["authorId"],
        table: "authors",
        columns: ["id"],
        onDelete: "cascade",
      },
    ]);
  });

  it("leaves non-key fields without a relation", () => {
    const meta = introspectTable(posts);
    expect(meta.fields.title?.relation).toBeUndefined();
    expect(introspectTable(authors).relations).toEqual([]);
  });

  it("records composite keys at table level only", () => {
    const meta = introspectTable(revisions);
    expect(meta.relations).toEqual([
      {
        fields: ["postId", "postSlug"],
        table: "posts",
        columns: ["id", "title"],
      },
    ]);
    expect(meta.fields.postId?.relation).toBeUndefined();
    expect(meta.fields.postSlug?.relation).toBeUndefined();
  });
});

describe("resolveLabelField", () => {
  it("prefers the first textual listDisplay field", () => {
    const { fields, primaryKey } = introspectTable(posts);
    expect(resolveLabelField(fields, ["id", "title", "authorId"], primaryKey)).toBe(
      "title",
    );
  });

  it("falls back to the first non-pk field, then to the pk", () => {
    const { fields, primaryKey } = introspectTable(posts);
    expect(resolveLabelField(fields, ["id", "authorId"], primaryKey)).toBe(
      "authorId",
    );
    expect(resolveLabelField(fields, ["id"], primaryKey)).toBe("id");
  });

  it("is overridable on the collection", () => {
    const collection = defineCollection({
      model: posts,
      listDisplay: ["title", "authorId"],
      labelField: "authorId",
    });
    expect(collection.labelField).toBe("authorId");
  });

  it("is resolved by defineCollection when not given", () => {
    expect(
      defineCollection({ model: posts, listDisplay: ["title"] }).labelField,
    ).toBe("title");
    expect(
      defineCollection({ model: authors, listDisplay: ["name"] }).labelField,
    ).toBe("name");
  });
});

describe("resolveRelations", () => {
  const authorCollection = defineCollection({
    model: authors,
    listDisplay: ["name"],
  });
  const postCollection = defineCollection({
    model: posts,
    listDisplay: ["title", "authorId"],
  });
  const commentCollection = defineCollection({
    model: comments,
    listDisplay: ["body", "postId"],
  });

  const graph = resolveRelations([
    postCollection,
    authorCollection,
    commentCollection,
  ]);

  it("resolves a key to the collection managing the target table", () => {
    expect(graph.outbound.posts).toEqual([
      {
        field: "authorId",
        collection: "authors",
        targetField: "id",
        labelField: "name",
      },
    ]);
  });

  it("derives the reverse direction a single table cannot see", () => {
    // The key's own onDelete comes with it: what happens to these rows when
    // the record they point at is deleted is a fact about the key.
    expect(graph.inbound.authors).toEqual([
      {
        collection: "posts",
        field: "authorId",
        targetField: "id",
        onDelete: "cascade",
      },
    ]);
    expect(graph.inbound.posts).toEqual([
      { collection: "comments", field: "postId", targetField: "id" },
    ]);
    expect(graph.inbound.comments).toEqual([]);
  });

  it("gives every registered collection an entry in both directions", () => {
    expect(Object.keys(graph.outbound).sort()).toEqual([
      "authors",
      "comments",
      "posts",
    ]);
    expect(graph.outbound.authors).toEqual([]);
  });

  it("drops keys whose target table no collection manages", () => {
    const tagCollection = defineCollection({
      model: tags,
      listDisplay: ["label", "ownerId"],
    });
    const partial = resolveRelations([tagCollection]);
    expect(partial.outbound.tags).toEqual([]);
  });

  it("follows the target's slug, not its table name", () => {
    const renamed = defineCollection({
      model: authors,
      slug: "people",
      listDisplay: ["name"],
    });
    const withRenamed = resolveRelations([postCollection, renamed]);
    expect(withRenamed.outbound.posts?.[0]?.collection).toBe("people");
    expect(withRenamed.inbound.people).toEqual([
      {
        collection: "posts",
        field: "authorId",
        targetField: "id",
        onDelete: "cascade",
      },
    ]);
  });

  it("skips composite keys until the query layer can address them", () => {
    const revisionCollection = defineCollection({
      model: revisions,
      listDisplay: ["body"],
    });
    const withComposite = resolveRelations([revisionCollection, postCollection]);
    expect(withComposite.outbound.revisions).toEqual([]);
  });
});
