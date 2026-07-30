import type { FieldMap, ResolvedForm } from "@comp/core";
import { describe, expect, it } from "vitest";
import {
  bindLayout,
  flatLayout,
  layoutFields,
  submittableFields,
} from "./form-layout.js";

function field(name: string, over: Partial<FieldMap[string]> = {}): FieldMap[string] {
  return {
    name,
    columnName: name,
    dataType: "string",
    columnType: "SQLiteText",
    notNull: false,
    hasDefault: false,
    primaryKey: false,
    ...over,
  };
}

const fields: FieldMap = {
  id: field("id", { dataType: "number", primaryKey: true }),
  title: field("title", { notNull: true }),
  slug: field("slug", { notNull: true }),
  status: field("status", { enumValues: ["draft", "published"] }),
  createdAt: field("createdAt", { dataType: "date" }),
};

const form: ResolvedForm = {
  fieldsets: [
    { title: "Content", description: "The post", collapsed: false, rows: [["title", "slug"]] },
    { title: "Publishing", description: null, collapsed: true, rows: [["status"], ["createdAt"]] },
  ],
  readonly: ["createdAt"],
  prepopulated: { slug: ["title"] },
  radio: ["status"],
};

describe("flatLayout", () => {
  it("falls back to one group of every editable field", () => {
    const groups = flatLayout(fields, "id");
    expect(groups).toHaveLength(1);
    expect(layoutFields(groups).map((f) => f.name)).toEqual([
      "title",
      "slug",
      "status",
      "createdAt",
    ]);
  });

  it("is empty when there is nothing to edit", () => {
    expect(flatLayout({ id: field("id", { primaryKey: true }) }, "id")).toEqual([]);
  });
});

describe("bindLayout", () => {
  const groups = bindLayout(form, fields);

  it("keeps the groups, their headings and their lines", () => {
    expect(groups.map((g) => [g.title, g.collapsed])).toEqual([
      ["Content", false],
      ["Publishing", true],
    ]);
    expect(groups[0]?.rows[0]?.fields.map((f) => f.field.name)).toEqual([
      "title",
      "slug",
    ]);
    expect(groups[1]?.rows).toHaveLength(2);
  });

  it("marks readonly and radio fields from the layout", () => {
    const flat = groups.flatMap((g) => g.rows.flatMap((r) => r.fields));
    expect(flat.find((f) => f.field.name === "createdAt")?.readonly).toBe(true);
    expect(flat.find((f) => f.field.name === "status")?.radio).toBe(true);
    expect(flat.find((f) => f.field.name === "title")?.readonly).toBe(false);
  });

  it("leaves readonly fields visible but unsubmitted", () => {
    expect(layoutFields(groups).map((f) => f.name)).toContain("createdAt");
    expect(submittableFields(groups).map((f) => f.name)).toEqual([
      "title",
      "slug",
      "status",
    ]);
  });

  it("drops a name the field map does not have", () => {
    const stale: ResolvedForm = {
      ...form,
      fieldsets: [{ title: null, description: null, collapsed: false, rows: [["gone"]] }],
    };
    expect(bindLayout(stale, fields)).toEqual([]);
  });
});
