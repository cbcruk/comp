import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  deriveScaffoldDefaults,
  scaffoldFromTable,
} from "./scaffold-from-table.js";
import { introspectTable } from "@comp/core";

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body"),
  status: text("status", { enum: ["draft", "published"] }).notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull(),
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
    ]);
  });

  it("uses enum and boolean columns as filters", () => {
    expect(defaults.filters).toEqual(["status", "archived"]);
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
    expect(source).toContain(`filters: ["status", "archived"],`);
    expect(source).toContain(`search: ["title", "body"],`);
  });
});
