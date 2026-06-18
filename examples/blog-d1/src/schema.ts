import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export { passkeyChallenges, passkeyCredentials } from "@comp/auth";

export const authors = sqliteTable("authors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  body: text("body"),
  status: text("status", { enum: ["draft", "published"] })
    .notNull()
    .default("draft"),
  authorId: integer("author_id").references(() => authors.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
