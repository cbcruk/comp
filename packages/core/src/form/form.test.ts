import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { defineCollection } from "../collection/define-collection.js";
import { introspectTable } from "../introspection/introspect-table.js";
import { validateInsert, validateUpdate } from "../validation/derive-schema.js";
import { formFields, writableFields } from "./form.types.js";
import { applyPrepopulation, prepopulatedValue, slugify } from "./prepopulate.js";
import { resolveForm, stripReadonly } from "./resolve-form.js";

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  body: text("body"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date(0)),
});

const fields = introspectTable(posts).fields;
const form = (config: Parameters<typeof resolveForm>[3]): ReturnType<typeof resolveForm> =>
  resolveForm("posts", fields, "id", config);

describe("resolveForm", () => {
  it("defaults to every editable column, in declaration order", () => {
    const resolved = form({});
    expect(resolved.fieldsets).toHaveLength(1);
    expect(resolved.fieldsets[0]?.title).toBeNull();
    // The primary key is never in the form: server-assigned, then immutable.
    expect(formFields(resolved)).toEqual([
      "title",
      "slug",
      "body",
      "status",
      "createdAt",
    ]);
  });

  it("narrows and reorders with `fields`", () => {
    expect(formFields(form({ fields: ["status", "title"] }))).toEqual([
      "status",
      "title",
    ]);
  });

  it("puts a nested group on one line", () => {
    expect(form({ fields: [["title", "slug"], "body"] }).fieldsets[0]?.rows).toEqual([
      ["title", "slug"],
      ["body"],
    ]);
  });

  it("removes excluded fields whatever selected them", () => {
    expect(formFields(form({ exclude: ["createdAt"] }))).not.toContain("createdAt");
    expect(
      formFields(form({ fields: ["title", "createdAt"], exclude: ["createdAt"] })),
    ).toEqual(["title"]);
  });

  it("groups with fieldsets, which win over `fields`", () => {
    const resolved = form({
      fields: ["body"],
      fieldsets: [
        { title: "Content", fields: [["title", "slug"], "body"] },
        { title: "Publishing", fields: ["status"], collapsed: true, description: "When" },
      ],
    });
    expect(resolved.fieldsets.map((f) => f.title)).toEqual(["Content", "Publishing"]);
    expect(resolved.fieldsets[1]).toEqual({
      title: "Publishing",
      description: "When",
      collapsed: true,
      rows: [["status"]],
    });
    expect(formFields(resolved)).toEqual(["title", "slug", "body", "status"]);
  });

  it("drops a group that exclude emptied", () => {
    const resolved = form({
      exclude: ["status"],
      fieldsets: [
        { title: "Content", fields: ["title"] },
        { title: "Publishing", fields: ["status"] },
      ],
    });
    expect(resolved.fieldsets.map((f) => f.title)).toEqual(["Content"]);
  });

  it("marks readonly fields without removing them from the layout", () => {
    const resolved = form({ readonlyFields: ["createdAt"] });
    expect(formFields(resolved)).toContain("createdAt");
    expect(resolved.readonly).toEqual(["createdAt"]);
    expect(writableFields(resolved)).not.toContain("createdAt");
  });

  it("ignores a readonly or radio field the layout does not show", () => {
    const resolved = form({
      fields: ["title"],
      readonlyFields: ["createdAt"],
      radioFields: ["status"],
    });
    expect(resolved.readonly).toEqual([]);
    expect(resolved.radio).toEqual([]);
  });

  it("refuses a readonly column that would make adding impossible", () => {
    // `slug` is NOT NULL with no default: dropped on write, it could never be
    // set, so every add would fail at the database.
    expect(() => form({ readonlyFields: ["slug"] })).toThrow(
      /required and has no default/,
    );
    // A column that defaults, or accepts null, is fine to show read-only.
    expect(() => form({ readonlyFields: ["createdAt"] })).not.toThrow();
    expect(() => form({ readonlyFields: ["status"] })).not.toThrow();
    expect(() => form({ readonlyFields: ["body"] })).not.toThrow();
  });

  it("throws on a name that is not a column, rather than losing an input", () => {
    expect(() => form({ fields: ["nope"] })).toThrow(/names "nope"/);
    expect(() => form({ exclude: ["nope"] })).toThrow(/exclude on "posts"/);
    expect(() => form({ fieldsets: [{ fields: ["nope"] }] })).toThrow(/fieldsets/);
    expect(() => form({ readonlyFields: ["nope"] })).toThrow(/readonlyFields/);
  });

  it("refuses a prepopulated target that could never take the value", () => {
    // `body` is nullable text, so it is legal to show read-only — which is
    // exactly why prepopulating it has to be refused on its own terms.
    expect(() =>
      form({ prepopulated: { body: ["title"] }, readonlyFields: ["body"] }),
    ).toThrow(/which is readonly/);
    expect(() => form({ prepopulated: { createdAt: ["title"] } })).toThrow(
      /not text/,
    );
    expect(() => form({ prepopulated: { slug: ["nope"] } })).toThrow(/prepopulated/);
  });

  it("is resolved onto the collection", () => {
    const collection = defineCollection({
      model: posts,
      listDisplay: ["title"],
      fieldsets: [{ title: "Content", fields: [["title", "slug"]] }],
      readonlyFields: ["createdAt"],
      prepopulated: { slug: ["title"] },
      radioFields: ["status"],
    });
    expect(collection.form.fieldsets[0]?.rows).toEqual([["title", "slug"]]);
    expect(collection.form.prepopulated).toEqual({ slug: ["title"] });
    // createdAt is not in this layout, so it is not readonly either.
    expect(collection.form.readonly).toEqual([]);
  });
});

describe("stripReadonly", () => {
  const readonlyForm = form({ readonlyFields: ["createdAt"] });

  it("drops values the form does not accept", () => {
    expect(
      stripReadonly(readonlyForm, { title: "T", createdAt: new Date(0) }),
    ).toEqual({ title: "T" });
  });

  it("returns the values untouched when nothing is readonly", () => {
    const values = { title: "T" };
    expect(stripReadonly(form({}), values)).toBe(values);
  });
});

describe("readonly on the write path", () => {
  const collection = defineCollection({
    model: posts,
    listDisplay: ["title"],
    readonlyFields: ["createdAt"],
  });

  it("ignores a readonly field a request names anyway", () => {
    // The UI hiding the input is presentation; this is the enforcement.
    expect(
      validateInsert(collection, {
        title: "T",
        slug: "t",
        createdAt: new Date(0),
      }),
    ).not.toHaveProperty("createdAt");
    expect(
      validateUpdate(collection, { createdAt: new Date(0), title: "T" }),
    ).toEqual({ title: "T" });
  });

  it("leaves writable fields alone", () => {
    expect(validateUpdate(collection, { status: "draft" })).toEqual({
      status: "draft",
    });
  });
});

describe("slugify", () => {
  it("reduces text to a slug", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("  Spaced   out  ")).toBe("spaced-out");
    expect(slugify("Ünïcodé Títle")).toBe("unicode-title");
    expect(slugify("already-a-slug")).toBe("already-a-slug");
  });

  it("gives an empty slug rather than a misleading one", () => {
    expect(slugify("")).toBe("");
    expect(slugify("!!!")).toBe("");
  });

  it("joins several sources in order", () => {
    expect(prepopulatedValue(["title", "status"], { title: "My Post", status: "draft" })).toBe(
      "my-post-draft",
    );
  });
});

describe("applyPrepopulation", () => {
  const prepopulating = form({ prepopulated: { slug: ["title"] } });
  const none = new Set<string>();

  it("fills the target in from its source while adding", () => {
    expect(
      applyPrepopulation(
        prepopulating,
        { title: "My First Post", slug: "" },
        "title",
        { adding: true, touched: none },
      ),
    ).toEqual({ title: "My First Post", slug: "my-first-post" });
  });

  it("never rewrites a stored record's slug", () => {
    const values = { title: "Renamed", slug: "original" };
    expect(
      applyPrepopulation(prepopulating, values, "title", {
        adding: false,
        touched: none,
      }),
    ).toBe(values);
  });

  it("stops once the target has been edited by hand", () => {
    const values = { title: "New Title", slug: "mine" };
    expect(
      applyPrepopulation(prepopulating, values, "title", {
        adding: true,
        touched: new Set(["slug"]),
      }),
    ).toBe(values);
  });

  it("ignores a change to a field nothing derives from", () => {
    const values = { title: "T", slug: "", body: "x" };
    expect(
      applyPrepopulation(prepopulating, values, "body", {
        adding: true,
        touched: none,
      }),
    ).toBe(values);
  });

  it("does nothing when the changed field is the target itself", () => {
    const values = { title: "T", slug: "typed" };
    expect(
      applyPrepopulation(prepopulating, values, "slug", {
        adding: true,
        touched: none,
      }),
    ).toBe(values);
  });
});
