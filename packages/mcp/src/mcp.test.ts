import {
  bulkDeleteAction,
  defineCollection,
  type AuthAdapter,
} from "@comp/core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
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

describe("inline tool schemas", () => {
  const parent = defineCollection({
    model: posts,
    slug: "posts",
    listDisplay: ["title"],
    inlines: ["comments"],
  });
  const registry = buildToolRegistry([parent, commentCollection]);
  const create = registry.get("posts__create")?.tool.inputSchema;
  const inlines = create?.properties?.inlines;

  it("offers the child's write operations on the parent's write tool", () => {
    expect(Object.keys(inlines?.properties ?? {})).toEqual(["comments"]);
    expect(Object.keys(inlines?.properties?.comments?.properties ?? {})).toEqual([
      "create",
      "update",
      "delete",
    ]);
  });

  it("hides the parent key — it is filled in from the record", () => {
    const item = inlines?.properties?.comments?.properties?.create?.items;
    expect(item?.properties?.body).toBeDefined();
    expect(item?.properties?.postId).toBeUndefined();
  });

  it("leaves tools for a collection without inlines untouched", () => {
    const plain = buildToolRegistry([postCollection]).get("posts__create");
    expect(plain?.tool.inputSchema.properties?.inlines).toBeUndefined();
  });

  it("drops delete from the schema when the inline forbids it", () => {
    const guarded = defineCollection({
      model: posts,
      slug: "posts",
      listDisplay: ["title"],
      inlines: [{ collection: "comments", canDelete: false }],
    });
    const schema = buildToolRegistry([guarded, commentCollection]).get(
      "posts__update",
    )?.tool.inputSchema;
    const ops = schema?.properties?.inlines?.properties?.comments?.properties;
    expect(ops?.delete).toBeUndefined();
    expect(ops?.create).toBeDefined();
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

describe("the auth adapter over MCP", () => {
  const registry = buildToolRegistry([postCollection], actions);
  // Columns in declaration order — Drizzle maps a proxy driver's rows by
  // position. The stub ignores conditions, which is what lets a test show the
  // record rule refusing a row the SQL happened to return.
  const ROW: unknown[] = [2, "Draft", null, "draft"];
  const db = drizzle(async () => ({ rows: [ROW] })) as unknown as McpContext["db"];

  function contextFor(auth: AuthAdapter): McpContext {
    return { registry, actions, db, auth, identity: null };
  }

  async function call(ctx: McpContext, name: string, args = {}): Promise<unknown> {
    const res = await handleRpc(
      { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } },
      ctx,
    );
    return res?.result;
  }

  it("advertises only the tools this caller may run", async () => {
    // The same rule the site index follows: a tool that would answer
    // "Forbidden" is worse than one that is not listed.
    const ctx = contextFor({
      authenticate: () => null,
      authorize: ({ operation }) => operation === "list" || operation === "read",
    });
    const res = await handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx);
    const names = (res?.result as { tools: { name: string }[] }).tools.map(
      (tool) => tool.name,
    );
    expect(names).toContain("posts__list");
    expect(names).not.toContain("posts__create");
    expect(names).not.toContain("posts__action__delete");
  });

  it("refuses a tool called by name anyway", async () => {
    // Narrowing the list is presentation; this is the enforcement.
    const ctx = contextFor({
      authenticate: () => null,
      authorize: ({ operation }) => operation === "list",
    });
    expect(await call(ctx, "posts__delete", { id: 1 })).toMatchObject({
      isError: true,
    });
  });

  it("reports a row outside the scope as not found", async () => {
    const ctx = contextFor({
      authenticate: () => null,
      authorize: () => true,
      // The stub db ignores conditions, so the row still comes back — what is
      // asserted here is that the record rule, not the SQL, has the last word.
      scope: () => ({ status: "published" }),
      authorizeRecord: ({ record }) => record.status === "published",
    });
    const forbidden = (await call(ctx, "posts__get", { id: 2 })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(forbidden.isError).toBe(true);
    expect(forbidden.content[0]?.text).toContain("Forbidden");
  });
});
