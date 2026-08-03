import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../collection/define-collection.js";
import { changedFields, describeHistory, historyLabel } from "./changed-fields.js";
import { createMemoryHistoryStore } from "./history-store.js";
import { parseFields, serializeFields } from "./history-schema.js";
import type { HistoryEntry } from "./history.types.js";

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body"),
  createdAt: integer("created_at", { mode: "timestamp" }),
});

const postCollection = defineCollection({
  model: posts,
  listDisplay: ["title"],
});

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  collection: "posts",
  recordId: "1",
  action: "update",
  label: "A post",
  fields: ["title"],
  actor: "ada",
  at: new Date("2026-07-16T10:00:00Z"),
  ...over,
});

describe("changedFields", () => {
  it("reports only the fields whose value moved", () => {
    // A form sends the whole record back; "edited everything" is not history.
    expect(
      changedFields(
        { title: "Old", body: "same", id: 1 },
        { title: "New", body: "same", id: 1 },
      ),
    ).toEqual(["title"]);
  });

  it("compares dates by their instant, not their identity", () => {
    const at = "2026-07-16T10:00:00Z";
    expect(
      changedFields({ createdAt: new Date(at) }, { createdAt: new Date(at) }),
    ).toEqual([]);
    expect(
      changedFields({ createdAt: new Date(at) }, { createdAt: new Date(0) }),
    ).toEqual(["createdAt"]);
  });

  it("does not treat null and undefined as a change", () => {
    expect(changedFields({ body: null }, { body: undefined })).toEqual([]);
    expect(changedFields({ body: undefined }, { body: null })).toEqual([]);
    expect(changedFields({ body: null }, { body: "written" })).toEqual(["body"]);
  });

  it("ignores fields the write did not mention", () => {
    expect(changedFields({ title: "T", body: "B" }, { title: "T" })).toEqual([]);
  });
});

describe("historyLabel", () => {
  it("names the record from its label field", () => {
    expect(historyLabel(postCollection, { title: "Ada on engines" }, "1")).toBe(
      "Ada on engines",
    );
  });

  it("falls back to the record's key when there is nothing to show", () => {
    expect(historyLabel(postCollection, { title: "" }, "7")).toBe("Post 7");
    expect(historyLabel(postCollection, undefined, "7")).toBe("Post 7");
  });
});

describe("describeHistory", () => {
  it("says what happened", () => {
    expect(describeHistory(entry({ action: "create", fields: [] }))).toBe(
      "ada added A post",
    );
    expect(describeHistory(entry({ action: "delete", fields: [] }))).toBe(
      "ada deleted A post",
    );
    expect(describeHistory(entry({ fields: ["title", "body"] }))).toBe(
      "ada changed title, body on A post",
    );
  });

  it("is honest about a save that changed nothing", () => {
    expect(describeHistory(entry({ fields: [] }))).toBe(
      "ada saved A post without changing anything",
    );
  });

  it("does not pretend to know who, when nobody was authenticated", () => {
    expect(describeHistory(entry({ actor: null, action: "create", fields: [] }))).toBe(
      "someone added A post",
    );
  });
});

describe("the stored field list", () => {
  it("round-trips", () => {
    expect(parseFields(serializeFields(["title", "body"]))).toEqual([
      "title",
      "body",
    ]);
  });

  it("survives a value that is not a JSON array", () => {
    expect(parseFields(null)).toEqual([]);
    expect(parseFields("not json")).toEqual([]);
    expect(parseFields('{"nope":1}')).toEqual([]);
  });
});

describe("createMemoryHistoryStore", () => {
  it("returns entries newest first", async () => {
    const store = createMemoryHistoryStore();
    await store.record(entry({ recordId: "1", label: "First" }));
    await store.record(entry({ recordId: "2", label: "Second" }));
    expect((await store.list({})).map((e) => e.label)).toEqual([
      "Second",
      "First",
    ]);
  });

  it("narrows to one record", async () => {
    const store = createMemoryHistoryStore();
    await store.record(entry({ recordId: "1" }));
    await store.record(entry({ recordId: "2" }));
    expect(
      await store.list({ collection: "posts", recordId: "2" }),
    ).toHaveLength(1);
  });

  it("applies an allow-list, and an empty one shows nothing", async () => {
    const store = createMemoryHistoryStore();
    await store.record(entry({ collection: "posts" }));
    await store.record(entry({ collection: "authors" }));
    expect(await store.list({ collections: ["authors"] })).toHaveLength(1);
    // No permitted collections is not the same as no filter.
    expect(await store.list({ collections: [] })).toEqual([]);
  });

  it("bounds what it returns", async () => {
    const store = createMemoryHistoryStore();
    for (let i = 0; i < 10; i += 1) await store.record(entry({ recordId: String(i) }));
    expect(await store.list({ limit: 3 })).toHaveLength(3);
  });
});
