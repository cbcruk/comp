import type { FieldMap, FieldMeta } from "@comp/core";
import { describe, expect, it } from "vitest";
import {
  editableFields,
  fromInputValue,
  initialValues,
  inputTypeFor,
  toInputValue,
  toPayload,
} from "./collection-form.utils.js";

function field(partial: Partial<FieldMeta> & Pick<FieldMeta, "name" | "dataType">): FieldMeta {
  return {
    columnName: partial.name,
    columnType: "test",
    notNull: false,
    hasDefault: false,
    primaryKey: false,
    ...partial,
  };
}

const fields: FieldMap = {
  id: field({ name: "id", dataType: "number", primaryKey: true, notNull: true }),
  title: field({ name: "title", dataType: "string", notNull: true }),
  views: field({ name: "views", dataType: "number" }),
  published: field({ name: "published", dataType: "boolean" }),
  createdAt: field({ name: "createdAt", dataType: "date" }),
};

describe("inputTypeFor", () => {
  it("maps data types to input types", () => {
    expect(inputTypeFor(fields.title!)).toBe("text");
    expect(inputTypeFor(fields.views!)).toBe("number");
    expect(inputTypeFor(fields.published!)).toBe("checkbox");
    expect(inputTypeFor(fields.createdAt!)).toBe("datetime-local");
  });
});

describe("editableFields", () => {
  it("drops the auto-managed primary key", () => {
    const names = editableFields(fields, "id").map((f) => f.name);
    expect(names).toEqual(["title", "views", "published", "createdAt"]);
  });
});

describe("value coercion", () => {
  it("parses numbers and treats empty as null", () => {
    expect(fromInputValue(fields.views!, "42")).toBe(42);
    expect(fromInputValue(fields.views!, "")).toBeNull();
  });

  it("reads checkbox booleans", () => {
    expect(fromInputValue(fields.published!, "true")).toBe(true);
    expect(fromInputValue(fields.published!, "")).toBe(false);
  });

  it("round-trips dates through ISO", () => {
    const iso = fromInputValue(fields.createdAt!, "2026-01-02T03:04");
    expect(typeof iso).toBe("string");
    expect(toInputValue(fields.createdAt!, iso)).toBe("2026-01-02T03:04");
  });

  it("seeds inputs from a record and coerces back to a payload", () => {
    const editable = editableFields(fields, "id");
    const seeded = initialValues(editable, {
      title: "Hello",
      views: 7,
      published: true,
      createdAt: null,
    });
    expect(seeded.title).toBe("Hello");
    expect(seeded.views).toBe("7");
    expect(seeded.published).toBe("true");

    const payload = toPayload(editable, seeded);
    expect(payload).toMatchObject({ title: "Hello", views: 7, published: true });
  });
});
