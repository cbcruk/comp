import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  deriveScaffoldDefaults,
  scaffoldFromTable,
} from "./scaffold-from-table.js";
import { introspectTable } from "@comp/core";

const authors = sqliteTable("authors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body"),
  status: text("status", { enum: ["draft", "published"] }).notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull(),
  authorId: integer("author_id").references(() => authors.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

describe("deriveScaffoldDefaults", () => {
  const defaults = deriveScaffoldDefaults(introspectTable(posts));

  it("lists the leading columns", () => {
    expect(defaults.listDisplay).toEqual([
      "id",
      "title",
      "body",
      "status",
      "archived",
      "authorId",
    ]);
  });

  it("offers every column whose type implies a filter", () => {
    // Enum, boolean, foreign key and date — but not the free-text columns,
    // whose filter would just repeat the search box, nor the primary key.
    expect(defaults.filters).toEqual([
      "status",
      "archived",
      "authorId",
      "createdAt",
    ]);
  });

  it("uses free-text string columns for search", () => {
    expect(defaults.search).toEqual(["title", "body"]);
  });
});

describe("scaffoldFromTable", () => {
  it("generates a collection from the introspected table", () => {
    const source = scaffoldFromTable(posts, {
      name: "Post",
      table: "posts",
      module: "./schema.js",
    });
    expect(source).toContain("export const postCollection = defineCollection({");
    expect(source).toContain(
      `filters: ["status", "archived", "authorId", "createdAt"],`,
    );
    expect(source).toContain(`search: ["title", "body"],`);
  });
});
