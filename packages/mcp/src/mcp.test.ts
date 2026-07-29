import { bulkDeleteAction, defineCollection } from "@comp/core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { handleRpc, type McpContext } from "./dispatch.js";
import { fieldsToJsonSchema } from "./fields-to-schema.js";
import { buildToolRegistry, listTools } from "./tools.js";

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
});

const postCollection = defineCollection({
  model: posts,
  listDisplay: ["title", "status"],
});

const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  body: text("body").notNull(),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id),
});

const commentCollection = defineCollection({
  model: comments,
  listDisplay: ["body", "postId"],
});

const readOnly = defineCollection({
  model: posts,
  slug: "articles",
  listDisplay: ["title"],
  operations: ["list", "read"],
});

const actions = [bulkDeleteAction("posts")];

describe("fieldsToJsonSchema", () => {
  it("requires not-null defaultless non-pk fields on insert", () => {
    const schema = fieldsToJsonSchema(postCollection.fields);
    expect(schema.properties?.id).toBeUndefined();
    expect(schema.required).toEqual(["title"]);
    expect(schema.properties?.status).toEqual({
      type: "string",
      enum: ["draft", "published"],
    });
  });

  it("makes everything optional for update", () => {
    expect(fieldsToJsonSchema(postCollection.fields, { forUpdate: true }).required).toBeUndefined();
  });

  it("tells the caller what a foreign key points at", () => {
    const schema = fieldsToJsonSchema(commentCollection.fields);
    expect(schema.properties?.postId).toEqual({
      type: "number",
      description: "Foreign key → posts.id",
    });
    expect(schema.properties?.body?.description).toBeUndefined();
  });
});

describe("buildToolRegistry", () => {
  it("generates CRUD + action tools gated by the manifest", () => {
    const registry = buildToolRegistry([postCollection, readOnly], actions);
    const names = listTools(registry).map((t) => t.name);
    expect(names).toContain("posts__list");
    expect(names).toContain("posts__create");
    expect(names).toContain("posts__action__delete");
    // read-only collection exposes only list + get
    expect(names).toContain("articles__list");
    expect(names).toContain("articles__get");
    expect(names).not.toContain("articles__create");
    expect(names).not.toContain("articles__delete");
  });
});

describe("handleRpc", () => {
  const ctx: McpContext = {
    registry: buildToolRegistry([postCollection], actions),
    actions,
    db: {} as McpContext["db"],
  };

  it("answers initialize with protocol + tools capability", async () => {
    const res = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, ctx);
    expect(res?.result).toMatchObject({ capabilities: { tools: {} } });
  });

  it("lists tools", async () => {
    const res = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ctx);
    const tools = (res?.result as { tools: { name: string }[] }).tools;
    expect(tools.length).toBeGreaterThan(0);
  });

  it("returns null for the initialized notification", async () => {
    expect(
      await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx),
    ).toBeNull();
  });

  it("errors on unknown method and unknown tool", async () => {
    const m = await handleRpc({ jsonrpc: "2.0", id: 3, method: "nope" }, ctx);
    expect(m?.error?.code).toBe(-32601);
    const t = await handleRpc(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "ghost" } },
      ctx,
    );
    expect(t?.error?.code).toBe(-32602);
  });

  it("surfaces a validation error as an isError tool result (no db touch)", async () => {
    const res = await handleRpc(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "posts__create", arguments: {} },
      },
      ctx,
    );
    expect(res?.result).toMatchObject({ isError: true });
  });
});
